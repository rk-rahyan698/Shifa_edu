"use client";

/**
 * The subject master (§B-8, `subjects`).
 *
 * §B-8 replaced the PRD's per-class subject rows with a master list and a
 * junction, and the reason is on this screen: "Mathematics" is one subject the
 * school teaches, not fourteen, and renaming it should be one edit rather than
 * fourteen. Assigning a subject to a class is the next panel's job.
 *
 * Removing a subject is refused while any class assignment or exam still points
 * at it. `subjects` is soft-deleted, so `RESTRICT` on those foreign keys never
 * fires — the check is in the module's `remove`, for the same reason and by the
 * same mechanism as the class-grade Contract.
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
  deleteSubjectAction,
  saveSubjectAction,
  updateSubjectAction,
} from "@/lib/modules/academics/actions";
import type { SubjectView } from "@/lib/modules/academics/read";

type Draft = {
  id: string | null;
  code: string;
  isActive: boolean;
  name: DualLocaleValue;
  shortName: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  code: "",
  isActive: true,
  name: { bn: "", en: "" },
  shortName: { bn: "", en: "" },
};

export function SubjectsPanel({
  subjects,
  copy,
  rights,
}: {
  subjects: readonly SubjectView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<SubjectView | null>(null);

  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.name.en.trim() !== "";

    const values = {
      code: draft.code,
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
        ? await runner.run(saveSubjectAction, { values })
        : await runner.run(updateSubjectAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["subjectsHeading"] ?? ""}
      note={copy["subjectsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={subjects.length}>
        {subjects.map((subject) => (
          <ListRow
            key={subject.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(subject)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(subject) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {subject.name.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {subject.code}
              {subject.isActive ? "" : " · —"}
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
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="subject-code"
              label={copy["subjectCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <CheckboxField
              id="subject-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="subjectName"
              label={copy["subjectName"] ?? ""}
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
              name="subjectShortName"
              label={copy["subjectShortName"] ?? ""}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.name.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          const removed = await runner.run(
            deleteSubjectAction,
            { id: pendingRemoval.id },
            "deleted",
          );
          // Left open on a refusal — the toast names what still points at it.
          if (removed) setPendingRemoval(null);
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

function toDraft(subject: SubjectView): Draft {
  return {
    id: subject.id,
    code: subject.code,
    isActive: subject.isActive,
    name: subject.name,
    shortName: subject.shortName,
  };
}
