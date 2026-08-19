/**
 * RESTRICT refusals (T-111 Do list item 4; ARCHITECTURE.md §B-3 "deletion is
 * RESTRICT by default", and every lookup FK in Parts B-3/B-6/B-8/B-9/B-11/B-12).
 *
 * A category, designation, fee type or grade that a live row still points to
 * must refuse deletion rather than cascade it away — cascading a
 * `notice_categories` delete would silently delete every notice in it, which
 * is never what "delete this category" meant. Part B's lookup FKs are RESTRICT
 * by convention (§B-3's own header comment), and this file proves a
 * representative one from each of six tables actually fires: `faculty`,
 * `notices`, `gallery_albums`, `gallery_photos`, `fee_items`, `class_sections`.
 * The pattern is identical for every other RESTRICT FK in Part B — same
 * shape, same SQLSTATE, same "child row still exists" cause — the same way
 * §B-15's normalization proof documents representative cases and states that
 * the pattern generalizes rather than re-deriving it table by table.
 *
 * The admin UI's obligation to *name* the blocking records for the editor
 * (BATCH-MODEL-PLAN.md B-3) is an application-layer contract on top of this,
 * built in T-063/T-064 — out of scope here. What this file proves is the
 * database-level guarantee those screens are built on: the delete cannot
 * succeed at all while a child row exists, regardless of what the UI says.
 *
 * The SQLSTATE every case below asserts is `23001` (restrict_violation), not
 * the more commonly quoted `23503` (foreign_key_violation) — confirmed
 * empirically against this PostgreSQL version: `23503` is what an INSERT or
 * UPDATE gets for pointing at a row that does not exist, while an `ON DELETE
 * RESTRICT` refusal specifically carries its own, more precise code.
 *
 * The last case is a deliberate contrast, not a sixth repetition: deleting a
 * `media_assets` row a `faculty` photo points to is SET NULL, not RESTRICT
 * (§B-7) — proving RESTRICT fires only where Part B actually specifies it,
 * not everywhere a foreign key exists.
 */

import { beforeAll, describe, expect, test } from "vitest";

import {
  bootstrapTestEnv,
  expectDbFailure,
  insertMediaAsset,
  SQLSTATE,
  tagged,
  withRollbackTx,
} from "./harness";

beforeAll(bootstrapTestEnv);

describe("RESTRICT — a referenced lookup row cannot be deleted out from under a child", () => {
  test("faculty_designation_id_fkey: a designation with a faculty row cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [designation] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO designations (code) VALUES (${tagged("designation")}) RETURNING id`;
      await tx.$executeRaw`INSERT INTO faculty (designation_id) VALUES (${designation?.id})`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM designations WHERE id = ${designation?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("faculty_designation_id_fkey");
  });

  test("notices_notice_category_id_fkey: a category with a notice cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO notice_categories (code) VALUES (${tagged("category")}) RETURNING id`;
      await tx.$executeRaw`INSERT INTO notices (notice_category_id) VALUES (${category?.id})`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM notice_categories WHERE id = ${category?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("notices_notice_category_id_fkey");
  });

  test("gallery_albums_gallery_category_id_fkey: a category with an album cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_categories (code) VALUES (${tagged("category")}) RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO gallery_albums (gallery_category_id) VALUES (${category?.id})`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM gallery_categories WHERE id = ${category?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("gallery_albums_gallery_category_id_fkey");
  });

  test("gallery_photos_gallery_album_id_fkey: an album with a photo cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_categories (code) VALUES (${tagged("category")}) RETURNING id`;
      const [album] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_albums (gallery_category_id) VALUES (${category?.id}) RETURNING id`;
      const mediaId = await insertMediaAsset(tx);
      await tx.$executeRaw`
        INSERT INTO gallery_photos (gallery_album_id, media_id, subject_consent_at)
        VALUES (${album?.id}, ${mediaId}, now())`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM gallery_albums WHERE id = ${album?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("gallery_photos_gallery_album_id_fkey");
  });

  test("fee_items_fee_type_id_fkey: a fee type with a fee item cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [grade, year] = await Promise.all([
        tx.$queryRaw<{ id: bigint }[]>`SELECT id FROM class_grades LIMIT 1`,
        tx.$queryRaw<{ id: bigint }[]>`
          INSERT INTO academic_years (code, starts_on, ends_on, is_current)
          VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`,
      ]);
      const [feeType] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO fee_types (code) VALUES (${tagged("fee_type")}) RETURNING id`;
      const [structure] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO fee_structures (class_grade_id, academic_year_id)
        VALUES (${grade[0]?.id}, ${year[0]?.id}) RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO fee_items (fee_structure_id, fee_type_id, amount)
        VALUES (${structure?.id}, ${feeType?.id}, 100)`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM fee_types WHERE id = ${feeType?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("fee_items_fee_type_id_fkey");
  });

  test("class_sections_class_grade_id_fkey: a grade with a section cannot be deleted", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [year] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO academic_years (code, starts_on, ends_on, is_current)
        VALUES (${tagged("year")}, '2026-01-01', '2026-12-31', FALSE) RETURNING id`;
      const [grade] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO class_grades (code) VALUES (${tagged("grade")}) RETURNING id`;
      await tx.$executeRaw`
        INSERT INTO class_sections (class_grade_id, academic_year_id, name)
        VALUES (${grade?.id}, ${year?.id}, 'A')`;
      return expectDbFailure(() => tx.$executeRaw`
        DELETE FROM class_grades WHERE id = ${grade?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.RESTRICT_VIOLATION);
    expect(error.message).toContain("class_sections_class_grade_id_fkey");
  });
});

describe("contrast — not every FK is RESTRICT", () => {
  test("faculty_photo_media_id_fkey: deleting the photo's media asset is SET NULL, not RESTRICT", async () => {
    const photoMediaIdAfter = await withRollbackTx(async (tx) => {
      const [designation] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO designations (code) VALUES (${tagged("designation")}) RETURNING id`;
      const mediaId = await insertMediaAsset(tx);
      const [faculty] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO faculty (designation_id, photo_media_id, photo_consent_at)
        VALUES (${designation?.id}, ${mediaId}, now()) RETURNING id`;

      // Must not throw — SET NULL, unlike the six RESTRICT cases above.
      await tx.$executeRaw`DELETE FROM media_assets WHERE id = ${mediaId}`;

      const [after] = await tx.$queryRaw<{ photo_media_id: bigint | null }[]>`
        SELECT photo_media_id FROM faculty WHERE id = ${faculty?.id}`;
      return after?.photo_media_id;
    });
    expect(photoMediaIdAfter).toBeNull();
  });
});
