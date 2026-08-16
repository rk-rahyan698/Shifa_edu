"use client";

/**
 * Hero slides — upload, reorder, schedule, activate (§B-10).
 *
 * Reordering is a **separate save**, not part of the edit form. Dragging a
 * slide up changes every row's `sort_order`, so it is one intention over the
 * whole list rather than a field on one row; giving it its own button also
 * means an admin can reshuffle the carousel without opening — and risking a
 * stray change to — any slide's content.
 *
 * The order is held locally while it is being arranged and posted whole. Until
 * "Save order" is pressed nothing has moved on the site, which is what makes
 * the arrangement safe to experiment with. `SortableList` (T-051) owns the
 * shuffle and its keyboard controls, so this file never computes a position.
 *
 * The alt-text Contract is surfaced three times over: the upload control will
 * not offer a file without Bangla alt text, a slide whose stored image lacks it
 * is flagged in the list and cannot be saved, and the write pipeline refuses it
 * regardless. Only the last of those is enforcement.
 */

import { useEffect, useState } from "react";

import {
  DualLocaleField,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { SortableList } from "@/components/admin/SortableList";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MediaField } from "@/app/admin/home/MediaField";
import type { Copy } from "@/app/admin/home/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/admin/home/panel-kit";
import {
  deleteHeroSlideAction,
  reorderHeroSlidesAction,
  saveHeroSlideAction,
} from "@/lib/modules/home/actions";
import type { HeroSlideView } from "@/lib/modules/home/read";

type Draft = {
  id: string | null;
  mediaId: string | null;
  /** Whether the referenced asset already carries Bangla alt text. */
  mediaAltPresent: boolean;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder: string;
  title: DualLocaleValue;
  subtitle: DualLocaleValue;
  ctaLabel: DualLocaleValue;
  ctaUrl: DualLocaleValue;
};

const EMPTY: DualLocaleValue = { bn: "", en: "" };

const BLANK: Draft = {
  id: null,
  mediaId: null,
  mediaAltPresent: false,
  startsAt: "",
  endsAt: "",
  isActive: true,
  sortOrder: "0",
  title: EMPTY,
  subtitle: EMPTY,
  ctaLabel: EMPTY,
  ctaUrl: EMPTY,
};

export function HeroSlidesPanel({
  slides,
  copy,
  editable,
}: {
  slides: readonly HeroSlideView[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [order, setOrder] = useState<readonly HeroSlideView[]>(slides);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<HeroSlideView | null>(null);

  // The server re-renders after every write; the locally arranged order is
  // replaced rather than merged, because the rows themselves may have changed.
  useEffect(() => setOrder(slides), [slides]);

  const orderChanged =
    order.length !== slides.length ||
    order.some((slide, index) => slide.id !== slides[index]?.id);

  const altMissing = draft !== null && draft.mediaId !== null && !draft.mediaAltPresent;
  const canSave = draft !== null && draft.mediaId !== null && !altMissing;

  async function save() {
    if (draft === null || draft.mediaId === null) return;

    const saved = await runner.run(saveHeroSlideAction, {
      id: draft.id,
      values: {
        mediaId: draft.mediaId,
        startsAt: timestamp(draft.startsAt),
        endsAt: timestamp(draft.endsAt),
        isActive: draft.isActive,
        sortOrder: integer(draft.sortOrder),
        translations: {
          bn: {
            title: draft.title.bn,
            subtitle: draft.subtitle.bn,
            ctaLabel: draft.ctaLabel.bn,
            ctaUrl: draft.ctaUrl.bn,
          },
          en: {
            title: draft.title.en,
            subtitle: draft.subtitle.en,
            ctaLabel: draft.ctaLabel.en,
            ctaUrl: draft.ctaUrl.en,
          },
        },
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["slidesHeading"] ?? ""}
      note={copy["slidesNote"]}
      lockedNote={copy["slidesLocked"]}
      editable={editable}
    >
      {order.length === 0 ? (
        <p className="text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        <SortableList
          items={order}
          idOf={(slide) => slide.id}
          labelOf={(slide) => slide.title.bn || `#${slide.id}`}
          labels={{
            moveUp: copy["moveUp"] ?? "",
            moveDown: copy["moveDown"] ?? "",
            moved: copy["moved"] ?? "",
          }}
          onReorder={(next) => setOrder(next)}
          render={(slide) => (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span lang="bn" className="font-semibold">
                  {slide.title.bn || `#${slide.id}`}
                </span>
                <span className="ms-3 text-caption text-ink-muted">
                  {slide.isActive ? "✓" : "—"}
                  {slide.mediaAltBn === "" && ` · ${copy["slideAltMissing"] ?? ""}`}
                </span>
              </span>

              {editable && (
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setDraft(toDraft(slide))}
                  >
                    {copy["edit"] ?? ""}
                  </button>
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setPendingRemoval(slide)}
                  >
                    {copy["remove"] ?? ""}
                  </button>
                </span>
              )}
            </div>
          )}
        />
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap gap-3">
          {draft === null && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDraft(BLANK)}
            >
              {copy["add"] ?? ""}
            </button>
          )}

          {orderChanged && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={runner.busy}
              aria-disabled={runner.busy}
              onClick={() =>
                runner.run(
                  reorderHeroSlidesAction,
                  { ids: order.map((slide) => slide.id) },
                  "saved",
                )
              }
            >
              {copy["reorder"] ?? ""}
            </button>
          )}
        </div>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <MediaField
            label={copy["slideImage"] ?? ""}
            copy={copy}
            mediaId={draft.mediaId}
            onUploaded={(asset) =>
              // `MediaField` will not upload without Bangla alt text, so a
              // fresh asset satisfies the Contract by construction.
              setDraft({ ...draft, mediaId: asset.id, mediaAltPresent: true })
            }
            onCleared={() =>
              setDraft({ ...draft, mediaId: null, mediaAltPresent: false })
            }
          />

          {draft.mediaId === null && (
            <p className="field-error">{copy["slideNeedsImage"] ?? ""}</p>
          )}
          {altMissing && <p className="field-error">{copy["slideAltMissing"] ?? ""}</p>}
          {issueFor(runner.issues, "values.mediaId") !== undefined && (
            <p className="field-error">{issueFor(runner.issues, "values.mediaId")}</p>
          )}

          <div className="mt-6">
            {(
              [
                ["title", "slideTitle"],
                ["subtitle", "slideSubtitle"],
                ["ctaLabel", "slideCtaLabel"],
                ["ctaUrl", "slideCtaUrl"],
              ] as const
            ).map(([key, labelKey]) => (
              <DualLocaleField
                key={key}
                name={key}
                label={copy[labelKey] ?? ""}
                value={draft[key]}
                onChange={(next) => setDraft({ ...draft, [key]: next })}
                requiredMessage={copy["requiredMessage"] ?? ""}
                englishMissingLabel={copy["englishMissing"] ?? ""}
                banglaLabel={copy["banglaLabel"] ?? ""}
                englishLabel={copy["englishLabel"] ?? ""}
                // Every word on a slide is optional in §B-10: a photograph with
                // no caption is a legitimate slide.
                requiredLabel={copy["optionalLabel"] ?? ""}
                optionalLabel={copy["optionalLabel"] ?? ""}
              />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              id="slide-starts-at"
              label={copy["slideStartsAt"] ?? ""}
              type="datetime-local"
              value={draft.startsAt}
              onChange={(startsAt) => setDraft({ ...draft, startsAt })}
              hint={copy["slideScheduleHint"]}
              error={issueFor(runner.issues, "values.startsAt")}
            />
            <TextField
              id="slide-ends-at"
              label={copy["slideEndsAt"] ?? ""}
              type="datetime-local"
              value={draft.endsAt}
              onChange={(endsAt) => setDraft({ ...draft, endsAt })}
              error={issueFor(runner.issues, "values.endsAt")}
            />
            <TextField
              id="slide-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="slide-active"
              label={copy["slideActive"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
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

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={
          pendingRemoval === null
            ? undefined
            : [pendingRemoval.title.bn || `#${pendingRemoval.id}`]
        }
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteHeroSlideAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(slide: HeroSlideView): Draft {
  return {
    id: slide.id,
    mediaId: slide.mediaId,
    mediaAltPresent: slide.mediaAltBn !== "",
    startsAt: slide.startsAt,
    endsAt: slide.endsAt,
    isActive: slide.isActive,
    sortOrder: String(slide.sortOrder),
    title: slide.title,
    subtitle: slide.subtitle,
    ctaLabel: slide.ctaLabel,
    ctaUrl: slide.ctaUrl,
  };
}

/**
 * A `datetime-local` value as an ISO-8601 instant.
 *
 * The `Z` is appended rather than inferred: the field is labelled UTC (see the
 * read model), and letting the browser's zone decide would store a different
 * moment depending on where the admin happened to be sitting.
 */
function timestamp(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // `datetime-local` yields `YYYY-MM-DDTHH:mm`, and `YYYY-MM-DDTHH:mm:ss` when
  // the browser exposes seconds. Zod's `.datetime({ offset: true })` wants both
  // the seconds and a zone.
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  return `${withSeconds}Z`;
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
