/**
 * DEV-ONLY content fixture — NOT part of the seed (prisma/seed.ts), NOT T-130.
 *
 * T-024's seed deliberately leaves every content table empty (§B-19): a real
 * school's site must never carry invented history, statistics, teachers,
 * photos, or fees. That rule is correct for `prisma/seed.ts`, and this file
 * does not touch it or run as part of it.
 *
 * This script exists for a different, narrower purpose: so the running
 * application can be reviewed end-to-end — every admin CMS screen, every
 * public page, both locales — before the school has supplied real §A-3.1
 * content. Everything it writes is clearly-fictional placeholder content for
 * "Shifa International School" (the identity `prisma/seed.ts` already
 * establishes as confirmed, per §P-2), invented for testing only:
 *
 *   - No real person's personal information appears anywhere.
 *   - Every "photo" is a generated solid-colour PNG, not a real photograph.
 *   - `site_stats`, achievements, fees, the principal's message, etc. are
 *     realistic-looking but explicitly fictional; each stat's `source_note`
 *     says so.
 *   - Faculty/committee "consent" timestamps are stamped only because the
 *     schema's CHECK constraints require one before a row can be marked
 *     active/published — there is no real person to have consented.
 *
 * Running this script does NOT complete T-130 and does NOT change
 * `build-state.json`. T-130 remains blocked on the school's real content.
 * A future real content load should start from a clean database
 * (`prisma migrate reset`, which reseeds via `prisma/seed.ts`) rather than
 * try to edit this fixture data into the real thing.
 *
 * Idempotency: guarded per section (checked by a natural key), so re-running
 * this script after a partial failure does not duplicate rows. It is not
 * transactional across the whole run — each section commits as it completes,
 * so a later failure leaves earlier sections in place rather than rolling
 * everything back.
 *
 * Run:  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/dev-content-fixture.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

const BN = "bn";
const EN = "en";

type Translated = { bn: string; en: string };

// ─────────────────────────────────────────────────────────────
// Tiny local "media" generator — no S3-compatible storage runs in this
// environment, so files are written straight into public/dev-media and
// media_assets/media_variants rows are inserted pointing at them directly,
// bypassing the real upload pipeline (T-037) rather than faking a call to it.
// See PENDING output at the end of this script for exactly what this means.
// ─────────────────────────────────────────────────────────────

const MEDIA_DIR = path.join(process.cwd(), "public", "dev-media");
mkdirSync(MEDIA_DIR, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** A solid-colour PNG. Real image bytes, zero photographic content. */
function makeSolidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A minimal, correctly cross-referenced single-page PDF (English label only). */
function makePdf(label: string): Buffer {
  const objects: string[] = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = `BT /F1 16 Tf 72 720 Td (${label.replace(/[()\\]/g, "")}) Tj ET`;
  objects[5] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = Buffer.byteLength(body, "latin1");
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(body, "latin1");
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  body += xref;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

type MediaRef = { id: bigint; width: number; height: number; mimeType: string };
const mediaCache = new Map<string, MediaRef>();

/**
 * Writes the file to public/dev-media/<slug>.<ext>, and inserts (or reuses) a
 * media_assets row whose storage_key resolves — via STORAGE_PUBLIC_BASE_URL —
 * to that exact static file. See the module header for why this bypasses
 * `src/lib/upload.ts` rather than calling it.
 */
async function registerMedia(
  slug: string,
  buffer: Buffer,
  mimeType: string,
  width: number,
  height: number,
  altText: Translated,
  uploadedByUserId: bigint,
): Promise<MediaRef> {
  const cached = mediaCache.get(slug);
  if (cached) return cached;

  const ext = mimeType === "application/pdf" ? "pdf" : "png";
  const filename = `${slug}.${ext}`;
  const filePath = path.join(MEDIA_DIR, filename);
  if (!existsSync(filePath)) writeFileSync(filePath, buffer);

  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = filename;

  const existing = await prisma.mediaAsset.findFirst({ where: { storageKey } });
  if (existing) {
    const ref = { id: existing.id, width: existing.widthPx ?? width, height: existing.heightPx ?? height, mimeType: existing.mimeType };
    mediaCache.set(slug, ref);
    return ref;
  }

  const created = await prisma.mediaAsset.create({
    data: {
      bucket: "public",
      storageKey,
      originalFilename: filename,
      mimeType,
      byteSize: BigInt(buffer.length),
      widthPx: mimeType === "application/pdf" ? null : width,
      heightPx: mimeType === "application/pdf" ? null : height,
      checksumSha256: checksum,
      uploadedByUserId,
      mediaAssetTranslations: {
        create: [
          { localeCode: BN, altText: altText.bn },
          { localeCode: EN, altText: altText.en },
        ],
      },
    },
  });

  const ref = { id: created.id, width, height, mimeType };
  mediaCache.set(slug, ref);
  return ref;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function toBanglaDigits(value: number | string): string {
  const digits = "০১২৩৪৫৬৭৮৯";
  return String(value).replace(/\d/g, (d) => digits[Number(d)] ?? d);
}

async function idByCode(table: "classGrade" | "classStage" | "designation" | "subject" | "noticeCategory" | "galleryCategory" | "calendarEventType" | "feeType", code: string): Promise<bigint> {
  const row = await (prisma[table] as { findUniqueOrThrow: (args: unknown) => Promise<{ id: bigint }> }).findUniqueOrThrow({ where: { code } });
  return row.id;
}

let sectionsLogged = 0;
function log(section: string, detail?: string): void {
  sectionsLogged += 1;
  console.log(`[${String(sectionsLogged).padStart(2, "0")}] ${section}${detail ? " — " + detail : ""}`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const superAdmin = await prisma.user.findFirstOrThrow({ where: { username: "superadmin" } });
  const currentYear = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const yearNum = Number(currentYear.code);

  // ---- Media -----------------------------------------------------------
  const heroA = await registerMedia("hero-campus", makeSolidPng(1600, 900, [15, 76, 74]), "image/png", 1600, 900, { bn: "শিফা ইন্টারন্যাশনাল স্কুলের ক্যাম্পাস ভবন", en: "Shifa International School campus building" }, superAdmin.id);
  const heroB = await registerMedia("hero-classroom", makeSolidPng(1600, 900, [201, 162, 39]), "image/png", 1600, 900, { bn: "একটি উজ্জ্বল, সুসজ্জিত শ্রেণিকক্ষ", en: "A bright, well-equipped classroom" }, superAdmin.id);
  const heroC = await registerMedia("hero-students", makeSolidPng(1600, 900, [26, 111, 108]), "image/png", 1600, 900, { bn: "মাঠে শিক্ষার্থীদের সমাবেশ", en: "Students gathered on the school field" }, superAdmin.id);
  const principalPhoto = await registerMedia("principal-photo", makeSolidPng(480, 600, [90, 74, 58]), "image/png", 480, 600, { bn: "অধ্যক্ষের প্রতিকৃতি (নমুনা)", en: "Principal's portrait (sample)" }, superAdmin.id);
  const facultyPhotoColors: [number, number, number][] = [
    [70, 130, 140],
    [150, 110, 60],
    [90, 90, 150],
  ];
  const facultyPhotos = await Promise.all(
    facultyPhotoColors.map((color, i) =>
      registerMedia(`faculty-photo-${i + 1}`, makeSolidPng(480, 480, color), "image/png", 480, 480, { bn: "শিক্ষকের প্রতিকৃতি (নমুনা)", en: "Teacher portrait (sample)" }, superAdmin.id),
    ),
  );
  const galleryColors: [number, number, number][] = [
    [34, 94, 92], [201, 162, 39], [120, 80, 60], [60, 100, 150], [150, 60, 90], [80, 140, 80],
  ];
  const galleryMedia = await Promise.all(
    galleryColors.map((color, i) =>
      registerMedia(`gallery-photo-${i + 1}`, makeSolidPng(1200, 800, color), "image/png", 1200, 800, { bn: `গ্যালারি ছবি ${toBanglaDigits(i + 1)} (নমুনা)`, en: `Gallery photo ${i + 1} (sample)` }, superAdmin.id),
    ),
  );
  const routinePdf = await registerMedia("routine-sample", makePdf("Class Routine (Sample) - Shifa International School"), "application/pdf", 0, 0, { bn: "ক্লাস রুটিন (নমুনা পিডিএফ)", en: "Class routine (sample PDF)" }, superAdmin.id);
  log("Media", `${mediaCache.size} local files under public/dev-media`);

  // ---- about_content -----------------------------------------------------
  const aboutExists = await prisma.aboutContentTranslation.findUnique({ where: { aboutContentId_localeCode: { aboutContentId: 1, localeCode: BN } } });
  if (!aboutExists || aboutExists.historyHtml === null) {
    await prisma.aboutContent.update({
      where: { id: 1 },
      data: { principalPhotoMediaId: principalPhoto.id },
    });
    const aboutText: Record<"bn" | "en", { history: string; vision: string; mission: string; message: string; name: string; designation: string }> = {
      bn: {
        history: "<p>২০২০ সালে নারায়ণগঞ্জের সিদ্ধিরগঞ্জ এলাকায় কয়েকজন উদ্যমী শিক্ষানুরাগীর হাত ধরে শিফা ইন্টারন্যাশনাল স্কুলের যাত্রা শুরু হয়। প্রথম বছরে মাত্র কয়েকটি শ্রেণির মাধ্যমে কার্যক্রম শুরু হলেও, অভিভাবকদের আস্থা ও শিক্ষকমণ্ডলীর নিরলস প্রচেষ্টায় বিদ্যালয়টি প্রতি বছর সম্প্রসারিত হয়েছে।</p><p>আজ প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত শিক্ষার্থীরা এখানে বাংলা ও ইংরেজি মাধ্যমে সুষম শিক্ষা গ্রহণ করছে।</p>",
        vision: "<p>আধুনিক জ্ঞান, নৈতিক মূল্যবোধ ও ইসলামি শিক্ষার সমন্বয়ে দক্ষ ও দায়িত্ববান নাগরিক গড়ে তোলাই আমাদের লক্ষ্য।</p>",
        mission: "<ul><li>প্রতিটি শিক্ষার্থীর জন্য নিরাপদ ও আনন্দময় শিক্ষা পরিবেশ নিশ্চিত করা</li><li>মানসম্মত পাঠদান ও নিয়মিত মূল্যায়নের মাধ্যমে শিক্ষার্থীদের শিক্ষাগত মান উন্নয়ন করা</li><li>স্পোকেন ইংলিশ ও ডিজিটাল সাক্ষরতার মাধ্যমে আন্তর্জাতিক মানের যোগ্যতা তৈরি করা</li><li>অভিভাবকদের সাথে নিয়মিত যোগাযোগ ও সহযোগিতা বজায় রাখা</li></ul>",
        message: "<p>প্রিয় অভিভাবক ও শিক্ষার্থীবৃন্দ,</p><p>শিফা ইন্টারন্যাশনাল স্কুল পরিবারে আপনাদের স্বাগতম। আমরা বিশ্বাস করি, প্রতিটি শিশুর মধ্যে অসীম সম্ভাবনা লুকিয়ে আছে, এবং একজন শিক্ষক হিসেবে আমাদের দায়িত্ব সেই সম্ভাবনাকে যত্ন সহকারে বিকশিত করা।</p><p>আমরা প্রতিটি শিক্ষার্থীকে শুধু ভালো ফলাফলের জন্য নয়, বরং একজন সৎ ও দায়িত্বশীল মানুষ হিসেবে গড়ে তোলার চেষ্টা করি। আপনাদের সার্বিক সহযোগিতা আমাদের এই যাত্রাকে সহজ করবে।</p><p>ধন্যবাদান্তে,</p>",
        name: "মোহাম্মদ আমিনুল ইসলাম (নমুনা)",
        designation: "অধ্যক্ষ",
      },
      en: {
        history: "<p>Shifa International School began in 2020 in the Siddhirganj area of Narayanganj, founded by a small group of local education enthusiasts. What started with just a handful of classes has grown steadily each year, carried by the trust of parents and the effort of its teachers.</p><p>Today the school teaches students from Pre-Play through Class 10 in both Bangla and English.</p>",
        vision: "<p>To nurture capable, responsible citizens through a balance of modern learning, ethical values, and Islamic education.</p>",
        mission: "<ul><li>Provide a safe and joyful learning environment for every student</li><li>Improve academic standards through quality teaching and regular assessment</li><li>Build internationally-relevant skills through spoken English and digital literacy</li><li>Maintain regular communication and partnership with parents</li></ul>",
        message: "<p>Dear parents and students,</p><p>Welcome to the Shifa International School family. We believe every child carries limitless potential, and it is our responsibility as teachers to help that potential grow with care.</p><p>We try to shape every student not only toward good results, but toward becoming an honest, responsible person. Your continued partnership makes that work possible.</p><p>With regards,</p>",
        name: "Mohammad Aminul Islam (sample)",
        designation: "Principal",
      },
    };
    for (const [locale, t] of [[BN, aboutText.bn], [EN, aboutText.en]] as const) {
      await prisma.aboutContentTranslation.upsert({
        where: { aboutContentId_localeCode: { aboutContentId: 1, localeCode: locale } },
        create: { aboutContentId: 1, localeCode: locale, historyHtml: t.history, visionHtml: t.vision, missionHtml: t.mission, principalMessageHtml: t.message, principalName: t.name, principalDesignation: t.designation },
        update: { historyHtml: t.history, visionHtml: t.vision, missionHtml: t.mission, principalMessageHtml: t.message, principalName: t.name, principalDesignation: t.designation },
      });
    }
    log("about_content", "history/vision/mission/principal's message, bn+en");
  } else {
    log("about_content", "already populated, skipped");
  }

  // ---- committee_members --------------------------------------------------
  if ((await prisma.committeeMember.count()) === 0) {
    const committee: { name: Translated; designation: Translated }[] = [
      { name: { bn: "হাজী আব্দুল কাদের (নমুনা)", en: "Haji Abdul Kader (sample)" }, designation: { bn: "সভাপতি, পরিচালনা কমিটি", en: "Chairman, Governing Committee" } },
      { name: { bn: "রোকেয়া বেগম (নমুনা)", en: "Rokeya Begum (sample)" }, designation: { bn: "সহ-সভাপতি", en: "Vice-Chairperson" } },
      { name: { bn: "মোঃ শাহজাহান মিয়া (নমুনা)", en: "Md. Shahjahan Mia (sample)" }, designation: { bn: "কোষাধ্যক্ষ", en: "Treasurer" } },
      { name: { bn: "নাসরিন সুলতানা (নমুনা)", en: "Nasrin Sultana (sample)" }, designation: { bn: "সদস্য, অভিভাবক প্রতিনিধি", en: "Member, Parent Representative" } },
      { name: { bn: "মোঃ ইব্রাহিম হোসেন (নমুনা)", en: "Md. Ibrahim Hossain (sample)" }, designation: { bn: "সদস্য সচিব", en: "Member Secretary" } },
    ];
    let order = 0;
    for (const member of committee) {
      order += 1;
      await prisma.committeeMember.create({
        data: {
          sortOrder: order,
          isActive: true,
          publishConsentAt: new Date(),
          committeeMemberTranslations: {
            create: [
              { localeCode: BN, name: member.name.bn, designation: member.designation.bn },
              { localeCode: EN, name: member.name.en, designation: member.designation.en },
            ],
          },
        },
      });
    }
    log("committee_members", `${committee.length} members`);
  } else {
    log("committee_members", "already populated, skipped");
  }

  // ---- achievements ---------------------------------------------------
  if ((await prisma.achievement.count()) === 0) {
    const achievements: { icon: string; year: number; title: Translated }[] = [
      { icon: "Trophy", year: yearNum, title: { bn: "সিদ্ধিরগঞ্জ থানায় সেরা এসএসসি ফলাফল (নমুনা)", en: "Best SSC Results in Siddhirganj Thana (sample)" } },
      { icon: "Medal", year: yearNum - 1, title: { bn: "আন্তঃবিদ্যালয় বিজ্ঞান মেলায় চ্যাম্পিয়ন (নমুনা)", en: "Champion, Inter-School Science Fair (sample)" } },
      { icon: "Award", year: yearNum - 1, title: { bn: "জেলা পর্যায়ে বিতর্ক প্রতিযোগিতায় রানার্স-আপ (নমুনা)", en: "District-level Debate Competition, Runners-up (sample)" } },
      { icon: "Star", year: yearNum - 2, title: { bn: "বাংলাদেশ স্কাউটস কর্তৃক শতভাগ উপস্থিতি স্বীকৃতি (নমুনা)", en: "Full-Attendance Recognition, Bangladesh Scouts (sample)" } },
    ];
    let order = 0;
    for (const a of achievements) {
      order += 1;
      await prisma.achievement.create({
        data: {
          achievedYear: a.year,
          icon: a.icon,
          sortOrder: order,
          isActive: true,
          achievementTranslations: { create: [{ localeCode: BN, title: a.title.bn }, { localeCode: EN, title: a.title.en }] },
        },
      });
    }
    log("achievements", `${achievements.length} entries`);
  } else {
    log("achievements", "already populated, skipped");
  }

  // ---- site_stats ---------------------------------------------------------
  if ((await prisma.siteStat.count()) === 0) {
    const stats: { code: string; value: string; suffix: string | null; icon: string; label: Translated }[] = [
      { code: "student_count", value: "612", suffix: "+", icon: "Users", label: { bn: "শিক্ষার্থী", en: "Students" } },
      { code: "teacher_count", value: "34", suffix: "+", icon: "GraduationCap", label: { bn: "শিক্ষক", en: "Teachers" } },
      { code: "pass_rate", value: "97", suffix: "%", icon: "TrendingUp", label: { bn: "পাসের হার (এসএসসি)", en: "Pass Rate (SSC)" } },
      { code: "years_of_service", value: String(yearNum - 2020), suffix: null, icon: "CalendarCheck", label: { bn: "বছরের অভিজ্ঞতা", en: "Years of Service" } },
    ];
    let order = 0;
    for (const s of stats) {
      order += 1;
      await prisma.siteStat.create({
        data: {
          code: s.code,
          numericValue: new Prisma.Decimal(s.value),
          displaySuffix: s.suffix,
          icon: s.icon,
          verifiedOn: new Date(),
          sourceNote: "DEV FIXTURE — fictional figure for local testing, not verified against real records.",
          sortOrder: order,
          isActive: true,
          updatedByUserId: superAdmin.id,
          siteStatTranslations: { create: [{ localeCode: BN, label: s.label.bn }, { localeCode: EN, label: s.label.en }] },
        },
      });
    }
    log("site_stats", `${stats.length} verified fictional stats`);
  } else {
    log("site_stats", "already populated, skipped");
  }

  // ---- home_content ---------------------------------------------------
  const homeExists = await prisma.homeContentTranslation.findUnique({ where: { homeContentId_localeCode: { homeContentId: 1, localeCode: BN } } });
  if (!homeExists || homeExists.introText === null) {
    const home: Record<"bn" | "en", { intro: string; heading: string; body: string; button: string }> = {
      bn: {
        intro: "শিফা ইন্টারন্যাশনাল স্কুল নারায়ণগঞ্জের সিদ্ধিরগঞ্জে অবস্থিত একটি বাংলা-মাধ্যম প্রতিষ্ঠান, যেখানে প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত শিক্ষার্থীদের যত্নসহকারে গড়ে তোলা হয়।",
        heading: "ভর্তি সংক্রান্ত তথ্য জানতে চান?",
        body: "আসন্ন শিক্ষাবর্ষের ভর্তি প্রক্রিয়া, প্রয়োজনীয় কাগজপত্র ও ফি কাঠামো সম্পর্কে বিস্তারিত জানুন।",
        button: "ভর্তি তথ্য দেখুন",
      },
      en: {
        intro: "Shifa International School is a Bangla-medium institution in Siddhirganj, Narayanganj, educating students from Pre-Play through Class 10 with care.",
        heading: "Want to know about admission?",
        body: "Read about the admission process, required documents, and fee structure for the upcoming academic year.",
        button: "View Admission Info",
      },
    };
    for (const [locale, t] of [[BN, home.bn], [EN, home.en]] as const) {
      await prisma.homeContentTranslation.upsert({
        where: { homeContentId_localeCode: { homeContentId: 1, localeCode: locale } },
        create: { homeContentId: 1, localeCode: locale, introText: t.intro, ctaHeading: t.heading, ctaBody: t.body, ctaButtonLabel: t.button },
        update: { introText: t.intro, ctaHeading: t.heading, ctaBody: t.body, ctaButtonLabel: t.button },
      });
    }
    log("home_content", "intro + CTA, bn+en");
  } else {
    log("home_content", "already populated, skipped");
  }

  // ---- hero_slides ------------------------------------------------------
  if ((await prisma.heroSlide.count()) === 0) {
    const slides: { media: MediaRef; title: Translated; subtitle: Translated }[] = [
      { media: heroA, title: { bn: "শিফা ইন্টারন্যাশনাল স্কুলে স্বাগতম", en: "Welcome to Shifa International School" }, subtitle: { bn: "প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা", en: "Quality education from Pre-Play to Class 10" } },
      { media: heroB, title: { bn: "আধুনিক শ্রেণিকক্ষ, যত্নশীল শিক্ষক", en: "Modern classrooms, caring teachers" }, subtitle: { bn: "প্রতিটি শিক্ষার্থীর জন্য ব্যক্তিগত মনোযোগ", en: "Individual attention for every student" } },
      { media: heroC, title: { bn: "শিক্ষার পাশাপাশি সহশিক্ষা কার্যক্রম", en: "Beyond academics: co-curricular activities" }, subtitle: { bn: "খেলাধুলা, বিতর্ক ও সাংস্কৃতিক অনুষ্ঠান", en: "Sports, debate and cultural events" } },
    ];
    let order = 0;
    for (const s of slides) {
      order += 1;
      await prisma.heroSlide.create({
        data: {
          mediaId: s.media.id,
          sortOrder: order,
          isActive: true,
          heroSlideTranslations: {
            create: [
              { localeCode: BN, title: s.title.bn, subtitle: s.subtitle.bn, ctaLabel: "ভর্তি তথ্য", ctaUrl: "/admission" },
              { localeCode: EN, title: s.title.en, subtitle: s.subtitle.en, ctaLabel: "Admission Info", ctaUrl: "/en/admission" },
            ],
          },
        },
      });
    }
    log("hero_slides", `${slides.length} slides`);
  } else {
    log("hero_slides", "already populated, skipped");
  }

  // ---- page_translations (SEO meta, replacing the seed's placeholder) ----
  const pageMeta: Record<string, { bn: { title: string; desc: string }; en: { title: string; desc: string } }> = {
    home: { bn: { title: "শিফা ইন্টারন্যাশনাল স্কুল — নারায়ণগঞ্জ", desc: "প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা প্রদানকারী প্রতিষ্ঠান, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ।" }, en: { title: "Shifa International School — Narayanganj", desc: "Quality education from Pre-Play to Class 10 in Siddhirganj, Narayanganj." } },
    about: { bn: { title: "পরিচিতি — শিফা ইন্টারন্যাশনাল স্কুল", desc: "আমাদের ইতিহাস, লক্ষ্য, উদ্দেশ্য এবং পরিচালনা কমিটি সম্পর্কে জানুন।" }, en: { title: "About Us — Shifa International School", desc: "Learn about our history, vision, mission, and governing committee." } },
    academics: { bn: { title: "শিক্ষাক্রম — শিফা ইন্টারন্যাশনাল স্কুল", desc: "শ্রেণিভিত্তিক পাঠ্যক্রম, রুটিন, পরীক্ষা ও একাডেমিক ক্যালেন্ডার।" }, en: { title: "Academics — Shifa International School", desc: "Class-wise curriculum, routines, exams and the academic calendar." } },
    admission: { bn: { title: "ভর্তি তথ্য — শিফা ইন্টারন্যাশনাল স্কুল", desc: "ভর্তি প্রক্রিয়া, প্রয়োজনীয় কাগজপত্র এবং ফি কাঠামো।" }, en: { title: "Admission — Shifa International School", desc: "Admission process, required documents, and fee structure." } },
    faculty: { bn: { title: "শিক্ষকমণ্ডলী — শিফা ইন্টারন্যাশনাল স্কুল", desc: "আমাদের অভিজ্ঞ ও প্রশিক্ষিত শিক্ষকমণ্ডলীর সাথে পরিচিত হোন।" }, en: { title: "Faculty — Shifa International School", desc: "Meet our experienced and trained teaching staff." } },
    notices: { bn: { title: "নোটিশ — শিফা ইন্টারন্যাশনাল স্কুল", desc: "সর্বশেষ নোটিশ, ঘোষণা ও গুরুত্বপূর্ণ তথ্য।" }, en: { title: "Notices — Shifa International School", desc: "Latest notices, announcements, and important information." } },
    gallery: { bn: { title: "গ্যালারি — শিফা ইন্টারন্যাশনাল স্কুল", desc: "ক্যাম্পাস, অনুষ্ঠান ও কার্যক্রমের ছবি ও ভিডিও।" }, en: { title: "Gallery — Shifa International School", desc: "Photos and videos of the campus, events, and activities." } },
    contact: { bn: { title: "যোগাযোগ — শিফা ইন্টারন্যাশনাল স্কুল", desc: "ঠিকানা, ফোন নম্বর ও যোগাযোগ ফর্ম।" }, en: { title: "Contact — Shifa International School", desc: "Address, phone numbers, and the contact form." } },
  };
  const pages = await prisma.page.findMany();
  let metaUpdated = 0;
  for (const page of pages) {
    const meta = pageMeta[page.code];
    if (!meta) continue;
    for (const [locale, t] of [[BN, meta.bn], [EN, meta.en]] as const) {
      const row = await prisma.pageTranslation.findUnique({ where: { pageId_localeCode: { pageId: page.id, localeCode: locale } } });
      if (row && row.metaTitle.startsWith("[[CONTENT REQUIRED")) {
        await prisma.pageTranslation.update({
          where: { pageId_localeCode: { pageId: page.id, localeCode: locale } },
          data: { metaTitle: t.title, metaDescription: t.desc, heading: t.title },
        });
        metaUpdated += 1;
      }
    }
  }
  log("page_translations", `${metaUpdated} placeholder meta rows replaced`);

  // ---- site_settings: office hours, footer note, map --------------------
  const settingsRow = await prisma.siteSettingsTranslation.findUnique({ where: { siteSettingsId_localeCode: { siteSettingsId: 1, localeCode: BN } } });
  if (!settingsRow || settingsRow.officeHours === null) {
    await prisma.siteSettings.update({
      where: { id: 1 },
      data: {
        googleMapEmbedUrl: "https://www.google.com/maps?q=23.6547,90.5023&z=15&output=embed",
        latitude: new Prisma.Decimal("23.6547"),
        longitude: new Prisma.Decimal("90.5023"),
      },
    });
    const office: Record<"bn" | "en", { hours: string; footer: string }> = {
      bn: { hours: "শনি–বৃহস্পতিবার, সকাল ৮:০০ – বিকাল ৪:০০", footer: "© শিফা ইন্টারন্যাশনাল স্কুল। সর্বস্বত্ব সংরক্ষিত।" },
      en: { hours: "Sunday–Thursday, 8:00 AM – 4:00 PM", footer: "© Shifa International School. All rights reserved." },
    };
    for (const [locale, t] of [[BN, office.bn], [EN, office.en]] as const) {
      await prisma.siteSettingsTranslation.update({
        where: { siteSettingsId_localeCode: { siteSettingsId: 1, localeCode: locale } },
        data: { officeHours: t.hours, footerNote: t.footer },
      });
    }
    log("site_settings", "office hours, footer note, map coordinates");
  } else {
    log("site_settings", "already populated, skipped");
  }

  // ---- school_registration_ids --------------------------------------------
  if ((await prisma.schoolRegistrationId.count()) === 0) {
    // EIIN 311011906 is the one figure ARCHITECTURE.md §A-3.1 records as
    // already known (not a fixture invention); the other three are fixture
    // placeholders clearly out of realistic numeric ranges.
    const ids: { code: string; value: string }[] = [
      { code: "eiin", value: "311011906" },
      { code: "emis", value: "DEV-EMIS-000000" },
      { code: "school_code", value: "DEV-0000" },
      { code: "biin", value: "DEV-BIIN-000000" },
    ];
    for (const idRow of ids) {
      await prisma.schoolRegistrationId.create({ data: { registrationIdTypeCode: idRow.code, value: idRow.value, isPublic: true } });
    }
    log("school_registration_ids", `${ids.length} rows (EIIN is the project's known real value; rest are dev placeholders)`);
  } else {
    log("school_registration_ids", "already populated, skipped");
  }

  // ---- contact_channels ---------------------------------------------------
  if ((await prisma.contactChannel.count()) === 0) {
    const channels: { type: string; value: string; label: Translated; primary: boolean }[] = [
      { type: "phone", value: "02-7691234", label: { bn: "অফিস", en: "Office" }, primary: true },
      { type: "mobile", value: "01700000000", label: { bn: "ভর্তি হেল্পলাইন", en: "Admission Helpline" }, primary: false },
      { type: "whatsapp", value: "8801700000000", label: { bn: "হোয়াটসঅ্যাপ", en: "WhatsApp" }, primary: false },
      { type: "email", value: "info@shifaislocal.test", label: { bn: "ইমেইল", en: "Email" }, primary: true },
    ];
    let order = 0;
    for (const c of channels) {
      order += 1;
      await prisma.contactChannel.create({
        data: {
          channelTypeCode: c.type,
          value: c.value,
          isPublic: true,
          isPrimary: c.primary,
          sortOrder: order,
          contactChannelTranslations: { create: [{ localeCode: BN, label: c.label.bn }, { localeCode: EN, label: c.label.en }] },
        },
      });
    }
    log("contact_channels", `${channels.length} channels`);
  } else {
    log("contact_channels", "already populated, skipped");
  }

  // ---- social_links ---------------------------------------------------
  if ((await prisma.socialLink.count()) === 0) {
    const links = [
      { platform: "facebook", url: "https://www.facebook.com/shifa.international.school.dev" },
      { platform: "youtube", url: "https://www.youtube.com/@shifainternationalschool-dev" },
    ];
    let order = 0;
    for (const l of links) {
      order += 1;
      await prisma.socialLink.create({ data: { platformCode: l.platform, url: l.url, sortOrder: order, isActive: true } });
    }
    log("social_links", `${links.length} links`);
  } else {
    log("social_links", "already populated, skipped");
  }

  // ---- subjects -------------------------------------------------------
  const subjectDefs: { code: string; name: Translated; short: Translated }[] = [
    { code: "bangla", name: { bn: "বাংলা", en: "Bangla" }, short: { bn: "বাং", en: "Bng" } },
    { code: "english", name: { bn: "ইংরেজি", en: "English" }, short: { bn: "ইংরে", en: "Eng" } },
    { code: "mathematics", name: { bn: "গণিত", en: "Mathematics" }, short: { bn: "গণিত", en: "Math" } },
    { code: "general_science", name: { bn: "সাধারণ বিজ্ঞান", en: "General Science" }, short: { bn: "বিজ্ঞান", en: "Sci" } },
    { code: "islamic_studies", name: { bn: "ইসলাম শিক্ষা", en: "Islamic Studies" }, short: { bn: "ইসলাম", en: "Isl" } },
    { code: "bgs", name: { bn: "বাংলাদেশ ও বিশ্বপরিচয়", en: "Bangladesh & Global Studies" }, short: { bn: "বাবিপ", en: "BGS" } },
    { code: "ict", name: { bn: "তথ্য ও যোগাযোগ প্রযুক্তি", en: "ICT" }, short: { bn: "আইসিটি", en: "ICT" } },
    { code: "arts", name: { bn: "চারু ও কারুকলা", en: "Arts & Crafts" }, short: { bn: "চারুকলা", en: "Arts" } },
  ];
  const subjectIds = new Map<string, bigint>();
  for (const s of subjectDefs) {
    const existing = await prisma.subject.findUnique({ where: { code: s.code } });
    if (existing) {
      subjectIds.set(s.code, existing.id);
      continue;
    }
    const created = await prisma.subject.create({
      data: {
        code: s.code,
        isActive: true,
        subjectTranslations: { create: [{ localeCode: BN, name: s.name.bn, shortName: s.short.bn }, { localeCode: EN, name: s.name.en, shortName: s.short.en }] },
      },
    });
    subjectIds.set(s.code, created.id);
  }
  log("subjects", `${subjectIds.size} subjects`);

  // ---- class_sections + class_subjects (current year, all 14 grades) -----
  const grades = await prisma.classGrade.findMany({ orderBy: { sortOrder: "asc" } });
  let sectionsCreated = 0;
  let classSubjectsCreated = 0;
  for (const grade of grades) {
    const existingSection = await prisma.classSection.findFirst({ where: { classGradeId: grade.id, academicYearId: currentYear.id } });
    if (!existingSection) {
      await prisma.classSection.create({ data: { classGradeId: grade.id, academicYearId: currentYear.id, name: "A", capacity: 35, isActive: true } });
      sectionsCreated += 1;
    }
    for (const [code, subjectId] of subjectIds) {
      if (code === "ict" && grade.sortOrder < 7) continue; // ICT from Class 6 up
      if (code === "arts" && grade.sortOrder > 9) continue; // Arts through Class 5
      const already = await prisma.classSubject.findUnique({ where: { classGradeId_subjectId_academicYearId: { classGradeId: grade.id, subjectId, academicYearId: currentYear.id } } });
      if (already) continue;
      await prisma.classSubject.create({ data: { classGradeId: grade.id, subjectId, academicYearId: currentYear.id, isOptional: false, sortOrder: 1 } });
      classSubjectsCreated += 1;
    }
  }
  log("class_sections", `${sectionsCreated} sections created`);
  log("class_subjects", `${classSubjectsCreated} assignments created`);

  // ---- class_routines (a handful of grades) ------------------------------
  const routineGradeCodes = ["class_1", "class_5", "class_8", "class_10"];
  let routinesCreated = 0;
  for (const code of routineGradeCodes) {
    const gradeId = await idByCode("classGrade", code);
    const already = await prisma.classRoutine.findFirst({ where: { classGradeId: gradeId, academicYearId: currentYear.id } });
    if (already) continue;
    await prisma.classRoutine.create({
      data: { classGradeId: gradeId, academicYearId: currentYear.id, mediaId: routinePdf.id, isCurrent: true, uploadedByUserId: superAdmin.id },
    });
    routinesCreated += 1;
  }
  log("class_routines", `${routinesCreated} routines (sample PDF; ${routineGradeCodes.length - routinesCreated} already existed)`);

  // ---- calendar_events --------------------------------------------------
  if ((await prisma.calendarEvent.count()) === 0) {
    const events: { type: string; start: string; end?: string; title: Translated }[] = [
      { type: "vacation", start: `${yearNum}-01-01`, end: `${yearNum}-01-05`, title: { bn: "নতুন বছরের ছুটি", en: "New Year Break" } },
      { type: "event", start: `${yearNum}-02-21`, title: { bn: "আন্তর্জাতিক মাতৃভাষা দিবস", en: "International Mother Language Day" } },
      { type: "exam", start: `${yearNum}-04-01`, end: `${yearNum}-04-10`, title: { bn: "প্রথম সাময়িক পরীক্ষা", en: "First Terminal Examination" } },
      { type: "holiday", start: `${yearNum}-04-14`, title: { bn: "বাংলা নববর্ষ", en: "Bangla New Year" } },
      { type: "event", start: `${yearNum}-06-10`, title: { bn: "বার্ষিক ক্রীড়া প্রতিযোগিতা", en: "Annual Sports Day" } },
      { type: "vacation", start: `${yearNum}-08-01`, end: `${yearNum}-08-07`, title: { bn: "গ্রীষ্মকালীন অবকাশ", en: "Summer Vacation" } },
      { type: "exam", start: `${yearNum}-11-01`, end: `${yearNum}-11-15`, title: { bn: "বার্ষিক পরীক্ষা", en: "Annual Examination" } },
      { type: "holiday", start: `${yearNum}-12-16`, title: { bn: "মহান বিজয় দিবস", en: "Victory Day" } },
    ];
    for (const e of events) {
      const typeId = await idByCode("calendarEventType", e.type);
      await prisma.calendarEvent.create({
        data: {
          academicYearId: currentYear.id,
          calendarEventTypeId: typeId,
          startsOn: new Date(`${e.start}T00:00:00Z`),
          endsOn: e.end ? new Date(`${e.end}T00:00:00Z`) : null,
          isActive: true,
          calendarEventTranslations: { create: [{ localeCode: BN, title: e.title.bn }, { localeCode: EN, title: e.title.en }] },
        },
      });
    }
    log("calendar_events", `${events.length} events`);
  } else {
    log("calendar_events", "already populated, skipped");
  }

  // ---- exam_terms + exams ------------------------------------------------
  const termDefs: { code: string; name: Translated }[] = [
    { code: "first_terminal", name: { bn: "প্রথম সাময়িক পরীক্ষা", en: "First Terminal Examination" } },
    { code: "annual", name: { bn: "বার্ষিক পরীক্ষা", en: "Annual Examination" } },
  ];
  const termIds = new Map<string, bigint>();
  for (const t of termDefs) {
    let term = await prisma.examTerm.findFirst({ where: { academicYearId: currentYear.id, code: t.code } });
    if (!term) {
      term = await prisma.examTerm.create({
        data: { academicYearId: currentYear.id, code: t.code, isActive: true, examTermTranslations: { create: [{ localeCode: BN, name: t.name.bn }, { localeCode: EN, name: t.name.en }] } },
      });
    }
    termIds.set(t.code, term.id);
  }
  const examSubjects = ["bangla", "english", "mathematics", "general_science"];
  const examGradeCodes = ["class_6", "class_7", "class_8", "class_9", "class_10"];
  let examsCreated = 0;
  for (const [termIndex, termCode] of ["first_terminal", "annual"].entries()) {
    const termId = termIds.get(termCode)!;
    for (const gradeCode of examGradeCodes) {
      const gradeId = await idByCode("classGrade", gradeCode);
      for (const [i, subjCode] of examSubjects.entries()) {
        const subjectId = subjectIds.get(subjCode)!;
        const already = await prisma.exam.findFirst({ where: { examTermId: termId, classGradeId: gradeId, subjectId } });
        if (already) continue;
        const day = 3 + i * 2; // 3, 5, 7, 9 — stays valid for any month
        const month = termIndex === 0 ? 4 : 11;
        await prisma.exam.create({
          data: {
            examTermId: termId,
            classGradeId: gradeId,
            subjectId,
            examDate: new Date(`${yearNum}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00Z`),
            startsAt: new Date("1970-01-01T10:00:00Z"),
            endsAt: new Date("1970-01-01T13:00:00Z"),
            isActive: true,
          },
        });
        examsCreated += 1;
      }
    }
  }
  log("exam_terms", `${termIds.size} terms`);
  log("exams", `${examsCreated} exam entries`);

  // ---- admission_cycles + steps/documents/eligibility/faqs ---------------
  let cycle = await prisma.admissionCycle.findUnique({ where: { academicYearId: currentYear.id } });
  if (!cycle) {
    const today = new Date();
    const opens = new Date(today);
    opens.setDate(opens.getDate() - 10);
    const closes = new Date(today);
    closes.setDate(closes.getDate() + 50);
    const examDate = new Date(today);
    examDate.setDate(examDate.getDate() + 60);
    cycle = await prisma.admissionCycle.create({
      data: {
        academicYearId: currentYear.id,
        isOpen: true,
        opensOn: opens,
        closesOn: closes,
        examDate,
        isCurrent: true,
        admissionCycleTranslations: {
          create: [
            { localeCode: BN, statusBanner: `${toBanglaDigits(yearNum)} শিক্ষাবর্ষে ভর্তি চলছে!` },
            { localeCode: EN, statusBanner: `Admission is open for ${yearNum}!` },
          ],
        },
      },
    });
    log("admission_cycles", "1 open cycle for the current academic year");
  } else {
    log("admission_cycles", "already populated, skipped");
  }

  if ((await prisma.admissionStep.count()) === 0) {
    const steps: { icon: string; title: Translated; desc: Translated }[] = [
      { icon: "FileText", title: { bn: "আবেদন ফরম পূরণ", en: "Fill the Application Form" }, desc: { bn: "অনলাইনে বা অফিসে গিয়ে আবেদন ফরম সংগ্রহ ও পূরণ করুন।", en: "Collect and fill out the application form online or at the office." } },
      { icon: "FolderCheck", title: { bn: "কাগজপত্র জমা", en: "Submit Documents" }, desc: { bn: "প্রয়োজনীয় সকল কাগজপত্রসহ ফরম জমা দিন।", en: "Submit the form along with all required documents." } },
      { icon: "PenLine", title: { bn: "ভর্তি মূল্যায়ন", en: "Entrance Assessment" }, desc: { bn: "নির্ধারিত তারিখে সংক্ষিপ্ত মূল্যায়নে অংশ নিন।", en: "Attend a short assessment on the scheduled date." } },
      { icon: "CheckCircle2", title: { bn: "ভর্তি নিশ্চিতকরণ", en: "Admission Confirmed" }, desc: { bn: "ফি পরিশোধের মাধ্যমে ভর্তি প্রক্রিয়া সম্পন্ন করুন।", en: "Complete admission by paying the applicable fees." } },
    ];
    let n = 0;
    for (const s of steps) {
      n += 1;
      await prisma.admissionStep.create({
        data: {
          admissionCycleId: cycle.id,
          stepNumber: n,
          icon: s.icon,
          isActive: true,
          admissionStepTranslations: { create: [{ localeCode: BN, title: s.title.bn, description: s.desc.bn }, { localeCode: EN, title: s.title.en, description: s.desc.en }] },
        },
      });
    }
    log("admission_steps", `${steps.length} steps`);
  } else {
    log("admission_steps", "already populated, skipped");
  }

  if ((await prisma.admissionDocument.count()) === 0) {
    const docs: { mandatory: boolean; name: Translated }[] = [
      { mandatory: true, name: { bn: "জন্ম নিবন্ধন সনদের ফটোকপি", en: "Photocopy of Birth Registration Certificate" } },
      { mandatory: true, name: { bn: "পূর্ববর্তী বিদ্যালয়ের প্রত্যয়নপত্র / রিপোর্ট কার্ড", en: "Transfer Certificate / Report Card from Previous School" } },
      { mandatory: true, name: { bn: "পাসপোর্ট আকারের ছবি (২ কপি)", en: "Passport-size Photographs (2 copies)" } },
      { mandatory: true, name: { bn: "অভিভাবকের জাতীয় পরিচয়পত্রের ফটোকপি", en: "Photocopy of Guardian's National ID" } },
      { mandatory: false, name: { bn: "টিকা কার্ড (প্রি-প্লে থেকে দ্বিতীয় শ্রেণির জন্য)", en: "Immunization Card (Pre-Play to Class 2)" } },
    ];
    let order = 0;
    for (const d of docs) {
      order += 1;
      await prisma.admissionDocument.create({
        data: { isMandatory: d.mandatory, sortOrder: order, isActive: true, admissionDocumentTranslations: { create: [{ localeCode: BN, name: d.name.bn }, { localeCode: EN, name: d.name.en }] } },
      });
    }
    log("admission_documents", `${docs.length} documents`);
  } else {
    log("admission_documents", "already populated, skipped");
  }

  if ((await prisma.admissionEligibility.count()) === 0) {
    const eligibility: { grade: string; min: string; max: string }[] = [
      { grade: "pre_play", min: "2.5", max: "3.5" },
      { grade: "play", min: "3.5", max: "4.5" },
      { grade: "nursery", min: "4.5", max: "5.5" },
      { grade: "kg", min: "5.5", max: "6.5" },
      { grade: "class_1", min: "6.0", max: "7.5" },
    ];
    for (const e of eligibility) {
      const gradeId = await idByCode("classGrade", e.grade);
      await prisma.admissionEligibility.create({
        data: { classGradeId: gradeId, minAgeYears: new Prisma.Decimal(e.min), maxAgeYears: new Prisma.Decimal(e.max), ageAsOf: new Date(`${yearNum}-01-01T00:00:00Z`), isActive: true },
      });
    }
    log("admission_eligibility", `${eligibility.length} grade entries`);
  } else {
    log("admission_eligibility", "already populated, skipped");
  }

  if ((await prisma.admissionFaq.count()) === 0) {
    const faqs: { q: Translated; a: Translated }[] = [
      { q: { bn: "ভর্তি ফি কীভাবে পরিশোধ করব?", en: "How do I pay the admission fee?" }, a: { bn: "বিদ্যালয়ের অফিসে নগদ অথবা ব্যাংক ড্রাফটের মাধ্যমে ফি পরিশোধ করা যাবে।", en: "Fees can be paid in cash at the school office or by bank draft." } },
      { q: { bn: "ভর্তির জন্য কি প্রবেশিকা পরীক্ষা দিতে হয়?", en: "Is an entrance test required for admission?" }, a: { bn: "প্রথম শ্রেণি ও তদূর্ধ্বের জন্য একটি সংক্ষিপ্ত মূল্যায়ন নেওয়া হয়; প্রি-প্লে থেকে কেজি পর্যন্ত শুধুমাত্র একটি সংক্ষিপ্ত সাক্ষাৎকার নেওয়া হয়।", en: "A short assessment is held for Class 1 and above; Pre-Play through KG only have a brief interview." } },
      { q: { bn: "ভর্তির সময় কী কী কাগজপত্র লাগবে?", en: "What documents are needed at admission?" }, a: { bn: "উপরে তালিকাভুক্ত প্রয়োজনীয় কাগজপত্র জমা দিতে হবে।", en: "Please submit the documents listed above." } },
      { q: { bn: "মাঝপথে অন্য বিদ্যালয় থেকে স্থানান্তর হয়ে ভর্তি হওয়া যাবে কি?", en: "Can a student transfer mid-year from another school?" }, a: { bn: "হ্যাঁ, আসন খালি থাকা সাপেক্ষে মাঝপথে ভর্তি নেওয়া হয়।", en: "Yes, mid-year transfers are accepted subject to seat availability." } },
      { q: { bn: "পরিবহন সুবিধা আছে কি?", en: "Is transport available?" }, a: { bn: "নির্দিষ্ট কিছু রুটে পরিবহন সুবিধা রয়েছে; বিস্তারিত জানতে অফিসে যোগাযোগ করুন।", en: "Transport is available on select routes; contact the office for details." } },
    ];
    let order = 0;
    for (const f of faqs) {
      order += 1;
      await prisma.admissionFaq.create({
        data: { sortOrder: order, isActive: true, admissionFaqTranslations: { create: [{ localeCode: BN, question: f.q.bn, answer: f.a.bn }, { localeCode: EN, question: f.q.en, answer: f.a.en }] } },
      });
    }
    log("admission_faqs", `${faqs.length} FAQs`);
  } else {
    log("admission_faqs", "already populated, skipped");
  }

  // ---- fee_structures + fee_items ----------------------------------------
  const feeTypeIds = {
    admission: await idByCode("feeType", "admission"),
    monthly: await idByCode("feeType", "monthly"),
    exam: await idByCode("feeType", "exam"),
    transport: await idByCode("feeType", "transport"),
  };
  let feeStructuresCreated = 0;
  for (const grade of grades) {
    const existing = await prisma.feeStructure.findUnique({ where: { classGradeId_academicYearId: { classGradeId: grade.id, academicYearId: currentYear.id } } });
    if (existing) continue;
    const tier: 0 | 1 | 2 = grade.sortOrder <= 4 ? 0 : grade.sortOrder <= 9 ? 1 : 2; // early years / primary / secondary+
    const admissionFee = { 0: 5000, 1: 6000, 2: 8000 }[tier];
    const monthlyFee = { 0: 1200, 1: 1500, 2: 2200 }[tier];
    const examFee = { 0: 400, 1: 500, 2: 700 }[tier];
    await prisma.feeStructure.create({
      data: {
        classGradeId: grade.id,
        academicYearId: currentYear.id,
        currencyCode: "BDT",
        isActive: true,
        updatedByUserId: superAdmin.id,
        feeItems: {
          create: [
            { feeTypeId: feeTypeIds.admission, amount: new Prisma.Decimal(admissionFee) },
            { feeTypeId: feeTypeIds.monthly, amount: new Prisma.Decimal(monthlyFee) },
            { feeTypeId: feeTypeIds.exam, amount: new Prisma.Decimal(examFee) },
            { feeTypeId: feeTypeIds.transport, amount: new Prisma.Decimal(600) },
          ],
        },
      },
    });
    feeStructuresCreated += 1;
  }
  log("fee_structures", `${feeStructuresCreated} structures (4 fee items each)`);

  // ---- faculty ------------------------------------------------------------
  if ((await prisma.faculty.count()) === 0) {
    const faculty: {
      designation: string;
      photo: MediaRef | null;
      subjects: string[];
      experience: number;
      name: Translated;
      qualification: Translated;
      bio: Translated;
    }[] = [
      { designation: "vice_principal", photo: facultyPhotos[0]!, subjects: ["mathematics", "general_science"], experience: 14, name: { bn: "নাজমা আক্তার (নমুনা)", en: "Nazma Akter (sample)" }, qualification: { bn: "এম.এসসি (গণিত), বি.এড", en: "M.Sc (Mathematics), B.Ed" }, bio: { bn: "গণিত ও বিজ্ঞান শিক্ষায় ১৪ বছরের অভিজ্ঞতা নিয়ে বিদ্যালয়ের একাডেমিক তত্ত্বাবধানে নিয়োজিত।", en: "Brings 14 years of experience teaching mathematics and science, and oversees the school's academic planning." } },
      { designation: "senior_teacher", photo: facultyPhotos[1]!, subjects: ["bangla"], experience: 11, name: { bn: "মোঃ কামরুল হাসান (নমুনা)", en: "Md. Kamrul Hasan (sample)" }, qualification: { bn: "এম.এ (বাংলা), বি.এড", en: "M.A (Bangla), B.Ed" }, bio: { bn: "বাংলা সাহিত্য ও ব্যাকরণ শিক্ষায় অভিজ্ঞ এবং আন্তঃস্কুল বিতর্ক দলের প্রশিক্ষক।", en: "Experienced in Bangla literature and grammar, and coaches the inter-school debate team." } },
      { designation: "senior_teacher", photo: facultyPhotos[2]!, subjects: ["english"], experience: 9, name: { bn: "সাদিয়া ইসলাম (নমুনা)", en: "Sadia Islam (sample)" }, qualification: { bn: "এম.এ (ইংরেজি), বি.এড", en: "M.A (English), B.Ed" }, bio: { bn: "স্পোকেন ইংলিশ ও ইংরেজি সাহিত্য শিক্ষায় অভিজ্ঞ।", en: "Focuses on spoken English and English literature." } },
      { designation: "assistant_teacher", photo: null, subjects: ["general_science"], experience: 5, name: { bn: "মোঃ তানভীর আহমেদ (নমুনা)", en: "Md. Tanvir Ahmed (sample)" }, qualification: { bn: "বি.এসসি (পদার্থবিজ্ঞান)", en: "B.Sc (Physics)" }, bio: { bn: "প্রাথমিক ও মাধ্যমিক স্তরে বিজ্ঞান শিক্ষা প্রদান করেন।", en: "Teaches science at both the primary and secondary levels." } },
      { designation: "assistant_teacher", photo: null, subjects: ["islamic_studies"], experience: 7, name: { bn: "মোঃ আব্দুল্লাহ আল মামুন (নমুনা)", en: "Md. Abdullah Al Mamun (sample)" }, qualification: { bn: "ফাজিল, কামিল (ইসলামিক স্টাডিজ)", en: "Fazil, Kamil (Islamic Studies)" }, bio: { bn: "ইসলাম শিক্ষা ও নৈতিকতা বিষয়ে পাঠদান করেন।", en: "Teaches Islamic studies and moral education." } },
      { designation: "assistant_teacher", photo: null, subjects: ["bgs"], experience: 4, name: { bn: "ফারজানা ইয়াসমিন (নমুনা)", en: "Farzana Yasmin (sample)" }, qualification: { bn: "বি.এ (ইতিহাস)", en: "B.A (History)" }, bio: { bn: "বাংলাদেশ ও বিশ্বপরিচয় বিষয়ে পাঠদান করেন।", en: "Teaches Bangladesh & Global Studies." } },
      { designation: "assistant_teacher", photo: null, subjects: ["ict"], experience: 3, name: { bn: "মোঃ রাকিব হাসান (নমুনা)", en: "Md. Rakib Hasan (sample)" }, qualification: { bn: "বি.এসসি (কম্পিউটার সায়েন্স)", en: "B.Sc (Computer Science)" }, bio: { bn: "তথ্যপ্রযুক্তি বিষয়ে হাতেকলমে প্রশিক্ষণ প্রদান করেন।", en: "Provides hands-on instruction in information technology." } },
      { designation: "assistant_teacher", photo: null, subjects: ["arts"], experience: 6, name: { bn: "নূরজাহান বেগম (নমুনা)", en: "Nurjahan Begum (sample)" }, qualification: { bn: "ডিপ্লোমা ইন ফাইন আর্টস", en: "Diploma in Fine Arts" }, bio: { bn: "চারু ও কারুকলা বিষয়ে প্রাথমিক স্তরের শিক্ষার্থীদের পাঠদান করেন।", en: "Teaches arts & crafts to primary-level students." } },
    ];
    let order = 0;
    let empCounter = 0;
    for (const f of faculty) {
      order += 1;
      empCounter += 1;
      const designationId = await idByCode("designation", f.designation);
      const now = new Date();
      await prisma.faculty.create({
        data: {
          employeeCode: `SIS-F-${String(empCounter).padStart(3, "0")}`,
          designationId,
          photoMediaId: f.photo?.id ?? null,
          experienceYears: f.experience,
          joinedOn: new Date(`${yearNum - f.experience}-01-10T00:00:00Z`),
          publishConsentAt: now,
          photoConsentAt: f.photo ? now : null,
          statusCode: "published",
          sortOrder: order,
          facultyTranslations: {
            create: [
              { localeCode: BN, fullName: f.name.bn, qualification: f.qualification.bn, bio: f.bio.bn },
              { localeCode: EN, fullName: f.name.en, qualification: f.qualification.en, bio: f.bio.en },
            ],
          },
          facultySubjects: { create: f.subjects.map((code) => ({ subjectId: subjectIds.get(code)! })) },
        },
      });
    }
    log("faculty", `${faculty.length} published profiles (${faculty.filter((f) => f.photo).length} with a sample photo)`);
  } else {
    log("faculty", "already populated, skipped");
  }

  // ---- notices --------------------------------------------------------
  if ((await prisma.notice.count()) === 0) {
    const now = Date.now();
    const daysAgo = (n: number) => new Date(now - n * 86_400_000);
    const daysAhead = (n: number) => new Date(now + n * 86_400_000);
    const notices: {
      category: string;
      pinned: boolean;
      publishedAt: Date | null;
      status: string;
      title: Translated;
      excerpt: Translated;
      body: Translated;
    }[] = [
      { category: "admission", pinned: true, publishedAt: daysAgo(9), status: "published", title: { bn: `${toBanglaDigits(yearNum)} শিক্ষাবর্ষে ভর্তি শুরু`, en: `Admission Open for ${yearNum}` }, excerpt: { bn: "নতুন শিক্ষাবর্ষে ভর্তি প্রক্রিয়া শুরু হয়েছে। আসন সীমিত।", en: "Admission for the new academic year has begun. Seats are limited." }, body: { bn: "<p>প্রিয় অভিভাবকবৃন্দ,</p><p>শিফা ইন্টারন্যাশনাল স্কুলে প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত ভর্তি কার্যক্রম শুরু হয়েছে। আগ্রহী অভিভাবকদের বিদ্যালয়ের অফিসে যোগাযোগ করার জন্য অনুরোধ করা হলো।</p>", en: "<p>Dear parents,</p><p>Admission for Pre-Play through Class 10 at Shifa International School is now open. Interested parents are requested to contact the school office.</p>" } },
      { category: "general", pinned: true, publishedAt: daysAgo(2), status: "published", title: { bn: "বিদ্যালয়ের নতুন ওয়েবসাইট চালু", en: "New School Website Launched" }, excerpt: { bn: "অভিভাবকদের সুবিধার্থে বিদ্যালয়ের নতুন ওয়েবসাইট চালু করা হয়েছে।", en: "A new website has been launched for parents' convenience." }, body: { bn: "<p>বিদ্যালয়ের সকল তথ্য এখন থেকে এই ওয়েবসাইটের মাধ্যমে জানা যাবে।</p>", en: "<p>All school information will now be available through this website.</p>" } },
      { category: "exam", pinned: false, publishedAt: daysAgo(5), status: "published", title: { bn: "প্রথম সাময়িক পরীক্ষার সময়সূচি প্রকাশ", en: "First Terminal Exam Schedule Published" }, excerpt: { bn: "ষষ্ঠ থেকে দশম শ্রেণির পরীক্ষার সময়সূচি প্রকাশিত হয়েছে।", en: "The exam schedule for Classes 6–10 has been published." }, body: { bn: "<p>শিক্ষাক্রম পাতায় বিস্তারিত সময়সূচি দেখুন।</p>", en: "<p>See the Academics page for the full schedule.</p>" } },
      { category: "holiday", pinned: false, publishedAt: daysAgo(14), status: "published", title: { bn: "বাংলা নববর্ষ উপলক্ষে ছুটি", en: "Holiday for Bangla New Year" }, excerpt: { bn: "১৪ এপ্রিল বিদ্যালয় বন্ধ থাকবে।", en: "The school will remain closed on April 14." }, body: { bn: "<p>সকল শিক্ষার্থী ও অভিভাবকদের নববর্ষের শুভেচ্ছা।</p>", en: "<p>New Year greetings to all students and parents.</p>" } },
      { category: "event", pinned: false, publishedAt: daysAgo(20), status: "published", title: { bn: "বার্ষিক ক্রীড়া প্রতিযোগিতার আয়োজন", en: "Annual Sports Day Announced" }, excerpt: { bn: "আগামী মাসে বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হবে।", en: "The Annual Sports Day will be held next month." }, body: { bn: "<p>সকল শিক্ষার্থীকে অংশগ্রহণের জন্য উৎসাহিত করা হচ্ছে।</p>", en: "<p>All students are encouraged to participate.</p>" } },
      { category: "result", pinned: false, publishedAt: daysAgo(30), status: "published", title: { bn: "বার্ষিক পরীক্ষার ফলাফল প্রকাশ", en: "Annual Exam Results Published" }, excerpt: { bn: "গত বছরের বার্ষিক পরীক্ষার ফলাফল বিদ্যালয় অফিসে পাওয়া যাবে।", en: "Results of last year's annual exam are available at the school office." }, body: { bn: "<p>অভিভাবকদের ফলাফল সংগ্রহের জন্য অনুরোধ করা হলো।</p>", en: "<p>Parents are requested to collect the results.</p>" } },
      { category: "general", pinned: false, publishedAt: daysAgo(1), status: "published", title: { bn: "অভিভাবক সমাবেশের আমন্ত্রণ", en: "Invitation to Parent-Teacher Meeting" }, excerpt: { bn: "আগামী শুক্রবার অভিভাবক সমাবেশ অনুষ্ঠিত হবে।", en: "A parent-teacher meeting will be held this coming Friday." }, body: { bn: "<p>সকল অভিভাবককে উপস্থিত থাকার জন্য অনুরোধ করা হলো।</p>", en: "<p>All parents are requested to attend.</p>" } },
      { category: "admission", pinned: false, publishedAt: daysAgo(7), status: "published", title: { bn: "ভর্তি ফরম বিতরণ শুরু", en: "Admission Forms Now Available" }, excerpt: { bn: "বিদ্যালয়ের অফিস থেকে ভর্তি ফরম সংগ্রহ করা যাবে।", en: "Admission forms can be collected from the school office." }, body: { bn: "<p>অফিস চলাকালীন সময়ে ফরম সংগ্রহ করা যাবে।</p>", en: "<p>Forms can be collected during office hours.</p>" } },
      { category: "event", pinned: false, publishedAt: daysAhead(20), status: "published", title: { bn: "বার্ষিক সাংস্কৃতিক অনুষ্ঠান — আসন্ন", en: "Annual Cultural Program — Upcoming" }, excerpt: { bn: "আগামী মাসে বার্ষিক সাংস্কৃতিক অনুষ্ঠান অনুষ্ঠিত হবে।", en: "The annual cultural program will be held next month." }, body: { bn: "<p>বিস্তারিত সূচি শীঘ্রই প্রকাশ করা হবে।</p>", en: "<p>Full schedule to be announced soon.</p>" } },
      { category: "general", pinned: false, publishedAt: null, status: "draft", title: { bn: "খসড়া নোটিশ (অপ্রকাশিত, প্রশাসনিক পরীক্ষার জন্য)", en: "Draft Notice (unpublished, for admin testing)" }, excerpt: { bn: "এই নোটিশটি এখনও প্রকাশিত হয়নি।", en: "This notice has not been published yet." }, body: { bn: "<p>এটি একটি খসড়া, যা প্রকাশনা কর্মপ্রবাহ পরীক্ষার জন্য ব্যবহৃত হচ্ছে।</p>", en: "<p>This is a draft, kept unpublished to test the publish workflow.</p>" } },
    ];
    let n = 0;
    for (const notice of notices) {
      n += 1;
      const categoryId = await idByCode("noticeCategory", notice.category);
      const slugBn = `${notice.category}-${n}-${yearNum}`;
      const slugEn = `${notice.category}-${n}-${yearNum}-en`;
      await prisma.notice.create({
        data: {
          noticeCategoryId: categoryId,
          statusCode: notice.status,
          publishedAt: notice.publishedAt,
          isPinned: notice.pinned,
          authorUserId: superAdmin.id,
          publishedByUserId: notice.status === "published" ? superAdmin.id : null,
          noticeTranslations: {
            create: [
              { localeCode: BN, slug: slugBn, title: notice.title.bn, excerpt: notice.excerpt.bn, bodyHtml: notice.body.bn },
              { localeCode: EN, slug: slugEn, title: notice.title.en, excerpt: notice.excerpt.en, bodyHtml: notice.body.en },
            ],
          },
        },
      });
    }
    log("notices", `${notices.length} notices (mixed categories; 1 pinned+2 draft/future-dated to exercise gating)`);
  } else {
    log("notices", "already populated, skipped");
  }

  // ---- gallery_albums + gallery_photos + gallery_videos -------------------
  if ((await prisma.galleryAlbum.count()) === 0) {
    const albums: { category: string; title: Translated; photos: number[] }[] = [
      { category: "campus", title: { bn: "ক্যাম্পাস পরিচিতি", en: "Campus Tour" }, photos: [0, 1] },
      { category: "events", title: { bn: "বার্ষিক ক্রীড়া প্রতিযোগিতা", en: "Annual Sports Day" }, photos: [2, 3] },
      { category: "activities", title: { bn: "শ্রেণিকক্ষ কার্যক্রম", en: "Classroom Activities" }, photos: [4, 5] },
    ];
    let albumOrder = 0;
    for (const album of albums) {
      albumOrder += 1;
      const categoryId = await idByCode("galleryCategory", album.category);
      const cover = galleryMedia[album.photos[0]!]!;
      const created = await prisma.galleryAlbum.create({
        data: {
          galleryCategoryId: categoryId,
          coverMediaId: cover.id,
          eventDate: new Date(`${yearNum}-0${albumOrder}-15T00:00:00Z`),
          sortOrder: albumOrder,
          isActive: true,
          galleryAlbumTranslations: { create: [{ localeCode: BN, title: album.title.bn }, { localeCode: EN, title: album.title.en }] },
        },
      });
      let photoOrder = 0;
      for (const photoIndex of album.photos) {
        photoOrder += 1;
        const media = galleryMedia[photoIndex]!;
        await prisma.galleryPhoto.create({
          data: {
            galleryAlbumId: created.id,
            mediaId: media.id,
            subjectConsentAt: new Date(),
            sortOrder: photoOrder,
            isActive: true,
            galleryPhotoTranslations: {
              create: [
                { localeCode: BN, caption: `${album.title.bn} — ছবি ${toBanglaDigits(photoOrder)}` },
                { localeCode: EN, caption: `${album.title.en} — photo ${photoOrder}` },
              ],
            },
          },
        });
      }
    }
    log("gallery_albums", `${albums.length} albums, ${galleryColors.length} photos`);

    await prisma.galleryVideo.create({
      data: {
        videoProviderCode: "youtube",
        providerVideoId: "sample-dev-fixture-001",
        publishedOn: new Date(),
        isActive: true,
        galleryVideoTranslations: {
          create: [
            { localeCode: BN, title: "বিদ্যালয় পরিচিতি (নমুনা ভিডিও)", description: "এটি একটি নমুনা ভিডিও এন্ট্রি — প্রকৃত ভিডিও নয়।" },
            { localeCode: EN, title: "School Introduction (sample video)", description: "This is a sample video entry, not a real, playable video." },
          ],
        },
      },
    });
    log("gallery_videos", "1 sample entry (non-resolving id — proves the embed template renders, not a real video)");
  } else {
    log("gallery_albums", "already populated, skipped");
  }

  console.log("\nDev content fixture complete. See the summary above for what was created vs. already present.");
}

main()
  .catch((error: unknown) => {
    console.error("Fixture failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
