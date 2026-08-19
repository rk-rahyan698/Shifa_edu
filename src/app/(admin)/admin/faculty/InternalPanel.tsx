"use client";

/**
 * `faculty_private` — Super Admin only (§A-16.1, §A-16.2 item 6).
 *
 * Rendered only when the server has already established the caller is
 * `super_admin` (see `page.tsx`); `saveFacultyPrivateAction` re-checks the same
 * role server-side regardless, because a hidden panel is not an authorization
 * control. One row per faculty member, so this panel is only meaningful once
 * the profile itself has an id — a brand-new, unsaved draft has nowhere for the
 * private row to point.
 */

import { useState } from "react";

import type { Copy } from "@/app/(admin)/admin/faculty/copy";
import { EditorActions, TextField, useActionRunner } from "@/app/(admin)/admin/faculty/panel-kit";
import { saveFacultyPrivateAction } from "@/lib/modules/faculty/actions";
import type { FacultyPrivateView } from "@/lib/modules/faculty/read";

export function InternalPanel({
  facultyId,
  initial,
  copy,
}: {
  facultyId: string;
  initial: FacultyPrivateView | null;
  copy: Copy;
}) {
  const runner = useActionRunner(copy);
  const [personalPhone, setPersonalPhone] = useState(initial?.personalPhone ?? "");
  const [personalEmail, setPersonalEmail] = useState(initial?.personalEmail ?? "");
  const [emergencyContact, setEmergencyContact] = useState(
    initial?.emergencyContact ?? "",
  );
  const [internalNotes, setInternalNotes] = useState(initial?.internalNotes ?? "");

  async function save() {
    await runner.run(saveFacultyPrivateAction, {
      facultyId,
      personalPhone,
      personalEmail,
      emergencyContact,
      internalNotes,
    });
  }

  return (
    <section className="card mt-4 border border-dashed border-border">
      <h3 className="text-h4 font-semibold text-primary">{copy["internalHeading"] ?? ""}</h3>
      <p className="mt-1 text-caption text-ink-muted">{copy["internalNote"] ?? ""}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextField
          id="faculty-personal-phone"
          label={copy["personalPhone"] ?? ""}
          type="tel"
          value={personalPhone}
          onChange={setPersonalPhone}
          error={issueForRunner(runner, "personalPhone")}
        />
        <TextField
          id="faculty-personal-email"
          label={copy["personalEmail"] ?? ""}
          type="email"
          value={personalEmail}
          onChange={setPersonalEmail}
          error={issueForRunner(runner, "personalEmail")}
        />
      </div>

      <div className="mt-4">
        <TextField
          id="faculty-emergency-contact"
          label={copy["emergencyContact"] ?? ""}
          value={emergencyContact}
          onChange={setEmergencyContact}
          error={issueForRunner(runner, "emergencyContact")}
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="faculty-internal-notes">
          {copy["internalNotes"] ?? ""}
        </label>
        <textarea
          id="faculty-internal-notes"
          className="input"
          rows={4}
          value={internalNotes}
          onChange={(event) => setInternalNotes(event.target.value)}
        />
      </div>

      <EditorActions
        saveLabel={copy["save"] ?? ""}
        savingLabel={copy["saving"] ?? ""}
        cancelLabel={copy["cancel"] ?? ""}
        busy={runner.busy}
        canSave
        onSave={save}
        onCancel={() => runner.clearIssues()}
      />
    </section>
  );
}

function issueForRunner(
  runner: ReturnType<typeof useActionRunner>,
  field: string,
): string | undefined {
  return runner.issues.find((issue) => issue.field === field)?.message;
}
