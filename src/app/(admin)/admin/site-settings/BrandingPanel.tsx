"use client";

/**
 * Panel 1 — the school's identity (§A-9.4, §B-6).
 *
 * Separated from the settings panel by more than a heading: it posts to its own
 * Server Action, which asks for the `edit_branding` grant. An admin holding
 * `site_settings:edit` alone sees this panel read-only and, if they get past the
 * disabled inputs, is refused by the server with a 403 that lands in the toast.
 * That is the card's Verify, made visible.
 *
 * English is sent only when an English school name was actually typed.
 * `translationSet` (§A-7.3) makes the whole English object optional but every
 * field inside it required, so posting `{ schoolName: "" }` would be a 422
 * complaining about a field the admin deliberately left blank. Omitting the
 * object says "no English yet", which is what the badge on the field already
 * shows them.
 *
 * The four image slots use `MediaField` rather than T-051's `ImagePicker`. That
 * file's header explains why the kit's picker cannot yet be mounted in a route,
 * and what the one-line replacement will be once it can.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { MediaField } from "@/app/(admin)/admin/site-settings/MediaField";
import type { Copy } from "@/app/(admin)/admin/site-settings/copy";
import {
  EditorActions,
  Panel,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/site-settings/panel-kit";
import { updateSiteBrandingAction } from "@/lib/modules/site-settings/actions";
import type { BrandingView } from "@/lib/modules/site-settings/read";

/** The four image slots, in the order §B-6 declares their columns. */
const SLOTS = [
  { key: "logoMediaId", labelKey: "logo" },
  { key: "logoReversedMediaId", labelKey: "logoReversed" },
  { key: "faviconMediaId", labelKey: "favicon" },
  { key: "ogImageMediaId", labelKey: "ogImage" },
] as const;

type SlotKey = (typeof SLOTS)[number]["key"];

export type BrandingPanelProps = {
  branding: BrandingView;
  copy: Copy;
  /** `super_admin` or the `edit_branding` grant — presentation only (T-051). */
  editable: boolean;
};

export function BrandingPanel({ branding, copy, editable }: BrandingPanelProps) {
  const runner = useActionRunner(copy);

  const [schoolName, setSchoolName] = useState<DualLocaleValue>(branding.schoolName);
  const [shortName, setShortName] = useState<DualLocaleValue>(branding.schoolShortName);
  const [media, setMedia] = useState<Record<SlotKey, string | null>>({
    logoMediaId: branding.logoMediaId,
    logoReversedMediaId: branding.logoReversedMediaId,
    faviconMediaId: branding.faviconMediaId,
    ogImageMediaId: branding.ogImageMediaId,
  });

  const nameStatus = dualLocaleStatus(schoolName);

  async function save() {
    const hasEnglish = schoolName.en.trim() !== "";

    await runner.run(updateSiteBrandingAction, {
      ...media,
      translations: {
        bn: {
          schoolName: schoolName.bn,
          schoolShortName: shortName.bn,
        },
        ...(hasEnglish
          ? { en: { schoolName: schoolName.en, schoolShortName: shortName.en } }
          : {}),
      },
    });
  }

  function reset() {
    setSchoolName(branding.schoolName);
    setShortName(branding.schoolShortName);
    setMedia({
      logoMediaId: branding.logoMediaId,
      logoReversedMediaId: branding.logoReversedMediaId,
      faviconMediaId: branding.faviconMediaId,
      ogImageMediaId: branding.ogImageMediaId,
    });
    runner.clearIssues();
  }

  return (
    <Panel
      heading={copy["brandingHeading"] ?? ""}
      note={copy["brandingNote"]}
      lockedNote={copy["brandingLocked"]}
      editable={editable}
    >
      <fieldset disabled={!editable} className="border-0 p-0">
        <DualLocaleField
          name="schoolName"
          label={copy["schoolName"] ?? ""}
          value={schoolName}
          onChange={setSchoolName}
          requiredMessage={copy["requiredMessage"] ?? ""}
          englishMissingLabel={copy["englishMissing"] ?? ""}
          banglaLabel={copy["banglaLabel"] ?? ""}
          englishLabel={copy["englishLabel"] ?? ""}
          requiredLabel={copy["requiredLabel"] ?? ""}
          optionalLabel={copy["optionalLabel"] ?? ""}
        />

        <DualLocaleField
          name="schoolShortName"
          label={copy["schoolShortName"] ?? ""}
          value={shortName}
          onChange={setShortName}
          requiredMessage={copy["requiredMessage"] ?? ""}
          englishMissingLabel={copy["englishMissing"] ?? ""}
          banglaLabel={copy["banglaLabel"] ?? ""}
          englishLabel={copy["englishLabel"] ?? ""}
          requiredLabel={copy["optionalLabel"] ?? ""}
          optionalLabel={copy["optionalLabel"] ?? ""}
        />

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {SLOTS.map((slot) => (
            <MediaField
              key={slot.key}
              label={copy[slot.labelKey] ?? ""}
              copy={copy}
              mediaId={media[slot.key]}
              disabled={!editable}
              onUploaded={(asset) =>
                setMedia((current) => ({ ...current, [slot.key]: asset.id }))
              }
              onCleared={() => setMedia((current) => ({ ...current, [slot.key]: null }))}
            />
          ))}
        </div>

        {issueFor(runner.issues, "translations.bn.schoolName") !== undefined && (
          <p className="field-error mt-4">
            {issueFor(runner.issues, "translations.bn.schoolName")}
          </p>
        )}

        {editable && (
          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["discard"] ?? ""}
            busy={runner.busy}
            canSave={nameStatus.canSave}
            onSave={save}
            onCancel={reset}
          />
        )}
      </fieldset>
    </Panel>
  );
}
