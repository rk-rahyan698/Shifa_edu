"use server";

/**
 * `notices` Server Actions (T-066) — ARCHITECTURE.md §B-11.
 *
 * **`notice:publish` is checked independently, structurally.** `noticeSchema`
 * (T-034) does not declare `statusCode` at all — see that file's header — so
 * `addNotice`/`editNotice`, bound to `notice:add`/`notice:edit`, cannot move a
 * notice's status even if a caller tries to smuggle the field in: T-034's
 * `.strict()` refuses the unknown key with a 422 before the handler ever runs.
 * `publishNoticeAction` is the only path that writes `status_code`, and it is
 * the only action bound to `notice:publish`. An admin holding add + edit but
 * not publish can therefore save an unlimited number of drafts and move
 * exactly none of them onto the site — which is this card's Verify.
 *
 * **A duplicate slug is a 422, not a 500.** `notice_translations` has
 * `UNIQUE (locale_code, slug)`; two notices sharing a Bangla slug is a mistake
 * an admin can fix on the spot, not a server error. `withUniqueSlug` turns
 * Postgres's `P2002` into a `ValidationFailedError` naming the field, the same
 * move `academics`' `refuseOnDependants` makes for `P2003`.
 *
 * **Attachments are child rows with their own two actions**, both gated by
 * `notice:edit` — §B-11's Contract is specifically about *publishing*, not
 * about who may attach a file, so `notice_attachments` rides on the same
 * permission as the rest of the editorial content.
 */

import { Prisma } from "@prisma/client";

import { LOCALES, type Locale } from "@/lib/locale";
import {
  noticeAttachmentDeleteSchema,
  noticeAttachmentSave,
  noticeSave,
} from "@/lib/modules/notices/schema";
import { runAction, type ActionResult } from "@/lib/modules/notices/result";
import { buildDiff, defineMutation, ValidationFailedError } from "@/lib/mutate";
import { noticeDeleteSchema, noticePublishSchema } from "@/lib/validation/notice";

// ─────────────────────────────────────────────────────────────────────────────
// The notice — add, edit, delete
// ─────────────────────────────────────────────────────────────────────────────

const addNotice = defineMutation({
  module: "notice",
  action: "add",
  schema: noticeSave.add,
  entityTable: "notices",
  entityLabel: "notice",
  handler: async ({ tx, input, user }) => {
    const { values } = input;

    const row = await tx.notice.create({
      data: {
        noticeCategoryId: values.noticeCategoryId,
        isPinned: values.isPinned,
        authorUserId: user.id,
      },
    });

    await writeTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
    };
  },
});

export async function saveNoticeAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => addNotice(input));
}

const editNotice = defineMutation({
  module: "notice",
  action: "edit",
  schema: noticeSave.edit,
  entityTable: "notices",
  entityLabel: "notice",
  handler: async ({ tx, input }) => {
    const { id, values } = input;

    const before = await tx.notice.findUnique({ where: { id } });

    const row = await tx.notice.update({
      where: { id },
      data: {
        noticeCategoryId: values.noticeCategoryId,
        isPinned: values.isPinned,
      },
    });

    await writeTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: values.translations.bn.title,
      diff: buildDiff(comparableNotice(before), comparableNotice(row)),
    };
  },
});

export async function updateNoticeAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => editNotice(input));
}

const removeNotice = defineMutation({
  module: "notice",
  action: "delete",
  schema: noticeDeleteSchema,
  entityTable: "notices",
  entityLabel: "notice",
  handler: async ({ tx, input, user }) => {
    const row = await tx.notice.update({
      where: { id: input.id },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return { data: null, entityId: row.id, entityName: `#${row.id}` };
  },
});

export async function deleteNoticeAction(input: unknown): Promise<ActionResult<null>> {
  return runAction(() => removeNotice(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish — the module's own, independently-gated action
// ─────────────────────────────────────────────────────────────────────────────

const publishNotice = defineMutation({
  module: "notice",
  action: "publish",
  schema: noticePublishSchema,
  entityTable: "notices",
  entityLabel: "notice",
  handler: async ({ tx, input, user }) => {
    const before = await tx.notice.findUnique({ where: { id: input.id } });

    const row = await tx.notice.update({
      where: { id: input.id },
      data: {
        statusCode: input.statusCode,
        publishedAt: input.publishedAt,
        publishedByUserId: input.statusCode === "published" ? user.id : undefined,
      },
    });

    return {
      data: String(row.id),
      entityId: row.id,
      entityName: `#${row.id}`,
      auditAction: input.statusCode === "published" ? "publish" : "update",
      diff: buildDiff(
        before === null ? null : { statusCode: before.statusCode },
        { statusCode: row.statusCode },
      ),
    };
  },
});

export async function publishNoticeAction(input: unknown): Promise<ActionResult<string>> {
  return runAction(() => publishNotice(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────────────────────────────────────

const addAttachment = defineMutation({
  module: "notice",
  action: "edit",
  schema: noticeAttachmentSave,
  entityTable: "notice_attachments",
  entityLabel: "notice attachment",
  handler: async ({ tx, input }) => {
    const { values } = input;

    const row = await tx.noticeAttachment.create({
      data: {
        noticeId: values.noticeId,
        mediaId: values.mediaId,
        sortOrder: values.sortOrder,
      },
    });

    await writeAttachmentTranslations(row.id, values.translations, tx);

    return {
      data: String(row.id),
      entityId: values.noticeId,
      entityName: values.translations.bn.label,
    };
  },
});

export async function addNoticeAttachmentAction(
  input: unknown,
): Promise<ActionResult<string>> {
  return runAction(() => addAttachment(input));
}

const removeAttachment = defineMutation({
  module: "notice",
  action: "edit",
  schema: noticeAttachmentDeleteSchema,
  entityTable: "notice_attachments",
  entityLabel: "notice attachment",
  handler: async ({ tx, input }) => {
    const row = await tx.noticeAttachment.delete({ where: { id: input.id } });
    return { data: null, entityId: row.noticeId, entityName: `#${row.id}` };
  },
});

export async function removeNoticeAttachmentAction(
  input: unknown,
): Promise<ActionResult<null>> {
  return runAction(() => removeAttachment(input));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler helpers
// ─────────────────────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

async function writeTranslations(
  noticeId: bigint,
  translations: {
    bn: { slug: string; title: string; excerpt: string | null; bodyHtml: string };
    en?: { slug: string; title: string; excerpt: string | null; bodyHtml: string };
  },
  tx: Tx,
): Promise<void> {
  for (const locale of LOCALES) {
    const entry = translations[locale];
    if (entry === undefined) continue;

    await withUniqueSlug(locale, entry.slug, async () => {
      await tx.noticeTranslation.upsert({
        where: { noticeId_localeCode: { noticeId, localeCode: locale } },
        create: { noticeId, localeCode: locale, ...entry },
        update: entry,
      });
    });
  }
}

async function writeAttachmentTranslations(
  attachmentId: bigint,
  translations: { bn: { label: string }; en?: { label: string } },
  tx: Tx,
): Promise<void> {
  for (const locale of LOCALES) {
    const entry = translations[locale];
    if (entry === undefined) continue;

    await tx.noticeAttachmentTranslation.upsert({
      where: {
        noticeAttachmentId_localeCode: { noticeAttachmentId: attachmentId, localeCode: locale },
      },
      create: { noticeAttachmentId: attachmentId, localeCode: locale, ...entry },
      update: entry,
    });
  }
}

/** Turns `notice_translations`' `UNIQUE (locale_code, slug)` into a readable 422. */
async function withUniqueSlug<T>(
  locale: Locale,
  slug: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      throw new ValidationFailedError([
        {
          field: `values.translations.${locale}.slug`,
          message: `The slug "${slug}" is already used by another notice in this language`,
        },
      ]);
    }
    throw cause;
  }
}

function comparableNotice(
  row: { noticeCategoryId: bigint; isPinned: boolean } | null,
): Record<string, unknown> | null {
  if (row === null) return null;

  return {
    noticeCategoryId: String(row.noticeCategoryId),
    isPinned: row.isPinned,
  };
}
