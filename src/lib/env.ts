/**
 * Validated environment configuration.
 *
 * The contract (BUILD-TRACKER T-003): every module reads config through `env`
 * exported here and never touches `process.env` directly. Values are parsed
 * once, at module load, so a missing or malformed key fails the boot with a
 * named error instead of surfacing as `undefined` deep inside a request.
 *
 * Secrets live in the environment only — ARCHITECTURE.md §A-12. Key names and
 * shapes are documented in `.env.example`.
 */

import { z } from 'zod';

/** Thrown when the environment does not satisfy the schema. */
export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';

  constructor(message: string) {
    super(message);
  }
}

const nonEmpty = (label: string) => z.string().min(1, `${label} must not be empty`);

const absoluteUrl = (label: string) =>
  z
    .string()
    .min(1, `${label} must not be empty`)
    .url(`${label} must be an absolute URL, e.g. https://example.org`)
    .refine((value) => !value.endsWith('/'), `${label} must not end with a trailing slash`);

/**
 * Server-only variables. Never referenced from a Client Component: these are
 * read out of `process.env` at runtime and are absent from the browser bundle.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: nonEmpty('DATABASE_URL').refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a postgresql:// connection string',
  ),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters of random data'),

  SMTP_HOST: nonEmpty('SMTP_HOST'),
  SMTP_PORT: z.coerce
    .number({ invalid_type_error: 'SMTP_PORT must be a number' })
    .int('SMTP_PORT must be a whole number')
    .min(1, 'SMTP_PORT must be between 1 and 65535')
    .max(65535, 'SMTP_PORT must be between 1 and 65535'),
  SMTP_USER: nonEmpty('SMTP_USER'),
  SMTP_PASSWORD: nonEmpty('SMTP_PASSWORD'),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be an email address'),

  STORAGE_ENDPOINT: absoluteUrl('STORAGE_ENDPOINT'),
  STORAGE_REGION: nonEmpty('STORAGE_REGION'),
  STORAGE_ACCESS_KEY_ID: nonEmpty('STORAGE_ACCESS_KEY_ID'),
  STORAGE_SECRET_ACCESS_KEY: nonEmpty('STORAGE_SECRET_ACCESS_KEY'),
  STORAGE_PUBLIC_BUCKET: nonEmpty('STORAGE_PUBLIC_BUCKET'),
  STORAGE_PRIVATE_BUCKET: nonEmpty('STORAGE_PRIVATE_BUCKET'),
  STORAGE_PUBLIC_BASE_URL: absoluteUrl('STORAGE_PUBLIC_BASE_URL'),
});

/**
 * Variables inlined into the browser bundle. They are safe to expose and must
 * be read as literal `process.env.NEXT_PUBLIC_*` members so Next.js can
 * substitute them at build time.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SITE_URL: absoluteUrl('NEXT_PUBLIC_SITE_URL'),
});

const clientValues = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

/** `true` while running in the browser, where server variables do not exist. */
const isBrowser = typeof window !== 'undefined';

function formatIssues(scope: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    return `  - ${key}: ${issue.message}`;
  });

  return [
    `Invalid ${scope} environment. ${lines.length} problem(s) found:`,
    ...lines,
    '',
    'Copy .env.example to .env.local and fill in the keys listed above.',
  ].join('\n');
}

function parse<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
  scope: string,
): z.infer<T> {
  const result = schema.safeParse(values);

  if (!result.success) {
    throw new EnvValidationError(formatIssues(scope, result.error));
  }

  return result.data;
}

const clientEnv: ClientEnv = parse(clientSchema, clientValues, 'client');

/**
 * The single validated configuration object. Import this, not `process.env`.
 *
 * On the server it is a plain frozen object holding both halves. In the browser
 * only the client keys exist, and reading a server key is a programming error —
 * it throws by name instead of quietly yielding `undefined`.
 */
export const env: ServerEnv & ClientEnv = isBrowser
  ? new Proxy(clientEnv as ServerEnv & ClientEnv, {
      get(target, key, receiver) {
        if (typeof key !== 'string' || key in target) {
          return Reflect.get(target, key, receiver);
        }

        throw new EnvValidationError(
          `${key} is a server-only environment variable and cannot be read in the browser.`,
        );
      },
    })
  : Object.freeze({
      ...clientEnv,
      ...parse(serverSchema, process.env, 'server'),
    });

export type Env = typeof env;
