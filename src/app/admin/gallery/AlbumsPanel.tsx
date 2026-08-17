"use client";

/**
 * Albums (§B-12, `gallery_albums`). Category, cover image and event date, plus
 * the dual-locale title and description.
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
  deleteAlbumAction,
  saveAlbumAction,
  updateAlbumAction,
} from "@/lib/modules/gallery/actions";
import type { GalleryAlbumView, GalleryCategoryOption } from "@/lib/modules/gallery/read";

type Draft = {
  id: string | null;
  galleryCategoryId: string;
  coverMediaId: string | null;
  eventDate: string;
  isActive: boolean;
  sortOrder: string;
  title: DualLocaleValue;
  description: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  galleryCategoryId: "",
  coverMediaId: null,
  eventDate: "",
  isActive: true,
  sortOrder: "0",
  title: { bn: "", en: "" },
  description: { bn: "", en: "" },
};

export function AlbumsPanel({
  albums,
  categories,
  copy,
  rights,
}: {
  albums: readonly GalleryAlbumView[];
  categories: readonly GalleryCategoryOption[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<GalleryAlbumView | null>(null);

  const categoryOptions = categories.map((entry) => ({
    code: entry.id,
    label: entry.name.bn,
  }));

  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const values = {
      galleryCategoryId: draft.galleryCategoryId,
      coverMediaId: draft.coverMediaId,
      eventDate: draft.eventDate === "" ? null : draft.eventDate,
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
        ? await runner.run(saveAlbumAction, { values })
        : await runner.run(updateAlbumAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["albumsHeading"] ?? ""}
      note={copy["albumsNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={albums.length}>
        {albums.map((album) => (
          <ListRow
            key={album.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(album)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(album) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {album.title.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {categoryOptions.find((entry) => entry.code === album.galleryCategoryId)
                ?.label ?? ""}
              {` · ${album.photoCount} ${copy["photoCount"] ?? ""}`}
              {album.isActive ? "" : " · —"}
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
            name="albumTitle"
            label={copy["albumTitle"] ?? ""}
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
            name="albumDescription"
            label={copy["albumDescription"] ?? ""}
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

          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              id="album-category"
              label={copy["category"] ?? ""}
              value={draft.galleryCategoryId}
              placeholder={copy["selectCategory"] ?? ""}
              options={categoryOptions}
              onChange={(galleryCategoryId) => setDraft({ ...draft, galleryCategoryId })}
              error={issueFor(runner.issues, "values.galleryCategoryId")}
            />
            <TextField
              id="album-event-date"
              label={copy["eventDate"] ?? ""}
              type="date"
              value={draft.eventDate}
              onChange={(eventDate) => setDraft({ ...draft, eventDate })}
              error={issueFor(runner.issues, "values.eventDate")}
            />
            <TextField
              id="album-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="album-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <MediaField
              label={copy["coverImage"] ?? ""}
              copy={copy}
              mediaId={draft.coverMediaId}
              onUploaded={(asset: UploadedAsset) =>
                setDraft({ ...draft, coverMediaId: asset.id })
              }
              onCleared={() => setDraft({ ...draft, coverMediaId: null })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={(titleStatus?.canSave ?? false) && draft.galleryCategoryId !== ""}
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
          await runner.run(deleteAlbumAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(album: GalleryAlbumView): Draft {
  return {
    id: album.id,
    galleryCategoryId: album.galleryCategoryId,
    coverMediaId: album.coverMediaId,
    eventDate: album.eventDate,
    isActive: album.isActive,
    sortOrder: String(album.sortOrder),
    title: album.title,
    description: album.description,
  };
}
