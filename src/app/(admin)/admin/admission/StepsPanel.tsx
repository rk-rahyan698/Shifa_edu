"use client";

/**
 * Admission steps (§B-9, `admission_steps`).
 *
 * §B-9 stores the steps as **rows, not a rich-text blob**, and the reason
 * shows up on the public side: rows can be rendered as a stepper, reordered,
 * and translated one at a time. A blob can be none of those, and the first
 * request to "make the steps look like a progress bar" would have meant
 * re-keying the whole thing.
 *
 * `admission_cycle_id` is nullable, and null means **evergreen** — a step that
 * applies to every cycle, which most of them are ("collect the form", "sit the
 * test"). The selector offers that explicitly rather than treating an empty
 * choice as an accident.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/admission/copy";
import {
  CheckboxField,
  EditorActions,
  ListRow,
  Panel,
  RowList,
  SelectField,
  TextField,
  anyRight,
  integer,
  issueFor,
  optionalId,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/admission/panel-kit";
import {
  deleteAdmissionStepAction,
  saveAdmissionStepAction,
  updateAdmissionStepAction,
} from "@/lib/modules/admission/actions";
import type { AdmissionCycleView, AdmissionStepView } from "@/lib/modules/admission/read";

type Draft = {
  id: string | null;
  admissionCycleId: string;
  stepNumber: string;
  icon: string;
  isActive: boolean;
  title: DualLocaleValue;
  description: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  admissionCycleId: "",
  stepNumber: "1",
  icon: "",
  isActive: true,
  title: { bn: "", en: "" },
  description: { bn: "", en: "" },
};

export function StepsPanel({
  steps,
  cycles,
  years,
  copy,
  rights,
}: {
  steps: readonly AdmissionStepView[];
  cycles: readonly AdmissionCycleView[];
  years: readonly { id: string; code: string }[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdmissionStepView | null>(null);

  const cycleOptions = cycles.map((cycle) => ({
    code: cycle.id,
    label: years.find((year) => year.id === cycle.academicYearId)?.code ?? `#${cycle.id}`,
  }));

  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const values = {
      admissionCycleId: optionalId(draft.admissionCycleId),
      stepNumber: integer(draft.stepNumber),
      icon: draft.icon.trim() === "" ? null : draft.icon,
      isActive: draft.isActive,
      translations: {
        bn: { title: draft.title.bn, description: blankToNull(draft.description.bn) },
        ...(hasEnglish
          ? {
              en: {
                title: draft.title.en,
                description: blankToNull(draft.description.en),
              },
            }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveAdmissionStepAction, { values })
        : await runner.run(updateAdmissionStepAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["stepsHeading"] ?? ""}
      note={copy["stepsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={steps.length}>
        {steps.map((step) => (
          <ListRow
            key={step.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(step)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(step) : undefined}
          >
            <span className="font-semibold">{step.stepNumber}.</span>
            <span lang="bn" className="ms-2 font-semibold">
              {step.title.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {step.admissionCycleId === null
                ? (copy["stepEvergreen"] ?? "")
                : (cycleOptions.find((entry) => entry.code === step.admissionCycleId)
                    ?.label ?? "")}
              {step.isActive ? "" : " · —"}
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
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              id="step-number"
              label={copy["stepNumber"] ?? ""}
              type="number"
              value={draft.stepNumber}
              onChange={(stepNumber) => setDraft({ ...draft, stepNumber })}
              error={issueFor(runner.issues, "values.stepNumber")}
            />
            <SelectField
              id="step-cycle"
              label={copy["selectCycle"] ?? ""}
              value={draft.admissionCycleId}
              placeholder={copy["stepEvergreen"] ?? ""}
              options={cycleOptions}
              onChange={(admissionCycleId) => setDraft({ ...draft, admissionCycleId })}
              error={issueFor(runner.issues, "values.admissionCycleId")}
            />
            <TextField
              id="step-icon"
              label={copy["stepIcon"] ?? ""}
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              error={issueFor(runner.issues, "values.icon")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="stepTitle"
              label={copy["stepTitle"] ?? ""}
              value={draft.title}
              onChange={(title) => setDraft({ ...draft, title })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />

            <DualLocaleField
              name="stepDescription"
              label={copy["stepDescription"] ?? ""}
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
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
              id="step-active"
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
            canSave={titleStatus?.canSave ?? false}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.title.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteAdmissionStepAction,
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

/** An empty optional string is a null column, not an empty one. */
function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toDraft(step: AdmissionStepView): Draft {
  return {
    id: step.id,
    admissionCycleId: step.admissionCycleId ?? "",
    stepNumber: String(step.stepNumber),
    icon: step.icon,
    isActive: step.isActive,
    title: step.title,
    description: step.description,
  };
}
