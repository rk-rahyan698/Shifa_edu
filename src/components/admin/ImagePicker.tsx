"use client";

/**
 * `ImagePicker` (T-051) — upload and choose an image asset.
 *
 * A thin client over T-037's `POST /api/upload`. It re-implements none of that
 * endpoint's rules: MIME sniffing, the size ceiling, re-encoding, variant
 * generation and deduplication all happen server-side, and this component's
 * client-side `accept` and size hint are **conveniences, not checks** — they
 * save a doomed 5MB round trip, and the server refuses anything they let past.
 *
 * **Alt text in Bangla is required before upload.** §A-16.2 and the M5 module
 * contracts (T-061: "every uploaded image requires alt text in Bangla before
 * save") make this a content rule, not an accessibility nicety — an image
 * published without it is a page a screen-reader user cannot read. Bangla only:
 * English alt text follows §A-7.3 and is optional, flagged rather than demanded.
 *
 * The endpoint answers `201` for a new asset and `200` for a deduplicated one
 * (T-037) — both are successes and both return the asset, so this component
 * treats any 2xx alike and surfaces `deduplicated` only as information.
 *
 * What comes back is a **storage key, never a URL** (T-037's Contract): a public
 * URL is built by the CDN helper and a private one has to be signed at the
 * moment of use. The preview below therefore renders the local `File` through
 * `URL.createObjectURL`, not anything the server returned.
 */

import { useEffect, useId, useRef, useState } from "react";

import { IMAGE_MAX_BYTES } from "@/lib/upload";

/** What the picker hands back — mirrors the upload route's success body. */
export type PickedAsset = {
  id: string;
  uid: string;
  storageKey: string;
  mimeType: string;
  widthPx: number | null;
  heightPx: number | null;
  deduplicated: boolean;
};

export type ImagePickerLabels = {
  choose: string;
  uploading: string;
  altBangla: string;
  altEnglish: string;
  altRequired: string;
  required: string;
  optional: string;
  remove: string;
  tooLarge: string;
  failed: string;
};

export type ImagePickerProps = {
  label: string;
  labels: ImagePickerLabels;
  onUploaded: (asset: PickedAsset) => void;
  /** `public` for anything the site renders; `private` for signed-URL assets. */
  bucket?: "public" | "private";
  accept?: string;
};

export function ImagePicker({
  label,
  labels,
  onUploaded,
  bucket = "public",
  accept = "image/jpeg,image/png,image/webp",
}: ImagePickerProps) {
  const fileId = useId();
  const altBnId = useId();
  const altEnId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altBn, setAltBn] = useState("");
  const [altEn, setAltEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are revoked when the file changes or the component unmounts;
  // leaving them allocated pins the whole image in memory for the session.
  useEffect(() => {
    if (file === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next: File | null) {
    setError(null);
    if (next !== null && next.size > IMAGE_MAX_BYTES) {
      // A hint, not a gate — see the module header. The server enforces it.
      setError(labels.tooLarge);
      setFile(null);
      return;
    }
    setFile(next);
  }

  function reset() {
    setFile(null);
    setAltBn("");
    setAltEn("");
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  const altMissing = altBn.trim() === "";
  const canUpload = file !== null && !altMissing && !busy;

  async function upload() {
    if (file === null || altMissing) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("bucket", bucket);
      body.set("altText.bn", altBn.trim());
      if (altEn.trim() !== "") body.set("altText.en", altEn.trim());

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        // The endpoint's refusals carry `{ error, message }`; the message is
        // already safe to show — it never echoes the submitted values (§A-12).
        const problem = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(problem?.message ?? labels.failed);
        return;
      }

      onUploaded((await response.json()) as PickedAsset);
      reset();
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <label htmlFor={fileId} className="label">
        {label}
      </label>

      <input
        ref={inputRef}
        id={fileId}
        type="file"
        accept={accept}
        className="input"
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />

      {previewUrl !== null && (
        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/*
            `next/image` is not used here: this is a local object URL for a file
            that has not been stored yet, so there is nothing for the optimizer
            to fetch and no remote pattern to configure.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={altBn.trim() === "" ? "" : altBn}
            className="max-h-40 rounded-card border border-border"
          />

          <div className="min-w-64 flex-1">
            <label htmlFor={altBnId} className="label flex items-center gap-2">
              <span>{labels.altBangla}</span>
              <span className="text-caption font-normal text-danger">
                {labels.required}
              </span>
            </label>
            <input
              id={altBnId}
              lang="bn"
              type="text"
              className="input"
              value={altBn}
              aria-invalid={altMissing || undefined}
              onChange={(event) => setAltBn(event.target.value)}
            />
            {altMissing && <p className="field-error">{labels.altRequired}</p>}

            <label htmlFor={altEnId} className="label mt-3 flex items-center gap-2">
              <span>{labels.altEnglish}</span>
              <span className="text-caption font-normal text-ink-muted">
                {labels.optional}
              </span>
            </label>
            <input
              id={altEnId}
              lang="en"
              type="text"
              className="input"
              value={altEn}
              onChange={(event) => setAltEn(event.target.value)}
            />
          </div>
        </div>
      )}

      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {file !== null && (
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!canUpload}
            onClick={upload}
          >
            {busy ? labels.uploading : labels.choose}
          </button>
          <button type="button" className="btn-secondary" onClick={reset}>
            {labels.remove}
          </button>
        </div>
      )}
    </div>
  );
}
