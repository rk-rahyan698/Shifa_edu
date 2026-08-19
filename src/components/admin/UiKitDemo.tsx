"use client";

/**
 * The storybook-style demo for the admin UI kit (T-051's Stop line).
 *
 * Every component in the kit is exercised here with live state, so the kit can
 * be reviewed without a database, without a module, and without the twelve M5
 * cards that will consume it. It is the closest thing this project has to a
 * component gallery.
 *
 * **It is a component, not a route.** T-051's Files list covers
 * `src/components/**` and no `src/app` path, so there is nowhere in this card's
 * scope to mount a page. Whoever adds an `/admin/ui-kit` route should render
 * `<UiKitDemo />` inside `ToastProvider` and put it behind a Super Admin check —
 * it is a developer surface, not something a school office should find in the
 * sidebar.
 *
 * The strings are English literals on purpose. This is scaffolding for
 * reviewers, not a user-facing screen, and running it through the `admin` i18n
 * namespace would imply it ships.
 */

import { useState } from "react";

import { DataTable, type DataTableQuery } from "@/components/admin/DataTable";
import {
  DualLocaleField,
  dualLocaleStatus,
  type DualLocaleValue,
} from "@/components/admin/DualLocaleField";
import { FormShell } from "@/components/admin/FormShell";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { PermissionGate } from "@/components/admin/PermissionGate";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { SortableList } from "@/components/admin/SortableList";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

type DemoRow = { id: string; title: string; status: string };

const DEMO_ROWS: DemoRow[] = [
  { id: "1", title: "ভর্তি বিজ্ঞপ্তি ২০২৬", status: "published" },
  { id: "2", title: "শীতকালীন ছুটি", status: "draft" },
  { id: "3", title: "অভিভাবক সভা", status: "published" },
];

const DEMO_QUERY: DataTableQuery = {
  page: 1,
  pageSize: 20,
  search: "",
  sort: "title",
  direction: "asc",
};

export function UiKitDemo() {
  const toast = useToast();

  const [title, setTitle] = useState<DualLocaleValue>({ bn: "", en: "" });
  const [body, setBody] = useState("<p>এখানে লিখুন…</p>");
  const [slides, setSlides] = useState([
    { id: "a", name: "Hero slide — assembly" },
    { id: "b", name: "Hero slide — science fair" },
    { id: "c", name: "Hero slide — library" },
  ]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const titleStatus = dualLocaleStatus(title);

  return (
    <div className="flex flex-col gap-12">
      <Section
        title="DualLocaleField + FormShell"
        note="§A-7.3 — Bangla required, English optional and flagged. Save is disabled until Bangla has content."
      >
        <FormShell
          title="Notice"
          description="The save button is gated on §A-7.3, not on English."
          labels={{
            save: "Save changes",
            saving: "Saving…",
            discard: "Discard",
            unsavedChanges: "Unsaved changes",
            errorSummary: "Please correct the following",
          }}
          localeStatuses={[titleStatus]}
          dirty={title.bn !== "" || title.en !== ""}
          onSubmit={() => toast.success("Saved (demo — nothing was written)")}
          onDiscard={() => setTitle({ bn: "", en: "" })}
        >
          <DualLocaleField
            name="title"
            label="Notice title"
            value={title}
            onChange={setTitle}
            requiredMessage="Bangla is required."
            englishMissingLabel="EN missing"
            banglaLabel="বাংলা"
            englishLabel="English"
            requiredLabel="required"
            optionalLabel="optional"
            showErrors
          />
          <p className="text-caption text-ink-muted">
            canSave: <strong>{String(titleStatus.canSave)}</strong> · banglaMissing:{" "}
            <strong>{String(titleStatus.banglaMissing)}</strong> · englishMissing:{" "}
            <strong>{String(titleStatus.englishMissing)}</strong>
          </p>
        </FormShell>
      </Section>

      <Section
        title="RichTextEditor"
        note="Preview renders the sanitized value — the same string the write path stores."
      >
        <RichTextEditor
          label="Notice body"
          value={body}
          onChange={setBody}
          labels={{
            bold: "Bold",
            italic: "Italic",
            link: "Link",
            heading: "Heading",
            bulletList: "List",
            willStrip: "Some formatting will be removed when this is saved.",
            preview: "Preview",
            source: "Source",
            empty: "Nothing to preview yet.",
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setBody("<script>alert(1)</script><p>Safe <b>text</b></p>")}
        >
          Paste something the allowlist refuses
        </button>
      </Section>

      <Section
        title="DataTable"
        note="Server-side pagination: it receives one page plus a total, and writes its query to the URL."
      >
        <DataTable
          rows={DEMO_ROWS}
          total={143}
          query={DEMO_QUERY}
          rowKey={(row) => row.id}
          columns={[
            { key: "title", header: "Title", sortable: true, cell: (row) => row.title },
            { key: "status", header: "Status", cell: (row) => row.status },
          ]}
          labels={{
            search: "Search",
            noResults: "No results",
            rowsPerPage: "Rows per page",
            rowActions: "Actions",
            pageOf: "Page {page} of {total}",
            previous: "Previous",
            next: "Next",
          }}
          rowActions={() => (
            <PermissionGate allowed={canDelete}>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5"
                onClick={() => setConfirmOpen(true)}
              >
                Delete
              </button>
            </PermissionGate>
          )}
        />
      </Section>

      <Section
        title="PermissionGate"
        note="Presentation only. Toggling this hides the Delete buttons above and changes nothing a server would permit."
      >
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={canDelete}
            onChange={(event) => setCanDelete(event.target.checked)}
          />
          <span>allowed = can(user, &apos;notice&apos;, &apos;delete&apos;)</span>
        </label>
      </Section>

      <Section title="SortableList" note="Keyboard-operable first; drag is secondary.">
        <SortableList
          items={slides}
          idOf={(item) => item.id}
          labelOf={(item) => item.name}
          render={(item) => <span>{item.name}</span>}
          onReorder={(next) => setSlides([...next])}
          labels={{
            moveUp: "Move up",
            moveDown: "Move down",
            moved: "{item} moved to position {position} of {total}",
          }}
        />
      </Section>

      <Section
        title="ImagePicker"
        note="Bangla alt text is required before upload is enabled."
      >
        <ImagePicker
          label="Hero image"
          onUploaded={(asset) => toast.success(`Uploaded ${asset.uid}`)}
          labels={{
            choose: "Upload",
            uploading: "Uploading…",
            altBangla: "Alt text (বাংলা)",
            altEnglish: "Alt text (English)",
            altRequired: "Bangla alt text is required.",
            required: "required",
            optional: "optional",
            remove: "Remove",
            tooLarge: "That image is larger than 5 MB.",
            failed: "Upload failed.",
          }}
        />
      </Section>

      <Section
        title="ConfirmDialog"
        note="Names the child records at risk (T-063's RESTRICT contract)."
      >
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setConfirmOpen(true)}
        >
          Open confirm dialog
        </button>
        <ConfirmDialog
          open={confirmOpen}
          title="Delete this class grade?"
          body="This action cannot be undone."
          atRiskLabel="These records are attached and would block the deletion:"
          atRisk={["3 fee structures", "12 exams", "2 class sections"]}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            setConfirmOpen(false);
            toast.error("Refused: dependent records exist (demo).");
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      </Section>

      <Section
        title="Toast"
        note="Errors persist until dismissed; successes auto-dismiss."
      >
        <div className="flex gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => toast.success("Saved.")}
          >
            Success
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => toast.error("Could not save.")}
          >
            Error
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h2 className="text-h3 font-semibold text-primary">{title}</h2>
      <p className="mb-4 mt-1 text-caption text-ink-muted">{note}</p>
      {children}
    </section>
  );
}
