/**
 * Public: Academic calendar (T-083) — `/academics/calendar`.
 *
 * `calendar_events` for the current year, ordered by date, each tagged with
 * its `calendar_event_types` label and (when the school set one) its colour.
 * `event.description` is `multilineText` (§B-8's `validation/academics.ts`),
 * not rich text — plain interpolation with line breaks preserved, never
 * `SafeHtml`.
 */

import { notFound } from "next/navigation";

import { t } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/locale";

import { AcademicYearBanner } from "../AcademicYearBanner";
import { readCalendarEvents, readCurrentYear, type CalendarItem } from "../read";

const COPY: Readonly<Record<Locale, { yearPrefix: string }>> = {
  bn: { yearPrefix: "শিক্ষাবর্ষ" },
  en: { yearPrefix: "Academic year" },
};

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const year = await readCurrentYear(locale);
  const events = await readCalendarEvents(locale, year?.id ?? null);

  const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.academics.calendar")}
      </h1>
      <div className="mt-4">
        <AcademicYearBanner yearLabel={year?.label ?? null} prefix={copy.yearPrefix} />
      </div>

      {events.length === 0 ? null : (
        <ol className="mt-8 flex flex-col gap-3">
          {events.map((event) => (
            <EventRow key={event.id} event={event} dateFormat={dateFormat} />
          ))}
        </ol>
      )}
    </div>
  );
}

function EventRow({
  event,
  dateFormat,
}: {
  event: CalendarItem;
  dateFormat: Intl.DateTimeFormat;
}) {
  const range =
    event.endsOn === null
      ? dateFormat.format(new Date(`${event.startsOn}T00:00:00Z`))
      : `${dateFormat.format(new Date(`${event.startsOn}T00:00:00Z`))} – ${dateFormat.format(
          new Date(`${event.endsOn}T00:00:00Z`),
        )}`;

  return (
    <li className="card flex items-start gap-4">
      <span
        aria-hidden="true"
        className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-teal"
        style={
          event.typeColor === null ? undefined : { backgroundColor: event.typeColor }
        }
      />
      <div className="min-w-0">
        <p className="text-caption text-ink-muted">
          {range} · {event.typeLabel}
        </p>
        <p lang={event.titleLang} className="mt-1 font-heading text-h3 text-ink">
          {event.title}
        </p>
      </div>
    </li>
  );
}
