/**
 * A Server Action's return value, for the `media` module.
 *
 * The eleventh near-identical copy — see `admission/result.ts` for why it stays
 * a copy rather than a shared import: M5 requires every module to be
 * independently shippable, which a module that stops compiling when a sibling
 * is reverted is not.
 */

import { PipelineError, type FieldIssue, type PipelineStage } from "@/lib/mutate";

export type ActionFailure = {
  ok: false;
  status: number;
  stage: PipelineStage;
  reason: "unauthenticated" | "forbidden" | "invalid" | "failed";
  issues: readonly FieldIssue[];
};

export type ActionResult<TData> = { ok: true; data: TData } | ActionFailure;

const REASON_BY_STATUS: Readonly<Record<number, ActionFailure["reason"]>> = {
  401: "unauthenticated",
  403: "forbidden",
  422: "invalid",
};

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
