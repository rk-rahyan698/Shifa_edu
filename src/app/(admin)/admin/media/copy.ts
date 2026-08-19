/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "মিডিয়া লাইব্রেরি",
  intro:
    "সাইটে ব্যবহৃত সব ফাইল। কোন ফাইল কোথায় ব্যবহৃত হচ্ছে তা প্রতিটি ফাইলের পাতায় দেখা যাবে।",

  storageHeading: "সংরক্ষণের হিসাব",
  assets: "ফাইল",
  variants: "তৈরি করা সংস্করণ",
  orphans: "কোথাও ব্যবহৃত হয়নি",
  totalSize: "মোট আকার",

  filename: "ফাইলের নাম",
  mimeType: "ধরন",
  size: "আকার",
  dimensions: "মাপ",
  bucket: "বাকেট",
  uploadedAt: "যোগ করা হয়েছে",
  uploadedBy: "যোগ করেছেন",
  checksum: "চেকসাম",
  storageKey: "সংরক্ষণ কী",
  usageCount: "ব্যবহার",
  allBuckets: "সব",
  deletedAssets: "মুছে ফেলা ফাইল",

  altText: "বিকল্প লেখা (alt)",
  altTextNote: "স্ক্রিন রিডার এই লেখাটি পড়ে শোনায়। বাংলা আবশ্যক; ইংরেজি ঐচ্ছিক।",
  caption: "ক্যাপশন",

  usageHeading: "কোথায় ব্যবহৃত হচ্ছে",
  usageNote:
    "এই রেকর্ডগুলি ফাইলটি ধরে রেখেছে। সবগুলি থেকে সরানোর আগে ফাইলটি মুছে ফেলা যাবে না।",
  usageEmpty: "কোথাও ব্যবহৃত হয়নি — এটি মুছে ফেলা যাবে।",
  variantsHeading: "তৈরি করা সংস্করণ",

  open: "খুলুন",
  back: "লাইব্রেরিতে ফিরুন",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  cancel: "বাতিল",
  remove: "মুছুন",
  deletedNote: "ফাইলটি মুছে ফেলা হয়েছে। ৩০ দিন পর সংরক্ষণ থেকে স্থায়ীভাবে মুছে যাবে।",
  confirmRemoveTitle: "ফাইলটি মুছে ফেলবেন?",
  confirmRemoveBody:
    "ফাইলটি লাইব্রেরি থেকে সরিয়ে নেওয়া হবে। ৩০ দিন পর সংরক্ষণ থেকেও মুছে যাবে।",

  search: "খুঁজুন",
  noResults: "কোনো ফাইল নেই।",
  rowsPerPage: "প্রতি পাতায়",
  rowActions: "কার্যক্রম",
  pageOf: "পাতা {page} / {total}",
  previous: "আগের",
  next: "পরের",
  tableCaption: "মিডিয়া ফাইলের তালিকা",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  unauthenticated: "সেশনের মেয়াদ শেষ — আবার লগ ইন করুন",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "কাজটি সম্পন্ন করা যায়নি",
  locked: "এই ফাইলের তথ্য সম্পাদনার অনুমতি আপনার নেই।",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "আবশ্যক",
  optionalLabel: "ঐচ্ছিক",
  requiredMessage: "বাংলা আবশ্যক",
  englishMissing: "EN নেই",
};

const en: Copy = {
  heading: "Media library",
  intro: "Every file the site uses. Each file's page shows the records that hold it.",

  storageHeading: "Storage",
  assets: "Files",
  variants: "Generated variants",
  orphans: "Used nowhere",
  totalSize: "Total size",

  filename: "Filename",
  mimeType: "Type",
  size: "Size",
  dimensions: "Dimensions",
  bucket: "Bucket",
  uploadedAt: "Added",
  uploadedBy: "Added by",
  checksum: "Checksum",
  storageKey: "Storage key",
  usageCount: "Used",
  allBuckets: "All",
  deletedAssets: "Deleted files",

  altText: "Alt text",
  altTextNote:
    "A screen reader reads this instead of the image. Bangla is required; English is optional.",
  caption: "Caption",

  usageHeading: "Where this is used",
  usageNote:
    "These records hold the file. It cannot be deleted until it is detached from all of them.",
  usageEmpty: "Used nowhere — this file can be deleted.",
  variantsHeading: "Generated variants",

  open: "Open",
  back: "Back to the library",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  remove: "Delete",
  deletedNote:
    "This file is deleted. The stored object is removed permanently after 30 days.",
  confirmRemoveTitle: "Delete this file?",
  confirmRemoveBody:
    "The file leaves the library. The stored object is removed after 30 days.",

  search: "Search",
  noResults: "No files.",
  rowsPerPage: "Per page",
  rowActions: "Actions",
  pageOf: "Page {page} of {total}",
  previous: "Previous",
  next: "Next",
  tableCaption: "Media files",

  saved: "Saved",
  deleted: "Deleted",
  unauthenticated: "Your session expired — sign in again",
  forbidden: "You do not have permission to do that",
  invalid: "Those values could not be accepted",
  failed: "That could not be done",
  locked: "You may browse these files but not change them.",

  banglaLabel: "বাংলা",
  englishLabel: "English",
  requiredLabel: "Required",
  optionalLabel: "Optional",
  requiredMessage: "Bangla is required",
  englishMissing: "EN missing",
};

export const MEDIA_COPY: Readonly<Record<Locale, Copy>> = { bn, en };

/** Bytes as something a person reads, in the units a school's files land in. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
