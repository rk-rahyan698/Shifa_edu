/**
 * SEO metadata, hreflang and structured data (T-100) — ARCHITECTURE.md §A-7.1,
 * §B-6 (`pages` / `page_translations`), PRODUCT-SPEC.md §P-9.
 *
 * ## The one rule this file exists to keep
 *
 * **`hreflang` never points two locales at one URL.** That was the defect
 * AUDIT B-3 found in the cookie-based scheme, and it is the card's Contract.
 * ADR-005's asymmetry — Bangla unprefixed at `/notices`, English at
 * `/en/notices`, `/bn/*` a 404 — is what makes distinct URLs possible, and it
 * is also what makes them easy to get quietly wrong: an alternates map built by
 * hand tends to emit `/` for both locales on the home page, which is a single
 * URL claiming to be two languages. Every alternates map here is built by
 * `alternatePaths` in `src/lib/locale.ts`, the same function the language
 * switcher uses, so the switcher and the `<link rel="alternate">` tags cannot
 * disagree. `assertDistinct` below turns a regression into a thrown error at
 * render time rather than a ranking problem discovered in six months.
 *
 * ## Where a page's title actually comes from
 *
 * §B-6 gives every page a row in `pages` and one `page_translations` row per
 * locale, holding `meta_title`, `meta_description` and an optional OG image.
 * That table is the school's copy and it is the source of truth for the eight
 * routed pages. Pages with no row — the three Academics sub-pages and the two
 * legal pages — compose a title from the nav label instead (§A-7.2's "static UI
 * strings" half, `src/i18n/*.json`), because inventing a description for them
 * would be inventing content about the school (global rule 5).
 *
 * ## Placeholders are emitted verbatim, on purpose
 *
 * `page_translations.meta_title` is NOT NULL and the seed fills it with the
 * literal `[[CONTENT REQUIRED — DO NOT PUBLISH]]`. This file does **not**
 * substitute a friendly title for it. The project has decided this twice
 * already — `safe-html.ts` keeps the marker visible in rendered rich text, and
 * T-081/T-082 render placeholder-marked sections rather than hide them — for
 * the reason that a marker nobody can see is a marker nobody replaces. T-113's
 * gate is what refuses to launch while one is present. The one place the marker
 * *does* change behaviour is the sitemap: an English page whose metadata is
 * still a placeholder is not advertised to a crawler (§A-7.3's last row).
 *
 * SEO only, per the card's Stop line. The `<html lang>` attribute on the root
 * layout is still hardcoded `bn` — `src/app/layout.tsx` is not in this card's
 * Files list and the public subtree already declares `lang`/`dir` on its own
 * wrapper (T-080), which is where a screen reader reads it from.
 */

import type { Metadata } from "next";

import { cachedRead, SITE_SETTINGS_TAG } from "@/lib/cache";
import { env } from "@/lib/env";
import { resolveTranslation, t, type MessageKey } from "@/lib/i18n";
import {
  alternatePaths,
  DEFAULT_LOCALE,
  localizePath,
  LOCALES,
  type Locale,
} from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/storage";

/**
 * The literal §A-3.1 marker's prefix.
 *
 * Duplicated from `src/components/admin/DashboardWidgets.tsx`, which is an
 * admin Client Component this file must not pull into the public tree, and from
 * `prisma/seed.ts`, which is a build-time script. Matching on the **prefix** is
 * what the dashboard's freshness widget and the seed both do, so a marker with
 * a trailing note stays detected.
 */
export const PLACEHOLDER_PREFIX = "[[CONTENT REQUIRED";

/** Text a human actually wrote: present, not blank, and not placeholder-marked. */
export function isRealContent(value: string | null | undefined): value is string {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== "" && !trimmed.startsWith(PLACEHOLDER_PREFIX);
}

/** The site's absolute origin. `env.ts` already refuses a trailing slash. */
export const SITE_ORIGIN = env.NEXT_PUBLIC_SITE_URL;

/**
 * An absolute URL for a site-relative path.
 *
 * Canonical tags, `hreflang` alternates and sitemap entries must all be
 * absolute — a relative `hreflang` is ignored by every crawler — and building
 * them here rather than relying on Next's `metadataBase` keeps the origin in
 * one place. `metadataBase` lives on the root layout, which this card may not
 * touch.
 */
export function absoluteUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`;
}

/** The eight pages §B-6's `pages` table carries a row for. */
export const SEO_PAGE_CODES = [
  "home",
  "about",
  "academics",
  "admission",
  "faculty",
  "notices",
  "gallery",
  "contact",
] as const;

export type SeoPageCode = (typeof SEO_PAGE_CODES)[number];

/**
 * Canonical + `hreflang` alternates for one locale's view of a path.
 *
 * `alternatePaths` returns every routed locale plus `x-default` → Bangla
 * (§A-7.1). Next renders each key as `<link rel="alternate" hreflang="…">` and
 * accepts `x-default` as a key like any other.
 *
 * The alternates are **reciprocal by construction**: every locale's page emits
 * the same map, so `/` and `/en` name each other rather than each naming only
 * itself. That reciprocity is what Google requires before it will honour the
 * annotation at all.
 */
export function alternatesFor(
  unprefixedPath: string,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  const paths = alternatePaths(unprefixedPath);
  assertDistinct(unprefixedPath, paths);

  const languages: Record<string, string> = {};
  for (const [key, path] of Object.entries(paths)) {
    languages[key] = absoluteUrl(path);
  }

  return {
    canonical: absoluteUrl(localizePath(unprefixedPath, locale)),
    languages,
  };
}

/**
 * Refuses an alternates map in which two *languages* share a URL.
 *
 * `x-default` is excluded from the check because it is not a language: §A-7.1
 * points it at Bangla deliberately, so `x-default` and `bn` are the same URL by
 * design. Two real locales sharing one is the AUDIT B-3 defect, and it throws.
 *
 * This can only fire if `prefixForLocale` is changed to give two locales the
 * same prefix, which is exactly the change that would be made without thinking
 * about search results.
 */
function assertDistinct(path: string, alternates: Record<string, string>): void {
  const seen = new Map<string, string>();

  for (const locale of LOCALES) {
    const url = alternates[locale];
    if (url === undefined) continue;
    const other = seen.get(url);
    if (other !== undefined) {
      throw new Error(
        `hreflang for '${path}' points both '${other}' and '${locale}' at '${url}'. ` +
          `Every locale must have a distinct URL (ARCHITECTURE.md §A-7.1, AUDIT B-3).`,
      );
    }
    seen.set(url, locale);
  }
}

/** Open Graph's locale identifiers. Not the same spelling as BCP-47. */
const OG_LOCALES: Readonly<Record<Locale, string>> = {
  bn: "bn_BD",
  en: "en_GB",
};

/** The school's identity, as far as metadata is concerned. */
export type SeoBranding = {
  schoolName: string;
  /** Absolute URL of the site-wide Open Graph image, or `null` when none is set. */
  ogImageUrl: string | null;
};

/**
 * Branding for metadata, cached under `site:settings`.
 *
 * The same tag `PublicLayout.readShell` uses, and for the same reason §A-6
 * gives that tag its scope: "the header, footer, school name and SEO metadata
 * render on every page". A branding change has to move the OG tags too.
 */
export const readSeoBranding = cachedRead(
  async (locale: Locale): Promise<SeoBranding> => {
    const branding = await prisma.siteBranding.findUnique({
      where: { id: 1 },
      include: {
        siteBrandingTranslations: true,
        ogImage: { select: { storageKey: true, deletedAt: true } },
      },
    });

    const names: Partial<Record<Locale, string>> = {};
    for (const row of branding?.siteBrandingTranslations ?? []) {
      if (row.localeCode === "bn" || row.localeCode === "en") {
        names[row.localeCode] = row.schoolName;
      }
    }

    return {
      schoolName: resolveTranslation(locale, names).value ?? "",
      ogImageUrl: assetUrl(branding?.ogImage ?? null),
    };
  },
  { name: "seo:branding", tags: [SITE_SETTINGS_TAG] },
);

/** One page's SEO row, resolved for one locale. */
export type PageSeo = {
  code: string;
  /** The Bangla (unprefixed) path — §B-6 stores it once and derives `/en`. */
  routePattern: string;
  isIndexable: boolean;
  /** `meta_title` for this locale, falling back to Bangla per §A-7.3. */
  title: string;
  description: string | null;
  ogImageUrl: string | null;
  /**
   * Whether **this locale's own** row carries a real, non-placeholder title.
   *
   * Distinct from `title`, which may be a Bangla fallback or a placeholder. It
   * is the sitemap's inclusion test and nothing else reads it.
   */
  hasOwnContent: boolean;
};

/**
 * Every `pages` row with its translations, resolved for one locale.
 *
 * Read as a set rather than one page at a time: `sitemap.ts` needs all of them,
 * and a per-page read would be eight cache entries per locale for a table with
 * eight rows in it. `generateMetadata` picks its own row out of the result.
 *
 * Tagged `site:settings` — §B-6 titles this section "Site Configuration & SEO"
 * and the `site_settings` module owns the whole of it, so an admin editing page
 * metadata invalidates it through `revalidateForModule('site_settings')`.
 */
export const readPageSeoSet = cachedRead(
  async (locale: Locale): Promise<readonly PageSeo[]> => {
    const pages = await prisma.page.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        pageTranslations: {
          include: { ogImage: { select: { storageKey: true, deletedAt: true } } },
        },
      },
    });

    return pages.map((page) => {
      const own = page.pageTranslations.find((row) => row.localeCode === locale);

      const titles: Partial<Record<Locale, string>> = {};
      const descriptions: Partial<Record<Locale, string | null>> = {};
      for (const row of page.pageTranslations) {
        if (row.localeCode === "bn" || row.localeCode === "en") {
          titles[row.localeCode] = row.metaTitle;
          descriptions[row.localeCode] = row.metaDescription;
        }
      }

      return {
        code: page.code,
        routePattern: page.routePattern,
        isIndexable: page.isIndexable,
        // A row is guaranteed by the NOT NULL column plus the seed; the empty
        // string is the "somebody deleted the row" floor, and composing a title
        // out of thin air here is what global rule 5 forbids.
        title: resolveTranslation(locale, titles).value ?? "",
        description: resolveTranslation(locale, descriptions).value,
        ogImageUrl: assetUrl(own?.ogImage ?? null),
        hasOwnContent: isRealContent(own?.metaTitle),
      };
    });
  },
  { name: "seo:pages", tags: [SITE_SETTINGS_TAG] },
);

/**
 * Whether a `pages` row's URL for one locale belongs in `sitemap.xml`.
 *
 * §A-7.3's last row, and the card's Verify: an English page whose own metadata
 * has not been written "is excluded from the English sitemap until translated".
 * Bangla is the required locale and is never withheld — a Bangla page whose
 * `meta_title` is still a placeholder renders real content underneath it, and
 * catching the placeholder is T-113's gate rather than the sitemap's.
 *
 * A pure function so the rule can be tested without a database; `sitemap.ts`
 * has the only call site.
 */
export function includeInSitemap(
  page: Pick<PageSeo, "isIndexable" | "hasOwnContent">,
  locale: Locale,
): boolean {
  if (!page.isIndexable) return false;
  if (locale === DEFAULT_LOCALE) return true;
  return page.hasOwnContent;
}

/** One page's SEO row, or `null` when the `pages` table has no row for it. */
export async function readPageSeo(
  code: SeoPageCode,
  locale: Locale,
): Promise<PageSeo | null> {
  const set = await readPageSeoSet(locale);
  return set.find((page) => page.code === code) ?? null;
}

/**
 * Metadata for one of the eight pages §B-6 carries a row for.
 *
 * The `pages` row is authoritative for the title, the description and the OG
 * image; `is_indexable = false` becomes `noindex, follow`, which is how a page
 * is taken out of search results without also cutting the links on it.
 *
 * A missing row is not an error — it means an admin deleted it, or a route was
 * added without one — and the page falls back to its nav label rather than
 * rendering with no `<title>` at all.
 */
export async function pageMetadata(code: SeoPageCode, locale: Locale): Promise<Metadata> {
  const [page, branding] = await Promise.all([
    readPageSeo(code, locale),
    readSeoBranding(locale),
  ]);

  const path = page?.routePattern ?? `/${code}`;
  const fallbackTitle = compose(t(locale, navKey(code)), branding.schoolName);

  return buildMetadata({
    locale,
    path,
    title: isBlank(page?.title) ? fallbackTitle : (page as PageSeo).title,
    description: page?.description ?? null,
    imageUrl: page?.ogImageUrl ?? branding.ogImageUrl,
    schoolName: branding.schoolName,
    indexable: page?.isIndexable ?? true,
  });
}

/**
 * Metadata for a route with no `pages` row — the Academics sub-pages and the
 * two legal pages.
 *
 * `title` names a string in `src/i18n/*.json`, which §A-7.2 classes as a static
 * UI string rather than content. That is the whole point: the school writes the
 * eight page descriptions, and a sub-page nobody has written copy for gets its
 * own label and the school's name, never an invented sentence. `description` is
 * therefore omitted rather than guessed.
 */
export async function staticPageMetadata(options: {
  locale: Locale;
  /** The unprefixed path, e.g. `/academics/exams`. */
  path: string;
  /** A key in `src/i18n/*.json`, or a literal already resolved for this locale. */
  title: MessageKey | { literal: string };
}): Promise<Metadata> {
  const { locale, path, title } = options;
  const branding = await readSeoBranding(locale);
  const name = typeof title === "string" ? t(locale, title) : title.literal;

  return buildMetadata({
    locale,
    path,
    title: compose(name, branding.schoolName),
    description: null,
    imageUrl: branding.ogImageUrl,
    schoolName: branding.schoolName,
    indexable: true,
  });
}

/**
 * Metadata for a page whose title is a row of content rather than site config —
 * a notice, today, and whatever detail route comes after it.
 *
 * The canonical and the alternates still run through the same builder, because
 * the failure this card exists to prevent does not care whether the URL holds a
 * page or a row.
 */
export async function contentPageMetadata(options: {
  locale: Locale;
  path: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}): Promise<Metadata> {
  const branding = await readSeoBranding(options.locale);

  return buildMetadata({
    locale: options.locale,
    path: options.path,
    title: compose(options.title, branding.schoolName),
    description: options.description ?? null,
    imageUrl: options.imageUrl ?? branding.ogImageUrl,
    schoolName: branding.schoolName,
    indexable: true,
  });
}

/** The shared shape every page's metadata takes. */
function buildMetadata(options: {
  locale: Locale;
  path: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  schoolName: string;
  indexable: boolean;
}): Metadata {
  const { locale, path, title, description, imageUrl, schoolName, indexable } = options;

  return {
    title,
    ...(description === null ? {} : { description }),
    alternates: alternatesFor(path, locale),
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      url: absoluteUrl(localizePath(path, locale)),
      title,
      ...(description === null ? {} : { description }),
      ...(schoolName === "" ? {} : { siteName: schoolName }),
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other],
      ),
      // Omitted entirely when the school has uploaded no OG image. An `images`
      // key pointing at nothing is worse than its absence — a crawler renders
      // the broken reference, and §A-3.1's rule is that we do not fabricate
      // assets the school has not given us.
      ...(imageUrl === null ? {} : { images: [{ url: imageUrl }] }),
    },
  };
}

/**
 * The `EducationalOrganization` node for the home page (§P-9's JSON-LD row).
 *
 * Every field is conditional. A school that has not entered its address emits
 * no `address`; one with no social links emits no `sameAs`. Structured data is
 * a machine-readable claim about a real institution, so an invented field here
 * is a lie with better distribution than an invented paragraph — global rule 5
 * applies to it with more force, not less.
 *
 * Emitted only for the locale being rendered, with `url` pointing at that
 * locale's home page, so the Bangla and English documents do not both claim the
 * same canonical entity URL.
 */
export const readOrganizationJsonLd = cachedRead(
  async (locale: Locale): Promise<Record<string, unknown>> => {
    const [branding, settings, channels, socials, registrationIds] = await Promise.all([
      prisma.siteBranding.findUnique({
        where: { id: 1 },
        include: {
          siteBrandingTranslations: true,
          logo: { select: { storageKey: true, deletedAt: true } },
          ogImage: { select: { storageKey: true, deletedAt: true } },
        },
      }),
      prisma.siteSettings.findUnique({
        where: { id: 1 },
        include: { siteSettingsTranslations: true },
      }),
      prisma.contactChannel.findMany({
        where: { isPublic: true, isActive: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      }),
      prisma.socialLink.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { platformCode: "asc" }],
      }),
      prisma.schoolRegistrationId.findMany({
        where: { isPublic: true },
        orderBy: [{ sortOrder: "asc" }, { registrationIdTypeCode: "asc" }],
      }),
    ]);

    const names: Partial<Record<Locale, string>> = {};
    for (const row of branding?.siteBrandingTranslations ?? []) {
      if (row.localeCode === "bn" || row.localeCode === "en") {
        names[row.localeCode] = row.schoolName;
      }
    }

    const addresses: Partial<Record<Locale, string | null>> = {};
    for (const row of settings?.siteSettingsTranslations ?? []) {
      if (row.localeCode === "bn" || row.localeCode === "en") {
        addresses[row.localeCode] = row.address;
      }
    }

    const name = resolveTranslation(locale, names).value;
    const address = resolveTranslation(locale, addresses).value;
    const logoUrl = assetUrl(branding?.logo ?? null);
    const imageUrl = assetUrl(branding?.ogImage ?? null);

    // `email` and `telephone` are single-valued in schema.org, so the first
    // public channel of each kind wins — `isPrimary` is ordered first above, so
    // "first" means the one the office marked primary when they marked one.
    const telephone = channels.find((channel) =>
      ["phone", "mobile"].includes(channel.channelTypeCode),
    )?.value;
    const email = channels.find((channel) => channel.channelTypeCode === "email")?.value;

    const latitude = settings?.latitude ?? null;
    const longitude = settings?.longitude ?? null;

    return {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      ...(isRealContent(name) ? { name } : {}),
      url: absoluteUrl(localizePath("/", locale)),
      ...(logoUrl === null ? {} : { logo: logoUrl }),
      ...(imageUrl === null ? {} : { image: imageUrl }),
      ...(settings?.foundedYear === null || settings?.foundedYear === undefined
        ? {}
        : { foundingDate: String(settings.foundedYear) }),
      // Free text rather than a `PostalAddress`: §B-6 stores the address as one
      // translatable string, and splitting it into locality/region/country
      // fields would mean guessing where the commas belong.
      ...(isRealContent(address) ? { address } : {}),
      ...(telephone === undefined ? {} : { telephone }),
      ...(email === undefined ? {} : { email }),
      ...(latitude === null || longitude === null
        ? {}
        : {
            geo: {
              "@type": "GeoCoordinates",
              latitude: latitude.toString(),
              longitude: longitude.toString(),
            },
          }),
      ...(socials.length === 0 ? {} : { sameAs: socials.map((row) => row.url) }),
      ...(registrationIds.length === 0
        ? {}
        : {
            identifier: registrationIds.map((row) => ({
              "@type": "PropertyValue",
              propertyID: row.registrationIdTypeCode,
              value: row.value,
            })),
          }),
    };
  },
  { name: "seo:organization", tags: [SITE_SETTINGS_TAG] },
);

/** The payload for an inline `<script type="application/ld+json">`. */
export function jsonLdScript(data: Record<string, unknown>): string {
  // `<` is the only character that can close the script element early. Escaping
  // it as a unicode sequence keeps the JSON valid and the document unbreakable
  // by a field whose value happens to contain a tag-like string.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** A media asset's public URL, or `null` when it is absent or soft-deleted. */
function assetUrl(
  asset: { storageKey: string; deletedAt: Date | null } | null,
): string | null {
  if (asset === null || asset.deletedAt !== null) return null;
  return publicUrl(asset.storageKey);
}

/** `Page name — School name`, matching §P-9's worked example. */
function compose(pageName: string, schoolName: string): string {
  if (schoolName === "") return pageName;
  return `${pageName} — ${schoolName}`;
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === "";
}

/** The nav label for a page code — the fallback title's first half. */
function navKey(code: SeoPageCode): MessageKey {
  return `common.nav.${code}` as MessageKey;
}
