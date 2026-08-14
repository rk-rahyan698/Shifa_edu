import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Unit-test runner for the pipeline in ARCHITECTURE.md §A-14.2.
 *
 * T-005 stands this up with no tests of its own; `--passWithNoTests` in the
 * `test` script keeps the suite green until the first real spec lands. Every
 * later task adds its tests here rather than to a runner of its own — the
 * pipeline is never bypassed (T-005 Contract).
 *
 * The environment is `node`, not `jsdom`: everything tested in M2/M8 is
 * server-side — the permission engine (T-031), repositories and constraints
 * (T-111), the authorization matrix (T-110). A task that needs to render a
 * component adds `jsdom` and the DOM testing libraries at that point.
 *
 * Browser-driven journeys are out of scope here; E2E is Playwright in T-112.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    // E2E specs are Playwright's (T-112) and must not be collected by Vitest.
    exclude: ['node_modules/**', '.next/**', 'tests/e2e/**'],
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    // Mirrors the `@/* -> src/*` alias in tsconfig.json (T-001 Contract).
    // Resolved from the working directory rather than `__dirname`: this file is
    // TypeScript in a CommonJS package, and reaching for a CJS global here mixes
    // module systems in a way Vite's next config loader rejects.
    alias: {
      '@': resolve(process.cwd(), 'src'),
    },
  },
});
