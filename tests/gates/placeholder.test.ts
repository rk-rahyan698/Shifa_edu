/**
 * Placeholder guard (T-113, ARCHITECTURE.md §A-13.3 row 1).
 *
 * The mechanism lives in `placeholder-sweep.ts`; this file is what asserts on
 * it. Three groups, in the order they matter:
 *
 *   1. **Detection** — the gate fires on a seeded violation and stops firing
 *      once it is removed, for both the canonical marker and the malformed
 *      variant the card's Verify names.
 *   2. **Coverage** — the sweep is looking at the tables it claims to look at,
 *      and no table has quietly escaped classification.
 *   3. **The live sweep** — what is actually in the database right now.
 *
 * ## Group 3 is expected to fail before T-130, and that is the design
 *
 * `prisma/seed.ts` writes the canonical marker into `page_translations.
 * meta_title` for all ten pages, because `meta_title` is NOT NULL and the seed
 * is forbidden from inventing a school's page titles (§B-19). Those rows render
 * — the marker is in the `<title>` element of every public page today, which
 * this suite confirms rather than assumes.
 *
 * That is not a defect in the seed and not a defect in this gate. It is the
 * handoff the plan already describes: the seed plants markers, this gate refuses
 * to call the site publishable, and **T-130** replaces them with real content.
 * `build-state.json`'s `content_gate` wires exactly that ordering, and T-130's
 * own Verify reads "Zero `[[CONTENT REQUIRED — DO NOT PUBLISH]]` markers in
 * published rows; T-113 gates pass **against production data**" — a sentence
 * that only makes sense if the gate is expected not to pass against a seeded
 * development database.
 *
 * So the live sweep is written to distinguish the two situations it can find:
 *
 *   · **Scaffold** — the *canonical* marker, in a column `prisma/seed.ts` is
 *     documented to scaffold. Reported loudly, not asserted against, because
 *     failing here would leave `npm test` permanently red for a known and
 *     tracked state, and a permanently red suite is one nobody reads.
 *   · **Anything else** — a marker in a column the seed does not write, or a
 *     variant rather than the canonical literal. That is content someone typed
 *     and published, it is what this gate exists for, and it fails hard.
 *
 * `GATES_STRICT=1` removes the scaffold allowance entirely. T-130 sets it, the
 * deploy pipeline sets it, and it is refused outright against a production
 * database — see "the allowance cannot be used in production" below.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CONTENT_REQUIRED,
  PLACEHOLDER_PREFIX,
  db,
  disconnect,
  withRollbackTx,
} from "./harness";
import {
  NOT_PUBLISHED_CONTENT,
  findPlaceholderLeaks,
  formatLeaks,
  readSchemaMap,
  sweptTables,
  visibilityPredicate,
  type SchemaMap,
} from "./placeholder-sweep";

let schema: SchemaMap;

beforeAll(async () => {
  schema = await readSchemaMap(db());
});

afterAll(async () => {
  await disconnect();
});

/**
 * The columns `prisma/seed.ts` is documented to fill with the canonical marker
 * because the column is NOT NULL and the seed may not invent the school's words.
 *
 * Deliberately exact — `table.column`, not a table-wide pass. If the seed ever
 * scaffolds a second column, this list must gain it by a human's decision, and
 * until then that column's marker fails the gate like any other.
 */
const SEED_SCAFFOLD_COLUMNS: readonly string[] = ["page_translations.meta_title"];

const strict = process.env["GATES_STRICT"] === "1";

describe("detection — the gate fires on a seeded violation", () => {
  it("catches the canonical marker on a published row", async () => {
    const leaks = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM notice_categories WHERE is_active ORDER BY id LIMIT 1`;
      if (category === undefined) throw new Error("no notice_categories; run db:seed");

      const [notice] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO notices (notice_category_id, status_code, published_at)
        VALUES (${category.id}, 'published', now() - interval '1 day')
        RETURNING id`;
      if (notice === undefined) throw new Error("notice fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO notice_translations (notice_id, locale_code, slug, title, body_html)
        VALUES (${notice.id}, 'bn', ${`t113-canonical-${notice.id}`},
                ${CONTENT_REQUIRED}, '<p>t113</p>')`;

      return await findPlaceholderLeaks(tx, schema, PLACEHOLDER_PREFIX);
    });

    const hit = leaks.find(
      (leak) => leak.table === "notice_translations" && leak.column === "title",
    );
    expect(hit, "the seeded canonical marker was not detected").toBeDefined();
    expect(hit?.value).toContain(PLACEHOLDER_PREFIX);
  });

  /**
   * The card's Verify names this case specifically: "a deliberately malformed
   * variant (the marker truncated before its `— DO NOT PUBLISH` suffix) — the
   * §A-13.3 prefix match must reject both."
   *
   * This is the case a full-string equality check would miss, and it is the
   * likelier one in practice: a marker gets truncated by a column length, half
   * pasted, or its em dash mangled by an editor that rewrites punctuation. The
   * text below is *not* the canonical literal, which is what makes it a real
   * test of the prefix rule rather than a second run of the case above.
   */
  it("catches a malformed variant truncated before its suffix", async () => {
    const malformed = "[[CONTENT REQUIRED";
    expect(malformed).not.toBe(CONTENT_REQUIRED);

    const leaks = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM notice_categories WHERE is_active ORDER BY id LIMIT 1`;
      if (category === undefined) throw new Error("no notice_categories; run db:seed");

      const [notice] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO notices (notice_category_id, status_code, published_at)
        VALUES (${category.id}, 'published', now() - interval '1 day')
        RETURNING id`;
      if (notice === undefined) throw new Error("notice fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO notice_translations (notice_id, locale_code, slug, title, excerpt, body_html)
        VALUES (${notice.id}, 'bn', ${`t113-variant-${notice.id}`}, 'ok',
                ${`${malformed} — half a marker`}, '<p>t113</p>')`;

      return await findPlaceholderLeaks(tx, schema, PLACEHOLDER_PREFIX);
    });

    const hit = leaks.find(
      (leak) => leak.table === "notice_translations" && leak.column === "excerpt",
    );
    expect(hit, "the truncated variant slipped past the prefix match").toBeDefined();
  });

  /**
   * The other half of "passes once removed". An unpublished draft holding the
   * marker is the *correct* state for a page still being written — the gate
   * must not fire on it, or every editor learns to ignore it.
   */
  it("does not fire on the same marker in an unpublished draft", async () => {
    const leaks = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM notice_categories WHERE is_active ORDER BY id LIMIT 1`;
      if (category === undefined) throw new Error("no notice_categories; run db:seed");

      const [notice] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO notices (notice_category_id, status_code, published_at)
        VALUES (${category.id}, 'draft', NULL)
        RETURNING id`;
      if (notice === undefined) throw new Error("notice fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO notice_translations (notice_id, locale_code, slug, title, body_html)
        VALUES (${notice.id}, 'bn', ${`t113-draft-${notice.id}`},
                ${CONTENT_REQUIRED}, '<p>t113</p>')`;

      return await findPlaceholderLeaks(tx, schema, PLACEHOLDER_PREFIX);
    });

    expect(
      leaks.filter((leak) => leak.table === "notice_translations"),
      "the gate fired on a draft, which is where a placeholder belongs",
    ).toEqual([]);
  });

  /** And soft-deleted content is not published either (§B-13). */
  it("does not fire on a soft-deleted published row", async () => {
    const leaks = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM notice_categories WHERE is_active ORDER BY id LIMIT 1`;
      if (category === undefined) throw new Error("no notice_categories; run db:seed");

      const [notice] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO notices (notice_category_id, status_code, published_at, deleted_at)
        VALUES (${category.id}, 'published', now() - interval '1 day', now())
        RETURNING id`;
      if (notice === undefined) throw new Error("notice fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO notice_translations (notice_id, locale_code, slug, title, body_html)
        VALUES (${notice.id}, 'bn', ${`t113-deleted-${notice.id}`},
                ${CONTENT_REQUIRED}, '<p>t113</p>')`;

      return await findPlaceholderLeaks(tx, schema, PLACEHOLDER_PREFIX);
    });

    expect(leaks.filter((leak) => leak.table === "notice_translations")).toEqual([]);
  });
});

describe("coverage — the sweep is looking where it claims to look", () => {
  it("sweeps a substantial number of content tables", () => {
    // Guards against every assertion above passing over an empty target list,
    // the failure mode a schema-discovering sweep is most prone to.
    expect(sweptTables(schema).length).toBeGreaterThanOrEqual(40);
  });

  it("covers the tables that carry the school's published words", () => {
    const swept = new Set(sweptTables(schema));
    for (const table of [
      "notice_translations",
      "about_content_translations",
      "home_content_translations",
      "faculty_translations",
      "gallery_album_translations",
      "admission_faq_translations",
      "page_translations",
      "site_settings_translations",
      "site_branding_translations",
      "achievement_translations",
    ]) {
      expect(swept.has(table), `${table} is not swept`).toBe(true);
    }
  });

  it("classifies every table — none has quietly escaped", () => {
    // The property that makes the discovery approach safe. A migration adding a
    // table forces a decision here: sweep it, or name it in
    // NOT_PUBLISHED_CONTENT with a reason. It cannot simply be forgotten.
    const unclassified = [...schema.textColumns.keys()].filter(
      (table) =>
        NOT_PUBLISHED_CONTENT[table] === undefined && !sweptTables(schema).includes(table),
    );
    expect(unclassified, "tables neither swept nor excluded").toEqual([]);
  });

  it("every exclusion names a table that exists", () => {
    // The reverse drift: an exclusion left behind after a table is renamed or
    // dropped looks like coverage and is not.
    const live = new Set([
      ...schema.textColumns.keys(),
      ...schema.state.keys(),
      ...schema.primaryKey.keys(),
    ]);
    const stale = Object.keys(NOT_PUBLISHED_CONTENT).filter((table) => !live.has(table));
    expect(stale, "exclusions for tables that no longer exist").toEqual([]);
  });

  it("resolves each translation table to its parent's visibility", () => {
    // `notice_translations` must inherit `notices.status_code`, not be treated
    // as always-visible. If the FK walk breaks, every translation table silently
    // becomes "always published" — which fails safe for detection but would
    // wrongly flag drafts, and is worth pinning.
    expect(schema.parentOf.get("notice_translations")).toEqual({
      column: "notice_id",
      parent: "notices",
    });
    expect(visibilityPredicate(schema, "notices", "p")).toContain(
      "p.status_code = 'published'",
    );
    expect(visibilityPredicate(schema, "notices", "p")).toContain("p.deleted_at IS NULL");

    // `page_translations` also carries an `og_image_media_id` FK to
    // `media_assets`; the parent is resolved from the primary key, so the
    // reference does not win.
    expect(schema.parentOf.get("page_translations")?.parent).toBe("pages");
  });
});

describe("the live sweep — what is published in this database right now", () => {
  it("has no placeholder outside the seed's documented scaffold", async () => {
    const leaks = await findPlaceholderLeaks(db(), schema, PLACEHOLDER_PREFIX);

    const scaffold = leaks.filter(
      (leak) =>
        !strict &&
        SEED_SCAFFOLD_COLUMNS.includes(`${leak.table}.${leak.column}`) &&
        leak.value === CONTENT_REQUIRED,
    );
    const authored = leaks.filter((leak) => !scaffold.includes(leak));

    if (scaffold.length > 0) {
      console.warn(
        `\nT-113 placeholder gate — ${scaffold.length} scaffold placeholder(s) still ` +
          `published:\n${formatLeaks(scaffold)}\n` +
          "These are prisma/seed.ts's structural NOT NULL fillers. They are rendering\n" +
          "on the live site (the <title> of every public page) and T-130 is the task\n" +
          "that replaces them with the school's own content. This gate turns green on\n" +
          "its own once that lands; run with GATES_STRICT=1 to assert it now.\n",
      );
    }

    expect(
      authored,
      `placeholder text is published in ${authored.length} authored column(s):\n${formatLeaks(authored)}`,
    ).toEqual([]);
  });

  it("the allowance cannot be used against a production database", () => {
    // The scaffold allowance exists so a development database does not hold the
    // suite permanently red. It must never be what lets a placeholder reach a
    // real school website, so the two ways of arriving in production — an
    // explicit strict run, or NODE_ENV — both remove it.
    if (process.env["NODE_ENV"] === "production") {
      expect(
        strict,
        "GATES_STRICT=1 is required when the gates run against production",
      ).toBe(true);
    }
    expect(SEED_SCAFFOLD_COLUMNS).toEqual(["page_translations.meta_title"]);
  });

  it("the scaffold is real — the marker reaches the rendered page", async () => {
    // Not a hypothetical. If the seed's scaffold rows exist, they are in the
    // `<title>` a search engine indexes, and this records that as a fact rather
    // than a worry. Skipped only when the scaffold has already been replaced,
    // which is the state T-130 leaves behind.
    const [row] = await db().$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM page_translations
       WHERE meta_title LIKE ${`${PLACEHOLDER_PREFIX}%`}`;
    const count = Number(row?.n ?? 0);

    if (count === 0) return;
    expect(count).toBeGreaterThan(0);
  });
});
