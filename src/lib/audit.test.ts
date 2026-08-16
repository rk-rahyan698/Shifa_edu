/**
 * T-035 Verify — integration tests against the real database.
 *
 * The claim under test is transactional, so it can only be tested
 * transactionally: a mock would happily "roll back" nothing. Every case here
 * runs through `prisma.$transaction` and then asks Postgres what survived.
 *
 * The environment bootstrap is the same one T-032 and T-033 carry, for the same
 * reason — `src/lib/env.ts` validates the whole server schema at import and
 * Vitest does not read `.env`. T-111 replaces all three with a shared fixture.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

bootstrapTestEnv();

const { prisma } = await import("@/lib/prisma");
const { buildDiff, describeChange, REDACTED, SYSTEM_ACTOR, writeAudit } =
  await import("@/lib/audit");

const actorId = await createThrowawayUser("t035");
const actorUsername = await usernameOf(actorId);

beforeEach(async () => {
  await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${actorId}`;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${actorId}`;
  await prisma.$executeRaw`DELETE FROM users WHERE id = ${actorId}`;
  await prisma.$disconnect();
});

async function auditRows() {
  return prisma.$queryRaw<
    {
      id: bigint;
      actor_user_id: bigint | null;
      actor_username_snapshot: string;
      actor_role_snapshot: string;
      action_code: string;
      module_code: string | null;
      entity_table: string | null;
      entity_id: bigint | null;
      summary: string;
      change_diff: unknown;
      ip_address: string | null;
    }[]
  >`
    SELECT id, actor_user_id, actor_username_snapshot, actor_role_snapshot, action_code,
           module_code, entity_table, entity_id, summary, change_diff, host(ip_address) AS ip_address
      FROM activity_logs
     WHERE actor_user_id = ${actorId} OR actor_username_snapshot = ${actorUsername}
     ORDER BY id`;
}

describe("the audit row commits with the mutation or not at all", () => {
  it("writes exactly one row when the transaction commits", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE users SET display_name = 'Committed' WHERE id = ${actorId}`;
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "update",
        module: "users",
        entityTable: "users",
        entityId: actorId,
        summary: "Updated the display name",
      });
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary).toBe("Updated the display name");

    const [user] = await prisma.$queryRaw<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${actorId}`;
    expect(user?.display_name).toBe("Committed");
  });

  it("leaves no audit row when the mutation is rolled back", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE users SET display_name = 'Rolled back' WHERE id = ${actorId}`;
        await writeAudit(tx, {
          actor: { id: actorId },
          action: "update",
          module: "users",
          entityTable: "users",
          entityId: actorId,
          summary: "This must not survive",
        });

        throw new Error("mutation failed after the audit was written");
      }),
    ).rejects.toThrow("mutation failed after the audit was written");

    expect(await auditRows()).toHaveLength(0);

    // And the mutation itself is gone too — the two share one fate.
    const [user] = await prisma.$queryRaw<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${actorId}`;
    expect(user?.display_name).not.toBe("Rolled back");
  });

  it("takes the mutation down with it when the audit write itself fails", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE users SET display_name = 'Should not stick' WHERE id = ${actorId}`;
        // `module_code` is a foreign key to `modules` (AUDIT S-3).
        await writeAudit(tx, {
          actor: { id: actorId },
          action: "update",
          module: "not_a_module",
          summary: "Bad module code",
        });
      }),
    ).rejects.toThrow();

    expect(await auditRows()).toHaveLength(0);
    const [user] = await prisma.$queryRaw<{ display_name: string }[]>`
      SELECT display_name FROM users WHERE id = ${actorId}`;
    expect(user?.display_name).not.toBe("Should not stick");
  });

  it("writes one row per call, not one per transaction", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, { actor: { id: actorId }, action: "create", summary: "One" });
      await writeAudit(tx, { actor: { id: actorId }, action: "update", summary: "Two" });
    });

    expect((await auditRows()).map((r) => r.summary)).toEqual(["One", "Two"]);
  });
});

describe("the actor is snapshotted, not referenced (ADR-011, AUDIT S-6)", () => {
  it("reads the username and role from the row at write time", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "login",
        summary: "Signed in",
      });
    });

    const [row] = await auditRows();
    expect(row?.actor_username_snapshot).toBe(actorUsername);
    expect(row?.actor_role_snapshot).toBe("admin");
    expect(row?.actor_user_id).toBe(actorId);
  });

  it("prefers a snapshot the caller supplies over a lookup", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId, username: "as-it-was-then", roleCode: "super_admin" },
        action: "update",
        summary: "Explicit snapshot",
      });
    });

    const [row] = await auditRows();
    expect(row?.actor_username_snapshot).toBe("as-it-was-then");
    expect(row?.actor_role_snapshot).toBe("super_admin");
  });

  it("survives the actor being deleted — the trail is the point", async () => {
    const doomedId = await createThrowawayUser("t035_doomed");
    const doomedUsername = await usernameOf(doomedId);

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: doomedId },
        action: "delete",
        module: "notice",
        summary: "Deleted a notice",
      });
    });

    await prisma.$executeRaw`DELETE FROM users WHERE id = ${doomedId}`;

    const [row] = await prisma.$queryRaw<
      { actor_user_id: bigint | null; actor_username_snapshot: string; summary: string }[]
    >`
      SELECT actor_user_id, actor_username_snapshot, summary
        FROM activity_logs WHERE actor_username_snapshot = ${doomedUsername}`;

    // ON DELETE SET NULL: the pointer goes, the evidence stays.
    expect(row?.actor_user_id).toBeNull();
    expect(row?.actor_username_snapshot).toBe(doomedUsername);
    expect(row?.summary).toBe("Deleted a notice");

    await prisma.$executeRaw`
      DELETE FROM activity_logs WHERE actor_username_snapshot = ${doomedUsername}`;
  });

  it("records an unattributed write as the system actor, not as a null name", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: "delete",
        summary: "Purged messages older than 12 months",
      });
    });

    const [row] = await prisma.$queryRaw<
      { actor_user_id: bigint | null; actor_username_snapshot: string }[]
    >`
      SELECT actor_user_id, actor_username_snapshot FROM activity_logs
       WHERE summary = 'Purged messages older than 12 months'`;

    expect(row?.actor_user_id).toBeNull();
    expect(row?.actor_username_snapshot).toBe("system");

    await prisma.$executeRaw`
      DELETE FROM activity_logs WHERE summary = 'Purged messages older than 12 months'`;
  });
});

describe("what the row carries", () => {
  it("stores the diff as JSONB and reads it back as an object", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "update",
        module: "notice",
        entityTable: "notices",
        entityId: 42,
        summary: "Pinned a notice",
        diff: { isPinned: { from: false, to: true } },
        ip: "203.0.113.9",
      });
    });

    const [row] = await auditRows();
    expect(row?.change_diff).toEqual({ isPinned: { from: false, to: true } });
    expect(row?.entity_table).toBe("notices");
    expect(row?.entity_id).toBe(42n);
    expect(row?.module_code).toBe("notice");
    expect(row?.ip_address).toBe("203.0.113.9");
  });

  it("stores an absent diff as null rather than an empty object", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "login",
        summary: "Signed in",
      });
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "update",
        summary: "Nothing changed",
        diff: {},
      });
    });

    const rows = await auditRows();
    expect(rows[0]?.change_diff).toBeNull();
    expect(rows[1]?.change_diff).toBeNull();
  });

  it("never writes a secret, even when a caller hands one over", async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "password_change",
        module: "users",
        summary: "Changed the password",
        diff: { passwordHash: { from: "$2b$12$old", to: "$2b$12$new" } },
      });
    });

    const [row] = await auditRows();
    // The change is recorded; the values are not.
    expect(row?.change_diff).toEqual({
      passwordHash: { from: REDACTED, to: REDACTED },
    });
    expect(JSON.stringify(row?.change_diff)).not.toContain("$2b$12$");
  });

  it("refuses a blank summary — an unreadable row is not a log entry", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(tx, {
          actor: { id: actorId },
          action: "update",
          summary: "   ",
        });
      }),
    ).rejects.toThrow(/summary/);

    expect(await auditRows()).toHaveLength(0);
  });

  it("stores bigint ids without a serialization failure", async () => {
    // The realistic trap: a diff carrying a Prisma `bigint` throws inside
    // JSON.stringify and takes the whole transaction — and its mutation — down.
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        actor: { id: actorId },
        action: "update",
        summary: "Reassigned a category",
        diff: buildDiff(
          { noticeCategoryId: 3n },
          { noticeCategoryId: 9007199254740993n },
        ),
      });
    });

    const [row] = await auditRows();
    expect(row?.change_diff).toEqual({
      noticeCategoryId: { from: "3", to: "9007199254740993" },
    });
  });
});

describe("buildDiff", () => {
  it("keeps only the fields that changed", () => {
    expect(
      buildDiff(
        { title: "Old", isPinned: false, sortOrder: 1 },
        { title: "New", isPinned: false, sortOrder: 1 },
      ),
    ).toEqual({ title: { from: "Old", to: "New" } });
  });

  it("reports a field that was set or cleared", () => {
    expect(buildDiff({ excerpt: null }, { excerpt: "Now set" })).toEqual({
      excerpt: { from: null, to: "Now set" },
    });
    expect(buildDiff({ excerpt: "Was set" }, { excerpt: null })).toEqual({
      excerpt: { from: "Was set", to: null },
    });
  });

  it("treats undefined and null as the same absence", () => {
    expect(buildDiff({ a: undefined }, { a: null })).toEqual({});
  });

  it("normalizes dates and bigints to JSON-safe values", () => {
    const diff = buildDiff(
      { publishedAt: new Date("2026-01-01T00:00:00.000Z"), id: 1n },
      { publishedAt: new Date("2026-02-01T00:00:00.000Z"), id: 2n },
    );

    expect(diff).toEqual({
      publishedAt: { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" },
      id: { from: "1", to: "2" },
    });
    expect(() => JSON.stringify(diff)).not.toThrow();
  });

  it("does not report two equal dates as a change", () => {
    expect(
      buildDiff(
        { at: new Date("2026-01-01T00:00:00.000Z") },
        { at: new Date("2026-01-01T00:00:00.000Z") },
      ),
    ).toEqual({});
  });

  it("compares nested objects structurally, not by reference", () => {
    expect(
      buildDiff(
        { translations: { bn: { title: "ক" } } },
        { translations: { bn: { title: "ক" } } },
      ),
    ).toEqual({});

    expect(
      buildDiff(
        { translations: { bn: { title: "ক" } } },
        { translations: { bn: { title: "খ" } } },
      ),
    ).toEqual({
      translations: {
        from: { bn: { title: "ক" } },
        to: { bn: { title: "খ" } },
      },
    });
  });

  it("redacts a secret at the top level and nested inside an object", () => {
    expect(buildDiff({ passwordHash: "old" }, { passwordHash: "new" })).toEqual({
      passwordHash: { from: REDACTED, to: REDACTED },
    });

    const nested = buildDiff(
      { credentials: { username: "rahim", passwordHash: "old" } },
      { credentials: { username: "rahim", passwordHash: "new" } },
    );
    expect(JSON.stringify(nested)).not.toContain("old");
    expect(JSON.stringify(nested)).toContain("rahim");
  });
});

describe("describeChange", () => {
  it("reads as a sentence an admin can scan", () => {
    expect(describeChange("create", "notice", "ভর্তি বিজ্ঞপ্তি")).toBe(
      "Created notice — ভর্তি বিজ্ঞপ্তি",
    );
    expect(describeChange("publish", "notice")).toBe("Published notice");
    expect(describeChange("login", "")).toBe("Signed in");
  });
});

/**
 * Fills `process.env` from `.env` and supplies inert placeholders for the keys
 * `src/lib/env.ts` requires but this suite does not use. Nothing here is a
 * credential — the real values live outside the repo.
 */
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

/** A disposable admin to attribute audit rows to. Removed in `afterAll`. */
async function createThrowawayUser(prefix: string): Promise<bigint> {
  const suffix = randomBytes(6).toString("hex");
  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code)
    VALUES (
      ${`${prefix}_${suffix}`},
      ${`${prefix}_${suffix}@example.org`},
      'not-a-real-hash',
      'T-035 fixture',
      'admin'
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  return row.id;
}

async function usernameOf(id: bigint): Promise<string> {
  const [row] = await prisma.$queryRaw<{ username: string }[]>`
    SELECT username::text FROM users WHERE id = ${id}`;
  if (row === undefined) throw new Error("Fixture user not found");
  return row.username;
}
