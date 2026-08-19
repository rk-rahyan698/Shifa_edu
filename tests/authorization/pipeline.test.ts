/**
 * T-110 — "a test asserting every Server Action goes through `mutate()`".
 *
 * The write pipeline is only a control if it cannot be walked around. Every
 * guarantee §A-5.1 makes — authorize before validate, persist and audit in one
 * transaction, invalidate afterwards — is a guarantee about `mutate()`, and an
 * action that writes without it inherits none of them while looking exactly like
 * one that does.
 *
 * `every-endpoint.test.ts` already proves the *behaviour* (every endpoint
 * refuses 401 then 403). This file proves the *shape*, which catches the case
 * behaviour cannot: an action that happens to authorize correctly today by
 * hand-rolling the checks, and drifts from `assertCan` tomorrow.
 *
 * ## How the trace works
 *
 * Actions are not written as `export const x = defineMutation(...)`. The house
 * style is a private binding plus a thin exported wrapper:
 *
 * ```ts
 * const addNotice = defineMutation({ … });
 * export async function saveNoticeAction(input: unknown) {
 *   return runAction(() => addNotice(input));
 * }
 * ```
 *
 * and `admission` adds a layer — `const steps = defineCrud({ … })`, where
 * `defineCrud` is a local factory returning `{ add, edit, remove }`, each a
 * `defineMutation`. So the check resolves in two passes: collect the bindings
 * that *are* pipeline entry points (directly, or through a local factory that
 * builds them), then require every exported action's body to reach one.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Every non-test `.ts` under `src`, as `{ path, source }`. */
function sourceFiles(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push({ path: full.split("\\").join("/"), source: readFileSync(full, "utf8") });
    }
  }
  return out;
}

const serverFiles = sourceFiles("src").filter((f) =>
  /^["']use server["']/m.test(f.source),
);

/**
 * The bindings in one file that are pipeline entry points.
 *
 * Pass 1: `const x = defineMutation(...)`.
 * Pass 2: `const x = someLocalFactory(...)`, where that factory's own body
 * contains `defineMutation` — the `defineCrud` shape.
 */
function pipelineBindings(source: string): Set<string> {
  const bindings = new Set<string>();

  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*defineMutation\s*\(/g)) {
    if (m[1] !== undefined) bindings.add(m[1]);
  }

  const factories = new Set<string>();
  for (const m of source.matchAll(/function\s+(\w+)\s*[<(]/g)) {
    const name = m[1];
    if (name === undefined) continue;
    const body = source.slice(m.index ?? 0);
    // The factory's own text, up to the next top-level `function`/`export`.
    const end = body.slice(1).search(/\n(?:export |function )/);
    const scoped = end === -1 ? body : body.slice(0, end + 1);
    if (/\bdefineMutation\s*\(/.test(scoped)) factories.add(name);
  }

  for (const factory of factories) {
    const re = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${factory}\\s*\\(`, "g");
    for (const m of source.matchAll(re)) {
      if (m[1] !== undefined) bindings.add(m[1]);
    }
  }

  return bindings;
}

/** The body text of one exported async function, brace-matched. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * The one endpoint that authorizes outside the pipeline, and why it is allowed.
 *
 * `markMessageReadAction` stamps `read_at` / `read_by_user_id` on a contact
 * message. §A-5.2 gives the `contact` module only `view` and `delete`, and
 * `mutate()` refuses `view` outright ("mutate() is for writes") — so carrying
 * the read receipt through the pipeline would need an action code that does not
 * exist, which means a `module_actions` row and a schema change. T-068 recorded
 * that reasoning in its module header and wrote the stamp by hand instead.
 *
 * It is exempt from the *pipeline* requirement, not from authorization: it
 * calls the same `assertCan` every other path does, against `contact:view`, and
 * `every-endpoint.test.ts` proves it refuses 401 and 403 like everything else.
 * It writes no `activity_logs` row, deliberately — the two columns it sets are
 * themselves the access record §B-13 exists to hold.
 *
 * **This list is asserted to have exactly one entry.** A second exception
 * cannot be added without editing this constant, which is the point.
 */
const PIPELINE_EXCEPTIONS: Readonly<Record<string, string>> = {
  markMessageReadAction:
    "contact:view read stamp — mutate() refuses `view`; authorizes via assertCan (T-068)",
};

describe("the write pipeline cannot be walked around", () => {
  it("finds every `use server` module", () => {
    // Eleven module action files. A drop here means the glob stopped matching
    // and every assertion below would pass over an empty set.
    expect(serverFiles.length).toBeGreaterThanOrEqual(11);
    expect(serverFiles.every((f) => f.path.includes("/lib/modules/"))).toBe(true);
  });

  it("every `use server` module imports the pipeline", () => {
    for (const file of serverFiles) {
      expect(file.source, `${file.path} does not import @/lib/mutate`).toMatch(
        /from "@\/lib\/mutate"/,
      );
    }
  });

  it("every exported Server Action reaches defineMutation() or mutate()", () => {
    const offenders: string[] = [];
    let checked = 0;

    for (const file of serverFiles) {
      const bindings = pipelineBindings(file.source);
      const exported = [...file.source.matchAll(/export async function (\w+)/g)]
        .map((m) => m[1])
        .filter((n): n is string => n !== undefined && n.endsWith("Action"));

      for (const name of exported) {
        checked++;
        if (name in PIPELINE_EXCEPTIONS) continue;

        const body = functionBody(file.source, name);
        const reachesBinding = [...bindings].some((b) =>
          new RegExp(`\\b${b}\\b`).test(body),
        );
        const callsMutate = /\bmutate\s*\(/.test(body);

        if (!reachesBinding && !callsMutate) {
          offenders.push(`${file.path} :: ${name}`);
        }
      }
    }

    expect(checked).toBeGreaterThanOrEqual(80);
    expect(offenders, "Server Actions bypassing the write pipeline").toEqual([]);
  });

  it("has exactly one documented exception, and it is the contact read stamp", () => {
    // The guard on the guard. Exempting a second endpoint should require
    // editing this file and justifying it in review, never a quiet addition.
    expect(Object.keys(PIPELINE_EXCEPTIONS)).toEqual(["markMessageReadAction"]);
  });

  it("the exception still authorizes through the shared engine", () => {
    const messages = serverFiles.find((f) => f.path.includes("modules/messages/"));
    expect(messages).toBeDefined();
    // Not a hand-rolled role comparison: the same `assertCan` §A-9.3 makes the
    // single authorization function.
    expect(messages?.source).toMatch(/assertCan\(\s*user,\s*"contact",\s*"view"\s*\)/);
    expect(messages?.source).not.toMatch(/roleCode\s*===\s*["']super_admin["']/);
  });
});

/**
 * These four assertions are static, and deliberately so.
 *
 * T-110's Verify asks that "deliberately removing one permission check makes the
 * suite fail", and running that experiment turned up something worth pinning:
 * for two of the boundaries it does **not**, because removing one check does not
 * breach them. Blanking `hasSpecialGrant` leaves branding locked, because
 * `assertStillAuthorized` re-reads `user_special_grants` inside the transaction.
 * Blanking the users module's `requireSuperAdmin` changes nothing, because
 * `can()` already refuses an action `users` does not declare and the
 * in-transaction check finds no row either. Both had to be sabotaged at every
 * layer at once before the suite went red — which it then did, precisely and
 * only on the row that owns that boundary.
 *
 * That redundancy is a feature (§A-12's layered controls, and the TOCTOU window
 * between authorizing and writing), but it is invisible to behavioural tests by
 * construction: a layer you can delete without changing any outcome is a layer
 * no black-box assertion can see. So the layers are asserted structurally here.
 * Delete one and this fails, even though nothing observable would have.
 */
describe("defence in depth — the redundant checks behaviour cannot see", () => {
  const mutateSource = readFileSync("src/lib/mutate.ts", "utf8");
  const usersSource = readFileSync("src/lib/modules/users/actions.ts", "utf8");

  it("re-authorizes inside the write transaction, not only before it", () => {
    // Stage 2 decides on a permission set loaded before the transaction opened.
    // A grant revoked in between would otherwise be honoured for one more write.
    expect(mutateSource).toMatch(/async function assertStillAuthorized/);
    expect(mutateSource).toMatch(/await assertStillAuthorized\(tx, user, options\)/);
  });

  it("the in-transaction check reads the rows itself rather than trusting the session", () => {
    const body = mutateSource.slice(
      mutateSource.indexOf("async function assertStillAuthorized"),
    );
    expect(body).toMatch(/FROM user_module_permissions/);
    expect(body).toMatch(/FROM user_special_grants/);
    expect(body).toMatch(/u\.is_active/);
  });

  it("suspension outranks the super-admin bypass in both implementations", () => {
    // `can()` checks `isActive` before the bypass; so must the SQL copy, or a
    // suspended super admin would still write. Asserted in both places because
    // this is the one ordering that two copies could silently disagree about.
    const permissions = readFileSync("src/lib/permissions.ts", "utf8");
    const canBody = permissions.slice(permissions.indexOf("export function can("));
    expect(canBody.indexOf("isActive")).toBeLessThan(canBody.indexOf("SUPER_ADMIN_ROLE"));

    const stillBody = mutateSource.slice(
      mutateSource.indexOf("async function assertStillAuthorized"),
    );
    expect(stillBody.indexOf("!row.is_active")).toBeLessThan(
      stillBody.indexOf("row.role_code === SUPER_ADMIN_ROLE"),
    );
  });

  it("the users module keeps its own guard on top of the two shared ones", () => {
    expect(usersSource).toMatch(/function requireSuperAdmin/);
    expect(usersSource).toMatch(/roleCode !== SUPER_ADMIN_ROLE/);
    // And every mutation in the file actually calls it.
    const calls = usersSource.match(/requireSuperAdmin\(user\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("this suite's own Contract — it blocks CI and is never skipped", () => {
  const suiteFiles = readdirSync("tests/authorization")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ f, source: readFileSync(join("tests/authorization", f), "utf8") }));

  it("has all four specs plus the harness", () => {
    expect(suiteFiles.map((s) => s.f).sort()).toEqual([
      "every-endpoint.test.ts",
      "harness.ts",
      "isolation.test.ts",
      "matrix.test.ts",
      "pipeline.test.ts",
    ]);
  });

  it("marks nothing `.skip`, `.todo` or `.only`", () => {
    // T-110's Contract, enforced by the suite on itself rather than by review.
    // `.only` is included because it is the quiet one: it does not disable a
    // test, it disables every *other* test in the file, and CI stays green.
    const offenders: string[] = [];
    for (const { f, source } of suiteFiles) {
      for (const banned of [
        /\b(?:describe|it|test)\.skip\b/,
        /\b(?:describe|it|test)\.todo\b/,
        /\b(?:describe|it|test)\.only\b/,
      ]) {
        if (banned.test(source)) offenders.push(`${f} :: ${banned.source}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is collected by the runner the CI job invokes", () => {
    // `ci.yml` runs `npm test` → `vitest run`, and the config's `include` is
    // what decides whether this directory is part of that. If the glob is ever
    // narrowed to `src/**`, this suite would stop running and CI would stay
    // green — the exact silent failure the Contract exists to prevent.
    const config = readFileSync("vitest.config.ts", "utf8");
    expect(config).toMatch(/tests\/\*\*\/\*\.\{test,spec\}/);

    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toMatch(/npm test/);
  });
});

describe("the pipeline's own order is what the sweep depends on", () => {
  it("authenticates, then authorizes, then validates", async () => {
    // `every-endpoint.test.ts` sends `{}` to ninety-odd endpoints and expects
    // 401/403 rather than 422. That shortcut is only sound because stage order
    // puts both authorization stages ahead of validation — asserted here from
    // the pipeline's declared stage list rather than assumed.
    const { PIPELINE_STAGES } = await import("@/lib/mutate");

    const order = [...PIPELINE_STAGES];
    expect(order.indexOf("authenticate")).toBeLessThan(order.indexOf("authorize"));
    expect(order.indexOf("authorize")).toBeLessThan(order.indexOf("validate"));
    expect(order.indexOf("validate")).toBeLessThan(order.indexOf("persist"));
  });

  it("refuses to carry a `view` action at all", async () => {
    // Why the one exception exists. `mutate()` is for writes; a module whose
    // only read-ish action is `view` cannot route a stamp through it.
    const { mutate } = await import("@/lib/mutate");
    const { z } = await import("zod");

    await expect(
      mutate(
        {
          module: "contact",
          action: "view",
          schema: z.object({}).strict(),
          handler: async () => ({ data: null }),
        },
        {},
      ),
    ).rejects.toThrow(/for writes/);
  });
});
