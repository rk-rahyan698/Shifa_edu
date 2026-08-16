/**
 * The upload pipeline (T-037), transcribed from ARCHITECTURE.md §A-10.3.
 *
 * The order of the stages is the security property, not a style choice:
 *
 * ```
 * receive → size cap by type → sniff MIME from FILE BYTES → reject on mismatch
 *         → strip EXIF → randomized storage key
 *         → images: resize ≤1920, 400 + 800 variants, AVIF + WebP + fallback
 *         → checksum → dedupe → INSERT media_assets → audit
 * ```
 *
 * Every one of those steps exists because the step before it cannot be trusted.
 * The declared `Content-Type` and the filename extension are attacker-supplied
 * strings; only `sniffMimeType` looks at what the file actually is, which is why
 * a `.exe` renamed `.jpg` dies here rather than in the bucket. EXIF is stripped
 * because a photograph taken at a school carries the school's GPS coordinates,
 * and §A-16.2 treats that as a real risk rather than a theoretical one. The key
 * is randomized because the uploader's filename is theirs, not the namespace's.
 *
 * Limits are enforced **server-side** (§A-10.3): images 5 MB, PDFs 10 MB. A
 * client-side limit is a courtesy to the person uploading, never a control.
 *
 * Videos are never uploaded — §A-10.3 is explicit that `gallery_videos` holds
 * provider embeds — so no video type appears in `ACCEPTED_TYPES` and there is
 * no branch here that would accept one.
 */

import { createHash } from "node:crypto";

import { writeAudit, type AuditActorInput } from "@/lib/audit";
import { LOCALES, type Locale } from "@/lib/locale";
import type { Bucket } from "@/lib/storage";

/**
 * The default bucket, restated rather than imported.
 *
 * `storage.ts` reads `env` at module scope, and importing a value from it here
 * would make this module — `sniffMimeType` included — unloadable without a
 * fully configured environment. The two must not drift, which is why this is a
 * literal the type system pins to `Bucket` rather than a second opinion.
 */
const DEFAULT_BUCKET: Bucket = "private";

/**
 * Prisma and the storage client are imported per call rather than at module
 * scope, the same way `issueSession` (T-032) and `loadPermissions` (T-031) do
 * it. `sniffMimeType` and the accept list are pure, and a caller that only
 * inspects bytes should not have to configure a database and a bucket first —
 * which is precisely what T-113's content gates need.
 */
async function db() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

async function storage() {
  return import("@/lib/storage");
}

/** What a caller may upload, and the cap each kind carries (§A-10.3). */
export type AcceptedType = {
  mimeType: string;
  extension: string;
  /** Server-side ceiling in bytes. */
  maxBytes: number;
  /** Images are resized and get variants; documents are stored as they arrive. */
  kind: "image" | "document";
};

/** Images: 5 MB. PDFs: 10 MB. §A-10.3, not negotiable per call site. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The complete accept list. A type absent here is rejected — the pipeline has
 * no "unknown but probably fine" branch, because that is the branch every
 * upload exploit is written for.
 */
export const ACCEPTED_TYPES: readonly AcceptedType[] = [
  { mimeType: "image/jpeg", extension: "jpg", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  { mimeType: "image/png", extension: "png", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  { mimeType: "image/webp", extension: "webp", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  { mimeType: "image/avif", extension: "avif", maxBytes: IMAGE_MAX_BYTES, kind: "image" },
  {
    mimeType: "application/pdf",
    extension: "pdf",
    maxBytes: PDF_MAX_BYTES,
    kind: "document",
  },
];

/** The longest edge a stored original may have (§A-10.3). */
export const MAX_IMAGE_EDGE_PX = 1920;

/** The two derivative widths §A-10.3 names. */
export const VARIANT_WIDTHS = [400, 800] as const;

/** Encodings generated for every image, plus the source format as a fallback. */
const MODERN_FORMATS = [
  { format: "avif" as const, mimeType: "image/avif", extension: "avif" },
  { format: "webp" as const, mimeType: "image/webp", extension: "webp" },
];

/** Why an upload was refused. The route maps these to status codes. */
export type UploadRejectionReason =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "type_mismatch"
  | "corrupt_image"
  | "processing_unavailable";

/**
 * Thrown for every refusal, carrying the reason as a code rather than a
 * sentence — the message is for the log, the code is for the caller and for the
 * translated string the admin UI shows (T-071).
 */
export class UploadRejectedError extends Error {
  override readonly name = "UploadRejectedError";
  readonly reason: UploadRejectionReason;
  readonly status: number;

  constructor(reason: UploadRejectionReason, message: string) {
    super(message);
    this.reason = reason;
    this.status = reason === "processing_unavailable" ? 503 : 415;
  }
}

/** Alt text and caption, in the locales §A-7.3 requires (Bangla always). */
export type UploadTranslations = {
  bn: { altText: string; caption?: string | null };
  en?: { altText: string; caption?: string | null };
};

export type ProcessUploadInput = {
  /** The raw bytes as received. Nothing has looked at them yet. */
  bytes: Uint8Array;
  /** The uploader's filename, kept for display only — never used as a key. */
  originalFilename?: string | null;
  /**
   * Where it goes. Omitted means `private` (§A-10.2): publication is an
   * explicit act, so a caller that wants a CDN-served file says so.
   */
  bucket?: Bucket;
  translations: UploadTranslations;
  /** Who uploaded it, for `uploaded_by_user_id` and the audit row. */
  actor: AuditActorInput;
  /** Request IP, for the audit trail (T-122's anomaly alerts read it). */
  ip?: string | null;
};

export type StoredVariant = {
  variantCode: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
};

export type UploadResult = {
  id: bigint;
  uid: string;
  bucket: Bucket;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  checksumSha256: string;
  variants: readonly StoredVariant[];
  /** True when the checksum matched a live asset and nothing new was stored. */
  deduplicated: boolean;
};

/**
 * Identifies a file from its first bytes.
 *
 * Magic numbers only. The extension is not consulted and neither is any header
 * the client sent — this function is the single point in the system that knows
 * what a file *is*, and giving it a second, cheaper source of truth would
 * defeat it.
 *
 * Returns `null` for anything not on the accept list, which is the fail-closed
 * direction: an unrecognised file is refused, never stored "just in case".
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  // RIFF....WEBP — the four size bytes at offset 4 are skipped deliberately.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && matchesAt(bytes, 8, "WEBP")) {
    return "image/webp";
  }

  // ISO-BMFF: `ftyp` at offset 4, then a brand. AVIF and its sequence variant
  // share the container with HEIC, so the brand is what distinguishes them.
  if (matchesAt(bytes, 4, "ftyp")) {
    const brand = readAscii(bytes, 8, 4);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }

  return null;
}

/** The accept-list entry for a sniffed type, or `undefined` if unsupported. */
export function acceptedTypeFor(mimeType: string): AcceptedType | undefined {
  return ACCEPTED_TYPES.find((entry) => entry.mimeType === mimeType);
}

/**
 * Runs the whole pipeline and returns the registry row.
 *
 * A duplicate — same SHA-256, same bucket, not soft-deleted — returns the
 * existing asset untouched and stores nothing. §A-10.1 lists dedupe as one of
 * the reasons the registry exists: the school's letterhead uploaded by four
 * people is one object, and four `media_assets` rows would mean four different
 * alt texts for the same image.
 */
export async function processUpload(input: ProcessUploadInput): Promise<UploadResult> {
  const bucket = input.bucket ?? DEFAULT_BUCKET;
  const bytes = input.bytes;

  if (bytes.byteLength === 0) {
    throw new UploadRejectedError("empty", "The uploaded file is empty");
  }

  // Sniff before the cap so the cap that applies is the one for what the file
  // really is — a 9 MB "image" must be refused as an oversized image, not
  // admitted under a PDF's larger ceiling because it claimed to be one.
  const sniffed = sniffMimeType(bytes);
  if (sniffed === null) {
    throw new UploadRejectedError(
      "unsupported_type",
      "The file's contents are not a supported image or PDF",
    );
  }

  const accepted = acceptedTypeFor(sniffed);
  if (accepted === undefined) {
    throw new UploadRejectedError("unsupported_type", `${sniffed} is not accepted`);
  }

  if (bytes.byteLength > accepted.maxBytes) {
    throw new UploadRejectedError(
      "too_large",
      `${sniffed} may be at most ${accepted.maxBytes} bytes, got ${bytes.byteLength}`,
    );
  }

  // The checksum is taken over the bytes as received, before any re-encoding:
  // dedupe must recognise the same upload twice, and an encoder that is not
  // byte-for-byte deterministic would otherwise defeat it.
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const existing = await findLiveAssetByChecksum(checksum, bucket);
  if (existing !== null) return existing;

  const processed =
    accepted.kind === "image"
      ? await processImage(bytes, accepted)
      : { bytes, mimeType: accepted.mimeType, widthPx: null, heightPx: null };

  const { putObject, randomStorageKey } = await storage();

  const storageKey = randomStorageKey(
    accepted.kind === "image" ? "images" : "documents",
    extensionFor(processed.mimeType, accepted),
  );

  await putObject({
    bucket,
    key: storageKey,
    body: processed.bytes,
    contentType: processed.mimeType,
  });

  const variants =
    accepted.kind === "image"
      ? await buildVariants(bytes, bucket, storageKey, accepted)
      : [];

  return persist({
    bucket,
    storageKey,
    originalFilename: input.originalFilename ?? null,
    mimeType: processed.mimeType,
    byteSize: processed.bytes.byteLength,
    widthPx: processed.widthPx,
    heightPx: processed.heightPx,
    checksum,
    variants,
    translations: input.translations,
    actor: input.actor,
    ip: input.ip ?? null,
  });
}

type ProcessedImage = {
  bytes: Uint8Array;
  mimeType: string;
  widthPx: number | null;
  heightPx: number | null;
};

/**
 * Re-encodes an image: EXIF gone, longest edge capped at 1920.
 *
 * The re-encode *is* the EXIF strip. Excising the metadata blocks by hand would
 * mean parsing four container formats and getting all four right; decoding to
 * pixels and encoding fresh discards every ancillary chunk by construction,
 * GPS included, and there is no format-specific case to forget.
 *
 * Orientation is applied before the metadata is dropped, so a photo taken on a
 * phone stays the right way up once the EXIF tag that said so is gone.
 */
async function processImage(
  bytes: Uint8Array,
  accepted: AcceptedType,
): Promise<ProcessedImage> {
  const sharp = await loadSharp();
  const pipeline = sharp(bytes, { failOn: "error" }).rotate();

  const metadata = await readMetadata(pipeline.clone());

  const resized = pipeline.resize({
    width: MAX_IMAGE_EDGE_PX,
    height: MAX_IMAGE_EDGE_PX,
    fit: "inside",
    // Never scale a small image up: an enlarged 200px logo is a blurry logo
    // and a larger file, which is the wrong trade in both directions.
    withoutEnlargement: true,
  });

  const output = await encode(resized, accepted.mimeType);

  return {
    bytes: output.data,
    mimeType: accepted.mimeType,
    widthPx: output.width,
    heightPx: output.height ?? metadata.height,
  };
}

/**
 * The derivative set: 400 and 800 wide, each as AVIF and WebP, plus the source
 * format at each width as the fallback §A-10.3 asks for.
 *
 * Variants are generated from the bytes as received rather than from the capped
 * original, so a 400px thumbnail is one resample from the source instead of two
 * — resampling twice visibly softens text in a scanned notice.
 */
async function buildVariants(
  bytes: Uint8Array,
  bucket: Bucket,
  originalKey: string,
  accepted: AcceptedType,
): Promise<readonly StoredVariant[]> {
  const sharp = await loadSharp();
  const source = sharp(bytes, { failOn: "error" }).rotate();

  const formats = [
    ...MODERN_FORMATS,
    { format: null, mimeType: accepted.mimeType, extension: accepted.extension },
  ];

  const { putObject, variantStorageKey } = await storage();
  const stored: StoredVariant[] = [];

  for (const width of VARIANT_WIDTHS) {
    for (const target of formats) {
      const resized = source
        .clone()
        .resize({ width, fit: "inside", withoutEnlargement: true });

      const output = await encode(resized, target.mimeType);
      const variantCode = `w${width}_${target.extension}`;
      const key = variantStorageKey(originalKey, variantCode, target.extension);

      await putObject({
        bucket,
        key,
        body: output.data,
        contentType: target.mimeType,
      });

      stored.push({
        variantCode,
        storageKey: key,
        mimeType: target.mimeType,
        byteSize: output.data.byteLength,
        widthPx: output.width,
        heightPx: output.height,
      });
    }
  }

  return stored;
}

type EncodedImage = {
  data: Uint8Array;
  width: number | null;
  height: number | null;
};

/**
 * Encodes to one of the four supported image types.
 *
 * Metadata is *not* carried over — sharp drops it unless `withMetadata()` is
 * called, and it deliberately is not. Quality settings favour size: these are a
 * school's pages on connections that are frequently mobile, and §A-11's budget
 * is measured in transferred bytes.
 */
async function encode(pipeline: SharpPipeline, mimeType: string): Promise<EncodedImage> {
  const configured =
    mimeType === "image/avif"
      ? pipeline.avif({ quality: 55 })
      : mimeType === "image/webp"
        ? pipeline.webp({ quality: 80 })
        : mimeType === "image/png"
          ? pipeline.png({ compressionLevel: 9 })
          : pipeline.jpeg({ quality: 82, mozjpeg: true });

  try {
    const result = await configured.toBuffer({ resolveWithObject: true });
    return {
      data: new Uint8Array(result.data),
      width: result.info.width ?? null,
      height: result.info.height ?? null,
    };
  } catch (cause) {
    // Reaching here means the bytes passed the magic-number check but are not a
    // decodable image — a truncated upload, or a header glued to something else.
    throw new UploadRejectedError(
      "corrupt_image",
      `The image could not be decoded: ${String(cause)}`,
    );
  }
}

async function readMetadata(
  pipeline: SharpPipeline,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const metadata = await pipeline.metadata();
    return { width: metadata.width ?? null, height: metadata.height ?? null };
  } catch {
    return { width: null, height: null };
  }
}

type PersistInput = {
  bucket: Bucket;
  storageKey: string;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  checksum: string;
  variants: readonly StoredVariant[];
  translations: UploadTranslations;
  actor: AuditActorInput;
  ip: string | null;
};

/**
 * Writes the registry row, its translations, its variants and the audit entry —
 * in one transaction.
 *
 * Splitting the audit write out would allow an asset that nobody is recorded as
 * having uploaded, which is exactly the gap §A-5.1 closes by making persist and
 * audit a single stage. T-038 generalises this for every admin mutation; the
 * upload endpoint predates that helper and inlines the same discipline.
 */
async function persist(input: PersistInput): Promise<UploadResult> {
  const prisma = await db();

  return prisma.$transaction(async (tx) => {
    const asset = await tx.mediaAsset.create({
      data: {
        bucket: input.bucket,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        byteSize: BigInt(input.byteSize),
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        checksumSha256: input.checksum,
        uploadedByUserId: input.actor.id,
        mediaAssetTranslations: {
          create: translationRows(input.translations),
        },
        mediaVariants: {
          create: input.variants.map((variant) => ({
            variantCode: variant.variantCode,
            storageKey: variant.storageKey,
            mimeType: variant.mimeType,
            byteSize: BigInt(variant.byteSize),
            widthPx: variant.widthPx,
            heightPx: variant.heightPx,
          })),
        },
      },
      select: { id: true, uid: true },
    });

    await writeAudit(tx, {
      actor: input.actor,
      action: "create",
      module: "media",
      entityTable: "media_assets",
      entityId: asset.id,
      summary: `Uploaded ${input.mimeType} to the ${input.bucket} bucket`,
      // The filename is the only uploader-supplied string worth keeping: it is
      // how a person recognises their own file in the log. The storage key is
      // recorded beside it because it is what an operator would go looking for.
      diff: {
        storageKey: { from: null, to: input.storageKey },
        originalFilename: { from: null, to: input.originalFilename },
        byteSize: { from: null, to: input.byteSize },
      },
      ip: input.ip,
    });

    return {
      id: asset.id,
      uid: asset.uid,
      bucket: input.bucket,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      checksumSha256: input.checksum,
      variants: input.variants,
      deduplicated: false,
    };
  });
}

/** Bangla is required, English optional — §A-7.3, enforced by `translationSet`. */
function translationRows(
  translations: UploadTranslations,
): { localeCode: Locale; altText: string; caption: string | null }[] {
  return LOCALES.flatMap((locale) => {
    const entry = translations[locale];
    if (entry === undefined) return [];
    return [
      {
        localeCode: locale,
        altText: entry.altText,
        caption: entry.caption ?? null,
      },
    ];
  });
}

/**
 * The live asset with this checksum in this bucket, if there is one.
 *
 * Scoped to the bucket on purpose: the same bytes in `public` and in `private`
 * are two different access decisions, and collapsing them would silently
 * publish a private file the moment someone uploaded it again publicly.
 * Soft-deleted rows are skipped so a restore-by-re-upload works (§A-10.4).
 */
async function findLiveAssetByChecksum(
  checksum: string,
  bucket: Bucket,
): Promise<UploadResult | null> {
  const prisma = await db();

  const asset = await prisma.mediaAsset.findFirst({
    where: { checksumSha256: checksum, bucket, deletedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      uid: true,
      storageKey: true,
      mimeType: true,
      byteSize: true,
      widthPx: true,
      heightPx: true,
      mediaVariants: {
        select: {
          variantCode: true,
          storageKey: true,
          mimeType: true,
          byteSize: true,
          widthPx: true,
          heightPx: true,
        },
      },
    },
  });

  if (asset === null) return null;

  return {
    id: asset.id,
    uid: asset.uid,
    bucket,
    storageKey: asset.storageKey,
    mimeType: asset.mimeType,
    byteSize: Number(asset.byteSize),
    widthPx: asset.widthPx,
    heightPx: asset.heightPx,
    checksumSha256: checksum,
    variants: asset.mediaVariants.map((variant) => ({
      variantCode: variant.variantCode,
      storageKey: variant.storageKey,
      mimeType: variant.mimeType,
      byteSize: Number(variant.byteSize),
      widthPx: variant.widthPx,
      heightPx: variant.heightPx,
    })),
    deduplicated: true,
  };
}

function extensionFor(mimeType: string, fallback: AcceptedType): string {
  return acceptedTypeFor(mimeType)?.extension ?? fallback.extension;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function matchesAt(bytes: Uint8Array, offset: number, ascii: string): boolean {
  return readAscii(bytes, offset, ascii.length) === ascii;
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (bytes.byteLength < offset + length) return null;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/**
 * The image processor, resolved at call time.
 *
 * `sharp` carries platform-specific native binaries, and a deployment target
 * that lacks one must fail loudly at upload rather than at boot — the public
 * site does not process images and should still serve if the encoder is
 * missing. Storing the bytes unprocessed is never the fallback: that would ship
 * an un-stripped photograph, EXIF and GPS intact, which is the one outcome
 * §A-10.3 exists to prevent.
 */
async function loadSharp(): Promise<SharpFactory> {
  try {
    const loaded = (await import("sharp")) as unknown as {
      default?: SharpFactory;
    } & SharpFactory;
    return loaded.default ?? loaded;
  } catch (cause) {
    throw new UploadRejectedError(
      "processing_unavailable",
      `The image processor is unavailable on this host: ${String(cause)}`,
    );
  }
}

/**
 * The slice of sharp's surface this module uses.
 *
 * Declared structurally rather than imported as a type: `sharp` is resolved
 * dynamically above, and a top-level `import type` from it would make the
 * typecheck depend on a package that may legitimately be absent.
 */
type SharpPipeline = {
  clone: () => SharpPipeline;
  rotate: () => SharpPipeline;
  resize: (options: {
    width?: number;
    height?: number;
    fit?: "inside";
    withoutEnlargement?: boolean;
  }) => SharpPipeline;
  avif: (options: { quality: number }) => SharpPipeline;
  webp: (options: { quality: number }) => SharpPipeline;
  png: (options: { compressionLevel: number }) => SharpPipeline;
  jpeg: (options: { quality: number; mozjpeg: boolean }) => SharpPipeline;
  metadata: () => Promise<{ width?: number; height?: number }>;
  toBuffer: (options: { resolveWithObject: true }) => Promise<{
    data: Buffer;
    info: { width?: number; height?: number };
  }>;
};

type SharpFactory = (input: Uint8Array, options?: { failOn?: "error" }) => SharpPipeline;
