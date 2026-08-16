"use client";

/**
 * Published statistics (§B-6, `site_stats`).
 *
 * This is the panel that carries the card's Contract — **a statistic cannot be
 * activated without a verification date** — and the rule is stated in three
 * places on purpose, none of which is redundant with the others:
 *
 *  - here, so the admin is told before they submit rather than after;
 *  - in T-034's `siteStatSchema`, so any caller is refused with a 422;
 *  - in `ck_stat_verified`, so no path at all can write the row.
 *
 * §A-3.1's point is that "95% pass rate" is a claim about a school, and the
 * schema is where the project decided not to publish claims nobody has stood
 * behind. A UI-only check would move that decision back into a form.
 *
 * The list is a plain table rather than T-051's `DataTable`. `DataTable`
 * paginates server-side by contract, and this list is a handful of
 * configuration rows that arrive whole with the page — wiring a query string
 * through it would add the machinery without the problem it solves.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/site-settings/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/admin/site-settings/panel-kit";
import {
  deleteSiteStatAction,
  saveSiteStatAction,
} from "@/lib/modules/site-settings/actions";
import type { StatView } from "@/lib/modules/site-settings/read";

type Draft = {
  id: string | null;
  code: string;
  numericValue: string;
  displaySuffix: string;
  icon: string;
  verifiedOn: string;
  sourceNote: string;
  isActive: boolean;
  sortOrder: string;
  label: DualLocaleValue;
};

const BLANK: Draft = {
  id: null,
  code: "",
  numericValue: "",
  displaySuffix: "",
  icon: "",
  verifiedOn: "",
  sourceNote: "",
  isActive: false,
  sortOrder: "0",
  label: { bn: "", en: "" },
};

export type StatsPanelProps = {
  stats: readonly StatView[];
  copy: Copy;
  editable: boolean;
};

export function StatsPanel({ stats, copy, editable }: StatsPanelProps) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<StatView | null>(null);

  const needsVerification = draft !== null && draft.isActive && draft.verifiedOn === "";
  const labelStatus = draft === null ? null : dualLocaleStatus(draft.label);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.label.en.trim() !== "";

    const saved = await runner.run(saveSiteStatAction, {
      id: draft.id,
      values: {
        code: draft.code,
        numericValue: numeric(draft.numericValue),
        displaySuffix: draft.displaySuffix,
        icon: draft.icon,
        verifiedOn: draft.verifiedOn === "" ? null : draft.verifiedOn,
        sourceNote: draft.sourceNote,
        isActive: draft.isActive,
        sortOrder: integer(draft.sortOrder),
        translations: {
          bn: { label: draft.label.bn },
          ...(hasEnglish ? { en: { label: draft.label.en } } : {}),
        },
      },
    });

    if (saved) setDraft(null);
  }

  async function confirmRemoval() {
    if (pendingRemoval === null) return;
    await runner.run(deleteSiteStatAction, { id: pendingRemoval.id }, "deleted");
    setPendingRemoval(null);
  }

  return (
    <Panel
      heading={copy["statsHeading"] ?? ""}
      note={copy["statsNote"]}
      lockedNote={copy["settingsLocked"]}
      editable={editable}
    >
      {stats.length === 0 ? (
        <p className="text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-start text-caption text-ink-muted">
                <th className="py-2 text-start">{copy["statCode"] ?? ""}</th>
                <th className="py-2 text-start">{copy["statLabel"] ?? ""}</th>
                <th className="py-2 text-start">{copy["statValue"] ?? ""}</th>
                <th className="py-2 text-start">{copy["statVerifiedOn"] ?? ""}</th>
                <th className="py-2 text-start">{copy["statActive"] ?? ""}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.id} className="border-t border-border">
                  <td className="py-2">{stat.code}</td>
                  <td className="py-2" lang="bn">
                    {stat.label.bn}
                  </td>
                  <td className="py-2">
                    {stat.numericValue}
                    {stat.displaySuffix}
                  </td>
                  <td className="py-2">{stat.verifiedOn}</td>
                  <td className="py-2">{stat.isActive ? "✓" : "—"}</td>
                  <td className="py-2 text-end">
                    {editable && (
                      <span className="flex justify-end gap-3">
                        <button
                          type="button"
                          className="link text-caption"
                          onClick={() => setDraft(toDraft(stat))}
                        >
                          {copy["edit"] ?? ""}
                        </button>
                        <button
                          type="button"
                          className="link text-caption"
                          onClick={() => setPendingRemoval(stat)}
                        >
                          {copy["remove"] ?? ""}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            name="statLabel"
            label={copy["statLabel"] ?? ""}
            value={draft.label}
            onChange={(label) => setDraft({ ...draft, label })}
            requiredMessage={copy["requiredMessage"] ?? ""}
            englishMissingLabel={copy["englishMissing"] ?? ""}
            banglaLabel={copy["banglaLabel"] ?? ""}
            englishLabel={copy["englishLabel"] ?? ""}
            requiredLabel={copy["requiredLabel"] ?? ""}
            optionalLabel={copy["optionalLabel"] ?? ""}
          />

          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              id="stat-code"
              label={copy["statCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <TextField
              id="stat-value"
              label={copy["statValue"] ?? ""}
              value={draft.numericValue}
              onChange={(numericValue) => setDraft({ ...draft, numericValue })}
              error={issueFor(runner.issues, "values.numericValue")}
            />
            <TextField
              id="stat-suffix"
              label={copy["statSuffix"] ?? ""}
              value={draft.displaySuffix}
              onChange={(displaySuffix) => setDraft({ ...draft, displaySuffix })}
              error={issueFor(runner.issues, "values.displaySuffix")}
            />
            <TextField
              id="stat-verified-on"
              label={copy["statVerifiedOn"] ?? ""}
              type="date"
              value={draft.verifiedOn}
              onChange={(verifiedOn) => setDraft({ ...draft, verifiedOn })}
              error={
                issueFor(runner.issues, "values.verifiedOn") ??
                (needsVerification ? copy["statNeedsVerification"] : undefined)
              }
            />
            <TextField
              id="stat-source"
              label={copy["statSourceNote"] ?? ""}
              value={draft.sourceNote}
              onChange={(sourceNote) => setDraft({ ...draft, sourceNote })}
              error={issueFor(runner.issues, "values.sourceNote")}
            />
            <TextField
              id="stat-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="stat-active"
              label={copy["statActive"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
              hint={copy["statNeedsVerification"]}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={(labelStatus?.canSave ?? false) && !needsVerification}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.code]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

function toDraft(stat: StatView): Draft {
  return {
    id: stat.id,
    code: stat.code,
    numericValue: stat.numericValue,
    displaySuffix: stat.displaySuffix,
    icon: stat.icon,
    verifiedOn: stat.verifiedOn,
    sourceNote: stat.sourceNote,
    isActive: stat.isActive,
    sortOrder: String(stat.sortOrder),
    label: stat.label,
  };
}

/** See `SettingsPanel`: an unparseable entry travels on, to be refused by name. */
function numeric(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
