/**
 * Database-facing TypeScript surface (T-023).
 *
 * The Prisma client generated from `prisma/schema.prisma` is the only typed
 * gateway to the database, and that schema is a client over authoritative SQL
 * (ARCHITECTURE.md §B-18). This module re-exports the generated types under
 * stable names and adds the type-level vocabulary the repositories in M2 will
 * be written against.
 *
 * Types only. No queries, no repositories, no client instance — `src/lib/prisma.ts`
 * owns the singleton and M2 owns the read paths.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

export type { Prisma, PrismaClient };

/**
 * Anything that can run a query: the client itself, or the transaction handle
 * Prisma hands to `$transaction`. Repositories should accept this rather than
 * `PrismaClient`, so the same function works inside and outside a transaction.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Locale codes are rows in `locales`, not a union baked into the build — adding
 * a locale is an INSERT, not a deploy (ADR-002, §B-3). `string` is therefore the
 * honest type; `DEFAULT_LOCALE` is a convenience for the two Phase 1 locales
 * (§A-7.1) and must never become the definition of what a locale may be.
 */
export type LocaleCode = string;
export const DEFAULT_LOCALE: LocaleCode = 'bn';

/** The primary key shape used by every translation table: parent + locale. */
export type TranslationKey<K extends string> = { [P in K]: bigint } & {
  localeCode: LocaleCode;
};

/**
 * A read model, per §B-18: the parent row and one resolved translation merged
 * into a single flat object. Page components never see a `*Translations` array,
 * so a repository return type should be `Localized<Faculty, FacultyTranslation>`
 * and never the raw relation.
 *
 * `Omit` drops the translation's own key columns — the parent id and the locale
 * are already known to the caller that asked for them.
 */
export type Localized<Base, Translation> = Base &
  Omit<Translation, 'localeCode' | `${string}Id`> & {
    /** Which locale actually supplied the text, after §A-7.3 fallback. */
    resolvedLocale: LocaleCode;
  };

/**
 * True when the resolved text came from the fallback locale rather than the
 * requested one. §A-7.3 requires the UI to be able to say so.
 */
export type FallbackFlag = { isFallback: boolean };

/**
 * `contact_messages.purge_after` is `GENERATED ALWAYS … STORED` and is `@ignore`d
 * in the Prisma schema so no generated type can offer to write it. A reader
 * (T-121's purge job) gets it through a raw query and shapes it with this.
 */
export type PurgeCandidate = {
  id: bigint;
  purgeAfter: Date;
};
