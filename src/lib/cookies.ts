/**
 * The session cookie (T-032), per ARCHITECTURE.md §A-9.2.
 *
 * The cookie carries an opaque random token and nothing else — no user id, no
 * role, no expiry the client could edit. Everything that matters about a
 * session is a row in `sessions`, and `verifySession` reads it on every
 * request. A tampered or forged cookie value simply fails to match a
 * `token_hash` and is treated as no session at all.
 *
 * Attributes are fixed by §A-9.2 and are not configurable: `HttpOnly` so script
 * cannot read the token, `Secure` so it never crosses plaintext, `SameSite=Lax`
 * so a cross-site POST cannot ride the admin's session while ordinary top-level
 * navigation still works. `Secure` is set unconditionally rather than only in
 * production — browsers treat `http://localhost` as a secure context and accept
 * Secure cookies there, so `next dev` is unaffected and no environment can
 * accidentally ship the weaker cookie.
 */

/**
 * The cookie name. Deliberately not `__Host-` prefixed: that prefix forbids a
 * `Domain` attribute and pins `Path=/`, which this cookie already satisfies,
 * but it also makes the name itself load-bearing across proxies. If the deploy
 * in T-123 terminates TLS cleanly, promoting this to `__Host-shifa_session` is
 * a one-line change with no behavioural difference here.
 */
export const SESSION_COOKIE = "shifa_session";

/** The attribute set §A-9.2 mandates. `Partial` of Next's cookie options, by shape. */
export type SessionCookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  expires: Date;
};

/**
 * Cookie attributes for a session that ends at `expiresAt`.
 *
 * `expires` is the session's **absolute** deadline, not the idle one. The
 * client's copy of an expiry is a convenience for the browser's own cleanup and
 * is never trusted: the 8h idle window is enforced server-side against
 * `sessions.last_seen_at`, where the client cannot reach it.
 */
export function sessionCookieOptions(expiresAt: Date): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  };
}

/**
 * Attributes that delete the cookie. Same name, path and flags — a browser only
 * replaces a cookie when those match — with an expiry in the past.
 */
export function clearedSessionCookieOptions(): SessionCookieOptions {
  return sessionCookieOptions(new Date(0));
}

/**
 * `next/headers` is imported inside each function rather than at module scope so
 * that the pure builders above stay usable outside a request — in tests, and in
 * T-041's middleware, which works with its own request and response objects.
 */
async function cookieStore() {
  const { cookies } = await import("next/headers");
  return cookies();
}

/** Writes the session cookie. Server Actions and Route Handlers only. */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookieStore();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

/** The raw token from the request, or `null` when no session cookie was sent. */
export async function readSessionCookie(): Promise<string | null> {
  const store = await cookieStore();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Deletes the session cookie. Logout must also call `revokeSession` — clearing
 * the cookie alone leaves the row live, and a copied token would still work.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookieStore();
  store.set(SESSION_COOKIE, "", clearedSessionCookieOptions());
}
