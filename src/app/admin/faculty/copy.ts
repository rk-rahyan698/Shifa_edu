/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * The two `*ConsentAt` labels are the pair to read carefully — they follow
 * `about`'s "Consent recorded on" wording rather than a checkbox's "consent
 * given", because §A-16.2 asks for a date the school can point to. A teacher's
 * photograph and biography are a real person's identity on a public website;
 * "recorded on" is answerable in a way "given: yes/no" is not.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "শিক্ষকমণ্ডলী",
  intro: "শিক্ষকদের পরিচিতি, পদবি, বিষয়, ছবি ও প্রকাশের সম্মতি।",

  employeeCode: "কর্মী কোড",
  employeeCodeAuto: "সংরক্ষণের পর স্বয়ংক্রিয়ভাবে দেওয়া হবে",
  fullName: "পূর্ণ নাম",
  qualification: "শিক্ষাগত যোগ্যতা",
  bio: "সংক্ষিপ্ত পরিচিতি",
  designation: "পদবি",
  selectDesignation: "পদবি বাছুন",
  subjectsHeading: "বিষয়সমূহ",
  experienceYears: "অভিজ্ঞতা (বছর)",
  joinedOn: "যোগদানের তারিখ",

  status: "অবস্থা",
  statusDraft: "খসড়া",
  statusPublished: "প্রকাশিত",
  statusArchived: "আর্কাইভ",

  photoHeading: "ছবি",
  publishConsentAt: "প্রকাশের সম্মতি রেকর্ড হয়েছে যে তারিখে",
  photoConsentAt: "ছবি ব্যবহারের সম্মতি রেকর্ড হয়েছে যে তারিখে",
  publishConsentNeeded: "প্রকাশ করতে সম্মতির তারিখ আবশ্যক",
  photoConsentNeeded: "ছবি রাখতে সম্মতির তারিখ আবশ্যক",

  internalHeading: "অভ্যন্তরীণ তথ্য (শুধু সুপার অ্যাডমিন)",
  internalNote: "এই তথ্য কখনো জনসম্মুখে প্রকাশিত হয় না।",
  internalLocked: "এই অংশ শুধুমাত্র সুপার অ্যাডমিন দেখতে ও সম্পাদনা করতে পারেন।",
  internalSaveFirst: "অভ্যন্তরীণ তথ্য যোগ করতে আগে প্রোফাইলটি সংরক্ষণ করুন।",
  personalPhone: "ব্যক্তিগত ফোন",
  personalEmail: "ব্যক্তিগত ইমেইল",
  emergencyContact: "জরুরি যোগাযোগ",
  internalNotes: "অভ্যন্তরীণ মন্তব্য",

  active: "সক্রিয়",
  sortOrder: "ক্রম",
  add: "শিক্ষক যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  empty: "কোনো শিক্ষক যোগ করা হয়নি।",
  locked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "প্রোফাইলটি সাইট থেকে সরে যাবে।",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "আবশ্যক",
  optionalLabel: "ঐচ্ছিক",
  requiredMessage: "বাংলা লেখা আবশ্যক",
  englishMissing: "EN নেই",

  pickerChoose: "আপলোড করুন",
  pickerUploading: "আপলোড হচ্ছে…",
  pickerAltBn: "বিকল্প লেখা (বাংলা)",
  pickerAltEn: "বিকল্প লেখা (English)",
  pickerAltRequired: "বাংলা বিকল্প লেখা আবশ্যক",
  pickerRemove: "সরান",
  pickerTooLarge: "ফাইলটি অনেক বড়",
  pickerFailed: "আপলোড ব্যর্থ হয়েছে",
  pickerCurrent: "বর্তমান ছবি #",
  pickerNone: "কোনো ছবি নেই",
};

const en: Copy = {
  heading: "Faculty",
  intro: "Teacher profiles, designation, subjects, photo and publish consent.",

  employeeCode: "Employee code",
  employeeCodeAuto: "Assigned automatically after saving",
  fullName: "Full name",
  qualification: "Qualification",
  bio: "Short bio",
  designation: "Designation",
  selectDesignation: "Choose a designation",
  subjectsHeading: "Subjects",
  experienceYears: "Experience (years)",
  joinedOn: "Joined on",

  status: "Status",
  statusDraft: "Draft",
  statusPublished: "Published",
  statusArchived: "Archived",

  photoHeading: "Photo",
  publishConsentAt: "Publish consent recorded on",
  photoConsentAt: "Photo consent recorded on",
  publishConsentNeeded: "A consent date is required to publish",
  photoConsentNeeded: "A consent date is required to keep a photo",

  internalHeading: "Internal record (Super Admin only)",
  internalNote: "This information is never shown on the public site.",
  internalLocked: "Only a Super Admin may view or edit this section.",
  internalSaveFirst: "Save the profile first before adding internal details.",
  personalPhone: "Personal phone",
  personalEmail: "Personal email",
  emergencyContact: "Emergency contact",
  internalNotes: "Internal notes",

  active: "Active",
  sortOrder: "Order",
  add: "Add faculty member",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save changes",
  saving: "Saving…",
  empty: "No faculty members added yet.",
  locked: "You do not have permission to edit this page.",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The profile is taken off the site.",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "Required",
  optionalLabel: "Optional",
  requiredMessage: "Bangla is required",
  englishMissing: "EN missing",

  pickerChoose: "Upload",
  pickerUploading: "Uploading…",
  pickerAltBn: "Alt text (Bangla)",
  pickerAltEn: "Alt text (English)",
  pickerAltRequired: "Bangla alt text is required",
  pickerRemove: "Remove",
  pickerTooLarge: "That file is too large",
  pickerFailed: "The upload failed",
  pickerCurrent: "Current image #",
  pickerNone: "No image set",
};

export const FACULTY_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
