/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * `photoConsentAt`'s wording follows `about`'s "recorded on", the same choice
 * `faculty/copy.ts` made — §A-16.2 asks for a date the school can point to,
 * and a school gallery is overwhelmingly photographs of children.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "গ্যালারি",
  intro: "অ্যালবাম, ছবি ও ভিডিও — প্রতিটি ছবির জন্য সম্মতি আবশ্যক।",

  albumsHeading: "অ্যালবাম",
  albumsNote: "প্রতিটি অ্যালবামের একটি বিষয়শ্রেণি, প্রচ্ছদ ছবি ও তারিখ থাকতে পারে।",
  category: "বিষয়শ্রেণি",
  selectCategory: "বিষয়শ্রেণি বাছুন",
  albumTitle: "শিরোনাম",
  albumDescription: "বিবরণ",
  eventDate: "অনুষ্ঠানের তারিখ",
  coverImage: "প্রচ্ছদ ছবি",
  photoCount: "ছবি",

  photosHeading: "ছবি",
  photosNote: "একটি অ্যালবাম বাছুন, তারপর একে একে ছবি যোগ করুন — প্রতিটির জন্য সম্মতি আবশ্যক।",
  selectAlbum: "অ্যালবাম বাছুন",
  photoCaption: "ক্যাপশন",
  photoConsentAt: "বিষয়ের সম্মতি রেকর্ড হয়েছে যে তারিখে",
  photoConsentNeeded: "প্রকাশের জন্য সম্মতির তারিখ আবশ্যক",
  photosSaveAlbumFirst: "ছবি যোগ করতে আগে অ্যালবাম বাছুন বা সংরক্ষণ করুন।",

  videosHeading: "ভিডিও",
  videosNote: "ইউটিউব লিংক পেস্ট করলে শুধু আইডি বের করে সংরক্ষণ করা হবে।",
  provider: "প্ল্যাটফর্ম",
  selectProvider: "প্ল্যাটফর্ম বাছুন",
  videoUrlOrId: "ভিডিও লিংক বা আইডি",
  videoTitle: "শিরোনাম",
  videoDescription: "বিবরণ",
  publishedOn: "প্রকাশের তারিখ",
  thumbnail: "থাম্বনেইল",

  active: "সক্রিয়",
  sortOrder: "ক্রম",
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  empty: "কিছু যোগ করা হয়নি।",
  locked: "এই পাতা সম্পাদনার অনুমতি আপনার নেই।",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  unauthenticated: "সেশন শেষ হয়ে গেছে — আবার লগ ইন করুন",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  confirmRemove: "মুছে ফেলা নিশ্চিত করুন",
  confirmRemoveBody: "আইটেমটি সাইট থেকে সরে যাবে।",

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
  heading: "Gallery",
  intro: "Albums, photos and videos — every photo needs recorded consent.",

  albumsHeading: "Albums",
  albumsNote: "Each album may have a category, a cover image and a date.",
  category: "Category",
  selectCategory: "Choose a category",
  albumTitle: "Title",
  albumDescription: "Description",
  eventDate: "Event date",
  coverImage: "Cover image",
  photoCount: "photos",

  photosHeading: "Photos",
  photosNote: "Choose an album, then add photos one at a time — each needs consent.",
  selectAlbum: "Choose an album",
  photoCaption: "Caption",
  photoConsentAt: "Subject consent recorded on",
  photoConsentNeeded: "A consent date is required to publish",
  photosSaveAlbumFirst: "Choose or save an album first before adding photos.",

  videosHeading: "Videos",
  videosNote: "Pasting a YouTube link stores only the extracted id.",
  provider: "Platform",
  selectProvider: "Choose a platform",
  videoUrlOrId: "Video link or id",
  videoTitle: "Title",
  videoDescription: "Description",
  publishedOn: "Published on",
  thumbnail: "Thumbnail",

  active: "Active",
  sortOrder: "Order",
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  save: "Save changes",
  saving: "Saving…",
  empty: "Nothing added yet.",
  locked: "You do not have permission to edit this page.",

  saved: "Saved",
  deleted: "Removed",
  forbidden: "You do not have permission to do that",
  unauthenticated: "Your session has ended — sign in again",
  invalid: "Those values were not accepted",
  failed: "That could not be saved",

  confirmRemove: "Confirm removal",
  confirmRemoveBody: "The item is taken off the site.",

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

export const GALLERY_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
