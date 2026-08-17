"use client";

/**
 * Exam terms and their sittings (§B-8, `exam_terms` and `exams`).
 *
 * Two panels in one file because they are one idea. §B-8 rejected the PRD's
 * flat `ExamSchedule` — one name, one class, one date — for a term that
 * *contains* per-class, per-subject sittings, because "one date" cannot express
 * an exam routine and an exam routine is the thing parents actually need. Terms
 * without sittings are an empty promise; sittings without a term have nowhere
 * to hang. Editing them side by side is the shape of the data.
 *
 * `exams.subject_id` is nullable on purpose: a term carries whole-school dates
 * ("results published") that belong to no single subject, so the subject
 * selector is explicitly optional rather than a required field with a blank
 * option nobody understands.
 *
 * Deleting a term is a real `DELETE`, and `exams.exam_term_id` is `CASCADE` —
 * its sittings go with it. That is §B-8's decision, not this panel's, and the
 * confirm dialog says how many are about to go.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/academics/copy";
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
} from "@/app/admin/academics/panel-kit";
import {
  deleteExamAction,
  deleteExamTermAction,
  saveExamAction,
  saveExamTermAction,
  updateExamAction,
  updateExamTermAction,
} from "@/lib/modules/academics/actions";
import type {
  AcademicYearView,
  ClassGradeView,
  ExamTermView,
  ExamView,
  SubjectView,
} from "@/lib/modules/academics/read";

// ─────────────────────────────────────────────────────────────────────────────
// Exam terms
// ─────────────────────────────────────────────────────────────────────────────

type TermDraft = {
  id: string | null;
  academicYearId: string;
  code: string;
  sortOrder: string;
  isActive: boolean;
  name: DualLocaleValue;
};

export function ExamTermsPanel({
  terms,
  exams,
  years,
  copy,
  rights,
}: {
  terms: readonly ExamTermView[];
  exams: readonly ExamView[];
  years: readonly AcademicYearView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const defaultYearId = years.find((year) => year.isCurrent)?.id ?? years[0]?.id ?? "";
  const [draft, setDraft] = useState<TermDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ExamTermView | null>(null);

  const yearOptions = years.map((year) => ({ code: year.id, label: year.code }));
  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);

  const complete =
    draft !== null &&
    draft.academicYearId !== "" &&
    draft.code.trim() !== "" &&
    (nameStatus?.canSave ?? false);

  async function save() {
    if (draft === null) return;

    const values = {
      academicYearId: draft.academicYearId,
      code: draft.code,
      sortOrder: integer(draft.sortOrder),
      isActive: draft.isActive,
      translations: {
        bn: { name: draft.name.bn },
        ...(draft.name.en.trim() === "" ? {} : { en: { name: draft.name.en } }),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveExamTermAction, { values })
        : await runner.run(updateExamTermAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["examTermsHeading"] ?? ""}
      note={copy["examTermsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={terms.length}>
        {terms.map((term) => (
          <ListRow
            key={term.id}
            copy={copy}
            onEdit={
              rights.edit
                ? () =>
                    setDraft({
                      id: term.id,
                      academicYearId: term.academicYearId,
                      code: term.code,
                      sortOrder: String(term.sortOrder),
                      isActive: term.isActive,
                      name: term.name,
                    })
                : undefined
            }
            onRemove={rights.delete ? () => setPendingRemoval(term) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {term.name.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {term.code} · {labelFor(yearOptions, term.academicYearId)}
              {term.isActive ? "" : " · —"}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() =>
            setDraft({
              id: null,
              academicYearId: defaultYearId,
              code: "",
              sortOrder: "0",
              isActive: true,
              name: { bn: "", en: "" },
            })
          }
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              id="term-year"
              label={copy["year"] ?? ""}
              value={draft.academicYearId}
              placeholder={copy["selectYear"] ?? ""}
              options={yearOptions}
              onChange={(academicYearId) => setDraft({ ...draft, academicYearId })}
              error={issueFor(runner.issues, "values.academicYearId")}
            />
            <TextField
              id="term-code"
              label={copy["examTermCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <TextField
              id="term-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="termName"
              label={copy["examTermName"] ?? ""}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="term-active"
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
            canSave={complete}
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
        atRisk={
          pendingRemoval === null
            ? undefined
            : [
                pendingRemoval.name.bn === ""
                  ? pendingRemoval.code
                  : pendingRemoval.name.bn,
                `${copy["examsHeading"] ?? ""}: ${
                  exams.filter((exam) => exam.examTermId === pendingRemoval.id).length
                }`,
              ]
        }
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          const removed = await runner.run(
            deleteExamTermAction,
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

// ─────────────────────────────────────────────────────────────────────────────
// Exams
// ─────────────────────────────────────────────────────────────────────────────

type ExamDraft = {
  id: string | null;
  examTermId: string;
  classGradeId: string;
  subjectId: string;
  examDate: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  note: DualLocaleValue;
};

const BLANK_EXAM: ExamDraft = {
  id: null,
  examTermId: "",
  classGradeId: "",
  subjectId: "",
  examDate: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
  note: { bn: "", en: "" },
};

export function ExamsPanel({
  exams,
  terms,
  grades,
  subjects,
  copy,
  rights,
}: {
  exams: readonly ExamView[];
  terms: readonly ExamTermView[];
  grades: readonly ClassGradeView[];
  subjects: readonly SubjectView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<ExamDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ExamView | null>(null);

  const termOptions = terms.map((term) => ({
    code: term.id,
    label: term.name.bn === "" ? term.code : term.name.bn,
  }));
  const gradeOptions = grades.map((grade) => ({
    code: grade.id,
    label: grade.name.bn === "" ? grade.code : grade.name.bn,
  }));
  const subjectOptions = subjects.map((subject) => ({
    code: subject.id,
    label: subject.name.bn === "" ? subject.code : subject.name.bn,
  }));

  const complete =
    draft !== null &&
    draft.examTermId !== "" &&
    draft.classGradeId !== "" &&
    draft.examDate !== "";

  async function save() {
    if (draft === null) return;

    const hasNote = draft.note.bn.trim() !== "";
    const hasEnglishNote = draft.note.en.trim() !== "";

    const values = {
      examTermId: draft.examTermId,
      classGradeId: draft.classGradeId,
      subjectId: optionalId(draft.subjectId),
      examDate: draft.examDate,
      startsAt: draft.startsAt === "" ? null : draft.startsAt,
      endsAt: draft.endsAt === "" ? null : draft.endsAt,
      isActive: draft.isActive,
      // `examSchema.translations` is optional in T-034, and a sitting with no
      // note is the common case — sending an empty Bangla string would store
      // one rather than leaving the row without a translation.
      ...(hasNote
        ? {
            translations: {
              bn: { note: draft.note.bn },
              ...(hasEnglishNote ? { en: { note: draft.note.en } } : {}),
            },
          }
        : {}),
    };

    const saved =
      draft.id === null
        ? await runner.run(saveExamAction, { values })
        : await runner.run(updateExamAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["examsHeading"] ?? ""}
      note={copy["examsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={exams.length}>
        {exams.map((exam) => (
          <ListRow
            key={exam.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toExamDraft(exam)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(exam) : undefined}
          >
            <span className="font-semibold">{exam.examDate}</span>
            <span lang="bn" className="ms-3">
              {labelFor(gradeOptions, exam.classGradeId)}
              {exam.subjectId === null
                ? ""
                : ` · ${labelFor(subjectOptions, exam.subjectId)}`}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {labelFor(termOptions, exam.examTermId)}
              {exam.startsAt === "" ? "" : ` · ${exam.startsAt}`}
              {exam.endsAt === "" ? "" : `–${exam.endsAt}`}
              {exam.isActive ? "" : " · —"}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK_EXAM)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              id="exam-term"
              label={copy["examTerm"] ?? ""}
              value={draft.examTermId}
              placeholder={copy["selectTerm"] ?? ""}
              options={termOptions}
              onChange={(examTermId) => setDraft({ ...draft, examTermId })}
              error={issueFor(runner.issues, "values.examTermId")}
            />
            <SelectField
              id="exam-grade"
              label={copy["grade"] ?? ""}
              value={draft.classGradeId}
              placeholder={copy["selectGrade"] ?? ""}
              options={gradeOptions}
              onChange={(classGradeId) => setDraft({ ...draft, classGradeId })}
              error={issueFor(runner.issues, "values.classGradeId")}
            />
            <SelectField
              id="exam-subject"
              label={copy["subject"] ?? ""}
              value={draft.subjectId}
              placeholder={copy["selectSubjectOptional"] ?? ""}
              options={subjectOptions}
              onChange={(subjectId) => setDraft({ ...draft, subjectId })}
              error={issueFor(runner.issues, "values.subjectId")}
            />
            <TextField
              id="exam-date"
              label={copy["examDate"] ?? ""}
              type="date"
              value={draft.examDate}
              onChange={(examDate) => setDraft({ ...draft, examDate })}
              error={issueFor(runner.issues, "values.examDate")}
            />
            <TextField
              id="exam-starts"
              label={copy["examStartsAt"] ?? ""}
              type="time"
              value={draft.startsAt}
              onChange={(startsAt) => setDraft({ ...draft, startsAt })}
              error={issueFor(runner.issues, "values.startsAt")}
            />
            <TextField
              id="exam-ends"
              label={copy["examEndsAt"] ?? ""}
              type="time"
              value={draft.endsAt}
              onChange={(endsAt) => setDraft({ ...draft, endsAt })}
              error={issueFor(runner.issues, "values.endsAt")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="examNote"
              label={copy["examNote"] ?? ""}
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
              id="exam-active"
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
            canSave={complete}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.examDate]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteExamAction, { id: pendingRemoval.id }, "deleted");
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

function toExamDraft(exam: ExamView): ExamDraft {
  return {
    id: exam.id,
    examTermId: exam.examTermId,
    classGradeId: exam.classGradeId,
    subjectId: exam.subjectId ?? "",
    examDate: exam.examDate,
    startsAt: exam.startsAt,
    endsAt: exam.endsAt,
    isActive: exam.isActive,
    note: exam.note,
  };
}
