/**
 * Public: Contact + inquiry form (T-088) — ARCHITECTURE.md §A-16.2, §B-13,
 * PRODUCT-SPEC.md §P-6.9.
 *
 * Contact cards from `contact_channels`, office hours, a map embed, and the
 * inquiry form. The form itself is a plain `<form method="post"
 * action="/api/contact">` — no client JavaScript, no separate component file,
 * which is what let this card's Files line stay at exactly the page and the
 * route it posts to. `/api/contact/route.ts` does the validating, rate
 * limiting and persisting; this file only renders the result it redirects
 * back with (`?sent=1` / `?error=…`).
 *
 * **Contract:** the consent line states what is collected, why, and the
 * 12-month retention (§A-16.2 item 2, §B-13's `purge_after` column), and
 * links to the privacy policy.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cachedRead, SITE_SETTINGS_TAG } from "@/lib/cache";
import { resolveTranslation, t } from "@/lib/i18n";
import { isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/seo";

/** Page-specific copy not already in `src/i18n/*.json`. */
const COPY: Readonly<
  Record<
    Locale,
    {
      consentText: string;
      consentCheckbox: string;
      sentBanner: string;
      validationError: string;
      rateLimitedError: string;
      optional: string;
    }
  >
> = {
  bn: {
    consentText:
      "আপনার নাম, মোবাইল নম্বর ও বার্তাটি আপনার অনুসন্ধানের উত্তর দেওয়ার উদ্দেশ্যে সংরক্ষণ করা হবে এবং ১২ মাস পর স্বয়ংক্রিয়ভাবে মুছে ফেলা হবে।",
    consentCheckbox: "আমি উপরের শর্তে সম্মত",
    sentBanner: "ধন্যবাদ, আপনার বার্তা পাওয়া গেছে। আমরা শীঘ্রই যোগাযোগ করব।",
    validationError: "অনুগ্রহ করে দেওয়া তথ্য যাচাই করে আবার চেষ্টা করুন।",
    rateLimitedError: "অনেক বেশি চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন।",
    optional: "ঐচ্ছিক",
  },
  en: {
    consentText:
      "Your name, phone number and message will be stored to respond to your inquiry, and automatically deleted after 12 months.",
    consentCheckbox: "I agree to the above",
    sentBanner:
      "Thank you — your message has been received. We will get back to you soon.",
    validationError: "Please check the details you entered and try again.",
    rateLimitedError: "Too many attempts. Please try again shortly.",
    optional: "Optional",
  },
};

/**
 * No `generateStaticParams` and no `revalidate` here, deliberately (T-103).
 *
 * This page reads `searchParams`, which opts it into dynamic rendering: Next
 * cannot prerender a route whose output depends on a query string it has not
 * seen. A `revalidate` export on a dynamically rendered page is inert, and
 * `generateStaticParams` would advertise a static generation that never happens.
 *
 * §A-11's "0 DB queries on a cache hit" still holds, and holds through the
 * **data** cache rather than the full-route cache: every read below is wrapped
 * in `cachedRead` and tagged, so a request re-renders the markup but answers
 * from cached rows without touching Postgres. The rendering cost is real; the
 * database cost is not.
 */

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
  return pageMetadata("contact", locale);
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale: segment } = await params;
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  const { sent, error } = await searchParams;
  const info = await readContactScreen(locale);

  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">
        {t(locale, "public.contact.title")}
      </h1>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div>
          {info.channels.length === 0 ? null : (
            <dl className="flex flex-col gap-4">
              {info.channels.map((channel) => (
                <div key={channel.key}>
                  <dt className="text-caption text-ink-muted">{channel.label}</dt>
                  <dd className="text-body font-semibold text-ink">
                    <ChannelValue typeCode={channel.typeCode} value={channel.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {info.address === null ? null : (
            <div className="mt-4">
              <p className="text-caption text-ink-muted">
                {t(locale, "public.contact.address")}
              </p>
              <p className="whitespace-pre-line text-body font-semibold text-ink">
                {info.address}
              </p>
            </div>
          )}

          {info.officeHours === null ? null : (
            <div className="mt-4">
              <p className="text-caption text-ink-muted">
                {t(locale, "public.contact.officeHours")}
              </p>
              <p className="whitespace-pre-line text-body font-semibold text-ink">
                {info.officeHours}
              </p>
            </div>
          )}

          {info.googleMapEmbedUrl === null ? null : (
            <div className="mt-6 overflow-hidden rounded-card border border-border">
              <iframe
                src={info.googleMapEmbedUrl}
                title={t(locale, "public.contact.address")}
                className="h-64 w-full"
                loading="lazy"
              />
            </div>
          )}
        </div>

        <div>
          {sent === "1" ? (
            <p role="status" className="callout mb-6">
              {copy.sentBanner}
            </p>
          ) : null}

          {error === "validation" ? (
            <p role="alert" className="field-error mb-6">
              {copy.validationError}
            </p>
          ) : null}

          {error === "rate_limited" ? (
            <p role="alert" className="field-error mb-6">
              {copy.rateLimitedError}
            </p>
          ) : null}

          <form method="post" action="/api/contact" className="flex flex-col gap-4">
            <input type="hidden" name="locale" value={locale} />

            <div>
              <label className="label" htmlFor="contact-name">
                {t(locale, "public.contact.formName")}
              </label>
              <input
                className="input"
                id="contact-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
              />
            </div>

            <div>
              <label className="label" htmlFor="contact-phone">
                {t(locale, "public.contact.formPhone")}
              </label>
              <input
                className="input"
                id="contact-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="contact-email">
                {t(locale, "public.contact.formEmail")}{" "}
                <span className="font-normal text-ink-muted">({copy.optional})</span>
              </label>
              <input
                className="input"
                id="contact-email"
                name="email"
                type="email"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label" htmlFor="contact-message">
                {t(locale, "public.contact.formMessage")}
              </label>
              <textarea
                className="input"
                id="contact-message"
                name="message"
                rows={5}
                required
                minLength={10}
              />
            </div>

            <div>
              <p id="contact-consent" className="field-hint">
                {copy.consentText}{" "}
                <Link href={localizePath("/privacy", locale)} className="link">
                  {t(locale, "public.footer.privacy")}
                </Link>
              </p>
              <label className="mt-2 flex items-start gap-2 text-body text-ink">
                <input
                  type="checkbox"
                  name="consentGiven"
                  required
                  aria-describedby="contact-consent"
                  className="mt-1"
                />
                {copy.consentCheckbox}
              </label>
            </div>

            <button type="submit" className="btn-primary self-start">
              {t(locale, "public.contact.formSubmit")}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function ChannelValue({ typeCode, value }: { typeCode: string; value: string }) {
  if (typeCode === "phone" || typeCode === "mobile" || typeCode === "fax") {
    return (
      <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="link">
        {value}
      </a>
    );
  }
  if (typeCode === "email") {
    return (
      <a href={`mailto:${value}`} className="link">
        {value}
      </a>
    );
  }
  if (typeCode === "whatsapp") {
    return (
      <a
        href={`https://wa.me/${value.replace(/[^\d]/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="link"
      >
        {value}
      </a>
    );
  }
  return <>{value}</>;
}

// ── Read model ────────────────────────────────────────────────────────────

type ChannelView = { key: string; typeCode: string; label: string; value: string };

type ContactScreen = {
  channels: readonly ChannelView[];
  address: string | null;
  officeHours: string | null;
  googleMapEmbedUrl: string | null;
};

const readContactScreen = cachedRead(
  async (locale: Locale): Promise<ContactScreen> => {
    const [channels, settings] = await Promise.all([
      prisma.contactChannel.findMany({
        where: { isPublic: true, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { contactChannelTranslations: true },
      }),
      prisma.siteSettings.findUnique({
        where: { id: 1 },
        include: { siteSettingsTranslations: true },
      }),
    ]);

    const settingsRows = settings?.siteSettingsTranslations ?? [];

    return {
      channels: channels.map((channel) => ({
        key: String(channel.id),
        typeCode: channel.channelTypeCode,
        label:
          text(locale, channel.contactChannelTranslations, (row) => row.label) ??
          channel.channelTypeCode,
        value: channel.value,
      })),
      address: text(locale, settingsRows, (row) => row.address),
      officeHours: text(locale, settingsRows, (row) => row.officeHours),
      googleMapEmbedUrl: settings?.googleMapEmbedUrl ?? null,
    };
  },
  // `contact_channels` and `site_settings` are both admin-edited under the
  // `site_settings` module (§A-5.2) — the same tag `PublicLayout`'s
  // `readShell` uses for the same two tables.
  { name: "public:contact:screen", tags: [SITE_SETTINGS_TAG] },
);

/** Resolves one translatable field for a locale, with the §A-7.3 fallback. */
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
