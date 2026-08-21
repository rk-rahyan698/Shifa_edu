/**
 * Observability: uptime, error tracking, auth anomaly and backup-failure
 * alerts (T-122) — ARCHITECTURE.md §A-15.
 *
 *     Signal          | Tool                      | Alert
 *     Uptime           | External monitor, 5-min   | 2 consecutive failures -> owner
 *     Errors           | Sentry (free tier)         | New error type, or >10/hour
 *     Auth anomalies    | login_attempts query       | >20 failures/hour for one username
 *     Backups           | Job status                  | Any failure -> immediate
 *
 * Uptime is deliberately NOT built here. §A-15 names it an **external**
 * monitor, not application code — `docs/RUNBOOK.md`'s new "Monitoring &
 * alerting" section (this card's own file) is where an operator sets one up
 * and points it at `NEXT_PUBLIC_SITE_URL`. Everything else in the table above
 * is this file.
 *
 * ## Why this file has no `@/*` import, and doubles as a CLI
 *
 * `.github/workflows/keepalive.yml` (this card's own file) needs to invoke
 * something on a schedule with no bundler in front of it — the same
 * constraint `scripts/backup.ts`'s header documents at length: nothing that
 * imports `@/lib/env` (or anything that transitively does) can be run by
 * plain `node`. Rather than write a second `scripts/*.ts` file that
 * duplicates this one, the way `scripts/purge.ts` duplicates `storage.ts`'s
 * S3 client, this module is written to work both ways from the start: every
 * export reads configuration from `process.env` directly, and the bottom of
 * the file is a small CLI — the same `invokedDirectly` guard `backup.ts` and
 * `purge.ts` use — so
 *
 *     node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON src/lib/monitoring.ts --check-auth-anomalies
 *
 * works precisely as `node scripts/purge.ts --dry-run` does, while
 * `import { captureException } from "@/lib/monitoring"` also works from
 * inside the Next.js app once a later task wires a call site (see "What is
 * NOT wired yet" below).
 *
 * ## Sentry, hand-rolled
 *
 * `package.json` is outside this card's Files list — the same constraint
 * `storage.ts` (T-037) and `mail.ts` (T-042) both name in their own headers —
 * so `@sentry/node` cannot be added. Sentry's ingest API is a documented,
 * stable HTTP contract: parse the DSN, POST a newline-delimited envelope to
 * `<host>/api/<projectId>/envelope/` with an `X-Sentry-Auth` header.
 * `sendToSentry` below is a direct, dependency-free implementation of exactly
 * that and nothing more — in particular, `exception.stacktrace` is NOT
 * parsed into Sentry's structured frame format; the raw stack string rides
 * along in `extra.stack` instead, which is enough to read in the Sentry UI
 * without pretending to be a symbolicated trace.
 *
 * ## What is NOT wired yet, and why that is this card's boundary, not a gap
 *
 * `captureException` is exported and proven end-to-end by `--sentry-self-test`
 * below, but nothing in the running application calls it yet: doing so would
 * mean editing a `catch` block inside a Server Action, a Route Handler, or
 * `middleware.ts` — every one of them a `done` card's file, outside this
 * card's Files list, the same boundary T-105, T-115, T-116 and T-117 hit
 * before it. Wiring a process-wide handler is exactly what Next's own
 * `instrumentation.ts` / `onRequestError` hook is for, and that file does not
 * exist yet either — also outside this card's Files list to create. Recorded
 * here rather than silently left undone; see `PENDING-COMMIT.md`.
 */

import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// §A-15's auth-anomaly threshold, verbatim.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_ANOMALY_THRESHOLD = 20;

/** A read handle: the shared client, an open transaction, or a test double. */
type Db = Pick<PrismaClient, "$queryRaw">;

export type AuthAnomaly = { username: string; failureCount: number };

/**
 * Every username with more than `AUTH_ANOMALY_THRESHOLD` failed logins in the
 * last hour — §A-15's exact wording, ">20 failures/hour for one username".
 * `login_attempts` and its `ix_login_attempts_window` index are T-033's.
 */
export async function findAuthAnomalies(db: Db): Promise<AuthAnomaly[]> {
  const rows = await db.$queryRaw<{ username_attempted: string; failures: bigint }[]>`
    SELECT username_attempted, count(*) AS failures
      FROM login_attempts
     WHERE succeeded = FALSE
       AND attempted_at > now() - interval '1 hour'
     GROUP BY username_attempted
    HAVING count(*) > ${AUTH_ANOMALY_THRESHOLD}
     ORDER BY failures DESC`;

  return rows.map((row) => ({
    username: row.username_attempted,
    failureCount: Number(row.failures),
  }));
}

/** A cheap keepalive ping — §A-14.3's "free-tier risk" row. */
export async function keepaliveDb(db: Db): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentry — DSN parsing, envelope construction, delivery.
// ─────────────────────────────────────────────────────────────────────────────

const SENTRY_CLIENT_NAME = "shifa-international-school-monitoring";
const SENTRY_CLIENT_VERSION = "1.0.0";

export type SentryDsn = {
  publicKey: string;
  host: string;
  /** Everything between the host and `/api` — empty for a sentry.io project, non-empty for a self-hosted install under a path. */
  pathPrefix: string;
  projectId: string;
};

/**
 * A Sentry DSN looks like `https://<publicKey>@<host>/<projectId>` for
 * sentry.io, or `https://<publicKey>@<host>/<path>/<projectId>` for a
 * self-hosted install mounted under a path. The project id is always the
 * last path segment; anything before it is the install's own path prefix.
 */
export function parseSentryDsn(dsn: string): SentryDsn {
  const url = new URL(dsn);
  const publicKey = url.username;
  if (publicKey === "") throw new Error(`SENTRY_DSN has no public key: ${redact(dsn)}`);

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const projectId = segments.pop();
  if (projectId === undefined || projectId === "") {
    throw new Error(`SENTRY_DSN has no project id: ${redact(dsn)}`);
  }

  return {
    publicKey,
    host: url.host,
    pathPrefix: segments.length > 0 ? `/${segments.join("/")}` : "",
    projectId,
  };
}

/** The ingest endpoint a parsed DSN's envelope is POSTed to. */
export function sentryIngestUrl(dsn: SentryDsn): string {
  return `https://${dsn.host}${dsn.pathPrefix}/api/${dsn.projectId}/envelope/`;
}

/** DSN with the secret key removed — the only form that may reach a log or an error message. */
function redact(dsn: string): string {
  try {
    const url = new URL(dsn);
    return `https://${url.host}${url.pathname}`;
  } catch {
    return "(unparseable DSN)";
  }
}

export type SentryEvent = {
  event_id: string;
  timestamp: string;
  level: "error" | "warning" | "info";
  message?: string;
  exception?: { values: { type: string; value: string }[] };
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

/** The two-line-header-plus-payload envelope format Sentry's ingest API requires. */
export function buildSentryEnvelope(dsn: SentryDsn, event: SentryEvent): string {
  const envelopeHeader = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    dsn: `https://${dsn.publicKey}@${dsn.host}${dsn.pathPrefix}/${dsn.projectId}`,
  });
  const itemHeader = JSON.stringify({ type: "event" });
  const itemPayload = JSON.stringify(event);
  return `${envelopeHeader}\n${itemHeader}\n${itemPayload}\n`;
}

/** POSTs one event. Throws on anything other than a 2xx — see `dispatchToSentry` for the no-DSN case. */
export async function sendToSentry(rawDsn: string, event: SentryEvent): Promise<void> {
  const dsn = parseSentryDsn(rawDsn);
  const envelope = buildSentryEnvelope(dsn, event);
  const authHeader =
    `Sentry sentry_version=7, sentry_client=${SENTRY_CLIENT_NAME}/${SENTRY_CLIENT_VERSION}, ` +
    `sentry_key=${dsn.publicKey}`;

  const response = await fetch(sentryIngestUrl(dsn), {
    method: "POST",
    headers: {
      "content-type": "application/x-sentry-envelope",
      "x-sentry-auth": authHeader,
    },
    body: envelope,
  });

  if (!response.ok) {
    throw new Error(
      `Sentry ingest returned ${response.status}: ${await response.text()}`,
    );
  }
}

function newEventId(): string {
  return randomUUID().replace(/-/g, "");
}

/**
 * Reports an error to Sentry. A no-op (loud on the local log, not thrown) when
 * `SENTRY_DSN` is not configured — the same "optional secret, degrade
 * loudly rather than crash" shape `scripts/purge.ts`'s `loadStorageConfig`
 * uses for `STORAGE_*`. `--sentry-self-test` below is the one caller that
 * treats a missing DSN as an error, because its entire job is proving
 * delivery.
 */
export async function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Error";
  const stack = error instanceof Error ? error.stack : undefined;

  const event: SentryEvent = {
    event_id: newEventId(),
    timestamp: new Date().toISOString(),
    level: "error",
    exception: { values: [{ type: name, value: message }] },
    extra: stack === undefined ? context : { ...context, stack },
  };

  await dispatchToSentry(event);
}

/** Reports a message (no exception object) — for the auth-anomaly and backup-failure signals. */
export async function captureMessage(
  message: string,
  level: "error" | "warning" = "warning",
  context?: Record<string, unknown>,
): Promise<void> {
  const event: SentryEvent = {
    event_id: newEventId(),
    timestamp: new Date().toISOString(),
    level,
    message,
    extra: context,
  };

  await dispatchToSentry(event);
}

async function dispatchToSentry(event: SentryEvent): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (dsn === undefined || dsn === "") {
    console.error(
      `[monitoring] SENTRY_DSN not configured — event logged locally only:`,
      event,
    );
    return;
  }
  await sendToSentry(dsn, event);
}

// ─────────────────────────────────────────────────────────────────────────────
// The owner-paging channel — auth anomalies and backup/purge job failures.
// ─────────────────────────────────────────────────────────────────────────────

export type AlertSeverity = "warning" | "critical";

/**
 * Pages the owner. Always fails loud first — a GitHub Actions `::error::`
 * annotation (or a plain `console.error` outside CI), the exact mechanism
 * `scripts/backup.ts`'s header names as "a real alert, not a placeholder" —
 * and then, when `ALERT_WEBHOOK_URL` is configured, POSTs a JSON payload
 * shaped for a generic incoming webhook (Slack- and Discord-compatible: both
 * accept `{ "text": "..." }`; `docs/RUNBOOK.md` documents pointing this at
 * either, or at a service that turns a webhook into an email).
 */
export async function notifyOwner(
  message: string,
  severity: AlertSeverity = "warning",
): Promise<void> {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error(`::error::${message}`);
  } else {
    console.error(`[monitoring] ALERT (${severity}): ${message}`);
  }

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl === undefined || webhookUrl === "") {
    console.warn(
      "[monitoring] ALERT_WEBHOOK_URL is not configured — the alert above was logged, " +
        "not paged. See docs/RUNBOOK.md's Monitoring & alerting section.",
    );
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `[Shifa International School] ${severity.toUpperCase()}: ${message}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Alert webhook returned ${response.status}: ${await response.text()}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI — invoked by `.github/workflows/keepalive.yml`. See the header for why
// this file, not a separate `scripts/*.ts`, is what runs on the schedule.
// ─────────────────────────────────────────────────────────────────────────────

async function runKeepalive(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await keepaliveDb(prisma);
    console.log("Keepalive: SELECT 1 succeeded.");
  } finally {
    await prisma.$disconnect();
  }
}

async function runAuthAnomalyCheck(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const anomalies = await findAuthAnomalies(prisma);

    if (anomalies.length === 0) {
      console.log("Auth anomaly check: no username over 20 failures in the last hour.");
      return;
    }

    for (const anomaly of anomalies) {
      const message =
        `${anomaly.failureCount} failed login attempts for "${anomaly.username}" in the ` +
        `last hour (§A-15 threshold: ${AUTH_ANOMALY_THRESHOLD}).`;
      await notifyOwner(message, "critical");
      await captureMessage(message, "warning", { username: anomaly.username });
    }

    throw new Error(
      `${anomalies.length} username(s) over the auth-anomaly threshold — alerted above.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function runJobFailureAlert(jobName: string | undefined): Promise<void> {
  if (jobName === undefined || jobName === "") {
    throw new Error("--alert-job-failure requires a job name argument");
  }
  const message = `Scheduled job "${jobName}" failed. See the workflow run for the full log.`;
  await notifyOwner(message, "critical");
  await captureMessage(message, "error", { job: jobName });
}

/** Proves Sentry delivery for real. Requires `SENTRY_DSN` — a missing one is the test failing, not skipping. */
async function runSentrySelfTest(): Promise<void> {
  if (process.env.SENTRY_DSN === undefined || process.env.SENTRY_DSN === "") {
    throw new Error(
      "--sentry-self-test requires SENTRY_DSN to be set — nothing to prove otherwise.",
    );
  }
  await sendToSentry(process.env.SENTRY_DSN, {
    event_id: newEventId(),
    timestamp: new Date().toISOString(),
    level: "error",
    exception: {
      values: [
        {
          type: "T122SelfTest",
          value: "T-122 Sentry self-test — safe to ignore/resolve.",
        },
      ],
    },
  });
  console.log("Sentry self-test: event accepted (2xx from the ingest API).");
}

/** Proves the alert webhook end to end — the "simulated outage" the card's Verify line names. */
async function runWebhookSelfTest(): Promise<void> {
  if (
    process.env.ALERT_WEBHOOK_URL === undefined ||
    process.env.ALERT_WEBHOOK_URL === ""
  ) {
    throw new Error(
      "--webhook-self-test requires ALERT_WEBHOOK_URL to be set — nothing to prove otherwise.",
    );
  }
  await notifyOwner("T-122 alert channel self-test — safe to ignore.", "warning");
  console.log("Webhook self-test: alert accepted (2xx from the webhook).");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--keepalive")) return runKeepalive();
  if (args.includes("--check-auth-anomalies")) return runAuthAnomalyCheck();
  if (args.includes("--sentry-self-test")) return runSentrySelfTest();
  if (args.includes("--webhook-self-test")) return runWebhookSelfTest();

  const jobFailureFlag = args.indexOf("--alert-job-failure");
  if (jobFailureFlag !== -1) return runJobFailureAlert(args[jobFailureFlag + 1]);

  throw new Error(
    "No recognised flag. Usage: --keepalive | --check-auth-anomalies | " +
      "--alert-job-failure <name> | --sentry-self-test | --webhook-self-test",
  );
}

/**
 * Runs `main()` only when this file is executed directly — the same guard
 * `scripts/backup.ts` and `scripts/purge.ts` use, and for the same reason: it
 * lets `monitoring.test.ts` import this module's pure functions without also
 * running a CLI command against a live database or network.
 */
const invokedDirectly =
  process.argv[1] !== undefined && /monitoring\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error::Monitoring check failed: ${message}`);
    } else {
      console.error(`Monitoring check failed: ${message}`);
    }
    process.exitCode = 1;
  });
}
