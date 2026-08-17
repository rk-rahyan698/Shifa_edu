"use client";

/**
 * The disposal controls on one message — status, delete, restore.
 *
 * All three are bound to `contact:delete` on the server (see
 * `src/lib/modules/messages/actions.ts` for why status changes ride there
 * rather than on `view`). `canDispose` here decides only whether the controls
 * are *drawn*; it is `can(user, 'contact', 'delete')` evaluated on the server
 * and passed down, exactly as `PermissionGate`'s contract requires, and every
 * action re-checks the same permission inside the pipeline, twice.
 *
 * There is no reply control, and there is not going to be one in Phase 1 — this
 * card's Contract. The phone number in the detail above is the reply.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { statusLabel, type Copy } from "@/app/admin/messages/copy";
import { useToast } from "@/components/ui/Toast";
import {
  deleteMessageAction,
  restoreMessageAction,
  setMessageStatusAction,
} from "@/lib/modules/messages/actions";
import type { MessageDetail } from "@/lib/modules/messages/read";
import type { ActionResult } from "@/lib/modules/messages/result";

export function MessageActions({
  message,
  statuses,
  canDispose,
  copy,
}: {
  message: MessageDetail;
  statuses: readonly string[];
  canDispose: boolean;
  copy: Copy;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!canDispose) {
    return (
      <p className="callout mt-6" role="status">
        {copy["locked"] ?? ""}
      </p>
    );
  }

  async function run<TData>(
    action: (input: unknown) => Promise<ActionResult<TData>>,
    input: unknown,
    successKey: "saved" | "deleted",
  ): Promise<boolean> {
    setBusy(true);
    try {
      const result = await action(input);
      if (result.ok) {
        toast.success(copy[successKey] ?? "");
        router.refresh();
        return true;
      }
      toast.error(
        result.issues.find((issue) => issue.field === "id")?.message ??
          copy[result.reason] ??
          "",
      );
      return false;
    } catch {
      toast.error(copy["failed"] ?? "");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="label" htmlFor="message-status">
            {copy["changeStatus"] ?? ""}
          </label>
          <select
            id="message-status"
            className="input"
            value={message.statusCode}
            disabled={busy}
            onChange={(event) =>
              run(
                setMessageStatusAction,
                { id: message.id, statusCode: event.target.value },
                "saved",
              )
            }
          >
            {statuses.map((code) => (
              <option key={code} value={code}>
                {statusLabel(copy, code)}
              </option>
            ))}
          </select>
        </div>

        {message.isDeleted ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => run(restoreMessageAction, { id: message.id }, "saved")}
          >
            {copy["restore"] ?? ""}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {copy["remove"] ?? ""}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={copy["remove"] ?? ""}
        // Says what actually happens: the row is not destroyed, and §A-16.1's
        // purge date is unchanged by deleting it early.
        body={`${copy["deletedNote"] ?? ""} ${copy["purgeNote"] ?? ""}`}
        confirmLabel={copy["remove"] ?? ""}
        cancelLabel={copy["back"] ?? ""}
        busy={busy}
        onConfirm={async () => {
          const done = await run(deleteMessageAction, { id: message.id }, "deleted");
          if (done) setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
