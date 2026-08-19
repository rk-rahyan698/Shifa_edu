/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * The `open*` keys are the ones to read carefully. They are the four states
 * `admissionOpenState` can report, and they exist so the panel can tell an
 * admin *why* the banner is not showing — "you ticked open but the closing date
 * was Tuesday" rather than a bare "closed". A screen that could only say
 * "closed" would send somebody looking for a bug that is not there.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "ভর্তি ও ফি",
  intro: "ভর্তির সময়সূচি, ধাপ, কাগজপত্র, বয়সসীমা, প্রশ্নোত্তর ও ফি কাঠামো।",

  cycleHeading: "ভর্তি চক্র",
  cycleNote:
    "ব্যানারটি তখনই দেখা যাবে যখন চক্রটি চলতি, খোলা ঘোষণা করা এবং আজকের তারিখ নির্ধারিত সময়ের মধ্যে।",
  cycleIsOpen: "ভর্তি খোলা ঘোষণা করুন",
  cycleIsCurrent: "চলতি চক্র",
  cycleOpensOn: "শুরুর তারিখ",
  cycleClosesOn: "শেষ তারিখ",
  cycleExamDate: "ভর্তি পরীক্ষার তারিখ",
  cycleBanner: "ব্যানারের লেখা",
  cycleForm: "ভর্তি ফরম (PDF)",

  openNow: "এখন ভর্তি চলছে",
  openNoCycle: "কোনো চলতি চক্র নেই — একটি শিক্ষাবর্ষ বেছে সংরক্ষণ করুন।",
  openNotDeclared: "চক্র আছে, কিন্তু ভর্তি খোলা ঘোষণা করা হয়নি।",
  openBeforeOpens: "শুরুর তারিখ এখনও আসেনি — সেদিন থেকে ব্যানার দেখা যাবে।",
  openAfterCloses: "শেষ তারিখ পেরিয়ে গেছে — ব্যানার আর দেখা যাচ্ছে না।",

  stepsHeading: "ভর্তির ধাপ",
  stepsNote: "ধাপগুলো ক্রম অনুযায়ী দেখানো হবে। চক্র না বাছলে ধাপটি সব চক্রে প্রযোজ্য।",
  stepNumber: "ধাপ নম্বর",
  stepTitle: "শিরোনাম",
  stepDescription: "বিবরণ",
  stepIcon: "আইকন",
  stepEvergreen: "সব চক্রে প্রযোজ্য",

  documentsHeading: "প্রয়োজনীয় কাগজপত্র",
  documentsNote: "যেগুলো অবশ্যই লাগবে সেগুলো আবশ্যক হিসেবে চিহ্নিত করুন।",
  documentName: "কাগজের নাম",
  documentNote: "মন্তব্য",
  documentMandatory: "আবশ্যক",

  eligibilityHeading: "শ্রেণিভিত্তিক বয়সসীমা",
  eligibilityNote: "বয়স দশমিকসহ লেখা যাবে — যেমন ৫.৫ বছর।",
  minAge: "সর্বনিম্ন বয়স",
  maxAge: "সর্বোচ্চ বয়স",
  ageAsOf: "বয়স গণনার তারিখ",
  eligibilityNoteField: "মন্তব্য",

  faqsHeading: "সাধারণ প্রশ্নোত্তর",
  faqsNote: "উত্তর সমৃদ্ধ টেক্সট — অনুমোদিত ট্যাগ ছাড়া সব সরিয়ে ফেলা হয়।",
  faqQuestion: "প্রশ্ন",
  faqAnswer: "উত্তর",

  feesHeading: "ফি কাঠামো",
  feesNote:
    "সারি শ্রেণি, কলাম ফি-র ধরন। নতুন ধরনের চার্জ যোগ করতে নিচে নতুন ফি-র ধরন তৈরি করুন — কোনো মাইগ্রেশন লাগবে না।",
  feeAmount: "টাকার পরিমাণ",
  feeSave: "সংরক্ষণ",
  feeClear: "মুছুন",
  feeEmpty: "ধার্য নয়",

  feeTypesHeading: "ফি-র ধরন",
  feeTypesNote: "এখানে একটি ধরন যোগ করলেই উপরের ছকে নতুন কলাম আসবে।",
  feeTypeCode: "কোড",
  feeTypeName: "ধরনের নাম",
  feeTypeNote: "মন্তব্য",
  feeTypeRecurring: "মাসিক",
  feeTypeOneTime: "এককালীন",
  feeTypeRetire: "নিষ্ক্রিয় করুন",
  feeTypeRetired: "নিষ্ক্রিয়",
  confirmRetire: "নিষ্ক্রিয় করা নিশ্চিত করুন",
  confirmRetireBody:
    "ধরনটি আর নতুন করে ব্যবহার করা যাবে না, তবে আগের ফি-র হিসাব অক্ষত থাকবে।",

  year: "শিক্ষাবর্ষ",
  grade: "শ্রেণি",
  selectYear: "শিক্ষাবর্ষ বাছুন",
  selectGrade: "শ্রেণি বাছুন",
  selectCycle: "চক্র (ঐচ্ছিক)",

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
  heading: "Admission & fees",
  intro:
    "The admission cycle, its steps, required documents, age limits, FAQs and the fee grid.",

  cycleHeading: "Admission cycle",
  cycleNote:
    "The banner appears only when the cycle is current, declared open, and today falls inside its dates.",
  cycleIsOpen: "Declare admission open",
  cycleIsCurrent: "Current cycle",
  cycleOpensOn: "Opens on",
  cycleClosesOn: "Closes on",
  cycleExamDate: "Admission test date",
  cycleBanner: "Banner text",
  cycleForm: "Admission form (PDF)",

  openNow: "Admission is open right now",
  openNoCycle: "No cycle is marked current — choose an academic year and save one.",
  openNotDeclared: "A cycle exists, but admission has not been declared open.",
  openBeforeOpens: "The opening date has not arrived — the banner appears from that day.",
  openAfterCloses: "The closing date has passed — the banner is no longer shown.",

  stepsHeading: "Admission steps",
  stepsNote:
    "Steps are shown in order. Leave the cycle empty for a step that applies to every cycle.",
  stepNumber: "Step number",
  stepTitle: "Title",
  stepDescription: "Description",
  stepIcon: "Icon",
  stepEvergreen: "Applies to every cycle",

  documentsHeading: "Required documents",
  documentsNote: "Mark the ones an applicant must bring as mandatory.",
  documentName: "Document name",
  documentNote: "Note",
  documentMandatory: "Mandatory",

  eligibilityHeading: "Age eligibility, per class",
  eligibilityNote: "Ages take one decimal place — 5.5 years is a real answer.",
  minAge: "Minimum age",
  maxAge: "Maximum age",
  ageAsOf: "Age as of",
  eligibilityNoteField: "Note",

  faqsHeading: "Frequently asked questions",
  faqsNote: "Answers are rich text — anything outside the allowlist is stripped on save.",
  faqQuestion: "Question",
  faqAnswer: "Answer",

  feesHeading: "Fee grid",
  feesNote:
    "Rows are classes, columns are fee types. To add a new kind of charge, create a fee type below — no migration is needed.",
  feeAmount: "Amount",
  feeSave: "Save",
  feeClear: "Clear",
  feeEmpty: "Not charged",

  feeTypesHeading: "Fee types",
  feeTypesNote: "Adding a type here adds a column to the grid above.",
  feeTypeCode: "Code",
  feeTypeName: "Type name",
  feeTypeNote: "Note",
  feeTypeRecurring: "Monthly",
  feeTypeOneTime: "One-time",
  feeTypeRetire: "Retire",
  feeTypeRetired: "Retired",
  confirmRetire: "Confirm retiring this type",
  confirmRetireBody:
    "The type can no longer be used for new charges. Existing fee amounts are left untouched.",

  year: "Academic year",
  grade: "Class",
  selectYear: "Choose an academic year",
  selectGrade: "Choose a class",
  selectCycle: "Cycle (optional)",

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

export const ADMISSION_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
