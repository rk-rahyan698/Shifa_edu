/**
 * T-110 — §A-13.2's two broadest rows, applied to **every** mutating endpoint.
 *
 * §A-13.2 opens with "For **every** mutating endpoint, automated assertions",
 * and `matrix.test.ts` pins each row against the endpoint that states it most
 * sharply. This file is the other half of that sentence: it enumerates every
 * exported Server Action in the application and puts all of them through the
 * two rows that must hold universally —
 *
 *   row 1 · no session                       → 401
 *   row 2 · session with no permission row   → 403
 *
 * ## Why garbage input is the right input here
 *
 * `mutate()` runs authenticate → authorize → validate, in that order (§A-5.1).
 * A caller with no session is refused before its payload is ever parsed, so a
 * single empty object exercises the authorization boundary of an endpoint whose
 * schema this file does not need to know. That is what makes sweeping ninety-odd
 * endpoints possible without ninety-odd fixtures — and the ordering itself is
 * asserted in `matrix.test.ts`, so this file's shortcut rests on a tested claim
 * rather than an assumed one.
 *
 * The corollary is the real prize: **a new endpoint is covered the moment it is
 * exported.** Nobody has to remember to add it here.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  allExportedActions,
  bootstrapTestEnv,
  cleanup,
  fixture,
  refusalOf,
  signOut,
  type ExportedAction,
} from "./harness";

bootstrapTestEnv();

vi.mock("@/lib/cookies", async () => {
  const { sessionState } = await import("./harness");
  return { readSessionCookie: async () => sessionState.token };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { prisma } = await import("@/lib/prisma");

const actions = await allExportedActions();

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/**
 * `markMessageReadAction` validates before it authenticates.
 *
 * Every other endpoint reaches this suite through `mutate()`, whose first stage
 * is authentication. The read stamp does not — it is a `contact:view` write that
 * `mutate()` refuses to carry ("mutate() is for writes"), documented at length
 * in `messages/actions.ts` — and it parses its input first, so an empty object
 * comes back 422 rather than 401.
 *
 * Giving it a well-formed id lets it reach the authentication it does perform,
 * which is the property this sweep is actually asserting. The *ordering* is a
 * finding in its own right and is pinned separately at the bottom of this file
 * rather than smoothed over here.
 */
const VALID_INPUT_BY_ACTION: Readonly<Record<string, unknown>> = {
  markMessageReadAction: { id: 1 },
};

const inputFor = (action: ExportedAction): unknown =>
  VALID_INPUT_BY_ACTION[action.name] ?? {};

describe("every exported Server Action is discovered", () => {
  it("finds a substantial number across all eleven modules", () => {
    // A guard against the sweep silently becoming a no-op: if the naming
    // convention changed or a module stopped exporting, the two suites below
    // would pass vacuously. §A-13.2 asks for ~40 cases; this alone is double.
    expect(actions.length).toBeGreaterThanOrEqual(80);

    const modules = new Set(actions.map((a) => a.module));
    expect(modules.size).toBe(11);
  });
});

describe("§A-13.2 row 1 — no session → 401, for every mutating endpoint", () => {
  it.each(actions.map((a) => [`${a.module}/${a.name}`, a] as const))(
    "%s refuses an anonymous caller",
    async (_label, action) => {
      signOut();

      const result = refusalOf(await action.call(inputFor(action)));

      expect(result.status).toBe(401);
      expect(result.reason).toBe("unauthenticated");
    },
  );
});

describe("§A-13.2 row 2 — authenticated but unpermissioned → 403, for every mutating endpoint", () => {
  // One fixture for the whole sweep, deliberately. `loadPermissions` is
  // memoized per user id and this user's permissions never change, so there is
  // nothing for a later case to inherit — the hazard the per-test rule in
  // `harness.ts` guards against does not arise when the set is empty throughout.
  const holder: { user?: Awaited<ReturnType<typeof fixture>> } = {};

  it("creates the unpermissioned fixture", async () => {
    holder.user = await fixture({ permissions: [], specialGrants: [] });
    expect(holder.user.id).toBeTypeOf("bigint");
  });

  it.each(actions.map((a) => [`${a.module}/${a.name}`, a] as const))(
    "%s refuses an admin holding no permissions",
    async (_label, action) => {
      const { signInAs } = await import("./harness");
      if (holder.user === undefined) throw new Error("fixture missing");
      signInAs(holder.user);

      const result = refusalOf(await action.call(inputFor(action)));

      expect(result.status).toBe(403);
      expect(result.reason).toBe("forbidden");
    },
  );

  it("wrote no activity_logs row across the entire sweep", async () => {
    // Ninety-odd refusals, and not one of them may have reached stage 5.
    if (holder.user === undefined) throw new Error("fixture missing");
    const { auditCount } = await import("./harness");
    expect(await auditCount(holder.user.id)).toBe(0);
  });
});

describe("the one endpoint that authorizes outside mutate() still authenticates", () => {
  it("markMessageReadAction refuses an anonymous caller", async () => {
    signOut();
    const { markMessageReadAction } = await import("@/lib/modules/messages/actions");

    const result = refusalOf(await markMessageReadAction({ id: 1 }));

    expect(result.status).toBe(401);
  });

  it("markMessageReadAction refuses an admin without contact:view", async () => {
    await fixture({ permissions: [["home", "edit"]] });
    const { markMessageReadAction } = await import("@/lib/modules/messages/actions");

    const result = refusalOf(await markMessageReadAction({ id: 1 }));

    expect(result.status).toBe(403);
  });

  it("validates before it authenticates — recorded, not asserted as correct", async () => {
    // The deviation this sweep had to work around. `mutate()` authenticates
    // first, so an anonymous caller with a malformed payload learns nothing;
    // this endpoint parses first and answers 422, naming a schema field to
    // someone who has not proved who they are.
    //
    // It leaks the shape of a one-field schema (`{ id }`) and nothing else, and
    // no write happens either way — so this is pinned as the current behaviour
    // rather than filed as a defect. If the ordering is ever brought in line,
    // this assertion is what will notice.
    signOut();
    const { markMessageReadAction } = await import("@/lib/modules/messages/actions");

    const result = refusalOf(await markMessageReadAction({ nonsense: true }));

    expect(result.status).toBe(422);
    expect(result.stage).toBe("validate");
  });
});
