/**
 * Admission & fees (T-064) — ARCHITECTURE.md §B-9.
 *
 * Six panels over §B-9's entities, in the order the school fills them: the
 * cycle first, because the steps hang off it and the banner depends on it, then
 * the things a parent reads, then the money.
 *
 * §A-5.2 gives `admission` four actions, so the page computes three separate
 * rights and passes them down. They govern rendering only. Every action
 * re-checks the same permission inside the pipeline, twice (§A-5.1) — once up
 * front and once against the transaction snapshot — because a hidden button has
 * never been an authorization control.
 *
 * Two of the card's three Contract clauses are visible from here:
 *
 *  - **The admission-open expression is defined once**, in
 *    `src/lib/modules/admission/open.ts`. `CyclePanel` calls it to render the
 *    status line; T-084 will call the same function to decide whether the
 *    public banner shows. Nothing on this page recombines `is_open` with the
 *    cycle dates.
 *  - **New charge types are added by creating a `fee_type`.** The grid's
 *    columns come from `fee_types` rows, so `FeeTypesPanel` sits directly under
 *    `FeeGridPanel` — adding "Transport" there puts a Transport column in the
 *    grid above with no migration, which is this card's Verify.
 *
 * The third — fee amounts are `NUMERIC` — is enforced below the page, by
 * T-034's `money` and the `NUMERIC(12,2)` column. No fee on this screen is ever
 * a JavaScript number.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { ADMISSION_COPY } from "@/app/admin/admission/copy";
import { CyclePanel } from "@/app/admin/admission/CyclePanel";
import { DocumentsPanel } from "@/app/admin/admission/DocumentsPanel";
import { EligibilityPanel } from "@/app/admin/admission/EligibilityPanel";
import { FaqsPanel } from "@/app/admin/admission/FaqsPanel";
import { FeeGridPanel, FeeTypesPanel } from "@/app/admin/admission/FeeGridPanel";
import { StepsPanel } from "@/app/admin/admission/StepsPanel";
import type { Rights } from "@/app/admin/admission/panel-kit";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readAdmissionScreen } from "@/lib/modules/admission/read";
import { can, loadPermissions, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/session";

/** A session cookie and live content rows on every request. Never cached. */
export const dynamic = "force-dynamic";

/** Prisma. */
export const runtime = "nodejs";

type ShellUser = {
  id: bigint;
  role_code: string;
  preferred_locale: string;
  is_active: boolean;
};

export default async function AdminAdmissionPage() {
  const account = await loadUser();
  if (account === null) redirect("/login");

  const { permissions, specialGrants } = await loadPermissions(account.id);
  const user: SessionUser = {
    id: account.id,
    roleCode: account.role_code,
    isActive: account.is_active,
    permissions,
    specialGrants,
  };

  // 404 rather than 403, matching T-041: a module an admin may not see should
  // not announce that it exists.
  if (!can(user, "admission", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = ADMISSION_COPY[locale];

  const rights: Rights = {
    add: can(user, "admission", "add"),
    edit: can(user, "admission", "edit"),
    delete: can(user, "admission", "delete"),
  };

  const screen = await readAdmissionScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <CyclePanel
        cycle={screen.cycle}
        cycles={screen.cycles}
        years={screen.years}
        copy={copy}
        editable={rights.edit}
      />
      <StepsPanel
        steps={screen.steps}
        cycles={screen.cycles}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <DocumentsPanel documents={screen.documents} copy={copy} rights={rights} />
      <EligibilityPanel
        eligibility={screen.eligibility}
        grades={screen.feeGrades}
        copy={copy}
        rights={rights}
      />
      <FaqsPanel faqs={screen.faqs} copy={copy} rights={rights} />
      <FeeGridPanel
        grades={screen.feeGrades}
        feeTypes={screen.feeTypes}
        cells={screen.feeCells}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <FeeTypesPanel feeTypes={screen.feeTypes} copy={copy} rights={rights} />
    </ToastProvider>
  );
}

/** The signed-in admin, or null. See T-052's note on the duplicated read. */
async function loadUser(): Promise<ShellUser | null> {
  const token = await readSessionCookie();
  if (token === null) return null;

  const session = await verifySession(token);
  if (session === null) return null;

  const [row] = await prisma.$queryRaw<ShellUser[]>`
    SELECT id, role_code, preferred_locale, is_active
      FROM users
     WHERE id = ${session.userId}
       AND deleted_at IS NULL
       AND is_active`;

  return row ?? null;
}
