/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * These live here rather than in `src/i18n/*.json` for the reason T-040,
 * T-042, T-043, T-050 and T-052 each recorded in turn: that file is in no M4/M5
 * card's Files list, so every screen so far has carried its own map and the
 * consolidation is waiting on a card that owns the catalogue. Keeping the same
 * shape — one flat record per locale, looked up by key — is what will make that
 * merge mechanical when it comes.
 *
 * Bangla first in every pair. It is the default locale (§A-7.3) and the one the
 * school office reads; writing English first here is how a screen quietly ends
 * up designed around the translation.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "সাইট সেটিংস",
  intro:
    "স্কুলের পরিচিতি ও যোগাযোগের তথ্য এখানে সম্পাদনা করুন। ব্র্যান্ডিং প্যানেলটি আলাদা অনুমতির অধীনে।",

  brandingHeading: "ব্র্যান্ডিং",
  brandingNote: "স্কুলের নাম, লোগো ও ফেভিকন — এগুলো পরিবর্তনের জন্য আলাদা অনুমতি লাগে।",
  brandingLocked: "এই প্যানেল সম্পাদনার অনুমতি আপনার নেই।",
  schoolName: "স্কুলের নাম",
  schoolShortName: "সংক্ষিপ্ত নাম",
  logo: "লোগো",
  logoReversed: "উল্টো রঙের লোগো",
  favicon: "ফেভিকন",
  ogImage: "শেয়ার ছবি (OG)",

  settingsHeading: "সাধারণ সেটিংস",
  settingsNote: "ঠিকানা, অফিস সময়, স্লোগান ও মানচিত্র।",
  settingsLocked: "এই প্যানেল সম্পাদনার অনুমতি আপনার নেই।",
  slogan: "স্লোগান",
  address: "ঠিকানা",
  officeHours: "অফিস সময়",
  footerNote: "ফুটার নোট",
  foundedYear: "প্রতিষ্ঠার সাল",
  mapEmbedUrl: "গুগল ম্যাপ এম্বেড লিংক",
  latitude: "অক্ষাংশ",
  longitude: "দ্রাঘিমাংশ",

  statsHeading: "প্রকাশিত পরিসংখ্যান",
  statsNote:
    "যাচাইয়ের তারিখ ছাড়া কোনো সংখ্যা প্রকাশ করা যাবে না। উৎস লিখে রাখুন — কে, কবে যাচাই করেছে।",
  statCode: "কোড",
  statValue: "সংখ্যা",
  statSuffix: "প্রত্যয় (+, %)",
  statIcon: "আইকন",
  statVerifiedOn: "যাচাইয়ের তারিখ",
  statSourceNote: "উৎস",
  statLabel: "শিরোনাম",
  statActive: "প্রকাশিত",
  statNeedsVerification: "প্রকাশ করতে হলে যাচাইয়ের তারিখ দিন।",

  channelsHeading: "যোগাযোগের মাধ্যম",
  channelsNote: "ফোন, ইমেইল ও অন্যান্য — প্রতিটির জন্য একটি করে সারি।",
  channelType: "ধরন",
  channelValue: "মান",
  channelLabel: "পরিচিতি",
  channelPublic: "সাইটে দেখানো হবে",
  channelPrimary: "প্রধান",

  socialsHeading: "সামাজিক লিংক",
  socialsNote: "প্রতিটি প্ল্যাটফর্মের জন্য একটি লিংক।",
  socialPlatform: "প্ল্যাটফর্ম",
  socialUrl: "লিংক",

  registrationHeading: "নিবন্ধন নম্বর",
  registrationNote: "EIIN ও অন্যান্য সরকারি কোড।",
  registrationType: "ধরন",
  registrationValue: "নম্বর",
  registrationPublic: "সাইটে দেখানো হবে",

  sortOrder: "ক্রম",
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  discard: "পরিবর্তন বাতিল",
  unsaved: "সংরক্ষণ করা হয়নি",
  errorSummary: "নিচের ঘরগুলো ঠিক করুন",
  empty: "কিছু যোগ করা হয়নি।",
  none: "— নির্বাচন করুন —",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "সারিটি স্থায়ীভাবে মুছে যাবে। এটি ফেরানো যাবে না।",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "আবশ্যক",
  optionalLabel: "ঐচ্ছিক",
  requiredMessage: "বাংলা লেখা আবশ্যক",
  englishMissing: "EN নেই",

  pickerChoose: "ছবি বাছুন",
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
  heading: "Site settings",
  intro:
    "The school's identity and contact details. The branding panel sits behind a separate permission.",

  brandingHeading: "Branding",
  brandingNote:
    "School name, logo and favicon. Changing these needs the branding grant, not just site settings.",
  brandingLocked: "You do not have permission to edit this panel.",
  schoolName: "School name",
  schoolShortName: "Short name",
  logo: "Logo",
  logoReversed: "Reversed logo",
  favicon: "Favicon",
  ogImage: "Share image (OG)",

  settingsHeading: "General settings",
  settingsNote: "Address, office hours, slogan and map.",
  settingsLocked: "You do not have permission to edit this panel.",
  slogan: "Slogan",
  address: "Address",
  officeHours: "Office hours",
  footerNote: "Footer note",
  foundedYear: "Founded",
  mapEmbedUrl: "Google Maps embed URL",
  latitude: "Latitude",
  longitude: "Longitude",

  statsHeading: "Published statistics",
  statsNote:
    "No number is published without a verification date. Record who checked it and when.",
  statCode: "Code",
  statValue: "Value",
  statSuffix: "Suffix (+, %)",
  statIcon: "Icon",
  statVerifiedOn: "Verified on",
  statSourceNote: "Source",
  statLabel: "Label",
  statActive: "Published",
  statNeedsVerification: "Set a verification date before publishing this number.",

  channelsHeading: "Contact channels",
  channelsNote: "Phones, email and the rest — one row each.",
  channelType: "Type",
  channelValue: "Value",
  channelLabel: "Label",
  channelPublic: "Shown on the site",
  channelPrimary: "Primary",

  socialsHeading: "Social links",
  socialsNote: "One link per platform.",
  socialPlatform: "Platform",
  socialUrl: "URL",

  registrationHeading: "Registration identifiers",
  registrationNote: "EIIN and other government codes.",
  registrationType: "Type",
  registrationValue: "Number",
  registrationPublic: "Shown on the site",

  sortOrder: "Order",
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save changes",
  saving: "Saving…",
  discard: "Discard changes",
  unsaved: "Unsaved changes",
  errorSummary: "Fix the fields below",
  empty: "Nothing added yet.",
  none: "— Select —",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The row is removed permanently. This cannot be undone.",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "Required",
  optionalLabel: "Optional",
  requiredMessage: "Bangla is required",
  englishMissing: "EN missing",

  pickerChoose: "Choose image",
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

export const SITE_SETTINGS_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
