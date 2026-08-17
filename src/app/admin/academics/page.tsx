/**
 * Academics (T-063) — ARCHITECTURE.md §B-8.
 *
 * Nine panels over §B-8's nine entities, in dependency order: a year has to
 * exist before a section, a class before a routine, a term before an exam. The
 * order is not decoration — an admin working top to bottom never meets an empty
 * `<select>` whose reason lives further down the page.
 *
 * §A-5.2 gives `academics` four actions rather than the two the earlier M5
 * modules had, so the page computes three separate rights and passes them down.
 * They govern rendering only. Every action re-checks the same permission inside
 * the pipeline, twice (§A-5.1) — once up front and once against the transaction
 * snapshot — because a hidden button has never been an authorization control.
 *
 * The one rule from elsewhere that lands hardest on this screen is this card's
 * Contract: **a class with dependent fee structures or exams cannot be deleted,
 * and the refusal names what is in the way.** It is enforced in
 * `src/lib/modules/academics/actions.ts`, inside the transaction. What this
 * page contributes is the count beside each class, which is a warning and not
 * a decision — see `GradesPanel`.
 */

import { notFound, redirect } from "next/navigation";

import { ToastProvider } from "@/components/ui/Toast";
import { ACADEMICS_COPY } from "@/app/admin/academics/copy";
import { AssignmentsPanel } from "@/app/admin/academics/AssignmentsPanel";
import { CalendarPanel } from "@/app/admin/academics/CalendarPanel";
import { ExamsPanel, ExamTermsPanel } from "@/app/admin/academics/ExamsPanel";
import { GradesPanel } from "@/app/admin/academics/GradesPanel";
import { InfoPanel } from "@/app/admin/academics/InfoPanel";
import { RoutinesPanel } from "@/app/admin/academics/RoutinesPanel";
import { SectionsPanel } from "@/app/admin/academics/SectionsPanel";
import { SubjectsPanel } from "@/app/admin/academics/SubjectsPanel";
import { YearsPanel } from "@/app/admin/academics/YearsPanel";
import type { Rights } from "@/app/admin/academics/panel-kit";
import { readSessionCookie } from "@/lib/cookies";
import { DEFAULT_LOCALE, isLocale } from "@/lib/locale";
import { readAcademicsScreen } from "@/lib/modules/academics/read";
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

export default async function AdminAcademicsPage() {
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
  if (!can(user, "academics", "view")) notFound();

  const locale = isLocale(account.preferred_locale)
    ? account.preferred_locale
    : DEFAULT_LOCALE;
  const copy = ACADEMICS_COPY[locale];

  const rights: Rights = {
    add: can(user, "academics", "add"),
    edit: can(user, "academics", "edit"),
    delete: can(user, "academics", "delete"),
  };

  const screen = await readAcademicsScreen();

  return (
    <ToastProvider>
      <h1 className="text-h2 font-semibold text-primary">{copy["heading"] ?? ""}</h1>
      <p className="mb-8 mt-1 text-caption text-ink-muted">{copy["intro"] ?? ""}</p>

      <YearsPanel years={screen.years} copy={copy} rights={rights} />
      <InfoPanel info={screen.info} copy={copy} editable={rights.edit} />
      <GradesPanel
        grades={screen.grades}
        stages={screen.classStages}
        copy={copy}
        rights={rights}
      />
      <SectionsPanel
        sections={screen.sections}
        grades={screen.grades}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <SubjectsPanel subjects={screen.subjects} copy={copy} rights={rights} />
      <AssignmentsPanel
        assignments={screen.classSubjects}
        grades={screen.grades}
        subjects={screen.subjects}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <RoutinesPanel
        routines={screen.routines}
        grades={screen.grades}
        sections={screen.sections}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <CalendarPanel
        events={screen.events}
        years={screen.years}
        eventTypes={screen.eventTypes}
        copy={copy}
        rights={rights}
      />
      <ExamTermsPanel
        terms={screen.examTerms}
        exams={screen.exams}
        years={screen.years}
        copy={copy}
        rights={rights}
      />
      <ExamsPanel
        exams={screen.exams}
        terms={screen.examTerms}
        grades={screen.grades}
        subjects={screen.subjects}
        copy={copy}
        rights={rights}
      />
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
