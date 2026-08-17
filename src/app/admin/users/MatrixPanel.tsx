"use client";

/**
 * The permission matrix (§A-9.3) and the special grants panel (§A-9.4).
 *
 * **Every cell in this grid comes from data.** The columns are the rows of
 * `permission_actions`, the rows are the rows of `modules`, and whether a given
 * cell is a checkbox or a `—` is decided by whether `module_actions` holds that
 * pair — read in `src/lib/modules/users/read.ts`, never decided here. That is
 * this card's Do line, and the difference it makes is concrete: §A-9.3 says
 * adding a `publish` or an `export` action is an INSERT, and a grid built from
 * a hardcoded list would go on rendering yesterday's columns afterwards.
 *
 * The `—` is not "denied". Denied is an unchecked box, which a Super Admin can
 * tick. `—` means the action is *inapplicable*: there is no `module_actions`
 * row, the composite foreign key on `user_module_permissions` would refuse the
 * grant, and `can()` (T-031) returns false at `isActionApplicable` without ever
 * consulting the permission set. The `users` module is the live demonstration —
 * §A-5.2 gives it no applicable actions, the §B-19 seed writes it none, and its
 * whole row renders `—` without a line of code arranging it.
 *
 * §A-9.3's model is independent toggles, not a cascade (AUDIT B-1), so the
 * checkboxes are genuinely independent: Add without Edit is a legitimate,
 * expressible state and this panel neither prevents nor auto-corrects it.
 *
 * The grant list is separate for the reason §A-9.4 gives: `edit_branding`
 * guards `site_branding`, a different **table** from `site_settings`, so no
 * amount of ticking in the grid above can reach it.
 */

import { useEffect, useState } from "react";

import type { Copy } from "@/app/admin/users/copy";
import {
  EditorActions,
  Panel,
  SelectField,
  useActionRunner,
} from "@/app/admin/users/panel-kit";
import { savePermissionMatrixAction } from "@/lib/modules/users/actions";
import type {
  ActionColumn,
  AdminUserView,
  ModuleRow,
  SpecialGrantOption,
} from "@/lib/modules/users/read";
import type { Locale } from "@/lib/locale";

export function MatrixPanel({
  users,
  modules,
  actions,
  specialGrants,
  locale,
  copy,
}: {
  users: readonly AdminUserView[];
  modules: readonly ModuleRow[];
  actions: readonly ActionColumn[];
  specialGrants: readonly SpecialGrantOption[];
  locale: Locale;
  copy: Copy;
}) {
  const runner = useActionRunner(copy);
  const [userId, setUserId] = useState<string>("");
  const [granted, setGranted] = useState<readonly string[]>([]);
  const [grants, setGrants] = useState<readonly string[]>([]);

  const selected = users.find((entry) => entry.id === userId) ?? null;

  // The selection is the source of truth: re-reading it whenever the server
  // re-renders keeps the boxes in step with what was actually saved, rather
  // than with what this component last posted.
  useEffect(() => {
    setGranted(selected?.permissions ?? []);
    setGrants(selected?.specialGrants ?? []);
  }, [selected]);

  // §A-9.3's documented bypass: a Super Admin's rows decide nothing, so the
  // grid is not offered for one. The server refuses the write as well.
  const bypasses = selected !== null && selected.roleCode === "super_admin";

  function toggle(key: string, on: boolean) {
    setGranted((current) =>
      on ? [...current, key] : current.filter((entry) => entry !== key),
    );
  }

  function setRow(module: ModuleRow, on: boolean) {
    const keys = module.applicable.map((action) => `${module.code}:${action}`);
    setGranted((current) =>
      on
        ? [...new Set([...current, ...keys])]
        : current.filter((entry) => !keys.includes(entry)),
    );
  }

  async function save() {
    if (selected === null) return;

    await runner.run(savePermissionMatrixAction, {
      userId: selected.id,
      permissions: granted.map((key) => {
        const [moduleCode = "", actionCode = ""] = key.split(":");
        return { moduleCode, actionCode };
      }),
      specialGrants: grants,
    });
  }

  return (
    <Panel heading={copy["matrixHeading"] ?? ""} note={copy["matrixNote"] ?? ""}>
      <div className="max-w-sm">
        <SelectField
          id="matrix-user"
          label={copy["matrixSelectUser"] ?? ""}
          value={userId}
          options={users.map((entry) => ({
            code: entry.id,
            label: `${entry.displayName} (${entry.username})`,
          }))}
          placeholder={copy["matrixSelectUser"] ?? ""}
          onChange={setUserId}
        />
      </div>

      {selected !== null && bypasses && (
        <p className="callout mt-5" role="status">
          {copy["matrixSuperAdmin"] ?? ""}
        </p>
      )}

      {selected !== null && !bypasses && (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-body">
              <caption className="sr-only">
                {copy["matrixHeading"] ?? ""} — {selected.username}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border p-2 text-start">
                    {copy["matrixModule"] ?? ""}
                  </th>
                  {actions.map((action) => (
                    <th
                      key={action.code}
                      scope="col"
                      className="border-b border-border p-2 text-center font-semibold"
                    >
                      {action.label[locale] === "" ? action.code : action.label[locale]}
                    </th>
                  ))}
                  <th scope="col" className="border-b border-border p-2 text-end">
                    <span className="sr-only">{copy["matrixSelectAll"] ?? ""}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((module) => (
                  <tr key={module.code}>
                    <th
                      scope="row"
                      className="border-b border-border p-2 text-start font-normal"
                    >
                      {module.label[locale] === "" ? module.code : module.label[locale]}
                    </th>
                    {actions.map((action) => {
                      const key = `${module.code}:${action.code}`;
                      const applicable = module.applicable.includes(action.code);

                      return (
                        <td
                          key={action.code}
                          className="border-b border-border p-2 text-center"
                        >
                          {applicable ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              data-cell={key}
                              checked={granted.includes(key)}
                              aria-label={key}
                              onChange={(event) => toggle(key, event.target.checked)}
                            />
                          ) : (
                            // Rendered from the absence of a `module_actions`
                            // row — see the module header.
                            <span
                              data-cell={key}
                              data-inapplicable="true"
                              title={copy["matrixInapplicable"] ?? ""}
                              aria-label={copy["matrixInapplicable"] ?? ""}
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-border p-2 text-end">
                      {module.applicable.length > 0 && (
                        <span className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="link text-caption"
                            onClick={() => setRow(module, true)}
                          >
                            {copy["matrixSelectAll"] ?? ""}
                          </button>
                          <button
                            type="button"
                            className="link text-caption"
                            onClick={() => setRow(module, false)}
                          >
                            {copy["matrixClear"] ?? ""}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="mt-6 border-0 p-0">
            <legend className="label mb-1 p-0">{copy["grantsHeading"] ?? ""}</legend>
            <p className="field-hint mb-2">{copy["grantsNote"] ?? ""}</p>
            <div className="flex flex-col gap-2">
              {specialGrants.map((grant) => (
                <label key={grant.code} className="flex items-start gap-2 text-body">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    data-grant={grant.code}
                    checked={grants.includes(grant.code)}
                    onChange={(event) =>
                      setGrants((current) =>
                        event.target.checked
                          ? [...new Set([...current, grant.code])]
                          : current.filter((entry) => entry !== grant.code),
                      )
                    }
                  />
                  <span>
                    <span className="font-semibold">{grant.code}</span>
                    <span className="block text-caption text-ink-muted">
                      {grant.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave
            onSave={save}
            onCancel={() => {
              setGranted(selected.permissions);
              setGrants(selected.specialGrants);
            }}
          />
        </>
      )}
    </Panel>
  );
}
