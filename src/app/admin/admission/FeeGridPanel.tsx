"use client";

/**
 * The fee grid, and the fee types that give it columns (§B-9).
 *
 * **This panel is the card's Verify.** "Adding a 'Transport' fee type appears
 * in the grid without a migration" is true here because the columns are drawn
 * from `fee_types` rows, not from a hardcoded list and not from whichever
 * charges happen to have amounts already. Create the type in the lower panel
 * and an empty Transport column appears for every class in the upper one.
 *
 * That is §B-9's whole argument for `fee_items` being rows: the PRD's single
 * `otherCharges` column plus one label could express exactly one extra charge,
 * so the second one a school invented meant a schema change.
 *
 * **Money never becomes a number.** An amount is a decimal string from the
 * input to `NUMERIC(12,2)` and back — T-034's `money` refuses a float, a minus
 * and a third decimal place. A fee total is arithmetic a parent checks by hand,
 * and 0.1 + 0.2 is not 0.3.
 *
 * **An empty cell and a zero are different claims.** Empty means the class is
 * not charged this at all; zero means it is charged this, and it is free.
 * Clearing a cell therefore deletes the `fee_items` row rather than storing 0,
 * and the grid draws the two differently.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/admission/copy";
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
} from "@/app/admin/admission/panel-kit";
import {
  clearFeeCellAction,
  retireFeeTypeAction,
  saveFeeCellAction,
  saveFeeTypeAction,
  updateFeeTypeAction,
} from "@/lib/modules/admission/actions";
import type {
  FeeCellView,
  FeeGradeView,
  FeeTypeView,
} from "@/lib/modules/admission/read";

// ─────────────────────────────────────────────────────────────────────────────
// The grid
// ─────────────────────────────────────────────────────────────────────────────

/** `${classGradeId}:${feeTypeId}` — the cell key the edit buffer is keyed on. */
type CellKey = string;

export function FeeGridPanel({
  grades,
  feeTypes,
  cells,
  years,
  copy,
  rights,
}: {
  grades: readonly FeeGradeView[];
  feeTypes: readonly FeeTypeView[];
  cells: readonly FeeCellView[];
  years: readonly { id: string; code: string; isCurrent: boolean }[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [yearId, setYearId] = useState(
    years.find((year) => year.isCurrent)?.id ?? years[0]?.id ?? "",
  );
  /** Only the cells the admin has touched. Untouched ones render from `cells`. */
  const [edits, setEdits] = useState<Record<CellKey, string>>({});

  const stored = new Map<CellKey, string>(
    cells
      .filter((cell) => cell.academicYearId === yearId)
      .map((cell) => [key(cell.classGradeId, cell.feeTypeId), cell.amount]),
  );

  function valueOf(gradeId: string, typeId: string): string {
    const cellKey = key(gradeId, typeId);
    return edits[cellKey] ?? stored.get(cellKey) ?? "";
  }

  function setValue(gradeId: string, typeId: string, value: string) {
    setEdits((current) => ({ ...current, [key(gradeId, typeId)]: value }));
  }

  async function commit(gradeId: string, typeId: string) {
    const value = valueOf(gradeId, typeId).trim();
    const cellKey = key(gradeId, typeId);

    // Emptying the box clears the cell — it does not save a zero. See header.
    const done =
      value === ""
        ? await runner.run(
            clearFeeCellAction,
            { classGradeId: gradeId, academicYearId: yearId, feeTypeId: typeId },
            "deleted",
          )
        : await runner.run(saveFeeCellAction, {
            classGradeId: gradeId,
            academicYearId: yearId,
            feeTypeId: typeId,
            amount: value,
          });

    if (done) {
      // Drop the local edit so the row re-renders from the refreshed server
      // data rather than from a buffer that is now a stale duplicate.
      setEdits((current) => {
        const next = { ...current };
        delete next[cellKey];
        return next;
      });
    }
  }

  const amountIssue = issueFor(runner.issues, "amount");

  return (
    <Panel
      heading={copy["feesHeading"] ?? ""}
      note={copy["feesNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <div className="md:max-w-xs">
        <SelectField
          id="fee-year"
          label={copy["year"] ?? ""}
          value={yearId}
          placeholder={copy["selectYear"] ?? ""}
          options={years.map((year) => ({ code: year.id, label: year.code }))}
          onChange={(next) => {
            setYearId(next);
            // The buffer is keyed on class and type only, so unsaved edits from
            // the previous year would silently reappear against this one.
            setEdits({});
          }}
        />
      </div>

      {amountIssue !== undefined && <p className="field-error mt-3">{amountIssue}</p>}

      {grades.length === 0 || feeTypes.length === 0 ? (
        <p className="mt-5 text-caption text-ink-muted">{copy["empty"] ?? ""}</p>
      ) : (
        // The grid grows a column per fee type, so it is the one place on this
        // screen that must be allowed to scroll sideways rather than squeeze.
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-body">
            <thead>
              <tr>
                <th scope="col" className="border-b border-border p-2 text-start">
                  {copy["grade"] ?? ""}
                </th>
                {feeTypes.map((type) => (
                  <th
                    key={type.id}
                    scope="col"
                    className="border-b border-border p-2 text-start"
                  >
                    <span lang="bn">
                      {type.name.bn === "" ? type.code : type.name.bn}
                    </span>
                    {!type.isActive && (
                      <span className="ms-2 text-caption font-normal text-ink-muted">
                        {copy["feeTypeRetired"] ?? ""}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grades.map((grade) => (
                <tr key={grade.id}>
                  <th scope="row" className="border-b border-border p-2 text-start">
                    <span lang="bn">
                      {grade.name.bn === "" ? grade.code : grade.name.bn}
                    </span>
                  </th>
                  {feeTypes.map((type) => (
                    <td key={type.id} className="border-b border-border p-2">
                      <label className="sr-only" htmlFor={`fee-${grade.id}-${type.id}`}>
                        {`${grade.name.bn} — ${type.name.bn} — ${copy["feeAmount"] ?? ""}`}
                      </label>
                      <input
                        id={`fee-${grade.id}-${type.id}`}
                        className="input w-32"
                        inputMode="decimal"
                        // `type="text"`, not `type="number"`: a number input
                        // hands back a `valueAsNumber` and invites the browser
                        // to normalize what the admin typed. The value must
                        // stay the exact decimal string the column will hold.
                        type="text"
                        value={valueOf(grade.id, type.id)}
                        disabled={!rights.edit || runner.busy}
                        placeholder={copy["feeEmpty"]}
                        onChange={(event) =>
                          setValue(grade.id, type.id, event.target.value)
                        }
                        onBlur={() => {
                          if (!rights.edit) return;
                          // Only when the admin actually changed something.
                          if (edits[key(grade.id, type.id)] === undefined) return;
                          void commit(grade.id, type.id);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function key(gradeId: string, typeId: string): CellKey {
  return `${gradeId}:${typeId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fee types — "never a schema change", made operable
// ─────────────────────────────────────────────────────────────────────────────

type TypeDraft = {
  id: string | null;
  code: string;
  isRecurringMonthly: boolean;
  isOneTime: boolean;
  sortOrder: string;
  isActive: boolean;
  name: DualLocaleValue;
  note: DualLocaleValue;
};

const BLANK_TYPE: TypeDraft = {
  id: null,
  code: "",
  isRecurringMonthly: false,
  isOneTime: false,
  sortOrder: "0",
  isActive: true,
  name: { bn: "", en: "" },
  note: { bn: "", en: "" },
};

export function FeeTypesPanel({
  feeTypes,
  copy,
  rights,
}: {
  feeTypes: readonly FeeTypeView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [pendingRetire, setPendingRetire] = useState<FeeTypeView | null>(null);

  const nameStatus = draft === null ? null : dualLocaleStatus(draft.name);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.name.en.trim() !== "";

    const values = {
      code: draft.code,
      isRecurringMonthly: draft.isRecurringMonthly,
      isOneTime: draft.isOneTime,
      sortOrder: integer(draft.sortOrder),
      isActive: draft.isActive,
      translations: {
        bn: { name: draft.name.bn, note: blankToNull(draft.note.bn) },
        ...(hasEnglish
          ? { en: { name: draft.name.en, note: blankToNull(draft.note.en) } }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveFeeTypeAction, { values })
        : await runner.run(updateFeeTypeAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["feeTypesHeading"] ?? ""}
      note={copy["feeTypesNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={feeTypes.length}>
        {feeTypes.map((type) => (
          <ListRow
            key={type.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toTypeDraft(type)) : undefined}
            onRemove={
              rights.delete && type.isActive ? () => setPendingRetire(type) : undefined
            }
          >
            <span lang="bn" className="font-semibold">
              {type.name.bn === "" ? type.code : type.name.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {type.code}
              {type.isRecurringMonthly ? ` · ${copy["feeTypeRecurring"] ?? ""}` : ""}
              {type.isOneTime ? ` · ${copy["feeTypeOneTime"] ?? ""}` : ""}
              {type.isActive ? "" : ` · ${copy["feeTypeRetired"] ?? ""}`}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(BLANK_TYPE)}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="fee-type-code"
              label={copy["feeTypeCode"] ?? ""}
              value={draft.code}
              onChange={(code) => setDraft({ ...draft, code })}
              error={issueFor(runner.issues, "values.code")}
            />
            <TextField
              id="fee-type-order"
              label={copy["sortOrder"] ?? ""}
              value={draft.sortOrder}
              onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
              error={issueFor(runner.issues, "values.sortOrder")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="feeTypeName"
              label={copy["feeTypeName"] ?? ""}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["requiredLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />

            <DualLocaleField
              name="feeTypeNote"
              label={copy["feeTypeNote"] ?? ""}
              value={draft.note}
              onChange={(note) => setDraft({ ...draft, note })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-6">
            <CheckboxField
              id="fee-type-recurring"
              label={copy["feeTypeRecurring"] ?? ""}
              checked={draft.isRecurringMonthly}
              onChange={(isRecurringMonthly) =>
                setDraft({ ...draft, isRecurringMonthly })
              }
            />
            <CheckboxField
              id="fee-type-one-time"
              label={copy["feeTypeOneTime"] ?? ""}
              checked={draft.isOneTime}
              onChange={(isOneTime) => setDraft({ ...draft, isOneTime })}
            />
            <CheckboxField
              id="fee-type-active"
              label={copy["active"] ?? ""}
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
            />
          </div>

          <EditorActions
            saveLabel={copy["save"] ?? ""}
            savingLabel={copy["saving"] ?? ""}
            cancelLabel={copy["cancel"] ?? ""}
            busy={runner.busy}
            canSave={(nameStatus?.canSave ?? false) && draft.code.trim() !== ""}
            onSave={save}
            onCancel={() => {
              setDraft(null);
              runner.clearIssues();
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={pendingRetire !== null}
        title={copy["confirmRetire"] ?? ""}
        body={copy["confirmRetireBody"] ?? ""}
        atRisk={pendingRetire === null ? undefined : [pendingRetire.code]}
        confirmLabel={copy["feeTypeRetire"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        onConfirm={async () => {
          if (pendingRetire === null) return;
          await runner.run(retireFeeTypeAction, { id: pendingRetire.id }, "deleted");
          setPendingRetire(null);
        }}
        onCancel={() => setPendingRetire(null)}
      />
    </Panel>
  );
}

/** An empty optional string is a null column, not an empty one. */
function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toTypeDraft(type: FeeTypeView): TypeDraft {
  return {
    id: type.id,
    code: type.code,
    isRecurringMonthly: type.isRecurringMonthly,
    isOneTime: type.isOneTime,
    sortOrder: String(type.sortOrder),
    isActive: type.isActive,
    name: type.name,
    note: type.note,
  };
}
