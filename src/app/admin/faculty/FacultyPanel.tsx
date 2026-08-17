"use client";

/**
 * Faculty profiles (§B-7, `faculty` + `faculty_translations` + `faculty_subjects`).
 *
 * This panel carries two of the card's Contract clauses.
 *
 * **Publishing without consent is impossible.** `publishConsentAt` and
 * `photoConsentAt` are date fields — "recorded on", mirroring `about`'s
 * `CommitteePanel` — and the Save button is disabled with the reason stated
 * next to the field whenever the status is `published` without publish
 * consent, or a photo is set without photo consent. That is a courtesy: the
 * schema's own `.refine()` and the table's `CHECK` constraints are what
 * actually decide, in `src/lib/modules/faculty/actions.ts`.
 *
 * **Subjects are a plain multi-select on this same form.** `faculty_subjects`
 * is replaced wholesale on every save (`syncSubjects` in `actions.ts`), so the
 * checkbox group here is simply "which subjects are ticked right now" — there
 * is no separate assign/unassign step to keep in sync.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/faculty/copy";
import { InternalPanel } from "@/app/admin/faculty/InternalPanel";
import { MediaField, type UploadedAsset } from "@/app/admin/faculty/MediaField";
import {
  CheckboxGroup,
  EditorActions,
  ListRow,
  Panel,
  RowList,
  SelectField,
  TextField,
  anyRight,
  dateToTimestamp,
  integer,
  issueFor,
  optionalInteger,
  useActionRunner,
  type Rights,
} from "@/app/admin/faculty/panel-kit";
import {
  deleteFacultyAction,
  saveFacultyAction,
  updateFacultyAction,
} from "@/lib/modules/faculty/actions";
import type {
  DesignationOption,
  FacultyPrivateView,
  FacultyView,
  SubjectOption,
} from "@/lib/modules/faculty/read";

type Draft = {
  id: string | null;
  designationId: string;
  photoMediaId: string | null;
  experienceYears: string;
  joinedOn: string;
  publishConsentAt: string;
  photoConsentAt: string;
  statusCode: string;
  sortOrder: string;
  fullName: DualLocaleValue;
  qualification: DualLocaleValue;
  bio: DualLocaleValue;
  subjectIds: readonly string[];
};

const BLANK: Draft = {
  id: null,
  designationId: "",
  photoMediaId: null,
  experienceYears: "",
  joinedOn: "",
  publishConsentAt: "",
  photoConsentAt: "",
  statusCode: "draft",
  sortOrder: "0",
  fullName: { bn: "", en: "" },
  qualification: { bn: "", en: "" },
  bio: { bn: "", en: "" },
  subjectIds: [],
};

export function FacultyPanel({
  faculty,
  designations,
  subjects,
  copy,
  rights,
  isSuperAdmin,
  privateByFacultyId,
}: {
  faculty: readonly FacultyView[];
  designations: readonly DesignationOption[];
  subjects: readonly SubjectOption[];
  copy: Copy;
  rights: Rights;
  /** Governs the Internal panel below — see `InternalPanel.tsx`'s header. */
  isSuperAdmin: boolean;
  privateByFacultyId: ReadonlyMap<string, FacultyPrivateView>;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<FacultyView | null>(null);

  const designationOptions = designations.map((entry) => ({
    code: entry.id,
    label: entry.name.bn,
  }));
  const subjectOptions = subjects.map((entry) => ({ code: entry.id, label: entry.name.bn }));
  const statusOptions = [
    { code: "draft", label: copy["statusDraft"] ?? "" },
    { code: "published", label: copy["statusPublished"] ?? "" },
    { code: "archived", label: copy["statusArchived"] ?? "" },
  ];

  const nameStatus = draft === null ? null : dualLocaleStatus(draft.fullName);
  const needsPublishConsent =
    draft !== null && draft.statusCode === "published" && draft.publishConsentAt === "";
  const needsPhotoConsent =
    draft !== null && draft.photoMediaId !== null && draft.photoConsentAt === "";

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.fullName.en.trim() !== "";

    const values = {
      designationId: draft.designationId,
      photoMediaId: draft.photoMediaId,
      experienceYears: optionalInteger(draft.experienceYears),
      joinedOn: draft.joinedOn === "" ? null : draft.joinedOn,
      publishConsentAt: dateToTimestamp(draft.publishConsentAt),
      photoConsentAt: dateToTimestamp(draft.photoConsentAt),
      statusCode: draft.statusCode,
      sortOrder: integer(draft.sortOrder),
      translations: {
        bn: {
          fullName: draft.fullName.bn,
          qualification: draft.qualification.bn,
          bio: draft.bio.bn,
        },
        ...(hasEnglish
          ? {
              en: {
                fullName: draft.fullName.en,
                qualification: draft.qualification.en,
                bio: draft.bio.en,
              },
            }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveFacultyAction, { values, subjectIds: draft.subjectIds })
        : await runner.run(updateFacultyAction, {
            id: draft.id,
            values,
            subjectIds: draft.subjectIds,
          });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["heading"] ?? ""}
      note={copy["intro"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={faculty.length}>
        {faculty.map((member) => (
          <ListRow
            key={member.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(member)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(member) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {member.fullName.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {designationOptions.find((entry) => entry.code === member.designationId)
                ?.label ?? ""}
              {" · "}
              {statusOptions.find((entry) => entry.code === member.statusCode)?.label ?? ""}
              {member.employeeCode !== null ? ` · ${member.employeeCode}` : ""}
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
          <DualLocaleField
            name="facultyName"
            label={copy["fullName"] ?? ""}
            value={draft.fullName}
            onChange={(fullName) => setDraft({ ...draft, fullName })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <DualLocaleField
              name="facultyQualification"
              label={copy["qualification"] ?? ""}
              value={draft.qualification}
              onChange={(qualification) => setDraft({ ...draft, qualification })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="facultyBio"
              label={copy["bio"] ?? ""}
              kind="multiline"
              value={draft.bio}
              onChange={(bio) => setDraft({ ...draft, bio })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SelectField
              id="faculty-designation"
              label={copy["designation"] ?? ""}
              value={draft.designationId}
              placeholder={copy["selectDesignation"] ?? ""}
              options={designationOptions}
              onChange={(designationId) => setDraft({ ...draft, designationId })}
              error={issueFor(runner.issues, "values.designationId")}
            />
            <SelectField
              id="faculty-status"
              label={copy["status"] ?? ""}
              value={draft.statusCode}
              placeholder=""
              options={statusOptions}
              onChange={(statusCode) => setDraft({ ...draft, statusCode })}
              error={
                issueFor(runner.issues, "values.publishConsentAt") ??
                (needsPublishConsent ? copy["publishConsentNeeded"] : undefined)
              }
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <TextField
              id="faculty-experience"
              label={copy["experienceYears"] ?? ""}
              type="number"
              value={draft.experienceYears}
              onChange={(experienceYears) => setDraft({ ...draft, experienceYears })}
              error={issueFor(runner.issues, "values.experienceYears")}
            />
            <TextField
              id="faculty-joined"
              label={copy["joinedOn"] ?? ""}
              type="date"
              value={draft.joinedOn}
              onChange={(joinedOn) => setDraft({ ...draft, joinedOn })}
              error={issueFor(runner.issues, "values.joinedOn")}
            />
            <TextField
              id="faculty-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <TextField
              id="faculty-publish-consent"
              label={copy["publishConsentAt"] ?? ""}
              type="date"
              value={draft.publishConsentAt}
              onChange={(publishConsentAt) => setDraft({ ...draft, publishConsentAt })}
              hint={needsPublishConsent ? copy["publishConsentNeeded"] : undefined}
            />
          </div>

          <CheckboxGroup
            legend={copy["subjectsHeading"] ?? ""}
            options={subjectOptions}
            selected={draft.subjectIds}
            onChange={(subjectIds) => setDraft({ ...draft, subjectIds })}
          />

          <div className="mt-4 border-t border-border pt-4">
            <p className="label mb-2">{copy["photoHeading"] ?? ""}</p>
            <MediaField
              label={copy["photoHeading"] ?? ""}
              copy={copy}
              mediaId={draft.photoMediaId}
              onUploaded={(asset: UploadedAsset) =>
                setDraft({ ...draft, photoMediaId: asset.id })
              }
              onCleared={() =>
                setDraft({ ...draft, photoMediaId: null, photoConsentAt: "" })
              }
            />
            {draft.photoMediaId !== null && (
              <div className="mt-3 max-w-xs">
                <TextField
                  id="faculty-photo-consent"
                  label={copy["photoConsentAt"] ?? ""}
                  type="date"
                  value={draft.photoConsentAt}
                  onChange={(photoConsentAt) => setDraft({ ...draft, photoConsentAt })}
                  hint={needsPhotoConsent ? copy["photoConsentNeeded"] : undefined}
                />
              </div>
            )}
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={
              (nameStatus?.canSave ?? false) &&
              draft.designationId !== "" &&
              !needsPublishConsent &&
              !needsPhotoConsent
            }
            onSave={save}
            onCancel={() => {
              setDraft(null);
              runner.clearIssues();
            }}
          />

          {isSuperAdmin &&
            (draft.id === null ? (
              <p className="callout mt-4" role="status">
                {copy["internalSaveFirst"] ?? ""}
              </p>
            ) : (
              <InternalPanel
                facultyId={draft.id}
                initial={privateByFacultyId.get(draft.id) ?? null}
                copy={copy}
              />
            ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.fullName.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteFacultyAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(member: FacultyView): Draft {
  return {
    id: member.id,
    designationId: member.designationId,
    photoMediaId: member.photoMediaId,
    experienceYears: member.experienceYears === null ? "" : String(member.experienceYears),
    joinedOn: member.joinedOn,
    publishConsentAt: member.publishConsentAt,
    photoConsentAt: member.photoConsentAt,
    statusCode: member.statusCode,
    sortOrder: String(member.sortOrder),
    fullName: member.fullName,
    qualification: member.qualification,
    bio: member.bio,
    subjectIds: member.subjectIds,
  };
}
