/**
 * The public inquiry form endpoint (T-088), per ARCHITECTURE.md §A-16.2 and
 * §B-13.
 *
 * A Route Handler, for the same reason T-040's login endpoint is one: this
 * accepts a plain, no-JavaScript-required HTML form POST from
 * `contact/page.tsx` (`<form method="post" action="/api/contact">`) and
 * answers with real HTTP semantics — a `303` redirect back to the page with
 * `?sent=1` or `?error=…`, and `429` + `Retry-After` for a lockout — which a
 * Server Action's single return value cannot carry as cleanly across a full,
 * JS-optional form submission.
 *
 * The order below mirrors T-040's: **rate-limit before validating.** A
 * contact submission is cheap to validate, unlike a bcrypt comparison, but
 * charging the bucket first is what keeps the limit meaning "3 attempts",
 * full stop, rather than "3 attempts that happened to be well-formed" — an
 * attacker who wants to exhaust it with junk should not get a fourth try by
 * sending it maliciously malformed.
 *
 * `ip_hash` is a plain SHA-256 of the request IP — "hashed, not raw: data
 * minimisation" per §B-13's own migration comment, not a defence against a
 * targeted lookup. `ipHash`/`userAgent`/`submittedAt`/`consentGivenAt` are
 * never accepted from the form; `contactSubmissionSchema`'s own header
 * explains why (a client that can post its own IP hash can post someone
 * else's).
 */

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { DEFAULT_LOCALE, isLocale, localizePath, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { consumeContactSubmission } from "@/lib/rate-limit";
import { contactSubmissionSchema } from "@/lib/validation/contact";

/** Node.js, not Edge: Prisma needs it. */
export const runtime = "nodejs";

/** A form submission — never cached. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const locale = localeOf(form);
  const ipAddress = clientIp(request);

  if (form === null) {
    return toPage(request, locale, "error", "validation");
  }

  // Charged first and unconditionally — see the file header. Every submission
  // counts against the 3/hour/IP bucket (§A-12), whatever it contains.
  const limit = await consumeContactSubmission(ipAddress);
  if (!limit.allowed) {
    return toPage(request, locale, "error", "rate_limited", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const parsed = contactSubmissionSchema.safeParse({
    name: field(form, "name"),
    phone: field(form, "phone"),
    email: field(form, "email"),
    message: field(form, "message"),
    localeCode: locale,
    consentGiven: form.get("consentGiven") === "on",
  });

  if (!parsed.success) {
    return toPage(request, locale, "error", "validation");
  }

  await prisma.contactMessage.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      message: parsed.data.message,
      localeCode: parsed.data.localeCode,
      ipHash: ipAddress === null ? null : sha256(ipAddress),
      userAgent: request.headers.get("user-agent"),
    },
  });

  // `contact` carries no public surface (`MODULE_TAGS.contact` is `[]`) — a
  // new inquiry changes nothing a visitor's browser has cached.
  return toPage(request, locale, "sent", "1");
}

/** One `FormData` value as a string, or `""` for absent/non-string entries. */
function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * The locale the form was submitted from, read from its own hidden `locale`
 * field — this endpoint has no path of its own to resolve one from, and
 * §A-7.1 forbids deciding a locale from `Accept-Language` or a cookie. An
 * absent or bogus value falls back to Bangla, the required locale (§A-7.3).
 */
function localeOf(form: FormData | null): Locale {
  const value = form?.get("locale");
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Redirects back to the contact page with a result flag in the query string. */
function toPage(
  request: Request,
  locale: Locale,
  key: "sent" | "error",
  value: string,
  extraHeaders?: Record<string, string>,
): NextResponse {
  const target = new URL(
    localizePath(`/contact?${key}=${encodeURIComponent(value)}`, locale),
    request.url,
  );
  // 303: this POST's result is fetched with a GET, whatever the browser's
  // original method was — the standard POST-redirect-GET shape, so a reload
  // of the landing page never resubmits the form.
  return NextResponse.redirect(target, { status: 303, headers: extraHeaders });
}

/**
 * The client IP for the rate-limit bucket and `ip_hash`.
 *
 * `x-forwarded-for` is a chain the deploy's proxy appends to, so the first
 * entry is the original client — the same extraction T-040's login endpoint
 * and T-038's audit writer both use.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first !== undefined && first !== "") return first;
  return request.headers.get("x-real-ip");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
