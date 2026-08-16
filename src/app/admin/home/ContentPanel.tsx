"use client";

/**
 * The intro paragraph and the call-to-action block — the `home_content`
 * singleton (§B-10).
 *
 * Every field is optional in T-034's schema, so nothing gates the save: a
 * school that has written its introduction but not its admissions prompt must
 * be able to keep the introduction. §A-7.3's "Bangla required" governs fields
 * that are required at all, and these are not, which is why both sides are
 * labelled optional while the `EN missing` badge still appears.
 *
 * `cta_url` defaults to `/admission` in the schema and is a `linkTarget`, so a
 * site-relative path is as valid as an absolute URL — §B-10 chose that so a
 * content row never bakes in the domain.
 */

import { useState } from "react";

import {
  DualLocaleField,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import type { Copy } from "@/app/admin/home/copy";
import {
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/admin/home/panel-kit";
import { updateHomeContentAction } from "@/lib/modules/home/actions";
import type { HomeContentView } from "@/lib/modules/home/read";

const FIELDS = [
  { key: "introText", labelKey: "introText", kind: "multiline" },
  { key: "ctaHeading", labelKey: "ctaHeading", kind: "text" },
  { key: "ctaBody", labelKey: "ctaBody", kind: "multiline" },
  { key: "ctaButtonLabel", labelKey: "ctaButtonLabel", kind: "text" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

export function ContentPanel({
  content,
  copy,
  editable,
}: {
  content: HomeContentView;
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);

  const [texts, setTexts] = useState<Record<FieldKey, DualLocaleValue>>({
    introText: content.introText,
    ctaHeading: content.ctaHeading,
    ctaBody: content.ctaBody,
    ctaButtonLabel: content.ctaButtonLabel,
  });
  const [ctaUrl, setCtaUrl] = useState(content.ctaUrl);

  async function save() {
    await runner.run(updateHomeContentAction, {
      ctaUrl: ctaUrl.trim() === "" ? null : ctaUrl.trim(),
      translations: { bn: slice(texts, "bn"), en: slice(texts, "en") },
    });
  }

  function reset() {
    setTexts({
      introText: content.introText,
      ctaHeading: content.ctaHeading,
      ctaBody: content.ctaBody,
      ctaButtonLabel: content.ctaButtonLabel,
    });
    setCtaUrl(content.ctaUrl);
    runner.clearIssues();
  }

  return (
    <Panel
      heading={copy["contentHeading"] ?? ""}
      note={copy["contentNote"]}
      lockedNote={copy["slidesLocked"]}
      editable={editable}
    >
      <fieldset disabled={!editable} className="border-0 p-0">
        {FIELDS.map((field) => (
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
            requiredLabel={copy["optionalLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />
        ))}

        <TextField
          id="home-cta-url"
          label={copy["ctaUrl"] ?? ""}
          value={ctaUrl}
          onChange={setCtaUrl}
          placeholder="/admission"
          error={issueFor(runner.issues, "ctaUrl")}
        />

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

/** One locale's half of every translated field, in `translationSet`'s shape. */
function slice(
  texts: Record<FieldKey, DualLocaleValue>,
  locale: "bn" | "en",
): Record<FieldKey, string> {
  return {
    introText: texts.introText[locale],
    ctaHeading: texts.ctaHeading[locale],
    ctaBody: texts.ctaBody[locale],
    ctaButtonLabel: texts.ctaButtonLabel[locale],
  };
}
