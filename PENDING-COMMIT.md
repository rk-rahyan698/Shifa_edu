T-001: Repo, Next.js, TypeScript, Tailwind

Adds the code scaffold around the existing documentation set. No documentation
file was reformatted; README.md and build-state.json are the only pre-existing
files touched, both additively.

Stack
- Next.js 15.5.23 (App Router), React 19.2.8
- TypeScript 5.9.3, strict, plus noUncheckedIndexedAccess / noImplicitOverride /
  noFallthroughCasesInSwitch
- Tailwind CSS 3.4.19 + PostCSS + Autoprefixer
- ESLint 8.57.1 (next/core-web-vitals + next/typescript + prettier), Prettier 3.9.6

Added
- package.json      scripts: dev, build, start, lint, typecheck, format, format:check
- tsconfig.json     strict mode; `@/*` -> `src/*` (the published contract)
- next.config.js    reactStrictMode, poweredByHeader off, outputFileTracingRoot
                    pinned to the repo so Next stops resolving a stray parent
                    lockfile as the workspace root
- tailwind.config.ts  content globs only; theme left empty for T-002
- .eslintrc, .prettierrc, .editorconfig
- src/app/layout.tsx, src/app/page.tsx  boots to a blank page
- src/app/globals.css                   the three Tailwind directives only
- src/{components,lib,i18n,types}/index.ts  empty placeholders

Changed
- .gitignore   extended with node/next/env/editor entries (kept `.claude/`)
- README.md    "documentation only" corrected to reflect the scaffold; added a
               "Running the scaffold" section with the script table
- build-state.json  T-001 -> done, progress 1/77, session_log entry, updated_by

Two judgement calls worth a look at review
1. PostCSS is configured through the `postcss` key in package.json rather than a
   `postcss.config.js`. Tailwind needs a PostCSS config, but `postcss.config.js`
   is not in the card's Files list; the package.json key is a config location
   Next.js supports natively and keeps the task inside its declared scope. The
   build log confirms Tailwind ran.
2. The card's Files line reads `src/**` (empty index files only). Creating
   `src/app/globals.css` is a mild stretch of "index files", but the card's title
   names Tailwind and its Stop line requires the app to boot, so a CSS entry is
   unavoidable. It holds nothing but the three `@tailwind` directives; T-002 owns
   the same path and extends it with the tokens, which the tracker's rule 2
   allows.

Also note: `npm run format` / `format:check` are scoped to the code (src and the
root config files) rather than the whole tree, because the card forbids
reformatting the six documentation files and `.prettierignore` is not in the
Files list.

Verify (all pass)
- npm run build      clean, 4 static routes
- tsc --noEmit       clean
- npm run lint       clean
- npm run dev        HTTP 200 on `/`, renders `<html lang="bn">` with the
                     stylesheet linked
- `@/` alias resolution checked with a temporary probe file, since later tasks
  depend on it as a contract; the probe was deleted afterwards
