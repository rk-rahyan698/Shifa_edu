"use client";

/**
 * The admission cycle (§B-9, `admission_cycles`).
 *
 * This panel is where the card's third Contract clause becomes visible: **the
 * admission-open expression is defined once**, in
 * `src/lib/modules/admission/open.ts`, and this screen *calls* it rather than
 * re-deriving it. The status line an admin reads here is computed by exactly
 * the function T-084 will call to decide whether the public banner renders, so
 * the two cannot disagree. That is the entire point — the failure this guards
 * against is an admin panel confidently reporting a banner the public site is
 * not showing.
 *
 * The status line explains itself, which is why `admissionOpenState` returns a
 * reason rather than a boolean. "You ticked open, but the closing date was
 * Tuesday" is actionable; "closed" sends somebody looking for a bug.
 *
 * One cycle per academic year (`UNIQUE (academic_year_id)`), so saving is an
 * upsert on the year rather than a create-or-update on an id, and the year
 * selector is the primary key of what is being edited — not a filter.
 */

import { useState } from "react";

import {
  DualLocaleField,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { DocumentField } from "@/app/admin/admission/DocumentField";
import type { Copy } from "@/app/admin/admission/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  SelectField,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/admin/admission/panel-kit";
import { saveAdmissionCycleAction } from "@/lib/modules/admission/actions";
import { admissionOpenState, type AdmissionWindow } from "@/lib/modules/admission/open";
import type { AdmissionCycleView } from "@/lib/modules/admission/read";

/** `admissionOpenState`'s reasons, mapped to this screen's strings. */
const REASON_COPY_KEY = {
  no_cycle: "openNoCycle",
  not_declared: "openNotDeclared",
  before_opens: "openBeforeOpens",
  after_closes: "openAfterCloses",
} as const;

type Draft = {
  academicYearId: string;
  isOpen: boolean;
  isCurrent: boolean;
  opensOn: string;
  closesOn: string;
  examDate: string;
  formMediaId: string | null;
  banner: DualLocaleValue;
};

export function CyclePanel({
  cycle,
  cycles,
  years,
  copy,
  editable,
}: {
  cycle: AdmissionCycleView | null;
  cycles: readonly AdmissionCycleView[];
  years: readonly { id: string; code: string; isCurrent: boolean }[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);

  const initialYearId =
    cycle?.academicYearId ??
    years.find((year) => year.isCurrent)?.id ??
    years[0]?.id ??
    "";

  const [yearId, setYearId] = useState(initialYearId);
  const [draft, setDraft] = useState<Draft>(() =>
    toDraft(cycleFor(cycles, initialYearId), initialYearId),
  );

  /**
   * The status of what is **stored**, not of the draft.
   *
   * Reading the unsaved form would report a banner the public site is not
   * serving yet, which is the confusion this line exists to remove.
   */
  const state = admissionOpenState(windowOf(cycleFor(cycles, yearId)));

  function switchYear(nextYearId: string) {
    setYearId(nextYearId);
    setDraft(toDraft(cycleFor(cycles, nextYearId), nextYearId));
    runner.clearIssues();
  }

  async function save() {
    const hasEnglish = draft.banner.en.trim() !== "";
    const hasBangla = draft.banner.bn.trim() !== "";

    await runner.run(saveAdmissionCycleAction, {
      values: {
        academicYearId: draft.academicYearId,
        isOpen: draft.isOpen,
        isCurrent: draft.isCurrent,
        opensOn: blankToNull(draft.opensOn),
        closesOn: blankToNull(draft.closesOn),
        examDate: blankToNull(draft.examDate),
        formMediaId: draft.formMediaId,
        // `statusBanner` is the only translated column and it is optional in
        // T-034; sending an empty Bangla string would store one rather than
        // leaving the cycle without a banner.
        ...(hasBangla
          ? {
              translations: {
                bn: { statusBanner: draft.banner.bn },
                ...(hasEnglish ? { en: { statusBanner: draft.banner.en } } : {}),
              },
            }
          : {}),
      },
    });
  }

  return (
    <Panel
      heading={copy["cycleHeading"] ?? ""}
      note={copy["cycleNote"]}
      lockedNote={copy["locked"]}
      editable={editable}
    >
      <p className={state.open ? "callout" : "callout"} role="status">
        {state.open
          ? (copy["openNow"] ?? "")
          : (copy[REASON_COPY_KEY[state.reason]] ?? "")}
      </p>

      <fieldset disabled={!editable} className="mt-5 border-0 p-0">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            id="cycle-year"
            label={copy["year"] ?? ""}
            value={yearId}
            placeholder={copy["selectYear"] ?? ""}
            options={years.map((year) => ({ code: year.id, label: year.code }))}
            onChange={switchYear}
            error={issueFor(runner.issues, "values.academicYearId")}
          />
          <TextField
            id="cycle-opens"
            label={copy["cycleOpensOn"] ?? ""}
            type="date"
            value={draft.opensOn}
            onChange={(opensOn) => setDraft({ ...draft, opensOn })}
            error={issueFor(runner.issues, "values.opensOn")}
          />
          <TextField
            id="cycle-closes"
            label={copy["cycleClosesOn"] ?? ""}
            type="date"
            value={draft.closesOn}
            onChange={(closesOn) => setDraft({ ...draft, closesOn })}
            error={issueFor(runner.issues, "values.closesOn")}
          />
          <TextField
            id="cycle-exam"
            label={copy["cycleExamDate"] ?? ""}
            type="date"
            value={draft.examDate}
            onChange={(examDate) => setDraft({ ...draft, examDate })}
            error={issueFor(runner.issues, "values.examDate")}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-6">
          <CheckboxField
            id="cycle-open"
            label={copy["cycleIsOpen"] ?? ""}
            checked={draft.isOpen}
            onChange={(isOpen) => setDraft({ ...draft, isOpen })}
            hint={copy["cycleNote"]}
          />
          <CheckboxField
            id="cycle-current"
            label={copy["cycleIsCurrent"] ?? ""}
            checked={draft.isCurrent}
            onChange={(isCurrent) => setDraft({ ...draft, isCurrent })}
          />
        </div>

        <div className="mt-4">
          <DualLocaleField
            name="cycleBanner"
            label={copy["cycleBanner"] ?? ""}
            value={draft.banner}
            onChange={(banner) => setDraft({ ...draft, banner })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["optionalLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />
        </div>

        <div className="mt-6">
          <DocumentField
            label={copy["cycleForm"] ?? ""}
            copy={copy}
            mediaId={draft.formMediaId}
            disabled={!editable}
            onUploaded={(asset) => setDraft({ ...draft, formMediaId: asset.id })}
            onCleared={() => setDraft({ ...draft, formMediaId: null })}
          />
        </div>

        {editable && (
          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["discard"] ?? ""}
            busy={runner.busy}
            canSave={draft.academicYearId !== ""}
            onSave={save}
            onCancel={() => switchYear(yearId)}
          />
        )}
      </fieldset>
    </Panel>
  );
}

function cycleFor(
  cycles: readonly AdmissionCycleView[],
  yearId: string,
): AdmissionCycleView | null {
  return cycles.find((entry) => entry.academicYearId === yearId) ?? null;
}

/**
 * The columns `admissionOpenState` declares, from a view.
 *
 * A local copy of `read.ts`'s `windowOf` because that module is server-side and
 * this is a Client Component. It converts, and decides nothing — the rule stays
 * in `open.ts`.
 */
function windowOf(cycle: AdmissionCycleView | null): AdmissionWindow | null {
  if (cycle === null) return null;

  return {
    isOpen: cycle.isOpen,
    opensOn: cycle.opensOn === "" ? null : new Date(`${cycle.opensOn}T00:00:00Z`),
    closesOn: cycle.closesOn === "" ? null : new Date(`${cycle.closesOn}T00:00:00Z`),
  };
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toDraft(cycle: AdmissionCycleView | null, yearId: string): Draft {
  return {
    academicYearId: cycle?.academicYearId ?? yearId,
    // A cycle that does not exist yet is closed and not current. §B-19 forbids
    // seeding an open admission banner, and a form that defaulted to open would
    // announce an admission the school never declared.
    isOpen: cycle?.isOpen ?? false,
    isCurrent: cycle?.isCurrent ?? false,
    opensOn: cycle?.opensOn ?? "",
    closesOn: cycle?.closesOn ?? "",
    examDate: cycle?.examDate ?? "",
    formMediaId: cycle?.formMediaId ?? null,
    banner: cycle?.statusBanner ?? { bn: "", en: "" },
  };
}
