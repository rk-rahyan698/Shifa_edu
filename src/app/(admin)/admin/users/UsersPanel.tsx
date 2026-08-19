"use client";

/**
 * The accounts list (§B-4 `users`, §A-9.2).
 *
 * Two things on this panel are not ordinary CRUD and are worth reading for.
 *
 * **The generated password is shown exactly once.** `createUserAction` returns
 * it as the action's `data`, this component puts it in a dismissible panel, and
 * nothing anywhere can produce it again — §A-9.2 requires it to be generated at
 * creation and never written down (AUDIT S-12), so there is no "show password"
 * to add later. Dismissing it is deliberate and final, which is why the panel
 * says so before the button rather than after it.
 *
 * **Suspension is a checkbox with a consequence.** Unticking `active` revokes
 * every live session that account holds, immediately, inside the same
 * transaction as the update. `liveSessionCount` is rendered beside the account
 * so a Super Admin can see what they are about to end rather than discover it
 * from a colleague.
 *
 * Both the suspend and the delete controls are absent on the signed-in account
 * itself: the server refuses either with a 422 (`SELF_SUSPEND`/`SELF_DELETE`),
 * and offering a button whose only outcome is that refusal is a worse way to
 * say the same thing.
 */

import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/(admin)/admin/users/copy";
import {
  CheckboxField,
  EditorActions,
  Panel,
  RowList,
  SelectField,
  TextField,
  instant,
  issueFor,
  useActionRunner,
} from "@/app/(admin)/admin/users/panel-kit";
import {
  createUserAction,
  deleteUserAction,
  updateUserAction,
  type CreatedUser,
} from "@/lib/modules/users/actions";
import type { AdminUserView } from "@/lib/modules/users/read";
import { LOCALES } from "@/lib/locale";

type Draft = {
  id: string | null;
  username: string;
  email: string;
  displayName: string;
  roleCode: string;
  preferredLocale: string;
  isActive: boolean;
};

const BLANK: Draft = {
  id: null,
  username: "",
  email: "",
  displayName: "",
  roleCode: "admin",
  preferredLocale: "bn",
  isActive: true,
};

export function UsersPanel({
  users,
  roleCodes,
  currentUserId,
  copy,
}: {
  users: readonly AdminUserView[];
  roleCodes: readonly string[];
  /** The signed-in Super Admin — the one account with no suspend or delete. */
  currentUserId: string;
  copy: Copy;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<AdminUserView | null>(null);

  const roleOptions = roleCodes.map((code) => ({ code, label: code }));
  const localeOptions = LOCALES.map((code) => ({
    code,
    label: copy[code === "bn" ? "banglaLabel" : "englishLabel"] ?? code,
  }));

  async function save() {
    if (draft === null) return;

    if (draft.id === null) {
      const result = await runner.run(createUserAction, {
        username: draft.username,
        email: draft.email,
        displayName: draft.displayName,
        roleCode: draft.roleCode,
        preferredLocale: draft.preferredLocale,
      });
      if (result === null) return;
      // The one moment this value exists. See the module header.
      setCreated(result);
      setDraft(null);
      return;
    }

    const saved = await runner.run(updateUserAction, {
      id: draft.id,
      email: draft.email === "" ? null : draft.email,
      displayName: draft.displayName,
      roleCode: draft.roleCode,
      preferredLocale: draft.preferredLocale,
      isActive: draft.isActive,
    });
    if (saved !== null) setDraft(null);
  }

  /** Suspend/reinstate from the row, without opening the editor. */
  async function setActive(user: AdminUserView, isActive: boolean) {
    await runner.run(updateUserAction, { id: user.id, isActive });
  }

  async function remove() {
    if (pendingRemoval === null) return;
    const done = await runner.run(deleteUserAction, { id: pendingRemoval.id }, "deleted");
    if (done !== null) setPendingRemoval(null);
  }

  return (
    <Panel heading={copy["accountsHeading"] ?? ""} note={copy["accountsNote"] ?? ""}>
      {created !== null && (
        <div className="callout mb-5" role="status">
          <p className="font-semibold text-primary">{copy["generatedHeading"] ?? ""}</p>
          <p className="mt-1 break-all font-mono text-body" data-generated-password>
            {created.username} · {created.generatedPassword}
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            {copy["generatedNote"] ?? ""}
          </p>
          <button
            type="button"
            className="link mt-2 text-caption"
            onClick={() => setCreated(null)}
          >
            {copy["generatedDismiss"] ?? ""}
          </button>
        </div>
      )}

      <RowList empty={copy["empty"] ?? ""} count={users.length}>
        {users.map((user) => (
          <li
            key={user.id}
            className="flex flex-wrap items-start justify-between gap-3 border-t border-border py-2"
          >
            <span className="min-w-0">
              <span className="font-semibold text-ink">{user.displayName}</span>{" "}
              <span className="text-caption text-ink-muted">
                {user.username} · {user.roleCode}
                {user.isActive ? "" : ` · ${copy["suspended"] ?? ""}`}
              </span>
              <span className="block text-caption text-ink-muted">
                {copy["lastLogin"] ?? ""}:{" "}
                {instant(user.lastLoginAt, copy["neverLoggedIn"] ?? "")} ·{" "}
                {copy["liveSessions"] ?? ""}: {user.liveSessionCount}
                {user.mustChangePassword ? ` · ${copy["mustChangePassword"] ?? ""}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 gap-3">
              <button
                type="button"
                className="link text-caption"
                onClick={() =>
                  setDraft({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    displayName: user.displayName,
                    roleCode: user.roleCode,
                    preferredLocale: user.preferredLocale,
                    isActive: user.isActive,
                  })
                }
              >
                {copy["edit"] ?? ""}
              </button>
              {user.id !== currentUserId && (
                <>
                  <button
                    type="button"
                    className="link text-caption"
                    disabled={runner.busy}
                    onClick={() => setActive(user, !user.isActive)}
                  >
                    {user.isActive ? (copy["suspend"] ?? "") : (copy["reinstate"] ?? "")}
                  </button>
                  <button
                    type="button"
                    className="link text-caption"
                    onClick={() => setPendingRemoval(user)}
                  >
                    {copy["remove"] ?? ""}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </RowList>

      {draft === null ? (
        <button
          type="button"
          className="btn btn-secondary mt-5"
          onClick={() => {
            runner.clearIssues();
            setDraft(BLANK);
          }}
        >
          {copy["newAccount"] ?? ""}
        </button>
      ) : (
        <div className="mt-5 border-t border-border pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="user-username"
              label={copy["username"] ?? ""}
              value={draft.username}
              // `users.username` is the login name and the audit snapshot; it is
              // set once at creation. `userUpdateSchema` does not carry it.
              disabled={draft.id !== null}
              autoComplete="off"
              error={issueFor(runner.issues, "username")}
              onChange={(value) => setDraft({ ...draft, username: value })}
            />
            <TextField
              id="user-email"
              label={copy["email"] ?? ""}
              type="email"
              value={draft.email}
              autoComplete="off"
              error={issueFor(runner.issues, "email")}
              onChange={(value) => setDraft({ ...draft, email: value })}
            />
            <TextField
              id="user-display-name"
              label={copy["displayName"] ?? ""}
              value={draft.displayName}
              error={issueFor(runner.issues, "displayName")}
              onChange={(value) => setDraft({ ...draft, displayName: value })}
            />
            <SelectField
              id="user-role"
              label={copy["role"] ?? ""}
              value={draft.roleCode}
              options={roleOptions}
              placeholder={copy["selectRole"] ?? ""}
              error={issueFor(runner.issues, "roleCode")}
              onChange={(value) => setDraft({ ...draft, roleCode: value })}
            />
            <SelectField
              id="user-locale"
              label={copy["preferredLocale"] ?? ""}
              value={draft.preferredLocale}
              options={localeOptions}
              placeholder={copy["selectLocale"] ?? ""}
              error={issueFor(runner.issues, "preferredLocale")}
              onChange={(value) => setDraft({ ...draft, preferredLocale: value })}
            />
            {draft.id !== null && draft.id !== currentUserId && (
              <CheckboxField
                id="user-active"
                label={copy["active"] ?? ""}
                checked={draft.isActive}
                hint={copy["accountsNote"] ?? ""}
                onChange={(checked) => setDraft({ ...draft, isActive: checked })}
              />
            )}
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={draft.displayName.trim() !== "" && draft.username.trim() !== ""}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        title={copy["confirmRemoveTitle"] ?? ""}
        body={copy["confirmRemoveBody"] ?? ""}
        atRisk={
          pendingRemoval === null || pendingRemoval.liveSessionCount === 0
            ? undefined
            : [`${copy["liveSessions"] ?? ""}: ${pendingRemoval.liveSessionCount}`]
        }
        confirmLabel={copy["confirmRemoveConfirm"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={remove}
        onCancel={() => setPendingRemoval(null)}
      />
    </Panel>
  );
}
