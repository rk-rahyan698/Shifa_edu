/**
 * The public About page (T-082) — ARCHITECTURE.md §B-10, §B-6,
 * PRODUCT-SPEC.md §P-6.3.
 *
 * §P-6.3's seven sections, each independently gated: history, vision &
 * mission, principal's message, registration info, managing committee,
 * achievements, curriculum highlights. **Contract:** "Placeholder-marked
 * sections are absent; sanitized rich text renders correctly" restates the
 * same "no empty shells" rule T-081 carries — a section with nothing to show
 * renders nothing, not an empty heading over blank space. A section holding
 * the literal `[[CONTENT REQUIRED — DO NOT PUBLISH]]` marker is not empty —
 * `renderableHtml`'s own note is that the marker must stay visible for review,
 * and T-113's gate is what refuses to launch on it, not this page.
 *
 * The schema (§B-10) carries no `publish_consent_at` column on `about_content`
 * itself — unlike `committee_members`, `gallery_photos` and `faculty`, which
 * each have one and are filtered on it below. Where ARCHITECTURE.md and
 * PRODUCT-SPEC.md disagree, ARCHITECTURE.md wins (global rule), so the
 * principal's photo and message render whenever the school has entered them,
 * the same as any other `about_content` field.
 *
 * All five reads are their own module's Files, so — like `PublicLayout`'s
 * `readShell` — the queries live here rather than in a shared repository this
 * card's Files list has no room for.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SafeHtml } from "@/components/public/SafeHtml";
import { renderableHtml } from "@/components/public/safe-html";
import { MODULE_TAGS, SITE_SETTINGS_TAG, cachedRead, localeParams } from "@/lib/cache";
import { fallbackLangAttr, resolveTranslation, t, type ResolvedText } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";
import { pageMetadata } from "@/lib/seo";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<
  Record<
    Locale,
    {
      vision: string;
      mission: string;
      registrationInfo: string;
      committee: string;
      curriculumHighlights: string;
    }
  >
> = {
  bn: {
    vision: "দৃষ্টিভঙ্গি",
    mission: "লক্ষ্য",
    registrationInfo: "নিবন্ধন তথ্য",
    committee: "পরিচালনা কমিটি",
    curriculumHighlights: "পাঠ্যক্রম বৈশিষ্ট্য",
  },
  en: {
    vision: "Vision",
    mission: "Mission",
    registrationInfo: "Registration information",
    committee: "Managing committee",
    curriculumHighlights: "Curriculum highlights",
  },
};

/**
 * §A-11: statically generated per locale, revalidated by cache tag on save
 * (T-103). `localeParams` keeps the routed locale list in `src/lib/locale.ts`.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return localeParams();
}

/** The time-based backstop. See `PUBLIC_REVALIDATE_SECONDS` for why it exists. */
export const revalidate = 3600;

/**
 * Metadata for this page comes from its `pages` row (§B-6) — the school's own
 * `meta_title` and `meta_description`, per locale. `pageMetadata` also emits the
 * canonical URL and the reciprocal `hreflang` set (T-100).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // A segment that is not a locale has no page behind it; the component below
  // calls `notFound()`. Returning empty metadata rather than throwing keeps the
  // 404 the visible failure.
  if (!isLocale(locale)) return {};
  return pageMetadata("about", locale);
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const [about, registrationIds, curriculum] = await Promise.all([
    readAboutScreen(locale),
    readRegistrationIds(locale),
    readCurriculum(locale),
  ]);

  const cleanHistory = renderableHtml(about.content.historyHtml);
  const cleanVision = renderableHtml(about.content.visionHtml);
  const cleanMission = renderableHtml(about.content.missionHtml);
  const cleanPrincipalMessage = renderableHtml(about.content.principalMessageHtml);
  const cleanCurriculum = renderableHtml(curriculum.value);

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.about.title")}
      </h1>

      {cleanHistory === null ? null : (
        <Section id="history" heading={t(locale, "public.about.history")}>
          <SafeHtml
            html={cleanHistory}
            lang={fallbackLangAttr(locale, about.content.historyLang)}
            className="prose-content"
          />
        </Section>
      )}

      {cleanVision === null && cleanMission === null ? null : (
        <Section id="mission-vision" heading={t(locale, "public.about.missionVision")}>
          {cleanVision === null ? null : (
            <div className="rounded-card bg-accent-tint p-6">
              <h3 className="font-heading text-h3 text-ink">{copy.vision}</h3>
              <blockquote className="mt-2">
                <SafeHtml
                  html={cleanVision}
                  lang={fallbackLangAttr(locale, about.content.visionLang)}
                  className="prose-content"
                />
              </blockquote>
            </div>
          )}
          {cleanMission === null ? null : (
            <div className={cleanVision === null ? "" : "mt-6"}>
              <h3 className="font-heading text-h3 text-ink">{copy.mission}</h3>
              <SafeHtml
                html={cleanMission}
                lang={fallbackLangAttr(locale, about.content.missionLang)}
                className="prose-content mt-2"
              />
            </div>
          )}
        </Section>
      )}

      {cleanPrincipalMessage === null ? null : (
        <Section
          id="principal-message"
          heading={t(locale, "public.about.principalMessage")}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            {about.content.principalPhotoUrl === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={about.content.principalPhotoUrl}
                alt={about.content.principalPhotoAlt}
                className="h-32 w-32 flex-shrink-0 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <SafeHtml
                html={cleanPrincipalMessage}
                lang={fallbackLangAttr(locale, about.content.principalMessageLang)}
                className="prose-content"
              />
              {about.content.principalName === null ? null : (
                <p
                  className="mt-4 font-heading text-h3 text-ink"
                  lang={about.content.principalNameLang}
                >
                  {about.content.principalName}
                  {about.content.principalDesignation === null ? null : (
                    <span
                      className="block text-body text-ink-muted"
                      lang={about.content.principalDesignationLang}
                    >
                      {about.content.principalDesignation}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </Section>
      )}

      {registrationIds.length === 0 ? null : (
        <Section id="registration" heading={copy.registrationInfo}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {registrationIds.map((row) => (
              <div
                key={row.id}
                className="flex justify-between gap-4 border-b border-border pb-2"
              >
                <dt lang={row.labelLang} className="text-body text-ink-muted">
                  {row.label}
                </dt>
                <dd className="text-body font-semibold text-ink">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {about.committee.length === 0 ? null : (
        <Section id="committee" heading={copy.committee}>
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {about.committee.map((member) => (
              <li key={member.id} className="flex items-center gap-4">
                {member.photoUrl === null ? (
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent-tint font-heading text-h3 text-primary"
                  >
                    {member.name.slice(0, 1)}
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.photoUrl}
                    alt=""
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p lang={member.nameLang} className="font-semibold text-ink">
                    {member.name}
                  </p>
                  <p
                    lang={member.designationLang}
                    className="text-caption text-ink-muted"
                  >
                    {member.designation}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {about.achievements.length === 0 ? null : (
        <Section id="achievements" heading={t(locale, "public.about.achievements")}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {about.achievements.map((achievement) => (
              <li key={achievement.id} className="card card-accent-teal">
                {achievement.year === null ? null : (
                  <p className="text-caption font-semibold text-teal">
                    {achievement.year}
                  </p>
                )}
                <p
                  lang={achievement.titleLang}
                  className="mt-1 font-heading text-h3 text-ink"
                >
                  {achievement.title}
                </p>
                {achievement.description === null ? null : (
                  <p
                    lang={achievement.descriptionLang}
                    className="mt-2 text-body text-ink-muted"
                  >
                    {achievement.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {cleanCurriculum === null ? null : (
        <Section id="curriculum" heading={copy.curriculumHighlights}>
          <SafeHtml
            html={cleanCurriculum}
            lang={curriculum.lang}
            className="prose-content"
          />
        </Section>
      )}
    </article>
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

// ── Read models ──────────────────────────────────────────────────────────

type AboutContentView = {
  historyHtml: string | null;
  historyLang: ResolvedText;
  visionHtml: string | null;
  visionLang: ResolvedText;
  missionHtml: string | null;
  missionLang: ResolvedText;
  principalMessageHtml: string | null;
  principalMessageLang: ResolvedText;
  principalName: string | null;
  principalNameLang: Locale | undefined;
  principalDesignation: string | null;
  principalDesignationLang: Locale | undefined;
  principalPhotoUrl: string | null;
  principalPhotoAlt: string;
};

type CommitteeMemberView = {
  id: string;
  name: string;
  nameLang: Locale | undefined;
  designation: string;
  designationLang: Locale | undefined;
  photoUrl: string | null;
};

type AchievementView = {
  id: string;
  year: string | null;
  title: string;
  titleLang: Locale | undefined;
  description: string | null;
  descriptionLang: Locale | undefined;
};

type AboutScreen = {
  content: AboutContentView;
  committee: readonly CommitteeMemberView[];
  achievements: readonly AchievementView[];
};

const readAboutScreen = cachedRead(
  async (locale: Locale): Promise<AboutScreen> => {
    const [content, committee, achievements] = await Promise.all([
      prisma.aboutContent.findUnique({
        where: { id: 1 },
        include: {
          aboutContentTranslations: true,
          principalPhoto: { include: { mediaAssetTranslations: true } },
        },
      }),
      // `is_active = FALSE OR publish_consent_at IS NOT NULL` (ck_committee_
      // publish_consent) means `isActive: true` already guarantees consent.
      prisma.committeeMember.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          committeeMemberTranslations: true,
          photo: { include: { mediaAssetTranslations: true } },
        },
      }),
      prisma.achievement.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { achievementTranslations: true },
      }),
    ]);

    const rows = content?.aboutContentTranslations ?? [];
    const history = resolveField(rows, locale, (row) => row.historyHtml);
    const vision = resolveField(rows, locale, (row) => row.visionHtml);
    const mission = resolveField(rows, locale, (row) => row.missionHtml);
    const principalMessage = resolveField(
      rows,
      locale,
      (row) => row.principalMessageHtml,
    );
    const principalName = resolveField(rows, locale, (row) => row.principalName);
    const principalDesignation = resolveField(
      rows,
      locale,
      (row) => row.principalDesignation,
    );
    const principalPhotoAlt =
      content?.principalPhoto === null || content?.principalPhoto === undefined
        ? null
        : resolveField(
            content.principalPhoto.mediaAssetTranslations,
            locale,
            (row) => row.altText,
          );

    return {
      content: {
        historyHtml: history.value,
        historyLang: history,
        visionHtml: vision.value,
        visionLang: vision,
        missionHtml: mission.value,
        missionLang: mission,
        principalMessageHtml: principalMessage.value,
        principalMessageLang: principalMessage,
        principalName: principalName.value,
        principalNameLang: fallbackLangAttr(locale, principalName),
        principalDesignation: principalDesignation.value,
        principalDesignationLang: fallbackLangAttr(locale, principalDesignation),
        principalPhotoUrl:
          content?.principalPhoto === null || content?.principalPhoto === undefined
            ? null
            : imageUrlFor(content.principalPhoto),
        principalPhotoAlt: principalPhotoAlt?.value ?? "",
      },
      committee: committee.map((member) => {
        const name = resolveField(
          member.committeeMemberTranslations,
          locale,
          (row) => row.name,
        );
        const designation = resolveField(
          member.committeeMemberTranslations,
          locale,
          (row) => row.designation,
        );
        return {
          id: String(member.id),
          name: name.value ?? "",
          nameLang: fallbackLangAttr(locale, name),
          designation: designation.value ?? "",
          designationLang: fallbackLangAttr(locale, designation),
          photoUrl: member.photo === null ? null : imageUrlFor(member.photo),
        };
      }),
      achievements: achievements.flatMap((achievement): AchievementView[] => {
        const title = resolveField(
          achievement.achievementTranslations,
          locale,
          (row) => row.title,
        );
        if (title.value === null) return [];

        const description = resolveField(
          achievement.achievementTranslations,
          locale,
          (row) => row.description,
        );

        return [
          {
            id: String(achievement.id),
            year:
              achievement.achievedYear === null ? null : String(achievement.achievedYear),
            title: title.value,
            titleLang: fallbackLangAttr(locale, title),
            description: description.value,
            descriptionLang: fallbackLangAttr(locale, description),
          },
        ];
      }),
    };
  },
  { name: "public:about:screen", tags: MODULE_TAGS.about },
);

type RegistrationIdView = {
  id: string;
  label: string;
  labelLang: Locale | undefined;
  value: string;
};

const readRegistrationIds = cachedRead(
  async (locale: Locale): Promise<readonly RegistrationIdView[]> => {
    const rows = await prisma.schoolRegistrationId.findMany({
      where: { isPublic: true },
      orderBy: [{ sortOrder: "asc" }],
      include: {
        registrationIdType: { include: { registrationIdTypeTranslations: true } },
      },
    });

    return rows.flatMap((row): RegistrationIdView[] => {
      const label = resolveField(
        row.registrationIdType.registrationIdTypeTranslations,
        locale,
        (translation) => translation.label,
      );
      if (label.value === null) return [];

      return [
        {
          id: row.registrationIdTypeCode,
          label: label.value,
          labelLang: fallbackLangAttr(locale, label),
          value: row.value,
        },
      ];
    });
  },
  // `school_registration_ids` lives under the `site_settings` module (§A-5.2).
  { name: "public:about:registration-ids", tags: [SITE_SETTINGS_TAG] },
);

type CurriculumView = { value: string | null; lang: Locale | undefined };

const readCurriculum = cachedRead(
  async (locale: Locale): Promise<CurriculumView> => {
    const info = await prisma.academicInfo.findUnique({
      where: { id: 1 },
      include: { academicInfoTranslations: true },
    });

    const resolved = resolveField(
      info?.academicInfoTranslations ?? [],
      locale,
      (row) => row.curriculumHtml,
    );

    return { value: resolved.value, lang: fallbackLangAttr(locale, resolved) };
  },
  // Curriculum lives on `academic_info`, under the `academics` module. All
  // four of its tags are used here rather than the one that actually applies
  // (`academics:info`) because §A-6's registry names the group, not the row —
  // a slightly wider invalidation on an exams or calendar edit is a smaller
  // cost than hand-picking a string out of step with it.
  { name: "public:about:curriculum", tags: MODULE_TAGS.academics },
);

// ── Shared helpers ──────────────────────────────────────────────────────

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
 * §A-10.2: "Default is private; publication is an explicit act." A media row
 * referenced from public content is expected to live in the public bucket —
 * this is the guard against the one case where it does not.
 */
function imageUrlFor(media: { bucket: string; storageKey: string }): string | null {
  return media.bucket === "public" ? publicUrl(media.storageKey) : null;
}
