/**
 * T-038 Verify — the six stages, against the real database.
 *
 * The claims are "each stage runs" and "failure at any stage prevents every
 * later stage", and both are claims about side effects: a row written, an audit
 * row written, a cache tag cleared. A mocked Prisma would let all three be
 * asserted without any of them being true, so the transaction is real and
 * Postgres is asked afterwards what survived — the same reasoning T-035 gives.
 *
 * Only two things are stubbed, and neither is a stage. `@/lib/cookies` is the
 * cookie *transport* (`next/headers` has no request to read here); the session
 * it carries is genuinely issued by T-032 and genuinely verified. `next/cache`
 * is Next's revalidator, which likewise needs a request context — stubbing it
 * is what lets stage 6 be observed at all.
 *
 * The environment bootstrap is the one T-032, T-033 and T-035 carry, for the
 * same reason. T-111 replaces all four with a shared fixture.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

bootstrapTestEnv();

/** The token `readSessionCookie` returns. Each test points it at its own user. */
let currentToken: string | null = null;

vi.mock("@/lib/cookies", () => ({
  readSessionCookie: async () => currentToken,
}));

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

const { prisma } = await import("@/lib/prisma");
const { issueSession, revokeSession } = await import("@/lib/session");
const { optionalRichText, plainText } = await import("@/lib/validation/primitives");
const {
  defineMutation,
  mutate,
  MutationDeniedError,
  PIPELINE_STAGES,
  SanitizationError,
  UnauthenticatedError,
  ValidationFailedError,
} = await import("@/lib/mutate");

/** Every fixture user made in this file, torn down together. */
const fixtureUsers: bigint[] = [];

/**
 * The schema under test: one plain-text field and one rich-text field, both
 * built from the T-034 primitives, `.strict()` so an unknown key is a 422.
 */
const editSchema = z
  .object({
    displayName: plainText(120),
    bodyHtml: optionalRichText(),
  })
  .strict();

/** A schema that declares a `*_html` field without sanitizing it — the stage-4 defect. */
const unsanitizedSchema = z
  .object({
    displayName: plainText(120),
    bodyHtml: z.string(),
  })
  .strict();

afterAll(async () => {
  for (const id of fixtureUsers) {
    await prisma.$executeRaw`DELETE FROM activity_logs WHERE actor_user_id = ${id}`;
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${id}`;
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  revalidatePath.mockClear();
  revalidateTag.mockClear();
});

describe("stage 1 — authenticate", () => {
  it("refuses a request with no session cookie, and runs nothing after it", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });
    currentToken = null;

    const handler = vi.fn();
    await expect(runEdit(user, handler)).rejects.toMatchObject({
      name: "UnauthenticatedError",
      stage: "authenticate",
      status: 401,
    });

    expect(handler).not.toHaveBeenCalled();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(await displayNameOf(user.id)).toBe(user.displayName);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a session that was revoked after it was issued", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });
    await revokeSession(user.sessionToken, "admin_revoke");

    const handler = vi.fn();
    await expect(runEdit(user, handler)).rejects.toBeInstanceOf(UnauthenticatedError);

    expect(handler).not.toHaveBeenCalled();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });
});

describe("stage 2 — authorize", () => {
  // The card's Verify, stated exactly: an unauthorized call writes no data and
  // no audit row.
  it("refuses a user without the permission, writing neither data nor audit", async () => {
    const user = await fixture({ permissions: [] });

    const handler = vi.fn();
    await expect(runEdit(user, handler)).rejects.toMatchObject({
      name: "MutationDeniedError",
      stage: "authorize",
      status: 403,
      attempted: "notice:edit",
    });

    expect(handler).not.toHaveBeenCalled();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(await displayNameOf(user.id)).toBe(user.displayName);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses a permission the user holds for a different action", async () => {
    const user = await fixture({ permissions: [["notice", "add"]] });

    await expect(runEdit(user, vi.fn())).rejects.toBeInstanceOf(MutationDeniedError);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });

  it("refuses a suspended user who holds the permission", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]], isActive: false });

    await expect(runEdit(user, vi.fn())).rejects.toBeInstanceOf(MutationDeniedError);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });

  it("admits a super admin holding no explicit permission row", async () => {
    const user = await fixture({ permissions: [], role: "super_admin" });

    const handler = vi.fn(async ({ tx }: { tx: { $executeRaw: unknown } }) => {
      await renameThrough(tx, user.id, "Super admin wrote this");
      return { data: "ok", entityId: user.id, entityName: "the notice" };
    });

    await expect(runEdit(user, handler)).resolves.toBe("ok");
    expect(await displayNameOf(user.id)).toBe("Super admin wrote this");
  });

  // Authorization precedes validation, so a caller who may not write learns
  // nothing about the schema — a 422 naming fields is a map of the admin
  // surface handed to someone who may not open it.
  it("answers 403, not 422, when an unauthorized call also sends invalid input", async () => {
    // The fixture's only job here is the session it issues.
    await fixture({ permissions: [] });

    await expect(
      mutate(
        { module: "notice", action: "edit", schema: editSchema, handler: vi.fn() },
        {
          nonsense: true,
        },
      ),
    ).rejects.toBeInstanceOf(MutationDeniedError);
  });
});

describe("stage 3 — validate", () => {
  it("reports every failing field and runs nothing after it", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    const handler = vi.fn();
    const error = await capture(() =>
      mutate(
        {
          module: "notice",
          action: "edit",
          schema: editSchema,
          handler,
        },
        { displayName: "" },
      ),
    );

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect((error as InstanceType<typeof ValidationFailedError>).status).toBe(422);
    expect(
      (error as InstanceType<typeof ValidationFailedError>).issues.map((i) => i.field),
    ).toContain("displayName");

    expect(handler).not.toHaveBeenCalled();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("names an unknown key rather than dropping it", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    const error = await capture(() =>
      mutate(
        { module: "notice", action: "edit", schema: editSchema, handler: vi.fn() },
        { displayName: "Fine", surprise: "extra" },
      ),
    );

    expect(error).toBeInstanceOf(ValidationFailedError);
    expect(
      JSON.stringify((error as InstanceType<typeof ValidationFailedError>).issues),
    ).toContain("surprise");
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });
});

describe("stage 4 — sanitize", () => {
  it("stores rich text with the payload already stripped by the schema", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });
    let stored: unknown;

    await mutate(
      {
        module: "notice",
        action: "edit",
        schema: editSchema,
        entityTable: "users",
        handler: async ({ tx, input }) => {
          stored = input.bodyHtml;
          await renameThrough(tx, user.id, input.displayName);
          return { data: null, entityId: user.id };
        },
      },
      {
        displayName: "Sanitized",
        bodyHtml: '<p>Safe</p><script>alert(1)</script><a href="javascript:evil()">x</a>',
      },
    );

    expect(stored).toContain("<p>Safe</p>");
    expect(stored).not.toContain("script");
    expect(stored).not.toContain("javascript:");
  });

  it("refuses a `*_html` field that was declared without sanitizing, before persisting", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    const handler = vi.fn();
    const error = await capture(() =>
      mutate(
        {
          module: "notice",
          action: "edit",
          schema: unsanitizedSchema,
          handler,
        },
        { displayName: "Fine", bodyHtml: "<script>alert(1)</script>" },
      ),
    );

    expect(error).toBeInstanceOf(SanitizationError);
    expect((error as InstanceType<typeof SanitizationError>).stage).toBe("sanitize");
    // A schema defect, not the admin's mistake — so 500, not 422.
    expect((error as InstanceType<typeof SanitizationError>).status).toBe(500);

    expect(handler).not.toHaveBeenCalled();
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // The guard keys on the `*_html` suffix, so a plain-text field carrying a
  // literal `<` passes it rather than being mistaken for unsanitized markup.
  //
  // What that field *stores* is T-034's business, not this stage's: `plainText`
  // runs `stripHtml`, which HTML-escapes `&` and `<`. So `Class 5 < Class 6`
  // lands as `Class 5 &lt; Class 6` — asserted here as the current behaviour,
  // not endorsed. See the session log: it contradicts T-034's own rationale for
  // splitting plain text from rich text, and needs a new task to correct.
  it("does not mistake a legitimate `<` in a plain-text field for markup", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    await expect(
      mutate(
        {
          module: "notice",
          action: "edit",
          schema: editSchema,
          handler: async ({ tx, input }) => {
            await renameThrough(tx, user.id, input.displayName);
            return { data: null, entityId: user.id };
          },
        },
        { displayName: "Class 5 < Class 6" },
      ),
    ).resolves.toBeNull();

    expect(await displayNameOf(user.id)).toBe("Class 5 &lt; Class 6");
  });
});

describe("stage 5 — persist and audit, one transaction", () => {
  it("writes the row and exactly one audit row", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    const result = await mutate(
      {
        module: "notice",
        action: "edit",
        schema: editSchema,
        entityTable: "users",
        entityLabel: "notice",
        handler: async ({ tx, input, user: actor }) => {
          expect(actor.id).toBe(user.id);
          await renameThrough(tx, user.id, input.displayName);
          return {
            data: { renamed: true },
            entityId: user.id,
            entityName: "Exam routine",
            diff: { displayName: { from: user.displayName, to: input.displayName } },
          };
        },
      },
      { displayName: "Persisted" },
    );

    expect(result).toEqual({ renamed: true });
    expect(await displayNameOf(user.id)).toBe("Persisted");

    const rows = await auditRowsFor(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action_code).toBe("update");
    expect(rows[0]?.module_code).toBe("notice");
    expect(rows[0]?.entity_table).toBe("users");
    expect(rows[0]?.summary).toBe("Updated notice — Exam routine");
  });

  it("rolls the write back when the handler throws, and never reaches stage 6", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    await expect(
      mutate(
        {
          module: "notice",
          action: "edit",
          schema: editSchema,
          handler: async ({ tx, input }) => {
            await renameThrough(tx, user.id, input.displayName);
            throw new Error("the handler failed after writing");
          },
        },
        { displayName: "Never committed" },
      ),
    ).rejects.toThrow("the handler failed after writing");

    expect(await displayNameOf(user.id)).toBe(user.displayName);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // The symmetry that makes "a write without an audit row is impossible" a
  // property: if the audit insert fails, it takes the mutation with it.
  it("rolls the write back when the audit row cannot be written", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    await expect(
      mutate(
        {
          module: "notice",
          action: "edit",
          schema: editSchema,
          handler: async ({ tx, input }) => {
            await renameThrough(tx, user.id, input.displayName);
            // A blank summary is refused by `writeAudit` (T-035).
            return { data: null, entityId: user.id, summary: "   " };
          },
        },
        { displayName: "Audit will refuse this" },
      ),
    ).rejects.toThrow("summary");

    expect(await displayNameOf(user.id)).toBe(user.displayName);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-checks authorization inside the transaction, against the row not the session", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    // Revoked after the session exists. Whichever check catches it — the
    // in-memory one in stage 2 or the `tx` one in stage 5 — the outcome that
    // matters is identical: nothing written, nothing audited.
    await prisma.$executeRaw`
      DELETE FROM user_module_permissions
       WHERE user_id = ${user.id} AND module_code = 'notice' AND action_code = 'edit'`;

    const handler = vi.fn();
    await expect(runEdit(user, handler)).rejects.toBeInstanceOf(MutationDeniedError);

    expect(handler).not.toHaveBeenCalled();
    expect(await displayNameOf(user.id)).toBe(user.displayName);
    expect(await auditRowsFor(user.id)).toHaveLength(0);
  });
});

describe("stage 6 — invalidate", () => {
  it("revalidates the module's tags and both locales' paths, after the commit", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    await mutate(
      {
        module: "notice",
        action: "edit",
        schema: editSchema,
        handler: async ({ tx, input }) => {
          // Stage 6 has not run yet at this point — it follows the commit.
          expect(revalidatePath).not.toHaveBeenCalled();
          await renameThrough(tx, user.id, input.displayName);
          return { data: null, entityId: user.id };
        },
      },
      { displayName: "Invalidated" },
    );

    expect(revalidateTag).toHaveBeenCalled();
    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/notices");
    expect(paths).toContain("/en/notices");
  });
});

describe("the pipeline's shape", () => {
  it("declares the six stages in §A-5.1's order", () => {
    expect([...PIPELINE_STAGES]).toEqual([
      "authenticate",
      "authorize",
      "validate",
      "sanitize",
      "persist",
      "invalidate",
    ]);
  });

  it("refuses to be used for a read", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });
    void user;

    await expect(
      mutate(
        { module: "notice", action: "view", schema: editSchema, handler: vi.fn() },
        { displayName: "x" },
      ),
    ).rejects.toThrow("not a mutation");
  });

  it("binds its options once, for a Server Action to export", async () => {
    const user = await fixture({ permissions: [["notice", "edit"]] });

    const rename = defineMutation({
      module: "notice",
      action: "edit",
      schema: editSchema,
      handler: async ({ tx, input }) => {
        await renameThrough(tx, user.id, input.displayName);
        return { data: input.displayName, entityId: user.id };
      },
    });

    await expect(rename({ displayName: "Bound" })).resolves.toBe("Bound");
    expect(await displayNameOf(user.id)).toBe("Bound");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

type Fixture = {
  id: bigint;
  displayName: string;
  sessionToken: string;
};

/**
 * A throwaway admin with a live session, pointed at by the mocked cookie.
 *
 * One per test rather than one per file: `loadPermissions` is memoized per user
 * id, so sharing a fixture across tests would let one test's grant leak into
 * the next one's expectations.
 */
async function fixture(options: {
  permissions: readonly (readonly [string, string])[];
  role?: string;
  isActive?: boolean;
}): Promise<Fixture> {
  const suffix = randomBytes(6).toString("hex");
  const displayName = `T-038 fixture ${suffix}`;

  const [row] = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code, is_active)
    VALUES (
      ${`t038_${suffix}`},
      ${`t038_${suffix}@example.org`},
      'not-a-real-hash',
      ${displayName},
      ${options.role ?? "admin"},
      ${options.isActive ?? true}
    )
    RETURNING id`;

  if (row === undefined) throw new Error("Could not create the fixture user");
  fixtureUsers.push(row.id);

  for (const [moduleCode, actionCode] of options.permissions) {
    await prisma.$executeRaw`
      INSERT INTO user_module_permissions (user_id, module_code, action_code)
      VALUES (${row.id}, ${moduleCode}, ${actionCode})`;
  }

  const session = await issueSession({ userId: row.id });
  currentToken = session.token;

  return { id: row.id, displayName, sessionToken: session.token };
}

/** The standard `notice:edit` call these tests keep making. */
async function runEdit(user: Fixture, handler: unknown): Promise<unknown> {
  return mutate(
    {
      module: "notice",
      action: "edit",
      schema: editSchema,
      entityTable: "users",
      handler: handler as never,
    },
    { displayName: "Attempted write" },
  );
}

/** The handler's write, always through the transaction it was handed. */
async function renameThrough(tx: unknown, id: bigint, name: string): Promise<void> {
  const client = tx as {
    $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number>;
  };
  await client.$executeRaw`UPDATE users SET display_name = ${name} WHERE id = ${id}`;
}

async function displayNameOf(id: bigint): Promise<string> {
  const [row] = await prisma.$queryRaw<{ display_name: string }[]>`
    SELECT display_name FROM users WHERE id = ${id}`;
  if (row === undefined) throw new Error("Fixture user not found");
  return row.display_name;
}

async function auditRowsFor(id: bigint) {
  return prisma.$queryRaw<
    {
      action_code: string;
      module_code: string | null;
      entity_table: string | null;
      summary: string;
    }[]
  >`
    SELECT action_code, module_code, entity_table, summary
      FROM activity_logs
     WHERE actor_user_id = ${id}
     ORDER BY id`;
}

/** Returns the thrown error rather than letting it escape, for field-level assertions. */
async function capture(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw, but it resolved");
}

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
