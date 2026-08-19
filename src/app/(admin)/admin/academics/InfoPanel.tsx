"use client";

/**
 * Curriculum, class timings and assessment — the `academic_info` singleton
 * (§B-8).
 *
 * All three columns are declared with T-034's `optionalRichText`, which runs
 * §A-12's allowlist inside `parse`. Nothing on this panel sanitizes anything;
 * the editor says so beside every field, because an admin who pastes formatted
 * text out of Word and then watches half of it disappear deserves to have been
 * warned rather than surprised.
 *
 * The panel offers no sample text. T-113's placeholder gate is what eventually
 * decides whether this content may reach production, and a field pre-filled
 * with something that reads like a curriculum is a field nobody remembers to
 * replace — §A-3.1's `[[CONTENT REQUIRED — DO NOT PUBLISH]]` marker exists
 * precisely so that an unfilled section looks unfilled.
 */

import { useState } from "react";

import {
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { Copy } from "@/app/(admin)/admin/academics/copy";
import {
  EditorActions,
  Panel,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/academics/panel-kit";
import { updateAcademicInfoAction } from "@/lib/modules/academics/actions";
import type { AcademicInfoView } from "@/lib/modules/academics/read";

const RICH_FIELDS = [
  { key: "curriculumHtml", labelKey: "curriculum" },
  { key: "classTimingHtml", labelKey: "classTiming" },
  { key: "assessmentHtml", labelKey: "assessment" },
] as const;

type RichKey = (typeof RICH_FIELDS)[number]["key"];

export function InfoPanel({
  info,
  copy,
  editable,
}: {
  info: AcademicInfoView;
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [rich, setRich] = useState<Record<RichKey, DualLocaleValue>>({
    curriculumHtml: info.curriculumHtml,
    classTimingHtml: info.classTimingHtml,
    assessmentHtml: info.assessmentHtml,
  });

  async function save() {
    await runner.run(updateAcademicInfoAction, {
      translations: { bn: slice("bn"), en: slice("en") },
    });
  }

  function slice(locale: "bn" | "en") {
    return {
      curriculumHtml: rich.curriculumHtml[locale],
      classTimingHtml: rich.classTimingHtml[locale],
      assessmentHtml: rich.assessmentHtml[locale],
    };
  }

  function reset() {
    setRich({
      curriculumHtml: info.curriculumHtml,
      classTimingHtml: info.classTimingHtml,
      assessmentHtml: info.assessmentHtml,
    });
    runner.clearIssues();
  }

  return (
    <Panel
      heading={copy["infoHeading"] ?? ""}
      note={copy["infoNote"]}
      lockedNote={copy["locked"]}
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
 * The badge comes from `dualLocaleStatus`, so this component states no opinion
 * about which locale is mandatory — it renders the one T-051 already decided.
 * Every field on this panel is optional in T-034's schema.
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
