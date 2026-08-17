"use client";

/**
 * Age eligibility, per class (§B-9, `admission_eligibility`).
 *
 * §B-9 chose **structured columns over free rich text** here, and gives two
 * reasons that are both visible on this screen: a parent can scan a table of
 * ages far faster than a paragraph, and Phase 2's online form can check an age
 * against a number but not against prose.
 *
 * The ages are `NUMERIC(3,1)` because "five and a half" is a real answer to
 * "how old must my child be". They are typed as decimals and posted as numbers
 * — unlike fees, which stay strings: a fee is money a parent adds up, an age
 * bound is a comparison, and `5.5` compares correctly as a float where
 * `1250.10` does not add correctly as one.
 *
 * One rule per class (`UNIQUE (class_grade_id)`), so saving is an upsert keyed
 * on the class and the class selector is the row's identity, not a filter.
 */

import { useState } from "react";

import {
  DualLocaleField,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/admission/copy";
import {
  CheckboxField,
  EditorActions,
  ListRow,
  Panel,
  RowList,
  SelectField,
  TextField,
  anyRight,
  issueFor,
  useActionRunner,
  type Rights,
} from "@/app/admin/admission/panel-kit";
import {
  deleteAdmissionEligibilityAction,
  saveAdmissionEligibilityAction,
} from "@/lib/modules/admission/actions";
import type {
  AdmissionEligibilityView,
  FeeGradeView,
} from "@/lib/modules/admission/read";

type Draft = {
  classGradeId: string;
  minAgeYears: string;
  maxAgeYears: string;
  ageAsOf: string;
  isActive: boolean;
  note: DualLocaleValue;
};

const BLANK: Draft = {
  classGradeId: "",
  minAgeYears: "",
  maxAgeYears: "",
  ageAsOf: "",
  isActive: true,
  note: { bn: "", en: "" },
};

export function EligibilityPanel({
  eligibility,
  grades,
  copy,
  rights,
}: {
  eligibility: readonly AdmissionEligibilityView[];
  grades: readonly FeeGradeView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdmissionEligibilityView | null>(
    null,
  );

  const gradeOptions = grades.map((grade) => ({
    code: grade.id,
    label: grade.name.bn === "" ? grade.code : grade.name.bn,
  }));

  async function save() {
    if (draft === null) return;

    const hasNote = draft.note.bn.trim() !== "";
    const hasEnglishNote = draft.note.en.trim() !== "";

    const saved = await runner.run(saveAdmissionEligibilityAction, {
      values: {
        classGradeId: draft.classGradeId,
        minAgeYears: decimal(draft.minAgeYears),
        maxAgeYears: decimal(draft.maxAgeYears),
        ageAsOf: draft.ageAsOf === "" ? null : draft.ageAsOf,
        isActive: draft.isActive,
        ...(hasNote
          ? {
              translations: {
                bn: { note: draft.note.bn },
                ...(hasEnglishNote ? { en: { note: draft.note.en } } : {}),
              },
            }
          : {}),
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["eligibilityHeading"] ?? ""}
      note={copy["eligibilityNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={eligibility.length}>
        {eligibility.map((rule) => (
          <ListRow
            key={rule.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(rule)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(rule) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {gradeOptions.find((entry) => entry.code === rule.classGradeId)?.label ??
                `#${rule.classGradeId}`}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {rule.minAgeYears === "" ? "—" : rule.minAgeYears}
              {" → "}
              {rule.maxAgeYears === "" ? "—" : rule.maxAgeYears}
              {rule.ageAsOf === "" ? "" : ` · ${rule.ageAsOf}`}
              {rule.isActive ? "" : " · —"}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField
              id="eligibility-grade"
              label={copy["grade"] ?? ""}
              value={draft.classGradeId}
              placeholder={copy["selectGrade"] ?? ""}
              options={gradeOptions}
              onChange={(classGradeId) => setDraft({ ...draft, classGradeId })}
              error={issueFor(runner.issues, "values.classGradeId")}
            />
            <TextField
              id="eligibility-min"
              label={copy["minAge"] ?? ""}
              type="number"
              value={draft.minAgeYears}
              onChange={(minAgeYears) => setDraft({ ...draft, minAgeYears })}
              error={issueFor(runner.issues, "values.minAgeYears")}
            />
            <TextField
              id="eligibility-max"
              label={copy["maxAge"] ?? ""}
              type="number"
              value={draft.maxAgeYears}
              onChange={(maxAgeYears) => setDraft({ ...draft, maxAgeYears })}
              error={issueFor(runner.issues, "values.maxAgeYears")}
            />
            <TextField
              id="eligibility-as-of"
              label={copy["ageAsOf"] ?? ""}
              type="date"
              value={draft.ageAsOf}
              onChange={(ageAsOf) => setDraft({ ...draft, ageAsOf })}
              error={issueFor(runner.issues, "values.ageAsOf")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="eligibilityNote"
              label={copy["eligibilityNoteField"] ?? ""}
              value={draft.note}
              onChange={(note) => setDraft({ ...draft, note })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="eligibility-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={draft.classGradeId !== ""}
            onSave={save}
            onCancel={() => {
              setDraft(null);
              runner.clearIssues();
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={pendingRemoval === null ? undefined : [`#${pendingRemoval.id}`]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteAdmissionEligibilityAction,
            { id: pendingRemoval.id },
            "deleted",
          );
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

/**
 * An age bound on its way back to the schema.
 *
 * A non-numeric string is passed through untouched rather than coerced: T-034
 * answers it with a 422 naming the field, which is the correct outcome.
 * `Number("")` is 0, and "minimum age 0" is a different claim from "no minimum".
 */
function decimal(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function toDraft(rule: AdmissionEligibilityView): Draft {
  return {
    classGradeId: rule.classGradeId,
    minAgeYears: rule.minAgeYears,
    maxAgeYears: rule.maxAgeYears,
    ageAsOf: rule.ageAsOf,
    isActive: rule.isActive,
    note: rule.note,
  };
}
