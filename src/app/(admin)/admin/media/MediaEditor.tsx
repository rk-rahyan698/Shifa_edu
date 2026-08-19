"use client";

/**
 * Alt text and caption for one asset, in both locales, plus the delete.
 *
 * `DualLocaleField` (T-051) carries §A-7.3's policy — Bangla required, English
 * optional and all-or-nothing — so this component does not restate it. Alt text
 * being translatable is the point §A-10.1 makes about the registry existing at
 * all: a bare URL string cannot hold alt text, and an image with none is
 * invisible to a screen reader in whichever language the reader is using.
 *
 * The delete button is disabled while anything holds the asset. That is a
 * courtesy, not the control: the server refuses the same delete with a 422
 * naming every referencing record, and this button being enabled would change
 * nothing except how the admin finds out.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { Copy } from "@/app/(admin)/admin/media/copy";
import { deleteMediaAction, saveMediaMetadataAction } from "@/lib/modules/media/actions";
import type { MediaDetailView } from "@/lib/modules/media/read";
import type { ActionResult } from "@/lib/modules/media/result";
import { useRouter } from "next/navigation";

export function MediaEditor({
  asset,
  canDescribe,
  canDelete,
  copy,
}: {
  asset: MediaDetailView;
  /** `can(user, 'media', 'add')` — describing an asset rides there (§A-5.2). */
  canDescribe: boolean;
  canDelete: boolean;
  copy: Copy;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [altText, setAltText] = useState<DualLocaleValue>(asset.altText);
  const [caption, setCaption] = useState<DualLocaleValue>(asset.caption);

  const altStatus = dualLocaleStatus(altText);
  const inUse = asset.usages.length > 0;

  async function run<TData>(
    action: (input: unknown) => Promise<ActionResult<TData>>,
    input: unknown,
    successKey: "saved" | "deleted",
  ): Promise<boolean> {
    setBusy(true);
    try {
      const result = await action(input);
      if (result.ok) {
        toast.success(copy[successKey] ?? "");
        router.refresh();
        return true;
      }
      toast.error(
        result.issues.find((issue) => issue.field === "id")?.message ??
          copy[result.reason] ??
          "",
      );
      return false;
    } catch {
      toast.error(copy["failed"] ?? "");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setTouched(true);
    if (altStatus.banglaMissing) return;

    const hasEnglish = altText.en.trim() !== "";

    await run(
      saveMediaMetadataAction,
      {
        id: asset.id,
        translations: {
          bn: { altText: altText.bn, caption: caption.bn === "" ? null : caption.bn },
          ...(hasEnglish
            ? {
                en: {
                  altText: altText.en,
                  caption: caption.en === "" ? null : caption.en,
                },
              }
            : {}),
        },
      },
      "saved",
    );
  }

  return (
    <>
      {canDescribe ? (
        <div className="mt-6 border-t border-border pt-5">
          <DualLocaleField
            name="altText"
            label={copy["altText"] ?? ""}
            value={altText}
            onChange={setAltText}
            showErrors={touched}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />
          <p className="field-hint">{copy["altTextNote"] ?? ""}</p>

          <div className="mt-4">
            <DualLocaleField
              name="caption"
              label={copy["caption"] ?? ""}
              value={caption}
              onChange={setCaption}
              kind="multiline"
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={save}
            >
              {busy ? (copy["saving"] ?? "") : (copy["save"] ?? "")}
            </button>

            {canDelete && !asset.isDeleted && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || inUse}
                aria-disabled={busy || inUse}
                title={inUse ? (copy["usageNote"] ?? "") : undefined}
                onClick={() => setConfirming(true)}
              >
                {copy["remove"] ?? ""}
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="callout mt-6" role="status">
          {copy["locked"] ?? ""}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title={copy["confirmRemoveTitle"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={busy}
        onConfirm={async () => {
          const done = await run(deleteMediaAction, { id: asset.id }, "deleted");
          if (done) setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
