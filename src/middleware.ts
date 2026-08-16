/**
 * Request middleware (T-041), per ARCHITECTURE.md §A-6 and §A-9.2.
 *
 * Two jobs, and §A-6's lifecycle diagram is the whole specification for both:
 *
 *  - **Public request** — resolve the locale from the path prefix, never from a
 *    cookie or `Accept-Language`, and hand it to the render as a request header.
 *  - **Admin request** — session cookie → `sessions.token_hash` lookup →
 *    `revoked_at IS NULL`? — and send anyone without a live session to `/login`
 *    with a `next` parameter, plus `no-store` on everything under `/admin`.
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
import { localizePath, resolveLocaleFromPath, type Locale } from "@/lib/locale";
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
    return NextResponse.next({ request: { headers } });
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

  const response = NextResponse.next({ request: { headers } });
  return withNoStore(response);
}

/** `/admin` and everything under it — but not `/administration`, which is a public page. */
function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
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
