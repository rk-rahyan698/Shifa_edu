"use client";

/**
 * An image slot: what is stored now, and an upload that replaces it.
 *
 * **This exists instead of T-051's `ImagePicker`, and not by preference.**
 * `ImagePicker.tsx` imports `IMAGE_MAX_BYTES` from `@/lib/upload`, and
 * `@/lib/upload` imports `sharp` and `node:crypto` at module scope — so any
 * route that mounts the picker fails `npm run build` with
 * `UnhandledSchemeError: node:events`. T-060 hit it first; the fix belongs to a
 * new card, because `src/components/admin/**` is T-051's and a done task's
 * output is not revised. When that card lands, this file and its twins should
 * be deleted and the props swapped back — they were kept close to
 * `ImagePickerProps` for exactly that.
 *
 * No rule is reimplemented. The upload still goes to T-037's
 * `POST /api/upload`, which owns MIME sniffing, the size ceiling, re-encoding,
 * variants and deduplication.
 *
 * **Bangla alt text is required before the upload is offered**, which is this
 * card's Contract met at the earliest possible moment. It is met again, and
 * authoritatively, inside the write pipeline — see `assertBanglaAltText` in
 * `src/lib/modules/home/actions.ts`. A control can be bypassed; a transaction
 * cannot.
 */

import { useEffect, useId, useRef, useState } from "react";

import type { Copy } from "@/app/admin/home/copy";

/**
 * T-037's ceiling, mirrored as a literal.
 *
 * Importing the constant is what breaks the build (see the header). Five
 * megabytes is a hint shown to the admin; `/api/upload` refuses anything past
 * its own limit regardless of what this says, so a drift here costs one wasted
 * request and never a wrong outcome.
 */
const IMAGE_MAX_BYTES_HINT = 5 * 1024 * 1024;

/** The success body of `POST /api/upload`, in the part this component uses. */
export type UploadedAsset = { id: string; uid: string; storageKey: string };

export type MediaFieldProps = {
  label: string;
  copy: Copy;
  /** The asset currently stored in this slot, or null. */
  mediaId: string | null;
  disabled?: boolean;
  onUploaded: (asset: UploadedAsset) => void;
  onCleared: () => void;
};

export function MediaField({
  label,
  copy,
  mediaId,
  disabled = false,
  onUploaded,
  onCleared,
}: MediaFieldProps) {
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

  const altMissing = altBn.trim() === "";
  const canUpload = file !== null && !altMissing && !busy;

  function selectFile(next: File | null) {
    setError(null);
    if (next !== null && next.size > IMAGE_MAX_BYTES_HINT) {
      setError(copy["pickerTooLarge"] ?? "");
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

  async function upload() {
    if (file === null || altMissing) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("bucket", "public");
      body.set("altText.bn", altBn.trim());
      if (altEn.trim() !== "") body.set("altText.en", altEn.trim());

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        // The endpoint's refusals carry `{ error, message }`, and the message
        // never echoes the submitted values (§A-12), so it is safe to show.
        const problem = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(problem?.message ?? copy["pickerFailed"] ?? "");
        return;
      }

      onUploaded((await response.json()) as UploadedAsset);
      reset();
    } catch {
      setError(copy["pickerFailed"] ?? "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label htmlFor={fileId} className="label">
        {label}
      </label>

      <p className="text-caption text-ink-muted">
        {mediaId === null
          ? (copy["pickerNone"] ?? "")
          : `${copy["pickerCurrent"] ?? ""}${mediaId}`}
      </p>

      <input
        ref={inputRef}
        id={fileId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="input mt-2"
        disabled={disabled}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />

      {previewUrl !== null && (
        <div className="mt-3">
          {/*
            A local object URL for a file that is not stored yet: there is
            nothing for `next/image` to optimize and no remote pattern to
            configure. T-037 returns a storage key, never a URL.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={altBn.trim() === "" ? "" : altBn}
            className="max-h-32 rounded-card border border-border"
          />

          <label htmlFor={altBnId} className="label mt-3 flex items-center gap-2">
            <span>{copy["pickerAltBn"] ?? ""}</span>
            <span className="text-caption font-normal text-danger">
              {copy["requiredLabel"] ?? ""}
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
          {altMissing && <p className="field-error">{copy["pickerAltRequired"] ?? ""}</p>}

          <label htmlFor={altEnId} className="label mt-3 flex items-center gap-2">
            <span>{copy["pickerAltEn"] ?? ""}</span>
            <span className="text-caption font-normal text-ink-muted">
              {copy["optionalLabel"] ?? ""}
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

          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={!canUpload}
            aria-disabled={!canUpload}
            onClick={upload}
          >
            {busy ? (copy["pickerUploading"] ?? "") : (copy["pickerChoose"] ?? "")}
          </button>
        </div>
      )}

      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {mediaId !== null && !disabled && (
        <button type="button" className="link mt-2 text-caption" onClick={onCleared}>
          {copy["pickerRemove"] ?? ""}
        </button>
      )}
    </div>
  );
}
