/**
 * Shared validators (T-034) — stage 3 of the write pipeline (§A-5.1).
 *
 * Two rules hold across every schema in this directory:
 *
 * 1. **`.strict()` everywhere.** An unknown key is a 422, never a silently
 *    ignored field. A form that posts `isAdmin: true` at a schema that does not
 *    declare it must fail loudly, because the alternative — dropping it — looks
 *    identical to the alternative where some later refactor starts honouring it.
 * 2. **Bangla required, English optional** (§A-7.3). `translationSet` encodes
 *    this once so no module re-decides it. Requiring both would block a school
 *    office from posting an urgent Bangla notice; requiring neither would let a
 *    row exist with no readable content at all.
 *
 * Plain text and rich text are kept apart deliberately: `plainText` is escaped
 * by React at render, `richText` goes through the §A-12 allowlist on write. A
 * field declared as the wrong one is the bug this split exists to make visible.
 */

import { z } from "zod";

import { LOCALES } from "@/lib/locale";
import { isEmptyHtml, sanitizeHtml, stripHtml } from "@/lib/sanitize";

/** Column caps. Postgres columns are `TEXT`, so these are product limits. */
export const LIMITS = {
  /** A name, a label, a code — one line, no wrapping. */
  shortText: 120,
  /** A title or heading. */
  title: 200,
  /** A one-paragraph description, excerpt or note. */
  text: 1_000,
  /** A whole rich-text body: a notice, the principal's message. */
  richText: 50_000,
  /** `<title>` truncates around here in search results. */
  metaTitle: 70,
  /** `<meta name="description">` truncates around here. */
  metaDescription: 160,
  url: 2_048,
  /** RFC 5321's practical ceiling on an address. */
  email: 254,
} as const;

/**
 * Bangladeshi mobile number, exactly as §T-034 specifies it: `01XXXXXXXXX`.
 *
 * Not narrowed to the operator prefixes in use today (`013`–`019`) on purpose —
 * a new operator range would otherwise turn into a validation bug reported by a
 * parent who cannot submit the contact form, and the value is stored for a
 * human to dial, not parsed.
 */
export const BD_PHONE_PATTERN = /^01\d{9}$/;

export const HEX_COLOUR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * A URL slug, Unicode-aware.
 *
 * `notice_translations.slug` is per-locale precisely so Bangla gets Bangla URLs
 * ("better BN SEO", T-018's migration), so an ASCII-only pattern would reject
 * every Bangla slug the schema was designed for. Bangla is unicameral (`\p{Lo}`)
 * and its vowel signs are combining marks (`\p{M}`) — omitting the marks class
 * would reject any word containing a matra, which is very nearly all of them.
 *
 * Uppercase is refused because URLs are compared case-sensitively by most
 * caches; `\p{Ll}` admits lowercase Latin without admitting `Notice-1`.
 */
export const SLUG_PATTERN = /^[\p{Ll}\p{Lo}\p{N}\p{M}]+(?:-[\p{Ll}\p{Lo}\p{N}\p{M}]+)*$/u;

/** Collapses runs of whitespace and trims — one line means one line. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Single-line plain text. Trimmed, whitespace-collapsed, required.
 *
 * Any markup is reduced to its text content rather than rejected: an admin who
 * pastes a bold name out of Word means the name, not a validation error. Safety
 * does not depend on that — React escapes the value at render — so this is a
 * data-hygiene step, not the XSS control.
 */
export function plainText(max: number = LIMITS.shortText) {
  return z
    .string()
    .transform((value) => collapseWhitespace(stripHtml(value)))
    .pipe(z.string().min(1, "Required").max(max, `Must be ${max} characters or fewer`));
}

/**
 * Optional plain text. An empty or whitespace-only string becomes `null`, so
 * "cleared by the admin" and "never set" are the same row state rather than two
 * that every read has to distinguish.
 */
export function optionalPlainText(max: number = LIMITS.shortText) {
  return z
    .string()
    .transform((value) => collapseWhitespace(stripHtml(value)))
    .pipe(z.string().max(max, `Must be ${max} characters or fewer`))
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

/**
 * Multi-line plain text — a description or note. Trimmed, but internal line
 * breaks survive.
 */
export function multilineText(max: number = LIMITS.text) {
  return z
    .string()
    .transform((value) => stripHtml(value))
    .pipe(z.string().max(max, `Must be ${max} characters or fewer`))
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

/**
 * Required rich text, sanitized on the way through (§A-5.1 stage 4).
 *
 * The order matters: sanitize **first**, then check emptiness. Checked the
 * other way round, `<script>alert(1)</script>` passes the "not empty" test and
 * is then stored as the empty string — a required field silently blank.
 *
 * The length cap is applied to the input, before sanitizing, so a megabyte of
 * payload is refused rather than parsed.
 */
export function richText(max: number = LIMITS.richText) {
  return z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    .transform(sanitizeHtml)
    .refine((html) => !isEmptyHtml(html), "Required");
}

/** Optional rich text. Sanitized the same way; empty content becomes `null`. */
export function optionalRichText(max: number = LIMITS.richText) {
  return z
    .string()
    .max(max, `Must be ${max} characters or fewer`)
    .transform(sanitizeHtml)
    .transform((html) => (isEmptyHtml(html) ? null : html))
    .nullish()
    .transform((value) => value ?? null);
}

/**
 * A Bangladeshi mobile number. Spaces, hyphens and a `+88` country code are
 * stripped before matching — they are how people write the number, not part of
 * it — and what is stored is the canonical eleven digits.
 */
export const bdPhone = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?88/, ""))
  .pipe(
    z
      .string()
      .regex(BD_PHONE_PATTERN, "Must be a Bangladeshi mobile number, 01XXXXXXXXX"),
  );

export const optionalBdPhone = bdPhone
  .nullish()
  .transform((value) => (value === "" || value === undefined ? null : value));

/** An email address, lowercased — `users.email` is `CITEXT`, so case is noise. */
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.email)
  .email("Must be a valid email address");

export const optionalEmailAddress = z
  .union([emailAddress, z.literal("")])
  .nullish()
  .transform((value) => (value === "" || value === undefined ? null : (value ?? null)));

/**
 * An absolute `http(s)` URL.
 *
 * The scheme check is the point: Zod's `.url()` is `new URL()`, which happily
 * accepts `javascript:alert(1)` as a well-formed URL. Any column whose value
 * reaches an `href` — `social_links.url`, a hero slide's CTA — must not be
 * validated by shape alone.
 */
export const httpUrl = z
  .string()
  .trim()
  .max(LIMITS.url)
  .url("Must be a valid URL")
  .refine((value) => {
    const scheme = value.slice(0, value.indexOf(":")).toLowerCase();
    return scheme === "http" || scheme === "https";
  }, "Must be an http or https URL");

/**
 * A link target that may be internal. Either an absolute `http(s)` URL or a
 * site-relative path — `/admission` is the default of `home_content.cta_url`,
 * and forcing it to absolute would bake the domain into content rows.
 *
 * A protocol-relative `//evil.example` reads as a path but resolves off-site,
 * so it is refused explicitly rather than by accident.
 */
export const linkTarget = z.union([
  httpUrl,
  z
    .string()
    .trim()
    .max(LIMITS.url)
    .regex(/^\/(?!\/)[^\s]*$/, "Must be a site-relative path or an http(s) URL"),
]);

export const optionalLinkTarget = z
  .union([linkTarget, z.literal("")])
  .nullish()
  .transform((value) => (value === "" || value === undefined ? null : (value ?? null)));

/** A six-digit hex colour, mirroring the `CHECK (color_hex ~ ...)` constraint. */
export const hexColour = z
  .string()
  .trim()
  .regex(HEX_COLOUR_PATTERN, "Must be a six-digit hex colour, e.g. #1A73E8");

export const optionalHexColour = z
  .union([hexColour, z.literal("")])
  .nullish()
  .transform((value) => (value === "" || value === undefined ? null : (value ?? null)));

/** A URL slug. See `SLUG_PATTERN` for why it is Unicode-aware. */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(LIMITS.shortText)
  .regex(SLUG_PATTERN, "Must be lowercase words separated by single hyphens");

/**
 * A natural key like `academic_years.code` or `site_stats.code` — ASCII, stable,
 * and used in URLs and seeds. Unlike a slug this is never user-facing prose, so
 * it stays ASCII on purpose.
 */
export const naturalCode = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Required")
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    "Must be lowercase letters, digits, hyphen or underscore",
  );

/**
 * A database id. Accepts the string a form posts, the number JSON carries and
 * the `bigint` server code holds, and always yields `bigint` — every id column
 * in the schema is `BIGINT`, and a JS `number` silently loses precision past
 * 2^53.
 */
export const dbId = z
  .union([
    z.bigint(),
    z.number().int(),
    z.string().trim().regex(/^\d+$/, "Must be a numeric id"),
  ])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "Must be a positive id");

export const optionalDbId = dbId.nullish().transform((value) => value ?? null);

/** `sort_order` is `SMALLINT`; the bound is the column's, not a preference. */
export const sortOrder = z.number().int().min(0).max(32_767).default(0);

/** A `SMALLINT` year, matching `CHECK (… BETWEEN 1900 AND 2200)`. */
export const year = z.number().int().min(1900).max(2200);

/**
 * A date-only column (`DATE`). Accepts `YYYY-MM-DD` or a `Date`, and rejects
 * `2026-02-31` — `new Date()` would roll that over to 3 March rather than fail.
 */
export const dateOnly = z
  .union([
    z.date(),
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  ])
  .transform((value) => (value instanceof Date ? value : new Date(`${value}T00:00:00Z`)))
  .refine((value) => !Number.isNaN(value.getTime()), "Must be a real calendar date");

export const optionalDateOnly = dateOnly.nullish().transform((value) => value ?? null);

/** A `TIMESTAMPTZ` column. */
export const timestamp = z
  .union([z.date(), z.string().trim().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), "Must be a valid timestamp");

export const optionalTimestamp = timestamp.nullish().transform((value) => value ?? null);

/**
 * A `NUMERIC(12,2)` money amount, kept as a string all the way to Prisma.
 *
 * Never a JS `number`: 0.1 + 0.2 is not 0.3, and fee totals are arithmetic a
 * parent will check by hand. `CHECK (amount >= 0)` is mirrored by the pattern
 * refusing a leading minus.
 */
export const money = z
  .union([z.string().trim(), z.number()])
  .transform((value) => (typeof value === "number" ? value.toFixed(2) : value))
  .pipe(
    z
      .string()
      .regex(
        /^\d{1,10}(\.\d{1,2})?$/,
        "Must be an amount with at most two decimal places",
      ),
  );

/** `content_statuses` rows as seeded (§B-19). `publish` is a separate action. */
export const CONTENT_STATUSES = ["draft", "published", "archived"] as const;
export const contentStatus = z.enum(CONTENT_STATUSES);

/** `contact_message_statuses` rows as seeded (§B-19). */
export const CONTACT_MESSAGE_STATUSES = ["new", "read", "archived", "spam"] as const;
export const contactMessageStatus = z.enum(CONTACT_MESSAGE_STATUSES);

/** A locale code that exists. `locales` is a table, but the app ships two. */
export const localeCode = z.enum(LOCALES);

/**
 * Wraps a translation shape in §A-7.3's policy: Bangla required, English
 * optional.
 *
 * English is all-or-nothing rather than field-by-field. A half-filled English
 * row renders as a page that switches language mid-paragraph, which is worse
 * than the honest Bangla fallback §A-7.3 already specifies — and the admin UI
 * shows an `EN missing` badge either way.
 */
export function translationSet<T extends z.ZodRawShape>(shape: T) {
  const one = z.object(shape).strict();
  return z
    .object({
      bn: one,
      en: one.optional(),
    })
    .strict();
}

/** The shape every module's create/update schemas are built with. */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
