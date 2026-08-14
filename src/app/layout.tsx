import type { Metadata } from "next";

import "./globals.css";

// Scaffold only (T-001). The real bilingual shell — <html lang>, dir, header,
// footer, language switcher — is T-080; fonts are T-002.
export const metadata: Metadata = {
  title: "Shifa International School",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
