/**
 * Runs once after both projects and leaves the database as the suite found it,
 * within the limits `db.ts` records: the notices, the contact messages and the
 * synthetic rate-limit buckets go; the append-only `activity_logs` rows and the
 * admin sessions stay.
 *
 * It runs on a failing run too — Playwright calls a global teardown whatever
 * the result — which is what stops one red run from poisoning the next with a
 * duplicate slug.
 */

import { cleanup, disconnect } from "./db";

export default async function globalTeardown(): Promise<void> {
  try {
    await cleanup();
  } finally {
    await disconnect();
  }
}
