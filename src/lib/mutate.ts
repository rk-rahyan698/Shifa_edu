/**
 * The write pipeline (T-038), ARCHITECTURE.md §A-5.1 made executable.
 *
 * §A-5.1 fixes six stages and their order:
 *
 * ```
 * 1. AUTHENTICATE   valid, non-revoked session      → else 401
 * 2. AUTHORIZE      permissions (+ special grants)  → else 403
 * 3. VALIDATE       Zod schema, unknown keys refused → else 422
 * 4. SANITIZE       rich text through the allowlist
 * 5. PERSIST        one transaction: mutate + audit
 * 6. INVALIDATE     revalidate the affected public paths, both locales
 * ```
 *
 * Writing them once, here, is the whole point. The rule "every mutation passes
 * through these six stages" is only provable if there is a single place the
 * stages live: eleven Server Actions each doing their own version is eleven
 * chances to forget the audit row, and the forgetting is invisible — the
 * feature still works. T-110 asserts the boundary from the outside; this file
 * is what makes passing it the path of least resistance.
 *
 * The ordering is load-bearing in both directions. Authorization precedes
 * validation so an unauthorized caller learns nothing about the schema — a 422
 * listing field names is a map of the admin surface handed to someone who may
 * not open it. Validation precedes sanitization because sanitizing an
 * unvalidated blob means running the allowlist over whatever arrived. And
 * invalidation follows the commit, never joins it: revalidating a transaction
 * that then rolls back publishes a change that never happened.
 *
 * §A-5.1's other clause — "stages 2 and 5 are in the same transaction" — is why
 * authorization is checked **twice**: once up front, to fail fast without
 * opening a transaction, and once inside it, against the same snapshot the
 * write commits under. Without the second check, a permission revoked while a
 * request is in flight still lands its write, and the audit row records an
 * actor who by then was not allowed.
 */

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  buildDiff,
  describeChange,
  writeAudit,
  type AuditAction,
  type ChangeDiff,
} from "@/lib/audit";
import type { ActionCode, ModuleCode, SpecialGrantCode } from "@/lib/modules";
import {
  assertCan,
  assertSpecialGrant,
  ForbiddenError,
  loadPermissions,
  SUPER_ADMIN_ROLE,
  type SessionUser,
} from "@/lib/permissions";
import { isCleanHtml } from "@/lib/sanitize";

/** The six stages, in §A-5.1's order. Exported so tests can assert the sequence. */
export const PIPELINE_STAGES = [
  "authenticate",
  "authorize",
  "validate",
  "sanitize",
  "persist",
  "invalidate",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * A refusal, tagged with the stage that produced it.
 *
 * The stage is not decoration: it is how a caller — and T-110 — tells "you may
 * not do this" (403, nothing happened) from "the database rejected it" (500,
 * possibly halfway). Route handlers map `status` straight onto the response.
 */
export class PipelineError extends Error {
  override readonly name: string = "PipelineError";
  readonly stage: PipelineStage;
  readonly status: number;

  constructor(stage: PipelineStage, status: number, message: string) {
    super(message);
    this.stage = stage;
    this.status = status;
  }
}

/** Stage 1 — no session, an expired one, or one revoked since it was issued. */
export class UnauthenticatedError extends PipelineError {
  override readonly name = "UnauthenticatedError";

  constructor(message = "No valid session") {
    super("authenticate", 401, message);
  }
}

/**
 * Stage 2 — authenticated, but not permitted.
 *
 * `attempted` carries the `module:action` that was refused, for the audit
 * trail. It is deliberately not put in `message`: what the caller is told and
 * what the log records are different audiences.
 */
export class MutationDeniedError extends PipelineError {
  override readonly name = "MutationDeniedError";
  readonly attempted: string;

  constructor(attempted: string) {
    super("authorize", 403, "Not permitted");
    this.attempted = attempted;
  }
}

/** One rejected field, in the shape a form renders beside its input. */
export type FieldIssue = {
  field: string;
  message: string;
};

/** Stage 3 — the input did not satisfy the schema. */
export class ValidationFailedError extends PipelineError {
  override readonly name = "ValidationFailedError";
  readonly issues: readonly FieldIssue[];

  constructor(issues: readonly FieldIssue[]) {
    super("validate", 422, "The submitted values were not accepted");
    this.issues = issues;
  }
}

/**
 * Stage 4 — a rich-text field reached the pipeline carrying markup the
 * allowlist refuses.
 *
 * This is a 500 rather than a 422 because it is not the admin's mistake: the
 * T-034 primitives sanitize during parse, so an unsanitized `*_html` value
 * means the schema declared that field as plain text or a bare `z.string()`.
 * Answering 422 would blame the person typing for a defect in the schema.
 */
export class SanitizationError extends PipelineError {
  override readonly name = "SanitizationError";
  readonly field: string;

  constructor(field: string) {
    super(
      "sanitize",
      500,
      `${field} reached the write pipeline unsanitized — declare it with richText()`,
    );
    this.field = field;
  }
}

/**
 * Stage 6 — the write committed but the caches did not clear.
 *
 * `writeCommitted` exists so a caller never retries this: the mutation
 * happened, and repeating it would write twice. Stale public pages are the
 * lesser failure and the one an operator can fix.
 */
export class InvalidationError extends PipelineError {
  override readonly name = "InvalidationError";
  readonly writeCommitted = true as const;

  constructor(cause: unknown) {
    super(
      "invalidate",
      500,
      `The write committed but revalidation failed: ${String(cause)}`,
    );
  }
}

/** What a handler reports back, beyond its own return value. */
export type MutationOutcome<TResult> = {
  /** Returned to the caller of `mutate`. */
  data: TResult;
  /** `activity_logs.entity_id`, and the entity cache tag invalidated in stage 6. */
  entityId?: bigint | number | string | null;
  /** The row's human name, appended to the default summary. */
  entityName?: string | null;
  /** Overrides the default summary entirely. */
  summary?: string;
  /** `{field: {from, to}}` — usually `buildDiff(before, after)`. */
  diff?: ChangeDiff | null;
  /**
   * Overrides the audit verb. `edit` covers `update`, `restore` and
   * `unpublish`, which are the same permission but different events.
   */
  auditAction?: AuditAction;
};

/** The transaction handle, the validated input, and who is writing. */
export type MutationContext<TInput> = {
  /**
   * The transaction every write must go through. Reaching for the global
   * `prisma` client here would put the mutation and its audit row on separate
   * connections, which is the one thing §A-5.1 stage 5 forbids.
   */
  tx: Prisma.TransactionClient;
  input: TInput;
  user: SessionUser;
};

export type MutationHandler<TInput, TResult> = (
  context: MutationContext<TInput>,
) => Promise<MutationOutcome<TResult>>;

export type MutateOptions<TSchema extends z.ZodTypeAny, TResult> = {
  module: ModuleCode;
  action: ActionCode;
  /** A T-034 schema. `.strict()`, so an unknown key is a 422 naming the key. */
  schema: TSchema;
  /** A protected capability required *in addition* to the module permission (§A-9.4). */
  specialGrant?: SpecialGrantCode;
  /** `activity_logs.entity_table` — the physical table, e.g. `notices`. */
  entityTable?: string;
  /** How the entity is named in the summary line. Defaults to the module code. */
  entityLabel?: string;
  handler: MutationHandler<z.output<TSchema>, TResult>;
};

/** `permission_actions` → `activity_logs.action_code`. Overridable per outcome. */
const DEFAULT_AUDIT_ACTION: Record<string, AuditAction> = {
  add: "create",
  edit: "update",
  delete: "delete",
  publish: "publish",
};

/**
 * Runs one mutation through all six stages.
 *
 * Returns whatever the handler put in `data`. Every failure is a
 * `PipelineError` carrying the stage that refused it, so nothing downstream has
 * to guess whether a write happened.
 */
export async function mutate<TSchema extends z.ZodTypeAny, TResult>(
  options: MutateOptions<TSchema, TResult>,
  rawInput: unknown,
): Promise<TResult> {
  if (options.action === "view") {
    // Not a runtime condition — a call that got here is a miswired module.
    throw new Error("mutate() is for writes; `view` is not a mutation");
  }

  // ── 1. AUTHENTICATE ────────────────────────────────────────────────────
  const user = await authenticate();

  // ── 2. AUTHORIZE ───────────────────────────────────────────────────────
  authorize(user, options);

  // ── 3. VALIDATE ────────────────────────────────────────────────────────
  const input = validate(options.schema, rawInput);

  // ── 4. SANITIZE ────────────────────────────────────────────────────────
  assertSanitized(input);

  // ── 5. PERSIST (+ audit, one transaction) ──────────────────────────────
  const outcome = await persist(user, options, input);

  // ── 6. INVALIDATE ──────────────────────────────────────────────────────
  await invalidate(options.module, outcome.entityId ?? null);

  return outcome.data;
}

/**
 * `mutate` pre-bound to its options — the form a Server Action exports.
 *
 * ```ts
 * export const publishNotice = defineMutation({ module: "notice", … });
 * ```
 *
 * A named export that *is* the pipeline is harder to bypass than one that
 * merely calls it, which is the ergonomic half of this card's Contract.
 */
export function defineMutation<TSchema extends z.ZodTypeAny, TResult>(
  options: MutateOptions<TSchema, TResult>,
): (rawInput: unknown) => Promise<TResult> {
  return (rawInput: unknown) => mutate(options, rawInput);
}

/**
 * Stage 1. The session cookie, verified against `sessions`, then the user row.
 *
 * `verifySession` (T-032) is the only authority on whether a token is live; it
 * returns `null` for unknown, revoked, expired and idle-timed-out alike, and
 * this function preserves that indistinguishability by mapping all of them to
 * the same 401.
 *
 * `is_active` is re-read here rather than trusted from the session, because a
 * suspension does not revoke sessions — §A-9.3 makes suspension outrank every
 * other check, and it can only do that if the flag is read fresh.
 */
async function authenticate(): Promise<SessionUser> {
  const { readSessionCookie } = await import("@/lib/cookies");
  const { verifySession } = await import("@/lib/session");

  const token = await readSessionCookie();
  if (token === null) throw new UnauthenticatedError("No session cookie");

  const session = await verifySession(token);
  if (session === null) throw new UnauthenticatedError("The session is not valid");

  const { prisma } = await import("@/lib/prisma");
  const account = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, roleCode: true, isActive: true },
  });

  if (account === null) throw new UnauthenticatedError("The account no longer exists");

  const { permissions, specialGrants } = await loadPermissions(account.id);

  return {
    id: account.id,
    roleCode: account.roleCode,
    isActive: account.isActive,
    permissions,
    specialGrants,
  };
}

/**
 * Stage 2. The module permission, and the special grant when one is named.
 *
 * Routed through `assertCan`/`assertSpecialGrant` rather than reimplemented:
 * §A-9.3 has exactly one authorization function, and a second copy of the
 * super-admin bypass or the suspension check is a second copy that can drift.
 */
function authorize<TSchema extends z.ZodTypeAny, TResult>(
  user: SessionUser,
  options: MutateOptions<TSchema, TResult>,
): void {
  try {
    assertCan(user, options.module, options.action);
    if (options.specialGrant !== undefined) {
      assertSpecialGrant(user, options.specialGrant);
    }
  } catch (cause) {
    if (cause instanceof ForbiddenError) throw new MutationDeniedError(cause.attempted);
    throw cause;
  }
}

/**
 * Stage 3. The T-034 schema, with every issue reported rather than the first.
 *
 * A form that surfaces one error per round trip trains people to submit
 * repeatedly; the schemas are `.strict()`, so this also names the unknown key
 * instead of silently dropping it.
 */
function validate<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  rawInput: unknown,
): z.output<TSchema> {
  const parsed = schema.safeParse(rawInput);

  if (!parsed.success) {
    throw new ValidationFailedError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return parsed.data as z.output<TSchema>;
}

/**
 * Stage 4. Proof that the allowlist ran, rather than a second pass of it.
 *
 * The T-034 primitives sanitize inside `parse`, and `sanitizeHtml` is
 * idempotent — so for a correctly declared schema every `*_html` value is
 * already clean and this walk is a no-op. It fires only when a rich-text field
 * was declared as something that does not sanitize, which is precisely the
 * mistake the `plainText`/`richText` split exists to make visible.
 *
 * Re-sanitizing here instead would repair that silently, and a defect that
 * repairs itself in production is one nobody ever fixes.
 */
function assertSanitized(value: unknown, path: readonly string[] = []): void {
  if (typeof value === "string") {
    const field = path.join(".");
    // Only `*_html` columns carry markup; everything else is React-escaped at
    // render, where a literal `<` in a school's name must survive untouched.
    if (/html$/i.test(path[path.length - 1] ?? "") && !isCleanHtml(value)) {
      throw new SanitizationError(field);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSanitized(entry, [...path, String(index)]));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertSanitized(entry, [...path, key]);
    }
  }
}

/**
 * Stage 5. The handler and its audit row, in one transaction — with
 * authorization re-asserted inside it.
 *
 * Nothing is returned to the caller until Postgres has committed both. If the
 * handler throws, the audit row goes with it; if `writeAudit` throws — a bad
 * `module_code`, a blank summary — the mutation goes with *it*. That symmetry
 * is what makes "a write that succeeds without an audit row is impossible"
 * a property rather than a convention.
 */
async function persist<TSchema extends z.ZodTypeAny, TResult>(
  user: SessionUser,
  options: MutateOptions<TSchema, TResult>,
  input: z.output<TSchema>,
): Promise<MutationOutcome<TResult>> {
  const { prisma } = await import("@/lib/prisma");

  return prisma.$transaction(async (tx) => {
    await assertStillAuthorized(tx, user, options);

    const outcome = await options.handler({ tx, input, user });

    const auditAction =
      outcome.auditAction ?? DEFAULT_AUDIT_ACTION[options.action] ?? "update";

    await writeAudit(tx, {
      actor: { id: user.id },
      action: auditAction,
      module: options.module,
      entityTable: options.entityTable ?? null,
      entityId: outcome.entityId ?? null,
      summary:
        outcome.summary ??
        describeChange(
          auditAction,
          options.entityLabel ?? options.module,
          outcome.entityName,
        ),
      diff: outcome.diff ?? null,
      ip: await requestIp(),
    });

    return outcome;
  });
}

/**
 * §A-5.1's "stages 2 and 5 are in the same transaction", literally.
 *
 * The up-front check in stage 2 reads through the global client and is
 * memoized per request; this one reads through `tx`, so the permission rows and
 * the write are the same snapshot and serialize against a concurrent
 * `permission_change`. Between the two checks a super admin may have suspended
 * this account or revoked this grant — without this, that revocation loses the
 * race and the write lands anyway.
 */
async function assertStillAuthorized<TSchema extends z.ZodTypeAny, TResult>(
  tx: Prisma.TransactionClient,
  user: SessionUser,
  options: MutateOptions<TSchema, TResult>,
): Promise<void> {
  const [row] = await tx.$queryRaw<
    {
      is_active: boolean;
      role_code: string;
      has_permission: boolean;
      has_grant: boolean;
    }[]
  >`
    SELECT u.is_active,
           u.role_code,
           EXISTS (
             SELECT 1 FROM user_module_permissions p
              WHERE p.user_id = u.id
                AND p.module_code = ${options.module}
                AND p.action_code = ${options.action}
           ) AS has_permission,
           EXISTS (
             SELECT 1 FROM user_special_grants g
              WHERE g.user_id = u.id
                AND g.grant_code = ${options.specialGrant ?? null}
           ) AS has_grant
      FROM users u
     WHERE u.id = ${user.id}`;

  const attempted = `${options.module}:${options.action}`;

  if (row === undefined || !row.is_active) throw new MutationDeniedError(attempted);

  // Same order as `can()`: suspension outranks the bypass, checked above.
  if (row.role_code === SUPER_ADMIN_ROLE) return;

  if (!row.has_permission) throw new MutationDeniedError(attempted);

  if (options.specialGrant !== undefined && !row.has_grant) {
    throw new MutationDeniedError(`grant:${options.specialGrant}`);
  }
}

/**
 * Stage 6. Both locales, via the T-036 registry.
 *
 * Outside the transaction by construction — `revalidateForModule` documents the
 * same rule from its side. The failure is wrapped rather than swallowed: a
 * silent one leaves the public site serving a page the admin has been told was
 * updated, and that is exactly the class of bug §A-6 exists to prevent.
 */
async function invalidate(
  moduleCode: ModuleCode,
  entityId: bigint | number | string | null,
): Promise<void> {
  const { revalidateForModule } = await import("@/lib/cache");

  try {
    await revalidateForModule(moduleCode, entityId);
  } catch (cause) {
    throw new InvalidationError(cause);
  }
}

/**
 * The request IP for the audit row, or `null` outside a request context.
 *
 * `next/headers` throws when there is no request — a seed script, a cron job,
 * a test — and an audit row with no IP is strictly better than a mutation that
 * fails because it could not find one.
 */
async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const forwarded = headerList.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first !== undefined && first !== "") return first;
    return headerList.get("x-real-ip");
  } catch {
    return null;
  }
}

/** Re-exported so a handler can build its diff without a second import. */
export { buildDiff };
