"use client";

/**
 * A PDF slot: what is stored now, and an upload that replaces it.
 *
 * **This exists instead of T-051's `ImagePicker`, and not by preference.**
 * `ImagePicker.tsx` imports `IMAGE_MAX_BYTES` from `@/lib/upload`, and
 * `@/lib/upload` imports `sharp` and `node:crypto` at module scope — so any
 * route that mounts the picker fails `npm run build` with
 * `UnhandledSchemeError: node:events`. T-060 hit it first; the fix belongs to a
 * new card, because `src/components/admin/**` is T-051's and a done task's
 * output is not revised. When that card lands, this file and its twins should
 * be deleted and the props swapped back.
 *
 * It differs from the `MediaField` twins in one substantive way: a routine is a
 * **document**, not a picture. There is nothing to preview, the ceiling is
 * T-037's 10 MB PDF limit rather than the 5 MB image one, and the required
 * Bangla string is a description of the file rather than alt text for an
 * image — a screen reader announcing "class 5 routine, 2026" is describing a
 * link, which is what a PDF attachment is.
 *
 * No rule is reimplemented. The upload still goes to T-037's
 * `POST /api/upload`, which owns MIME sniffing, the size ceiling and
 * deduplication.
 */

import { useId, useRef, useState } from "react";

import type { Copy } from "@/app/(admin)/admin/academics/copy";

/**
 * T-037's `PDF_MAX_BYTES`, mirrored as a literal.
 *
 * Importing the constant is what breaks the build (see the header). Ten
 * megabytes is a hint shown to the admin; `/api/upload` refuses anything past
 * its own limit regardless of what this says, so a drift here costs one wasted
 * request and never a wrong outcome.
 */
const PDF_MAX_BYTES_HINT = 10 * 1024 * 1024;

/** The success body of `POST /api/upload`, in the part this component uses. */
export type UploadedAsset = { id: string; uid: string; storageKey: string };

export type DocumentFieldProps = {
  label: string;
  copy: Copy;
  /** The asset currently held by the draft, or null. */
  mediaId: string | null;
  disabled?: boolean;
  onUploaded: (asset: UploadedAsset) => void;
  onCleared: () => void;
};

export function DocumentField({
  label,
  copy,
  mediaId,
  disabled = false,
  onUploaded,
  onCleared,
}: DocumentFieldProps) {
  const fileId = useId();
  const labelBnId = useId();
  const labelEnId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [describeBn, setDescribeBn] = useState("");
  const [describeEn, setDescribeEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionMissing = describeBn.trim() === "";
  const canUpload = file !== null && !descriptionMissing && !busy;

  function selectFile(next: File | null) {
    setError(null);
    if (next !== null && next.size > PDF_MAX_BYTES_HINT) {
      setError(copy["fileTooLarge"] ?? "");
      setFile(null);
      return;
    }
    setFile(next);
  }

  function reset() {
    setFile(null);
    setDescribeBn("");
    setDescribeEn("");
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  async function upload() {
    if (file === null || descriptionMissing) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("bucket", "public");
      body.set("altText.bn", describeBn.trim());
      if (describeEn.trim() !== "") body.set("altText.en", describeEn.trim());

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        // The endpoint's refusals carry `{ error, message }`, and the message
        // never echoes the submitted values (§A-12), so it is safe to show.
        const problem = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(problem?.message ?? copy["fileFailed"] ?? "");
        return;
      }

      onUploaded((await response.json()) as UploadedAsset);
      reset();
    } catch {
      setError(copy["fileFailed"] ?? "");
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
          ? (copy["fileNone"] ?? "")
          : `${copy["fileCurrent"] ?? ""}${mediaId}`}
      </p>

      <input
        ref={inputRef}
        id={fileId}
        type="file"
        accept="application/pdf"
        className="input mt-2"
        disabled={disabled}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />

      {file !== null && (
        <div className="mt-3">
          <p className="text-caption text-ink-muted">{file.name}</p>

          <label htmlFor={labelBnId} className="label mt-3 flex items-center gap-2">
            <span>{copy["fileLabelBn"] ?? ""}</span>
            <span className="text-caption font-normal text-danger">
              {copy["requiredLabel"] ?? ""}
            </span>
          </label>
          <input
            id={labelBnId}
            lang="bn"
            type="text"
            className="input"
            value={describeBn}
            aria-invalid={descriptionMissing || undefined}
            onChange={(event) => setDescribeBn(event.target.value)}
          />
          {descriptionMissing && (
            <p className="field-error">{copy["fileLabelRequired"] ?? ""}</p>
          )}

          <label htmlFor={labelEnId} className="label mt-3 flex items-center gap-2">
            <span>{copy["fileLabelEn"] ?? ""}</span>
            <span className="text-caption font-normal text-ink-muted">
              {copy["optionalLabel"] ?? ""}
            </span>
          </label>
          <input
            id={labelEnId}
            lang="en"
            type="text"
            className="input"
            value={describeEn}
            onChange={(event) => setDescribeEn(event.target.value)}
          />

          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={!canUpload}
            aria-disabled={!canUpload}
            onClick={upload}
          >
            {busy ? (copy["fileUploading"] ?? "") : (copy["fileChoose"] ?? "")}
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
          {copy["fileRemove"] ?? ""}
        </button>
      )}
    </div>
  );
}
