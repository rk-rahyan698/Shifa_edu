/**
 * `robots.txt` (T-100) — PRODUCT-SPEC.md §P-9 ("allow public, disallow
 * `/admin`"), ARCHITECTURE.md §A-12.
 *
 * `/admin` is already unreachable without a live session — `src/middleware.ts`
 * redirects, and every Server Action calls `assertCan()` for itself. This file
 * is not a second lock and must never be mistaken for one: `robots.txt` is a
 * request to well-behaved crawlers and is readable by anyone, so what it lists
 * is public information. It is here so the admin panel does not appear in search
 * results, not so it cannot be reached.
 *
 * Which is also why the disallow list is short. Enumerating internal paths in a
 * world-readable file is a reconnaissance gift, and every path below is one a
 * visitor can already discover from the site itself.
 */

import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // The admin panel, and the auth pages that only exist to reach it.
        "/admin",
        "/login",
        "/reset-password",
        // Route handlers answer with JSON and status codes, never with a page
        // worth indexing.
        "/api/",
        // ADR-005 gives Bangla the bare path; `/bn/*` is rewritten to a 404 by
        // the middleware. Saying so here stops a crawler that guessed the
        // symmetric scheme from spending its budget on 404s.
        "/bn/",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
