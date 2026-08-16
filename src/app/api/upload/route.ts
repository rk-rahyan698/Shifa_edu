/**
 * The upload endpoint (T-037), the single door into §A-10.3's pipeline.
 *
 * A Route Handler rather than a Server Action because the payload is a file:
 * multipart streaming, an explicit content-type contract and real HTTP status
 * codes all matter to an uploader, and a rejected 20 MB scan should be answered
 * with `413` rather than a serialized action error.
 *
 * The order of the guards mirrors §A-5.1's mandatory stages — authenticate,
 * authorize, rate-limit, then validate — and none of them may be reordered.
 * Rate limiting sits after authorization on purpose: the bucket is keyed on a
 * user id (§A-12, 20/hour), which does not exist until the session has been
 * verified, and limiting before authorizing would let an unauthenticated caller
 * exhaust somebody else's quota.
 *
 * Nothing in this file decides whether a file is safe. That decision belongs to
 * `processUpload`, which is the only code that looks at the bytes.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { readSessionCookie } from "@/lib/cookies";
import { assertCan, ForbiddenError, loadPermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { consumeUpload } from "@/lib/rate-limit";
import { verifySession } from "@/lib/session";
import { DEFAULT_BUCKET, type Bucket } from "@/lib/storage";
import { processUpload, UploadRejectedError } from "@/lib/upload";
import { mediaBucket } from "@/lib/validation/media";
import { LIMITS, multilineText, plainText } from "@/lib/validation/primitives";

/**
 * The Node.js runtime, not Edge: the pipeline uses `node:crypto` for the
 * checksum and SigV4, and the image encoder is a native module. Neither exists
 * on Edge, and a silent fallback there would mean unprocessed uploads.
 */
export const runtime = "nodejs";

/** Every request carries a session cookie and a body; none of it may be cached. */
export const dynamic = "force-dynamic";

/**
 * The form fields beside the file.
 *
 * Alt text is required in Bangla and optional in English — §A-7.3's rule,
 * applied here through the same primitives every other module uses. It is not
 * optional in both: §A-13 gates every PR on `axe-core`, and an image with no
 * alt text is an image a screen reader cannot announce.
 */
const uploadFieldsSchema = z.object({
  bucket: mediaBucket.default(DEFAULT_BUCKET),
  translations: z
    .object({
      bn: z
        .object({ altText: plainText(LIMITS.text), caption: multilineText(LIMITS.text) })
        .strict(),
      en: z
        .object({ altText: plainText(LIMITS.text), caption: multilineText(LIMITS.text) })
        .strict()
        .optional(),
    })
    .strict(),
});

/** HTTP status per refusal reason. `too_large` is the only one that is not 415. */
const REJECTION_STATUS: Record<string, number> = {
  empty: 400,
  too_large: 413,
  unsupported_type: 415,
  type_mismatch: 415,
  corrupt_image: 415,
  processing_unavailable: 503,
};

export async function POST(request: Request): Promise<NextResponse> {
  const token = await readSessionCookie();
  if (token === null) return problem(401, "unauthenticated", "Sign in to upload files");

  const session = await verifySession(token);
  if (session === null) {
    return problem(401, "unauthenticated", "The session has expired");
  }

  const account = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, roleCode: true, isActive: true },
  });

  if (account === null || !account.isActive) {
    return problem(403, "forbidden", "This account cannot upload files");
  }

  const { permissions, specialGrants } = await loadPermissions(account.id);

  try {
    assertCan(
      {
        id: account.id,
        roleCode: account.roleCode,
        isActive: account.isActive,
        permissions,
        specialGrants,
      },
      "media",
      "add",
    );
  } catch (cause) {
    if (cause instanceof ForbiddenError) {
      return problem(403, "forbidden", "You do not have permission to upload files");
    }
    throw cause;
  }

  const limit = await consumeUpload(account.id);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many uploads. Try again shortly.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem(400, "malformed_body", "Expected a multipart/form-data body");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return problem(400, "missing_file", "No file was included in the request");
  }

  const fields = uploadFieldsSchema.safeParse({
    bucket: form.get("bucket") ?? undefined,
    translations: {
      bn: {
        altText: form.get("altText.bn") ?? "",
        caption: form.get("caption.bn") ?? "",
      },
      ...(hasValue(form, "altText.en")
        ? {
            en: {
              altText: form.get("altText.en") ?? "",
              caption: form.get("caption.en") ?? "",
            },
          }
        : {}),
    },
  });

  if (!fields.success) {
    return NextResponse.json(
      {
        error: "invalid_fields",
        // Field paths only. The submitted values are echoed back to nobody:
        // an error response is a log line waiting to happen (§A-12).
        issues: fields.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await processUpload({
      bytes: new Uint8Array(await file.arrayBuffer()),
      // Kept for display in the media library only. It never reaches a storage
      // key — `randomStorageKey` owns that namespace (T-037 Contract).
      originalFilename: file.name === "" ? null : file.name,
      bucket: fields.data.bucket as Bucket,
      translations: fields.data.translations,
      actor: { id: account.id },
      ip: clientIp(request),
    });

    return NextResponse.json(
      {
        id: String(result.id),
        uid: result.uid,
        bucket: result.bucket,
        mimeType: result.mimeType,
        byteSize: result.byteSize,
        widthPx: result.widthPx,
        heightPx: result.heightPx,
        // The storage key is returned, never a URL: a public URL is built by
        // the CDN helper and a private one must be signed at the moment of use,
        // so a URL baked into this response would either leak or expire.
        storageKey: result.storageKey,
        variants: result.variants.map((variant) => ({
          variantCode: variant.variantCode,
          storageKey: variant.storageKey,
          mimeType: variant.mimeType,
          byteSize: variant.byteSize,
          widthPx: variant.widthPx,
          heightPx: variant.heightPx,
        })),
        deduplicated: result.deduplicated,
      },
      // A deduplicated upload created nothing, so it is a 200 rather than a
      // 201 — the client still gets the asset it asked for.
      { status: result.deduplicated ? 200 : 201 },
    );
  } catch (cause) {
    if (cause instanceof UploadRejectedError) {
      return problem(
        REJECTION_STATUS[cause.reason] ?? cause.status,
        cause.reason,
        rejectionMessage(cause.reason),
      );
    }
    throw cause;
  }
}

/**
 * A refusal, in the shape every admin fetch already expects.
 *
 * The message is generic by design. `cause.message` names byte counts, MIME
 * types and host details that belong in the server log, not in a response an
 * uploader — or whoever is probing the endpoint — can read.
 */
function problem(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status });
}

function rejectionMessage(reason: string): string {
  switch (reason) {
    case "empty":
      return "The file is empty";
    case "too_large":
      return "The file is larger than the limit for its type";
    case "type_mismatch":
    case "unsupported_type":
      return "Only JPEG, PNG, WebP, AVIF and PDF files can be uploaded";
    case "corrupt_image":
      return "The image could not be read";
    default:
      return "Uploads are temporarily unavailable";
  }
}

function hasValue(form: FormData, field: string): boolean {
  const value = form.get(field);
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The client IP, for the audit row.
 *
 * `x-forwarded-for` is a chain the deploy's proxy appends to, so the first
 * entry is the original client. It is trusted only because T-123 terminates
 * traffic at a proxy that rewrites the header; it is evidence for T-122's
 * anomaly alerts, never an input to an authorization decision.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip");
}
