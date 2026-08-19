"use client";

/**
 * Sections (§B-8, `class_sections`).
 *
 * §B-8 makes these **real rows** rather than a `sections: Int` count on the
 * class, and the comment in the schema explains why: a count blocks every Phase
 * 2 feature that needs to say *which* section — attendance, results,
 * per-section routines. This panel is the smallest possible surface over that
 * decision, and the routine panel below is already its first consumer.
 *
 * The name is a single untranslated string. "A" and "B" are labels, not prose,
 * and translating them would produce two names for one room.
 */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  optionalInteger,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/academics/panel-kit";
import {
  deleteClassSectionAction,
  saveClassSectionAction,
  updateClassSectionAction,
} from "@/lib/modules/academics/actions";
import type {
  AcademicYearView,
  ClassGradeView,
  ClassSectionView,
} from "@/lib/modules/academics/read";

type Draft = {
  id: string | null;
  classGradeId: string;
  academicYearId: string;
  name: string;
  capacity: string;
  isActive: boolean;
};

const BLANK: Draft = {
  id: null,
  classGradeId: "",
  academicYearId: "",
  name: "",
  capacity: "",
  isActive: true,
};

export function SectionsPanel({
  sections,
  grades,
  years,
  copy,
  rights,
}: {
  sections: readonly ClassSectionView[];
  grades: readonly ClassGradeView[];
  years: readonly AcademicYearView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ClassSectionView | null>(null);

  const gradeOptions = grades.map((grade) => ({
    code: grade.id,
    label: grade.name.bn === "" ? grade.code : grade.name.bn,
  }));
  const yearOptions = years.map((year) => ({ code: year.id, label: year.code }));

  const complete =
    draft !== null &&
    draft.classGradeId !== "" &&
    draft.academicYearId !== "" &&
    draft.name.trim() !== "";

  async function save() {
    if (draft === null) return;

    const values = {
      classGradeId: draft.classGradeId,
      academicYearId: draft.academicYearId,
      name: draft.name,
      capacity: optionalInteger(draft.capacity),
      isActive: draft.isActive,
    };

    const saved =
      draft.id === null
        ? await runner.run(saveClassSectionAction, { values })
        : await runner.run(updateClassSectionAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["sectionsHeading"] ?? ""}
      note={copy["sectionsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={sections.length}>
        {sections.map((section) => (
          <ListRow
            key={section.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(section)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(section) : undefined}
          >
            <span className="font-semibold">
              {labelFor(gradeOptions, section.classGradeId)} · {section.name}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {labelFor(yearOptions, section.academicYearId)}
              {section.capacity === "" ? "" : ` · ${section.capacity}`}
              {section.isActive ? "" : " · —"}
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
        <div className="mt-6 grid gap-4 border-t border-border pt-6 md:grid-cols-2">
          <SelectField
            id="section-grade"
            label={copy["grade"] ?? ""}
            value={draft.classGradeId}
            placeholder={copy["selectGrade"] ?? ""}
            options={gradeOptions}
            onChange={(classGradeId) => setDraft({ ...draft, classGradeId })}
            error={issueFor(runner.issues, "values.classGradeId")}
          />
          <SelectField
            id="section-year"
            label={copy["year"] ?? ""}
            value={draft.academicYearId}
            placeholder={copy["selectYear"] ?? ""}
            options={yearOptions}
            onChange={(academicYearId) => setDraft({ ...draft, academicYearId })}
            error={issueFor(runner.issues, "values.academicYearId")}
          />
          <TextField
            id="section-name"
            label={copy["sectionName"] ?? ""}
            value={draft.name}
            onChange={(name) => setDraft({ ...draft, name })}
            error={issueFor(runner.issues, "values.name")}
          />
          <TextField
            id="section-capacity"
            label={copy["sectionCapacity"] ?? ""}
            type="number"
            value={draft.capacity}
            onChange={(capacity) => setDraft({ ...draft, capacity })}
            error={issueFor(runner.issues, "values.capacity")}
          />

          <CheckboxField
            id="section-active"
            label={copy["active"] ?? ""}
            checked={draft.isActive}
            onChange={(isActive) => setDraft({ ...draft, isActive })}
          />

          <div className="md:col-span-2">
            <EditorActions
              saveLabel={copy["save"] ?? ""}
              savingLabel={copy["saving"] ?? ""}
              cancelLabel={copy["cancel"] ?? ""}
              busy={runner.busy}
              canSave={complete}
              onSave={save}
              onCancel={() => {
                setDraft(null);
                runner.clearIssues();
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.name]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          const removed = await runner.run(
            deleteClassSectionAction,
            { id: pendingRemoval.id },
            "deleted",
          );
          if (removed) setPendingRemoval(null);
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

function toDraft(section: ClassSectionView): Draft {
  return {
    id: section.id,
    classGradeId: section.classGradeId,
    academicYearId: section.academicYearId,
    name: section.name,
    capacity: section.capacity,
    isActive: section.isActive,
  };
}
