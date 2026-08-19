/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason T-040, T-042, T-043,
 * T-050, T-052 and T-060 each recorded in turn: no M4/M5 card's Files list
 * contains the catalogue, so every screen so far carries its own map. The shape
 * is identical everywhere, which is what will make the eventual merge
 * mechanical.
 *
 * Nothing here is content. §A-3.1 is explicit that the school's own words are
 * loaded by the school (T-130) — these are labels on the machinery, and a
 * default slogan or a sample feature would be the project inventing facts about
 * a school it has never visited.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "হোম পেজ",
  intro: "হোম পেজের স্লাইড, পরিচিতি, কল-টু-অ্যাকশন ও বৈশিষ্ট্য।",

  slidesHeading: "হিরো স্লাইড",
  slidesNote:
    "ছবি, শিরোনাম ও সময়সূচি। ছবির বাংলা বিকল্প লেখা ছাড়া কোনো স্লাইড সংরক্ষণ করা যাবে না।",
  slidesLocked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",
  slideTitle: "শিরোনাম",
  slideSubtitle: "উপ-শিরোনাম",
  slideCtaLabel: "বোতামের লেখা",
  slideCtaUrl: "বোতামের লিংক",
  slideImage: "স্লাইডের ছবি",
  slideStartsAt: "শুরু",
  slideEndsAt: "শেষ",
  slideScheduleHint: "সময় UTC হিসেবে দেখানো ও সংরক্ষিত হয়। খালি রাখলে সবসময় দেখাবে।",
  slideActive: "সক্রিয়",
  slideAltMissing: "এই ছবির বাংলা বিকল্প লেখা নেই — সংরক্ষণ করা যাবে না।",
  slideNeedsImage: "একটি ছবি আপলোড করুন।",
  reorder: "ক্রম সংরক্ষণ করুন",
  reordered: "ক্রম সংরক্ষণ হয়েছে",
  moveUp: "উপরে",
  moveDown: "নিচে",
  moved: "সরানো হয়েছে",

  contentHeading: "পরিচিতি ও কল-টু-অ্যাকশন",
  contentNote: "হোম পেজের পরিচিতি অনুচ্ছেদ এবং ভর্তি/যোগাযোগের আহ্বান।",
  introText: "পরিচিতি",
  ctaHeading: "আহ্বানের শিরোনাম",
  ctaBody: "আহ্বানের বিবরণ",
  ctaButtonLabel: "বোতামের লেখা",
  ctaUrl: "বোতামের লিংক",

  featuresHeading: "বৈশিষ্ট্য",
  featuresNote: "হোম পেজে দেখানো সংক্ষিপ্ত বৈশিষ্ট্যের তালিকা।",
  featureTitle: "শিরোনাম",
  featureIcon: "আইকন",
  featureImage: "ছবি",
  featureActive: "সক্রিয়",

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
  heading: "Home page",
  intro: "Hero slides, the introduction, the call to action and the feature tiles.",

  slidesHeading: "Hero slides",
  slidesNote:
    "Image, headline and schedule. A slide cannot be saved until its image has Bangla alt text.",
  slidesLocked: "You do not have permission to edit this page.",
  slideTitle: "Headline",
  slideSubtitle: "Subheading",
  slideCtaLabel: "Button label",
  slideCtaUrl: "Button link",
  slideImage: "Slide image",
  slideStartsAt: "Starts",
  slideEndsAt: "Ends",
  slideScheduleHint: "Shown and stored in UTC. Leave both blank to show it always.",
  slideActive: "Active",
  slideAltMissing: "This image has no Bangla alt text — it cannot be saved.",
  slideNeedsImage: "Upload an image.",
  reorder: "Save order",
  reordered: "Order saved",
  moveUp: "Move up",
  moveDown: "Move down",
  moved: "Moved",

  contentHeading: "Introduction and call to action",
  contentNote: "The home page's opening paragraph and its admissions prompt.",
  introText: "Introduction",
  ctaHeading: "Call-to-action heading",
  ctaBody: "Call-to-action body",
  ctaButtonLabel: "Button label",
  ctaUrl: "Button link",

  featuresHeading: "Features",
  featuresNote: "The short feature tiles shown on the home page.",
  featureTitle: "Title",
  featureIcon: "Icon",
  featureImage: "Image",
  featureActive: "Active",

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

export const HOME_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
