/**
 * Terms of use (T-089).
 *
 * Same standing as the privacy policy beside it: **drafted by an AI, not yet
 * reviewed**, with `REVIEW_PENDING` rendering the §A-3.1 marker until a human
 * clears it as part of T-131. The two documents carry the flag separately on
 * purpose — they are reviewed against different things, and one being signed off
 * says nothing about the other.
 *
 * What is stated here is what the site actually does. It describes a school's
 * information website: the office publishes, the site displays, and the office's
 * own records are what govern if the two ever disagree. That last point is the
 * one clause worth having, because a parent acting on a stale routine is the
 * realistic harm on a site like this — not a licensing dispute.
 *
 * Jurisdiction, governing law and any limitation of liability carry
 * `[[CONTENT REQUIRED — DO NOT PUBLISH]]`. They are legal facts about a specific
 * registered entity in a specific country, and inventing them would produce a
 * document that reads as binding while being nothing of the sort.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isLocale, localizePath, type Locale } from "@/lib/locale";
import { staticPageMetadata } from "@/lib/seo";
import { localeParams } from "@/lib/cache";

/** See the same constant in the privacy policy. A human flips it at T-131. */
const REVIEW_PENDING = true;

/** §A-3.1's literal marker. Kept verbatim so the placeholder gate can find it. */
const MARKER = "[[CONTENT REQUIRED — DO NOT PUBLISH]]";

type Clause = { heading: string; body: string };

type TermsCopy = {
  title: string;
  reviewBanner: string;
  intro: string;
  clauses: readonly Clause[];
  privacyLink: string;
  contactLink: string;
};

const COPY: Readonly<Record<Locale, TermsCopy>> = {
  bn: {
    title: "ব্যবহারের শর্তাবলি",
    reviewBanner: `এই খসড়াটি এখনও আইনি পর্যালোচনার অপেক্ষায়। প্রকাশের আগে স্কুলকে এটি যাচাই করিয়ে নিতে হবে। ${MARKER}`,
    intro:
      "এই ওয়েবসাইটটি স্কুলের তথ্য জানানোর জন্য। এটি ব্যবহার করলে নিচের শর্তগুলো প্রযোজ্য হয়।",
    clauses: [
      {
        heading: "তথ্যের সঠিকতা",
        body: "এই সাইটের নোটিশ, রুটিন, তারিখ ও ফি স্কুল অফিস থেকে প্রকাশ করা হয় এবং যত্ন নিয়ে হালনাগাদ রাখা হয়। তবু কোনো তথ্য পুরোনো হয়ে যেতে পারে। ভর্তি, পরীক্ষা বা টাকা পরিশোধের মতো কোনো সিদ্ধান্ত নেওয়ার আগে স্কুল অফিসে যাচাই করে নিন — মতভেদ হলে অফিসের নথিই চূড়ান্ত।",
      },
      {
        heading: "সাইটের ব্যবহার",
        body: "যে কেউ এই সাইট পড়তে ও এর লিঙ্ক শেয়ার করতে পারেন। যোগাযোগ ফরমটি স্কুলের সঙ্গে সত্যিকারের যোগাযোগের জন্য; বিজ্ঞাপন, একই বার্তা বারবার পাঠানো বা স্বয়ংক্রিয়ভাবে বার্তা পাঠানোর জন্য নয়। অতিরিক্ত অনুরোধ পাঠালে তা সাময়িকভাবে আটকে দেওয়া হয়।",
      },
      {
        heading: "লেখা ও ছবির মালিকানা",
        body: "এই সাইটের লেখা, ছবি ও নথি স্কুলের। যেসব ছবিতে মানুষ আছেন, সেগুলো সংশ্লিষ্ট ব্যক্তির সম্মতি নিয়ে প্রকাশ করা হয়েছে; সেই ছবি অন্য কোথাও ব্যবহার করার আগে স্কুলের অনুমতি নিতে হবে।",
      },
      {
        heading: "অন্য সাইটের লিঙ্ক",
        body: "এই সাইটে মানচিত্র বা ভিডিওর মতো কিছু অংশ অন্য প্রতিষ্ঠানের সেবা থেকে আসে। সেসব সেবার নিজস্ব শর্ত ও গোপনীয়তা নীতি আছে, এবং তাদের বিষয়বস্তুর দায় স্কুলের নয়।",
      },
      {
        heading: "সেবার ধারাবাহিকতা",
        body: "রক্ষণাবেক্ষণ বা কারিগরি কারণে সাইটটি মাঝে মাঝে বন্ধ থাকতে পারে। জরুরি ঘোষণা কেবল এই সাইটের ওপর নির্ভর করে দেওয়া হয় না।",
      },
      {
        heading: "প্রযোজ্য আইন ও দায়সীমা",
        body: `এই শর্তাবলি যে দেশের আইনে পরিচালিত এবং দায়সীমা সম্পর্কিত ধারা: ${MARKER}`,
      },
      {
        heading: "শর্তের পরিবর্তন",
        body: "এই শর্তাবলি পরিবর্তন হলে এই পাতাতেই হালনাগাদ করা হবে।",
      },
    ],
    privacyLink: "গোপনীয়তা নীতি",
    contactLink: "যোগাযোগ",
  },
  en: {
    title: "Terms of use",
    reviewBanner: `This draft is still awaiting legal review. The school must have it checked before it is published. ${MARKER}`,
    intro:
      "This website exists to give information about the school. The terms below apply to using it.",
    clauses: [
      {
        heading: "Accuracy of information",
        body: "Notices, routines, dates and fees on this site are published by the school office and kept up to date with care. Even so, a page can fall behind. Please confirm with the office before acting on anything — an admission, an examination, a payment — and where the two disagree, the office's own records are what stand.",
      },
      {
        heading: "Using the site",
        body: "Anyone may read this site and share links to it. The contact form is for genuine enquiries to the school, not for advertising, repeated messages or automated submissions. Excessive requests are refused for a period.",
      },
      {
        heading: "Text and photographs",
        body: "The text, photographs and documents on this site belong to the school. Photographs that show people are published with the consent of those people; permission from the school is needed before using them elsewhere.",
      },
      {
        heading: "Links to other services",
        body: "Parts of this site, such as a map or a video, are served by other organisations. Those services have their own terms and privacy policies, and the school is not responsible for their content.",
      },
      {
        heading: "Availability",
        body: "The site may be unavailable at times, for maintenance or for technical reasons. Urgent announcements are not made through this site alone.",
      },
      {
        heading: "Governing law and liability",
        body: `The law these terms are governed by, and any limitation of liability: ${MARKER}`,
      },
      {
        heading: "Changes to these terms",
        body: "If these terms change, this page is updated.",
      },
    ],
    privacyLink: "Privacy policy",
    contactLink: "Contact",
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
 * This route has no `pages` row, so its title is the §A-7.2 static UI string
 * for it plus the school's name — never an invented description (T-100).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return staticPageMetadata({
    locale,
    path: "/terms",
    title: { literal: COPY[locale].title },
  });
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;
  if (!isLocale(segment)) notFound();
  const locale: Locale = segment;
  const copy = COPY[locale];

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-heading text-h1 text-primary">{copy.title}</h1>

      {REVIEW_PENDING ? (
        <p
          role="note"
          className="mt-6 rounded-card border-l-rule border-l-accent bg-accent-tint px-4 py-3"
        >
          {copy.reviewBanner}
        </p>
      ) : null}

      <p className="mt-6">{copy.intro}</p>

      {copy.clauses.map((clause, index) => {
        const id = `clause-${index + 1}`;
        return (
          <section key={clause.heading} aria-labelledby={id} className="mt-12">
            <h2 id={id} className="scroll-mt-24 font-heading text-h2 text-primary">
              {clause.heading}
            </h2>
            <p className="mt-4">{clause.body}</p>
          </section>
        );
      })}

      <ul className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6">
        <li>
          <Link
            href={localizePath("/privacy", locale)}
            className="text-teal underline-offset-2 hover:underline"
          >
            {copy.privacyLink}
          </Link>
        </li>
        <li>
          {/* `/contact` is T-088's page and does not exist yet; the header and
              footer already link it on every page, so this link is consistent
              with the rest of the shell rather than ahead of it. */}
          <Link
            href={localizePath("/contact", locale)}
            className="text-teal underline-offset-2 hover:underline"
          >
            {copy.contactLink}
          </Link>
        </li>
      </ul>
    </article>
  );
}
