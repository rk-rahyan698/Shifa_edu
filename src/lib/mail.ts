/**
 * Transactional email (T-042) — the provider seam, and the SMTP transport
 * behind it.
 *
 * ARCHITECTURE.md §A-9.2 needs exactly one message today: the password reset
 * link. The card asks for a **provider behind an interface** because that is
 * the piece most likely to be swapped — a school that starts on its host's SMTP
 * relay and later moves to a transactional API should change one factory, not
 * every call site. So the rest of the codebase sees `Mailer.send()` and knows
 * nothing about sockets, `EHLO`, or base64 headers.
 *
 * The transport is written directly on `node:net` and `node:tls` rather than
 * pulling a mail library in, for the same reason T-037 wrote SigV4 by hand:
 * `package.json` is outside this card's Files list, and the whole protocol
 * surface needed here is a fixed nine-command conversation. What that costs is
 * feature coverage — no attachments, no HTML alternative, no connection pool —
 * and every one of those absences is deliberate and listed below rather than
 * discovered later.
 *
 * Two details carry more weight than they look like they should:
 *
 *  - **Everything is UTF-8, encoded.** The site's required locale is Bangla
 *    (§A-7.3), so a subject line and a body will routinely be non-ASCII. A
 *    subject goes out as an RFC 2047 encoded-word and a body as base64, because
 *    raw 8-bit content is not something an arbitrary relay is obliged to carry —
 *    it may pass through, or it may arrive as mojibake for the one user who
 *    needed to read it.
 *  - **Failure is loud to the server and silent to the caller.** `send()`
 *    throws on any refusal; the reset endpoint catches it, because §A-9.2's
 *    contract is that a reset request answers identically whether or not the
 *    address exists — and "the mail server said no such mailbox" is exactly the
 *    leak that contract forbids.
 */

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";

import { env } from "@/lib/env";

/** One message. Plain text only — see the header note on what is deliberately absent. */
export type EmailMessage = {
  /** A single recipient address. Bulk sending is not this module's job. */
  to: string;
  subject: string;
  /** UTF-8 body. Sent base64-encoded, so line length and script are irrelevant. */
  text: string;
};

/**
 * The seam. Everything that sends mail depends on this and nothing else, so an
 * API-based provider is a new implementation rather than a rewrite of a caller.
 */
export type Mailer = {
  send(message: EmailMessage): Promise<void>;
};

/** How long a whole SMTP conversation may take before it is abandoned. */
const SOCKET_TIMEOUT_MS = 10_000;

/** Implicit-TLS port. Anything else starts in the clear and upgrades if offered. */
const IMPLICIT_TLS_PORT = 465;

let override: Mailer | null = null;

/**
 * Replaces the mailer process-wide. For tests (T-112) and for a future provider
 * swap; production sets it never and gets `smtpMailer()` below.
 */
export function setMailer(mailer: Mailer | null): void {
  override = mailer;
}

/**
 * The configured mailer. Built per call rather than memoized: `env` is validated
 * at import, and a connection is opened per message anyway, so there is no state
 * worth keeping and no risk of a stale transport surviving a config change.
 */
export function getMailer(): Mailer {
  return override ?? smtpMailer();
}

/**
 * A mailer that writes to the server log instead of sending. Useful for a
 * developer without a relay, and the shape a test double takes; it is never
 * selected automatically, because a system that silently stops sending password
 * resets looks exactly like one that is working.
 */
export function loggingMailer(sink: (line: string) => void = console.info): Mailer {
  return {
    async send(message: EmailMessage): Promise<void> {
      sink(`[mail] to=${message.to} subject=${message.subject}`);
    },
  };
}

/** The SMTP transport, configured from `SMTP_*` and `EMAIL_FROM` (§A-12). */
export function smtpMailer(): Mailer {
  return {
    async send(message: EmailMessage): Promise<void> {
      await sendOverSmtp(message);
    },
  };
}

/** A refused command, carrying the reply code so a caller can tell 4xx from 5xx. */
export class MailDeliveryError extends Error {
  override readonly name = "MailDeliveryError";
  readonly code: number;

  constructor(stage: string, code: number, text: string) {
    super(`SMTP ${stage} failed (${code}): ${text}`);
    this.code = code;
  }
}

type Reply = { code: number; text: string; lines: string[] };

/**
 * One message, one connection, in the order RFC 5321 fixes.
 *
 * The socket is closed in a `finally`: a relay that accepted `DATA` and then
 * dropped the connection has still delivered, and an abandoned socket would
 * otherwise hold a file descriptor until the process noticed.
 */
async function sendOverSmtp(message: EmailMessage): Promise<void> {
  const implicitTls = env.SMTP_PORT === IMPLICIT_TLS_PORT;
  let io = await openSocket(env.SMTP_HOST, env.SMTP_PORT, implicitTls);

  try {
    await expect(io, "greeting", [220]);

    let capabilities = await ehlo(io);

    // STARTTLS whenever the server offers it and we are not already encrypted.
    // Credentials must not cross a plaintext link, and neither must a reset
    // link — whoever reads it in transit can use it (§A-9.2: 30-minute TTL is a
    // blast-radius limit, not a substitute for transport security).
    if (!implicitTls && capabilities.has("STARTTLS")) {
      await command(io, "STARTTLS", "starttls", [220]);
      io = await upgradeSocket(io, env.SMTP_HOST);
      capabilities = await ehlo(io);
    }

    if (capabilities.has("AUTH")) {
      await authenticate(io);
    }

    await command(io, `MAIL FROM:<${env.EMAIL_FROM}>`, "MAIL FROM", [250]);
    await command(io, `RCPT TO:<${message.to}>`, "RCPT TO", [250, 251]);
    await command(io, "DATA", "DATA", [354]);
    await command(io, `${buildMessage(message)}\r\n.`, "message body", [250]);

    // A failure to say goodbye politely is not a delivery failure: the relay
    // has already accepted the message at this point.
    await command(io, "QUIT", "QUIT", [221]).catch(() => undefined);
  } finally {
    io.socket.end();
    io.socket.destroy();
  }
}

/** `EHLO`, returning the advertised keywords uppercased. */
async function ehlo(io: SmtpIo): Promise<Set<string>> {
  const reply = await command(io, `EHLO ${hostname()}`, "EHLO", [250]);

  const capabilities = new Set<string>();
  for (const line of reply.lines.slice(1)) {
    const keyword = line.slice(4).trim().split(/\s+/)[0];
    if (keyword !== undefined && keyword !== "") capabilities.add(keyword.toUpperCase());
  }
  return capabilities;
}

/**
 * `AUTH LOGIN` — username and password each base64, each its own step.
 *
 * `AUTH PLAIN` would be one round trip fewer, but LOGIN is the mechanism every
 * relay in this class accepts, and the difference is a single RTT on a path
 * that already costs a TCP handshake and a TLS negotiation.
 */
async function authenticate(io: SmtpIo): Promise<void> {
  await command(io, "AUTH LOGIN", "AUTH", [334]);
  await command(io, base64(env.SMTP_USER), "AUTH username", [334]);
  await command(io, base64(env.SMTP_PASSWORD), "AUTH password", [235]);
}

/**
 * The RFC 5322 message.
 *
 * `Date` and `Message-ID` are set here rather than left to the relay: a message
 * without them is a strong spam signal, and a password reset that lands in a
 * junk folder is a support call. The `Message-ID` domain is taken from
 * `EMAIL_FROM` so it matches the sending domain.
 *
 * The body is base64 in fixed-width lines, which sidesteps both problems raw
 * text has here at once: the 998-octet line limit, and 8-bit Bangla on a relay
 * that never advertised `8BITMIME`.
 */
function buildMessage(message: EmailMessage): string {
  const domain = env.EMAIL_FROM.split("@")[1] ?? "localhost";

  const headers = [
    `From: ${env.EMAIL_FROM}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    // A reset link must not be followed by a mailbox's link scanner, and it
    // must not be replied to. Neither header is enforceable, but both are read.
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
  ];

  return `${headers.join("\r\n")}\r\n\r\n${wrap(base64(message.text))}`;
}

/**
 * RFC 2047 encoded-word for a header, applied only when the value is not pure
 * ASCII — an ASCII subject stays readable in a transcript, which matters when
 * debugging a relay.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(value)}?=`;
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/** Base64 in 76-character lines, as the transfer encoding requires. */
function wrap(value: string): string {
  return (value.match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * The local hostname for `EHLO`. `os.hostname()` is deliberately not used: on a
 * serverless host it is a container id that means nothing to a relay, while the
 * sending domain is the name the relay is about to check anyway.
 */
function hostname(): string {
  return env.EMAIL_FROM.split("@")[1] ?? "localhost";
}

type SmtpIo = {
  socket: Socket | TLSSocket;
  /** Everything received and not yet consumed by a reply. */
  buffer: string;
};

function openSocket(host: string, port: number, secure: boolean): Promise<SmtpIo> {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tlsConnect({ host, port, servername: host })
      : netConnect({ host, port });

    socket.setEncoding("utf8");
    socket.setTimeout(SOCKET_TIMEOUT_MS);

    const onReady = () => resolve({ socket, buffer: "" });
    socket.once(secure ? "secureConnect" : "connect", onReady);
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`SMTP connection to ${host}:${port} timed out`));
    });
  });
}

/** STARTTLS upgrade: the same TCP connection, wrapped, with its buffer dropped. */
function upgradeSocket(io: SmtpIo, host: string): Promise<SmtpIo> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ socket: io.socket, servername: host }, () => {
      socket.setEncoding("utf8");
      socket.setTimeout(SOCKET_TIMEOUT_MS);
      resolve({ socket, buffer: "" });
    });
    socket.once("error", reject);
  });
}

/** Writes one line and reads the reply it produces. */
async function command(
  io: SmtpIo,
  line: string,
  stage: string,
  accepted: number[],
): Promise<Reply> {
  io.socket.write(`${line}\r\n`);
  return expect(io, stage, accepted);
}

/**
 * Reads one complete reply and enforces the codes the stage allows.
 *
 * A reply is complete at the first line whose code is followed by a space
 * rather than a hyphen — the continuation rule is the only way to know an
 * `EHLO` capability list has ended, and reading a fixed number of lines instead
 * would desynchronise the conversation against any relay with a longer banner.
 */
async function expect(io: SmtpIo, stage: string, accepted: number[]): Promise<Reply> {
  const reply = await readReply(io, stage);
  if (!accepted.includes(reply.code)) {
    throw new MailDeliveryError(stage, reply.code, reply.text);
  }
  return reply;
}

function readReply(io: SmtpIo, stage: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const finish = (result: Reply) => {
      cleanup();
      resolve(result);
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const tryParse = () => {
      const lines = io.buffer.split("\r\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (/^\d{3} /.test(line)) {
          io.buffer = lines.slice(i + 1).join("\r\n");
          const complete = lines.slice(0, i + 1);
          finish({
            code: Number(line.slice(0, 3)),
            text: line.slice(4).trim(),
            lines: complete,
          });
          return;
        }
      }
    };

    const onData = (chunk: string) => {
      io.buffer += chunk;
      tryParse();
    };

    const onClose = () => fail(new Error(`SMTP connection closed during ${stage}`));
    const onTimeout = () => {
      io.socket.destroy();
      fail(new Error(`SMTP ${stage} timed out`));
    };

    function cleanup() {
      io.socket.off("data", onData);
      io.socket.off("error", fail);
      io.socket.off("close", onClose);
      io.socket.off("timeout", onTimeout);
    }

    io.socket.on("data", onData);
    io.socket.once("error", fail);
    io.socket.once("close", onClose);
    io.socket.once("timeout", onTimeout);

    // Anything already buffered from a previous read may complete this reply.
    tryParse();
  });
}

/**
 * A single-use secret and the hash that is stored in its place.
 *
 * Lives here rather than in the reset endpoint because it is the same shape
 * T-032 uses for session tokens and the same rule §A-9.2 states for both:
 * **only the hash is persisted**. A dump of `password_reset_tokens` yields
 * nothing that can be put in a URL, which is the entire security value of the
 * `token_hash` column.
 */
export function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** SHA-256, hex — the only form of a reset token that touches the database. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
