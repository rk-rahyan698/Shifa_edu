"use client";

/**
 * Class ↔ subject assignment (§B-8, `class_subjects`).
 *
 * The junction that makes the subject master worth having. Its primary key is
 * the (class, subject, year) triple, so this panel works the way the table
 * does: pick a class and a year, and the list below is exactly that class's
 * subjects for that year.
 *
 * The year filter is not a convenience. `class_subjects.academic_year_id` is
 * part of the key precisely so that dropping a subject next year does not
 * rewrite what was taught this year, and a screen that showed every year at
 * once would invite an admin to "tidy up" history.
 *
 * Removing an assignment posts all three key columns rather than an id, because
 * there is no id — see `classSubjectUnassignSchema`.
 */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/academics/copy";
import {
  CheckboxField,
  ListRow,
  Panel,
  RowList,
  SelectField,
  TextField,
  anyRight,
  integer,
  issueFor,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/academics/panel-kit";
import {
  assignClassSubjectAction,
  unassignClassSubjectAction,
} from "@/lib/modules/academics/actions";
import type {
  AcademicYearView,
  ClassGradeView,
  ClassSubjectView,
  SubjectView,
} from "@/lib/modules/academics/read";

export function AssignmentsPanel({
  assignments,
  grades,
  subjects,
  years,
  copy,
  rights,
}: {
  assignments: readonly ClassSubjectView[];
  grades: readonly ClassGradeView[];
  subjects: readonly SubjectView[];
  years: readonly AcademicYearView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);

  // The current year is the useful default; the newest is the fallback for a
  // school that has not yet marked one.
  const [yearId, setYearId] = useState(
    years.find((year) => year.isCurrent)?.id ?? years[0]?.id ?? "",
  );
  const [gradeId, setGradeId] = useState(grades[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [isOptional, setIsOptional] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [pendingRemoval, setPendingRemoval] = useState<ClassSubjectView | null>(null);

  const gradeOptions = grades.map((grade) => ({
    code: grade.id,
    label: grade.name.bn === "" ? grade.code : grade.name.bn,
  }));
  const yearOptions = years.map((year) => ({ code: year.id, label: year.code }));

  const shown = assignments.filter(
    (row) => row.classGradeId === gradeId && row.academicYearId === yearId,
  );

  // A subject already assigned to this class and year is not offered again —
  // the upsert would silently overwrite rather than add, which is not what the
  // button says it does.
  const assignable = subjects.filter(
    (subject) => !shown.some((row) => row.subjectId === subject.id),
  );

  async function assign() {
    if (subjectId === "" || gradeId === "" || yearId === "") return;

    const assigned = await runner.run(assignClassSubjectAction, {
      values: {
        classGradeId: gradeId,
        subjectId,
        academicYearId: yearId,
        isOptional,
        sortOrder: integer(sortOrder),
      },
    });

    if (assigned) {
      setSubjectId("");
      setIsOptional(false);
      setSortOrder("0");
    }
  }

  return (
    <Panel
      heading={copy["assignmentsHeading"] ?? ""}
      note={copy["assignmentsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          id="assign-grade"
          label={copy["grade"] ?? ""}
          value={gradeId}
          placeholder={copy["selectGrade"] ?? ""}
          options={gradeOptions}
          onChange={setGradeId}
        />
        <SelectField
          id="assign-year"
          label={copy["year"] ?? ""}
          value={yearId}
          placeholder={copy["selectYear"] ?? ""}
          options={yearOptions}
          onChange={setYearId}
        />
      </div>

      <div className="mt-5">
        <RowList empty={copy["empty"] ?? ""} count={shown.length}>
          {shown.map((row) => (
            <ListRow
              key={`${row.classGradeId}-${row.subjectId}-${row.academicYearId}`}
              copy={copy}
              onRemove={rights.delete ? () => setPendingRemoval(row) : undefined}
            >
              <span lang="bn" className="font-semibold">
                {subjectName(subjects, row.subjectId)}
              </span>
              <span className="ms-3 text-caption text-ink-muted">
                {row.isOptional ? (copy["assignmentOptional"] ?? "") : ""}
              </span>
            </ListRow>
          ))}
        </RowList>
      </div>

      {rights.add && gradeId !== "" && yearId !== "" && (
        <div className="mt-6 grid items-end gap-4 border-t border-border pt-6 md:grid-cols-4">
          <SelectField
            id="assign-subject"
            label={copy["subject"] ?? ""}
            value={subjectId}
            placeholder={copy["selectSubject"] ?? ""}
            options={assignable.map((subject) => ({
              code: subject.id,
              label: subject.name.bn === "" ? subject.code : subject.name.bn,
            }))}
            onChange={setSubjectId}
            error={issueFor(runner.issues, "values.subjectId")}
          />
          <TextField
            id="assign-order"
            label={copy["sortOrder"] ?? ""}
            value={sortOrder}
            onChange={setSortOrder}
            error={issueFor(runner.issues, "values.sortOrder")}
          />
          <CheckboxField
            id="assign-optional"
            label={copy["assignmentOptional"] ?? ""}
            checked={isOptional}
            onChange={setIsOptional}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={runner.busy || subjectId === ""}
            aria-disabled={runner.busy || subjectId === ""}
            onClick={assign}
          >
            {runner.busy ? (copy["saving"] ?? "") : (copy["assign"] ?? "")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={
          pendingRemoval === null
            ? undefined
            : [subjectName(subjects, pendingRemoval.subjectId)]
        }
        confirmLabel={copy["unassign"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            unassignClassSubjectAction,
            {
              classGradeId: pendingRemoval.classGradeId,
              subjectId: pendingRemoval.subjectId,
              academicYearId: pendingRemoval.academicYearId,
            },
            "deleted",
          );
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function subjectName(subjects: readonly SubjectView[], id: string): string {
  const subject = subjects.find((entry) => entry.id === id);
  if (subject === undefined) return `#${id}`;
  return subject.name.bn === "" ? subject.code : subject.name.bn;
}
