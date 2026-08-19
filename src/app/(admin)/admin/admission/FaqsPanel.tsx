"use client";

/**
 * Admission FAQs (§B-9, `admission_faqs`).
 *
 * The question is one line; the answer is rich text, declared with T-034's
 * `richText`, which runs §A-12's allowlist inside `parse`. Nothing on this
 * panel sanitizes anything — the editor says so beside the field, because an
 * admin who pastes a formatted answer out of Word and watches half of it
 * disappear deserves to have been warned rather than surprised.
 *
 * `admission_faqs` carries `deleted_at`, so removing a question is recoverable.
 * That matters more here than elsewhere: an FAQ answer is a public commitment
 * the school made, and "what did we say about the test fee last year" is a
 * question that gets asked.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/admission/copy";
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
} from "@/app/(admin)/admin/admission/panel-kit";
import {
  deleteAdmissionFaqAction,
  saveAdmissionFaqAction,
  updateAdmissionFaqAction,
} from "@/lib/modules/admission/actions";
import type { AdmissionFaqView } from "@/lib/modules/admission/read";

type Draft = {
  id: string | null;
  isActive: boolean;
  sortOrder: string;
  question: DualLocaleValue;
  answer: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  isActive: true,
  sortOrder: "0",
  question: { bn: "", en: "" },
  answer: { bn: "", en: "" },
};

export function FaqsPanel({
  faqs,
  copy,
  rights,
}: {
  faqs: readonly AdmissionFaqView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdmissionFaqView | null>(null);

  const questionStatus = draft === null ? null : dualLocaleStatus(draft.question);
  const answerStatus = draft === null ? null : dualLocaleStatus(draft.answer, "richtext");

  async function save() {
    if (draft === null) return;

    // Both columns are `NOT NULL` on the translation row, so English is sent
    // only when *both* halves are present — a question with no answer is not a
    // half-translated FAQ, it is an invalid row.
    const hasEnglish = draft.question.en.trim() !== "" && draft.answer.en.trim() !== "";

    const values = {
      isActive: draft.isActive,
      sortOrder: integer(draft.sortOrder),
      translations: {
        bn: { question: draft.question.bn, answer: draft.answer.bn },
        ...(hasEnglish
          ? { en: { question: draft.question.en, answer: draft.answer.en } }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveAdmissionFaqAction, { values })
        : await runner.run(updateAdmissionFaqAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  const labels = {
    bold: copy["rtBold"] ?? "",
    italic: copy["rtItalic"] ?? "",
    link: copy["rtLink"] ?? "",
    heading: copy["rtHeading"] ?? "",
    bulletList: copy["rtBulletList"] ?? "",
    willStrip: copy["rtWillStrip"] ?? "",
    preview: copy["rtPreview"] ?? "",
    source: copy["rtSource"] ?? "",
    empty: copy["rtEmpty"] ?? "",
  };

  return (
    <Panel
      heading={copy["faqsHeading"] ?? ""}
      note={copy["faqsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={faqs.length}>
        {faqs.map((faq) => (
          <ListRow
            key={faq.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(faq)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(faq) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {faq.question.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {faq.isActive ? "" : "—"}
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
              id="faq-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
            <CheckboxField
              id="faq-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="faqQuestion"
              label={copy["faqQuestion"] ?? ""}
              value={draft.question}
              onChange={(question) => setDraft({ ...draft, question })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <fieldset className="mb-4 mt-6 border-0 p-0">
            <legend className="label mb-3 flex items-center gap-2 p-0">
              <span>{copy["faqAnswer"] ?? ""}</span>
              <span className="text-caption font-normal text-danger">
                {copy["requiredLabel"] ?? ""}
              </span>
              {(answerStatus?.englishMissing ?? false) && (
                <span className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink">
                  {copy["englishMissing"] ?? ""}
                </span>
              )}
            </legend>

            <div className="grid gap-4 lg:grid-cols-2">
              <RichTextEditor
                label={copy["banglaLabel"] ?? ""}
                lang="bn"
                value={draft.answer.bn}
                onChange={(bn) => setDraft({ ...draft, answer: { ...draft.answer, bn } })}
                labels={labels}
                invalid={
                  issueFor(runner.issues, "values.translations.bn.answer") !== undefined
                }
              />
              <RichTextEditor
                label={copy["englishLabel"] ?? ""}
                lang="en"
                value={draft.answer.en}
                onChange={(en) => setDraft({ ...draft, answer: { ...draft.answer, en } })}
                labels={labels}
              />
            </div>
          </fieldset>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={
              (questionStatus?.canSave ?? false) && (answerStatus?.canSave ?? false)
            }
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.question.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteAdmissionFaqAction,
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

function toDraft(faq: AdmissionFaqView): Draft {
  return {
    id: faq.id,
    isActive: faq.isActive,
    sortOrder: String(faq.sortOrder),
    question: faq.question,
    answer: faq.answerHtml,
  };
}
