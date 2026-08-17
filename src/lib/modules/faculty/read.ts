/**
 * The `faculty` read model — the §B-7 public profile, its designation and
 * subject lookups, and (separately) the isolated private record.
 *
 * **The private record is not part of `readFacultyScreen`.** §A-16.2 requires
 * physical separation of `faculty_private` from the public profile, and a read
 * model that always joined it — even to hand the page a value it then hides —
 * would put personal contact data in a query path a content editor's render
 * still runs. `readFacultyPrivateMap` is a second function for that reason: the
 * page calls it only when it has already established the caller is
 * `super_admin` (see `page.tsx`), so a non-Super-Admin request never reaches
 * `faculty_private` at all.
 *
 * Consent timestamps are reported as `YYYY-MM-DD`, the same shape `about`'s
 * `CommitteeMemberView.publishConsentAt` uses — a date the school can point to,
 * not a full instant nobody asked for.
 */

import { LOCALES } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

/** One field, in both locales. */
export type DualText = { bn: string; en: string };

export type FacultyView = {
  id: string;
  employeeCode: string | null;
  designationId: string;
  photoMediaId: string | null;
  experienceYears: number | null;
  /** `YYYY-MM-DD`, or "" when the column is null. */
  joinedOn: string;
  publishConsentAt: string;
  photoConsentAt: string;
  statusCode: string;
  sortOrder: number;
  fullName: DualText;
  qualification: DualText;
  bio: DualText;
  subjectIds: readonly string[];
};

export type DesignationOption = { id: string; code: string; name: DualText };
export type SubjectOption = { id: string; code: string; name: DualText };

export type FacultyScreen = {
  faculty: readonly FacultyView[];
  designations: readonly DesignationOption[];
  subjects: readonly SubjectOption[];
};

/** `faculty_private`, isolated — see this file's header. */
export type FacultyPrivateView = {
  facultyId: string;
  personalPhone: string;
  personalEmail: string;
  emergencyContact: string;
  internalNotes: string;
};

const EMPTY_DUAL: DualText = { bn: "", en: "" };

export async function readFacultyScreen(): Promise<FacultyScreen> {
  const [faculty, designations, subjects] = await Promise.all([
    prisma.faculty.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { facultyTranslations: true, facultySubjects: true },
    }),
    prisma.designation.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { designationTranslations: true },
    }),
    prisma.subject.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ id: "asc" }],
      include: { subjectTranslations: true },
    }),
  ]);

  return {
    faculty: faculty.map(toFacultyView),
    designations: designations.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: pivot(row.designationTranslations, (entry) => entry.name),
    })),
    subjects: subjects.map((row) => ({
      id: String(row.id),
      code: row.code,
      name: pivot(row.subjectTranslations, (entry) => entry.name),
    })),
  };
}

/** Called only by a caller that has already verified the request is Super Admin. */
export async function readFacultyPrivateMap(): Promise<
  ReadonlyMap<string, FacultyPrivateView>
> {
  const rows = await prisma.facultyPrivate.findMany();

  return new Map(
    rows.map((row) => [
      String(row.facultyId),
      {
        facultyId: String(row.facultyId),
        personalPhone: row.personalPhone ?? "",
        personalEmail: row.personalEmail ?? "",
        emergencyContact: row.emergencyContact ?? "",
        internalNotes: row.internalNotes ?? "",
      },
    ]),
  );
}

function toFacultyView(row: {
  id: bigint;
  employeeCode: string | null;
  designationId: bigint;
  photoMediaId: bigint | null;
  experienceYears: number | null;
  joinedOn: Date | null;
  publishConsentAt: Date | null;
  photoConsentAt: Date | null;
  statusCode: string;
  sortOrder: number;
  facultyTranslations: readonly {
    localeCode: string;
    fullName: string;
    qualification: string | null;
    bio: string | null;
  }[];
  facultySubjects: readonly { subjectId: bigint }[];
}): FacultyView {
  return {
    id: String(row.id),
    employeeCode: row.employeeCode,
    designationId: String(row.designationId),
    photoMediaId: idText(row.photoMediaId),
    experienceYears: row.experienceYears,
    joinedOn: row.joinedOn === null ? "" : isoDate(row.joinedOn),
    publishConsentAt: row.publishConsentAt === null ? "" : isoDate(row.publishConsentAt),
    photoConsentAt: row.photoConsentAt === null ? "" : isoDate(row.photoConsentAt),
    statusCode: row.statusCode,
    sortOrder: row.sortOrder,
    fullName: pivot(row.facultyTranslations, (entry) => entry.fullName),
    qualification: pivot(row.facultyTranslations, (entry) => entry.qualification),
    bio: pivot(row.facultyTranslations, (entry) => entry.bio),
    subjectIds: row.facultySubjects.map((entry) => String(entry.subjectId)),
  };
}

/** Rows keyed by locale, turned into one field's pair of values. */
function pivot<Row extends { localeCode: string }>(
  rows: readonly Row[],
  pick: (row: Row) => string | null,
): DualText {
  const value: DualText = { ...EMPTY_DUAL };

  for (const locale of LOCALES) {
    const row = rows.find((candidate) => candidate.localeCode === locale);
    value[locale] = row === undefined ? "" : (pick(row) ?? "");
  }

  return value;
}

function idText(value: bigint | null): string | null {
  return value === null ? null : String(value);
}

/** A `DATE`/`TIMESTAMPTZ` column as `YYYY-MM-DD`, in UTC — see `admission/read.ts`. */
function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
