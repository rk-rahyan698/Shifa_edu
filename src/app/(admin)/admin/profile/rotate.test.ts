/**
 * T-070 Verify — a password change keeps the current session and revokes the
 * others.
 *
 * Asserted against a real `sessions` table through `verifySession`, not against
 * row counts alone: "revoked" has to mean the token stops authenticating, which
 * is the property T-032 owns and the one an admin actually experiences.
 *
 * The Contract — a user may never alter their own role or permissions here — is
 * kept by T-034's `.strict()` `profileUpdateSchema`, so it is asserted against
 * that schema below rather than through the page (which Vitest cannot transform;
 * see `rotate.ts`'s header).
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession, verifySession } = await import("@/lib/session");
const { rotateOwnPassword } = await import("@/app/(admin)/admin/profile/rotate");
const { hashPassword, verifyPassword } = await import("@/lib/auth");
const { profileUpdateSchema } = await import("@/lib/validation/users");

const created: bigint[] = [];

afterAll(async () => {
  for (const id of created) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions      WHERE user_id       = ${id}`;
    await prisma.$executeRaw`DELETE FROM users         WHERE id            = ${id}`;
  }

  await prisma.$disconnect();
});

describe("changing your own password", () => {
  it("keeps the session that made the change and revokes the rest", async () => {
    const user = await makeUser();

    const here = await issueSession({ userId: user });
    const laptop = await issueSession({ userId: user });
    const phone = await issueSession({ userId: user });

    // All three authenticate before the change.
    for (const session of [here, laptop, phone]) {
      expect(await verifySession(session.token)).not.toBeNull();
    }

    const result = await rotateOwnPassword({
      userId: user,
      sessionUid: here.uid,
      passwordHash: await hashPassword("a-much-longer-passphrase"),
      username: "t070",
    });

    expect(result.revoked).toBe(2);

    // This one still works…
    expect(await verifySession(here.token)).not.toBeNull();
    // …and the other two do not.
    expect(await verifySession(laptop.token)).toBeNull();
    expect(await verifySession(phone.token)).toBeNull();

    const revoked = await prisma.session.findMany({
      where: { userId: user, revokedAt: { not: null } },
      select: { uid: true, revokedReason: true },
    });
    expect(revoked).toHaveLength(2);
    expect(revoked.every((row) => row.revokedReason === "password_change")).toBe(true);
    expect(revoked.some((row) => row.uid === here.uid)).toBe(false);
  });

  it("stores the new hash, stamps it, and clears the forced-rotation flag", async () => {
    const user = await makeUser({ mustChangePassword: true });
    const here = await issueSession({ userId: user });

    await rotateOwnPassword({
      userId: user,
      sessionUid: here.uid,
      passwordHash: await hashPassword("another-long-passphrase"),
      username: "t070",
    });

    const row = await prisma.user.findUnique({ where: { id: user } });
    expect(await verifyPassword("another-long-passphrase", row?.passwordHash ?? "")).toBe(
      true,
    );
    expect(row?.passwordChangedAt).not.toBeNull();
    expect(row?.mustChangePassword).toBe(false);
    expect(row?.failedLoginCount).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it("writes one password_change audit row, with no password in it", async () => {
    const user = await makeUser();
    const here = await issueSession({ userId: user });

    await rotateOwnPassword({
      userId: user,
      sessionUid: here.uid,
      passwordHash: await hashPassword("yet-another-long-passphrase"),
      username: "t070-audited",
    });

    const rows = await prisma.activityLog.findMany({
      where: { actorUserId: user },
      select: { actionCode: true, summary: true, changeDiff: true },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.actionCode).toBe("password_change");
    expect(rows[0]?.summary).toContain("t070-audited");
    expect(JSON.stringify(rows[0])).not.toContain("yet-another-long-passphrase");
  });

  it("leaves an already-revoked session's original reason alone", async () => {
    const user = await makeUser();
    const here = await issueSession({ userId: user });
    const old = await issueSession({ userId: user });

    await prisma.$executeRaw`
      UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout'
       WHERE uid = ${old.uid}::uuid`;

    const result = await rotateOwnPassword({
      userId: user,
      sessionUid: here.uid,
      passwordHash: await hashPassword("a-fourth-long-passphrase"),
      username: "t070",
    });

    expect(result.revoked).toBe(0);

    const row = await prisma.session.findFirst({ where: { uid: old.uid } });
    expect(row?.revokedReason).toBe("logout");
  });
});

describe("the profile form's own contract", () => {
  it("refuses a posted role or active flag rather than ignoring it", () => {
    const withRole = profileUpdateSchema.safeParse({
      displayName: "Someone",
      email: "someone@example.org",
      preferredLocale: "bn",
      roleCode: "super_admin",
    });

    expect(withRole.success).toBe(false);
    if (withRole.success) throw new Error("unreachable");
    // `.strict()` names the key it did not expect — a silent drop would let a
    // reader believe the field had been considered.
    expect(JSON.stringify(withRole.error.issues)).toContain("roleCode");

    expect(
      profileUpdateSchema.safeParse({
        displayName: "Someone",
        email: "someone@example.org",
        preferredLocale: "bn",
        isActive: true,
      }).success,
    ).toBe(false);
  });

  it("accepts exactly the three fields a user owns about themselves", () => {
    expect(
      profileUpdateSchema.safeParse({
        displayName: "Someone",
        email: null,
        preferredLocale: "en",
      }).success,
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function makeUser(options: { mustChangePassword?: boolean } = {}): Promise<bigint> {
  const suffix = randomBytes(4).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (
      username, email, password_hash, display_name, role_code, is_active,
      must_change_password, failed_login_count
    )
    VALUES (
      ${`t070_${suffix}`}::citext,
      ${`t070_${suffix}@example.org`}::citext,
      'not-a-real-hash',
      ${`T-070 fixture ${suffix}`},
      'admin',
      TRUE,
      ${options.mustChangePassword ?? false},
      3
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.push(row.id);
  return row.id;
}

/** The environment bootstrap every DB-backed suite carries. T-111 replaces it. */
function bootstrapTestEnv(): void {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match?.[1] !== undefined && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, "") ?? "";
    }
  }

  const placeholders: Record<string, string> = {
    SESSION_SECRET: "test-session-secret-not-used-by-this-suite",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "test@example.org",
    STORAGE_ENDPOINT: "https://storage.example.org",
    STORAGE_REGION: "test",
    STORAGE_ACCESS_KEY_ID: "test",
    STORAGE_SECRET_ACCESS_KEY: "test",
    STORAGE_PUBLIC_BUCKET: "public",
    STORAGE_PRIVATE_BUCKET: "private",
    STORAGE_PUBLIC_BASE_URL: "https://cdn.example.org",
    NEXT_PUBLIC_SITE_URL: "https://example.org",
  };

  for (const [key, value] of Object.entries(placeholders)) {
    process.env[key] ??= value;
  }
}
