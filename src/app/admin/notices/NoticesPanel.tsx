"use client";

/**
 * Notices (§B-11, `notices` + `notice_translations` + `notice_attachments`).
 *
 * This panel carries the card's Contract: **`notice:publish` is a separate
 * action from `notice:edit`.** The ordinary Save button — labelled "Save
 * draft" rather than "Save", deliberately — only ever calls
 * `saveNoticeAction`/`updateNoticeAction`, neither of which can move
 * `status_code` (see `src/lib/modules/notices/actions.ts`'s header). Publishing
 * is a second control, rendered only once the notice exists and only enabled
 * when `rights.publish` is true; an admin who lacks it sees `publishLocked`
 * instead, never a disabled button with no explanation.
 *
 * The slug auto-generates from the title as the admin types, and stops the
 * moment they touch the slug field directly — `slugTouched` is per locale, so
 * editing the Bangla slug does not freeze the English one.
 *
 * Attachments and publishing are both only offered once `draft.id` is set:
 * both are child operations against a notice row that has to exist first.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AttachmentField, type UploadedAsset } from "@/app/admin/notices/AttachmentField";
import type { Copy } from "@/app/admin/notices/copy";
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
  slugify,
  useActionRunner,
  type Rights,
} from "@/app/admin/notices/panel-kit";
import {
  addNoticeAttachmentAction,
  deleteNoticeAction,
  publishNoticeAction,
  removeNoticeAttachmentAction,
  saveNoticeAction,
  updateNoticeAction,
} from "@/lib/modules/notices/actions";
import type { NoticeCategoryOption, NoticeView } from "@/lib/modules/notices/read";

type Draft = {
  id: string | null;
  noticeCategoryId: string;
  isPinned: boolean;
  title: DualLocaleValue;
  excerpt: DualLocaleValue;
  body: DualLocaleValue;
  slug: DualLocaleValue;
  slugTouched: { bn: boolean; en: boolean };
  statusCode: string;
  publishedAt: string;
};

const BLANK: Draft = {
  id: null,
  noticeCategoryId: "",
  isPinned: false,
  title: { bn: "", en: "" },
  excerpt: { bn: "", en: "" },
  body: { bn: "", en: "" },
  slug: { bn: "", en: "" },
  slugTouched: { bn: false, en: false },
  statusCode: "draft",
  publishedAt: "",
};

export function NoticesPanel({
  notices,
  categories,
  copy,
  rights,
}: {
  notices: readonly NoticeView[];
  categories: readonly NoticeCategoryOption[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publishAt, setPublishAt] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState<NoticeView | null>(null);

  const categoryOptions = categories.map((entry) => ({
    code: entry.id,
    label: entry.name.bn,
  }));
  const statusLabel = (code: string) =>
    ({ draft: copy["statusDraft"], published: copy["statusPublished"], archived: copy["statusArchived"] })[
      code
    ] ?? code;

  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);
  const bodyStatus = draft === null ? null : dualLocaleStatus(draft.body, "richtext");

  const editingNotice = draft?.id === null ? null : notices.find((n) => n.id === draft?.id);
  const richTextLabels = {
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

  function onTitleChange(next: DualLocaleValue) {
    if (draft === null) return;
    const slug = { ...draft.slug };
    (["bn", "en"] as const).forEach((locale) => {
      if (next[locale] !== draft.title[locale] && !draft.slugTouched[locale]) {
        slug[locale] = slugify(next[locale]);
      }
    });
    setDraft({ ...draft, title: next, slug });
  }

  function regenerateSlug() {
    if (draft === null) return;
    setDraft({
      ...draft,
      slug: { bn: slugify(draft.title.bn), en: slugify(draft.title.en) },
      slugTouched: { bn: false, en: false },
    });
  }

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "" && draft.slug.en.trim() !== "";

    const values = {
      noticeCategoryId: draft.noticeCategoryId,
      isPinned: draft.isPinned,
      translations: {
        bn: {
          slug: draft.slug.bn,
          title: draft.title.bn,
          excerpt: draft.excerpt.bn,
          bodyHtml: draft.body.bn,
        },
        ...(hasEnglish
          ? {
              en: {
                slug: draft.slug.en,
                title: draft.title.en,
                excerpt: draft.excerpt.en,
                bodyHtml: draft.body.en,
              },
            }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveNoticeAction, { values })
        : await runner.run(updateNoticeAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  async function publish(statusCode: "published" | "draft") {
    if (draft === null || draft.id === null) return;

    // Publishing without a chosen date publishes now — see this module's
    // `schema.ts` header for why that decision lives here.
    const publishedAt =
      statusCode === "published"
        ? (publishAt === "" ? new Date().toISOString() : `${publishAt}:00Z`)
        : (editingNotice?.publishedAt === "" || editingNotice?.publishedAt === undefined
            ? null
            : `${editingNotice.publishedAt}:00Z`);

    const saved = await runner.run(publishNoticeAction, {
      id: draft.id,
      statusCode,
      publishedAt,
    });

    if (saved) setDraft(null);
  }

  async function addAttachment(asset: UploadedAsset, labelBn: string, labelEn: string) {
    if (draft === null || draft.id === null) return;

    await runner.run(addNoticeAttachmentAction, {
      values: {
        noticeId: draft.id,
        mediaId: asset.id,
        sortOrder: editingNotice?.attachments.length ?? 0,
        translations: {
          bn: { label: labelBn },
          ...(labelEn !== "" ? { en: { label: labelEn } } : {}),
        },
      },
    });
  }

  return (
    <Panel
      heading={copy["heading"] ?? ""}
      note={copy["intro"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={notices.length}>
        {notices.map((notice) => (
          <ListRow
            key={notice.id}
            copy={copy}
            onEdit={
              rights.edit || rights.publish
                ? () => {
                    setDraft(toDraft(notice));
                    setPublishAt(notice.publishedAt);
                  }
                : undefined
            }
            onRemove={rights.delete ? () => setPendingRemoval(notice) : undefined}
          >
            {notice.isPinned && <span className="me-1">📌</span>}
            <span lang="bn" className="font-semibold">
              {notice.title.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {statusLabel(notice.statusCode)}
              {notice.attachments.length > 0 ? ` · ${notice.attachments.length}` : ""}
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
            name="noticeTitle"
            label={copy["title"] ?? ""}
            value={draft.title}
            onChange={onTitleChange}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="notice-slug-bn"
              label={`${copy["slug"] ?? ""} — ${copy["banglaLabel"] ?? ""}`}
              value={draft.slug.bn}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  slug: { ...draft.slug, bn: value },
                  slugTouched: { ...draft.slugTouched, bn: true },
                })
              }
              hint={copy["slugAuto"]}
              error={issueFor(runner.issues, "values.translations.bn.slug")}
            />
            <TextField
              id="notice-slug-en"
              label={`${copy["slug"] ?? ""} — ${copy["englishLabel"] ?? ""}`}
              value={draft.slug.en}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  slug: { ...draft.slug, en: value },
                  slugTouched: { ...draft.slugTouched, en: true },
                })
              }
              hint={copy["slugAuto"]}
              error={issueFor(runner.issues, "values.translations.en.slug")}
            />
          </div>
          <button type="button" className="link mb-4 text-caption" onClick={regenerateSlug}>
            {copy["slugRegenerate"] ?? ""}
          </button>

          <DualLocaleField
            name="noticeExcerpt"
            label={copy["excerpt"] ?? ""}
            kind="multiline"
            value={draft.excerpt}
            onChange={(excerpt) => setDraft({ ...draft, excerpt })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["optionalLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <fieldset className="mb-4 mt-6 border-0 p-0">
            <legend className="label mb-3 flex items-center gap-2 p-0">
              <span>{copy["body"] ?? ""}</span>
              <span className="text-caption font-normal text-danger">
                {copy["requiredLabel"] ?? ""}
              </span>
              {(bodyStatus?.englishMissing ?? false) && (
                <span className="rounded-btn bg-accent-tint px-2 py-0.5 text-caption font-semibold text-ink">
                  {copy["englishMissing"] ?? ""}
                </span>
              )}
            </legend>

            <div className="grid gap-4 lg:grid-cols-2">
              <RichTextEditor
                label={copy["banglaLabel"] ?? ""}
                lang="bn"
                value={draft.body.bn}
                onChange={(bn) => setDraft({ ...draft, body: { ...draft.body, bn } })}
                labels={richTextLabels}
                invalid={
                  issueFor(runner.issues, "values.translations.bn.bodyHtml") !== undefined
                }
              />
              <RichTextEditor
                label={copy["englishLabel"] ?? ""}
                lang="en"
                value={draft.body.en}
                onChange={(en) => setDraft({ ...draft, body: { ...draft.body, en } })}
                labels={richTextLabels}
              />
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              id="notice-category"
              label={copy["category"] ?? ""}
              value={draft.noticeCategoryId}
              placeholder={copy["selectCategory"] ?? ""}
              options={categoryOptions}
              onChange={(noticeCategoryId) => setDraft({ ...draft, noticeCategoryId })}
              error={issueFor(runner.issues, "values.noticeCategoryId")}
            />
            <CheckboxField
              id="notice-pinned"
              label={copy["pinned"] ?? ""}
              checked={draft.isPinned}
              onChange={(isPinned) => setDraft({ ...draft, isPinned })}
            />
          </div>

          <p className="callout mt-4" role="status">
            {copy["publishHint"] ?? ""}
          </p>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={
              (titleStatus?.canSave ?? false) &&
              (bodyStatus?.canSave ?? false) &&
              draft.noticeCategoryId !== ""
            }
            onSave={save}
            onCancel={() => {
              setDraft(null);
              runner.clearIssues();
            }}
          />

          {draft.id !== null && (
            <div className="mt-6 border-t border-border pt-6">
              <p className="label mb-2">
                {copy["status"] ?? ""}: {statusLabel(editingNotice?.statusCode ?? "draft")}
              </p>

              {rights.publish ? (
                <>
                  <div className="max-w-xs">
                    <TextField
                      id="notice-publish-at"
                      label={copy["publishedAt"] ?? ""}
                      type="datetime-local"
                      value={publishAt}
                      onChange={setPublishAt}
                      hint={copy["publishSchedule"]}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={runner.busy}
                      onClick={() => publish("published")}
                    >
                      {copy["publishNow"] ?? ""}
                    </button>
                    {editingNotice?.statusCode === "published" && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={runner.busy}
                        onClick={() => publish("draft")}
                      >
                        {copy["unpublish"] ?? ""}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="callout" role="status">
                  {copy["publishLocked"] ?? ""}
                </p>
              )}
            </div>
          )}

          {draft.id !== null ? (
            <div className="mt-6 border-t border-border pt-6">
              <p className="label mb-2">{copy["attachmentsHeading"] ?? ""}</p>
              <p className="mb-3 text-caption text-ink-muted">
                {copy["attachmentsNote"] ?? ""}
              </p>

              <RowList empty={copy["empty"] ?? ""} count={editingNotice?.attachments.length ?? 0}>
                {(editingNotice?.attachments ?? []).map((attachment) => (
                  <ListRow
                    key={attachment.id}
                    copy={copy}
                    onRemove={
                      rights.edit
                        ? () =>
                            runner.run(
                              removeNoticeAttachmentAction,
                              { id: attachment.id },
                              "deleted",
                            )
                        : undefined
                    }
                  >
                    {attachment.label.bn || attachment.label.en || `#${attachment.id}`}
                  </ListRow>
                ))}
              </RowList>

              {rights.edit && (
                <div className="mt-3">
                  <AttachmentField copy={copy} onUploaded={addAttachment} />
                </div>
              )}
            </div>
          ) : (
            <p className="callout mt-6" role="status">
              {copy["attachmentsSaveFirst"] ?? ""}
            </p>
          )}
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
          await runner.run(deleteNoticeAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(notice: NoticeView): Draft {
  return {
    id: notice.id,
    noticeCategoryId: notice.noticeCategoryId,
    isPinned: notice.isPinned,
    title: notice.title,
    excerpt: notice.excerpt,
    body: notice.bodyHtml,
    slug: notice.slug,
    // An existing slug is treated as deliberate — editing the title on an
    // established notice must not silently rewrite its URL.
    slugTouched: { bn: true, en: true },
    statusCode: notice.statusCode,
    publishedAt: notice.publishedAt,
  };
}
