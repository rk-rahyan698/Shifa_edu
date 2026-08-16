"use client";

/**
 * The governing committee (§B-10, `committee_members`).
 *
 * This panel carries the card's Contract: **a member without recorded consent
 * cannot be activated.** The save button is disabled while "published" is
 * ticked and the consent date is empty, and the reason is stated next to the
 * date rather than only on the button — a disabled control that does not say
 * why is a control that gets reported as a bug.
 *
 * The disabling is a courtesy, not the enforcement. The same rule is a `.refine`
 * on the save schema and a `CHECK` on the table, and it is the last of those
 * that decides. See `src/lib/modules/about/actions.ts`.
 *
 * Withdrawing consent works through the same rule read backwards: clear the
 * date and the member must be unticked in the same save, which is what removes
 * their name from the site. That is deliberately a single action — a flow that
 * let consent be cleared while the row stayed published would leave a person
 * named on a page nobody had agreed to.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/about/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/admin/about/panel-kit";
import {
  deleteCommitteeMemberAction,
  saveCommitteeMemberAction,
} from "@/lib/modules/about/actions";
import type { CommitteeMemberView } from "@/lib/modules/about/read";

type Draft = {
  id: string | null;
  publishConsentAt: string;
  isActive: boolean;
  sortOrder: string;
  name: DualLocaleValue;
  designation: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  publishConsentAt: "",
  // A new member starts unpublished. Defaulting to published would mean the
  // very first save of a person's name is the one that has to be caught by the
  // consent rule, rather than a deliberate second step.
  isActive: false,
  sortOrder: "0",
  name: { bn: "", en: "" },
  designation: { bn: "", en: "" },
};

export function CommitteePanel({
  committee,
  copy,
  editable,
}: {
  committee: readonly CommitteeMemberView[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CommitteeMemberView | null>(null);

  const needsConsent = draft !== null && draft.isActive && draft.publishConsentAt === "";
  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);
  const designationStatus = draft === null ? null : dualLocaleStatus(draft.designation);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.name.en.trim() !== "" && draft.designation.en.trim() !== "";

    const saved = await runner.run(saveCommitteeMemberAction, {
      id: draft.id,
      publishConsentAt:
        draft.publishConsentAt === "" ? null : `${draft.publishConsentAt}T00:00:00Z`,
      values: {
        isActive: draft.isActive,
        sortOrder: integer(draft.sortOrder),
        translations: {
          bn: { name: draft.name.bn, designation: draft.designation.bn },
          ...(hasEnglish
            ? { en: { name: draft.name.en, designation: draft.designation.en } }
            : {}),
        },
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["committeeHeading"] ?? ""}
      note={copy["committeeNote"]}
      lockedNote={copy["contentLocked"]}
      editable={editable}
    >
      {committee.length === 0 ? (
        <p className="text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {committee.map((member) => (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2"
            >
              <span>
                <span lang="bn" className="font-semibold">
                  {member.name.bn}
                </span>
                <span lang="bn" className="ms-3 text-caption text-ink-muted">
                  {member.designation.bn}
                </span>
                <span className="ms-3 text-caption text-ink-muted">
                  {member.isActive ? "✓" : "—"}
                  {member.publishConsentAt === ""
                    ? ` · ${copy["memberNoConsent"] ?? ""}`
                    : ` · ${member.publishConsentAt}`}
                </span>
              </span>

              {editable && (
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setDraft(toDraft(member))}
                  >
                    {copy["edit"] ?? ""}
                  </button>
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setPendingRemoval(member)}
                  >
                    {copy["remove"] ?? ""}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && draft === null && (
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
          <DualLocaleField
            name="memberName"
            label={copy["memberName"] ?? ""}
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
            name="memberDesignation"
            label={copy["memberDesignation"] ?? ""}
            value={draft.designation}
            onChange={(designation) => setDraft({ ...draft, designation })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="member-consent-at"
              label={copy["memberConsentAt"] ?? ""}
              type="date"
              value={draft.publishConsentAt}
              onChange={(publishConsentAt) => setDraft({ ...draft, publishConsentAt })}
              error={
                issueFor(runner.issues, "publishConsentAt") ??
                (needsConsent ? copy["memberNeedsConsent"] : undefined)
              }
            />
            <TextField
              id="member-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="member-active"
              label={copy["memberActive"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
              hint={copy["memberNeedsConsent"]}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={
              (nameStatus?.canSave ?? false) &&
              (designationStatus?.canSave ?? false) &&
              !needsConsent
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.name.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteCommitteeMemberAction,
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

function toDraft(member: CommitteeMemberView): Draft {
  return {
    id: member.id,
    publishConsentAt: member.publishConsentAt,
    isActive: member.isActive,
    sortOrder: String(member.sortOrder),
    name: member.name,
    designation: member.designation,
  };
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
