/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason T-040, T-042, T-043,
 * T-050, T-052, T-060 and T-061 each recorded in turn: no M4/M5 card's Files
 * list contains the catalogue.
 *
 * The consent wording is the part worth reading twice. "Consent recorded on"
 * asks for a date the school can point to, not a box to tick — §A-16.2 treats
 * naming a real person publicly as something that needs a traceable agreement,
 * and the label is where that intent reaches the person doing the work.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "আমাদের সম্পর্কে",
  intro: "স্কুলের ইতিহাস, লক্ষ্য, অধ্যক্ষের বাণী, কমিটি ও অর্জন।",

  contentHeading: "ইতিহাস, লক্ষ্য ও অধ্যক্ষের বাণী",
  contentNote: "সমৃদ্ধ টেক্সট — সংরক্ষণের সময় অনুমোদিত ট্যাগ ছাড়া সব সরিয়ে ফেলা হয়।",
  contentLocked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",
  history: "ইতিহাস",
  vision: "ভিশন",
  mission: "মিশন",
  principalMessage: "অধ্যক্ষের বাণী",
  principalName: "অধ্যক্ষের নাম",
  principalDesignation: "পদবি",
  principalPhoto: "অধ্যক্ষের ছবি",
  principalSignature: "অধ্যক্ষের স্বাক্ষর",

  committeeHeading: "পরিচালনা কমিটি",
  committeeNote:
    "সম্মতির তারিখ ছাড়া কারও নাম সাইটে প্রকাশ করা যাবে না। সম্মতি প্রত্যাহার হলে সদস্যকে নিষ্ক্রিয় করুন।",
  memberName: "নাম",
  memberDesignation: "পদবি",
  memberConsentAt: "সম্মতির তারিখ",
  memberActive: "সাইটে প্রকাশিত",
  memberNeedsConsent: "প্রকাশ করতে হলে সম্মতির তারিখ দিন।",
  memberNoConsent: "সম্মতি নেই",

  achievementsHeading: "অর্জন",
  achievementsNote: "যাচাই করা যায় এমন অর্জনই লিখুন।",
  achievementTitle: "শিরোনাম",
  achievementDescription: "বিবরণ",
  achievementYear: "সাল",
  achievementIcon: "আইকন",
  achievementActive: "সক্রিয়",

  sortOrder: "ক্রম",
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  discard: "পরিবর্তন বাতিল",
  errorSummary: "নিচের ঘরগুলো ঠিক করুন",
  empty: "কিছু যোগ করা হয়নি।",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "সারিটি সাইট থেকে সরে যাবে। প্রয়োজনে পরে ফেরানো যাবে।",

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
  heading: "About",
  intro:
    "The school's history, aims, the principal's message, the committee and its achievements.",

  contentHeading: "History, aims and the principal's message",
  contentNote: "Rich text — anything outside the allowlist is stripped on save.",
  contentLocked: "You do not have permission to edit this page.",
  history: "History",
  vision: "Vision",
  mission: "Mission",
  principalMessage: "Principal's message",
  principalName: "Principal's name",
  principalDesignation: "Designation",
  principalPhoto: "Principal's photo",
  principalSignature: "Principal's signature",

  committeeHeading: "Governing committee",
  committeeNote:
    "Nobody is named on the site without a recorded consent date. If consent is withdrawn, deactivate the member.",
  memberName: "Name",
  memberDesignation: "Designation",
  memberConsentAt: "Consent recorded on",
  memberActive: "Published on the site",
  memberNeedsConsent: "Record a consent date before publishing this person.",
  memberNoConsent: "No consent",

  achievementsHeading: "Achievements",
  achievementsNote: "Record only what the school can stand behind.",
  achievementTitle: "Title",
  achievementDescription: "Description",
  achievementYear: "Year",
  achievementIcon: "Icon",
  achievementActive: "Active",

  sortOrder: "Order",
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save changes",
  saving: "Saving…",
  discard: "Discard changes",
  errorSummary: "Fix the fields below",
  empty: "Nothing added yet.",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The row is taken off the site. It can be restored later.",

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

export const ABOUT_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
