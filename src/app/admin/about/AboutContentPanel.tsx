"use client";

/**
 * History, vision, mission and the principal's message — the `about_content`
 * singleton (§B-10).
 *
 * This is the screen where rich text concentrates: four `*_html` columns, all
 * declared with T-034's `optionalRichText`, all sanitized through §A-12's
 * allowlist inside `parse`. The editor says so beside every field, because an
 * admin who pastes formatted text out of Word and then watches half of it
 * disappear deserves to have been warned rather than surprised.
 *
 * `DualRichText` pairs two `RichTextEditor`s rather than reaching for
 * `DualLocaleField` with `kind="richtext"`. That combination is legitimate —
 * T-051 built it as the progressive-enhancement fallback and it renders the raw
 * HTML in a textarea — but this is the module where the school writes prose,
 * and asking a school office to compose the principal's message in raw markup
 * is not a reasonable ask. The §A-7.3 policy is unchanged: it comes from
 * `dualLocaleStatus(value, "richtext")`, which is the same single implementation
 * every other field uses.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { MediaField } from "@/app/admin/about/MediaField";
import type { Copy } from "@/app/admin/about/copy";
import {
  EditorActions,
  Panel,
  issueFor,
  useActionRunner,
} from "@/app/admin/about/panel-kit";
import { updateAboutContentAction } from "@/lib/modules/about/actions";
import type { AboutContentView } from "@/lib/modules/about/read";

const RICH_FIELDS = [
  { key: "historyHtml", labelKey: "history" },
  { key: "visionHtml", labelKey: "vision" },
  { key: "missionHtml", labelKey: "mission" },
  { key: "principalMessageHtml", labelKey: "principalMessage" },
] as const;

type RichKey = (typeof RICH_FIELDS)[number]["key"];

export function AboutContentPanel({
  content,
  copy,
  editable,
}: {
  content: AboutContentView;
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);

  const [rich, setRich] = useState<Record<RichKey, DualLocaleValue>>({
    historyHtml: content.historyHtml,
    visionHtml: content.visionHtml,
    missionHtml: content.missionHtml,
    principalMessageHtml: content.principalMessageHtml,
  });
  const [name, setName] = useState<DualLocaleValue>(content.principalName);
  const [designation, setDesignation] = useState<DualLocaleValue>(
    content.principalDesignation,
  );
  const [photoId, setPhotoId] = useState(content.principalPhotoMediaId);
  const [signatureId, setSignatureId] = useState(content.principalSignatureMediaId);

  async function save() {
    await runner.run(updateAboutContentAction, {
      principalPhotoMediaId: photoId,
      principalSignatureMediaId: signatureId,
      translations: { bn: slice("bn"), en: slice("en") },
    });
  }

  function slice(locale: "bn" | "en") {
    return {
      historyHtml: rich.historyHtml[locale],
      visionHtml: rich.visionHtml[locale],
      missionHtml: rich.missionHtml[locale],
      principalMessageHtml: rich.principalMessageHtml[locale],
      principalName: name[locale],
      principalDesignation: designation[locale],
    };
  }

  function reset() {
    setRich({
      historyHtml: content.historyHtml,
      visionHtml: content.visionHtml,
      missionHtml: content.missionHtml,
      principalMessageHtml: content.principalMessageHtml,
    });
    setName(content.principalName);
    setDesignation(content.principalDesignation);
    setPhotoId(content.principalPhotoMediaId);
    setSignatureId(content.principalSignatureMediaId);
    runner.clearIssues();
  }

  return (
    <Panel
      heading={copy["contentHeading"] ?? ""}
      note={copy["contentNote"]}
      lockedNote={copy["contentLocked"]}
      editable={editable}
    >
      <fieldset disabled={!editable} className="border-0 p-0">
        {RICH_FIELDS.map((field) => (
          <DualRichText
            key={field.key}
            label={copy[field.labelKey] ?? ""}
            copy={copy}
            value={rich[field.key]}
            onChange={(next) => setRich((current) => ({ ...current, [field.key]: next }))}
            error={issueFor(runner.issues, `translations.bn.${field.key}`)}
          />
        ))}

        <DualLocaleField
          name="principalName"
          label={copy["principalName"] ?? ""}
          value={name}
          onChange={setName}
          requiredMessage={copy["requiredMessage"] ?? ""}
          englishMissingLabel={copy["englishMissing"] ?? ""}
          banglaLabel={copy["banglaLabel"] ?? ""}
          englishLabel={copy["englishLabel"] ?? ""}
          requiredLabel={copy["optionalLabel"] ?? ""}
          optionalLabel={copy["optionalLabel"] ?? ""}
        />

        <DualLocaleField
          name="principalDesignation"
          label={copy["principalDesignation"] ?? ""}
          value={designation}
          onChange={setDesignation}
          requiredMessage={copy["requiredMessage"] ?? ""}
          englishMissingLabel={copy["englishMissing"] ?? ""}
          banglaLabel={copy["banglaLabel"] ?? ""}
          englishLabel={copy["englishLabel"] ?? ""}
          requiredLabel={copy["optionalLabel"] ?? ""}
          optionalLabel={copy["optionalLabel"] ?? ""}
        />

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <MediaField
            label={copy["principalPhoto"] ?? ""}
            copy={copy}
            mediaId={photoId}
            disabled={!editable}
            onUploaded={(asset) => setPhotoId(asset.id)}
            onCleared={() => setPhotoId(null)}
          />
          <MediaField
            label={copy["principalSignature"] ?? ""}
            copy={copy}
            mediaId={signatureId}
            disabled={!editable}
            onUploaded={(asset) => setSignatureId(asset.id)}
            onCleared={() => setSignatureId(null)}
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

/**
 * One rich-text field in both locales, under §A-7.3's policy.
 *
 * The badge and the required marker come from `dualLocaleStatus`, so this
 * component states no opinion about which locale is mandatory — it renders the
 * one that T-051 already decided. Every field on this panel is optional in
 * T-034's schema, hence the "optional" marker on the Bangla side too.
 */
function DualRichText({
  label,
  copy,
  value,
  onChange,
  error,
}: {
  label: string;
  copy: Copy;
  value: DualLocaleValue;
  onChange: (value: DualLocaleValue) => void;
  error?: string;
}) {
  const status = dualLocaleStatus(value, "richtext");

  const labels = {
    bold: copy["rtBold"] ?? "",
    italic: copy["rtItalic"] ?? "",
    link: copy["rtLink"] ?? "",
    heading: copy["rtHeading"] ?? "",
    bulletList: copy["rtBulletList"] ?? "",
    willStrip: copy["rtWillStrip"] ?? "",
    preview: copy["rtPreview"] ?? "",
    source: copy["rtSource"] ?? "",
    empty: copy["rtEmpty"] ?? "",
  };

  return (
    <fieldset className="mb-8 border-0 p-0">
      <legend className="label mb-3 flex items-center gap-2 p-0">
        <span>{label}</span>
        {status.englishMissing && (
          <span className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink">
            {copy["englishMissing"] ?? ""}
          </span>
        )}
      </legend>

      <div className="grid gap-4 lg:grid-cols-2">
        <RichTextEditor
          label={copy["banglaLabel"] ?? ""}
          lang="bn"
          value={value.bn}
          onChange={(bn) => onChange({ ...value, bn })}
          labels={labels}
          invalid={error !== undefined}
        />
        <RichTextEditor
          label={copy["englishLabel"] ?? ""}
          lang="en"
          value={value.en}
          onChange={(en) => onChange({ ...value, en })}
          labels={labels}
        />
      </div>

      {error !== undefined && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
