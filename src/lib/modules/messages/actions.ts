"use server";

/**
 * Contact inbox Server Actions (T-068) — ARCHITECTURE.md §A-16.1, §B-13.
 *
 * §A-5.2 gives the `contact` module exactly two applicable actions — `view` and
 * `delete` — and this card's Contract restates it as "read-only plus delete".
 * That is a tighter constraint than it first looks, and it shapes every
 * decision in this file.
 *
 * **The read stamp rides on `contact:view`, and therefore not on the write
 * pipeline.** `mutate()` refuses `view` outright ("mutate() is for writes"), and
 * rightly: opening a message is not a mutation an admin *chooses*, it is the
 * receipt that they opened it. So `markMessageRead` below authenticates and
 * authorizes for itself, against the same `assertCan` every other path uses, and
 * writes the two columns §B-13 exists to hold. Doing it through the pipeline
 * would need an action code that does not exist, and inventing one would mean a
 * `module_actions` row and a schema change — outside this card, and the wrong
 * shape anyway.
 *
 * It writes **no `activity_logs` row**. `read_at` and `read_by_user_id` *are*
 * the access record for this table, they are what §B-13 put there, and an audit
 * entry per message opened would bury the log that records decisions under one
 * that records glances. It also stamps only the **first** reader: the columns
 * are singular, and "who first saw this" survives being overwritten by whoever
 * looked most recently.
 *
 * **Status changes ride on `contact:delete`.** Archiving a message, marking it
 * spam and removing it are the same authority — disposal — and `delete` is the
 * only discretionary write the module has. The alternative, binding them to
 * `view`, would mean an admin granted read-only access could change rows, which
 * is exactly what the Contract denies. An admin with `contact:view` alone reads
 * the inbox and nothing else.
 *
 * **Deletion is soft and reversible**, per this card's Verify: `deleted_at` and
 * `deleted_by_user_id` are set and cleared, the row is never removed, and the
 * §A-16.1 purge at 12 months (T-121) is what eventually takes it.
 */

import { assertCan, ForbiddenError, loadPermissions } from "@/lib/permissions";
import { runAction, type ActionResult } from "@/lib/modules/messages/result";
import {
  buildDiff,
  defineMutation,
  MutationDeniedError,
  UnauthenticatedError,
  ValidationFailedError,
} from "@/lib/mutate";
import {
  contactMessageDeleteSchema,
  contactMessageStatusSchema,
} from "@/lib/validation/contact";

// ─────────────────────────────────────────────────────────────────────────────
// Reading — `contact:view`, outside the write pipeline. See the module header.
// ─────────────────────────────────────────────────────────────────────────────

/** What the stamp did, so a caller can tell "already read" from "just read". */
export type ReadStamp = { alreadyRead: boolean };

export async function markMessageReadAction(
  input: unknown,
): Promise<ActionResult<ReadStamp>> {
  return runAction(() => markMessageRead(input));
}

async function markMessageRead(rawInput: unknown): Promise<ReadStamp> {
  const parsed = contactMessageDeleteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationFailedError(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  const user = await currentUser();

  try {
    assertCan(user, "contact", "view");
  } catch (cause) {
    if (cause instanceof ForbiddenError) throw new MutationDeniedError(cause.attempted);
    throw cause;
  }

  const { prisma } = await import("@/lib/prisma");

  // One statement, guarded by `read_at IS NULL`: the first reader wins, and two
  // admins opening the same message at once cannot both claim it. `new → read`
  // moves with the stamp, so the status reflects the receipt rather than
  // needing a second, separately-permitted write to agree with it.
  const affected = await prisma.$executeRaw`
    UPDATE contact_messages
       SET read_at         = now(),
           read_by_user_id = ${user.id},
           status_code     = CASE WHEN status_code = 'new' THEN 'read' ELSE status_code END
     WHERE id      = ${parsed.data.id}
       AND read_at IS NULL`;

  return { alreadyRead: affected === 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposal — `contact:delete`
// ─────────────────────────────────────────────────────────────────────────────

const setStatus = defineMutation({
  module: "contact",
  action: "delete",
  schema: contactMessageStatusSchema,
  entityTable: "contact_messages",
  entityLabel: "message",
  handler: async ({ tx, input }) => {
    const before = await tx.contactMessage.findUnique({ where: { id: input.id } });
    if (before === null) throw notFound(input.id);

    const row = await tx.contactMessage.update({
      where: { id: input.id },
      data: { statusCode: input.statusCode },
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.name,
      // `delete` is the permission; `update` is the event. §B-14 keeps the two
      // vocabularies apart on purpose, and nothing was deleted here.
      auditAction: "update" as const,
      diff: buildDiff({ statusCode: before.statusCode }, { statusCode: row.statusCode }),
    };
  },
});

export async function setMessageStatusAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => setStatus(input));
}

const removeMessage = defineMutation({
  module: "contact",
  action: "delete",
  schema: contactMessageDeleteSchema,
  entityTable: "contact_messages",
  entityLabel: "message",
  handler: async ({ tx, input, user }) => {
    const before = await tx.contactMessage.findUnique({ where: { id: input.id } });
    if (before === null) throw notFound(input.id);
    if (before.deletedAt !== null) throw refusal("id", ALREADY_DELETED);

    const row = await tx.contactMessage.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });

    return { data: null, entityId: row.id, entityName: row.name };
  },
});

export async function deleteMessageAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeMessage(input));
}

/**
 * The other half of "soft and reversible".
 *
 * Bound to the same `contact:delete`: whoever may put a message in the trash may
 * take it back out, and a restore that needed a permission the delete did not
 * would make the delete effectively permanent for most of the people who can
 * perform it.
 */
const restoreMessage = defineMutation({
  module: "contact",
  action: "delete",
  schema: contactMessageDeleteSchema,
  entityTable: "contact_messages",
  entityLabel: "message",
  handler: async ({ tx, input }) => {
    const before = await tx.contactMessage.findUnique({ where: { id: input.id } });
    if (before === null) throw notFound(input.id);
    if (before.deletedAt === null) throw refusal("id", NOT_DELETED);

    const row = await tx.contactMessage.update({
      where: { id: input.id },
      data: { deletedAt: null, deletedByUserId: null },
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: row.name,
      auditAction: "restore" as const,
    };
  },
});

export async function restoreMessageAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => restoreMessage(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALREADY_DELETED = "That message is already in the trash";
const NOT_DELETED = "That message is not in the trash";

/**
 * The signed-in admin, resolved the way stage 1 of the pipeline resolves it.
 *
 * Needed here only because the read stamp cannot go through `mutate()` (see the
 * module header). It is the same three reads in the same order — session cookie,
 * `verifySession`, the `users` row with `is_active` re-read fresh — so a
 * suspended account is refused here exactly as it is everywhere else.
 */
async function currentUser() {
  const { readSessionCookie } = await import("@/lib/cookies");
  const { verifySession } = await import("@/lib/session");
  const { prisma } = await import("@/lib/prisma");

  const token = await readSessionCookie();
  if (token === null) throw new UnauthenticatedError("No session cookie");

  const session = await verifySession(token);
  if (session === null) throw new UnauthenticatedError("The session is not valid");

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

function refusal(field: string, message: string): ValidationFailedError {
  return new ValidationFailedError([{ field, message }]);
}

function notFound(id: bigint): ValidationFailedError {
  return refusal("id", `No message with id ${String(id)}`);
}
