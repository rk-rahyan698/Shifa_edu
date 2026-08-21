/**
 * Unit coverage for the pure logic in `monitoring.ts` (T-122): DSN parsing,
 * envelope shape, the auth-anomaly query's threshold and grouping, and the
 * alert channel's degrade-loudly-without-a-webhook behaviour.
 *
 * Nothing here opens a socket or a database connection — `findAuthAnomalies`
 * is exercised against a stub `Db` (its whole contract is "call `$queryRaw`
 * and return what it's given"), and `sendToSentry`/`notifyOwner` are
 * exercised against a stubbed `fetch`, matching the network-free style
 * `mutate.test.ts` and `rate-limit.test.ts` already use for this codebase.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildSentryEnvelope,
  captureException,
  findAuthAnomalies,
  keepaliveDb,
  notifyOwner,
  parseSentryDsn,
  sentryIngestUrl,
  sendToSentry,
} from "./monitoring";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("parseSentryDsn", () => {
  it("parses a sentry.io-shaped DSN", () => {
    const dsn = parseSentryDsn("https://abc123@o123.ingest.sentry.io/456");
    expect(dsn).toEqual({
      publicKey: "abc123",
      host: "o123.ingest.sentry.io",
      pathPrefix: "",
      projectId: "456",
    });
  });

  it("parses a self-hosted DSN with an install path prefix", () => {
    const dsn = parseSentryDsn("https://key@sentry.example.org/relay/789");
    expect(dsn).toEqual({
      publicKey: "key",
      host: "sentry.example.org",
      pathPrefix: "/relay",
      projectId: "789",
    });
  });

  it("rejects a DSN with no public key", () => {
    expect(() => parseSentryDsn("https://sentry.example.org/456")).toThrow(/public key/);
  });

  it("rejects a DSN with no project id", () => {
    expect(() => parseSentryDsn("https://key@sentry.example.org/")).toThrow(/project id/);
  });

  it("never lets the public key leak into a thrown message", () => {
    try {
      parseSentryDsn("https://sentry.example.org/");
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("sentry.example.org/456");
    }
  });
});

describe("sentryIngestUrl", () => {
  it("has no path prefix for a sentry.io project", () => {
    const url = sentryIngestUrl(parseSentryDsn("https://key@o1.ingest.sentry.io/456"));
    expect(url).toBe("https://o1.ingest.sentry.io/api/456/envelope/");
  });

  it("keeps the install path prefix before /api for a self-hosted project", () => {
    const url = sentryIngestUrl(
      parseSentryDsn("https://key@sentry.example.org/relay/789"),
    );
    expect(url).toBe("https://sentry.example.org/relay/api/789/envelope/");
  });
});

describe("buildSentryEnvelope", () => {
  it("emits a header line, an item-header line, and the event payload — each valid JSON", () => {
    const dsn = parseSentryDsn("https://key@o1.ingest.sentry.io/456");
    const envelope = buildSentryEnvelope(dsn, {
      event_id: "abc",
      timestamp: "2026-08-21T00:00:00.000Z",
      level: "error",
      message: "test",
    });

    const lines = envelope.trimEnd().split("\n");
    expect(lines).toHaveLength(3);

    const header = JSON.parse(lines[0] ?? "");
    expect(header.event_id).toBe("abc");
    expect(header.dsn).toBe("https://key@o1.ingest.sentry.io/456");

    expect(JSON.parse(lines[1] ?? "")).toEqual({ type: "event" });
    expect(JSON.parse(lines[2] ?? "")).toMatchObject({
      event_id: "abc",
      message: "test",
    });
  });
});

describe("sendToSentry", () => {
  it("posts the envelope with a well-formed X-Sentry-Auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendToSentry("https://mykey@o1.ingest.sentry.io/456", {
      event_id: "abc",
      timestamp: "2026-08-21T00:00:00.000Z",
      level: "error",
      message: "hi",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.sentry.io/api/456/envelope/");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sentry-auth"]).toContain("sentry_key=mykey");
    expect(headers["x-sentry-auth"]).toContain("sentry_version=7");
  });

  it("throws on a non-2xx response, with the response body in the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad dsn", { status: 401 })),
    );

    await expect(
      sendToSentry("https://mykey@o1.ingest.sentry.io/456", {
        event_id: "abc",
        timestamp: "2026-08-21T00:00:00.000Z",
        level: "error",
      }),
    ).rejects.toThrow(/401/);
  });
});

describe("captureException — degrades loudly without SENTRY_DSN", () => {
  it("does not throw and does not call fetch when SENTRY_DSN is unset", async () => {
    delete process.env.SENTRY_DSN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await captureException(new Error("boom"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SENTRY_DSN not configured"),
      expect.anything(),
    );
  });

  it("sends the error's name, message and stack when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://key@o1.ingest.sentry.io/456";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await captureException(new TypeError("bad input"), { route: "/notices" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);
    const eventLine = body.trim().split("\n")[2] ?? "";
    const event = JSON.parse(eventLine);
    expect(event.exception.values[0]).toMatchObject({
      type: "TypeError",
      value: "bad input",
    });
    expect(event.extra).toMatchObject({ route: "/notices" });
  });
});

describe("notifyOwner", () => {
  it("logs a GitHub Actions error annotation and skips paging when no webhook is configured", async () => {
    delete process.env.ALERT_WEBHOOK_URL;
    process.env.GITHUB_ACTIONS = "true";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyOwner("something is wrong", "critical");

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("::error::something is wrong"),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ALERT_WEBHOOK_URL"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a JSON payload to the webhook when one is configured", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.org/incoming";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyOwner("a backup job failed", "critical");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.org/incoming",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.text).toContain("CRITICAL");
    expect(payload.text).toContain("a backup job failed");
  });

  it("throws when the webhook itself refuses the request", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.org/incoming";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    );

    await expect(notifyOwner("x")).rejects.toThrow(/500/);
  });
});

describe("findAuthAnomalies", () => {
  it("returns exactly what the query hands back, mapped to a plain number", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([
        { username_attempted: "rahim", failures: 34n },
        { username_attempted: "karim", failures: 21n },
      ]),
    };

    const anomalies = await findAuthAnomalies(db);

    expect(anomalies).toEqual([
      { username: "rahim", failureCount: 34 },
      { username: "karim", failureCount: 21 },
    ]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("the query text names the >20/hour threshold and the succeeded=FALSE filter", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) };
    await findAuthAnomalies(db);

    const templateStrings = db.$queryRaw.mock.calls[0]?.[0] as {
      raw: readonly string[];
    };
    const sql = templateStrings.raw.join("");
    expect(sql).toContain("succeeded = FALSE");
    expect(sql).toContain("count(*) >");
    expect(sql).toContain("interval '1 hour'");
  });

  it("returns an empty list when nothing crosses the threshold", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([]) };
    expect(await findAuthAnomalies(db)).toEqual([]);
  });
});

describe("keepaliveDb", () => {
  it("issues exactly one query and returns nothing", async () => {
    const db = { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };
    await expect(keepaliveDb(db)).resolves.toBeUndefined();
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
