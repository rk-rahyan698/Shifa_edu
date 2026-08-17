/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 *
 * The matrix's **column and row headings are not here.** They come from
 * `module_translations` and `action_translations` through the read model — a
 * permission matrix whose headings were inlined in a component is one that
 * cannot be relabelled without a deploy, and this card's Do line requires the
 * grid to be rendered from data.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "অ্যাডমিন ব্যবস্থাপনা",
  intro:
    "অ্যাকাউন্ট তৈরি, স্থগিত ও মুছে ফেলা এবং প্রতিটি অ্যাকাউন্টের অনুমতি নির্ধারণ। এই পাতাটি কেবল সুপার অ্যাডমিনের জন্য।",

  accountsHeading: "অ্যাকাউন্ট",
  accountsNote:
    "স্থগিত করলে বা মুছে ফেললে ওই ব্যবহারকারীর সব চালু সেশন সঙ্গে সঙ্গে বাতিল হয়ে যায়।",
  newAccount: "নতুন অ্যাডমিন",

  username: "ইউজারনেম",
  email: "ইমেইল",
  displayName: "নাম",
  role: "ভূমিকা",
  selectRole: "ভূমিকা বাছুন",
  preferredLocale: "পছন্দের ভাষা",
  selectLocale: "ভাষা বাছুন",
  active: "সক্রিয়",
  suspended: "স্থগিত",
  mustChangePassword: "প্রথম লগ ইনে পাসওয়ার্ড বদলাতে হবে",
  lastLogin: "সর্বশেষ লগ ইন",
  neverLoggedIn: "কখনও লগ ইন করেনি",
  lockedUntil: "লক থাকবে",
  liveSessions: "চালু সেশন",

  generatedHeading: "তৈরি হওয়া পাসওয়ার্ড",
  generatedNote:
    "এই পাসওয়ার্ডটি আর কখনও দেখানো হবে না। এখনই সংশ্লিষ্ট ব্যক্তিকে দিন — প্রথম লগ ইনে তাঁকে এটি বদলাতে হবে।",
  generatedDismiss: "বন্ধ করুন",

  matrixHeading: "অনুমতি",
  matrixNote:
    "প্রতিটি ঘর একটি স্বাধীন অনুমতি — কোনো ক্যাসকেড নেই। যে ঘরে ‘—’ আছে, সেই মডিউলে ওই কাজটি প্রযোজ্য নয়।",
  matrixSelectUser: "ব্যবহারকারী বাছুন",
  matrixInapplicable: "প্রযোজ্য নয়",
  matrixSuperAdmin:
    "সুপার অ্যাডমিন সব যাচাই এড়িয়ে যান, তাই এই অ্যাকাউন্টের জন্য কোনো অনুমতি সারি প্রযোজ্য নয়।",
  matrixModule: "মডিউল",
  matrixSelectAll: "সব",
  matrixClear: "কিছুই না",

  grantsHeading: "বিশেষ অনুমতি",
  grantsNote:
    "site_settings:edit দিয়ে ব্র্যান্ডিং খোলা যায় না — এটি আলাদা টেবিল, আলাদা যাচাই।",

  suspend: "স্থগিত করুন",
  reinstate: "পুনর্বহাল করুন",
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  remove: "মুছুন",
  cancel: "বাতিল",
  save: "সংরক্ষণ করুন",
  saving: "সংরক্ষণ হচ্ছে…",
  empty: "কোনো অ্যাকাউন্ট নেই।",

  confirmRemoveTitle: "অ্যাকাউন্ট মুছে ফেলবেন?",
  confirmRemoveBody:
    "অ্যাকাউন্টটি মুছে ফেলা হবে এবং সব চালু সেশন বাতিল হবে। কার্যকলাপের নথি থেকে যাবে।",
  confirmRemoveConfirm: "মুছে ফেলুন",

  saved: "সংরক্ষণ হয়েছে",
  deleted: "মুছে ফেলা হয়েছে",
  unauthenticated: "সেশনের মেয়াদ শেষ — আবার লগ ইন করুন",
  forbidden: "এই কাজের অনুমতি আপনার নেই",
  invalid: "তথ্য যাচাই করা যায়নি",
  failed: "সংরক্ষণ করা যায়নি",

  banglaLabel: "বাংলা",
  englishLabel: "English",
};

const en: Copy = {
  heading: "Manage admins",
  intro:
    "Create, suspend and delete accounts, and set what each one may do. This page is Super Admin only.",

  accountsHeading: "Accounts",
  accountsNote:
    "Suspending or deleting an account revokes every live session it holds, immediately.",
  newAccount: "New admin",

  username: "Username",
  email: "Email",
  displayName: "Display name",
  role: "Role",
  selectRole: "Choose a role",
  preferredLocale: "Preferred language",
  selectLocale: "Choose a language",
  active: "Active",
  suspended: "Suspended",
  mustChangePassword: "Must change password at first sign-in",
  lastLogin: "Last sign-in",
  neverLoggedIn: "Never signed in",
  lockedUntil: "Locked until",
  liveSessions: "Live sessions",

  generatedHeading: "Generated password",
  generatedNote:
    "This password will not be shown again. Hand it over now — the account must replace it at first sign-in.",
  generatedDismiss: "Dismiss",

  matrixHeading: "Permissions",
  matrixNote:
    "Every cell is an independent toggle — there is no cascade. A cell showing “—” means the action does not apply to that module.",
  matrixSelectUser: "Choose an account",
  matrixInapplicable: "Not applicable",
  matrixSuperAdmin:
    "A Super Admin bypasses every check, so no permission row applies to this account.",
  matrixModule: "Module",
  matrixSelectAll: "All",
  matrixClear: "None",

  grantsHeading: "Special grants",
  grantsNote:
    "site_settings:edit cannot unlock branding — it is a separate table behind a separate check.",

  suspend: "Suspend",
  reinstate: "Reinstate",
  add: "Add",
  edit: "Edit",
  remove: "Delete",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  empty: "No accounts yet.",

  confirmRemoveTitle: "Delete this account?",
  confirmRemoveBody:
    "The account is removed and every live session is revoked. Its activity log entries remain.",
  confirmRemoveConfirm: "Delete",

  saved: "Saved",
  deleted: "Deleted",
  unauthenticated: "Your session expired — sign in again",
  forbidden: "You do not have permission to do that",
  invalid: "Those values could not be accepted",
  failed: "That could not be saved",

  banglaLabel: "বাংলা",
  englishLabel: "English",
};

export const USERS_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
