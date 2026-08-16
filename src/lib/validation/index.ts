/**
 * The validation barrel (T-034), plus the one helper stage 3 of the write
 * pipeline needs: a parse whose failure is a 422 with per-field messages.
 *
 * §A-5.1 fixes the status code — VALIDATE fails with 422, not 400 — so it is
 * encoded here once rather than remembered at eleven call sites. T-038 wires
 * this into the pipeline; nothing in this directory calls an endpoint itself.
 */

import { z } from "zod";

export * from "@/lib/validation/primitives";
export * as about from "@/lib/validation/about";
export * as academics from "@/lib/validation/academics";
export * as admission from "@/lib/validation/admission";
export * as contact from "@/lib/validation/contact";
export * as faculty from "@/lib/validation/faculty";
export * as gallery from "@/lib/validation/gallery";
export * as home from "@/lib/validation/home";
export * as media from "@/lib/validation/media";
export * as notice from "@/lib/validation/notice";
export * as siteSettings from "@/lib/validation/site-settings";
export * as users from "@/lib/validation/users";

/** The status §A-5.1 assigns to a validation failure. */
export const VALIDATION_STATUS = 422 as const;

/** One field's complaint. `path` is dotted so a nested translation reads well. */
export type FieldError = {
  /** e.g. `translations.bn.title`, or `""` for an object-level refinement. */
  path: string;
  message: string;
};

export type ValidationSuccess<T> = { ok: true; data: T };

export type ValidationFailure = {
  ok: false;
  status: typeof VALIDATION_STATUS;
  errors: FieldError[];
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Parses input against a schema, returning a result rather than throwing.
 *
 * A thrown error would have to be caught by every caller, and a caller that
 * forgets writes unvalidated data — the failure mode this returns a value to
 * avoid. `ok: false` is impossible to ignore accidentally, because `data` does
 * not exist on it.
 *
 * Unknown keys arrive here as `unrecognized_keys` issues from `.strict()` and
 * become ordinary field errors, so posting `isAdmin: true` at a schema that
 * never declared it is a 422 naming the key rather than a silent drop.
 */
export function parseInput<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  return {
    ok: false,
    status: VALIDATION_STATUS,
    errors: toFieldErrors(result.error),
  };
}

/**
 * Flattens a `ZodError` into one entry per problem.
 *
 * `unrecognized_keys` is expanded so each rejected key gets its own path — Zod
 * reports them as a single issue listing several keys, which reads as one error
 * about the object when it is really one error per field.
 */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.flatMap((issue) => {
    const base = issue.path.join(".");

    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => ({
        path: base === "" ? key : `${base}.${key}`,
        message: `Unknown field '${key}'`,
      }));
    }

    return [{ path: base, message: issue.message }];
  });
}
