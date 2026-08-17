"use client";

/**
 * Required documents (§B-9, `admission_documents`).
 *
 * A flat, orderable list of what an applicant must bring, with `is_mandatory`
 * separating "you will be turned away without this" from "bring it if you have
 * it". The distinction is a column rather than a convention in the wording,
 * because a parent scanning the list needs it to be visually obvious and the
 * public page cannot infer it from prose.
 *
 * The rows are not scoped to a cycle. §B-9 gives `admission_documents` no
 * `admission_cycle_id`, and that is right: the birth certificate requirement
 * does not change from year to year, and a per-cycle list would have to be
 * copied forward every January.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
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
  TextField,
  anyRight,
  integer,
  issueFor,
  useActionRunner,
  type Rights,
} from "@/app/admin/admission/panel-kit";
import {
  deleteAdmissionDocumentAction,
  saveAdmissionDocumentAction,
  updateAdmissionDocumentAction,
} from "@/lib/modules/admission/actions";
import type { AdmissionDocumentView } from "@/lib/modules/admission/read";

type Draft = {
  id: string | null;
  isMandatory: boolean;
  isActive: boolean;
  sortOrder: string;
  name: DualLocaleValue;
  note: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  isMandatory: true,
  isActive: true,
  sortOrder: "0",
  name: { bn: "", en: "" },
  note: { bn: "", en: "" },
};

export function DocumentsPanel({
  documents,
  copy,
  rights,
}: {
  documents: readonly AdmissionDocumentView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdmissionDocumentView | null>(
    null,
  );

  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.name.en.trim() !== "";

    const values = {
      isMandatory: draft.isMandatory,
      isActive: draft.isActive,
      sortOrder: integer(draft.sortOrder),
      translations: {
        bn: { name: draft.name.bn, note: blankToNull(draft.note.bn) },
        ...(hasEnglish
          ? { en: { name: draft.name.en, note: blankToNull(draft.note.en) } }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveAdmissionDocumentAction, { values })
        : await runner.run(updateAdmissionDocumentAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["documentsHeading"] ?? ""}
      note={copy["documentsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={documents.length}>
        {documents.map((document) => (
          <ListRow
            key={document.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(document)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(document) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {document.name.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {document.isMandatory
                ? (copy["documentMandatory"] ?? "")
                : (copy["optionalLabel"] ?? "")}
              {document.isActive ? "" : " · —"}
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
              id="document-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
            <CheckboxField
              id="document-mandatory"
              label={copy["documentMandatory"] ?? ""}
              checked={draft.isMandatory}
              onChange={(isMandatory) => setDraft({ ...draft, isMandatory })}
            />
            <CheckboxField
              id="document-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="documentName"
              label={copy["documentName"] ?? ""}
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
              name="documentNote"
              label={copy["documentNote"] ?? ""}
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
          await runner.run(
            deleteAdmissionDocumentAction,
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

function toDraft(document: AdmissionDocumentView): Draft {
  return {
    id: document.id,
    isMandatory: document.isMandatory,
    isActive: document.isActive,
    sortOrder: String(document.sortOrder),
    name: document.name,
    note: document.note,
  };
}
