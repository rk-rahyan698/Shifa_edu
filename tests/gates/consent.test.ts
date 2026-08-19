/**
 * Consent gate (T-113, ARCHITECTURE.md §A-13.3 row 3, §A-16.2, risk R12).
 *
 *     Gate          | Fails when
 *     Consent guard | A faculty profile renders without `publish_consent_at`
 *                   | (or a photo without `photo_consent_at`)
 *
 * The card widens that row to **all three consent-bearing entities** and names
 * them: faculty profiles (`publish_consent_at`, `photo_consent_at`), committee
 * members (`publish_consent_at`) and gallery photos (`subject_consent_at`).
 *
 * ## Why this is the gate the card cares most about
 *
 * The other gates protect the school's credibility. This one protects people.
 * A faculty profile is a named human being's face, qualifications and biography
 * on a public website; a gallery photo is very often a child. Consent is the
 * only thing that distinguishes publishing them from exposing them, and unlike
 * a placeholder — which is embarrassing and fixable — a photograph that reached
 * the open internet cannot be recalled from the caches and crawlers that took
 * it.
 *
 * ## Two layers, because the card's Contract says one is not enough
 *
 * > T-025's CHECKs are not a substitute: a CHECK sees one row's own columns, so
 * > it cannot see a publication path that renders an entity without consulting
 * > the column it guards — a preview route, an unfiltered query, an album
 * > cover, a cached page.
 *
 * **Layer 1 — reachability.** Plant each entity in its unconsented state,
 * request the real public page over HTTP, and assert the person is not in the
 * HTML. Then grant consent and assert they are. It does not know or care which
 * query ran, only what a reader receives, which is what the card's Verify asks
 * for in so many words — *"each reached through a public read"*.
 *
 * The second half is not decoration. Without it, "the name is absent" is also
 * what a typo in the fixture, a 500, or an empty page would produce. Proving the
 * same row appears the moment consent is recorded is what makes the absence
 * evidence rather than coincidence.
 *
 * **What Layer 1 can and cannot claim, precisely.** Migration 0015's CHECKs make
 * *publicly visible* and *consented* logically equivalent for all three
 * entities: `is_active = FALSE OR publish_consent_at IS NOT NULL`, and the same
 * shape for the other two. So an unconsented entity can only ever exist in an
 * unpublished state, and no fixture this layer can legally plant separates "the
 * page filtered on consent" from "the page filtered on publication status".
 *
 * That is worth stating plainly rather than letting the layer read as more proof
 * than it is. What it does prove is still exactly the Contract's worry: that the
 * **rendered page honours the entity's publication state**, and therefore — given
 * the CHECK — its consent. An unfiltered query, a preview route or an album
 * cover that reached past that filter would surface the planted row, and this
 * layer would fail. That was confirmed by deliberate sabotage during the build:
 * removing `isActive: true` from the gallery page's query turned the gallery
 * case red while every database-level assertion in this file stayed green — the
 * two layers failing at different things is the point of having both.
 *
 * **Layer 2 — detection.** The genuinely dangerous state — *published* and
 * unconsented — is unreachable while those CHECKs hold, so Layer 2 drops the
 * relevant CHECK inside a transaction that always rolls back, seeds exactly that
 * row, and proves the sweep sees it. That is the future the Contract describes:
 * a migration loosens the constraint, and the gate is the last thing watching.
 *
 * Both locales are checked throughout (§A-7.1, ADR-005: `/faculty` is Bangla,
 * `/en/faculty` is English). Consent is not a per-locale property, and a filter
 * applied in one query and forgotten in the other is precisely the half-fix a
 * single-locale probe would bless.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupGates,
  db,
  disconnect,
  fetchBothLocales,
  marker,
  plantUnconsentedEntities,
  removeFixture,
  startPublicSite,
  stopPublicSite,
  withRollbackTx,
  withoutConstraint,
  type PublicFixture,
} from "./harness";

/** One marker per case, so a leak names the entity that leaked. */
const MARKERS = {
  faculty: marker("FACULTY"),
  committee: marker("COMMITTEE"),
  photo: marker("PHOTO"),
};

let fixture: PublicFixture;

beforeAll(async () => {
  await cleanupGates();
  fixture = await plantUnconsentedEntities(MARKERS);
  await startPublicSite();
}, 300_000);

afterAll(async () => {
  await stopPublicSite();
  if (fixture !== undefined) await removeFixture(fixture);
  await disconnect();
}, 60_000);

describe("reachability — an unconsented entity is not on the public site", () => {
  it("an unconsented faculty profile does not render", async () => {
    const html = await fetchBothLocales("/faculty");
    expect(
      html.includes(MARKERS.faculty),
      "an unconsented faculty profile reached the public faculty page",
    ).toBe(false);
  });

  it("an unconsented committee member does not render", async () => {
    const html = await fetchBothLocales("/about");
    expect(
      html.includes(MARKERS.committee),
      "an unconsented committee member reached the public about page",
    ).toBe(false);
  });

  it("an unconsented gallery photo does not render", async () => {
    // Its album is active, so the photo's own consent state is the only thing
    // keeping it off the page — which is what makes this a consent assertion
    // rather than an album-visibility one.
    const html = await fetchBothLocales("/gallery");
    expect(
      html.includes(MARKERS.photo),
      "an unconsented gallery photo reached the public gallery",
    ).toBe(false);
  });
});

describe("reachability — the probe reaches the render path", () => {
  /**
   * The non-vacuity half. Each case grants consent, confirms the entity now
   * appears, and puts it back — so the absences above are evidence that consent
   * is being consulted, not evidence that the fixture never worked.
   */
  it("the faculty profile appears once consent and publication are recorded", async () => {
    await db().$executeRaw`
      UPDATE faculty SET status_code = 'published', publish_consent_at = now()
       WHERE id = ${fixture.facultyId}`;
    try {
      const html = await fetchBothLocales("/faculty");
      expect(
        html.includes(MARKERS.faculty),
        "the consented profile did not render — the probe is not reaching this page",
      ).toBe(true);
    } finally {
      await db().$executeRaw`
        UPDATE faculty SET status_code = 'draft', publish_consent_at = NULL
         WHERE id = ${fixture.facultyId}`;
    }
  });

  it("the committee member appears once consent is recorded", async () => {
    await db().$executeRaw`
      UPDATE committee_members SET is_active = TRUE, publish_consent_at = now()
       WHERE id = ${fixture.committeeMemberId}`;
    try {
      const html = await fetchBothLocales("/about");
      expect(html.includes(MARKERS.committee)).toBe(true);
    } finally {
      await db().$executeRaw`
        UPDATE committee_members SET is_active = FALSE, publish_consent_at = NULL
         WHERE id = ${fixture.committeeMemberId}`;
    }
  });

  it("the gallery photo appears once subject consent is recorded", async () => {
    await db().$executeRaw`
      UPDATE gallery_photos SET is_active = TRUE, subject_consent_at = now()
       WHERE id = ${fixture.galleryPhotoId}`;
    try {
      const html = await fetchBothLocales("/gallery");
      expect(html.includes(MARKERS.photo)).toBe(true);
    } finally {
      await db().$executeRaw`
        UPDATE gallery_photos SET is_active = FALSE, subject_consent_at = NULL
         WHERE id = ${fixture.galleryPhotoId}`;
    }
  });

  /**
   * Withdrawal, which is the direction that matters most and the one §B-18's
   * own contract is written around: consent given is a decision, consent
   * withdrawn is a demand. The three cases above each restore the unconsented
   * state in their `finally`; this asserts the site actually reflects that.
   */
  it("withdrawing consent removes the entity from the public site again", async () => {
    const html = await fetchBothLocales("/faculty");
    expect(
      html.includes(MARKERS.faculty),
      "a profile stayed published after its consent was withdrawn",
    ).toBe(false);
  });
});

describe("detection — the sweep sees a published unconsented entity", () => {
  /**
   * Every consent case, expressed as the outcome §A-13.3 forbids rather than as
   * the constraint that currently prevents it.
   */
  async function unconsentedPublished(
    tx: Parameters<typeof withoutConstraint>[0],
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ finding: string }[]>`
      SELECT 'faculty:' || id::text AS finding
        FROM faculty
       WHERE status_code = 'published' AND deleted_at IS NULL
         AND publish_consent_at IS NULL
      UNION ALL
      SELECT 'faculty_photo:' || id::text
        FROM faculty
       WHERE status_code = 'published' AND deleted_at IS NULL
         AND photo_media_id IS NOT NULL AND photo_consent_at IS NULL
      UNION ALL
      SELECT 'committee_member:' || id::text
        FROM committee_members
       WHERE is_active AND deleted_at IS NULL AND publish_consent_at IS NULL
      UNION ALL
      SELECT 'gallery_photo:' || id::text
        FROM gallery_photos
       WHERE is_active AND deleted_at IS NULL AND subject_consent_at IS NULL`;
    return rows.map((row) => row.finding);
  }

  it("catches a published faculty profile with no publish consent", async () => {
    const found = await withRollbackTx(async (tx) => {
      await withoutConstraint(tx, "faculty", "ck_faculty_publish_consent");
      const [designation] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM designations WHERE is_active ORDER BY id LIMIT 1`;
      if (designation === undefined) throw new Error("no designations; run db:seed");

      await tx.$executeRaw`
        INSERT INTO faculty (designation_id, status_code, publish_consent_at)
        VALUES (${designation.id}, 'published', NULL)`;

      return await unconsentedPublished(tx);
    });

    expect(found.some((finding) => finding.startsWith("faculty:"))).toBe(true);
  });

  it("catches a published faculty photo with no photo consent", async () => {
    const found = await withRollbackTx(async (tx) => {
      await withoutConstraint(tx, "faculty", "ck_faculty_photo_consent");
      const [designation] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM designations WHERE is_active ORDER BY id LIMIT 1`;
      if (designation === undefined) throw new Error("no designations; run db:seed");

      const [media] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO media_assets (bucket, storage_key, mime_type, byte_size, checksum_sha256)
        VALUES ('public', 't113-photo-consent', 'image/jpeg', 1, 't113-photo-consent')
        RETURNING id`;
      if (media === undefined) throw new Error("media fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO faculty (designation_id, status_code, publish_consent_at,
                             photo_media_id, photo_consent_at)
        VALUES (${designation.id}, 'published', now(), ${media.id}, NULL)`;

      return await unconsentedPublished(tx);
    });

    expect(found.some((finding) => finding.startsWith("faculty_photo:"))).toBe(true);
  });

  it("catches an active committee member with no publish consent", async () => {
    const found = await withRollbackTx(async (tx) => {
      await withoutConstraint(tx, "committee_members", "ck_committee_publish_consent");
      await tx.$executeRaw`
        INSERT INTO committee_members (is_active, publish_consent_at) VALUES (TRUE, NULL)`;
      return await unconsentedPublished(tx);
    });

    expect(found.some((finding) => finding.startsWith("committee_member:"))).toBe(true);
  });

  it("catches an active gallery photo with no subject consent", async () => {
    const found = await withRollbackTx(async (tx) => {
      await withoutConstraint(tx, "gallery_photos", "ck_photo_subject_consent");

      const [category] = await tx.$queryRaw<{ id: bigint }[]>`
        SELECT id FROM gallery_categories WHERE is_active ORDER BY id LIMIT 1`;
      if (category === undefined) throw new Error("no gallery_categories; run db:seed");

      const [media] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO media_assets (bucket, storage_key, mime_type, byte_size, checksum_sha256)
        VALUES ('public', 't113-subject-consent', 'image/jpeg', 1, 't113-subject-consent')
        RETURNING id`;
      if (media === undefined) throw new Error("media fixture was not inserted");

      const [album] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO gallery_albums (gallery_category_id, is_active)
        VALUES (${category.id}, TRUE) RETURNING id`;
      if (album === undefined) throw new Error("album fixture was not inserted");

      await tx.$executeRaw`
        INSERT INTO gallery_photos (gallery_album_id, media_id, is_active, subject_consent_at)
        VALUES (${album.id}, ${media.id}, TRUE, NULL)`;

      return await unconsentedPublished(tx);
    });

    expect(found.some((finding) => finding.startsWith("gallery_photo:"))).toBe(true);
  });

  it("the live database publishes nothing unconsented", async () => {
    const rows = await db().$queryRaw<{ finding: string }[]>`
      SELECT 'faculty:' || id::text AS finding
        FROM faculty
       WHERE status_code = 'published' AND deleted_at IS NULL
         AND publish_consent_at IS NULL
      UNION ALL
      SELECT 'faculty_photo:' || id::text
        FROM faculty
       WHERE status_code = 'published' AND deleted_at IS NULL
         AND photo_media_id IS NOT NULL AND photo_consent_at IS NULL
      UNION ALL
      SELECT 'committee_member:' || id::text
        FROM committee_members
       WHERE is_active AND deleted_at IS NULL AND publish_consent_at IS NULL
      UNION ALL
      SELECT 'gallery_photo:' || id::text
        FROM gallery_photos
       WHERE is_active AND deleted_at IS NULL AND subject_consent_at IS NULL`;

    expect(
      rows.map((row) => row.finding),
      "unconsented people are published on this site",
    ).toEqual([]);
  });
});
