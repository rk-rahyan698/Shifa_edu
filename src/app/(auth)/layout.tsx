/**
 * The root layout for the unauthenticated credential pages (T-104).
 *
 * `/login`, `/reset-password` and `/reset-password/[token]` sit outside the
 * `[locale]` segment on purpose — ADR-005 gives them no locale prefix, and
 * `/en/login` does not exist (a known gap, recorded in SESSION-LOG.md since
 * B-6). They are therefore Bangla documents, and `lang="bn"` here is a
 * statement of fact rather than the placeholder the old shared root layout
 * used to apply to every page in the app.
 *
 * These pages resolve their *copy* through `useLocale()`, which reads the URL
 * (§A-7.1). With no English URL to read, that resolves to Bangla too, so the
 * document language and the rendered language agree. **If `/en/login` is ever
 * added, this layout has to become locale-aware with it** — otherwise it
 * reintroduces exactly the WCAG 3.1.1 defect T-104 removed.
 *
 * Why this file exists at all: `src/app/layout.tsx` was deleted so the public
 * subtree could set `<html lang>` from its own `[locale]` segment. Next allows
 * that only when every top-level route group brings its own root layout — see
 * the long note in `src/app/(public)/[locale]/layout.tsx`.
 */

import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Shifa International School",
};

export default function AuthRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn" dir="ltr">
      {/* `text-body-bn` rather than the inherited default: `globals.css` keys
          Bangla's 17px/1.75 floor off `html:lang(bn)`, and naming it here keeps
          these pages on the same metrics as the rest of the Bangla site
          (design-system.md §3.4). */}
      <body className="text-body-bn">{children}</body>
    </html>
  );
}
