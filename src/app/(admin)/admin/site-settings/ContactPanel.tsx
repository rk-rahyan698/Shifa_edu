"use client";

/**
 * Contact channels, social links and registration identifiers (§B-6).
 *
 * Three lists in one file because they are the same screen for the admin and
 * the same shape in the schema: a small set of configuration rows, each a
 * lookup code plus a value, ordered by `sort_order`. §B-6 replaced
 * `phone1/phone1Label/phone2/…` with `contact_channels` precisely so adding a
 * number is a row rather than a migration, and the UI mirrors that — nothing
 * here knows how many phones a school has.
 *
 * Each list keeps its own action runner. Sharing one would put a failed social
 * link's 422 on the contact channel form, since `issueFor` matches on the
 * schema path and both schemas start at `values.`.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/site-settings/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  SelectField,
  TextField,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/site-settings/panel-kit";
import {
  deleteContactChannelAction,
  deleteRegistrationIdAction,
  deleteSocialLinkAction,
  saveContactChannelAction,
  saveRegistrationIdAction,
  saveSocialLinkAction,
} from "@/lib/modules/site-settings/actions";
import type {
  ContactChannelView,
  LookupOption,
  RegistrationIdView,
  SocialLinkView,
} from "@/lib/modules/site-settings/read";

// ─────────────────────────────────────────────────────────────────────────────
// Contact channels
// ─────────────────────────────────────────────────────────────────────────────

type ChannelDraft = {
  id: string | null;
  channelTypeCode: string;
  value: string;
  isPublic: boolean;
  isPrimary: boolean;
  sortOrder: string;
  label: DualLocaleValue;
};

const BLANK_CHANNEL: ChannelDraft = {
  id: null,
  channelTypeCode: "",
  value: "",
  isPublic: true,
  isPrimary: false,
  sortOrder: "0",
  label: { bn: "", en: "" },
};

export function ContactChannelsPanel({
  channels,
  channelTypes,
  copy,
  editable,
}: {
  channels: readonly ContactChannelView[];
  channelTypes: readonly LookupOption[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<ChannelDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ContactChannelView | null>(null);

  const labelStatus = draft === null ? null : dualLocaleStatus(draft.label);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.label.en.trim() !== "";

    const saved = await runner.run(saveContactChannelAction, {
      id: draft.id,
      values: {
        channelTypeCode: draft.channelTypeCode,
        value: draft.value,
        isPublic: draft.isPublic,
        isPrimary: draft.isPrimary,
        sortOrder: integer(draft.sortOrder),
      },
      translations: {
        bn: { label: draft.label.bn },
        ...(hasEnglish ? { en: { label: draft.label.en } } : {}),
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["channelsHeading"] ?? ""}
      note={copy["channelsNote"]}
      lockedNote={copy["settingsLocked"]}
      editable={editable}
    >
      <SimpleList
        empty={copy["empty"] ?? ""}
        headers={[
          copy["channelType"] ?? "",
          copy["channelValue"] ?? "",
          copy["channelLabel"] ?? "",
          copy["channelPublic"] ?? "",
        ]}
        rows={channels.map((channel) => ({
          key: channel.id,
          cells: [
            channel.channelTypeCode,
            channel.value,
            channel.label.bn,
            channel.isPublic ? "✓" : "—",
          ],
          onEdit: () =>
            setDraft({
              id: channel.id,
              channelTypeCode: channel.channelTypeCode,
              value: channel.value,
              isPublic: channel.isPublic,
              isPrimary: channel.isPrimary,
              sortOrder: String(channel.sortOrder),
              label: channel.label,
            }),
          onRemove: () => setPendingRemoval(channel),
        }))}
        copy={copy}
        editable={editable}
      />

      {editable && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK_CHANNEL)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <DualLocaleField
            name="channelLabel"
            label={copy["channelLabel"] ?? ""}
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
            <SelectField
              id="channel-type"
              label={copy["channelType"] ?? ""}
              value={draft.channelTypeCode}
              options={channelTypes}
              placeholder={copy["none"] ?? ""}
              onChange={(channelTypeCode) => setDraft({ ...draft, channelTypeCode })}
              error={issueFor(runner.issues, "values.channelTypeCode")}
            />
            <TextField
              id="channel-value"
              label={copy["channelValue"] ?? ""}
              value={draft.value}
              onChange={(value) => setDraft({ ...draft, value })}
              error={issueFor(runner.issues, "values.value")}
            />
            <TextField
              id="channel-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <CheckboxField
              id="channel-public"
              label={copy["channelPublic"] ?? ""}
              checked={draft.isPublic}
              onChange={(isPublic) => setDraft({ ...draft, isPublic })}
            />
            <CheckboxField
              id="channel-primary"
              label={copy["channelPrimary"] ?? ""}
              checked={draft.isPrimary}
              onChange={(isPrimary) => setDraft({ ...draft, isPrimary })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={labelStatus?.canSave ?? false}
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
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.value]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteContactChannelAction,
            { id: pendingRemoval.id },
            "deleted",
          );
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Social links
// ─────────────────────────────────────────────────────────────────────────────

type SocialDraft = {
  id: string | null;
  platformCode: string;
  url: string;
  sortOrder: string;
};

const BLANK_SOCIAL: SocialDraft = { id: null, platformCode: "", url: "", sortOrder: "0" };

export function SocialLinksPanel({
  socials,
  platforms,
  copy,
  editable,
}: {
  socials: readonly SocialLinkView[];
  platforms: readonly LookupOption[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<SocialDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<SocialLinkView | null>(null);

  async function save() {
    if (draft === null) return;

    const saved = await runner.run(saveSocialLinkAction, {
      id: draft.id,
      values: {
        platformCode: draft.platformCode,
        url: draft.url,
        sortOrder: integer(draft.sortOrder),
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["socialsHeading"] ?? ""}
      note={copy["socialsNote"]}
      lockedNote={copy["settingsLocked"]}
      editable={editable}
    >
      <SimpleList
        empty={copy["empty"] ?? ""}
        headers={[copy["socialPlatform"] ?? "", copy["socialUrl"] ?? ""]}
        rows={socials.map((social) => ({
          key: social.id,
          cells: [social.platformCode, social.url],
          onEdit: () =>
            setDraft({
              id: social.id,
              platformCode: social.platformCode,
              url: social.url,
              sortOrder: String(social.sortOrder),
            }),
          onRemove: () => setPendingRemoval(social),
        }))}
        copy={copy}
        editable={editable}
      />

      {editable && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK_SOCIAL)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 grid gap-4 border-t border-border pt-6 md:grid-cols-3">
          <SelectField
            id="social-platform"
            label={copy["socialPlatform"] ?? ""}
            value={draft.platformCode}
            options={platforms}
            placeholder={copy["none"] ?? ""}
            onChange={(platformCode) => setDraft({ ...draft, platformCode })}
            error={issueFor(runner.issues, "values.platformCode")}
          />
          <TextField
            id="social-url"
            label={copy["socialUrl"] ?? ""}
            type="url"
            value={draft.url}
            onChange={(url) => setDraft({ ...draft, url })}
            error={issueFor(runner.issues, "values.url")}
          />
          <TextField
            id="social-order"
            label={copy["sortOrder"] ?? ""}
            value={draft.sortOrder}
            onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
            error={issueFor(runner.issues, "values.sortOrder")}
          />

          <div className="md:col-span-3">
            <EditorActions
              saveLabel={copy["save"] ?? ""}
              savingLabel={copy["saving"] ?? ""}
              cancelLabel={copy["cancel"] ?? ""}
              busy={runner.busy}
              canSave={draft.platformCode !== "" && draft.url !== ""}
              onSave={save}
              onCancel={() => {
                setDraft(null);
                runner.clearIssues();
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={pendingRemoval === null ? undefined : [pendingRemoval.platformCode]}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(deleteSocialLinkAction, { id: pendingRemoval.id }, "deleted");
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration identifiers
// ─────────────────────────────────────────────────────────────────────────────

type RegistrationDraft = {
  registrationIdTypeCode: string;
  value: string;
  isPublic: boolean;
  sortOrder: string;
  /** True while editing an existing row — the type code is then its identity. */
  existing: boolean;
};

const BLANK_REGISTRATION: RegistrationDraft = {
  registrationIdTypeCode: "",
  value: "",
  isPublic: true,
  sortOrder: "0",
  existing: false,
};

export function RegistrationIdsPanel({
  registrationIds,
  types,
  copy,
  editable,
}: {
  registrationIds: readonly RegistrationIdView[];
  types: readonly LookupOption[];
  copy: Copy;
  editable: boolean;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<RegistrationDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<RegistrationIdView | null>(null);

  const labelOf = (code: string) =>
    types.find((type) => type.code === code)?.label ?? code;

  async function save() {
    if (draft === null) return;

    const saved = await runner.run(saveRegistrationIdAction, {
      values: {
        registrationIdTypeCode: draft.registrationIdTypeCode,
        value: draft.value,
        isPublic: draft.isPublic,
        sortOrder: integer(draft.sortOrder),
      },
    });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["registrationHeading"] ?? ""}
      note={copy["registrationNote"]}
      lockedNote={copy["settingsLocked"]}
      editable={editable}
    >
      <SimpleList
        empty={copy["empty"] ?? ""}
        headers={[
          copy["registrationType"] ?? "",
          copy["registrationValue"] ?? "",
          copy["registrationPublic"] ?? "",
        ]}
        rows={registrationIds.map((entry) => ({
          key: entry.registrationIdTypeCode,
          cells: [
            labelOf(entry.registrationIdTypeCode),
            entry.value,
            entry.isPublic ? "✓" : "—",
          ],
          onEdit: () =>
            setDraft({
              registrationIdTypeCode: entry.registrationIdTypeCode,
              value: entry.value,
              isPublic: entry.isPublic,
              sortOrder: String(entry.sortOrder),
              existing: true,
            }),
          onRemove: () => setPendingRemoval(entry),
        }))}
        copy={copy}
        editable={editable}
      />

      {editable && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK_REGISTRATION)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 grid gap-4 border-t border-border pt-6 md:grid-cols-3">
          <SelectField
            id="registration-type"
            label={copy["registrationType"] ?? ""}
            value={draft.registrationIdTypeCode}
            options={types}
            placeholder={copy["none"] ?? ""}
            // The code is the primary key (§B-6), so an existing row's type is
            // its identity and changing it would be a different record.
            disabled={draft.existing}
            onChange={(registrationIdTypeCode) =>
              setDraft({ ...draft, registrationIdTypeCode })
            }
            error={issueFor(runner.issues, "values.registrationIdTypeCode")}
          />
          <TextField
            id="registration-value"
            label={copy["registrationValue"] ?? ""}
            value={draft.value}
            onChange={(value) => setDraft({ ...draft, value })}
            error={issueFor(runner.issues, "values.value")}
          />
          <TextField
            id="registration-order"
            label={copy["sortOrder"] ?? ""}
            value={draft.sortOrder}
            onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
            error={issueFor(runner.issues, "values.sortOrder")}
          />

          <div className="md:col-span-3">
            <CheckboxField
              id="registration-public"
              label={copy["registrationPublic"] ?? ""}
              checked={draft.isPublic}
              onChange={(isPublic) => setDraft({ ...draft, isPublic })}
            />

            <EditorActions
              saveLabel={copy["save"] ?? ""}
              savingLabel={copy["saving"] ?? ""}
              cancelLabel={copy["cancel"] ?? ""}
              busy={runner.busy}
              canSave={draft.registrationIdTypeCode !== "" && draft.value !== ""}
              onSave={save}
              onCancel={() => {
                setDraft(null);
                runner.clearIssues();
              }}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemove"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={
          pendingRemoval === null
            ? undefined
            : [labelOf(pendingRemoval.registrationIdTypeCode)]
        }
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRemoval === null) return;
          await runner.run(
            deleteRegistrationIdAction,
            { registrationIdTypeCode: pendingRemoval.registrationIdTypeCode },
            "deleted",
          );
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

type SimpleRow = {
  key: string;
  cells: readonly string[];
  onEdit: () => void;
  onRemove: () => void;
};

/** The read-only half of a list panel — the same table three times over. */
function SimpleList({
  headers,
  rows,
  empty,
  copy,
  editable,
}: {
  headers: readonly string[];
  rows: readonly SimpleRow[];
  empty: string;
  copy: Copy;
  editable: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-caption text-ink-muted">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr className="text-caption text-ink-muted">
            {headers.map((header) => (
              <th key={header} className="py-2 text-start">
                {header}
              </th>
            ))}
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${index}`} className="py-2 break-words">
                  {cell}
                </td>
              ))}
              <td className="py-2 text-end">
                {editable && (
                  <span className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="link text-caption"
                      onClick={row.onEdit}
                    >
                      {copy["edit"] ?? ""}
                    </button>
                    <button
                      type="button"
                      className="link text-caption"
                      onClick={row.onRemove}
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
  );
}

function integer(value: string): number | string {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) ? parsed : value.trim();
}
