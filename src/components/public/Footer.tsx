/**
 * The public site footer (T-080), per design-system.md §5 (Footer) and
 * ARCHITECTURE.md §A-16.2.
 *
 * §5 fixes the palette: Deep Forest Green ground, white/cream text, and the
 * **Gold Light Tint** for link hover. Full-saturation Muted Gold on this
 * background is 3.36:1 and fails AA for body-size links, which is exactly what a
 * footer is made of — so the hover colour is `#F1E4C2` at 7.83:1, applied
 * through the `.link-on-primary` class T-002 already declares.
 *
 * A Server Component. It has no interactivity at all, so keeping it on the
 * server keeps the largest block of markup on the site — and the message
 * catalogue it reads — out of every visitor's bundle.
 *
 * §A-16.2 requirement 1 is discharged here: the privacy policy and cookie notice
 * must be *linked in the footer*. Those two links are therefore not optional
 * chrome; T-089 builds the pages they point at, and it cannot add the links
 * itself because this file is not in its card's Files list.
 *
 * Four columns, and any column with nothing in it does not render. An empty
 * "Contact us" heading over blank space is worse than no column: it reads as a
 * site that lost its own phone number. Nothing here invents a fact about the
 * school (global rule 5) — every value is a row or it is absent.
 */

import Link from "next/link";

import { t } from "@/lib/i18n";
import { localizePath, type Locale } from "@/lib/locale";

/** A public contact channel, resolved for one locale. */
export type FooterChannel = {
  key: string;
  /** `phone`, `mobile`, `whatsapp`, `email`, `fax` — from `contact_channel_types`. */
  typeCode: string;
  label: string;
  value: string;
};

/** A social profile. `label` is the platform's display name. */
export type FooterSocial = {
  key: string;
  label: string;
  url: string;
};

export type FooterProps = {
  locale: Locale;
  schoolName: string;
  slogan: string | null;
  address: string | null;
  officeHours: string | null;
  footerNote: string | null;
  /** The same links the header shows, already prefixed and translated. */
  navItems: readonly { key: string; href: string; label: string }[];
  channels: readonly FooterChannel[];
  socials: readonly FooterSocial[];
};

export function Footer({
  locale,
  schoolName,
  slogan,
  address,
  officeHours,
  footerNote,
  navItems,
  channels,
  socials,
}: FooterProps) {
  const hasContact = address !== null || officeHours !== null || channels.length > 0;

  return (
    <footer className="mt-16 bg-primary text-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/*
          One column on a phone, two at `sm`, four at `lg`. `items-start` rather
          than a stretched grid so a short column does not inherit the height of
          the longest one — Bangla labels make column heights uneven by 15-30%
          (§A-8.3), and equal-height columns would put a gulf under the short ones.
        */}
        <div className="grid grid-cols-1 items-start gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-heading text-h3 font-semibold text-surface">
              {schoolName}
            </p>
            {slogan === null ? null : (
              <p className="mt-2 text-caption text-surface opacity-90">{slogan}</p>
            )}
            {footerNote === null ? null : (
              <p className="mt-4 text-caption text-surface opacity-90">{footerNote}</p>
            )}
          </div>

          <FooterColumn heading={t(locale, "public.footer.quickLinks")}>
            <ul className="flex flex-col gap-2">
              {navItems.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="link-on-primary text-body">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          {hasContact ? (
            <FooterColumn heading={t(locale, "public.footer.contactUs")}>
              <ul className="flex flex-col gap-2 text-body">
                {address === null ? null : (
                  <li>
                    <span className="block opacity-80">
                      {t(locale, "public.contact.address")}
                    </span>
                    <address className="not-italic">{address}</address>
                  </li>
                )}
                {officeHours === null ? null : (
                  <li>
                    <span className="block opacity-80">
                      {t(locale, "public.contact.officeHours")}
                    </span>
                    {officeHours}
                  </li>
                )}
                {channels.map((channel) => (
                  <li key={channel.key}>
                    <span className="block opacity-80">{channel.label}</span>
                    <ChannelValue channel={channel} />
                  </li>
                ))}
              </ul>
            </FooterColumn>
          ) : null}

          {socials.length > 0 ? (
            <FooterColumn heading={t(locale, "public.footer.followUs")}>
              <ul className="flex flex-col gap-2">
                {socials.map((social) => (
                  <li key={social.key}>
                    <a
                      href={social.url}
                      // An outbound link that opens a new tab hands the opener to
                      // the destination unless `rel` says otherwise — the same
                      // rule T-034 applies to admin-authored links.
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-on-primary text-body"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </FooterColumn>
          ) : null}
        </div>

        {/* §A-16.2 requirement 1: the privacy policy is linked in the footer. */}
        <div className="mt-10 flex flex-col gap-3 border-t border-primary-hover pt-6 text-caption sm:flex-row sm:items-center sm:justify-between">
          <p className="text-surface opacity-90">
            © {new Date().getFullYear()} {schoolName}. {t(locale, "public.footer.rights")}
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <li>
              <Link
                href={localizePath("/privacy", locale)}
                className="link-on-primary text-caption"
              >
                {t(locale, "public.footer.privacy")}
              </Link>
            </li>
            <li>
              <Link
                href={localizePath("/terms", locale)}
                className="link-on-primary text-caption"
              >
                {t(locale, "public.footer.terms")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* `h2` is styled Forest Green globally, which is invisible on this
          ground, so the footer's headings carry their own colour. */}
      <h2 className="text-h3 font-semibold text-surface">{heading}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * A contact value, as a link where the value is actionable.
 *
 * A phone number a parent can tap and an email they can open are the two things
 * a school footer is for. `whatsapp` and `fax` stay text: a WhatsApp deep link
 * needs a country-normalised number this column does not have, and nobody dials
 * a fax from a browser.
 */
function ChannelValue({ channel }: { channel: FooterChannel }) {
  if (channel.typeCode === "email") {
    return (
      <a href={`mailto:${channel.value}`} className="link-on-primary">
        {channel.value}
      </a>
    );
  }

  if (channel.typeCode === "phone" || channel.typeCode === "mobile") {
    return (
      // `tel:` wants no spaces or dashes; the displayed text keeps the formatting
      // the office entered.
      <a href={`tel:${channel.value.replace(/[^\d+]/g, "")}`} className="link-on-primary">
        {channel.value}
      </a>
    );
  }

  return <span>{channel.value}</span>;
}
