"use client";

/**
 * Photos (§B-12, `gallery_photos`).
 *
 * This panel carries the card's Contract on consent: **an active (published)
 * photo needs recorded subject consent.** `subjectConsentAt` is a date field —
 * "recorded on", the same wording `about`'s `CommitteePanel` and
 * `faculty/FacultyPanel` use — and Save is disabled with the reason stated next
 * to the field whenever Active is ticked and no date is set. The schema's own
 * `.refine()` and `ck_photo_subject_consent` are what actually decide; this is
 * the courtesy that keeps an admin from ever reaching the constraint.
 *
 * A photo always belongs to an album (`NOT NULL` in §B-12), so this panel
 * requires one to be selected before it will let anything be uploaded.
 */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/gallery/copy";
import { MediaField, type UploadedAsset } from "@/app/(admin)/admin/gallery/MediaField";
import {
  CheckboxField,
  EditorActions,
  ListRow,
  Panel,
  RowList,
  SelectField,
  TextField,
  anyRight,
  issueFor,
  useActionRunner,
  type Rights,
} from "@/app/(admin)/admin/gallery/panel-kit";
import {
  deletePhotoAction,
  savePhotoAction,
  updatePhotoAction,
} from "@/lib/modules/gallery/actions";
import type { GalleryAlbumView, GalleryPhotoView } from "@/lib/modules/gallery/read";

type Draft = {
  id: string | null;
  mediaId: string | null;
  captionBn: string;
  captionEn: string;
  subjectConsentAt: string;
  isActive: boolean;
  sortOrder: number;
};

export function PhotosPanel({
  photos,
  albums,
  copy,
  rights,
}: {
  photos: readonly GalleryPhotoView[];
  albums: readonly GalleryAlbumView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [albumId, setAlbumId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<GalleryPhotoView | null>(null);

  const albumOptions = albums.map((entry) => ({ code: entry.id, label: entry.title.bn }));
  const albumPhotos = photos.filter((photo) => photo.galleryAlbumId === albumId);

  const needsConsent =
    draft !== null && draft.isActive && draft.subjectConsentAt === "";
  const canSave = draft !== null && draft.mediaId !== null && !needsConsent;

  async function save() {
    if (draft === null || draft.mediaId === null || albumId === "") return;

    const hasEnglish = draft.captionEn.trim() !== "";

    const values = {
      galleryAlbumId: albumId,
      mediaId: draft.mediaId,
      subjectConsentAt:
        draft.subjectConsentAt === "" ? null : `${draft.subjectConsentAt}T00:00:00Z`,
      isActive: draft.isActive,
      sortOrder: draft.sortOrder,
      translations: {
        bn: { caption: draft.captionBn },
        ...(hasEnglish ? { en: { caption: draft.captionEn } } : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(savePhotoAction, { values })
        : await runner.run(updatePhotoAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["photosHeading"] ?? ""}
      note={copy["photosNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <SelectField
        id="photo-album"
        label={copy["selectAlbum"] ?? ""}
        value={albumId}
        placeholder={copy["selectAlbum"] ?? ""}
        options={albumOptions}
        onChange={(value) => {
          setAlbumId(value);
          setDraft(null);
        }}
      />

      {albumId === "" ? (
        <p className="mt-4 text-caption text-ink-muted">
          {copy["photosSaveAlbumFirst"] ?? ""}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <RowList empty={copy["empty"] ?? ""} count={albumPhotos.length}>
              {albumPhotos.map((photo) => (
                <ListRow
                  key={photo.id}
                  copy={copy}
                  onEdit={rights.edit ? () => setDraft(toDraft(photo)) : undefined}
                  onRemove={rights.delete ? () => setPendingRemoval(photo) : undefined}
                >
                  <span lang="bn">{photo.caption.bn || `#${photo.id}`}</span>
                  <span className="ms-3 text-caption text-ink-muted">
                    {photo.isActive ? "" : "—"}
                    {photo.subjectConsentAt === ""
                      ? ` · ${copy["photoConsentNeeded"] ?? ""}`
                      : ` · ${photo.subjectConsentAt}`}
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
                    mediaId: null,
                    captionBn: "",
                    captionEn: "",
                    subjectConsentAt: "",
                    isActive: false,
                    sortOrder: albumPhotos.length,
                  })
                }
              >
                {copy["add"] ?? ""}
              </button>
            )}
          </div>

          {draft !== null && (
            <div className="mt-6 border-t border-border pt-6">
              <MediaField
                label={copy["photosHeading"] ?? ""}
                copy={copy}
                mediaId={draft.mediaId}
                onUploaded={(asset: UploadedAsset) =>
                  setDraft({ ...draft, mediaId: asset.id })
                }
                onCleared={() => setDraft({ ...draft, mediaId: null })}
              />

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField
                  id="photo-caption-bn"
                  label={`${copy["photoCaption"] ?? ""} — ${copy["banglaLabel"] ?? ""}`}
                  lang="bn"
                  value={draft.captionBn}
                  onChange={(captionBn) => setDraft({ ...draft, captionBn })}
                  error={issueFor(runner.issues, "values.translations.bn.caption")}
                />
                <TextField
                  id="photo-caption-en"
                  label={`${copy["photoCaption"] ?? ""} — ${copy["englishLabel"] ?? ""}`}
                  lang="en"
                  value={draft.captionEn}
                  onChange={(captionEn) => setDraft({ ...draft, captionEn })}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField
                  id="photo-consent"
                  label={copy["photoConsentAt"] ?? ""}
                  type="date"
                  value={draft.subjectConsentAt}
                  onChange={(subjectConsentAt) => setDraft({ ...draft, subjectConsentAt })}
                  error={
                    issueFor(runner.issues, "values.subjectConsentAt") ??
                    (needsConsent ? copy["photoConsentNeeded"] : undefined)
                  }
                />
                <CheckboxField
                  id="photo-active"
                  label={copy["active"] ?? ""}
                  checked={draft.isActive}
                  onChange={(isActive) => setDraft({ ...draft, isActive })}
                  hint={needsConsent ? copy["photoConsentNeeded"] : undefined}
                />
              </div>

              <EditorActions
                saveLabel={copy["save"] ?? ""}
                savingLabel={copy["saving"] ?? ""}
                cancelLabel={copy["cancel"] ?? ""}
                busy={runner.busy}
                canSave={canSave}
                onSave={save}
                onCancel={() => {
                  setDraft(null);
                  runner.clearIssues();
                }}
              />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.caption.bn || `#${pendingRemoval.id}`]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deletePhotoAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(photo: GalleryPhotoView): Draft {
  return {
    id: photo.id,
    mediaId: photo.mediaId,
    captionBn: photo.caption.bn,
    captionEn: photo.caption.en,
    subjectConsentAt: photo.subjectConsentAt,
    isActive: photo.isActive,
    sortOrder: photo.sortOrder,
  };
}
