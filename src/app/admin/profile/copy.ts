/**
 * The screen's own strings, in both admin languages (ADR-007, §A-18).
 *
 * Local rather than in `src/i18n/*.json`, for the reason every M4/M5 card so
 * far has recorded in turn: no card's Files list contains the catalogue.
 */

import type { Locale } from "@/lib/locale";

export type Copy = Readonly<Record<string, string>>;

const bn: Copy = {
  heading: "আমার প্রোফাইল",
  intro: "নিজের তথ্য ও পাসওয়ার্ড। ভূমিকা ও অনুমতি এখান থেকে পরিবর্তন করা যায় না।",

  detailsHeading: "আমার তথ্য",
  username: "ইউজারনেম",
  usernameNote: "ইউজারনেম পরিবর্তন করা যায় না।",
  displayName: "নাম",
  email: "ইমেইল",
  emailNote: "পাসওয়ার্ড রিসেটের লিংক এই ঠিকানায় যাবে।",
  role: "ভূমিকা",
  roleNote: "ভূমিকা কেবল একজন সুপার অ্যাডমিন পরিবর্তন করতে পারেন।",
  lastLogin: "সর্বশেষ লগ ইন",
  neverLoggedIn: "কখনও লগ ইন করেনি",
  preferredLocale: "পছন্দের ভাষা",
  preferredLocaleNote: "অ্যাডমিন প্যানেল এই ভাষায় দেখানো হবে।",
  saveDetails: "তথ্য সংরক্ষণ করুন",

  passwordHeading: "পাসওয়ার্ড পরিবর্তন",
  passwordNote: "পাসওয়ার্ড বদলালে এই ডিভাইস ছাড়া অন্য সব ডিভাইস থেকে লগ আউট হয়ে যাবে।",
  currentPassword: "বর্তমান পাসওয়ার্ড",
  newPassword: "নতুন পাসওয়ার্ড",
  confirmPassword: "পাসওয়ার্ড নিশ্চিত করুন",
  policy: "নতুন পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে এবং বর্তমানটির থেকে আলাদা হতে হবে।",
  savePassword: "পাসওয়ার্ড সংরক্ষণ করুন",
  otherSessions: "অন্য ডিভাইসে চালু সেশন",

  permissionsHeading: "আমার অনুমতি",
  permissionsNote:
    "এটি কেবল দেখার জন্য। অনুমতি পরিবর্তনের জন্য একজন সুপার অ্যাডমিনের সঙ্গে যোগাযোগ করুন।",
  permissionsEmpty: "আপনাকে এখনও কোনো মডিউলের অনুমতি দেওয়া হয়নি।",
  grantsHeading: "বিশেষ অনুমতি",
  grantsEmpty: "কোনো বিশেষ অনুমতি নেই।",
  superAdminNote: "সুপার অ্যাডমিন হিসেবে আপনার সব মডিউলে সম্পূর্ণ অধিকার রয়েছে।",

  savedDetails: "তথ্য সংরক্ষণ হয়েছে",
  savedPassword: "পাসওয়ার্ড পরিবর্তন হয়েছে",
  revokedOthers: "অন্য ডিভাইসের সেশন বাতিল হয়েছে",

  mismatch: "পাসওয়ার্ড দুটি মিলছে না",
  weak: "পাসওয়ার্ড কমপক্ষে ১২ অক্ষরের হতে হবে",
  same: "নতুন পাসওয়ার্ড বর্তমানটির থেকে আলাদা হতে হবে",
  wrong_current: "বর্তমান পাসওয়ার্ড সঠিক নয়",
  invalid: "তথ্য যাচাই করা যায়নি",
  email_taken: "এই ইমেইল ঠিকানা অন্য একটি অ্যাকাউন্টে ব্যবহৃত হচ্ছে",

  banglaLabel: "বাংলা",
  englishLabel: "English",
};

const en: Copy = {
  heading: "My profile",
  intro:
    "Your own details and password. Your role and permissions cannot be changed here.",

  detailsHeading: "My details",
  username: "Username",
  usernameNote: "The username cannot be changed.",
  displayName: "Display name",
  email: "Email",
  emailNote: "Password reset links are sent to this address.",
  role: "Role",
  roleNote: "Only a Super Admin can change a role.",
  lastLogin: "Last sign-in",
  neverLoggedIn: "Never signed in",
  preferredLocale: "Preferred language",
  preferredLocaleNote: "The admin panel is shown in this language.",
  saveDetails: "Save details",

  passwordHeading: "Change password",
  passwordNote: "Changing your password signs you out everywhere except this device.",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm password",
  policy:
    "The new password must be at least 12 characters and different from the current one.",
  savePassword: "Save password",
  otherSessions: "Live sessions on other devices",

  permissionsHeading: "My permissions",
  permissionsNote:
    "This is read-only. Ask a Super Admin if you need something you cannot reach.",
  permissionsEmpty: "You have not been granted any module permissions yet.",
  grantsHeading: "Special grants",
  grantsEmpty: "No special grants.",
  superAdminNote: "As a Super Admin you have full access to every module.",

  savedDetails: "Details saved",
  savedPassword: "Password changed",
  revokedOthers: "Sessions on other devices were revoked",

  mismatch: "The two passwords do not match",
  weak: "The password must be at least 12 characters",
  same: "The new password must be different from the current one",
  wrong_current: "The current password is not correct",
  invalid: "Those details could not be checked",
  email_taken: "That email address already belongs to another account",

  banglaLabel: "বাংলা",
  englishLabel: "English",
};

export const PROFILE_COPY: Readonly<Record<Locale, Copy>> = { bn, en };
