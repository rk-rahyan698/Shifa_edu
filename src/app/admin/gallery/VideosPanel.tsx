"use client";

/**
 * Videos (§B-12, `gallery_videos`).
 *
 * This panel carries the card's Contract: **pasting a full YouTube URL
 * extracts the id and stores only that.** The "video link or id" field calls
 * `extractVideoId` on every keystroke — see `video-id.ts` for why the
 * extraction has to happen before the value ever reaches the save schema, not
 * after. What is stored, and what round-trips back into this field on edit, is
 * always the bare id.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/gallery/copy";
import { MediaField, type UploadedAsset } from "@/app/admin/gallery/MediaField";
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
  useActionRunner,
  type Rights,
} from "@/app/admin/gallery/panel-kit";
import {
  deleteVideoAction,
  saveVideoAction,
  updateVideoAction,
} from "@/lib/modules/gallery/actions";
import { extractVideoId } from "@/lib/modules/gallery/video-id";
import type { GalleryVideoView, VideoProviderOption } from "@/lib/modules/gallery/read";

type Draft = {
  id: string | null;
  videoProviderCode: string;
  providerVideoId: string;
  thumbnailMediaId: string | null;
  publishedOn: string;
  isActive: boolean;
  sortOrder: string;
  title: DualLocaleValue;
  description: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  videoProviderCode: "",
  providerVideoId: "",
  thumbnailMediaId: null,
  publishedOn: "",
  isActive: true,
  sortOrder: "0",
  title: { bn: "", en: "" },
  description: { bn: "", en: "" },
};

export function VideosPanel({
  videos,
  providers,
  copy,
  rights,
}: {
  videos: readonly GalleryVideoView[];
  providers: readonly VideoProviderOption[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<GalleryVideoView | null>(null);

  const providerOptions = providers.map((entry) => ({ code: entry.code, label: entry.code }));

  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  function onPasteId(raw: string) {
    if (draft === null) return;
    setDraft({
      ...draft,
      providerVideoId: extractVideoId(draft.videoProviderCode, raw),
    });
  }

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const values = {
      videoProviderCode: draft.videoProviderCode,
      providerVideoId: draft.providerVideoId,
      thumbnailMediaId: draft.thumbnailMediaId,
      publishedOn: draft.publishedOn === "" ? null : draft.publishedOn,
      isActive: draft.isActive,
      sortOrder: integer(draft.sortOrder),
      translations: {
        bn: { title: draft.title.bn, description: draft.description.bn },
        ...(hasEnglish
          ? { en: { title: draft.title.en, description: draft.description.en } }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveVideoAction, { values })
        : await runner.run(updateVideoAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["videosHeading"] ?? ""}
      note={copy["videosNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={videos.length}>
        {videos.map((video) => (
          <ListRow
            key={video.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(video)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(video) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {video.title.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {video.videoProviderCode} · {video.providerVideoId}
              {video.isActive ? "" : " · —"}
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
            <SelectField
              id="video-provider"
              label={copy["provider"] ?? ""}
              value={draft.videoProviderCode}
              placeholder={copy["selectProvider"] ?? ""}
              options={providerOptions}
              onChange={(videoProviderCode) => setDraft({ ...draft, videoProviderCode })}
              error={issueFor(runner.issues, "values.videoProviderCode")}
            />
            <TextField
              id="video-url-or-id"
              label={copy["videoUrlOrId"] ?? ""}
              value={draft.providerVideoId}
              onChange={onPasteId}
              error={issueFor(runner.issues, "values.providerVideoId")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="videoTitle"
              label={copy["videoTitle"] ?? ""}
              value={draft.title}
              onChange={(title) => setDraft({ ...draft, title })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />

            <DualLocaleField
              name="videoDescription"
              label={copy["videoDescription"] ?? ""}
              kind="multiline"
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="video-published-on"
              label={copy["publishedOn"] ?? ""}
              type="date"
              value={draft.publishedOn}
              onChange={(publishedOn) => setDraft({ ...draft, publishedOn })}
              error={issueFor(runner.issues, "values.publishedOn")}
            />
            <TextField
              id="video-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="video-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <MediaField
              label={copy["thumbnail"] ?? ""}
              copy={copy}
              mediaId={draft.thumbnailMediaId}
              onUploaded={(asset: UploadedAsset) =>
                setDraft({ ...draft, thumbnailMediaId: asset.id })
              }
              onCleared={() => setDraft({ ...draft, thumbnailMediaId: null })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={
              (titleStatus?.canSave ?? false) &&
              draft.videoProviderCode !== "" &&
              draft.providerVideoId.trim() !== ""
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.title.bn]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteVideoAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(video: GalleryVideoView): Draft {
  return {
    id: video.id,
    videoProviderCode: video.videoProviderCode,
    providerVideoId: video.providerVideoId,
    thumbnailMediaId: video.thumbnailMediaId,
    publishedOn: video.publishedOn,
    isActive: video.isActive,
    sortOrder: String(video.sortOrder),
    title: video.title,
    description: video.description,
  };
}
