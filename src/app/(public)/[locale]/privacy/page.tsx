/**
 * The privacy policy (T-089), drafted from ARCHITECTURE.md §A-16.1's data
 * inventory and §A-16.2's Phase 1 requirements.
 *
 * ## Drafted by an AI. Not yet reviewed.
 *
 * The card's Contract is explicit that this text is a draft and that clearing it
 * is a **T-131** human gate, not this card's. `REVIEW_PENDING` below is that flag:
 * while it is `true` the page renders a banner carrying the literal §A-3.1 marker,
 * so the document announces its own status to anyone who reaches it. A human who
 * has had the text reviewed sets the constant to `false`; nothing else about the
 * page changes.
 *
 * ## What is drafted and what is marked
 *
 * The substance is not invented. Every row of the table below is §A-16.1 verbatim
 * — the same data, subjects, bases, retention periods and audiences the schema was
 * built around — and the cookie section reads its facts out of the code that sets
 * the cookie. That part is true today and stays true.
 *
 * What an AI cannot know is the *legal* frame around it: the registered entity
 * that is the data controller, its address, the effective date, and the law the
 * document is written under. Those carry `[[CONTENT REQUIRED — DO NOT PUBLISH]]`
 * rather than a plausible guess (global rule 5). A privacy policy naming the wrong
 * controller is worse than one that admits it does not know yet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CookieNotice } from "@/components/public/CookieNotice";
import { isLocale, localizePath, type Locale } from "@/lib/locale";
import { staticPageMetadata } from "@/lib/seo";
import { localeParams } from "@/lib/cache";

/**
 * Whether the legal review has happened. Set to `false` by a human as part of
 * T-131's "privacy policy live" gate — see §A-13.5. It is a constant rather than
 * an environment variable on purpose: a document's review status is a fact about
 * the text in this file, and it should move in the same commit the text does.
 */
const REVIEW_PENDING = true;

/** §A-3.1's literal marker. Kept verbatim so the placeholder gate can find it. */
const MARKER = "[[CONTENT REQUIRED — DO NOT PUBLISH]]";

/** One row of §A-16.1's inventory, in one locale. */
type InventoryRow = {
  data: string;
  subject: string;
  basis: string;
  retention: string;
  audience: string;
};

type PrivacyCopy = {
  title: string;
  reviewBanner: string;
  intro: string;
  controllerHeading: string;
  controller: string;
  inventoryHeading: string;
  inventoryIntro: string;
  inventoryColumns: readonly [string, string, string, string, string];
  inventory: readonly InventoryRow[];
  minorsHeading: string;
  minors: string;
  rightsHeading: string;
  rights: string;
  rightsRoute: string;
  securityHeading: string;
  security: string;
  changesHeading: string;
  changes: string;
  effectiveDate: string;
  termsLink: string;
};

const COPY: Readonly<Record<Locale, PrivacyCopy>> = {
  bn: {
    title: "গোপনীয়তা নীতি",
    reviewBanner: `এই খসড়াটি এখনও আইনি পর্যালোচনার অপেক্ষায়। প্রকাশের আগে স্কুলকে এটি যাচাই করিয়ে নিতে হবে। ${MARKER}`,
    intro:
      "এই পাতাটি জানায় এই ওয়েবসাইট কোন তথ্য সংগ্রহ করে, কেন করে, কত দিন রাখে এবং কারা তা দেখতে পান। যা এখানে লেখা নেই, তা সংগ্রহ করা হয় না।",
    controllerHeading: "তথ্যের দায়িত্বে কে",
    controller: `নিবন্ধিত প্রতিষ্ঠানের নাম, ঠিকানা এবং যোগাযোগের মাধ্যম: ${MARKER}`,
    inventoryHeading: "কোন তথ্য রাখা হয়",
    inventoryIntro:
      "নিচের তালিকাটিই সম্পূর্ণ তালিকা। প্রতিটি সারি নির্দিষ্ট মেয়াদ শেষে স্বয়ংক্রিয়ভাবে মুছে যায়, নয়তো পাশে লেখা নিয়ম অনুযায়ী মুছে ফেলা হয়।",
    inventoryColumns: ["তথ্য", "কার তথ্য", "কেন রাখা হয়", "কত দিন", "কারা দেখেন"],
    inventory: [
      {
        data: "যোগাযোগ ফরম: নাম, ফোন, ইমেইল (ঐচ্ছিক), বার্তা",
        subject: "অভিভাবক বা দর্শনার্থী",
        basis: "ফরম পাঠানোর সময় দেওয়া সম্মতি",
        retention: "১২ মাস, তারপর স্বয়ংক্রিয়ভাবে মুছে যায়",
        audience: "যোগাযোগ দেখার অনুমতিপ্রাপ্ত প্রশাসক",
      },
      {
        data: "শিক্ষকের প্রকাশিত পরিচিতি",
        subject: "শিক্ষক",
        basis: "সংরক্ষিত সম্মতি",
        retention: "কর্মরত থাকা পর্যন্ত এবং তার ৩০ দিন পর",
        audience: "সবাই",
      },
      {
        data: "শিক্ষকের ব্যক্তিগত ফোন, ইমেইল, যোগদানের তারিখ",
        subject: "শিক্ষক",
        basis: "চাকরির প্রয়োজনে",
        retention: "চাকরি শেষ হওয়ার ১২ মাস পর পর্যন্ত",
        audience: "কেবল সুপার অ্যাডমিন",
      },
      {
        data: "গ্যালারির ছবি",
        subject: "শিক্ষার্থী ও কর্মী",
        basis: "সংরক্ষিত সম্মতি",
        retention: "সম্মতি প্রত্যাহার না করা পর্যন্ত",
        audience: "সবাই",
      },
      {
        data: "প্রশাসকের অ্যাকাউন্ট",
        subject: "কর্মী",
        basis: "চাকরির প্রয়োজনে",
        retention: "চাকরি শেষ হওয়ার ৩০ দিন পর (কার্যবিবরণীর নথি থেকে যায়)",
        audience: "সুপার অ্যাডমিন",
      },
      {
        data: "কার্যবিবরণী — কোন প্রশাসক কী পরিবর্তন করলেন",
        subject: "প্রশাসক",
        basis: "স্কুলের বৈধ প্রয়োজন",
        retention: "২৪ মাস",
        audience: "সুপার অ্যাডমিন",
      },
    ],
    minorsHeading: "শিক্ষার্থীদের তথ্য",
    minors:
      "এই ওয়েবসাইট শিক্ষার্থীদের ফলাফল, উপস্থিতি বা অভিভাবকের তথ্য রাখে না, এবং কোনো পাতায় কোনো শিক্ষার্থীর পরিচয় প্রকাশ করে না। গ্যালারির ছবি এর ব্যতিক্রম নয় — ছবি প্রকাশের আগে সম্মতি নেওয়া হয়, এবং সম্মতি তুলে নিলে ছবি সরিয়ে ফেলা হয়।",
    rightsHeading: "আপনার অধিকার",
    rights:
      "আপনার সম্পর্কে কী তথ্য রাখা আছে তা জানতে চাইতে পারেন, ভুল থাকলে সংশোধন চাইতে পারেন, এবং মুছে ফেলার অনুরোধ করতে পারেন। ছবি বা পরিচিতি প্রকাশের সম্মতি যেকোনো সময় তুলে নেওয়া যায়।",
    rightsRoute: `অনুরোধ পাঠানোর ঠিকানা এবং কত দিনের মধ্যে উত্তর দেওয়া হবে: ${MARKER}`,
    securityHeading: "তথ্যের সুরক্ষা",
    security:
      "পাসওয়ার্ড কখনও মূল আকারে রাখা হয় না। যোগাযোগ ফরমে আসা বার্তার সঙ্গে পাঠানো ব্যক্তির আইপি ঠিকানা সরাসরি সংরক্ষণ করা হয় না — কেবল তার একটি রূপান্তরিত রূপ রাখা হয়, যা দিয়ে একই উৎস থেকে অতিরিক্ত বার্তা ঠেকানো যায় কিন্তু ঠিকানাটি ফিরে পাওয়া যায় না। শিক্ষকের ব্যক্তিগত তথ্য আলাদা টেবিলে রাখা হয়, যাতে প্রকাশ্য পাতার কোনো প্রশ্ন সেটিতে পৌঁছাতেই না পারে।",
    changesHeading: "নীতির পরিবর্তন",
    changes:
      "এই নীতি পরিবর্তন হলে এই পাতাতেই হালনাগাদ করা হবে এবং কার্যকর হওয়ার তারিখ বদলে দেওয়া হবে।",
    effectiveDate: `কার্যকর হওয়ার তারিখ: ${MARKER}`,
    termsLink: "ব্যবহারের শর্তাবলি",
  },
  en: {
    title: "Privacy policy",
    reviewBanner: `This draft is still awaiting legal review. The school must have it checked before it is published. ${MARKER}`,
    intro:
      "This page explains what information this website collects, why, how long it is kept, and who can see it. Anything not described here is not collected.",
    controllerHeading: "Who is responsible",
    controller: `Registered entity, address and contact route: ${MARKER}`,
    inventoryHeading: "What is held",
    inventoryIntro:
      "The list below is the whole of it. Each row is either deleted automatically at the end of its period, or governed by the deletion rule beside it.",
    inventoryColumns: ["Data", "Whose", "Why it is held", "How long", "Who can see it"],
    inventory: [
      {
        data: "Contact form: name, phone, email (optional), message",
        subject: "Parent or visitor",
        basis: "Consent given when the form is sent",
        retention: "12 months, then purged automatically",
        audience: "Admins with permission to view contact messages",
      },
      {
        data: "Published faculty profile",
        subject: "Teacher",
        basis: "Recorded consent",
        retention: "While employed, plus 30 days",
        audience: "Public",
      },
      {
        data: "Faculty personal phone, email, joining date",
        subject: "Teacher",
        basis: "Employment",
        retention: "Employment, plus 12 months",
        audience: "Super Admin only",
      },
      {
        data: "Gallery photographs",
        subject: "Students and staff",
        basis: "Recorded consent",
        retention: "Until consent is withdrawn",
        audience: "Public",
      },
      {
        data: "Admin accounts",
        subject: "Staff",
        basis: "Employment",
        retention: "Employment, plus 30 days (the audit record persists)",
        audience: "Super Admin",
      },
      {
        data: "Activity log — which admin changed what",
        subject: "Admins",
        basis: "The school's legitimate interest",
        retention: "24 months",
        audience: "Super Admin",
      },
    ],
    minorsHeading: "Students' data",
    minors:
      "This website holds no student results, attendance or guardian records, and no page identifies a student. Gallery photographs are not an exception: consent is recorded before a photograph is published, and withdrawing it removes the photograph.",
    rightsHeading: "Your rights",
    rights:
      "You may ask what is held about you, ask for it to be corrected, and ask for it to be deleted. Consent to publish a photograph or a profile can be withdrawn at any time.",
    rightsRoute: `Where to send a request, and how quickly it will be answered: ${MARKER}`,
    securityHeading: "How it is protected",
    security:
      "Passwords are never stored in their original form. A sender's IP address is not kept alongside their contact message — only a transformed form of it, which is enough to stop one source flooding the form but cannot be turned back into the address. Faculty personal details live in a separate table, so a query serving a public page cannot reach them at all.",
    changesHeading: "Changes to this policy",
    changes:
      "If this policy changes, this page is updated and the effective date below changes with it.",
    effectiveDate: `Effective date: ${MARKER}`,
    termsLink: "Terms of use",
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
    path: "/privacy",
    title: { literal: COPY[locale].title },
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: segment } = await params;

  // The layout already refuses a segment that is not a locale, but the page
  // receives its own `params` and has to narrow them for itself — a guard here is
  // what turns `string` into `Locale` without a cast.
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

      <Section heading={copy.controllerHeading} id="controller">
        <p>{copy.controller}</p>
      </Section>

      <Section heading={copy.inventoryHeading} id="what-is-held">
        <p>{copy.inventoryIntro}</p>
        {/* Five columns of Bangla do not fit a 360px viewport, so the table
            scrolls inside its own box rather than pushing the page sideways
            (§A-8.3). */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left">
            <caption className="sr-only">{copy.inventoryHeading}</caption>
            <thead>
              <tr className="border-b border-border">
                {copy.inventoryColumns.map((column) => (
                  <th key={column} scope="col" className="py-2 pr-4 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {copy.inventory.map((row) => (
                <tr key={row.data} className="border-b border-border align-top">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    {row.data}
                  </th>
                  <td className="py-3 pr-4">{row.subject}</td>
                  <td className="py-3 pr-4">{row.basis}</td>
                  <td className="py-3 pr-4">{row.retention}</td>
                  <td className="py-3 pr-4">{row.audience}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* §A-16.2 requirement 1's cookie notice, in the document it belongs to. */}
      <CookieNotice locale={locale} />

      <Section heading={copy.minorsHeading} id="students">
        <p>{copy.minors}</p>
      </Section>

      <Section heading={copy.rightsHeading} id="your-rights">
        <p>{copy.rights}</p>
        <p className="mt-3">{copy.rightsRoute}</p>
      </Section>

      <Section heading={copy.securityHeading} id="security">
        <p>{copy.security}</p>
      </Section>

      <Section heading={copy.changesHeading} id="changes">
        <p>{copy.changes}</p>
        <p className="mt-3">{copy.effectiveDate}</p>
      </Section>

      <p className="mt-12 border-t border-border pt-6">
        <Link
          href={localizePath("/terms", locale)}
          className="text-teal underline-offset-2 hover:underline"
        >
          {copy.termsLink}
        </Link>
      </p>
    </article>
  );
}

/** One titled block. `id` is the heading's anchor as well as its accessible name. */
function Section({
  heading,
  id,
  children,
}: {
  heading: string;
  id: string;
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
