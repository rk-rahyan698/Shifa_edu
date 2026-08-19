"use client";

/**
 * Feature tiles (§B-10, `features`).
 *
 * A feature's title is required in Bangla and its image is optional — but an
 * image that *is* set is published, so the alt-text Contract applies to it
 * exactly as it does to a hero slide. The save is blocked here and refused in
 * the pipeline; only the second is enforcement.
 *
 * `feature_translations.description` is not offered. T-034's `featureSchema`
 * declares `title` alone, the column is nullable, and this card's Do list asks
 * for "features CRUD" without naming it — so the field is left to whichever
 * card revisits the schema, rather than this one restating a translation shape
 * that already exists somewhere else.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MediaField } from "@/app/(admin)/admin/home/MediaField";
import type { Copy } from "@/app/(admin)/admin/home/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/home/panel-kit";
import { deleteFeatureAction, saveFeatureAction } from "@/lib/modules/home/actions";
import type { FeatureView } from "@/lib/modules/home/read";

type Draft = {
  id: string | null;
  icon: string;
  mediaId: string | null;
  mediaAltPresent: boolean;
  isActive: boolean;
  sortOrder: string;
  title: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  icon: "",
  mediaId: null,
  mediaAltPresent: false,
  isActive: true,
  sortOrder: "0",
  title: { bn: "", en: "" },
};

export function FeaturesPanel({
  features,
  copy,
  editable,
}: {
  features: readonly FeatureView[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<FeatureView | null>(null);

  const altMissing = draft !== null && draft.mediaId !== null && !draft.mediaAltPresent;
  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const saved = await runner.run(saveFeatureAction, {
      id: draft.id,
      values: {
        icon: draft.icon,
        mediaId: draft.mediaId,
        isActive: draft.isActive,
        sortOrder: integer(draft.sortOrder),
        translations: {
          bn: { title: draft.title.bn },
          ...(hasEnglish ? { en: { title: draft.title.en } } : {}),
        },
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["featuresHeading"] ?? ""}
      note={copy["featuresNote"]}
      lockedNote={copy["slidesLocked"]}
      editable={editable}
    >
      {features.length === 0 ? (
        <p className="text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li
              key={feature.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2"
            >
              <span>
                <span lang="bn" className="font-semibold">
                  {feature.title.bn}
                </span>
                <span className="ms-3 text-caption text-ink-muted">
                  {feature.isActive ? "✓" : "—"}
                  {feature.mediaId !== null &&
                    feature.mediaAltBn === "" &&
                    ` · ${copy["slideAltMissing"] ?? ""}`}
                </span>
              </span>

              {editable && (
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setDraft(toDraft(feature))}
                  >
                    {copy["edit"] ?? ""}
                  </button>
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setPendingRemoval(feature)}
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
            name="featureTitle"
            label={copy["featureTitle"] ?? ""}
            value={draft.title}
            onChange={(title) => setDraft({ ...draft, title })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="feature-icon"
              label={copy["featureIcon"] ?? ""}
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              error={issueFor(runner.issues, "values.icon")}
            />
            <TextField
              id="feature-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <MediaField
              label={copy["featureImage"] ?? ""}
              copy={copy}
              mediaId={draft.mediaId}
              onUploaded={(asset) =>
                setDraft({ ...draft, mediaId: asset.id, mediaAltPresent: true })
              }
              onCleared={() =>
                setDraft({ ...draft, mediaId: null, mediaAltPresent: false })
              }
            />
            {altMissing && <p className="field-error">{copy["slideAltMissing"] ?? ""}</p>}
            {issueFor(runner.issues, "values.mediaId") !== undefined && (
              <p className="field-error">{issueFor(runner.issues, "values.mediaId")}</p>
            )}
          </div>

          <div className="mt-4">
            <CheckboxField
              id="feature-active"
              label={copy["featureActive"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={(titleStatus?.canSave ?? false) && !altMissing}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.title.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteFeatureAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(feature: FeatureView): Draft {
  return {
    id: feature.id,
    icon: feature.icon,
    mediaId: feature.mediaId,
    mediaAltPresent: feature.mediaAltBn !== "",
    isActive: feature.isActive,
    sortOrder: String(feature.sortOrder),
    title: feature.title,
  };
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
