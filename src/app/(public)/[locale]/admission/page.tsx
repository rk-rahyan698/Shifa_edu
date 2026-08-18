/**
 * Public: Admission (T-084) — ARCHITECTURE.md §B-9, PRODUCT-SPEC.md §P-6.5.
 *
 * Status banner, process stepper, eligibility table, important dates, required
 * documents, fee table, form download, FAQ accordion.
 *
 * **Contract:** the banner shows "open" only when the cycle is open *and*
 * within dates, read through T-064's `isAdmissionOpen` and never restated
 * inline. `open.ts` is imported, not re-derived — the three columns
 * (`is_current`, `is_open`, the date window) are combined in exactly one
 * place in the whole codebase.
 *
 * **Verify:** with no cycle seeded, no open-admissions claim appears anywhere.
 * A `null` current cycle skips the banner, the stepper's cycle-scoped steps,
 * important dates and the fee table entirely — there is nothing to scope any
 * of them to. Evergreen steps, documents and FAQs are not cycle-scoped in the
 * schema and still render.
 *
 * One file, per the card's Files line — the read models live beside the page,
 * the same reading `PublicLayout`'s `readShell` and T-082's About page
 * already established.
 */

import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/public/SafeHtml";
import { cachedRead, MODULE_TAGS } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, t, type ResolvedText } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/locale";
import { isAdmissionOpen } from "@/lib/modules/admission/open";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<
  Record<
    Locale,
    {
      openBanner: string;
      closedBanner: string;
      class: string;
      age: string;
      opens: string;
      closes: string;
      examDate: string;
      mandatory: string;
      optional: string;
      currencyPrefix: string;
    }
  >
> = {
  bn: {
    openBanner: "ভর্তি চলছে",
    closedBanner: "ভর্তি বন্ধ আছে",
    class: "শ্রেণি",
    age: "বয়স",
    opens: "শুরু",
    closes: "শেষ",
    examDate: "ভর্তি পরীক্ষার তারিখ",
    mandatory: "আবশ্যক",
    optional: "ঐচ্ছিক",
    currencyPrefix: "৳",
  },
  en: {
    openBanner: "Admission is open",
    closedBanner: "Admission is closed",
    class: "Class",
    age: "Age",
    opens: "Opens",
    closes: "Closes",
    examDate: "Admission test date",
    mandatory: "Mandatory",
    optional: "Optional",
    currencyPrefix: "৳",
  },
};

export default async function AdmissionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const screen = await readAdmissionScreen(locale);

  const dateFormat = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    dateStyle: "medium",
  });

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.admission.title")}
      </h1>

      {screen.cycle === null ? null : (
        <div
          role="status"
          className={`mt-6 rounded-card border-l-rule p-4 ${
            screen.cycle.isOpen
              ? "border-l-teal bg-accent-tint text-ink"
              : "border-l-border bg-surface-alt text-ink-muted"
          }`}
        >
          <p className="font-heading text-h3">
            {screen.cycle.statusBanner ??
              (screen.cycle.isOpen ? copy.openBanner : copy.closedBanner)}
          </p>
        </div>
      )}

      {screen.steps.length === 0 ? null : (
        <Section id="how-to-apply" heading={t(locale, "public.admission.howToApply")}>
          <ol className="flex flex-col gap-4">
            {screen.steps.map((step) => (
              <li key={step.id} className="flex gap-4">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-surface">
                  {step.stepNumber}
                </span>
                <div>
                  <p className="font-semibold text-ink">{step.title}</p>
                  {step.description === null ? null : (
                    <p className="mt-1 whitespace-pre-line text-body text-ink-muted">
                      {step.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {screen.eligibility.length === 0 ? null : (
        <Section id="eligibility" heading={t(locale, "public.admission.eligibility")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left">
              <caption className="sr-only">
                {t(locale, "public.admission.eligibility")}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {copy.class}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {copy.age}
                  </th>
                </tr>
              </thead>
              <tbody>
                {screen.eligibility.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      {row.className}
                    </th>
                    <td className="py-3 pr-4">
                      {ageRange(row.minAgeYears, row.maxAgeYears)}
                      {row.note === null ? null : (
                        <span className="mt-1 block whitespace-pre-line text-caption text-ink-muted">
                          {row.note}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {screen.cycle === null || !screen.cycle.hasDates ? null : (
        <Section
          id="important-dates"
          heading={t(locale, "public.admission.importantDates")}
        >
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {screen.cycle.opensOn === null ? null : (
              <DateCell
                label={copy.opens}
                value={dateFormat.format(new Date(`${screen.cycle.opensOn}T00:00:00Z`))}
              />
            )}
            {screen.cycle.closesOn === null ? null : (
              <DateCell
                label={copy.closes}
                value={dateFormat.format(new Date(`${screen.cycle.closesOn}T00:00:00Z`))}
              />
            )}
            {screen.cycle.examDate === null ? null : (
              <DateCell
                label={copy.examDate}
                value={dateFormat.format(new Date(`${screen.cycle.examDate}T00:00:00Z`))}
              />
            )}
          </dl>
        </Section>
      )}

      {screen.documents.length === 0 ? null : (
        <Section id="documents" heading={t(locale, "public.admission.documents")}>
          <ul className="flex flex-col gap-3">
            {screen.documents.map((doc) => (
              <li key={doc.id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 rounded-btn px-2 py-0.5 text-caption font-semibold ${
                    doc.isMandatory
                      ? "bg-accent-tint text-ink"
                      : "bg-surface-alt text-ink-muted"
                  }`}
                >
                  {doc.isMandatory ? copy.mandatory : copy.optional}
                </span>
                <div>
                  <p className="text-ink">{doc.name}</p>
                  {doc.note === null ? null : (
                    <p className="whitespace-pre-line text-caption text-ink-muted">
                      {doc.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {screen.feeTypes.length === 0 || screen.feeRows.length === 0 ? null : (
        <Section id="fees" heading={t(locale, "public.admission.fees")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">{t(locale, "public.admission.fees")}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {copy.class}
                  </th>
                  {screen.feeTypes.map((feeType) => (
                    <th key={feeType.id} scope="col" className="py-2 pr-4 font-semibold">
                      {feeType.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screen.feeRows.map((row) => (
                  <tr key={row.classGradeId} className="border-b border-border">
                    <th scope="row" className="py-3 pr-4 font-normal">
                      {row.className}
                    </th>
                    {screen.feeTypes.map((feeType) => (
                      <td key={feeType.id} className="py-3 pr-4">
                        {row.cells[feeType.id] === undefined
                          ? "—"
                          : formatTaka(
                              row.cells[feeType.id]!,
                              locale,
                              copy.currencyPrefix,
                            )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {screen.cycle?.formUrl === null || screen.cycle?.formUrl === undefined ? null : (
        <p className="mt-12">
          <a href={screen.cycle.formUrl} download className="btn-primary">
            {t(locale, "common.actions.download")}
          </a>
        </p>
      )}

      {screen.faqs.length === 0 ? null : (
        <Section id="faq" heading={t(locale, "public.admission.faq")}>
          <div className="flex flex-col gap-2">
            {screen.faqs.map((faq) => (
              <details key={faq.id} className="rounded-card border border-border p-4">
                <summary className="cursor-pointer font-semibold text-ink">
                  {faq.question}
                </summary>
                <SafeHtml
                  html={faq.answerHtml}
                  lang={faq.answerLang}
                  className="prose-content mt-3"
                />
              </details>
            ))}
          </div>
        </Section>
      )}
    </article>
  );
}

function DateCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** One titled block. `id` is both the heading's anchor and its accessible name. */
function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="scroll-mt-24 font-heading text-h2 text-primary">
        {heading}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** "5 – 6" / "5" / "up to 6" from `NUMERIC(3,1)` decimal strings, or an em dash. */
function ageRange(min: string | null, max: string | null): string {
  if (min === null && max === null) return "—";
  if (min !== null && max !== null) return `${min} – ${max}`;
  return min ?? max ?? "—";
}

/**
 * `৳১,৫০০` / `৳1,500` — the integer part grouped per locale (Bangla's lakh/
 * crore grouping comes from ICU's `bn-BD` data), decimals shown only when
 * non-zero. The amount is still read and stored as a string end to end
 * (`admission/read.ts`'s note); this is display formatting, not a value the
 * page computes with.
 */
function formatTaka(amount: string, locale: Locale, prefix: string): string {
  const [wholePart = "0", fractionPart] = amount.split(".");
  const whole = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB").format(
    Number(wholePart),
  );
  const suffix =
    fractionPart !== undefined && fractionPart !== "00" ? `.${fractionPart}` : "";
  return `${prefix}${whole}${suffix}`;
}

// ── Read model ────────────────────────────────────────────────────────────

type CycleView = {
  isOpen: boolean;
  statusBanner: string | null;
  opensOn: string | null;
  closesOn: string | null;
  examDate: string | null;
  hasDates: boolean;
  formUrl: string | null;
};

type StepView = {
  id: string;
  stepNumber: number;
  title: string;
  description: string | null;
};
type EligibilityView = {
  id: string;
  className: string;
  minAgeYears: string | null;
  maxAgeYears: string | null;
  note: string | null;
};
type DocumentView = {
  id: string;
  isMandatory: boolean;
  name: string;
  note: string | null;
};
type FaqView = {
  id: string;
  question: string;
  answerHtml: string;
  answerLang: Locale | undefined;
};
type FeeTypeView = { id: string; name: string };
type FeeRowView = {
  classGradeId: string;
  className: string;
  cells: Record<string, string>;
};

type AdmissionScreen = {
  cycle: CycleView | null;
  steps: readonly StepView[];
  eligibility: readonly EligibilityView[];
  documents: readonly DocumentView[];
  faqs: readonly FaqView[];
  feeTypes: readonly FeeTypeView[];
  feeRows: readonly FeeRowView[];
};

const readAdmissionScreen = cachedRead(
  async (locale: Locale): Promise<AdmissionScreen> => {
    const cycleRow = await prisma.admissionCycle.findFirst({
      where: { isCurrent: true },
      include: { admissionCycleTranslations: true, form: true },
    });

    const [steps, eligibility, documents, faqs] = await Promise.all([
      prisma.admissionStep.findMany({
        // `undefined` is not a value Prisma can compare against — it means
        // "no filter on this field" and would match every step regardless of
        // cycle, so the two shapes are built explicitly rather than folding
        // an absent cycle id into one `OR`.
        where:
          cycleRow === null
            ? { isActive: true, admissionCycleId: null }
            : {
                isActive: true,
                OR: [{ admissionCycleId: null }, { admissionCycleId: cycleRow.id }],
              },
        orderBy: [{ stepNumber: "asc" }, { id: "asc" }],
        include: { admissionStepTranslations: true },
      }),
      prisma.admissionEligibility.findMany({
        where: { isActive: true },
        orderBy: [{ classGrade: { sortOrder: "asc" } }, { id: "asc" }],
        include: {
          classGrade: { include: { classGradeTranslations: true } },
          admissionEligibilityTranslations: true,
        },
      }),
      prisma.admissionDocument.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { admissionDocumentTranslations: true },
      }),
      prisma.admissionFaq.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { admissionFaqTranslations: true },
      }),
    ]);

    // Fees are scoped to the current cycle's own academic year — the year a
    // parent applying right now would actually be charged for — not a second,
    // independent "current year" lookup that could point somewhere else.
    const [feeTypes, feeStructures] =
      cycleRow === null
        ? [[], []]
        : await Promise.all([
            prisma.feeType.findMany({
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              include: { feeTypeTranslations: true },
            }),
            prisma.feeStructure.findMany({
              where: { academicYearId: cycleRow.academicYearId, isActive: true },
              include: {
                classGrade: { include: { classGradeTranslations: true } },
                feeItems: true,
              },
            }),
          ]);

    const cycle = toCycleView(locale, cycleRow);

    const stepViews = steps.flatMap((row): StepView[] => {
      const title = resolveField(
        row.admissionStepTranslations,
        locale,
        (entry) => entry.title,
      );
      if (title.value === null) return [];

      const description = resolveField(
        row.admissionStepTranslations,
        locale,
        (entry) => entry.description,
      );

      return [
        {
          id: String(row.id),
          stepNumber: row.stepNumber,
          title: title.value,
          description: description.value,
        },
      ];
    });

    const eligibilityViews = eligibility.flatMap((row): EligibilityView[] => {
      const className = resolveField(
        row.classGrade.classGradeTranslations,
        locale,
        (entry) => entry.name,
      );
      if (className.value === null) return [];

      const note = resolveField(
        row.admissionEligibilityTranslations,
        locale,
        (entry) => entry.note,
      );

      return [
        {
          id: String(row.id),
          className: className.value,
          minAgeYears: row.minAgeYears === null ? null : row.minAgeYears.toString(),
          maxAgeYears: row.maxAgeYears === null ? null : row.maxAgeYears.toString(),
          note: note.value,
        },
      ];
    });

    const documentViews = documents.flatMap((row): DocumentView[] => {
      const name = resolveField(
        row.admissionDocumentTranslations,
        locale,
        (entry) => entry.name,
      );
      if (name.value === null) return [];

      const note = resolveField(
        row.admissionDocumentTranslations,
        locale,
        (entry) => entry.note,
      );

      return [
        {
          id: String(row.id),
          isMandatory: row.isMandatory,
          name: name.value,
          note: note.value,
        },
      ];
    });

    const faqViews = faqs.flatMap((row): FaqView[] => {
      const question = resolveField(
        row.admissionFaqTranslations,
        locale,
        (entry) => entry.question,
      );
      const answer = resolveField(
        row.admissionFaqTranslations,
        locale,
        (entry) => entry.answer,
      );
      if (question.value === null || answer.value === null) return [];

      return [
        {
          id: String(row.id),
          question: question.value,
          answerHtml: answer.value,
          answerLang: fallbackLangAttr(locale, answer),
        },
      ];
    });

    const feeTypeViews: FeeTypeView[] = feeTypes.flatMap((row): FeeTypeView[] => {
      const name = resolveField(row.feeTypeTranslations, locale, (entry) => entry.name);
      return name.value === null ? [] : [{ id: String(row.id), name: name.value }];
    });

    const feeRowViews: FeeRowView[] = feeStructures.flatMap((structure): FeeRowView[] => {
      const className = resolveField(
        structure.classGrade.classGradeTranslations,
        locale,
        (entry) => entry.name,
      );
      if (className.value === null) return [];

      const cells: Record<string, string> = {};
      for (const item of structure.feeItems) {
        cells[String(item.feeTypeId)] = item.amount.toFixed(2);
      }

      return [
        {
          classGradeId: String(structure.classGradeId),
          className: className.value,
          cells,
        },
      ];
    });

    return {
      cycle,
      steps: stepViews,
      eligibility: eligibilityViews,
      documents: documentViews,
      faqs: faqViews,
      feeTypes: feeTypeViews,
      feeRows: feeRowViews,
    };
  },
  { name: "public:admission:screen", tags: MODULE_TAGS.admission },
);

function toCycleView(
  locale: Locale,
  row: {
    isOpen: boolean;
    opensOn: Date | null;
    closesOn: Date | null;
    examDate: Date | null;
    admissionCycleTranslations: readonly {
      localeCode: string;
      statusBanner: string | null;
    }[];
    form: { bucket: string; storageKey: string } | null;
  } | null,
): CycleView | null {
  if (row === null) return null;

  const statusBanner = resolveField(
    row.admissionCycleTranslations,
    locale,
    (entry) => entry.statusBanner,
  );

  return {
    isOpen: isAdmissionOpen({
      isOpen: row.isOpen,
      opensOn: row.opensOn,
      closesOn: row.closesOn,
    }),
    statusBanner: statusBanner.value,
    opensOn: row.opensOn === null ? null : isoDate(row.opensOn),
    closesOn: row.closesOn === null ? null : isoDate(row.closesOn),
    examDate: row.examDate === null ? null : isoDate(row.examDate),
    hasDates: row.opensOn !== null || row.closesOn !== null || row.examDate !== null,
    formUrl: row.form === null ? null : imageUrlFor(row.form),
  };
}

/** Resolves one translatable field for a locale, with the §A-7.3 fallback. */
function resolveField<Row extends { localeCode: string }>(
  rows: readonly Row[],
  locale: Locale,
  pick: (row: Row) => string | null,
): ResolvedText {
  const values: Partial<Record<Locale, string | null>> = {};
  for (const row of rows) {
    if (row.localeCode === "bn" || row.localeCode === "en") {
      values[row.localeCode] = pick(row);
    }
  }
  return resolveTranslation(locale, values);
}

/**
 * The CDN URL for a public-bucket asset, or `null` for anything else.
 *
 * §A-10.2: "Default is private; publication is an explicit act." The
 * admission form referenced from this page is expected to live in the public
 * bucket — this is the guard against the one case where it does not.
 */
function imageUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}

/** A `DATE` column as `YYYY-MM-DD`. Prisma reads it as midnight UTC. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
