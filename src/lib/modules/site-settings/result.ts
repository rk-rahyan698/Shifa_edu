/**
 * A Server Action's return value, for the `site_settings` module.
 *
 * The write pipeline (T-038) signals every refusal by throwing a
 * `PipelineError` carrying the stage and an HTTP status. That is exactly what a
 * route handler wants and exactly what a Server Action cannot have: an
 * exception crossing the action boundary reaches the browser as a generic
 * "an error occurred", with the stage, the status and the per-field issues
 * stripped out in production. A panel that must tell a 403 from a 422 — which
 * is this card's Verify, stated as a user-visible behaviour — has to be handed
 * that information as data.
 *
 * So refusals are converted, not rethrown. Anything that is *not* a
 * `PipelineError` still escapes: an unexpected failure is not a form error and
 * must not be rendered as one.
 *
 * Deferred: `home` and `about` need the identical conversion, and all three
 * copies want to become one `src/lib/modules/result.ts`. That path belongs to
 * no card in this batch — T-060's Files list stops at
 * `src/lib/modules/site-settings/**` — so the merge waits for a card that owns
 * it, in the same spirit as the per-page `COPY` maps T-050/T-052 each recorded.
 */

import { PipelineError, type FieldIssue, type PipelineStage } from "@/lib/mutate";

export type ActionFailure = {
  ok: false;
  /** 401, 403, 422 or 500 — the pipeline's own status for the refusing stage. */
  status: number;
  stage: PipelineStage;
  /** A code the panel maps to a sentence in its own locale, never a message. */
  reason: "unauthenticated" | "forbidden" | "invalid" | "failed";
  /** Populated for a 422 only; `field` is the schema path, e.g. `translations.bn.address`. */
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
