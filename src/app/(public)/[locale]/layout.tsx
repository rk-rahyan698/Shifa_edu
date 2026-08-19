/**
 * The public site shell (T-080), per ARCHITECTURE.md §A-7.1, §A-8 and ADR-005.
 *
 * ## The route shape
 *
 * ADR-005's asymmetry is `/notices` for Bangla and `/en/notices` for English,
 * with no `/bn` anywhere. An optional catch-all `[[...locale]]` expresses that
 * directly — it matches both the empty prefix and `en` — and that is what this
 * card's Files line originally named. It cannot be used: **Next 15.5 refuses any
 * child route under an optional catch-all**, and the refusal is total rather than
 * local. With one nested page present the router throws `Catch-all must be the
 * last part of the URL.` for *every* request, `/` included, and `next dev` will
 * not start. `next build` misleadingly succeeds and even lists the route; only
 * `next start` reveals the 500s. Do not take a green build as evidence here.
 *
 * The segment is therefore **required**, and the bare Bangla namespace is mapped
 * onto it by `src/middleware.ts`:
 *
 * ```
 *   public URL        internal URL             this layout sees
 *   /notices     ->   /bn/notices              locale = 'bn'
 *   /en/notices  ->   /en/notices  (as-is)     locale = 'en'
 *   /bn/notices  ->   /__invalid-locale/…      locale = '__invalid-locale' -> 404
 *   /xx/notices  ->   /bn/xx/notices           a Bangla page that does not exist
 * ```
 *
 * `/bn/*` 404s deliberately. Bangla is unprefixed, so there is exactly one URL
 * per page per locale; letting `/bn/notices` render the same content as
 * `/notices` would be a duplicate-content problem in search results rather than
 * a visible bug. The middleware sends it to a segment that is not a routed
 * locale, and the guard below is what turns that into the 404 — one place
 * decides what a locale is, and it is `isLocale`.
 *
 * Approved as `open_decisions_required_before.ADR-005_route_shape` in
 * build-state.json; the card carries it on its **Route shape** line.
 *
 * ## The document language (T-104)
 *
 * **This file is a root layout.** It renders `<html>` and `<body>` itself, and
 * `<html lang>` is the request's locale.
 *
 * It did not used to be. A single `src/app/layout.tsx` sat above this segment
 * with `lang="bn"` hardcoded, because a root layout cannot read a dynamic
 * segment below it — so every English page declared itself Bangla, and this
 * layout compensated by putting `lang`/`dir` on an inner `<div>`. That satisfies
 * WCAG 3.1.2 (Language of Parts) but never 3.1.1 (Language of Page): the
 * document's own declared language stayed wrong, which is what a screen reader
 * picks its voice from before it reaches any wrapper. T-080 recorded it, T-100
 * was asked to fix it and could not, and PENDING-COMMIT.md routed it here.
 *
 * The fix is Next's documented one for exactly this case: **multiple root
 * layouts**. `src/app/layout.tsx` is gone, and each top-level route group owns
 * its own document — this one for the public site, `(auth)` for login and
 * password reset, `(admin)` for the panel. No URL changed: `(public)`,
 * `(auth)` and `(admin)` are route groups and contribute no path segment.
 * `unstable_rootParams()` would also have worked and is a fraction of the diff,
 * but it is deprecated on arrival in 15.5 and warns on every build, which is a
 * poor thing to hand a school to maintain.
 *
 * ## What this layout does not do
 *
 * It does not call `generateStaticParams`. The required segment makes it
 * usable again — the catch-all rejected the empty-prefix entry an unprefixed
 * locale needs (`Requested and resolved page mismatch: //notices /notices`),
 * which the `[locale]` shape never has to express — but §A-11's per-locale static
 * generation is **T-103's** card, not this one. The data read below is cached and
 * tag-invalidated regardless, so the steady state is still zero database queries
 * per request once warm.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

// Every root layout imports the stylesheet; there is no shared parent left to
// do it once (see "The document language" above).
import "@/app/globals.css";

import {
  Footer,
  type FooterChannel,
  type FooterSocial,
} from "@/components/public/Footer";
import { Header, type PublicNavItem } from "@/components/public/Header";
import { cachedRead, SITE_SETTINGS_TAG } from "@/lib/cache";
import { resolveTranslation, t, type MessageKey } from "@/lib/i18n";
import { directionForLocale, isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/**
 * The site's primary navigation, in §P-6's page order.
 *
 * Paths are unprefixed here and localized per request — the same list produces
 * `/notices` and `/en/notices` with no second copy to keep in step. Home is
 * marked `exact` because its href is a prefix of every other path.
 */
const NAV: readonly {
  key: string;
  path: string;
  labelKey: MessageKey;
  exact?: true;
}[] = [
  { key: "home", path: "/", labelKey: "common.nav.home", exact: true },
  { key: "about", path: "/about", labelKey: "common.nav.about" },
  { key: "academics", path: "/academics", labelKey: "common.nav.academics" },
  { key: "admission", path: "/admission", labelKey: "common.nav.admission" },
  { key: "faculty", path: "/faculty", labelKey: "common.nav.faculty" },
  { key: "notices", path: "/notices", labelKey: "common.nav.notices" },
  { key: "gallery", path: "/gallery", labelKey: "common.nav.gallery" },
  { key: "contact", path: "/contact", labelKey: "common.nav.contact" },
] as const;

/**
 * The public site's default document title (T-104).
 *
 * Every real page sets its own through `pageMetadata` (T-100) and overrides
 * this. It exists for the pages that do not: `not-found.tsx` renders without a
 * matched route's metadata, and before T-104 the whole application leaned on a
 * single hardcoded title in `src/app/layout.tsx`, which this file's deletion
 * removed. Without a default, those documents ship with no `<title>` at all —
 * a WCAG 2.4.2 failure and axe `document-title`.
 *
 * `readShell` is the same cached read the layout below already performs, so
 * this costs no additional query.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: segment } = await params;
  if (!isLocale(segment)) return {};
  const shell = await readShell(segment);
  return { title: shell.schoolName };
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  // A segment that is not a routed locale has no page behind it. 404 rather than
  // fall back to Bangla: a soft-404 that renders content is indexed. This is also
  // where an externally requested `/bn/*` lands, via the middleware rewrite.
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;

  const shell = await readShell(locale);

  const navItems: readonly PublicNavItem[] = NAV.map((entry) => ({
    key: entry.key,
    href: localizePath(entry.path, locale),
    label: t(locale, entry.labelKey),
    ...(entry.exact === true ? { exact: true } : {}),
  }));

  return (
    /*
      `lang` and `dir` sit on `<html>` itself (T-104). This layout is a **root
      layout** — see the "The document language" note in the header — so the
      locale that governs the whole document is finally the locale the document
      is actually written in, rather than a hardcoded `bn` with a corrected
      wrapper underneath it.

      The type-scale class stays explicit: `globals.css` sets Bangla's
      17px/1.75 floor through `html:lang(bn)`, which now matches only on
      genuinely Bangla documents, and naming the scale keeps English at its own
      16px/1.6 metrics (design-system.md §3.4).
    */
    <html lang={locale} dir={directionForLocale(locale)}>
      <body className={`flex min-h-screen flex-col bg-surface ${bodyTypeClass(locale)}`}>
        {/*
        Skip link. Visible only on focus, and first in the tab order — the header
        holds eight nav links plus a switcher, and a keyboard or screen-reader user
        should not have to walk them on every page (design-system.md §9).
      */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:text-surface"
        >
          {t(locale, "common.ui.skipToContent")}
        </a>

        <Header
          schoolName={shell.schoolName}
          slogan={shell.slogan}
          homeHref={localizePath("/", locale)}
          items={navItems}
          // Unprefixed on purpose — see `HeaderProps.login`.
          login={{ href: "/login", label: t(locale, "admin.auth.signIn") }}
          language={{
            labels: {
              bn: t(locale, "common.language.bn"),
              en: t(locale, "common.language.en"),
            },
            groupLabel: t(locale, "common.language.switch"),
          }}
          navLabel={t(locale, "public.home.quickLinks")}
          openMenuLabel={t(locale, "common.ui.openMenu")}
          closeMenuLabel={t(locale, "common.ui.closeMenu")}
        />

        {/* `flex-1` so a short page still pushes the footer to the bottom rather
          than leaving a band of background under it. */}
        <main id="main" className="flex-1">
          {children}
        </main>

        <Footer
          locale={locale}
          schoolName={shell.schoolName}
          slogan={shell.slogan}
          address={shell.address}
          officeHours={shell.officeHours}
          footerNote={shell.footerNote}
          navItems={navItems}
          channels={shell.channels}
          socials={shell.socials}
        />
      </body>
    </html>
  );
}

/**
 * Bangla's body metrics do not shrink and are not the same as Latin's
 * (design-system.md §3.4), and the wrapper is where the public subtree picks
 * which set applies.
 */
function bodyTypeClass(locale: Locale): string {
  return locale === "bn" ? "text-body-bn" : "text-body";
}

/** Everything the header and footer render, resolved for one locale. */
type PublicShell = {
  schoolName: string;
  slogan: string | null;
  address: string | null;
  officeHours: string | null;
  footerNote: string | null;
  channels: readonly FooterChannel[];
  socials: readonly FooterSocial[];
};

/**
 * The shell's data, cached under `site:settings`.
 *
 * §A-6 gives `site_settings` the site-wide tag precisely because "the header,
 * footer, school name and SEO metadata render on every page" — this read is the
 * reason that tag exists, and `pathsForModule('site_settings')` revalidates `/`
 * as a *layout* to reach it. One `cachedRead` keeps §A-11's promise of zero
 * queries per request in the steady state while an office edit still appears
 * immediately, because T-038's write pipeline invalidates the tag on save.
 *
 * Only `is_public` channels are read. A channel marked private is an internal
 * number the office keeps for itself, and a footer is the least private surface
 * on the internet — so the filter is in the query rather than in the component,
 * where a later refactor could drop it.
 */
const readShell = cachedRead(
  async (locale: Locale): Promise<PublicShell> => {
    const [branding, settings, channels, socials] = await Promise.all([
      prisma.siteBranding.findUnique({
        where: { id: 1 },
        include: { siteBrandingTranslations: true },
      }),
      prisma.siteSettings.findUnique({
        where: { id: 1 },
        include: { siteSettingsTranslations: true },
      }),
      prisma.contactChannel.findMany({
        where: { isPublic: true, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { contactChannelTranslations: true },
      }),
      prisma.socialLink.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { platformCode: "asc" }],
      }),
    ]);

    const brandingRows = branding?.siteBrandingTranslations ?? [];
    const settingsRows = settings?.siteSettingsTranslations ?? [];

    return {
      // The school's name is the one field with no reasonable absence. It falls
      // back to Bangla like any other content (§A-7.3) and, if even that is
      // missing, to the empty string — the header renders a nameless wordmark
      // rather than inventing a name (global rule 5). T-113's content gate is
      // what refuses to launch in that state.
      schoolName: text(locale, brandingRows, (row) => row.schoolName) ?? "",
      slogan: text(locale, settingsRows, (row) => row.slogan),
      address: text(locale, settingsRows, (row) => row.address),
      officeHours: text(locale, settingsRows, (row) => row.officeHours),
      footerNote: text(locale, settingsRows, (row) => row.footerNote),
      channels: channels.map((channel) => ({
        key: String(channel.id),
        typeCode: channel.channelTypeCode,
        label:
          text(locale, channel.contactChannelTranslations, (row) => row.label) ??
          channel.channelTypeCode,
        value: channel.value,
      })),
      socials: socials.map((social) => ({
        key: String(social.id),
        // A platform's name is a proper noun and there is no
        // `social_platform_translations` table to read it from, so it is derived
        // from the code. `linkedin` becomes `Linkedin`, which is not the brand's
        // own casing — worth a lookup table when a card owns social display.
        label: social.platformCode.charAt(0).toUpperCase() + social.platformCode.slice(1),
        url: social.url,
      })),
    };
  },
  { name: "public:shell", tags: [SITE_SETTINGS_TAG] },
);

/**
 * One translatable column, resolved through §A-7.3's fallback and normalized to
 * `string | null`.
 *
 * `null` is what tells the header and footer to render nothing at all, which is
 * why every absence — no row, a NULL column, a whitespace-only string — has to
 * collapse to the same value. `resolveTranslation` already treats blank as
 * missing, so an office that clears a field gets the field removed rather than an
 * empty line where it used to be.
 */
function text<Row extends { localeCode: string }>(
  locale: Locale,
  rows: readonly Row[],
  pick: (row: Row) => string | null,
): string | null {
  const values: Partial<Record<Locale, string | null>> = {};
  for (const row of rows) {
    if (row.localeCode === "bn" || row.localeCode === "en") {
      values[row.localeCode] = pick(row);
    }
  }
  return resolveTranslation(locale, values).value;
}
