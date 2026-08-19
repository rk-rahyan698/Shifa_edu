"use client";

/**
 * Class routines (§B-8, `class_routines`).
 *
 * This panel carries the second half of the card's Verify: **uploading a new
 * routine demotes the previous `is_current`.** There is no edit form, and that
 * is the design — a routine is a PDF the office already maintains, so replacing
 * one is a fresh upload rather than a field to change. The demotion happens
 * server-side in the same transaction as the insert, because
 * `ux_routine_current` will not tolerate two current routines for one class
 * even momentarily.
 *
 * A routine may belong to the whole class (`class_section_id IS NULL`) or to
 * one section, and those are **different slots** under the index's
 * `COALESCE(class_section_id, 0)`. Section A's new timetable does not retire
 * the one the whole class shares, which is why the section selector offers an
 * explicit "whole class" choice rather than treating an empty selection as a
 * wildcard.
 */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DocumentField } from "@/app/(admin)/admin/academics/DocumentField";
import type { Copy } from "@/app/(admin)/admin/academics/copy";
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
  optionalId,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/academics/panel-kit";
import {
  deleteClassRoutineAction,
  uploadClassRoutineAction,
} from "@/lib/modules/academics/actions";
import type {
  AcademicYearView,
  ClassGradeView,
  ClassRoutineView,
  ClassSectionView,
} from "@/lib/modules/academics/read";

type Draft = {
  classGradeId: string;
  classSectionId: string;
  academicYearId: string;
  mediaId: string | null;
  effectiveFrom: string;
  isCurrent: boolean;
};

function blank(defaultYearId: string): Draft {
  return {
    classGradeId: "",
    classSectionId: "",
    academicYearId: defaultYearId,
    mediaId: null,
    effectiveFrom: today(),
    isCurrent: true,
  };
}

export function RoutinesPanel({
  routines,
  grades,
  sections,
  years,
  copy,
  rights,
}: {
  routines: readonly ClassRoutineView[];
  grades: readonly ClassGradeView[];
  sections: readonly ClassSectionView[];
  years: readonly AcademicYearView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const defaultYearId = years.find((year) => year.isCurrent)?.id ?? years[0]?.id ?? "";
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ClassRoutineView | null>(null);

  const gradeOptions = grades.map((grade) => ({
    code: grade.id,
    label: grade.name.bn === "" ? grade.code : grade.name.bn,
  }));
  const yearOptions = years.map((year) => ({ code: year.id, label: year.code }));

  // Only sections that actually belong to the chosen class and year. Offering
  // the rest would let an admin build a routine the composite foreign key
  // `fk_routine_section` refuses.
  const sectionOptions =
    draft === null
      ? []
      : sections
          .filter(
            (section) =>
              section.classGradeId === draft.classGradeId &&
              section.academicYearId === draft.academicYearId,
          )
          .map((section) => ({ code: section.id, label: section.name }));

  const complete =
    draft !== null &&
    draft.classGradeId !== "" &&
    draft.academicYearId !== "" &&
    draft.mediaId !== null &&
    draft.effectiveFrom !== "";

  async function upload() {
    if (draft === null || draft.mediaId === null) return;

    const uploaded = await runner.run(uploadClassRoutineAction, {
      values: {
        classGradeId: draft.classGradeId,
        classSectionId: optionalId(draft.classSectionId),
        academicYearId: draft.academicYearId,
        mediaId: draft.mediaId,
        effectiveFrom: draft.effectiveFrom,
        isCurrent: draft.isCurrent,
      },
    });

    if (uploaded) setDraft(null);
  }

  return (
    <Panel
      heading={copy["routinesHeading"] ?? ""}
      note={copy["routinesNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={routines.length}>
        {routines.map((routine) => (
          <ListRow
            key={routine.id}
            copy={copy}
            onRemove={rights.delete ? () => setPendingRemoval(routine) : undefined}
          >
            <span className="font-semibold">
              {labelFor(gradeOptions, routine.classGradeId)}
              {" · "}
              {routine.classSectionId === null
                ? (copy["routineWholeClass"] ?? "")
                : sectionName(sections, routine.classSectionId)}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {labelFor(yearOptions, routine.academicYearId)} · {routine.effectiveFrom}
              {routine.isCurrent ? ` · ${copy["routineCurrent"] ?? ""}` : ""}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(blank(defaultYearId))}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              id="routine-grade"
              label={copy["grade"] ?? ""}
              value={draft.classGradeId}
              placeholder={copy["selectGrade"] ?? ""}
              options={gradeOptions}
              onChange={(classGradeId) =>
                // The section belonged to the previous class; keeping it would
                // post a section that is not this class's.
                setDraft({ ...draft, classGradeId, classSectionId: "" })
              }
              error={issueFor(runner.issues, "values.classGradeId")}
            />
            <SelectField
              id="routine-year"
              label={copy["year"] ?? ""}
              value={draft.academicYearId}
              placeholder={copy["selectYear"] ?? ""}
              options={yearOptions}
              onChange={(academicYearId) =>
                setDraft({ ...draft, academicYearId, classSectionId: "" })
              }
              error={issueFor(runner.issues, "values.academicYearId")}
            />
            <SelectField
              id="routine-section"
              label={copy["section"] ?? ""}
              value={draft.classSectionId}
              placeholder={copy["routineWholeClass"] ?? ""}
              options={sectionOptions}
              onChange={(classSectionId) => setDraft({ ...draft, classSectionId })}
              error={issueFor(runner.issues, "values.classSectionId")}
            />
            <TextField
              id="routine-effective"
              label={copy["routineEffectiveFrom"] ?? ""}
              type="date"
              value={draft.effectiveFrom}
              onChange={(effectiveFrom) => setDraft({ ...draft, effectiveFrom })}
              error={issueFor(runner.issues, "values.effectiveFrom")}
            />
          </div>

          <div className="mt-6">
            <DocumentField
              label={copy["routineFile"] ?? ""}
              copy={copy}
              mediaId={draft.mediaId}
              onUploaded={(asset) => setDraft({ ...draft, mediaId: asset.id })}
              onCleared={() => setDraft({ ...draft, mediaId: null })}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="routine-current"
              label={copy["routineCurrent"] ?? ""}
              checked={draft.isCurrent}
              onChange={(isCurrent) => setDraft({ ...draft, isCurrent })}
              hint={copy["routinesNote"]}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={complete}
            onSave={upload}
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
            deleteClassRoutineAction,
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

function labelFor(
  options: readonly { code: string; label: string }[],
  id: string,
): string {
  return options.find((option) => option.code === id)?.label ?? `#${id}`;
}

function sectionName(sections: readonly ClassSectionView[], id: string): string {
  return sections.find((section) => section.id === id)?.name ?? `#${id}`;
}

/** Today as `YYYY-MM-DD`, for the effective-from default. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
