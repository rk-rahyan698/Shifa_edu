/**
 * The self-service password rotation (T-070), as one function.
 *
 * Extracted from `page.tsx` rather than written inline for the reason B-1
 * recorded and every card since has inherited: `tsconfig` sets `jsx: preserve`
 * for Next, so Vitest's transformer refuses every `.tsx` file and nothing
 * inside one can be asserted. This card's Verify — "password change keeps the
 * current session and revokes the others" — is exactly the kind of claim that
 * has to be proved against a real `sessions` table rather than read off a
 * diff, so the rule lives here in a `.ts` module and the page calls it.
 *
 * **What makes this different from T-043.** The forced first rotation revokes
 * *every* session, this one included, because the password being retired was
 * generated at seed time and may have been read by whoever ran the seed. Here
 * the person typing is the account's owner, working in a tab; §A-9.2's reason
 * for revoking on a password change is that a copied cookie must not outlive
 * the response to the copy, and the session making the request is the one
 * session that is not suspect. So it is kept, by `uid`, and every other live
 * session is closed with `revoked_reason = 'password_change'`.
 *
 * The revocation runs on the transaction handle rather than through
 * `revokeAllForUser`: that helper revokes all of them and holds the global
 * client, which would be a second connection able to commit a revocation for a
 * password change that then rolled back. §A-5.1's "the write and its audit row
 * commit together" is the same argument, applied to a third statement.
 */

import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export type RotateOwnPasswordInput = {
  userId: bigint;
  /** `sessions.uid` of the request being served — the one session kept alive. */
  sessionUid: string;
  /** Already hashed by `hashPassword`. Plaintext never reaches this module. */
  passwordHash: string;
  /** For the audit summary; the actor snapshot is written by `writeAudit`. */
  username: string;
};

export type RotateOwnPasswordResult = {
  /** How many other devices were signed out. */
  revoked: number;
};

export async function rotateOwnPassword(
  input: RotateOwnPasswordInput,
): Promise<RotateOwnPasswordResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE users
         SET password_hash        = ${input.passwordHash},
             password_changed_at  = now(),
             must_change_password = false,
             failed_login_count   = 0,
             locked_until         = NULL,
             updated_at           = now()
       WHERE id = ${input.userId}`;

    // Every live session except this one. The raw token never leaves the
    // cookie, so `uid` — not the token hash — is how the current session is
    // identified. Already-revoked rows are left alone, so an earlier reason and
    // timestamp survive for the audit trail.
    const revoked = await tx.$executeRaw`
      UPDATE sessions
         SET revoked_at = now(), revoked_reason = 'password_change'
       WHERE user_id    = ${input.userId}
         AND revoked_at IS NULL
         AND uid       <> ${input.sessionUid}::uuid`;

    await writeAudit(tx, {
      actor: { id: input.userId },
      action: "password_change",
      entityTable: "users",
      entityId: input.userId,
      summary: `Changed own password (${input.username}) — ${revoked} other session(s) revoked`,
    });

    return { revoked };
  });
}
