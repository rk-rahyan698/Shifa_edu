"use client";

/**
 * Classes (§B-8, `class_grades`).
 *
 * This panel carries the card's Contract: **a class with dependent fee
 * structures or exams cannot be deleted; the refusal names what is in the way.**
 *
 * The row shows a dependent-record marker and the confirm dialog lists the
 * counts, so an admin usually learns the rule before pressing anything. That is
 * a courtesy, not the enforcement, and the distinction matters: the counts came
 * from the page render and a fee structure may have been created since. The
 * server re-counts inside the transaction and refuses with a sentence naming
 * the actual rows, which `useActionRunner` surfaces verbatim rather than
 * flattening into "those values were not accepted".
 *
 * The remove link is therefore *not* disabled when dependants exist. A disabled
 * button teaches nothing and would be lying about a count that may be stale;
 * pressing it and being told exactly which two fee structures are in the way is
 * the more useful outcome.
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
  SelectField,
  TextField,
  anyRight,
  integer,
  issueFor,
  optionalId,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/academics/panel-kit";
import {
  deleteClassGradeAction,
  saveClassGradeAction,
  updateClassGradeAction,
} from "@/lib/modules/academics/actions";
import type { ClassGradeView, LookupView } from "@/lib/modules/academics/read";

type Draft = {
  id: string | null;
  code: string;
  classStageId: string;
  sortOrder: string;
  isActive: boolean;
  name: DualLocaleValue;
  shortName: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  code: "",
  classStageId: "",
  sortOrder: "0",
  isActive: true,
  name: { bn: "", en: "" },
  shortName: { bn: "", en: "" },
};

export function GradesPanel({
  grades,
  stages,
  copy,
  rights,
}: {
  grades: readonly ClassGradeView[];
  stages: readonly LookupView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ClassGradeView | null>(null);

  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.name.en.trim() !== "";

    const values = {
      code: draft.code,
      classStageId: optionalId(draft.classStageId),
      sortOrder: integer(draft.sortOrder),
      isActive: draft.isActive,
      translations: {
        bn: { name: draft.name.bn, shortName: blankToNull(draft.shortName.bn) },
        ...(hasEnglish
          ? { en: { name: draft.name.en, shortName: blankToNull(draft.shortName.en) } }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveClassGradeAction, { values })
        : await runner.run(updateClassGradeAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["gradesHeading"] ?? ""}
      note={copy["gradesNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={grades.length}>
        {grades.map((grade) => (
          <ListRow
            key={grade.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(grade)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(grade) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {grade.name.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {grade.code}
              {grade.isActive ? "" : " · —"}
              {dependants(grade) > 0 ? ` · ${copy["gradeBlocked"] ?? ""}` : ""}
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
              id="grade-code"
              label={copy["gradeCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <SelectField
              id="grade-stage"
              label={copy["gradeStage"] ?? ""}
              value={draft.classStageId}
              placeholder={copy["selectStage"] ?? ""}
              options={stages.map((stage) => ({ code: stage.id, label: stage.label }))}
              onChange={(classStageId) => setDraft({ ...draft, classStageId })}
              error={issueFor(runner.issues, "values.classStageId")}
            />
            <TextField
              id="grade-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="gradeName"
              label={copy["gradeName"] ?? ""}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />

            <DualLocaleField
              name="gradeShortName"
              label={copy["gradeShortName"] ?? ""}
              value={draft.shortName}
              onChange={(shortName) => setDraft({ ...draft, shortName })}
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
              id="grade-active"
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
            canSave={nameStatus?.canSave ?? false}
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
        atRisk={pendingRemoval === null ? undefined : atRisk(pendingRemoval, copy)}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          const removed = await runner.run(
            deleteClassGradeAction,
            { id: pendingRemoval.id },
            "deleted",
          );
          // Left open on a refusal: the toast names the blocking rows, and
          // closing the dialog under it would look like the delete succeeded.
          if (removed) setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function dependants(grade: ClassGradeView): number {
  return grade.blockedBy.feeStructures + grade.blockedBy.exams;
}

/**
 * What the dialog warns about before the server is asked.
 *
 * The counts are what `read.ts` saw at render. They are shown as a heads-up and
 * never as the decision — see this file's header.
 */
function atRisk(grade: ClassGradeView, copy: Copy): string[] {
  const lines = [grade.name.bn === "" ? grade.code : grade.name.bn];

  if (grade.blockedBy.feeStructures > 0 || grade.blockedBy.exams > 0) {
    lines.push(
      `${copy["gradeBlocked"] ?? ""}: ${grade.blockedBy.feeStructures} + ${grade.blockedBy.exams}`,
    );
  }

  return lines;
}

/** An empty optional string is a null column, not an empty one. */
function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toDraft(grade: ClassGradeView): Draft {
  return {
    id: grade.id,
    code: grade.code,
    classStageId: grade.classStageId ?? "",
    sortOrder: String(grade.sortOrder),
    isActive: grade.isActive,
    name: grade.name,
    shortName: grade.shortName,
  };
}
