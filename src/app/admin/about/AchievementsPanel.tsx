"use client";

/**
 * Achievements (§B-10, `achievements`).
 *
 * §A-3.1 applies here with force: an achievement is a claim about the school,
 * and a plausible-sounding placeholder is worse than an empty list because
 * nobody can tell it from a fact. The panel offers no examples and no defaults;
 * where the school has not supplied the text, the literal
 * `[[CONTENT REQUIRED — DO NOT PUBLISH]]` marker is what belongs in the field,
 * and T-113's gate is what stops it reaching production.
 *
 * `achievements.media_id` exists in §B-10 and is not offered here. T-034's
 * `achievementSchema` declares it, but an image on an achievement would need
 * the same Bangla alt-text enforcement T-061 built for `home`, and that check
 * lives in the `home` module — reaching into it from here, or writing a second
 * copy, are both worse than leaving one optional column to a later card. See
 * SESSION-LOG.md.
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
  deleteAchievementAction,
  saveAchievementAction,
} from "@/lib/modules/about/actions";
import type { AchievementView } from "@/lib/modules/about/read";

type Draft = {
  id: string | null;
  achievedYear: string;
  icon: string;
  isActive: boolean;
  sortOrder: string;
  title: DualLocaleValue;
  description: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  achievedYear: "",
  icon: "",
  isActive: true,
  sortOrder: "0",
  title: { bn: "", en: "" },
  description: { bn: "", en: "" },
};

export function AchievementsPanel({
  achievements,
  copy,
  editable,
}: {
  achievements: readonly AchievementView[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AchievementView | null>(null);

  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const saved = await runner.run(saveAchievementAction, {
      id: draft.id,
      values: {
        achievedYear: draft.achievedYear === "" ? null : numeric(draft.achievedYear),
        mediaId: null,
        icon: draft.icon,
        isActive: draft.isActive,
        sortOrder: integer(draft.sortOrder),
        translations: {
          bn: { title: draft.title.bn, description: draft.description.bn },
          ...(hasEnglish
            ? { en: { title: draft.title.en, description: draft.description.en } }
            : {}),
        },
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["achievementsHeading"] ?? ""}
      note={copy["achievementsNote"]}
      lockedNote={copy["contentLocked"]}
      editable={editable}
    >
      {achievements.length === 0 ? (
        <p className="text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {achievements.map((achievement) => (
            <li
              key={achievement.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2"
            >
              <span>
                <span lang="bn" className="font-semibold">
                  {achievement.title.bn}
                </span>
                <span className="ms-3 text-caption text-ink-muted">
                  {achievement.achievedYear}
                  {achievement.isActive ? " · ✓" : " · —"}
                </span>
              </span>

              {editable && (
                <span className="flex gap-3">
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setDraft(toDraft(achievement))}
                  >
                    {copy["edit"] ?? ""}
                  </button>
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setPendingRemoval(achievement)}
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
            name="achievementTitle"
            label={copy["achievementTitle"] ?? ""}
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
            name="achievementDescription"
            label={copy["achievementDescription"] ?? ""}
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
            <TextField
              id="achievement-year"
              label={copy["achievementYear"] ?? ""}
              value={draft.achievedYear}
              onChange={(achievedYear) => setDraft({ ...draft, achievedYear })}
              error={issueFor(runner.issues, "values.achievedYear")}
            />
            <TextField
              id="achievement-icon"
              label={copy["achievementIcon"] ?? ""}
              value={draft.icon}
              onChange={(icon) => setDraft({ ...draft, icon })}
              error={issueFor(runner.issues, "values.icon")}
            />
            <TextField
              id="achievement-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="achievement-active"
              label={copy["achievementActive"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={titleStatus?.canSave ?? false}
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
          await runner.run(deleteAchievementAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(achievement: AchievementView): Draft {
  return {
    id: achievement.id,
    achievedYear: achievement.achievedYear,
    icon: achievement.icon,
    isActive: achievement.isActive,
    sortOrder: String(achievement.sortOrder),
    title: achievement.title,
    description: achievement.description,
  };
}

/** See `site-settings`: an unparseable entry travels on, to be refused by name. */
function numeric(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : value.trim();
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
