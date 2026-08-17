"use client";

/**
 * The academic calendar (§B-8, `calendar_events`).
 *
 * `ck_event_range` allows `ends_on` to be null, and that nullability is the
 * feature: most of a school calendar is single days — a holiday, a results
 * announcement — and forcing an end date on those would have every admin type
 * the start date twice.
 *
 * The event type is a §B-3 lookup rather than an enum, so a school can add
 * "sports week" without a migration. Only active types are offered.
 */

import { useState } from "react";

import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Copy } from "@/app/admin/academics/copy";
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
} from "@/app/admin/academics/panel-kit";
import {
  deleteCalendarEventAction,
  saveCalendarEventAction,
  updateCalendarEventAction,
} from "@/lib/modules/academics/actions";
import type {
  AcademicYearView,
  CalendarEventView,
  LookupView,
} from "@/lib/modules/academics/read";

type Draft = {
  id: string | null;
  academicYearId: string;
  calendarEventTypeId: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  title: DualLocaleValue;
  description: DualLocaleValue;
};

function blank(defaultYearId: string): Draft {
  return {
    id: null,
    academicYearId: defaultYearId,
    calendarEventTypeId: "",
    startsOn: "",
    endsOn: "",
    isActive: true,
    title: { bn: "", en: "" },
    description: { bn: "", en: "" },
  };
}

export function CalendarPanel({
  events,
  years,
  eventTypes,
  copy,
  rights,
}: {
  events: readonly CalendarEventView[];
  years: readonly AcademicYearView[];
  eventTypes: readonly LookupView[];
  copy: Copy;
  rights: Rights;
}) {
  const runner = useActionRunner(copy);
  const defaultYearId = years.find((year) => year.isCurrent)?.id ?? years[0]?.id ?? "";
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<CalendarEventView | null>(null);

  const yearOptions = years.map((year) => ({ code: year.id, label: year.code }));
  const titleStatus = draft === null ? null : dualLocaleStatus(draft.title);

  const complete =
    draft !== null &&
    draft.academicYearId !== "" &&
    draft.calendarEventTypeId !== "" &&
    draft.startsOn !== "" &&
    (titleStatus?.canSave ?? false);

  async function save() {
    if (draft === null) return;

    const hasEnglish = draft.title.en.trim() !== "";

    const values = {
      academicYearId: draft.academicYearId,
      calendarEventTypeId: draft.calendarEventTypeId,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn === "" ? null : draft.endsOn,
      isActive: draft.isActive,
      translations: {
        bn: { title: draft.title.bn, description: blankToNull(draft.description.bn) },
        ...(hasEnglish
          ? {
              en: {
                title: draft.title.en,
                description: blankToNull(draft.description.en),
              },
            }
          : {}),
      },
    };

    const saved =
      draft.id === null
        ? await runner.run(saveCalendarEventAction, { values })
        : await runner.run(updateCalendarEventAction, { id: draft.id, values });

    if (saved) setDraft(null);
  }

  return (
    <Panel
      heading={copy["calendarHeading"] ?? ""}
      note={copy["calendarNote"]}
      lockedNote={copy["locked"]}
      editable={anyRight(rights)}
    >
      <RowList empty={copy["empty"] ?? ""} count={events.length}>
        {events.map((event) => (
          <ListRow
            key={event.id}
            copy={copy}
            onEdit={rights.edit ? () => setDraft(toDraft(event)) : undefined}
            onRemove={rights.delete ? () => setPendingRemoval(event) : undefined}
          >
            <span lang="bn" className="font-semibold">
              {event.title.bn}
            </span>
            <span className="ms-3 text-caption text-ink-muted">
              {event.startsOn}
              {event.endsOn === "" ? "" : ` → ${event.endsOn}`}
              {" · "}
              {labelFor(eventTypes, event.calendarEventTypeId)}
              {event.isActive ? "" : " · —"}
            </span>
          </ListRow>
        ))}
      </RowList>

      {rights.add && draft === null && (
        <button
          type="button"
          className="btn btn-secondary mt-4"
          onClick={() => setDraft(blank(defaultYearId))}
        >
          {copy["add"] ?? ""}
        </button>
      )}

      {draft !== null && (
        <div className="mt-6 border-t border-border pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <SelectField
              id="event-year"
              label={copy["year"] ?? ""}
              value={draft.academicYearId}
              placeholder={copy["selectYear"] ?? ""}
              options={yearOptions}
              onChange={(academicYearId) => setDraft({ ...draft, academicYearId })}
              error={issueFor(runner.issues, "values.academicYearId")}
            />
            <SelectField
              id="event-type"
              label={copy["eventType"] ?? ""}
              value={draft.calendarEventTypeId}
              placeholder={copy["selectType"] ?? ""}
              options={eventTypes.map((type) => ({ code: type.id, label: type.label }))}
              onChange={(calendarEventTypeId) =>
                setDraft({ ...draft, calendarEventTypeId })
              }
              error={issueFor(runner.issues, "values.calendarEventTypeId")}
            />
            <TextField
              id="event-starts"
              label={copy["eventStartsOn"] ?? ""}
              type="date"
              value={draft.startsOn}
              onChange={(startsOn) => setDraft({ ...draft, startsOn })}
              error={issueFor(runner.issues, "values.startsOn")}
            />
            <TextField
              id="event-ends"
              label={copy["eventEndsOn"] ?? ""}
              type="date"
              value={draft.endsOn}
              onChange={(endsOn) => setDraft({ ...draft, endsOn })}
              hint={copy["calendarNote"]}
              error={issueFor(runner.issues, "values.endsOn")}
            />
          </div>

          <div className="mt-4">
            <DualLocaleField
              name="eventTitle"
              label={copy["eventTitle"] ?? ""}
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
              name="eventDescription"
              label={copy["eventDescription"] ?? ""}
              value={draft.description}
              onChange={(description) => setDraft({ ...draft, description })}
              requiredMessage={copy["requiredMessage"] ?? ""}
              englishMissingLabel={copy["englishMissing"] ?? ""}
              banglaLabel={copy["banglaLabel"] ?? ""}
              englishLabel={copy["englishLabel"] ?? ""}
              requiredLabel={copy["optionalLabel"] ?? ""}
              optionalLabel={copy["optionalLabel"] ?? ""}
            />
          </div>

          <div className="mt-4">
            <CheckboxField
              id="event-active"
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
            canSave={complete}
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
          await runner.run(
            deleteCalendarEventAction,
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

function labelFor(options: readonly LookupView[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? `#${id}`;
}

/** An empty optional string is a null column, not an empty one. */
function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function toDraft(event: CalendarEventView): Draft {
  return {
    id: event.id,
    academicYearId: event.academicYearId,
    calendarEventTypeId: event.calendarEventTypeId,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    isActive: event.isActive,
    title: event.title,
    description: event.description,
  };
}
