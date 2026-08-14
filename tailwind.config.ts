import type { Config } from "tailwindcss";

// T-002 — design tokens.
//
// Every value below points at a CSS custom property declared in
// `src/app/globals.css` (ARCHITECTURE.md §A-8.1 / §A-8.2). This file and that
// stylesheet are the only two places a hex literal may appear; components use
// the token names.
//
// Note: because the colour tokens resolve to hex strings rather than channel
// triplets, Tailwind's slash-opacity syntax (`bg-primary/40`) does not apply to
// them. Use an opacity utility on the element instead.
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          muted: "var(--color-ink-muted)",
        },
        accent: {
          // Decorative only on light backgrounds — design-system.md §2.4, §9.
          DEFAULT: "var(--color-accent)",
          tint: "var(--color-accent-tint)",
        },
        teal: "var(--color-teal)",
        khaki: "var(--color-khaki)",
        surface: {
          DEFAULT: "var(--color-surface)",
          alt: "var(--color-surface-alt)",
        },
        border: "var(--color-border)",
        // Icons, borders and fills only — 4.02:1 fails AA for text (§9).
        success: "var(--color-success)",
        danger: "var(--color-danger)",
      },
      fontFamily: {
        heading: ["var(--font-heading)"],
        body: ["var(--font-body)"],
        // Defaults point at the same stacks so unclassed text still resolves.
        sans: ["var(--font-body)"],
        serif: ["var(--font-heading)"],
      },
      fontSize: {
        // design-system.md §3.3. The headings interpolate between the mobile
        // and desktop ends of the scale; body sizes are script-dependent and
        // deliberately do not shrink on mobile (§3.4).
        h1: ["clamp(2rem, 1.15rem + 3.4vw, 3.5rem)", { lineHeight: "1.15" }],
        h2: ["clamp(1.625rem, 1.3rem + 1.3vw, 2.25rem)", { lineHeight: "1.25" }],
        h3: ["clamp(1.375rem, 1.3rem + 0.3vw, 1.5rem)", { lineHeight: "1.3" }],
        body: ["1rem", { lineHeight: "1.6" }],
        "body-lg": ["1.125rem", { lineHeight: "1.6" }],
        // Bangla body floor: 17px / 1.75 (§3.4).
        "body-bn": ["1.0625rem", { lineHeight: "1.75" }],
        "body-bn-lg": ["1.1875rem", { lineHeight: "1.75" }],
        caption: ["0.875rem", { lineHeight: "1.6" }],
        control: ["0.9375rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        btn: "0.5rem",
        card: "0.75rem",
      },
      borderWidth: {
        rule: "2px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
