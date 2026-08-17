/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * `publishNow` and `publishHint` are the pair worth reading together: this
 * screen has two separate save actions (draft, publish), and the wording has
 * to keep an admin from thinking the ordinary Save button puts a notice on the
 * site — see `NoticesPanel.tsx`.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "নোটিশ",
  intro: "নোটিশ তৈরি, সংযুক্তি ও প্রকাশ — খসড়া সংরক্ষণ ও প্রকাশ আলাদা কাজ।",

  category: "বিষয়শ্রেণি",
  selectCategory: "বিষয়শ্রেণি বাছুন",
  title: "শিরোনাম",
  excerpt: "সংক্ষিপ্ত বিবরণ",
  body: "বিস্তারিত",
  slug: "স্লাগ (URL)",
  slugAuto: "শিরোনাম থেকে স্বয়ংক্রিয়",
  slugRegenerate: "আবার তৈরি করুন",
  pinned: "পিন করা",

  status: "অবস্থা",
  statusDraft: "খসড়া",
  statusPublished: "প্রকাশিত",
  statusArchived: "আর্কাইভ",

  publishedAt: "প্রকাশের সময়",
  publishNow: "এখনই প্রকাশ করুন",
  publishSchedule: "নির্ধারিত সময়ে প্রকাশ করুন",
  publishHint: "শুধু সংরক্ষণ করলে নোটিশটি খসড়া থাকবে — সাইটে দেখাবে না।",
  unpublish: "প্রকাশ প্রত্যাহার (খসড়ায় ফেরান)",
  publishLocked: "নোটিশ প্রকাশের অনুমতি আপনার নেই — শুধু খসড়া সংরক্ষণ করতে পারবেন।",

  attachmentsHeading: "সংযুক্তি",
  attachmentsNote: "প্রয়োজনমতো একাধিক ফাইল যুক্ত করা যাবে — যেমন রুটিন, সিট প্ল্যান, সিলেবাস।",
  attachmentLabel: "সংযুক্তির নাম",
  attachmentsSaveFirst: "সংযুক্তি যোগ করতে আগে নোটিশটি সংরক্ষণ করুন।",

  active: "সক্রিয়",
  sortOrder: "ক্রম",
  add: "নোটিশ যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "খসড়া সংরক্ষণ",
  saving: "সংরক্ষণ হচ্ছে…",
  empty: "কোনো নোটিশ যোগ করা হয়নি।",
  locked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "নোটিশটি সাইট থেকে সরে যাবে।",

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
  heading: "Notices",
  intro: "Write, attach and publish notices — saving a draft and publishing are separate.",

  category: "Category",
  selectCategory: "Choose a category",
  title: "Title",
  excerpt: "Excerpt",
  body: "Body",
  slug: "Slug (URL)",
  slugAuto: "Generated from the title",
  slugRegenerate: "Regenerate",
  pinned: "Pinned",

  status: "Status",
  statusDraft: "Draft",
  statusPublished: "Published",
  statusArchived: "Archived",

  publishedAt: "Publish time",
  publishNow: "Publish now",
  publishSchedule: "Publish at the scheduled time",
  publishHint: "Saving alone keeps the notice a draft — it will not appear on the site.",
  unpublish: "Unpublish (back to draft)",
  publishLocked: "You may not publish notices — only save drafts.",

  attachmentsHeading: "Attachments",
  attachmentsNote: "Add as many files as needed — a routine, seat plan, syllabus.",
  attachmentLabel: "Attachment label",
  attachmentsSaveFirst: "Save the notice first before adding attachments.",

  active: "Active",
  sortOrder: "Order",
  add: "Add notice",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save draft",
  saving: "Saving…",
  empty: "No notices added yet.",
  locked: "You do not have permission to edit this page.",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The notice is taken off the site.",

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

export const NOTICE_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
