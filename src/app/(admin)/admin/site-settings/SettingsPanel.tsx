"use client";

/**
 * Panel 2 — general settings (§B-6, `site_settings` + its translations).
 *
 * Every field here is optional in T-034's schema, so nothing gates the save
 * button: an office that has an address but no slogan yet must be able to save
 * the address. §A-7.3's "Bangla required" applies to fields that are required
 * at all, and these are not — which is why each `DualLocaleField` is labelled
 * optional on both sides while still carrying the `EN missing` badge.
 *
 * Numbers are posted as numbers, never as the text in the box, with one
 * deliberate exception: an unparseable entry is forwarded **as written** so the
 * schema refuses it with a 422 the admin can see. Coercing "19y5" to `null`
 * would silently discard a typo and report a successful save.
 */

import { useState } from "react";

import {
  DualLocaleField,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import type { Copy } from "@/app/(admin)/admin/site-settings/copy";
import {
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/site-settings/panel-kit";
import { updateSiteSettingsAction } from "@/lib/modules/site-settings/actions";
import type { SettingsView } from "@/lib/modules/site-settings/read";

/** The four translated fields, and the kind of input each one wants. */
const TEXT_FIELDS = [
  { key: "slogan", labelKey: "slogan", kind: "text" },
  { key: "address", labelKey: "address", kind: "multiline" },
  { key: "officeHours", labelKey: "officeHours", kind: "multiline" },
  { key: "footerNote", labelKey: "footerNote", kind: "multiline" },
] as const;

type TextFieldKey = (typeof TEXT_FIELDS)[number]["key"];

export type SettingsPanelProps = {
  settings: SettingsView;
  copy: Copy;
  editable: boolean;
};

export function SettingsPanel({ settings, copy, editable }: SettingsPanelProps) {
  const runner = useActionRunner(copy);

  const [texts, setTexts] = useState<Record<TextFieldKey, DualLocaleValue>>({
    slogan: settings.slogan,
    address: settings.address,
    officeHours: settings.officeHours,
    footerNote: settings.footerNote,
  });
  const [foundedYear, setFoundedYear] = useState(settings.foundedYear);
  const [mapUrl, setMapUrl] = useState(settings.googleMapEmbedUrl);
  const [latitude, setLatitude] = useState(settings.latitude);
  const [longitude, setLongitude] = useState(settings.longitude);

  async function save() {
    await runner.run(updateSiteSettingsAction, {
      foundedYear: numeric(foundedYear),
      googleMapEmbedUrl: mapUrl.trim() === "" ? null : mapUrl.trim(),
      latitude: numeric(latitude),
      longitude: numeric(longitude),
      translations: {
        bn: localeSlice(texts, "bn"),
        en: localeSlice(texts, "en"),
      },
    });
  }

  function reset() {
    setTexts({
      slogan: settings.slogan,
      address: settings.address,
      officeHours: settings.officeHours,
      footerNote: settings.footerNote,
    });
    setFoundedYear(settings.foundedYear);
    setMapUrl(settings.googleMapEmbedUrl);
    setLatitude(settings.latitude);
    setLongitude(settings.longitude);
    runner.clearIssues();
  }

  return (
    <Panel
      heading={copy["settingsHeading"] ?? ""}
      note={copy["settingsNote"]}
      lockedNote={copy["settingsLocked"]}
      editable={editable}
    >
      <fieldset disabled={!editable} className="border-0 p-0">
        {TEXT_FIELDS.map((field) => (
          <DualLocaleField
            key={field.key}
            name={field.key}
            label={copy[field.labelKey] ?? ""}
            kind={field.kind}
            value={texts[field.key]}
            onChange={(next) =>
              setTexts((current) => ({ ...current, [field.key]: next }))
            }
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            // Optional on both sides — see the module header.
            requiredLabel={copy["optionalLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />
        ))}

        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="site-founded-year"
            label={copy["foundedYear"] ?? ""}
            value={foundedYear}
            onChange={setFoundedYear}
            error={issueFor(runner.issues, "foundedYear")}
          />
          <TextField
            id="site-map-url"
            label={copy["mapEmbedUrl"] ?? ""}
            value={mapUrl}
            onChange={setMapUrl}
            type="url"
            error={issueFor(runner.issues, "googleMapEmbedUrl")}
          />
          <TextField
            id="site-latitude"
            label={copy["latitude"] ?? ""}
            value={latitude}
            onChange={setLatitude}
            error={issueFor(runner.issues, "latitude")}
          />
          <TextField
            id="site-longitude"
            label={copy["longitude"] ?? ""}
            value={longitude}
            onChange={setLongitude}
            error={issueFor(runner.issues, "longitude")}
          />
        </div>

        {editable && (
          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["discard"] ?? ""}
            busy={runner.busy}
            canSave
            onSave={save}
            onCancel={reset}
          />
        )}
      </fieldset>
    </Panel>
  );
}

/** One locale's half of every translated field, in the shape `translationSet` wants. */
function localeSlice(
  texts: Record<TextFieldKey, DualLocaleValue>,
  locale: "bn" | "en",
): Record<TextFieldKey, string> {
  return {
    slogan: texts.slogan[locale],
    address: texts.address[locale],
    officeHours: texts.officeHours[locale],
    footerNote: texts.footerNote[locale],
  };
}

/**
 * A number field's value, as the schema should see it.
 *
 * Empty is `null` (cleared). A parseable entry is a number. Anything else is
 * forwarded verbatim, so stage 3 refuses it by name instead of this function
 * quietly deciding the admin meant nothing at all.
 */
function numeric(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}
