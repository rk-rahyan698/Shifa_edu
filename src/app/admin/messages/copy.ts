/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * The retention wording is deliberate. §A-16.1 promises the person who wrote in
 * that their message is held for 12 months and then purged; `purgeAfter` is
 * that promise on screen, so it reads as a date the message *goes*, not as
 * metadata.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "যোগাযোগের বার্তা",
  intro:
    "ওয়েবসাইটের ফর্ম থেকে আসা বার্তা। এখান থেকে উত্তর দেওয়া যায় না — ফোন বা ইমেইলে যোগাযোগ করুন।",

  name: "নাম",
  phone: "ফোন",
  email: "ইমেইল",
  message: "বার্তা",
  status: "অবস্থা",
  submittedAt: "এসেছে",
  readAt: "পড়া হয়েছে",
  readBy: "পড়েছেন",
  purgeAfter: "মুছে যাবে",
  purgeNote: "১২ মাস পর বার্তাটি স্বয়ংক্রিয়ভাবে মুছে যাবে।",
  consentGivenAt: "সম্মতি দেওয়া হয়েছে",
  writtenIn: "যে ভাষায় লেখা",
  unread: "পড়া হয়নি",

  open: "খুলুন",
  back: "তালিকায় ফিরুন",
  trash: "মুছে ফেলা বার্তা",
  inbox: "ইনবক্স",
  allStatuses: "সব",

  changeStatus: "অবস্থা পরিবর্তন",
  remove: "মুছুন",
  restore: "ফিরিয়ে আনুন",
  deletedNote: "এই বার্তাটি মুছে ফেলা হয়েছে। ফিরিয়ে আনা যাবে।",

  search: "খুঁজুন",
  noResults: "কোনো বার্তা নেই।",
  rowsPerPage: "প্রতি পাতায়",
  pageOf: "পাতা {page} / {total}",
  previous: "আগের",
  next: "পরের",
  tableCaption: "যোগাযোগের বার্তার তালিকা",

  status_new: "নতুন",
  status_read: "পড়া হয়েছে",
  status_archived: "সংরক্ষিত",
  status_spam: "স্প্যাম",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  unauthenticated: "সেশনের মেয়াদ শেষ — আবার লগ ইন করুন",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "কাজটি সম্পন্ন করা যায়নি",
  locked: "বার্তা মুছে ফেলা বা অবস্থা পরিবর্তনের অনুমতি আপনার নেই।",
};

const en: Copy = {
  heading: "Contact messages",
  intro:
    "Enquiries from the website form. There is no reply from here — respond by phone or email.",

  name: "Name",
  phone: "Phone",
  email: "Email",
  message: "Message",
  status: "Status",
  submittedAt: "Received",
  readAt: "Read",
  readBy: "Read by",
  purgeAfter: "Purged on",
  purgeNote: "The message is deleted automatically 12 months after it arrived.",
  consentGivenAt: "Consent given",
  writtenIn: "Written in",
  unread: "Unread",

  open: "Open",
  back: "Back to the list",
  trash: "Deleted messages",
  inbox: "Inbox",
  allStatuses: "All",

  changeStatus: "Change status",
  remove: "Delete",
  restore: "Restore",
  deletedNote: "This message is in the trash. It can be restored.",

  search: "Search",
  noResults: "No messages.",
  rowsPerPage: "Per page",
  pageOf: "Page {page} of {total}",
  previous: "Previous",
  next: "Next",
  tableCaption: "Contact messages",

  status_new: "New",
  status_read: "Read",
  status_archived: "Archived",
  status_spam: "Spam",

  saved: "Saved",
  deleted: "Deleted",
  unauthenticated: "Your session expired — sign in again",
  forbidden: "You do not have permission to do that",
  invalid: "Those values could not be accepted",
  failed: "That could not be done",
  locked: "You may read these messages but not change or delete them.",
};

export const MESSAGES_COPY: Readonly<Record<Locale, Copy>> = { bn, en };

/** A `contact_message_statuses` code as a label, falling back to the code. */
export function statusLabel(copy: Copy, code: string): string {
  return copy[`status_${code}`] ?? code;
}
