/**
 * Request middleware (T-041), per ARCHITECTURE.md §A-6 and §A-9.2.
 *
 * Two jobs, and §A-6's lifecycle diagram is the whole specification for both:
 *
 *  - **Public request** — resolve the locale from the path prefix, never from a
 *    cookie or `Accept-Language`, hand it to the render as a request header, and
 *    rewrite the bare Bangla namespace onto the `[locale]` route segment that
 *    serves it (T-080, ADR-005 route shape). ADR-005's URLs are unchanged by
 *    this; see `localeRewrite` for the whole mapping.
 *  - **Admin request** — session cookie → `sessions.token_hash` lookup →
 *    `revoked_at IS NULL`? — and send anyone without a live session to `/login`
 *    with a `next` parameter, plus `no-store` on everything under `/admin`.
 *    A live session that still owes the forced first rotation goes to
 *    `/admin/change-password` and nowhere else (T-043, §A-9.2's first-login
 *    row): the flag outranks every other admin route, so no admin action is
 *    reachable while it is set.
 *
 * **This is a convenience redirect, not an authorization boundary** (the card's
 * Contract, and §A-9.3's model). It answers one question — *is there a live
 * session?* — and never *may this person do this?*. Every Server Action and
 * route handler still calls `assertCan()` for itself, because a middleware
 * matcher is a path pattern and a permission is a row: the first is easy to
 * mis-write and the second is the actual decision. Nothing downstream may treat
 * "middleware let it through" as permission for anything.
 *
 * The session check runs against the database rather than against the cookie's
 * contents because the cookie carries an opaque token and nothing else (T-032).
 * That is what makes revocation immediate: a session revoked by a suspension,
 * a password change or a logout on another device is refused on the very next
 * request, without waiting for an expiry the client holds a copy of.
 */

import { NextResponse, type NextRequest } from "next/server";

import { clearedSessionCookieOptions, SESSION_COOKIE } from "@/lib/cookies";
import {
  DEFAULT_LOCALE,
  localizePath,
  prefixForLocale,
  resolveLocaleFromPath,
  type Locale,
} from "@/lib/locale";
import { verifySession } from "@/lib/session";

/**
 * The Node.js runtime, not Edge.
 *
 * `verifySession` is a Prisma query against Postgres, and §A-6 puts that lookup
 * in the middleware step by name. The Edge runtime has neither the driver nor a
 * TCP socket to run it over, so the alternatives were a second HTTP hop to an
 * internal endpoint on every admin request, or a token the client could read —
 * one slower, the other a downgrade of T-032's opaque-token contract.
 *
 * The matcher excludes three things and each exclusion is deliberate:
 *
 *  - `/api/*` — those endpoints authenticate themselves and answer with status
 *    codes, not redirects. Bouncing an API call to an HTML login page turns a
 *    401 a client can handle into a 200 it cannot parse, and `/api/auth/login`
 *    must stay reachable with no session at all.
 *  - `_next/*` and files with an extension — build output and static assets.
 *    Running a database query to serve a logo is pure latency.
 *  - `favicon.ico` — requested by every browser on every navigation.
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/|_next/|favicon\\.ico|.*\\.[^/]+$).*)"],
};

/** The header the render reads its locale from. Always set here, never trusted from the client. */
const LOCALE_HEADER = "x-locale";

/** The unprefixed path, for a render that needs to know where it is without re-parsing. */
const PATHNAME_HEADER = "x-pathname";

/** Admin responses are per-session and must never sit in a shared cache (§A-6). */
const NO_STORE = "no-store, no-cache, must-revalidate";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { locale, pathname } = resolveLocaleFromPath(request.nextUrl.pathname);

  // Both headers are **set**, not appended: an inbound `x-locale` from a
  // client is overwritten, never read. The locale comes from the URL (§A-7.1),
  // and a header a browser can forge is not the URL.
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  headers.set(PATHNAME_HEADER, pathname);

  if (!isAdminPath(pathname)) {
    const internal = localeRewrite(request.nextUrl.pathname);
    if (internal === null) return NextResponse.next({ request: { headers } });

    // A **rewrite**, not a redirect: the address bar keeps ADR-005's URL and the
    // App Router is handed the segment that actually serves it. A redirect would
    // put `/bn/notices` in the bar, which is the one URL this scheme forbids.
    const url = request.nextUrl.clone();
    url.pathname = internal;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;

  // No cookie at all: nothing to verify, and no reason to touch the database.
  if (token === null || token === "") {
    return toLogin(request, locale);
  }

  // The single `UPDATE … RETURNING` in T-032: unknown, revoked, expired and
  // idle-timed-out all come back as `null`, and a live session has its idle
  // window refreshed by the same statement. This is the `revoked_at IS NULL`
  // check §A-6 names — a session revoked a moment ago fails here, mid-session.
  const session = await verifySession(token);

  if (session === null) {
    // The cookie is dead, so it is cleared on the way out. Leaving it in place
    // would have the browser re-present a token that can never work again, and
    // every one of those is another pointless query.
    const response = toLogin(request, locale);
    response.cookies.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
    return response;
  }

  // T-043: the forced first rotation. `must_change_password` outranks every
  // other admin route, so it is checked after the session is known to be live
  // and before anything under `/admin` is allowed to render.
  if (!isChangePasswordPath(pathname) && (await mustChangePassword(session.userId))) {
    return withNoStore(NextResponse.redirect(toChangePassword(request, locale)));
  }

  const response = NextResponse.next({ request: { headers } });
  return withNoStore(response);
}

/**
 * The internal path that serves a public URL, or `null` when the URL already is
 * the internal one and needs no rewrite (T-080, ADR-005 route shape).
 *
 * The public site lives under a **required** `[locale]` segment, because Next
 * 15.5 refuses child routes under an optional catch-all — see the header comment
 * on `src/app/(public)/[locale]/layout.tsx`. ADR-005's URLs are unchanged; this
 * function is the whole of the mapping between them and the segment:
 *
 * ```
 *   /            ->  /bn                     Bangla is the unprefixed namespace
 *   /notices     ->  /bn/notices
 *   /en/notices  ->  null                    already internal, passed through
 *   /bn/notices  ->  /__invalid-locale/notices   -> 404, see below
 *   /xx/notices  ->  /bn/xx/notices          a Bangla page that does not exist
 *   /login       ->  null                    not a localized route at all
 * ```
 *
 * `/bn/*` is refused rather than served. Bangla's prefix is the empty string
 * (`prefixForLocale('bn') === ''`), so `/bn/notices` is not a second spelling of
 * `/notices` — it is a URL the site does not have, and rendering content there
 * would split the same page across two indexable addresses. It cannot simply be
 * left alone, because `bn` *is* a routed locale and would match the segment
 * happily; so it is rewritten to a segment that is deliberately not a locale, and
 * the layout's `isLocale` guard turns that into the 404. The decision of what
 * counts as a locale stays in one place.
 */
function localeRewrite(pathname: string): string | null {
  if (!isLocalizedPath(pathname)) return null;

  const [first = ""] = pathname.replace(/^\/+/, "").split("/");

  // An English URL is already the internal form.
  if (first === prefixForLocale("en")) return null;

  // `/bn/*` has no public existence. `/bn` alone included.
  if (first === DEFAULT_LOCALE) {
    return `/${INVALID_LOCALE_SEGMENT}${pathname.slice(DEFAULT_LOCALE.length + 1)}`;
  }

  // Everything else is Bangla, whether or not the page exists.
  return pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
}

/**
 * A segment that is not a routed locale, and cannot become one: `LOCALES` holds
 * BCP-47 codes and none of them can contain an underscore. Rewriting to it is how
 * a refused URL reaches the layout's 404 rather than a page.
 */
const INVALID_LOCALE_SEGMENT = "__invalid-locale";

/**
 * Whether a path belongs to the localized public site.
 *
 * Everything under `(public)` is localized except the auth pages, which sit
 * beside the locale segment rather than under it: `src/app/(public)/login` and
 * `src/app/(public)/reset-password` are single-URL routes with no `/en` twin.
 * Rewriting `/login` to `/bn/login` would 404 a page that works today.
 *
 * (`/en/login` is already broken for a different reason — `toLogin` localizes the
 * path but no English login route exists. That predates this function and is not
 * fixed here; it is recorded in PENDING-COMMIT.md as a defect in a done task.)
 *
 * `/admin/*` never reaches here — the caller checks `isAdminPath` first — and
 * `/api/*`, `_next/*` and anything with a file extension are excluded by the
 * matcher.
 */
function isLocalizedPath(pathname: string): boolean {
  return !UNLOCALIZED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Public routes that live outside the `[locale]` segment. */
const UNLOCALIZED_PREFIXES = ["/login", "/reset-password"] as const;

/** `/admin` and everything under it — but not `/administration`, which is a public page. */
function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * The one admin path a user with the flag set may reach.
 *
 * Matched as a prefix so the page's own `?error=` redirects and its Server
 * Action POST — which posts to this same path — are not bounced back into the
 * redirect that sent the user here, which would be an infinite loop that looks
 * like a broken form.
 */
function isChangePasswordPath(pathname: string): boolean {
  return (
    pathname === CHANGE_PASSWORD_PATH || pathname.startsWith(`${CHANGE_PASSWORD_PATH}/`)
  );
}

/** Where §A-9.2's first-login rotation happens (T-043). */
const CHANGE_PASSWORD_PATH = "/admin/change-password";

/**
 * Whether this user still owes the forced rotation.
 *
 * A second query per admin request, which is a real cost and a deliberate one:
 * the flag has to be read from the row rather than carried in the session,
 * because a Super Admin resetting somebody's password sets it on the row and
 * the effect must be immediate — a copy in a cookie or a token would keep
 * letting them work until they happened to sign out. T-050 loads this user
 * anyway to draw the sidebar; when it does, the two reads should become one.
 */
async function mustChangePassword(userId: bigint): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");

  const [row] = await prisma.$queryRaw<{ must_change_password: boolean }[]>`
    SELECT must_change_password FROM users WHERE id = ${userId}`;

  // No row means the account vanished between the session check and this one.
  // Refusing to redirect would be the fail-open direction; the page behind this
  // does its own check and sends them to the login page.
  return row?.must_change_password ?? false;
}

/** The change-password URL in the request's locale. */
function toChangePassword(request: NextRequest, locale: Locale): URL {
  const url = request.nextUrl.clone();
  url.pathname = localizePath(CHANGE_PASSWORD_PATH, locale);
  url.search = "";
  return url;
}

/**
 * The redirect to the login page, in the locale the request was made in.
 *
 * `next` carries the path that was refused so the login can return the user to
 * it. It is taken from `request.nextUrl` and is therefore always a same-origin
 * path — it is never read from a query parameter or a header, which is what
 * keeps it from becoming an open redirect. Whoever consumes it must still
 * refuse a value that does not start with a single `/`.
 *
 * `no-store` matters on the redirect as much as on the page: a cached 307 from
 * `/admin` to `/login` would follow the next user in, session or not.
 */
function toLogin(request: NextRequest, locale: Locale): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = localizePath("/login", locale);
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

  return withNoStore(NextResponse.redirect(url));
}

/**
 * Marks a response uncacheable at every layer that might otherwise hold it —
 * the CDN in front, the browser behind, and Next's own router cache.
 *
 * §A-6's cache story is built for public pages, which are shared by definition;
 * an admin page is the opposite, and one admin's dashboard served to another
 * from a shared cache is the failure this line exists to prevent.
 */
function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", NO_STORE);
  // Next's client-side Router Cache honours this on a per-navigation basis;
  // without it a prefetched admin route can outlive the session it was fetched
  // under.
  response.headers.set("x-middleware-cache", "no-cache");
  return response;
}
