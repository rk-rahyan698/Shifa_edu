/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason T-040, T-042, T-043,
 * T-050, T-052, T-060, T-061 and T-062 each recorded in turn: no M4/M5 card's
 * Files list contains the catalogue.
 *
 * One string is deliberately absent: the sentence an admin sees when a class
 * cannot be deleted. That message names the fee structures and exams standing
 * in the way, so it is composed on the server where those rows are in hand and
 * arrives as a `FieldIssue` — see `blockedMessage` in the module's
 * `actions.ts`. A translated template here could only say "something is in the
 * way", which is exactly what this card's Contract refuses to settle for.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "শিক্ষা কার্যক্রম",
  intro: "শিক্ষাবর্ষ, শ্রেণি, শাখা, বিষয়, রুটিন, ক্যালেন্ডার ও পরীক্ষা।",

  yearsHeading: "শিক্ষাবর্ষ",
  yearsNote: "একসাথে একটিই চলতি বর্ষ থাকতে পারে।",
  yearCode: "কোড",
  yearLabel: "নাম",
  yearStartsOn: "শুরু",
  yearEndsOn: "শেষ",
  yearCurrent: "চলতি বর্ষ",

  infoHeading: "সাধারণ তথ্য",
  infoNote: "সমৃদ্ধ টেক্সট — সংরক্ষণের সময় অনুমোদিত ট্যাগ ছাড়া সব সরিয়ে ফেলা হয়।",
  curriculum: "পাঠ্যক্রম",
  classTiming: "ক্লাসের সময়",
  assessment: "মূল্যায়ন পদ্ধতি",

  gradesHeading: "শ্রেণি",
  gradesNote:
    "যে শ্রেণির সাথে ফি কাঠামো বা পরীক্ষা যুক্ত আছে, সেটি মুছে ফেলা যাবে না — আগে সেগুলো সরান।",
  gradeCode: "কোড",
  gradeName: "শ্রেণির নাম",
  gradeShortName: "সংক্ষিপ্ত নাম",
  gradeStage: "স্তর",
  gradeBlocked: "যুক্ত রেকর্ড আছে",

  sectionsHeading: "শাখা",
  sectionsNote: "প্রতিটি শাখা একটি শ্রেণি ও একটি শিক্ষাবর্ষের অধীনে।",
  sectionName: "শাখার নাম",
  sectionCapacity: "আসন সংখ্যা",

  subjectsHeading: "বিষয় তালিকা",
  subjectsNote: "একটি বিষয় একবারই লিখুন; শ্রেণিতে যুক্ত করা আলাদা কাজ।",
  subjectCode: "কোড",
  subjectName: "বিষয়ের নাম",
  subjectShortName: "সংক্ষিপ্ত নাম",

  assignmentsHeading: "শ্রেণিভিত্তিক বিষয়",
  assignmentsNote: "কোন শ্রেণিতে কোন বিষয় পড়ানো হয়, শিক্ষাবর্ষ অনুযায়ী।",
  assignmentOptional: "ঐচ্ছিক বিষয়",
  assign: "যুক্ত করুন",
  unassign: "সরান",

  routinesHeading: "ক্লাস রুটিন",
  routinesNote:
    "নতুন রুটিন আপলোড করলে ঐ শ্রেণি ও শাখার আগের চলতি রুটিনটি স্বয়ংক্রিয়ভাবে বাতিল হবে।",
  routineEffectiveFrom: "কার্যকর তারিখ",
  routineCurrent: "চলতি রুটিন",
  routineFile: "রুটিন ফাইল (PDF)",
  routineWholeClass: "পুরো শ্রেণি",

  calendarHeading: "শিক্ষা ক্যালেন্ডার",
  calendarNote: "একদিনের ঘটনা হলে শেষ তারিখ খালি রাখুন।",
  eventType: "ধরন",
  eventTitle: "শিরোনাম",
  eventDescription: "বিবরণ",
  eventStartsOn: "শুরু",
  eventEndsOn: "শেষ",

  examTermsHeading: "পরীক্ষার পর্ব",
  examTermsNote: "যেমন — প্রথম সাময়িক, অর্ধবার্ষিক, বার্ষিক।",
  examTermCode: "কোড",
  examTermName: "পর্বের নাম",

  examsHeading: "পরীক্ষার সময়সূচি",
  examsNote: "বিষয় খালি রাখলে এটি পুরো শ্রেণির সাধারণ তারিখ হিসেবে গণ্য হবে।",
  examDate: "তারিখ",
  examStartsAt: "শুরুর সময়",
  examEndsAt: "শেষের সময়",
  examNote: "মন্তব্য",

  year: "শিক্ষাবর্ষ",
  grade: "শ্রেণি",
  section: "শাখা",
  subject: "বিষয়",
  examTerm: "পরীক্ষার পর্ব",
  selectYear: "শিক্ষাবর্ষ বাছুন",
  selectGrade: "শ্রেণি বাছুন",
  selectSection: "শাখা (ঐচ্ছিক)",
  selectSubject: "বিষয় বাছুন",
  selectStage: "স্তর বাছুন",
  selectType: "ধরন বাছুন",
  selectTerm: "পর্ব বাছুন",
  selectSubjectOptional: "বিষয় (ঐচ্ছিক)",

  active: "সক্রিয়",
  sortOrder: "ক্রম",
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  discard: "পরিবর্তন বাতিল",
  empty: "কিছু যোগ করা হয়নি।",
  locked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "সারিটি সাইট থেকে সরে যাবে।",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "আবশ্যক",
  optionalLabel: "ঐচ্ছিক",
  requiredMessage: "বাংলা লেখা আবশ্যক",
  englishMissing: "EN নেই",

  rtBold: "গাঢ়",
  rtItalic: "তির্যক",
  rtLink: "লিংক",
  rtHeading: "শিরোনাম",
  rtBulletList: "তালিকা",
  rtWillStrip: "অনুমোদিত নয় এমন ট্যাগ সরিয়ে ফেলা হবে",
  rtPreview: "প্রিভিউ",
  rtSource: "সোর্স",
  rtEmpty: "কিছু লেখা হয়নি",

  fileChoose: "আপলোড করুন",
  fileUploading: "আপলোড হচ্ছে…",
  fileLabelBn: "ফাইলের বিবরণ (বাংলা)",
  fileLabelEn: "ফাইলের বিবরণ (English)",
  fileLabelRequired: "বাংলা বিবরণ আবশ্যক",
  fileTooLarge: "ফাইলটি অনেক বড়",
  fileFailed: "আপলোড ব্যর্থ হয়েছে",
  fileCurrent: "বর্তমান ফাইল #",
  fileNone: "কোনো ফাইল নেই",
  fileRemove: "সরান",
};

const en: Copy = {
  heading: "Academics",
  intro: "Academic years, classes, sections, subjects, routines, calendar and exams.",

  yearsHeading: "Academic years",
  yearsNote: "Only one year can be the current one at a time.",
  yearCode: "Code",
  yearLabel: "Name",
  yearStartsOn: "Starts",
  yearEndsOn: "Ends",
  yearCurrent: "Current year",

  infoHeading: "General information",
  infoNote: "Rich text — anything outside the allowlist is stripped on save.",
  curriculum: "Curriculum",
  classTiming: "Class timings",
  assessment: "Assessment",

  gradesHeading: "Classes",
  gradesNote:
    "A class with fee structures or exams attached cannot be removed — clear those first.",
  gradeCode: "Code",
  gradeName: "Class name",
  gradeShortName: "Short name",
  gradeStage: "Stage",
  gradeBlocked: "Has dependent records",

  sectionsHeading: "Sections",
  sectionsNote: "Each section belongs to one class in one academic year.",
  sectionName: "Section name",
  sectionCapacity: "Capacity",

  subjectsHeading: "Subject master",
  subjectsNote: "Enter a subject once; assigning it to a class is a separate step.",
  subjectCode: "Code",
  subjectName: "Subject name",
  subjectShortName: "Short name",

  assignmentsHeading: "Class subjects",
  assignmentsNote: "Which subjects a class is taught, per academic year.",
  assignmentOptional: "Optional subject",
  assign: "Assign",
  unassign: "Remove",

  routinesHeading: "Class routines",
  routinesNote:
    "Uploading a new routine automatically retires the current one for that class and section.",
  routineEffectiveFrom: "Effective from",
  routineCurrent: "Current routine",
  routineFile: "Routine file (PDF)",
  routineWholeClass: "Whole class",

  calendarHeading: "Academic calendar",
  calendarNote: "Leave the end date empty for a single-day event.",
  eventType: "Type",
  eventTitle: "Title",
  eventDescription: "Description",
  eventStartsOn: "Starts",
  eventEndsOn: "Ends",

  examTermsHeading: "Exam terms",
  examTermsNote: "For example — first term, half yearly, annual.",
  examTermCode: "Code",
  examTermName: "Term name",

  examsHeading: "Exam schedule",
  examsNote: "Leave the subject empty for a date that belongs to the whole class.",
  examDate: "Date",
  examStartsAt: "Starts at",
  examEndsAt: "Ends at",
  examNote: "Note",

  year: "Academic year",
  grade: "Class",
  section: "Section",
  subject: "Subject",
  examTerm: "Exam term",
  selectYear: "Choose an academic year",
  selectGrade: "Choose a class",
  selectSection: "Section (optional)",
  selectSubject: "Choose a subject",
  selectStage: "Choose a stage",
  selectType: "Choose a type",
  selectTerm: "Choose a term",
  selectSubjectOptional: "Subject (optional)",

  active: "Active",
  sortOrder: "Order",
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save changes",
  saving: "Saving…",
  discard: "Discard changes",
  empty: "Nothing added yet.",
  locked: "You do not have permission to edit this page.",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The row is taken off the site.",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "Required",
  optionalLabel: "Optional",
  requiredMessage: "Bangla is required",
  englishMissing: "EN missing",

  rtBold: "Bold",
  rtItalic: "Italic",
  rtLink: "Link",
  rtHeading: "Heading",
  rtBulletList: "Bullet list",
  rtWillStrip: "Tags outside the allowlist will be removed",
  rtPreview: "Preview",
  rtSource: "Source",
  rtEmpty: "Nothing written yet",

  fileChoose: "Upload",
  fileUploading: "Uploading…",
  fileLabelBn: "File description (Bangla)",
  fileLabelEn: "File description (English)",
  fileLabelRequired: "A Bangla description is required",
  fileTooLarge: "That file is too large",
  fileFailed: "The upload failed",
  fileCurrent: "Current file #",
  fileNone: "No file chosen",
  fileRemove: "Remove",
};

export const ACADEMICS_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
