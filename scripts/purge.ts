/**
 * Retention purge job (T-121) — ARCHITECTURE.md §A-16.1, §A-16.2, §B-13,
 * §A-10.4.
 *
 * Three independent retention promises, each enforced here:
 *
 *     Data                              | Kept for      | §
 *     ----------------------------------|----------------|--------
 *     contact_messages                  | 12 months      | §A-16.1
 *     activity_logs                     | 24 months      | §A-16.1
 *     media_assets (soft-deleted, orphaned) | 30 days    | §A-10.4
 *
 * `tests/gates/retention.test.ts` (T-113) is the gate that watches the first
 * two of these from the outside — it asserts the *outcome* ("no contact
 * message survives past its `purge_after` date") using the exact same two
 * queries this file runs, precisely so the two cannot silently diverge. If
 * this file's SQL and that gate's ever disagree, the gate is where it shows.
 *
 * ## Why this is a standalone script, not `src/lib/*`
 *
 * Same constraint `scripts/backup.ts` (T-120) documents at length: this file
 * is run by `node scripts/purge.ts` directly, with no bundler and no
 * `tsconfig-paths` loader, so nothing in its import graph may contain a `@/*`
 * specifier — `src/lib/prisma.ts`, `src/lib/storage.ts` and
 * `src/lib/modules/media/read.ts` all have one (directly or transitively) and
 * none of them can be imported here. This file therefore constructs its own
 * `PrismaClient` (exactly as `prisma/seed.ts` does) and writes its own minimal
 * S3-compatible `DELETE`, rather than reusing `deleteObject` from
 * `storage.ts`.
 *
 * One consequence is worth calling out rather than quietly working around:
 * `readMediaUsage` in `src/lib/modules/media/read.ts` answers "does anything
 * hold this asset" from a hand-maintained constant, `MEDIA_REFERENCES`,
 * checked by its own test against the live catalogue specifically so it
 * cannot go stale unnoticed. This file cannot import that constant (see
 * above), and copying it by hand would recreate exactly the staleness risk
 * that design was written to avoid — two independent lists that must be kept
 * in sync forever, silently, or a hard delete becomes unsafe. So this file
 * does not copy the list; `loadMediaReferences()` below asks Postgres's own
 * catalogue which columns have a foreign key into `media_assets(id)`, at the
 * start of every run. For a script whose job is an *irreversible* delete,
 * asking the schema directly is the safer of the two failure modes: a new
 * referencing column added by a future migration and never taught to a
 * hand-maintained list would make this job the one place a real usage went
 * unnoticed. The one exclusion that IS a deliberate choice, not a discovery
 * — `media_asset_translations` and `media_variants` — is stated in this
 * file, not inferred: they are the asset's own children (`ON DELETE CASCADE`
 * in migration 0011), not usages of it, the same exclusion `read.ts`'s header
 * documents for the identical reason.
 *
 * ## Order of operations, per asset
 *
 * Storage objects (the variants, then the original) are deleted BEFORE the
 * database row. If a storage delete fails partway, the asset is skipped for
 * this run — its row stays, so it is picked up again next time — rather than
 * risking the reverse: a database row gone while its bytes still sit in the
 * bucket, untracked and now undeletable by anything that walks `media_assets`.
 *
 * ## Privilege, honestly
 *
 * `DELETE FROM activity_logs` is exactly what migration 0013's
 * `REVOKE UPDATE, DELETE ON activity_logs FROM PUBLIC` exists to restrict —
 * append-only holds for "a connection that is neither [table] owner nor
 * superuser" (0013's own comment). This script makes no attempt to be that
 * restricted connection; it runs as whatever `DATABASE_URL` it is given,
 * which today (local dev, CI) is a superuser and therefore bypasses the
 * REVOKE, same as `tests/db/audit-append-only.test.ts`'s own header records.
 * Provisioning a production role that is genuinely neither is T-123's card.
 * If that role cannot delete, this script's audit-log purge fails with
 * SQLSTATE `42501` (insufficient_privilege) and says so plainly — it is
 * caught, reported, and does not take the other two purge categories down
 * with it (see `main()`).
 *
 * ## Run
 *
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/purge.ts --dry-run
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/purge.ts
 *
 * `--dry-run` runs every SELECT this job would run and prints exactly which
 * rows and storage objects a live run would remove — nothing is deleted, no
 * `activity_logs` row is written. This card's Verify line asks for exactly
 * that: "Dry-run mode lists exactly the expected rows; live run deletes only
 * those." `package.json` is outside this card's Files list, so — as
 * `check-i18n-parity.ts` and `scripts/backup.ts` note for the same reason —
 * no npm script is added here; `.github/workflows/purge.yml` invokes the
 * command above on schedule.
 */

import { createHash, createHmac } from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// A minimal S3-compatible DELETE, path-style, SigV4 — see the header for why
// `deleteObject` from `src/lib/storage.ts` (T-037) cannot be imported here.
// Trimmed to the one verb this job needs.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE = "s3";
const ALGORITHM = "AWS4-HMAC-SHA256";

type StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
};

function bucketName(config: StorageConfig, bucket: string): string {
  return bucket === "public" ? config.publicBucket : config.privateBucket;
}

/** Deletes one object. A 404 counts as success — already gone is the goal. */
async function deleteObject(
  config: StorageConfig,
  bucket: string,
  key: string,
): Promise<void> {
  const host = new URL(config.endpoint).host;
  const path = `/${encodeURIComponent(bucketName(config, bucket))}/${encodeKey(key)}`;
  const stamp = timestamps(new Date());
  const payloadHash = createHash("sha256").update(Buffer.alloc(0)).digest("hex");

  const signedFields: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp.iso,
  };
  const names = Object.keys(signedFields).sort();
  const canonicalHeaders = names
    .map((name) => `${name}:${signedFields[name]}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    "DELETE",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${stamp.date}/${config.region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    stamp.iso,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");
  const dateKey = hmac(`AWS4${config.secretAccessKey}`, stamp.date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  const response = await fetch(`${config.endpoint}${path}`, {
    method: "DELETE",
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": stamp.iso,
      authorization: `${ALGORITHM} Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    cache: "no-store",
  });

  if (response.status !== 404 && !response.ok) {
    throw new Error(
      `Storage DELETE ${bucket}/${key} returned ${response.status}: ${await response.text()}`,
    );
  }
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function timestamps(now: Date): { iso: string; date: string } {
  const iso = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  return { iso, date: iso.slice(0, 8) };
}

function loadStorageConfig(): StorageConfig | null {
  const names = [
    "STORAGE_ENDPOINT",
    "STORAGE_REGION",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
    "STORAGE_PUBLIC_BUCKET",
    "STORAGE_PRIVATE_BUCKET",
  ] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) return null;

  return {
    endpoint: process.env.STORAGE_ENDPOINT ?? "",
    region: process.env.STORAGE_REGION ?? "",
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
    publicBucket: process.env.STORAGE_PUBLIC_BUCKET ?? "",
    privateBucket: process.env.STORAGE_PRIVATE_BUCKET ?? "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// One `activity_logs` row per category, per run — the same `SYSTEM_ACTOR`
// shape `@/lib/audit.ts` defines and names this job as a reason for (see that
// file's header). Not imported here for the reason `scripts/backup.ts`'s
// header explains at length: no spelling of that import satisfies both `tsc`
// and `node` at once.
// ─────────────────────────────────────────────────────────────────────────────

async function logRun(
  db: Prisma.TransactionClient,
  moduleCode: string | null,
  entityTable: string | null,
  summary: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO activity_logs (
      actor_user_id, actor_username_snapshot, actor_role_snapshot,
      action_code, module_code, entity_table, entity_id, summary
    )
    VALUES (NULL, 'system', 'system', 'delete', ${moduleCode}, ${entityTable}, NULL, ${summary})`;
}

/** The first few, so a log line stays readable — same cap `media/actions.ts` uses. */
function describeIds(ids: readonly bigint[]): string {
  const shown = ids.slice(0, 10).map((id) => String(id));
  return ids.length > 10
    ? `${shown.join(", ")}, … (${ids.length} total)`
    : shown.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Category 1 — contact messages past `purge_after` (§A-16.1: 12 months)
// ─────────────────────────────────────────────────────────────────────────────

async function overdueContactMessages(
  prisma: PrismaClient,
): Promise<{ id: bigint; purgeAfter: Date }[]> {
  const rows = await prisma.$queryRaw<{ id: bigint; purge_after: Date }[]>`
    SELECT id, purge_after FROM contact_messages
     WHERE purge_after < (now() AT TIME ZONE 'Asia/Dhaka')::date
     ORDER BY id`;
  return rows.map((row) => ({ id: row.id, purgeAfter: row.purge_after }));
}

async function purgeContactMessages(
  prisma: PrismaClient,
  dryRun: boolean,
): Promise<number> {
  const overdue = await overdueContactMessages(prisma);

  if (overdue.length === 0) {
    console.log("contact_messages: nothing past its purge_after date");
    return 0;
  }

  console.log(
    `contact_messages: ${overdue.length} row(s) past purge_after — ${describeIds(overdue.map((r) => r.id))}`,
  );
  if (dryRun) return overdue.length;

  const ids = overdue.map((row) => row.id);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM contact_messages WHERE id = ANY(${ids})`;
    await logRun(
      tx,
      "contact",
      "contact_messages",
      `Purged ${overdue.length} contact message(s) past the 12-month retention window (§A-16.1) — ${describeIds(ids)}`,
    );
  });

  return overdue.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category 2 — audit rows past 24 months (§A-16.1). See the header's
// "Privilege, honestly" section for what happens when the connection cannot.
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_RETENTION_MONTHS = 24;

async function overdueAuditRows(prisma: PrismaClient): Promise<bigint[]> {
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    SELECT id FROM activity_logs
     WHERE created_at < now() - (${AUDIT_RETENTION_MONTHS} || ' months')::interval
     ORDER BY id`;
  return rows.map((row) => row.id);
}

async function purgeAuditLog(prisma: PrismaClient, dryRun: boolean): Promise<number> {
  const overdue = await overdueAuditRows(prisma);

  if (overdue.length === 0) {
    console.log(`activity_logs: nothing past ${AUDIT_RETENTION_MONTHS} months`);
    return 0;
  }

  console.log(
    `activity_logs: ${overdue.length} row(s) past ${AUDIT_RETENTION_MONTHS} months — ${describeIds(overdue)}`,
  );
  if (dryRun) return overdue.length;

  // Deliberately its own statement, not wrapped with the audit row that
  // records it: if the DELETE is refused (insufficient_privilege — see the
  // header), no misleading "purged" row should land either.
  await prisma.$executeRaw`DELETE FROM activity_logs WHERE id = ANY(${overdue})`;
  await logRun(
    prisma,
    null,
    "activity_logs",
    `Purged ${overdue.length} audit row(s) past the ${AUDIT_RETENTION_MONTHS}-month retention window (§A-16.1) — ${describeIds(overdue)}`,
  );

  return overdue.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category 3 — orphaned storage objects (§A-10.4: soft-deleted >30 days,
// referenced by nothing)
// ─────────────────────────────────────────────────────────────────────────────

const ORPHAN_GRACE_DAYS = 30;

type MediaReference = { table: string; column: string };

/** Which columns hold a foreign key into `media_assets(id)` — see the header. */
async function loadMediaReferences(prisma: PrismaClient): Promise<MediaReference[]> {
  const rows = await prisma.$queryRaw<{ ref_table: string; ref_column: string }[]>`
    SELECT tc.table_name AS ref_table, kcu.column_name AS ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND ccu.table_name = 'media_assets'
       AND ccu.column_name = 'id'
       -- The asset's own children (ON DELETE CASCADE), not usages of it —
       -- read.ts's MEDIA_REFERENCES excludes the same two, for the same reason.
       AND tc.table_name NOT IN ('media_asset_translations', 'media_variants')
     ORDER BY 1, 2`;
  return rows.map((row) => ({ table: row.ref_table, column: row.ref_column }));
}

/** Whether anything in `references` still points at this asset. */
async function isReferenced(
  prisma: PrismaClient,
  references: readonly MediaReference[],
  assetId: bigint,
): Promise<boolean> {
  if (references.length === 0) return false;

  const parts = references.map(
    (ref) => Prisma.sql`
      SELECT 1 FROM ${Prisma.raw(`"${ref.table}"`)}
       WHERE ${Prisma.raw(`"${ref.column}"`)} = ${assetId}`,
  );
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (${Prisma.join(parts, " UNION ALL ")}) AS usage_rows`;
  return Number(rows[0]?.n ?? 0n) > 0;
}

type OrphanCandidate = {
  id: bigint;
  bucket: string;
  storageKey: string;
  variantKeys: string[];
};

async function findOrphanedMediaAssets(prisma: PrismaClient): Promise<OrphanCandidate[]> {
  const references = await loadMediaReferences(prisma);

  const deleted = await prisma.$queryRaw<
    { id: bigint; bucket: string; storage_key: string }[]
  >`
    SELECT id, bucket, storage_key FROM media_assets
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - (${ORPHAN_GRACE_DAYS} || ' days')::interval
     ORDER BY id`;

  const orphans: OrphanCandidate[] = [];
  for (const asset of deleted) {
    if (await isReferenced(prisma, references, asset.id)) continue;

    const variants = await prisma.$queryRaw<{ storage_key: string }[]>`
      SELECT storage_key FROM media_variants WHERE media_asset_id = ${asset.id}`;

    orphans.push({
      id: asset.id,
      bucket: asset.bucket,
      storageKey: asset.storage_key,
      variantKeys: variants.map((row) => row.storage_key),
    });
  }

  return orphans;
}

async function purgeOrphanedMedia(
  prisma: PrismaClient,
  storageConfig: StorageConfig | null,
  dryRun: boolean,
): Promise<number> {
  const orphans = await findOrphanedMediaAssets(prisma);

  if (orphans.length === 0) {
    console.log(`media_assets: no orphan older than ${ORPHAN_GRACE_DAYS} days`);
    return 0;
  }

  console.log(
    `media_assets: ${orphans.length} orphan(s) older than ${ORPHAN_GRACE_DAYS} days — ` +
      describeIds(orphans.map((o) => o.id)),
  );
  if (dryRun) return orphans.length;

  if (storageConfig === null) {
    throw new Error(
      "media_assets has orphans to purge, but STORAGE_* is not fully configured — " +
        "refusing to hard-delete rows without first confirming their storage objects are gone",
    );
  }

  let purged = 0;
  for (const orphan of orphans) {
    try {
      for (const key of orphan.variantKeys) {
        await deleteObject(storageConfig, orphan.bucket, key);
      }
      await deleteObject(storageConfig, orphan.bucket, orphan.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `media_assets #${orphan.id}: storage delete failed, skipping this run — ${message}`,
      );
      continue;
    }

    // The DB row is removed only after its storage objects are confirmed
    // gone — see the header's "Order of operations" section.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM media_assets WHERE id = ${orphan.id}`;
      await logRun(
        tx,
        "media",
        "media_assets",
        `Purged orphaned media asset #${orphan.id} (${orphan.storageKey}) — soft-deleted ` +
          `>${ORPHAN_GRACE_DAYS} days ago, referenced by nothing (§A-10.4)`,
      );
    });
    purged += 1;
  }

  return purged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  const storageConfig = loadStorageConfig();

  console.log(
    `Retention purge — ${dryRun ? "DRY RUN (nothing will be deleted)" : "LIVE"}`,
  );

  const failures: string[] = [];
  let messagesPurged = 0;
  let auditRowsPurged = 0;
  let mediaPurged = 0;

  try {
    messagesPurged = await purgeContactMessages(prisma, dryRun);
  } catch (error) {
    failures.push(
      `contact_messages: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    auditRowsPurged = await purgeAuditLog(prisma, dryRun);
  } catch (error) {
    failures.push(
      `activity_logs: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    mediaPurged = await purgeOrphanedMedia(prisma, storageConfig, dryRun);
  } catch (error) {
    failures.push(
      `media_assets: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await prisma.$disconnect();

  console.log(
    `\nSummary — contact_messages: ${messagesPurged}, activity_logs: ${auditRowsPurged}, ` +
      `media_assets: ${mediaPurged}${dryRun ? " (dry run — nothing deleted)" : ""}`,
  );

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} categor${failures.length === 1 ? "y" : "ies"} failed:\n  ${failures.join("\n  ")}`,
    );
  }
}

/**
 * Runs `main()` only when this file is executed directly — see
 * `scripts/backup.ts`'s identical guard for why (a future test importing this
 * module for `classifyRetention`-style pure helpers should not also run a
 * live purge). `process.argv[1]` rather than an `import.meta` check, for the
 * same reason `check-i18n-parity.ts`'s header gives.
 */
const invokedDirectly =
  process.argv[1] !== undefined && /purge\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error::Purge job failed: ${message}`);
    } else {
      console.error(`Purge job failed: ${message}`);
    }
    process.exitCode = 1;
  });
}
