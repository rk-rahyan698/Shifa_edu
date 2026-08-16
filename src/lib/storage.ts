/**
 * The object-storage client (T-037), per ARCHITECTURE.md §A-10.2.
 *
 * Two buckets, and the difference between them is physical rather than
 * conventional: `public` is CDN-served under a content-addressed key, `private`
 * is reachable only through a signed URL with a 15-minute TTL and is never
 * CDN-cached. `DEFAULT_BUCKET` is `private` — publication is an explicit act
 * (P5, privacy boundaries are physical), so a caller that forgets to choose
 * gets the closed door, not the open one.
 *
 * The wire protocol is S3-compatible and is spoken directly with `fetch` and
 * `node:crypto`: SigV4 is a hash chain and a handful of canonical strings, and
 * writing it here keeps the storage provider swappable through `STORAGE_*`
 * environment variables alone. Addressing is path-style (`/bucket/key`) because
 * virtual-host style needs provider-specific DNS the school's endpoint may not
 * have.
 *
 * Storage keys are generated here and never derived from a user's filename
 * (T-037 Contract). An uploader controls the name they send; letting it reach
 * the key namespace hands them path traversal, collisions, and a URL that leaks
 * whatever the file was called on their laptop.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

/** §A-10.2's two buckets. Mirrors `media_assets.bucket`'s CHECK constraint. */
export const BUCKETS = ["public", "private"] as const;

export type Bucket = (typeof BUCKETS)[number];

/**
 * The bucket a caller gets when they do not name one.
 *
 * Private. §A-10.2 states it plainly: "Default is private; publication is an
 * explicit act." Every `public` object in this codebase is the result of
 * someone typing the word.
 */
export const DEFAULT_BUCKET: Bucket = "private";

/** Signed-URL lifetime for private objects (§A-10.2). Fifteen minutes. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** The longest TTL SigV4 permits on a presigned URL — seven days. */
const MAX_PRESIGN_TTL_SECONDS = 7 * 24 * 60 * 60;

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

/** Thrown for every storage failure, so callers catch one named type. */
export class StorageError extends Error {
  override readonly name = "StorageError";
  /** The provider's HTTP status, when the failure came from the wire. */
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export type PutObjectInput = {
  bucket: Bucket;
  key: string;
  body: Uint8Array;
  contentType: string;
  /**
   * `Cache-Control`. Public objects are content-addressed and therefore
   * immutable; private ones must never be retained by a shared cache.
   */
  cacheControl?: string;
};

export type StoredObject = {
  bucket: Bucket;
  key: string;
  byteSize: number;
  contentType: string;
};

/** The bucket name configured for each half of §A-10.2. */
export function bucketName(bucket: Bucket): string {
  return bucket === "public" ? env.STORAGE_PUBLIC_BUCKET : env.STORAGE_PRIVATE_BUCKET;
}

/**
 * The `Cache-Control` each bucket gets by default.
 *
 * A public key carries a random stem that never changes once written, so a
 * year-long immutable cache is safe. A private object gets `no-store` so no
 * proxy, CDN or browser retains something meant to be reachable for fifteen
 * minutes.
 */
export function defaultCacheControl(bucket: Bucket): string {
  return bucket === "public"
    ? "public, max-age=31536000, immutable"
    : "private, no-store";
}

/**
 * A storage key that owes nothing to the uploader.
 *
 * `prefix` is a caller-chosen folder (`images`, `documents`), the date segments
 * keep a bucket browsable and make lifecycle rules expressible, and the random
 * half is 16 bytes from `randomBytes` — not a counter, not a timestamp, not a
 * hash of anything guessable. A private key is only as private as it is
 * unguessable, since it is the thing a signature is computed over.
 */
export function randomStorageKey(prefix: string, extension: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const random = randomBytes(16).toString("hex");

  return `${normalizeSegment(prefix)}/${year}/${month}/${random}.${normalizeExtension(extension)}`;
}

/**
 * A derived key that sits beside its original.
 *
 * Variants share the original's random stem, so the orphan sweep of §A-10.4 can
 * see which objects belong together by prefix alone, without joining
 * `media_variants` back to `media_assets`.
 */
export function variantStorageKey(
  originalKey: string,
  variantCode: string,
  extension: string,
): string {
  const stem = originalKey.replace(/\.[^./]*$/, "");
  return `${stem}_${normalizeSegment(variantCode)}.${normalizeExtension(extension)}`;
}

/**
 * The CDN URL for a public object.
 *
 * There is deliberately no equivalent for the private bucket: a private object
 * has exactly one legitimate address — a signed one — and a function that
 * returned an unsigned URL for it would turn a permission boundary into an
 * intermittent bug report about broken images.
 */
export function publicUrl(key: string): string {
  return `${env.STORAGE_PUBLIC_BASE_URL}/${encodeKey(key)}`;
}

/**
 * The address to hand a browser for an object in either bucket.
 *
 * Public resolves to the CDN, private is presigned. This is the only place that
 * decides between the two, so no call site has to remember which bucket it is
 * holding.
 */
export async function objectUrl(
  bucket: Bucket,
  key: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  return bucket === "public" ? publicUrl(key) : signedUrl(key, ttlSeconds);
}

/**
 * A presigned GET URL for a private object, valid for `ttlSeconds`.
 *
 * The signature covers the key, the expiry and the credential scope, so a URL
 * cannot be edited into one for a different object or a longer life. Fifteen
 * minutes is §A-10.2's default; the seven-day ceiling is SigV4's own limit, not
 * a policy choice.
 */
export async function signedUrl(
  key: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new StorageError(
      `Signed-URL TTL must be a positive integer, got ${ttlSeconds}`,
    );
  }
  if (ttlSeconds > MAX_PRESIGN_TTL_SECONDS) {
    throw new StorageError(`Signed-URL TTL must be ${MAX_PRESIGN_TTL_SECONDS}s or less`);
  }

  const { host, path } = endpointFor("private", key);
  const stamp = timestamps(new Date());
  const scope = `${stamp.date}/${env.STORAGE_REGION}/${SERVICE}/aws4_request`;

  const query = new Map<string, string>([
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${env.STORAGE_ACCESS_KEY_ID}/${scope}`],
    ["X-Amz-Date", stamp.iso],
    ["X-Amz-Expires", String(ttlSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ]);

  const canonicalRequest = [
    "GET",
    path,
    canonicalQuery(query),
    `host:${host}\n`,
    "host",
    // A presigned URL signs no body; SigV4 names that case explicitly.
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  query.set("X-Amz-Signature", sign(canonicalRequest, stamp, scope));

  return `${env.STORAGE_ENDPOINT}${path}?${canonicalQuery(query)}`;
}

/**
 * Writes an object.
 *
 * The pipeline calls this only after the bytes have been sniffed, re-encoded
 * and stripped: nothing here inspects what it is given, and `contentType` is
 * stored as the caller states it. That ordering is the safety property — a
 * transport that also validated would invite callers to skip `upload.ts`.
 */
export async function putObject(input: PutObjectInput): Promise<StoredObject> {
  await request("PUT", input.bucket, input.key, {
    body: input.body,
    headers: {
      "content-type": input.contentType,
      "cache-control": input.cacheControl ?? defaultCacheControl(input.bucket),
    },
  });

  return {
    bucket: input.bucket,
    key: input.key,
    byteSize: input.body.byteLength,
    contentType: input.contentType,
  };
}

/** Reads an object back. Used by the restore rehearsal (T-131) and variant repair. */
export async function getObject(bucket: Bucket, key: string): Promise<Uint8Array> {
  const response = await request("GET", bucket, key, {});
  return new Uint8Array(await response.arrayBuffer());
}

/** Whether an object exists, by HEAD. A 404 is an answer here, not a failure. */
export async function objectExists(bucket: Bucket, key: string): Promise<boolean> {
  const response = await request("HEAD", bucket, key, { allowMissing: true });
  return response.status !== 404;
}

/**
 * Removes an object.
 *
 * Storage deletion is the *second* half of §A-10.4: the registry row is
 * soft-deleted first, and a weekly job hard-deletes objects for assets
 * soft-deleted more than 30 days ago and referenced by nothing. This function
 * is that job's hands, not a shortcut past it.
 */
export async function deleteObject(bucket: Bucket, key: string): Promise<void> {
  await request("DELETE", bucket, key, { allowMissing: true });
}

type RequestOptions = {
  body?: Uint8Array;
  headers?: Record<string, string>;
  /** Treat 404 as a normal outcome rather than raising. */
  allowMissing?: boolean;
};

/**
 * One signed S3 call.
 *
 * The payload is hashed into the signature rather than sent as
 * `UNSIGNED-PAYLOAD`: these objects are small, so the cost is negligible, and a
 * signed payload means bytes altered in flight fail the request instead of
 * landing in the bucket.
 */
async function request(
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  bucket: Bucket,
  key: string,
  options: RequestOptions,
): Promise<Response> {
  const { host, path } = endpointFor(bucket, key);
  const stamp = timestamps(new Date());
  const body = options.body;
  const payloadHash = createHash("sha256")
    .update(body ?? new Uint8Array())
    .digest("hex");

  const signedFields: Record<string, string> = {
    ...(options.headers ?? {}),
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp.iso,
  };

  const names = Object.keys(signedFields).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${collapse(signedFields[name] ?? "")}\n`)
    .join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${stamp.date}/${env.STORAGE_REGION}/${SERVICE}/aws4_request`;
  const signature = sign(canonicalRequest, stamp, scope);

  // `host` must be part of the signature, but `fetch` sets it itself and
  // forbids it as an explicit header — so it is signed above, then dropped.
  const wireHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(signedFields).filter(([name]) => name !== "host"),
  );
  wireHeaders["authorization"] =
    `${ALGORITHM} Credential=${env.STORAGE_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const payload = body === undefined ? undefined : toArrayBuffer(body);

  let response: Response;
  try {
    response = await fetch(`${env.STORAGE_ENDPOINT}${path}`, {
      method,
      headers: wireHeaders,
      ...(payload === undefined ? {} : { body: payload }),
      // Storage is an origin call, never a cached read: the CDN serves public
      // objects, and private ones must not be retained anywhere.
      cache: "no-store",
    });
  } catch (cause) {
    throw new StorageError(
      `Storage ${method} ${bucket}/${key} could not reach ${host}: ${String(cause)}`,
    );
  }

  if (response.status === 404 && options.allowMissing === true) return response;

  if (!response.ok) {
    throw new StorageError(
      `Storage ${method} ${bucket}/${key} returned ${response.status}`,
      response.status,
    );
  }

  return response;
}

/** The SigV4 key derivation: date, region, service, terminator — in that order. */
function sign(
  canonicalRequest: string,
  stamp: { iso: string; date: string },
  scope: string,
): string {
  const stringToSign = [
    ALGORITHM,
    stamp.iso,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");

  const dateKey = hmac(`AWS4${env.STORAGE_SECRET_ACCESS_KEY}`, stamp.date);
  const regionKey = hmac(dateKey, env.STORAGE_REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, "aws4_request");

  return createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

/**
 * A standalone `ArrayBuffer` holding exactly this view's bytes.
 *
 * `fetch` takes a buffer, not a view over one, and a `Uint8Array` from
 * `sharp` or from a pooled allocation may be a window into a larger buffer.
 * Copying the exact window is what stops the neighbouring bytes going out
 * with the request.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/** Path-style addressing: the canonical URI SigV4 signs is `/bucket/encoded/key`. */
function endpointFor(bucket: Bucket, key: string): { host: string; path: string } {
  return {
    host: new URL(env.STORAGE_ENDPOINT).host,
    path: `/${encodeURIComponent(bucketName(bucket))}/${encodeKey(key)}`,
  };
}

/** Percent-encodes each path segment but keeps the separators (SigV4's rule). */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** SigV4 requires query parameters sorted by name, both halves encoded. */
function canonicalQuery(query: ReadonlyMap<string, string>): string {
  return [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** `20260816T101530Z` and its date half, the two forms SigV4 asks for. */
function timestamps(now: Date): { iso: string; date: string } {
  const iso = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return { iso, date: iso.slice(0, 8) };
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeSegment(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  if (cleaned === "") throw new StorageError(`Not a usable key segment: ${value}`);
  return cleaned;
}

function normalizeExtension(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (cleaned === "") throw new StorageError(`Not a usable file extension: ${value}`);
  return cleaned;
}
