/**
 * The cookie notice (T-089), per ARCHITECTURE.md §A-16.2 requirement 1.
 *
 * ## It describes the cookie the site actually sets
 *
 * The card asks for "a cookie notice for the language-preference cookie". **There
 * is no language-preference cookie**, and there is not supposed to be one: ADR-005
 * puts the locale in the URL, and T-080's Contract makes the language switcher two
 * plain links precisely so that a shared `/en/…` address opens in English for
 * everyone. `src/lib/cookies.ts` defines exactly one cookie, `shifa_session`, and
 * it is the admin sign-in cookie.
 *
 * So the notice describes that one, says in as many words that language lives in
 * the URL rather than in a cookie, and states that nothing analytical or
 * advertising-related is set at all. A privacy notice describing a cookie that
 * does not exist is a privacy notice that is wrong, and being wrong in the
 * reassuring direction is still wrong.
 *
 * ## Notice, not a consent banner
 *
 * No banner, no dismiss button, no consent state. A strictly necessary sign-in
 * cookie does not need consent to be set, and a banner asking for it would train
 * visitors to dismiss a question that was never real. Everything here is a
 * statement of fact, rendered as part of the privacy policy at `#cookies`.
 *
 * Every value below is read from the code that sets the cookie — the name from
 * `SESSION_COOKIE`, the lifetimes from `IDLE_TIMEOUT_HOURS` and
 * `ABSOLUTE_TIMEOUT_HOURS` — so the notice cannot drift away from the behaviour
 * it documents. If someone shortens the session, this page shortens with it.
 */

import { SESSION_COOKIE } from "@/lib/cookies";
import type { Locale } from "@/lib/locale";
import { ABSOLUTE_TIMEOUT_HOURS, IDLE_TIMEOUT_HOURS } from "@/lib/session";

type CookieNoticeCopy = {
  heading: string;
  intro: string;
  columns: readonly [string, string, string, string];
  purpose: string;
  lifetime: string;
  language: string;
  none: string;
};

const COPY: Readonly<Record<Locale, CookieNoticeCopy>> = {
  bn: {
    heading: "কুকি",
    intro:
      "এই ওয়েবসাইট একটি মাত্র কুকি ব্যবহার করে, এবং সেটি কেবল স্কুলের কর্মীরা প্রশাসনিক প্যানেলে সাইন ইন করলে তৈরি হয়। সাধারণ দর্শকের ব্রাউজারে কোনো কুকি রাখা হয় না।",
    columns: ["কুকির নাম", "কী কাজে লাগে", "কত সময় থাকে", "ধরন"],
    purpose:
      "সাইন ইন করা কর্মীকে চিনতে রাখে, যাতে প্রতিটি পাতায় আবার পাসওয়ার্ড দিতে না হয়।",
    lifetime: `নিষ্ক্রিয় থাকলে ${IDLE_TIMEOUT_HOURS} ঘণ্টা পর, এবং যেকোনো অবস্থায় ${ABSOLUTE_TIMEOUT_HOURS} ঘণ্টা পর মেয়াদ শেষ হয়। সাইন আউট করলে সঙ্গে সঙ্গে মুছে যায়।`,
    language:
      "ভাষা কোনো কুকিতে রাখা হয় না। ঠিকানাতেই ভাষা নির্ধারিত হয় — বাংলার জন্য /notices, ইংরেজির জন্য /en/notices। তাই একটি লিঙ্ক যে ভাষায় খোলা হয়, শেয়ার করলে অন্যের কাছেও সেই ভাষাতেই খোলে।",
    none: "কোনো বিশ্লেষণ, বিজ্ঞাপন বা তৃতীয় পক্ষের ট্র্যাকিং কুকি ব্যবহার করা হয় না।",
  },
  en: {
    heading: "Cookies",
    intro:
      "This website sets a single cookie, and only when a member of school staff signs in to the admin panel. Nothing is stored in an ordinary visitor's browser.",
    columns: ["Cookie", "What it does", "How long it lasts", "Type"],
    purpose:
      "Keeps a signed-in staff member recognised, so they are not asked for a password on every page.",
    lifetime: `Expires after ${IDLE_TIMEOUT_HOURS} hours of inactivity, and after ${ABSOLUTE_TIMEOUT_HOURS} hours in any case. Signing out deletes it immediately.`,
    language:
      "Language is not stored in a cookie. The address decides it — /notices for Bangla, /en/notices for English — so a link opens in the language it was shared in, for everyone.",
    none: "No analytics, advertising or third-party tracking cookies are used.",
  },
};

/** The word for a strictly necessary cookie, in each locale. */
const STRICTLY_NECESSARY: Readonly<Record<Locale, string>> = {
  bn: "অপরিহার্য",
  en: "Strictly necessary",
};

export function CookieNotice({ locale }: { locale: Locale }) {
  const copy = COPY[locale];

  return (
    <section aria-labelledby="cookies" className="mt-12">
      <h2 id="cookies" className="scroll-mt-24 font-heading text-h2 text-primary">
        {copy.heading}
      </h2>
      <p className="mt-4">{copy.intro}</p>

      {/*
        A table rather than prose because it answers four questions per cookie and
        a reader is usually looking for one of them. It scrolls inside its own
        container: four columns of Bangla will not fit 360px, and a page that
        scrolls sideways as a whole is the §A-8.3 failure this avoids.
      */}
      {/* Focusable for the same reason the privacy page's inventory table is
          (T-104): a container that scrolls but cannot be focused is unreachable
          by keyboard, since there is no scrollbar to drag. No `role="region"`
          here either — see the note on that table for why a second landmark
          with the section's own name is worse than none. */}
      <div className="mt-6 overflow-x-auto" tabIndex={0}>
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">{copy.heading}</caption>
          <thead>
            <tr className="border-b border-border">
              {copy.columns.map((column) => (
                <th key={column} scope="col" className="py-2 pr-4 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border align-top">
              <th scope="row" className="py-3 pr-4 font-normal">
                <code className="rounded-btn bg-surface-alt px-1.5 py-0.5 text-caption">
                  {SESSION_COOKIE}
                </code>
              </th>
              <td className="py-3 pr-4">{copy.purpose}</td>
              <td className="py-3 pr-4">{copy.lifetime}</td>
              <td className="py-3 pr-4">{STRICTLY_NECESSARY[locale]}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-6">{copy.language}</p>
      <p className="mt-3">{copy.none}</p>
    </section>
  );
}
