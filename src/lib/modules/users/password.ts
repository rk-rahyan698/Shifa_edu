/**
 * The generated initial password (T-069), per ARCHITECTURE.md §A-9.2's
 * first-login row.
 *
 * §A-9.2 is explicit that the seed password is **generated and printed once,
 * never a literal in a document** (AUDIT S-12), and §A-9.3's `userCreateSchema`
 * (T-034) refuses to accept a password field at all for the same reason: an
 * admin who types a colleague's initial password knows it, and the account is
 * no longer that person's alone. So the password is made here, shown to the
 * creating Super Admin exactly once, and never stored in plaintext — the row
 * gets a bcrypt hash and `must_change_password = true`, so the first thing the
 * new admin does is replace it.
 *
 * `randomInt` rather than `randomBytes` modulo the alphabet length: the modulo
 * is biased whenever 256 is not a multiple of that length (it is not, for any
 * alphabet worth using), and a biased password generator is the kind of defect
 * that never shows up in a test. `randomInt` does the rejection sampling.
 *
 * The alphabet drops the characters that get misread when a password is
 * dictated across a desk or copied off a screen — `0`/`O`, `1`/`l`/`I` — which
 * is the medium this value actually travels in. That costs about 0.4 bits per
 * character and buys back the support call.
 */

import { randomInt } from "node:crypto";

/**
 * 16 characters over a 57-character alphabet is ~93 bits. Comfortably past
 * T-034's 12-character floor, and short enough to read aloud once.
 */
export const GENERATED_PASSWORD_LENGTH = 16;

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * A fresh initial password.
 *
 * Returned to the caller and shown once. Nothing writes it to a log, an audit
 * row or the database — `REDACTED_FIELDS` in T-035 covers the field name, but
 * the real guarantee is that this value has exactly one destination.
 */
export function generatePassword(length: number = GENERATED_PASSWORD_LENGTH): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
