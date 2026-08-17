/**
 * The maintenance screen (T-090), shown when `maintenanceMode()` is on.
 *
 * ## Both languages at once, on purpose
 *
 * Every other public surface picks a locale from the URL. This one does not, and
 * the reason is that maintenance mode is exactly the state in which locale
 * resolution is least trustworthy: it is turned on during a content load (T-130)
 * or a go-live (T-132), it may be served for a URL that does not resolve to a
 * page at all, and the message has to work if it is the only thing that renders.
 *
 * It is also two short sentences. Showing both is cheaper than being wrong, and a
 * bilingual school notice is what a parent would expect to see on the door.
 *
 * Each block carries its own `lang`, so a screen reader switches pronunciation
 * between them rather than reading Bangla with English phonetics (§A-7.3 applies
 * the same attribute to fallback text for the same reason).
 *
 * ## Not yet wired to anything
 *
 * The flag and this screen exist and are tested; **nothing renders it yet**. A
 * site-wide gate has to live in the public layout or in the middleware, and both
 * belong to other cards — the layout is T-080's file and this card may not touch
 * it, and the middleware is T-041's. This is written up in PENDING-COMMIT.md and
 * wants a task id rather than a quiet expansion of this one.
 */

import { t } from "@/lib/i18n";
import { LOCALES, directionForLocale, type Locale } from "@/lib/locale";

/**
 * The second line, per locale. It is not in `src/i18n/{bn,en}.json` because that
 * file is T-030's and is in no M6 card's Files list; `public.states.maintenanceTitle`
 * already exists there and is used for the heading above it.
 */
const BODY: Readonly<Record<Locale, string>> = {
  bn: "ওয়েবসাইটে কিছু কাজ চলছে। কিছুক্ষণ পর আবার চেষ্টা করুন। জরুরি প্রয়োজনে সরাসরি স্কুল অফিসে যোগাযোগ করুন।",
  en: "The website is being updated. Please try again shortly. For anything urgent, please contact the school office directly.",
};

export function MaintenanceNotice() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-16 text-center sm:px-6">
      {LOCALES.map((locale) => (
        <section
          key={locale}
          lang={locale}
          dir={directionForLocale(locale)}
          className={`py-6 ${locale === "bn" ? "text-body-bn" : "text-body"}`}
        >
          {/*
            One `h1` per language rather than a heading and a subheading: neither
            translation is subordinate to the other, and marking Bangla as the
            heading and English as a caption would say the opposite.
          */}
          <h1 className="font-heading text-h2 text-primary">
            {t(locale, "public.states.maintenanceTitle")}
          </h1>
          <p className="mt-4 text-ink-muted">{BODY[locale]}</p>
        </section>
      ))}
    </main>
  );
}
