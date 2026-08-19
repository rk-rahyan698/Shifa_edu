"use client";

/**
 * Academic years (§B-8, `academic_years`).
 *
 * ADR-010's rule shows up here as a screen, not a sentence: nothing in this
 * system is implicitly "this year", so every section, routine, exam term, fee
 * structure and calendar event names a year, and that year has to be created
 * before any of them can be. It is the first panel for that reason.
 *
 * "Current year" is a single flag across the whole table
 * (`ux_academic_year_current`), so ticking it here retires whichever year held
 * it. The demotion happens server-side inside the same transaction — a client
 * that unticked the old row first would leave a window with no current year at
 * all, and any reader in that window sees a school between academic years.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/academics/copy";
import {
  CheckboxField,
  EditorActions,
  ListRow,
  Panel,
  RowList,
  TextField,
  anyRight,
  issueFor,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/academics/panel-kit";
import {
  deleteAcademicYearAction,
  saveAcademicYearAction,
  updateAcademicYearAction,
} from "@/lib/modules/academics/actions";
import type { AcademicYearView } from "@/lib/modules/academics/read";

type Draft = {
  id: string | null;
  code: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  isActive: boolean;
  label: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  code: "",
  startsOn: "",
  endsOn: "",
  // A new year is not the current one until somebody says so. Defaulting to
  // true would silently retire the running year on the first save.
  isCurrent: false,
  isActive: true,
  label: { bn: "", en: "" },
};

export function YearsPanel({
  years,
  copy,
  rights,
}: {
  years: readonly AcademicYearView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AcademicYearView | null>(null);

  const labelStatus = draft === null ? null : dualLocaleStatus(draft.label);

  async function save() {
    if (draft === null) return;

    const values = {
      code: draft.code,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn,
      isCurrent: draft.isCurrent,
      isActive: draft.isActive,
      translations: {
        bn: { label: draft.label.bn },
        ...(draft.label.en.trim() === "" ? {} : { en: { label: draft.label.en } }),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveAcademicYearAction, { values })
        : await runner.run(updateAcademicYearAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["yearsHeading"] ?? ""}
      note={copy["yearsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={years.length}>
        {years.map((year) => (
          <ListRow
            key={year.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(year)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(year) : undefined}
          >
            <span className="font-semibold">{year.code}</span>
            <span lang="bn" className="ms-3">
              {year.label.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {year.startsOn} → {year.endsOn}
              {year.isCurrent ? ` · ${copy["yearCurrent"] ?? ""}` : ""}
              {year.isActive ? "" : " · —"}
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
              id="year-code"
              label={copy["yearCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <TextField
              id="year-starts"
              label={copy["yearStartsOn"] ?? ""}
              type="date"
              value={draft.startsOn}
              onChange={(startsOn) => setDraft({ ...draft, startsOn })}
              error={issueFor(runner.issues, "values.startsOn")}
            />
            <TextField
              id="year-ends"
              label={copy["yearEndsOn"] ?? ""}
              type="date"
              value={draft.endsOn}
              onChange={(endsOn) => setDraft({ ...draft, endsOn })}
              error={issueFor(runner.issues, "values.endsOn")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="yearLabel"
              label={copy["yearLabel"] ?? ""}
              value={draft.label}
              onChange={(label) => setDraft({ ...draft, label })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <CheckboxField
              id="year-current"
              label={copy["yearCurrent"] ?? ""}
              checked={draft.isCurrent}
              onChange={(isCurrent) => setDraft({ ...draft, isCurrent })}
            />
            <CheckboxField
              id="year-active"
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
            canSave={labelStatus?.canSave ?? false}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.code]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteAcademicYearAction,
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

function toDraft(year: AcademicYearView): Draft {
  return {
    id: year.id,
    code: year.code,
    startsOn: year.startsOn,
    endsOn: year.endsOn,
    isCurrent: year.isCurrent,
    isActive: year.isActive,
    label: year.label,
  };
}
