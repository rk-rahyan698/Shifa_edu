/**
 * Consent checks (T-111 Do list item 3; ARCHITECTURE.md §B-7, §B-10, §B-12,
 * §B-16 Exception-adjacent "explicitly not exceptions", and 0015_constraints).
 *
 * Four CHECK constraints, one per consent-bearing entity, all shaped the same
 * way ck_faculty_photo_consent has been since T-015: assert the not-public
 * state OR the consent column being non-NULL.
 *
 *   | Constraint                     | Table              | "Public" means        |
 *   |---------------------------------|--------------------|------------------------|
 *   | `ck_faculty_photo_consent`      | `faculty`          | `photo_media_id` set   |
 *   | `ck_faculty_publish_consent`    | `faculty`          | `status_code='published'` |
 *   | `ck_committee_publish_consent`  | `committee_members`| `is_active`            |
 *   | `ck_photo_subject_consent`      | `gallery_photos`   | `is_active`            |
 *
 * Each gets three cases, straight from 0015's own contract comment
 * ("WITHDRAWING CONSENT UNPUBLISHES"):
 *
 *   1. A row cannot be INSERTed already in the violating state.
 *   2. Clearing consent in an UPDATE that leaves the row public is refused —
 *      the gap between "consent cleared" and "unpublished" cannot exist for
 *      even the width of a transaction, because a CHECK evaluates at the end
 *      of the statement that touched the row, not the transaction.
 *   3. Clearing consent AND unpublishing in the SAME statement is accepted —
 *      that is the only sequence 0015 leaves available, deliberately: there
 *      is no "clear consent, then unpublish" two-step admin flow.
 *
 * These CHECKs do not make T-113's content/ethics gate redundant (0015's own
 * comment): a CHECK sees one row's own columns, so it cannot see a publication
 * path that renders an entity without consulting the column it guards — a
 * preview route, an unfiltered query, an album cover, a cached page. This
 * suite only proves the row-level guarantee holds; T-113 covers the rest.
 */

import { beforeAll, describe, expect, test } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  bootstrapTestEnv,
  expectDbFailure,
  insertMediaAsset,
  SQLSTATE,
  tagged,
  withRollbackTx,
} from "./harness";

beforeAll(bootstrapTestEnv);

async function insertDesignation(tx: Prisma.TransactionClient): Promise<bigint> {
  const code = tagged("designation");
  const [row] = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO designations (code) VALUES (${code}) RETURNING id`;
  if (!row) throw new Error("insertDesignation: no row returned");
  return row.id;
}

async function insertGalleryAlbum(tx: Prisma.TransactionClient): Promise<bigint> {
  const [category] = await tx.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM gallery_categories LIMIT 1`;
  if (!category) throw new Error("insertGalleryAlbum: no seeded gallery_categories row to hang off");
  const [row] = await tx.$queryRaw<{ id: bigint }[]>`
    INSERT INTO gallery_albums (gallery_category_id) VALUES (${category.id}) RETURNING id`;
  if (!row) throw new Error("insertGalleryAlbum: no row returned");
  return row.id;
}

describe("ck_faculty_photo_consent — faculty.photo_media_id needs photo_consent_at", () => {
  test("cannot INSERT a photo with no photo consent", async () => {
    const error = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      const mediaId = await insertMediaAsset(tx);
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO faculty (designation_id, photo_media_id, photo_consent_at)
        VALUES (${designationId}, ${mediaId}, NULL)`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_faculty_photo_consent");
  });

  test("clearing photo_consent_at alone is refused (photo stays attached)", async () => {
    const error = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      const mediaId = await insertMediaAsset(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO faculty (designation_id, photo_media_id, photo_consent_at)
        VALUES (${designationId}, ${mediaId}, now()) RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        UPDATE faculty SET photo_consent_at = NULL WHERE id = ${row?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_faculty_photo_consent");
  });

  test("clearing photo_consent_at AND detaching the photo, together, is accepted", async () => {
    const stillPresent = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      const mediaId = await insertMediaAsset(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO faculty (designation_id, photo_media_id, photo_consent_at)
        VALUES (${designationId}, ${mediaId}, now()) RETURNING id`;
      await tx.$executeRaw`
        UPDATE faculty SET photo_consent_at = NULL, photo_media_id = NULL WHERE id = ${row?.id}`;
      const [after] = await tx.$queryRaw<{ photo_media_id: bigint | null }[]>`
        SELECT photo_media_id FROM faculty WHERE id = ${row?.id}`;
      return after?.photo_media_id;
    });
    expect(stillPresent).toBeNull();
  });
});

describe("ck_faculty_publish_consent — a published profile needs publish_consent_at", () => {
  test("cannot INSERT status_code = 'published' with no publish consent", async () => {
    const error = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO faculty (designation_id, status_code, publish_consent_at)
        VALUES (${designationId}, 'published', NULL)`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_faculty_publish_consent");
  });

  test("clearing publish_consent_at alone is refused (status stays published)", async () => {
    const error = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO faculty (designation_id, status_code, publish_consent_at)
        VALUES (${designationId}, 'published', now()) RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        UPDATE faculty SET publish_consent_at = NULL WHERE id = ${row?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_faculty_publish_consent");
  });

  test("clearing publish_consent_at AND reverting to draft, together, is accepted", async () => {
    const statusAfter = await withRollbackTx(async (tx) => {
      const designationId = await insertDesignation(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO faculty (designation_id, status_code, publish_consent_at)
        VALUES (${designationId}, 'published', now()) RETURNING id`;
      await tx.$executeRaw`
        UPDATE faculty SET publish_consent_at = NULL, status_code = 'draft' WHERE id = ${row?.id}`;
      const [after] = await tx.$queryRaw<{ status_code: string }[]>`
        SELECT status_code FROM faculty WHERE id = ${row?.id}`;
      return after?.status_code;
    });
    expect(statusAfter).toBe("draft");
  });
});

describe("ck_committee_publish_consent — an active committee entry needs publish_consent_at", () => {
  test("cannot INSERT is_active (default TRUE) with no publish consent", async () => {
    const error = await withRollbackTx((tx) =>
      expectDbFailure(() => tx.$executeRaw`INSERT INTO committee_members DEFAULT VALUES`),
    );
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_committee_publish_consent");
  });

  test("clearing publish_consent_at alone is refused (member stays active)", async () => {
    const error = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO committee_members (publish_consent_at) VALUES (now()) RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        UPDATE committee_members SET publish_consent_at = NULL WHERE id = ${row?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_committee_publish_consent");
  });

  test("clearing publish_consent_at AND deactivating, together, is accepted", async () => {
    const activeAfter = await withRollbackTx(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO committee_members (publish_consent_at) VALUES (now()) RETURNING id`;
      await tx.$executeRaw`
        UPDATE committee_members SET publish_consent_at = NULL, is_active = FALSE
        WHERE id = ${row?.id}`;
      const [after] = await tx.$queryRaw<{ is_active: boolean }[]>`
        SELECT is_active FROM committee_members WHERE id = ${row?.id}`;
      return after?.is_active;
    });
    expect(activeAfter).toBe(false);
  });
});

describe("ck_photo_subject_consent — an active gallery photo needs subject_consent_at", () => {
  test("cannot INSERT is_active (default TRUE) with no subject consent", async () => {
    const error = await withRollbackTx(async (tx) => {
      const albumId = await insertGalleryAlbum(tx);
      const mediaId = await insertMediaAsset(tx);
      return expectDbFailure(() => tx.$executeRaw`
        INSERT INTO gallery_photos (gallery_album_id, media_id) VALUES (${albumId}, ${mediaId})`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_photo_subject_consent");
  });

  test("clearing subject_consent_at alone is refused (photo stays active)", async () => {
    const error = await withRollbackTx(async (tx) => {
      const albumId = await insertGalleryAlbum(tx);
      const mediaId = await insertMediaAsset(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_photos (gallery_album_id, media_id, subject_consent_at)
        VALUES (${albumId}, ${mediaId}, now()) RETURNING id`;
      return expectDbFailure(() => tx.$executeRaw`
        UPDATE gallery_photos SET subject_consent_at = NULL WHERE id = ${row?.id}`);
    });
    expect(error.sqlstate).toBe(SQLSTATE.CHECK_VIOLATION);
    expect(error.message).toContain("ck_photo_subject_consent");
  });

  test("clearing subject_consent_at AND deactivating, together, is accepted", async () => {
    const activeAfter = await withRollbackTx(async (tx) => {
      const albumId = await insertGalleryAlbum(tx);
      const mediaId = await insertMediaAsset(tx);
      const [row] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_photos (gallery_album_id, media_id, subject_consent_at)
        VALUES (${albumId}, ${mediaId}, now()) RETURNING id`;
      await tx.$executeRaw`
        UPDATE gallery_photos SET subject_consent_at = NULL, is_active = FALSE
        WHERE id = ${row?.id}`;
      const [after] = await tx.$queryRaw<{ is_active: boolean }[]>`
        SELECT is_active FROM gallery_photos WHERE id = ${row?.id}`;
      return after?.is_active;
    });
    expect(activeAfter).toBe(false);
  });
});
