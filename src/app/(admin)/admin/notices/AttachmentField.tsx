"use client";

/**
 * A file upload for one new notice attachment.
 *
 * **This exists instead of T-051's `ImagePicker`, and not by preference** —
 * see `admission/DocumentField.tsx` for the full explanation: mounting the
 * picker fails `npm run build` because `@/lib/upload` pulls `sharp` and
 * `node:crypto` at module scope. This is the closest twin to that file rather
 * than to `about/MediaField.tsx`: a notice attachment is routines, seat plans
 * and syllabuses — documents, not portraits — so there is nothing to preview
 * and the required Bangla string is a label, not alt text.
 *
 * Unlike `admission`'s twin, the accept list is left open rather than pinned
 * to PDF: §B-11 does not name a file type, and a notice legitimately attaches
 * a scanned image or a spreadsheet. `/api/upload` still owns the real MIME
 * allowlist and size ceiling regardless of what this hints at.
 */

import { useId, useRef, useState } from "react";

import type { Copy } from "@/app/(admin)/admin/notices/copy";

/** A generous hint; `/api/upload` enforces its own ceiling regardless. */
const FILE_MAX_BYTES_HINT = 10 * 1024 * 1024;

/** The success body of `POST /api/upload`, in the part this component uses. */
export type UploadedAsset = { id: string; uid: string; storageKey: string };

export type AttachmentFieldProps = {
  copy: Copy;
  disabled?: boolean;
  onUploaded: (asset: UploadedAsset, labelBn: string, labelEn: string) => void;
};

export function AttachmentField({ copy, disabled = false, onUploaded }: AttachmentFieldProps) {
  const fileId = useId();
  const labelBnId = useId();
  const labelEnId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [labelBn, setLabelBn] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelMissing = labelBn.trim() === "";
  const canUpload = file !== null && !labelMissing && !busy;

  function selectFile(next: File | null) {
    setError(null);
    if (next !== null && next.size > FILE_MAX_BYTES_HINT) {
      setError(copy["fileTooLarge"] ?? "");
      setFile(null);
      return;
    }
    setFile(next);
  }

  function reset() {
    setFile(null);
    setLabelBn("");
    setLabelEn("");
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  }

  async function upload() {
    if (file === null || labelMissing) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("file", file);
      body.set("bucket", "public");
      body.set("altText.bn", labelBn.trim());
      if (labelEn.trim() !== "") body.set("altText.en", labelEn.trim());

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(problem?.message ?? copy["fileFailed"] ?? "");
        return;
      }

      const asset = (await response.json()) as UploadedAsset;
      onUploaded(asset, labelBn.trim(), labelEn.trim());
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
        {copy["attachmentLabel"] ?? ""}
      </label>

      <input
        ref={inputRef}
        id={fileId}
        type="file"
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
            value={labelBn}
            aria-invalid={labelMissing || undefined}
            onChange={(event) => setLabelBn(event.target.value)}
          />
          {labelMissing && (
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
            value={labelEn}
            onChange={(event) => setLabelEn(event.target.value)}
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
    </div>
  );
}
