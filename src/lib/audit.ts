/**
 * The audit writer (T-035) — stage 5 of the write pipeline (§A-5.1), over the
 * `activity_logs` table of §B-14.
 *
 * The contract, and the reason this function takes a transaction handle rather
 * than reaching for the global client: **the audit row commits with the
 * mutation or not at all.** §A-5.1 puts authorization and persistence in the
 * same transaction so that "a write that succeeds without an audit row is
 * impossible" — an audit written on its own connection would survive a rolled
 * back mutation (logging a change that never happened) or vanish with a
 * committed one (a change nobody can account for). Both are worse than no log,
 * because both are believed.
 *
 * `writeAudit` therefore accepts `Prisma.TransactionClient` and nothing else.
 * Passing the top-level `prisma` client type-checks — it satisfies the same
 * interface — and is the one mistake this module cannot detect for you, so the
 * callers built in T-038 are where the pipeline enforces it.
 *
 * The second decision worth reading: the actor is **snapshotted**, not
 * referenced (ADR-011, AUDIT S-6). `actor_user_id` is `ON DELETE SET NULL`, so
 * deleting an admin nulls the pointer and leaves `actor_username_snapshot` and
 * `actor_role_snapshot` intact. §B-15 records this as a deliberate 3NF
 * exception: an audit trail that vanishes when you delete the actor is not an
 * audit trail.
 *
 * Writer only. T-038 composes this into the six stages; nothing here authorizes,
 * validates or revalidates.
 */

import type { Prisma } from "@prisma/client";

/**
 * What happened. §B-14's own list, and a vocabulary distinct from the
 * `permission_actions` codes in `@/lib/modules`.
 *
 * The two are easy to conflate and must not be: `view`/`add`/`edit`/`delete`
 * are *permissions a user may hold*, while these are *events that occurred*.
 * `login` is not a permission anyone holds, and `add` is not something that
 * happens to a row — the row is created. Keeping the vocabularies separate is
 * what lets an audit reader ask "who logged in" without that being a query
 * about the permission matrix.
 */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "restore",
  "publish",
  "unpublish",
  "login",
  "login_failed",
  "logout",
  "password_change",
  "permission_change",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The actor, as the caller knows them.
 *
 * `username` and `roleCode` are optional because `SessionUser` (T-031) carries
 * neither — it holds an id, the role code and the permission sets. When they
 * are absent they are read from `users` **inside the same transaction**, which
 * is what makes the phrase "snapshot at write time" literally true: a session
 * issued before a rename would otherwise stamp every later row with the old
 * name.
 */
export type AuditActor = {
  id: bigint;
  username?: string;
  roleCode?: string;
};

/**
 * The system actor, for writes no human performed — the retention purge
 * (T-121), the backup job (T-120), a migration.
 *
 * `actor_username_snapshot` is `NOT NULL`, so an unattributed row needs a name
 * rather than a null. Using a sentinel with a null `actor_user_id` keeps
 * "nobody" distinguishable from "someone since deleted", which a shared null
 * would blur.
 */
export const SYSTEM_ACTOR = {
  id: null,
  username: "system",
  roleCode: "system",
} as const;

export type AuditActorInput = AuditActor | typeof SYSTEM_ACTOR;

/** One field's change, as stored in `change_diff` (`{field: {from, to}}`). */
export type FieldChange = {
  from: unknown;
  to: unknown;
};

export type ChangeDiff = Record<string, FieldChange>;

export type WriteAuditInput = {
  actor: AuditActorInput;
  action: AuditAction;
  /** `modules.code` — a foreign key, so a typo is a database error (AUDIT S-3). */
  module?: string | null;
  /** The physical table, e.g. `notices`. Free text: `activity_logs` outlives schemas. */
  entityTable?: string | null;
  entityId?: bigint | number | string | null;
  /** One human-readable line. What an admin reading the log actually sees. */
  summary: string;
  /** `{field: {from, to}}`, usually from `buildDiff`. */
  diff?: ChangeDiff | null;
  /** Request IP, for the anomaly alerts in T-122. */
  ip?: string | null;
};

/**
 * Fields whose values must never be written to the audit log, whatever a caller
 * passes.
 *
 * The row still records **that** they changed — dropping the field entirely
 * would hide a password rotation from the trail that exists to show it — but
 * the values are replaced with a marker. `activity_logs` is append-only and
 * retained for 24 months (§A-16.2), so a secret that lands here cannot be
 * edited out afterwards; it can only be prevented from arriving.
 */
export const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "newPassword",
  "currentPassword",
  "token",
  "tokenHash",
  "token_hash",
  "ipHash",
  "ip_hash",
  "personalPhone",
  "personal_phone",
  "personalEmail",
  "personal_email",
  "emergencyContact",
  "emergency_contact",
]);

/** What a redacted value is replaced with. Present, and obviously not the value. */
export const REDACTED = "[redacted]";

/**
 * Writes one `activity_logs` row inside the caller's transaction.
 *
 * Returns the row id, so a caller that needs to reference the audit entry (a
 * restore flow, say) can, without a second query.
 */
export async function writeAudit(
  tx: Prisma.TransactionClient,
  input: WriteAuditInput,
): Promise<bigint> {
  const summary = input.summary.trim();
  if (summary === "") {
    // A row whose summary is blank is a row nobody can read. §B-14 makes the
    // column NOT NULL; an empty string satisfies the constraint and defeats it.
    throw new Error("An audit row needs a summary");
  }

  const actor = await resolveActor(tx, input.actor);
  const diff = normalizeDiff(input.diff);

  const [row] = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO activity_logs (
      actor_user_id,
      actor_username_snapshot,
      actor_role_snapshot,
      action_code,
      module_code,
      entity_table,
      entity_id,
      summary,
      change_diff,
      ip_address
    )
    VALUES (
      ${actor.id},
      ${actor.username},
      ${actor.roleCode},
      ${input.action},
      ${input.module ?? null},
      ${input.entityTable ?? null},
      ${
        input.entityId === null || input.entityId === undefined
          ? null
          : BigInt(input.entityId)
      },
      ${summary},
      ${diff === null ? null : JSON.stringify(diff)}::jsonb,
      ${input.ip ?? null}::inet
    )
    RETURNING id`;

  if (row === undefined) {
    throw new Error("Audit insert returned no row");
  }

  return row.id;
}

/**
 * Fills in the actor's username and role from `users` when the caller did not
 * supply them, reading through the same transaction as the mutation.
 *
 * A deleted or unknown id still produces a row: the snapshot columns are
 * `NOT NULL` and the whole point of the table is that it records what happened
 * even when the actor no longer exists. Failing the write here would mean a
 * mutation could be rolled back by an audit lookup, which inverts the priority.
 */
async function resolveActor(
  tx: Prisma.TransactionClient,
  actor: AuditActorInput,
): Promise<{ id: bigint | null; username: string; roleCode: string }> {
  if (actor.id === null) {
    return { id: null, username: SYSTEM_ACTOR.username, roleCode: SYSTEM_ACTOR.roleCode };
  }

  if (actor.username !== undefined && actor.roleCode !== undefined) {
    return { id: actor.id, username: actor.username, roleCode: actor.roleCode };
  }

  const [row] = await tx.$queryRaw<{ username: string; role_code: string }[]>`
    SELECT username::text, role_code FROM users WHERE id = ${actor.id}`;

  return {
    id: actor.id,
    username: actor.username ?? row?.username ?? `user:${actor.id}`,
    roleCode: actor.roleCode ?? row?.role_code ?? "unknown",
  };
}

/**
 * Builds `{field: {from, to}}` for the fields that actually changed.
 *
 * Only differences are kept. A diff listing every column of an unchanged row
 * makes the log unreadable and hides the one field that did move, which is the
 * question an audit trail exists to answer.
 *
 * Keys are taken from both sides, so a field present only in `after` (newly
 * set) or only in `before` (cleared) still appears, with `undefined` normalized
 * to `null`.
 */
export function buildDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ChangeDiff {
  const diff: ChangeDiff = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);

  for (const key of keys) {
    const from = toJsonValue((before ?? {})[key]);
    const to = toJsonValue((after ?? {})[key]);

    if (isSameValue(from, to)) continue;

    // Redaction happens *after* the comparison, never before. Redacting first
    // makes two different secrets compare equal, and the change — which is the
    // one thing the audit row must record — disappears entirely.
    diff[key] = REDACTED_FIELDS.has(key)
      ? { from: REDACTED, to: REDACTED }
      : { from: redactValue(from), to: redactValue(to) };
  }

  return diff;
}

/** Applies redaction and JSON-safety to a diff a caller assembled by hand. */
function normalizeDiff(diff: ChangeDiff | null | undefined): ChangeDiff | null {
  if (diff === null || diff === undefined) return null;

  const entries = Object.entries(diff);
  if (entries.length === 0) return null;

  return Object.fromEntries(
    entries.map(([key, change]) =>
      REDACTED_FIELDS.has(key)
        ? [key, { from: REDACTED, to: REDACTED }]
        : [
            key,
            {
              from: redactValue(toJsonValue(change.from)),
              to: redactValue(toJsonValue(change.to)),
            },
          ],
    ),
  );
}

/**
 * Replaces the value of any redacted field nested inside an object, leaving the
 * structure and every other field intact.
 *
 * Separate from `toJsonValue` so that normalization (which the comparison
 * depends on) and redaction (which must not affect it) are two distinct steps.
 */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);

  if (value !== null && typeof value === "object") {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        REDACTED_FIELDS.has(key) ? REDACTED : redactValue(inner),
      ]),
    );
  }

  return value;
}

/**
 * Reduces a database value to something `JSON.stringify` can carry.
 *
 * `bigint` is the one that bites: every id in this schema is `BIGINT`, Prisma
 * hands them back as `bigint`, and `JSON.stringify` throws on them outright —
 * so an un-normalized diff of any row with an id would fail the whole
 * transaction, taking the mutation with it. Ids become strings rather than
 * numbers because past 2^53 a number is a different id.
 *
 * `Date` becomes an ISO string, and Prisma's `Decimal` (and anything else with
 * a `toJSON`) is left to serialize itself.
 */
function toJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonValue);

  if (value !== null && typeof value === "object") {
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        toJsonValue(inner),
      ]),
    );
  }

  return value;
}

/**
 * Whether two normalized values are the same change-wise.
 *
 * Compared by their JSON form so that two equal dates, or two structurally
 * identical translation objects, do not register as a change. Reference
 * equality would report every nested object as modified on every save.
 */
function isSameValue(from: unknown, to: unknown): boolean {
  if (from === to) return true;
  if (from === null || to === null) return false;
  if (typeof from !== "object" && typeof to !== "object") return false;

  return JSON.stringify(from) === JSON.stringify(to);
}

/**
 * The summary line for a create/update/delete, in the shape the admin activity
 * list (T-052) renders.
 *
 * Kept here rather than at each call site so the log reads consistently — an
 * audit trail written eleven different ways is one nobody scans.
 */
export function describeChange(
  action: AuditAction,
  entityLabel: string,
  entityName?: string | null,
): string {
  const verb: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    restore: "Restored",
    publish: "Published",
    unpublish: "Unpublished",
    permission_change: "Changed permissions for",
    password_change: "Changed the password for",
    login: "Signed in",
    login_failed: "Failed sign-in",
    logout: "Signed out",
  };

  const head = `${verb[action] ?? action} ${entityLabel}`.trim();
  return entityName === null || entityName === undefined || entityName === ""
    ? head
    : `${head} — ${entityName}`;
}
