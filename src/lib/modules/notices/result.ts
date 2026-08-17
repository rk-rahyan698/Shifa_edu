/**
 * A Server Action's return value, for the `notices` module.
 *
 * The seventh near-identical copy — see `admission/result.ts` for why it stays
 * a copy rather than a shared import: M5 requires every module to be
 * independently shippable, which a module that stops compiling when a sibling
 * is reverted is not.
 */

import { PipelineError, type FieldIssue, type PipelineStage } from "@/lib/mutate";

export type ActionFailure = {
  ok: false;
  /** 401, 403, 422 or 500 — the pipeline's own status for the refusing stage. */
  status: number;
  stage: PipelineStage;
  /** A code the panel maps to a sentence in its own locale, never a message. */
  reason: "unauthenticated" | "forbidden" | "invalid" | "failed";
  /** Populated for a 422 only; `field` is the schema path, e.g. `values.translations.bn.slug`. */
  issues: readonly FieldIssue[];
};

export type ActionResult<TData> = { ok: true; data: TData } | ActionFailure;

const REASON_BY_STATUS: Readonly<Record<number, ActionFailure["reason"]>> = {
  401: "unauthenticated",
  403: "forbidden",
  422: "invalid",
};

/**
 * Runs one pipeline call and reports its outcome as data.
 *
 * Every action in this module goes through here, so no panel has to remember
 * that a `MutationDeniedError` is a 403 rather than a crash.
 */
export async function runAction<TData>(
  run: () => Promise<TData>,
): Promise<ActionResult<TData>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (!(error instanceof PipelineError)) throw error;

    return {
      ok: false,
      status: error.status,
      stage: error.stage,
      reason: REASON_BY_STATUS[error.status] ?? "failed",
      issues: "issues" in error ? (error.issues as readonly FieldIssue[]) : [],
    };
  }
}
