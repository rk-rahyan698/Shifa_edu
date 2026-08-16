/**
 * `users` module inputs (T-034) — accounts, the permission matrix, credentials.
 *
 * Super Admin only (§A-5.2). The module has no `module_actions` rows at all, so
 * `users:edit` is a foreign-key error as well as an application refusal — these
 * schemas are reached only through the Super Admin bypass in §A-9.3.
 *
 * `passwordHash`, `mustChangePassword`, `failedLoginCount`, `lockedUntil` and
 * `lastLoginAt` are absent from every schema here. They are decided by the auth
 * flow (T-040…T-043), never posted: a body that can set `mustChangePassword`
 * to false can skip the forced first-login rotation §A-9.2 requires.
 */

import {
  dbId,
  emailAddress,
  LIMITS,
  localeCode,
  optionalEmailAddress,
  plainText,
  strictObject,
} from "@/lib/validation/primitives";
import { ACTION_CODES, MODULE_CODES, SPECIAL_GRANT_CODES } from "@/lib/modules";
import { z } from "zod";

/**
 * A login name. Deliberately narrow: it is typed at a login form, it is
 * `CITEXT` in the database, and anything that looks like an email would make
 * "username or email" ambiguous (§A-9.2 accepts either).
 */
export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Must be at least 3 characters")
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Must be letters, digits, dot, underscore or hyphen");

/**
 * A new password.
 *
 * §A-9.2 fixes the hashing (bcrypt cost 12) but states no length policy, so the
 * floor here is a decision this card had to make: 12 characters, with no
 * composition rules. Length is what resists an offline attack on a stolen hash;
 * mandatory symbols mostly produce `Password1!` and a sticky note. The upper
 * bound exists because bcrypt silently truncates past 72 **bytes** — a Bangla
 * passphrase reaches that in 24 characters, so the limit is measured in bytes,
 * not characters, or a user would set a password whose tail does nothing.
 */
export const password = z
  .string()
  .min(12, "Must be at least 12 characters")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Too long — bcrypt ignores anything past 72 bytes",
  );

/** Roles are rows in `roles`; the two the app ships are seeded in §B-19. */
export const ROLE_CODES = ["super_admin", "admin"] as const;
export const roleCode = z.enum(ROLE_CODES);

/**
 * Creating an admin.
 *
 * The password is **not** here. §A-9.2 requires it to be generated at creation
 * and shown once, with `must_change_password` set — an admin who types a
 * colleague's initial password knows it, and the account is no longer that
 * person's alone.
 */
export const userCreateSchema = strictObject({
  username,
  email: emailAddress,
  displayName: plainText(LIMITS.shortText),
  roleCode: roleCode.default("admin"),
  preferredLocale: localeCode.default("bn"),
});

/**
 * Editing an admin. `isActive` is here because suspension is an edit — and it
 * is the edit that must call `revokeAllForUser` (§A-9.2, AUDIT S-7); T-069 owns
 * that, but the field being present is what makes it reachable.
 */
export const userUpdateSchema = strictObject({
  id: dbId,
  email: optionalEmailAddress,
  displayName: plainText(LIMITS.shortText).optional(),
  roleCode: roleCode.optional(),
  preferredLocale: localeCode.optional(),
  isActive: z.boolean().optional(),
});

/** The self-service profile (T-070) — no role, no permissions, no `isActive`. */
export const profileUpdateSchema = strictObject({
  displayName: plainText(LIMITS.shortText),
  email: optionalEmailAddress,
  preferredLocale: localeCode,
});

/**
 * A permission row. §A-9.3's model exactly: a granted permission **is** a row,
 * there is no cascade, and `module:action` pairs are validated against the
 * compile-time mirror in `@/lib/modules` before they reach the composite
 * foreign key.
 */
export const permissionGrantSchema = strictObject({
  moduleCode: z.enum(MODULE_CODES),
  actionCode: z.enum(ACTION_CODES),
});

/**
 * The whole matrix for one user, posted as a set.
 *
 * A set rather than a diff on purpose: "these are the permissions this user has
 * now" is a statement the audit row can record in full, while a stream of
 * add/remove deltas leaves the actual end state implicit.
 */
export const permissionMatrixSchema = strictObject({
  userId: dbId,
  permissions: z
    .array(permissionGrantSchema)
    .max(MODULE_CODES.length * ACTION_CODES.length),
  specialGrants: z.array(z.enum(SPECIAL_GRANT_CODES)).max(SPECIAL_GRANT_CODES.length),
});

/** Login (T-040). The identifier is username **or** email, so it is not `username`. */
export const loginSchema = strictObject({
  identifier: z.string().trim().min(1, "Required").max(254),
  password: z.string().min(1, "Required"),
});

/** Changing one's own password — the current one is required (§A-9.2). */
export const passwordChangeSchema = strictObject({
  currentPassword: z.string().min(1, "Required"),
  newPassword: password,
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "The new password must differ from the current one",
  path: ["newPassword"],
});

/** Requesting a reset email (T-042). Always answered identically — see T-042. */
export const passwordResetRequestSchema = strictObject({
  email: emailAddress,
});

/** Completing a reset with the emailed token: single-use, 30-minute TTL. */
export const passwordResetSchema = strictObject({
  token: z.string().trim().min(16).max(256),
  newPassword: password,
});

export const userDeleteSchema = strictObject({ id: dbId });

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type PermissionMatrixInput = z.infer<typeof permissionMatrixSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
