/**
 * The single Prisma client for the application.
 *
 * The contract (BUILD-TRACKER T-004): `prisma` is imported from here and
 * nowhere else. Constructing `new PrismaClient()` per module would open a new
 * connection pool per module, and under Next.js dev hot-reload a new pool per
 * edit, until Postgres refuses connections.
 *
 * The client is cached on `globalThis` so hot-reload reuses one instance.
 * Production builds run once, so the global is a development concern only.
 */

import { PrismaClient } from '@prisma/client';

import { env } from '@/lib/env';

const isProduction = env.NODE_ENV === 'production';

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    // Queries are noisy; in development the slow-query and error signal is what
    // matters. Production logs errors only — query text can carry personal data
    // and must not reach the log stream (§A-12).
    log: isProduction ? ['error'] : ['warn', 'error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
