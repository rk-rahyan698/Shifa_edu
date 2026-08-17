/**
 * T-068 Verify — reading stamps reader and time; delete is soft and reversible.
 *
 * Plus the Contract ("read-only plus delete"), which is the clause with teeth:
 * an admin holding `contact:view` alone must be able to read the inbox and
 * change nothing in it. That is asserted directly, because the permission split
 * this module uses — the read stamp on `view`, every discretionary write on
 * `delete` — is this card's own judgement call and the place it could be wrong.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it, vi } from "vitest";

bootstrapTestEnv();

let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession } = await import("@/lib/session");
const {
  deleteMessageAction,
  markMessageReadAction,
  restoreMessageAction,
  setMessageStatusAction,
} = await import("@/lib/modules/messages/actions");
const { readMessage, readMessageInbox, SORTABLE_COLUMNS } =
  await import("@/lib/modules/messages/read");
const { parseDataTableQuery } = await import("@/components/admin/data-table-query");

const created = { users: [] as bigint[], messages: [] as bigint[] };

afterAll(async () => {
  for (const id of created.messages) {
    await prisma.$executeRaw`DELETE FROM contact_messages WHERE id = ${id}`;
  }
  for (const id of created.users) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM sessions      WHERE user_id       = ${id}`;
    await prisma.$executeRaw`DELETE FROM users         WHERE id            = ${id}`;
  }

  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — reading stamps reader and time
// ─────────────────────────────────────────────────────────────────────────────

describe("reading a message", () => {
  it("stamps the reader and the time, and moves it off `new`", async () => {
    const reader = await fixture([["contact", "view"]]);
    const id = await makeMessage();

    const before = await readMessage(id);
    expect(before?.readAt).toBe("");
    expect(before?.statusCode).toBe("new");

    const result = await markMessageReadAction({ id: String(id) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.alreadyRead).toBe(false);

    const after = await readMessage(id);
    expect(after?.readAt).not.toBe("");
    expect(after?.statusCode).toBe("read");

    const row = await prisma.contactMessage.findUnique({ where: { id } });
    expect(row?.readByUserId).toBe(reader);
  });

  it("keeps the first reader — a second admin opening it does not overwrite them", async () => {
    const first = await fixture([["contact", "view"]]);
    const id = await makeMessage();

    await markMessageReadAction({ id: String(id) });

    await fixture([["contact", "view"]]);
    const second = await markMessageReadAction({ id: String(id) });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.data.alreadyRead).toBe(true);

    const row = await prisma.contactMessage.findUnique({ where: { id } });
    expect(row?.readByUserId).toBe(first);
  });

  it("refuses the stamp to an admin without contact:view", async () => {
    await fixture([["notice", "view"]]);
    const id = await makeMessage();

    const result = await markMessageReadAction({ id: String(id) });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.status).toBe(403);

    const row = await prisma.contactMessage.findUnique({ where: { id } });
    expect(row?.readAt).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verify — delete is soft and reversible
// ─────────────────────────────────────────────────────────────────────────────

describe("deleting a message", () => {
  it("is soft: the row survives, its purge date is untouched, and it can come back", async () => {
    const actor = await fixture([
      ["contact", "view"],
      ["contact", "delete"],
    ]);
    const id = await makeMessage();

    const purgeBefore = (await readMessage(id))?.purgeAfter;
    expect(purgeBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect((await deleteMessageAction({ id: String(id) })).ok).toBe(true);

    const row = await prisma.contactMessage.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedByUserId).toBe(actor);
    // The name and the message are still there — a soft delete that blanked the
    // record would not be reversible in any sense that matters.
    expect(row?.message).not.toBe("");

    // Gone from the inbox, present in the trash.
    expect(await inboxIds({ includeDeleted: false })).not.toContain(String(id));
    expect(await inboxIds({ includeDeleted: true })).toContain(String(id));

    expect((await restoreMessageAction({ id: String(id) })).ok).toBe(true);

    const restored = await readMessage(id);
    expect(restored?.isDeleted).toBe(false);
    // §A-16.1's clock runs from `submitted_at` and is a generated column, so a
    // round trip through the trash cannot have moved it.
    expect(restored?.purgeAfter).toBe(purgeBefore);
    expect(await inboxIds({ includeDeleted: false })).toContain(String(id));
  });

  it("audits the delete and the restore as different events", async () => {
    const actor = await fixture([["contact", "delete"]]);
    const id = await makeMessage();

    await deleteMessageAction({ id: String(id) });
    await restoreMessageAction({ id: String(id) });

    const rows = await prisma.activityLog.findMany({
      where: { actorUserId: actor, entityTable: "contact_messages", entityId: id },
      orderBy: { id: "asc" },
      select: { actionCode: true },
    });

    expect(rows.map((row) => row.actionCode)).toEqual(["delete", "restore"]);
  });

  it("refuses to delete a message twice, or restore one that is not deleted", async () => {
    await fixture([["contact", "delete"]]);
    const id = await makeMessage();

    expect((await restoreMessageAction({ id: String(id) })).ok).toBe(false);
    expect((await deleteMessageAction({ id: String(id) })).ok).toBe(true);

    const twice = await deleteMessageAction({ id: String(id) });
    expect(twice.ok).toBe(false);
    if (twice.ok) throw new Error("unreachable");
    expect(twice.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract — read-only plus delete
// ─────────────────────────────────────────────────────────────────────────────

describe("read-only plus delete", () => {
  it("lets contact:view read but change nothing discretionary", async () => {
    await fixture([["contact", "view"]]);
    const id = await makeMessage();

    // May read, and the receipt is part of reading.
    expect((await markMessageReadAction({ id: String(id) })).ok).toBe(true);

    // May not dispose.
    for (const result of [
      await setMessageStatusAction({ id: String(id), statusCode: "spam" }),
      await deleteMessageAction({ id: String(id) }),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.status).toBe(403);
    }

    const row = await prisma.contactMessage.findUnique({ where: { id } });
    expect(row?.statusCode).toBe("read");
    expect(row?.deletedAt).toBeNull();
  });

  it("has no edit action to grant — the message is kept as it was written", async () => {
    const declared = await prisma.moduleAction.findMany({
      where: { moduleCode: "contact" },
      select: { actionCode: true },
    });

    expect(declared.map((row) => row.actionCode).sort()).toEqual(["delete", "view"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The list query — T-051's server-side pagination contract
// ─────────────────────────────────────────────────────────────────────────────

describe("the inbox list", () => {
  it("pages, searches and refuses a sort key that was never offered", async () => {
    await fixture([["contact", "view"]]);

    const token = randomBytes(5).toString("hex");
    for (let index = 0; index < 3; index += 1) {
      await makeMessage({ name: `T068 ${token} ${index}` });
    }

    const page = await readMessageInbox({
      query: parseDataTableQuery({ q: token, size: "2" }, SORTABLE_COLUMNS),
      statusCode: "",
      includeDeleted: false,
    });

    expect(page.total).toBe(3);
    // One page, never the table.
    expect(page.rows).toHaveLength(2);

    const second = await readMessageInbox({
      query: parseDataTableQuery({ q: token, size: "2", page: "2" }, SORTABLE_COLUMNS),
      statusCode: "",
      includeDeleted: false,
    });
    expect(second.rows).toHaveLength(1);

    // `password_hash` exists; it was never on the allowlist, so it is dropped
    // rather than escaped and the query falls back to `submitted_at`.
    const injected = parseDataTableQuery(
      { sort: "password_hash", q: token },
      SORTABLE_COLUMNS,
    );
    expect(injected.sort).toBeNull();
    expect(
      (await readMessageInbox({ query: injected, statusCode: "", includeDeleted: false }))
        .total,
    ).toBe(3);
  });

  it("treats a % in the search box as a literal, not a wildcard", async () => {
    await fixture([["contact", "view"]]);

    const query = parseDataTableQuery({ q: "%" }, SORTABLE_COLUMNS);
    const all = parseDataTableQuery({}, SORTABLE_COLUMNS);

    const matched = await readMessageInbox({
      query,
      statusCode: "",
      includeDeleted: false,
    });
    const everything = await readMessageInbox({
      query: all,
      statusCode: "",
      includeDeleted: false,
    });

    // A bare `%` would match every row if it reached `LIKE` unescaped.
    expect(matched.total).toBeLessThan(everything.total);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

async function inboxIds(options: { includeDeleted: boolean }): Promise<string[]> {
  const inbox = await readMessageInbox({
    query: parseDataTableQuery({ size: "100" }, SORTABLE_COLUMNS),
    statusCode: "",
    includeDeleted: options.includeDeleted,
  });
  return inbox.rows.map((row) => row.id);
}

async function makeMessage(options: { name?: string } = {}): Promise<bigint> {
  const suffix = randomBytes(4).toString("hex");

  const row = await prisma.contactMessage.create({
    data: {
      name: options.name ?? `T-068 ${suffix}`,
      phone: "01711111111",
      email: `t068-${suffix}@example.org`,
      message: `T-068 fixture message ${suffix}`,
      localeCode: "bn",
    },
  });

  created.messages.push(row.id);
  return row.id;
}

/** Creates an admin holding exactly these permissions, and signs in as them. */
async function fixture(
  permissions: readonly (readonly [string, string])[],
): Promise<bigint> {
  const suffix = randomBytes(4).toString("hex");

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t068_${suffix}`}::citext,
      ${`t068_${suffix}@example.org`}::citext,
      'not-a-real-hash',
      ${`T-068 fixture ${suffix}`},
      'admin',
      TRUE
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  created.users.push(row.id);

  for (const [moduleCode, actionCode] of permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

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
