/**
 * Idempotent seed (T-024, ARCHITECTURE.md §B-19).
 *
 * Every insert here is `ON CONFLICT DO NOTHING` on a NATURAL key, so running
 * this script any number of times leaves the database in the state one run
 * leaves it in. PRD §14's seed had no unique key on class grades — running it
 * twice produced 28 of them (AUDIT D-3). That is the bug this file exists in
 * order not to have.
 *
 * DO NOTHING, never UPDATE: a row an editor has since changed in the admin
 * panel is left exactly as they left it. Seeding is how the vocabulary comes
 * into existence, not how it is kept in sync.
 *
 * Raw SQL rather than the Prisma client, deliberately: `ON CONFLICT (username)
 * WHERE deleted_at IS NULL DO NOTHING` against a partial unique index, and
 * `INSERT … SELECT … WHERE NOT EXISTS`, are not expressible through
 * `createMany`. The schema is authoritative SQL (§B-18); the seed speaks it.
 *
 * WHAT THIS FILE MUST NEVER CREATE (§B-19, and the reason each is out):
 *   · `site_stats` values      — students/teachers/pass rate are the school's
 *                                claims and need a `verified_on` date. The
 *                                stats bar renders nothing until then, and
 *                                PRD §5's invented pass rate is gone (AUDIT B-6).
 *                                This file contains no such figure, which is
 *                                what T-024's `grep -ri` Verify proves
 *   · sample teachers, notices, photos, committee members, achievements
 *                              — a real school's public site must never carry
 *                                invented people
 *   · fee amounts
 *   · principal's message, history, vision, mission
 *   · an admission banner asserting an open cycle
 *
 * Where a NOT NULL column needs a value to be structurally valid, it gets the
 * canonical literal `[[CONTENT REQUIRED — DO NOT PUBLISH]]` and only that form.
 * The publish gate (§A-13.3, T-113) matches on the prefix `[[CONTENT REQUIRED`,
 * so a variant would be caught too — but there are no variants here.
 *
 * Run:  npm run db:seed      (or `prisma db seed`, which `migrate reset` calls)
 */

import { randomBytes } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

/** §B-19: the only placeholder form the publish gate recognises. */
const CONTENT_REQUIRED = '[[CONTENT REQUIRED — DO NOT PUBLISH]]';

/** bcrypt cost for the generated Super Admin password (§A-9.2). */
const BCRYPT_COST = 12;

const BN = 'bn';
const EN = 'en';

/** Text that exists once per Phase 1 locale (§A-7.1). */
type Translated = { bn: string; en: string };

/** A `SELECT id` result from a lookup table with a surrogate key. */
type IdRow = { id: bigint };

type Tx = Prisma.TransactionClient;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Bangla-Indic digits, for labels that carry a year (`2026` → `২০২৬`). */
function toBanglaDigits(value: number | string): string {
  const digits = '০১২৩৪৫৬৭৮৯';
  return String(value).replace(/\d/g, (d) => digits[Number(d)] ?? d);
}

/**
 * Insert a row keyed by a surrogate id and a UNIQUE `code`, then return the id
 * whether the insert happened or the row was already there. `ON CONFLICT DO
 * NOTHING` returns no row, which is why the SELECT is not optional.
 */
async function categoryId(
  tx: Tx,
  table: string,
  columns: Prisma.Sql,
  values: Prisma.Sql,
  code: string,
): Promise<bigint> {
  const relation = Prisma.raw(table);
  await tx.$executeRaw`
    INSERT INTO ${relation} (code, ${columns})
    VALUES (${code}, ${values})
    ON CONFLICT (code) DO NOTHING`;
  const rows = await tx.$queryRaw<IdRow[]>`
    SELECT id FROM ${relation} WHERE code = ${code}`;
  const row = rows[0];
  if (!row) throw new Error(`${table}.code = '${code}' vanished between INSERT and SELECT`);
  return row.id;
}

/** One `name` translation per locale for a lookup with a surrogate key. */
async function nameTranslations(
  tx: Tx,
  table: string,
  fkColumn: string,
  id: bigint,
  name: Translated,
): Promise<void> {
  const relation = Prisma.raw(table);
  const fk = Prisma.raw(fkColumn);
  for (const [locale, text] of [
    [BN, name.bn],
    [EN, name.en],
  ] as const) {
    await tx.$executeRaw`
      INSERT INTO ${relation} (${fk}, locale_code, name)
      VALUES (${id}, ${locale}, ${text})
      ON CONFLICT DO NOTHING`;
  }
}

/**
 * A category lookup: the row, plus its `name` translations. `sort_order` is
 * 1-based and follows the order the entries are declared in.
 */
async function seedCategories(
  tx: Tx,
  table: string,
  translationTable: string,
  fkColumn: string,
  entries: readonly { code: string; name: Translated }[],
): Promise<void> {
  let sortOrder = 0;
  for (const entry of entries) {
    sortOrder += 1;
    const id = await categoryId(
      tx,
      table,
      Prisma.sql`sort_order`,
      Prisma.sql`${sortOrder}`,
      entry.code,
    );
    await nameTranslations(tx, translationTable, fkColumn, id, entry.name);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. Locales — adding a language is an INSERT, never a migration (§B-3)
// ─────────────────────────────────────────────────────────────

async function seedLocales(tx: Tx): Promise<void> {
  // Bangla is the default and is unprefixed; English lives under /en
  // (§A-7.1, ADR-005). `ux_locales_single_default` makes a second default a
  // database error, which is why this is data and not configuration.
  const locales = [
    { code: BN, nameNative: 'বাংলা', nameEn: 'Bangla', prefix: '', isDefault: true },
    { code: EN, nameNative: 'English', nameEn: 'English', prefix: 'en', isDefault: false },
  ] as const;

  let sortOrder = 0;
  for (const locale of locales) {
    sortOrder += 1;
    await tx.$executeRaw`
      INSERT INTO locales (code, name_native, name_en, direction, url_prefix, is_default, is_active, sort_order)
      VALUES (${locale.code}, ${locale.nameNative}, ${locale.nameEn}, 'ltr',
              ${locale.prefix}, ${locale.isDefault}, TRUE, ${sortOrder})
      ON CONFLICT (code) DO NOTHING`;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. The authorization vocabulary (§A-5.2, §A-9)
// ─────────────────────────────────────────────────────────────

async function seedAuthorizationVocabulary(tx: Tx): Promise<void> {
  // Roles. `faculty`, `student` and `guardian` are Phase 2 portals (§A-9.5);
  // the vocabulary exists now so that Phase 2 is an INSERT of rows rather than
  // a migration that adds a role column.
  const roles = [
    { code: 'super_admin', isStaff: true, bypasses: true, name: { bn: 'সুপার অ্যাডমিন', en: 'Super Admin' } },
    { code: 'admin', isStaff: true, bypasses: false, name: { bn: 'অ্যাডমিন', en: 'Admin' } },
    { code: 'faculty', isStaff: true, bypasses: false, name: { bn: 'শিক্ষক', en: 'Faculty' } },
    { code: 'student', isStaff: false, bypasses: false, name: { bn: 'শিক্ষার্থী', en: 'Student' } },
    { code: 'guardian', isStaff: false, bypasses: false, name: { bn: 'অভিভাবক', en: 'Guardian' } },
  ] as const;

  let roleOrder = 0;
  for (const role of roles) {
    roleOrder += 1;
    await tx.$executeRaw`
      INSERT INTO roles (code, is_staff, bypasses_checks, sort_order)
      VALUES (${role.code}, ${role.isStaff}, ${role.bypasses}, ${roleOrder})
      ON CONFLICT (code) DO NOTHING`;
    for (const [locale, text] of [
      [BN, role.name.bn],
      [EN, role.name.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO role_translations (role_code, locale_code, name)
        VALUES (${role.code}, ${locale}, ${text})
        ON CONFLICT DO NOTHING`;
    }
  }

  // Modules, in §A-5.2's order. `admin_path` is the sidebar destination and
  // `users` is the one module flagged super-admin-only.
  const modules = [
    {
      code: 'site_settings',
      path: '/admin/settings',
      icon: 'Settings',
      superOnly: false,
      name: { bn: 'সাইট সেটিংস', en: 'Site Settings' },
      description: {
        bn: 'ঠিকানা, যোগাযোগ, সামাজিক লিংক, লুকআপ ও SEO',
        en: 'Address, contact, social links, lookups and SEO',
      },
    },
    {
      code: 'home',
      path: '/admin/home',
      icon: 'Home',
      superOnly: false,
      name: { bn: 'হোম', en: 'Home' },
      description: { bn: 'হিরো স্লাইড, পরিচিতি ও বৈশিষ্ট্য', en: 'Hero slides, intro and features' },
    },
    {
      code: 'about',
      path: '/admin/about',
      icon: 'Info',
      superOnly: false,
      name: { bn: 'পরিচিতি', en: 'About' },
      description: { bn: 'ইতিহাস, কমিটি ও অর্জন', en: 'History, committee and achievements' },
    },
    {
      code: 'academics',
      path: '/admin/academics',
      icon: 'GraduationCap',
      superOnly: false,
      name: { bn: 'শিক্ষাক্রম', en: 'Academics' },
      description: {
        bn: 'শ্রেণি, শাখা, রুটিন, পরীক্ষা ও ক্যালেন্ডার',
        en: 'Grades, sections, routines, exams and calendar',
      },
    },
    {
      code: 'admission',
      path: '/admin/admission',
      icon: 'ClipboardList',
      superOnly: false,
      name: { bn: 'ভর্তি', en: 'Admission' },
      description: { bn: 'ভর্তি তথ্য ও ফি কাঠামো', en: 'Admission information and fee structures' },
    },
    {
      code: 'faculty',
      path: '/admin/faculty',
      icon: 'Users',
      superOnly: false,
      name: { bn: 'শিক্ষকমণ্ডলী', en: 'Faculty' },
      description: { bn: 'শিক্ষকদের সর্বজনীন প্রোফাইল', en: 'Public teacher profiles' },
    },
    {
      code: 'notice',
      path: '/admin/notices',
      icon: 'Megaphone',
      superOnly: false,
      name: { bn: 'নোটিশ', en: 'Notices' },
      description: { bn: 'নোটিশ ও সংযুক্তি', en: 'Notices and attachments' },
    },
    {
      code: 'gallery',
      path: '/admin/gallery',
      icon: 'Image',
      superOnly: false,
      name: { bn: 'গ্যালারি', en: 'Gallery' },
      description: { bn: 'অ্যালবাম, ছবি ও ভিডিও', en: 'Albums, photos and videos' },
    },
    {
      code: 'contact',
      path: '/admin/contact',
      icon: 'Mail',
      superOnly: false,
      name: { bn: 'বার্তা', en: 'Messages' },
      description: { bn: 'যোগাযোগ ফরম থেকে আসা বার্তা', en: 'Messages from the contact form' },
    },
    {
      code: 'media',
      path: '/admin/media',
      icon: 'FolderOpen',
      superOnly: false,
      name: { bn: 'মিডিয়া', en: 'Media' },
      description: { bn: 'আপলোড করা ফাইল ও ছবি', en: 'Uploaded files and images' },
    },
    {
      code: 'users',
      path: '/admin/users',
      icon: 'ShieldCheck',
      superOnly: true,
      name: { bn: 'ব্যবহারকারী', en: 'Users' },
      description: {
        bn: 'ব্যবহারকারী, অনুমতি ও সেশন — কেবল সুপার অ্যাডমিন',
        en: 'Users, permissions and sessions — Super Admin only',
      },
    },
  ] as const;

  let moduleOrder = 0;
  for (const entry of modules) {
    moduleOrder += 1;
    await tx.$executeRaw`
      INSERT INTO modules (code, icon, admin_path, is_super_admin_only, sort_order, is_active)
      VALUES (${entry.code}, ${entry.icon}, ${entry.path}, ${entry.superOnly}, ${moduleOrder}, TRUE)
      ON CONFLICT (code) DO NOTHING`;
    for (const [locale, name, description] of [
      [BN, entry.name.bn, entry.description.bn],
      [EN, entry.name.en, entry.description.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO module_translations (module_code, locale_code, name, description)
        VALUES (${entry.code}, ${locale}, ${name}, ${description})
        ON CONFLICT DO NOTHING`;
    }
  }

  // Actions are rows, not code — adding `export` later is an INSERT (§A-9.3).
  const actions = [
    { code: 'view', name: { bn: 'দেখা', en: 'View' } },
    { code: 'add', name: { bn: 'যোগ', en: 'Add' } },
    { code: 'edit', name: { bn: 'সম্পাদনা', en: 'Edit' } },
    { code: 'delete', name: { bn: 'মুছে ফেলা', en: 'Delete' } },
    { code: 'publish', name: { bn: 'প্রকাশ', en: 'Publish' } },
  ] as const;

  let actionOrder = 0;
  for (const action of actions) {
    actionOrder += 1;
    await tx.$executeRaw`
      INSERT INTO permission_actions (code, sort_order)
      VALUES (${action.code}, ${actionOrder})
      ON CONFLICT (code) DO NOTHING`;
    for (const [locale, text] of [
      [BN, action.name.bn],
      [EN, action.name.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO action_translations (action_code, locale_code, name)
        VALUES (${action.code}, ${locale}, ${text})
        ON CONFLICT DO NOTHING`;
    }
  }

  // Which actions are APPLICABLE per module — §A-5.2's last column. This drives
  // the "—" cells in the permission matrix instead of hardcoding them in the
  // frontend (AUDIT B-1), and the composite FK from `user_module_permissions`
  // makes an inapplicable grant a database error (AUDIT S-3).
  //
  // `users` is deliberately absent. §A-5.2 gives it no action list: it is Super
  // Admin only, and super_admin bypasses checks entirely (§A-9.3). With no
  // `module_actions` row, granting `users:*` to an ordinary admin is refused by
  // the composite FK rather than by application code. Fails closed.
  const applicable: Record<string, readonly string[]> = {
    site_settings: ['view', 'edit'],
    home: ['view', 'edit'],
    about: ['view', 'edit'],
    academics: ['view', 'add', 'edit', 'delete'],
    admission: ['view', 'add', 'edit', 'delete'],
    faculty: ['view', 'add', 'edit', 'delete'],
    notice: ['view', 'add', 'edit', 'delete', 'publish'],
    gallery: ['view', 'add', 'edit', 'delete'],
    contact: ['view', 'delete'],
    media: ['view', 'add', 'delete'],
  };

  for (const [moduleCode, actionCodes] of Object.entries(applicable)) {
    for (const actionCode of actionCodes) {
      await tx.$executeRaw`
        INSERT INTO module_actions (module_code, action_code)
        VALUES (${moduleCode}, ${actionCode})
        ON CONFLICT DO NOTHING`;
    }
  }

  // Protected capabilities, kept off the module cascade (§A-9.4, AUDIT B-2).
  // `special_grants` has no translation table — these strings are operator
  // documentation, not UI copy.
  const grants = [
    {
      code: 'edit_branding',
      description:
        'Edit school name, logo, favicon and wordmark (site_branding). Not unlocked by site_settings:edit.',
    },
    { code: 'export_data', description: 'Export data sets out of the admin panel.' },
    { code: 'purge_deleted', description: 'Permanently purge soft-deleted rows.' },
    { code: 'manage_backups', description: 'Trigger and restore database backups.' },
  ] as const;

  for (const grant of grants) {
    await tx.$executeRaw`
      INSERT INTO special_grants (code, description)
      VALUES (${grant.code}, ${grant.description})
      ON CONFLICT (code) DO NOTHING`;
  }

  // Content lifecycle. `is_public` is what the public read path filters on, so
  // it lives in the row rather than in a hardcoded list of status strings.
  const statuses = [
    { code: 'draft', isPublic: false },
    { code: 'published', isPublic: true },
    { code: 'archived', isPublic: false },
  ] as const;

  let statusOrder = 0;
  for (const status of statuses) {
    statusOrder += 1;
    await tx.$executeRaw`
      INSERT INTO content_statuses (code, is_public, sort_order)
      VALUES (${status.code}, ${status.isPublic}, ${statusOrder})
      ON CONFLICT (code) DO NOTHING`;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Category lookups — admin-managed, extended by INSERT (ADR-002)
// ─────────────────────────────────────────────────────────────

async function seedCategoryLookups(tx: Tx): Promise<void> {
  // `color_hex` is left NULL throughout: a badge colour is a design decision
  // the school's editors make in the admin panel, and choosing one here would
  // be inventing a fact about their site.
  await seedCategories(
    tx,
    'notice_categories',
    'notice_category_translations',
    'notice_category_id',
    [
      { code: 'general', name: { bn: 'সাধারণ', en: 'General' } },
      { code: 'admission', name: { bn: 'ভর্তি', en: 'Admission' } },
      { code: 'exam', name: { bn: 'পরীক্ষা', en: 'Examination' } },
      { code: 'result', name: { bn: 'ফলাফল', en: 'Result' } },
      { code: 'holiday', name: { bn: 'ছুটি', en: 'Holiday' } },
      { code: 'event', name: { bn: 'অনুষ্ঠান', en: 'Event' } },
    ],
  );

  await seedCategories(
    tx,
    'gallery_categories',
    'gallery_category_translations',
    'gallery_category_id',
    [
      { code: 'campus', name: { bn: 'ক্যাম্পাস', en: 'Campus' } },
      { code: 'classrooms', name: { bn: 'শ্রেণিকক্ষ', en: 'Classrooms' } },
      { code: 'events', name: { bn: 'অনুষ্ঠান', en: 'Events' } },
      { code: 'activities', name: { bn: 'কার্যক্রম', en: 'Activities' } },
    ],
  );

  await seedCategories(
    tx,
    'calendar_event_types',
    'calendar_event_type_translations',
    'calendar_event_type_id',
    [
      { code: 'holiday', name: { bn: 'ছুটি', en: 'Holiday' } },
      { code: 'exam', name: { bn: 'পরীক্ষা', en: 'Examination' } },
      { code: 'event', name: { bn: 'অনুষ্ঠান', en: 'Event' } },
      { code: 'vacation', name: { bn: 'অবকাশ', en: 'Vacation' } },
    ],
  );

  // Fee TYPES only. Fee AMOUNTS are the school's to enter (§B-19) — nothing
  // here carries a number.
  const feeTypes = [
    {
      code: 'admission',
      recurring: false,
      oneTime: true,
      name: { bn: 'ভর্তি ফি', en: 'Admission Fee' },
    },
    {
      code: 'monthly',
      recurring: true,
      oneTime: false,
      name: { bn: 'মাসিক বেতন', en: 'Monthly Tuition' },
    },
    {
      code: 'exam',
      recurring: false,
      oneTime: false,
      name: { bn: 'পরীক্ষার ফি', en: 'Examination Fee' },
    },
    {
      code: 'transport',
      recurring: true,
      oneTime: false,
      name: { bn: 'পরিবহন ফি', en: 'Transport Fee' },
    },
    {
      code: 'lab',
      recurring: false,
      oneTime: false,
      name: { bn: 'ল্যাব ফি', en: 'Laboratory Fee' },
    },
  ] as const;

  let feeOrder = 0;
  for (const feeType of feeTypes) {
    feeOrder += 1;
    const id = await categoryId(
      tx,
      'fee_types',
      Prisma.sql`is_recurring_monthly, is_one_time, sort_order`,
      Prisma.sql`${feeType.recurring}, ${feeType.oneTime}, ${feeOrder}`,
      feeType.code,
    );
    // `fee_type_translations` carries `note` as well as `name`; `note` stays
    // NULL — it is editor copy, not vocabulary.
    await nameTranslations(tx, 'fee_type_translations', 'fee_type_id', id, feeType.name);
  }

  // Designations are job titles, not people. Seeding "Assistant Teacher" once
  // is the whole point of the lookup (§B-3) — a rename is one UPDATE, not one
  // per faculty row.
  await seedCategories(tx, 'designations', 'designation_translations', 'designation_id', [
    { code: 'principal', name: { bn: 'অধ্যক্ষ', en: 'Principal' } },
    { code: 'vice_principal', name: { bn: 'উপাধ্যক্ষ', en: 'Vice Principal' } },
    { code: 'senior_teacher', name: { bn: 'সিনিয়র শিক্ষক', en: 'Senior Teacher' } },
    { code: 'assistant_teacher', name: { bn: 'সহকারী শিক্ষক', en: 'Assistant Teacher' } },
  ]);

  await seedCategories(tx, 'class_stages', 'class_stage_translations', 'class_stage_id', [
    { code: 'early_years', name: { bn: 'প্রাক-প্রাথমিক', en: 'Early Years' } },
    { code: 'primary', name: { bn: 'প্রাথমিক', en: 'Primary' } },
    { code: 'junior', name: { bn: 'নিম্ন মাধ্যমিক', en: 'Junior' } },
    { code: 'secondary', name: { bn: 'মাধ্যমিক', en: 'Secondary' } },
  ]);

  // Lookups with a TEXT natural primary key and no surrogate id.
  const channelTypes = [
    { code: 'phone', icon: 'Phone' },
    { code: 'mobile', icon: 'Smartphone' },
    { code: 'whatsapp', icon: 'MessageCircle' },
    { code: 'email', icon: 'Mail' },
    { code: 'fax', icon: 'Printer' },
  ] as const;

  let channelOrder = 0;
  for (const channel of channelTypes) {
    channelOrder += 1;
    await tx.$executeRaw`
      INSERT INTO contact_channel_types (code, icon, sort_order)
      VALUES (${channel.code}, ${channel.icon}, ${channelOrder})
      ON CONFLICT (code) DO NOTHING`;
  }

  const socialPlatforms = [
    { code: 'facebook', icon: 'Facebook' },
    { code: 'youtube', icon: 'Youtube' },
    { code: 'x', icon: 'Twitter' },
    { code: 'linkedin', icon: 'Linkedin' },
    { code: 'instagram', icon: 'Instagram' },
  ] as const;

  let socialOrder = 0;
  for (const platform of socialPlatforms) {
    socialOrder += 1;
    await tx.$executeRaw`
      INSERT INTO social_platforms (code, icon, sort_order)
      VALUES (${platform.code}, ${platform.icon}, ${socialOrder})
      ON CONFLICT (code) DO NOTHING`;
  }

  // The template is what turns a stored video id into an embed URL, so the
  // provider list is data rather than a switch statement in a component.
  const videoProviders = [
    { code: 'youtube', template: 'https://www.youtube.com/embed/{id}' },
    { code: 'facebook', template: 'https://www.facebook.com/plugins/video.php?href={id}' },
  ] as const;

  for (const provider of videoProviders) {
    await tx.$executeRaw`
      INSERT INTO video_providers (code, embed_url_template, is_active)
      VALUES (${provider.code}, ${provider.template}, TRUE)
      ON CONFLICT (code) DO NOTHING`;
  }

  // Registration identifier TYPES. The school's actual EIIN is a value an admin
  // enters into `school_registration_ids`; only the vocabulary is structural.
  const registrationIdTypes = [
    { code: 'eiin', label: { bn: 'ইআইআইএন', en: 'EIIN' } },
    { code: 'emis', label: { bn: 'ইএমআইএস কোড', en: 'EMIS Code' } },
    { code: 'school_code', label: { bn: 'স্কুল কোড', en: 'School Code' } },
    { code: 'biin', label: { bn: 'বিআইআইএন', en: 'BIIN' } },
  ] as const;

  let registrationOrder = 0;
  for (const idType of registrationIdTypes) {
    registrationOrder += 1;
    await tx.$executeRaw`
      INSERT INTO registration_id_types (code, sort_order)
      VALUES (${idType.code}, ${registrationOrder})
      ON CONFLICT (code) DO NOTHING`;
    for (const [locale, text] of [
      [BN, idType.label.bn],
      [EN, idType.label.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO registration_id_type_translations (registration_id_type_code, locale_code, label)
        VALUES (${idType.code}, ${locale}, ${text})
        ON CONFLICT DO NOTHING`;
    }
  }

  const messageStatuses = ['new', 'read', 'archived', 'spam'] as const;
  let messageStatusOrder = 0;
  for (const code of messageStatuses) {
    messageStatusOrder += 1;
    await tx.$executeRaw`
      INSERT INTO contact_message_statuses (code, sort_order)
      VALUES (${code}, ${messageStatusOrder})
      ON CONFLICT (code) DO NOTHING`;
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Super Admin — password generated at runtime, printed once
// ─────────────────────────────────────────────────────────────

const SUPER_ADMIN_USERNAME = 'superadmin';

/**
 * Creates the Super Admin if it does not exist and returns the generated
 * password, or `null` if the account was already there.
 *
 * The password is never a literal in any file (AUDIT S-12). It is generated
 * here, hashed with bcrypt at §A-9.2's cost, printed once to the console, and
 * then unrecoverable — `must_change_password` forces rotation at first login,
 * so its lifetime is one login.
 *
 * `email` is deliberately NULL. Password reset needs it (§A-9.2, AUDIT S-4),
 * but inventing an address for a real school would be inventing a fact
 * (§A-3.1); setting one is the second thing the Super Admin does, after
 * rotating the password.
 *
 * `ON CONFLICT (username) WHERE deleted_at IS NULL` names the partial unique
 * index `ux_users_username`, which is what makes a username reusable after a
 * soft delete. Without the predicate Postgres cannot match the index.
 */
async function seedSuperAdmin(tx: Tx): Promise<string | null> {
  const password = randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const created = await tx.$queryRaw<IdRow[]>`
    INSERT INTO users (username, email, password_hash, display_name, role_code,
                       preferred_locale, is_active, must_change_password)
    VALUES (${SUPER_ADMIN_USERNAME}, NULL, ${passwordHash}, 'Super Admin', 'super_admin',
            ${BN}, TRUE, TRUE)
    ON CONFLICT (username) WHERE deleted_at IS NULL DO NOTHING
    RETURNING id`;

  return created.length > 0 ? password : null;
}

// ─────────────────────────────────────────────────────────────
// 5-6. Academic year and class grades
// ─────────────────────────────────────────────────────────────

async function seedAcademicYear(tx: Tx): Promise<void> {
  // The current calendar year. `ux_academic_year_current` permits exactly one
  // `is_current` row, so a year seeded into a database that already has a
  // current one is inserted as not-current rather than failing — that is what
  // keeps this re-runnable in a later year.
  const year = new Date().getFullYear();
  const code = String(year);

  await tx.$executeRaw`
    INSERT INTO academic_years (code, starts_on, ends_on, is_current, is_active)
    SELECT ${code}, ${`${year}-01-01`}::date, ${`${year}-12-31`}::date,
           NOT EXISTS (SELECT 1 FROM academic_years WHERE is_current), TRUE
    ON CONFLICT (code) DO NOTHING`;

  const rows = await tx.$queryRaw<IdRow[]>`
    SELECT id FROM academic_years WHERE code = ${code}`;
  const row = rows[0];
  if (!row) throw new Error(`academic_years.code = '${code}' vanished between INSERT and SELECT`);

  for (const [locale, label] of [
    [BN, `${toBanglaDigits(year)} শিক্ষাবর্ষ`],
    [EN, `${year} Academic Year`],
  ] as const) {
    await tx.$executeRaw`
      INSERT INTO academic_year_translations (academic_year_id, locale_code, label)
      VALUES (${row.id}, ${locale}, ${label})
      ON CONFLICT DO NOTHING`;
  }
}

/**
 * The fourteen grades of PRODUCT-SPEC §P-2, Pre-Play through Class 10. Names,
 * not claims — and the rows this task's Verify counts: seeded twice there are
 * fourteen, because `ON CONFLICT (code) DO NOTHING` is on the natural key PRD
 * §14 did not have (AUDIT D-3).
 */
async function seedClassGrades(tx: Tx): Promise<void> {
  const grades = [
    { code: 'pre_play', stage: 'early_years', name: { bn: 'প্রি-প্লে', en: 'Pre-Play' }, short: { bn: 'প্রি-প্লে', en: 'Pre-Play' } },
    { code: 'play', stage: 'early_years', name: { bn: 'প্লে', en: 'Play' }, short: { bn: 'প্লে', en: 'Play' } },
    { code: 'nursery', stage: 'early_years', name: { bn: 'নার্সারি', en: 'Nursery' }, short: { bn: 'নার্সারি', en: 'Nursery' } },
    { code: 'kg', stage: 'early_years', name: { bn: 'কেজি', en: 'KG' }, short: { bn: 'কেজি', en: 'KG' } },
    { code: 'class_1', stage: 'primary', name: { bn: 'প্রথম শ্রেণি', en: 'Class 1' }, short: { bn: '১ম', en: 'I' } },
    { code: 'class_2', stage: 'primary', name: { bn: 'দ্বিতীয় শ্রেণি', en: 'Class 2' }, short: { bn: '২য়', en: 'II' } },
    { code: 'class_3', stage: 'primary', name: { bn: 'তৃতীয় শ্রেণি', en: 'Class 3' }, short: { bn: '৩য়', en: 'III' } },
    { code: 'class_4', stage: 'primary', name: { bn: 'চতুর্থ শ্রেণি', en: 'Class 4' }, short: { bn: '৪র্থ', en: 'IV' } },
    { code: 'class_5', stage: 'primary', name: { bn: 'পঞ্চম শ্রেণি', en: 'Class 5' }, short: { bn: '৫ম', en: 'V' } },
    { code: 'class_6', stage: 'junior', name: { bn: 'ষষ্ঠ শ্রেণি', en: 'Class 6' }, short: { bn: '৬ষ্ঠ', en: 'VI' } },
    { code: 'class_7', stage: 'junior', name: { bn: 'সপ্তম শ্রেণি', en: 'Class 7' }, short: { bn: '৭ম', en: 'VII' } },
    { code: 'class_8', stage: 'junior', name: { bn: 'অষ্টম শ্রেণি', en: 'Class 8' }, short: { bn: '৮ম', en: 'VIII' } },
    { code: 'class_9', stage: 'secondary', name: { bn: 'নবম শ্রেণি', en: 'Class 9' }, short: { bn: '৯ম', en: 'IX' } },
    { code: 'class_10', stage: 'secondary', name: { bn: 'দশম শ্রেণি', en: 'Class 10' }, short: { bn: '১০ম', en: 'X' } },
  ] as const;

  let sortOrder = 0;
  for (const grade of grades) {
    sortOrder += 1;
    await tx.$executeRaw`
      INSERT INTO class_grades (code, class_stage_id, sort_order, is_active)
      SELECT ${grade.code}, cs.id, ${sortOrder}, TRUE
      FROM class_stages cs
      WHERE cs.code = ${grade.stage}
      ON CONFLICT (code) DO NOTHING`;

    const rows = await tx.$queryRaw<IdRow[]>`
      SELECT id FROM class_grades WHERE code = ${grade.code}`;
    const row = rows[0];
    if (!row) throw new Error(`class_grades.code = '${grade.code}' was not inserted`);

    for (const [locale, name, short] of [
      [BN, grade.name.bn, grade.short.bn],
      [EN, grade.name.en, grade.short.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO class_grade_translations (class_grade_id, locale_code, name, short_name)
        VALUES (${row.id}, ${locale}, ${name}, ${short})
        ON CONFLICT DO NOTHING`;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 7. Singletons — one row each, id = 1
// ─────────────────────────────────────────────────────────────

/**
 * The five `id = 1 CHECK (id = 1)` tables. Each needs its row to exist before
 * an admin form has anything to UPDATE.
 *
 * Only the identity facts PRODUCT-SPEC §P-2 lists as confirmed are written:
 * school name, slogan, address, founded year. Everything §B-19 forbids —
 * history, vision, mission, the principal's message, statistics — is left NULL
 * for the school to supply. A NULL is honest; a placeholder in a nullable
 * column would only be noise for the publish gate to trip over.
 */
async function seedSingletons(tx: Tx): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO site_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

  // `school_name` is NOT NULL, so the school's own name is what goes here
  // (§P-2, confirmed).
  for (const [locale, schoolName] of [
    [BN, 'শিফা ইন্টারন্যাশনাল স্কুল'],
    [EN, 'Shifa International School'],
  ] as const) {
    await tx.$executeRaw`
      INSERT INTO site_branding_translations (site_branding_id, locale_code, school_name)
      VALUES (1, ${locale}, ${schoolName})
      ON CONFLICT DO NOTHING`;
  }

  await tx.$executeRaw`
    INSERT INTO site_settings (id, founded_year, default_locale_code)
    VALUES (1, 2020, ${BN})
    ON CONFLICT (id) DO NOTHING`;

  for (const [locale, slogan, address] of [
    [
      BN,
      'প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা',
      'মক্কা লেকভিউ টাওয়ার, মুক্তিনগর, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ',
    ],
    [
      EN,
      'Quality Education from Pre-Play to Class 10',
      'Mokka Lakeview Tower, Muktinagar, Siddhirganj, Narayanganj',
    ],
  ] as const) {
    await tx.$executeRaw`
      INSERT INTO site_settings_translations (site_settings_id, locale_code, slogan, address)
      VALUES (1, ${locale}, ${slogan}, ${address})
      ON CONFLICT DO NOTHING`;
  }

  // home_content, about_content and academic_info get the parent row only.
  // Every column on their translation tables is editor copy §B-19 keeps out of
  // the seed, so an empty translation row would say nothing its absence does not.
  await tx.$executeRaw`
    INSERT INTO home_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await tx.$executeRaw`
    INSERT INTO about_content (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  await tx.$executeRaw`
    INSERT INTO academic_info (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
}

// ─────────────────────────────────────────────────────────────
// 8. Pages — placeholder SEO metadata per page per locale
// ─────────────────────────────────────────────────────────────

/**
 * `page_translations.meta_title` is NOT NULL and unique bilingual meta per page
 * is a requirement (§B-6, AUDIT A-3), so every page needs a row before T-100
 * has anything to edit. The title a real page needs is copy the school writes,
 * which makes this exactly the case §B-19's last paragraph describes: the
 * canonical `[[CONTENT REQUIRED — DO NOT PUBLISH]]` literal, which the publish
 * gate rejects on sight.
 *
 * `route_pattern` is the Bangla (unprefixed) path. English is the same path
 * under `/en` (§A-7.1, ADR-005) and is derived, not stored twice.
 */
async function seedPages(tx: Tx): Promise<void> {
  const pages = [
    { code: 'home', route: '/' },
    { code: 'about', route: '/about' },
    { code: 'academics', route: '/academics' },
    { code: 'admission', route: '/admission' },
    { code: 'faculty', route: '/faculty' },
    { code: 'notices', route: '/notices' },
    { code: 'gallery', route: '/gallery' },
    { code: 'contact', route: '/contact' },
  ] as const;

  let sortOrder = 0;
  for (const page of pages) {
    sortOrder += 1;
    await tx.$executeRaw`
      INSERT INTO pages (code, route_pattern, is_indexable, sort_order)
      VALUES (${page.code}, ${page.route}, TRUE, ${sortOrder})
      ON CONFLICT (code) DO NOTHING`;

    const rows = await tx.$queryRaw<IdRow[]>`
      SELECT id FROM pages WHERE code = ${page.code}`;
    const row = rows[0];
    if (!row) throw new Error(`pages.code = '${page.code}' was not inserted`);

    for (const locale of [BN, EN] as const) {
      await tx.$executeRaw`
        INSERT INTO page_translations (page_id, locale_code, meta_title)
        VALUES (${row.id}, ${locale}, ${CONTENT_REQUIRED})
        ON CONFLICT DO NOTHING`;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 9. Features — facilities, not claims (§B-19, PRODUCT-SPEC §P-2)
// ─────────────────────────────────────────────────────────────

/**
 * `features` has no `code` column and therefore no natural key of its own, so
 * `ON CONFLICT` has nothing to name. The natural key is the English title in
 * `feature_translations`, and `INSERT … WHERE NOT EXISTS` on it is what makes a
 * second run a no-op.
 *
 * `description` stays NULL — the six titles name facilities, which is why §B-19
 * permits them; a paragraph about each facility would be a claim.
 */
async function seedFeatures(tx: Tx): Promise<void> {
  const features = [
    { icon: 'GraduationCap', title: { bn: 'অভিজ্ঞ শিক্ষক', en: 'Experienced Teachers' } },
    { icon: 'Monitor', title: { bn: 'ডিজিটাল সাক্ষরতা', en: 'Digital Literacy' } },
    { icon: 'MessageCircle', title: { bn: 'স্পোকেন ইংলিশ', en: 'Spoken English' } },
    { icon: 'BookOpen', title: { bn: 'ইসলামিক শিক্ষা', en: 'Islamic Education' } },
    { icon: 'Library', title: { bn: 'লাইব্রেরি', en: 'Library' } },
    { icon: 'Shield', title: { bn: 'নিরাপদ ক্যাম্পাস', en: 'Safe Campus' } },
  ] as const;

  let sortOrder = 0;
  for (const feature of features) {
    sortOrder += 1;
    const inserted = await tx.$queryRaw<IdRow[]>`
      INSERT INTO features (icon, sort_order, is_active)
      SELECT ${feature.icon}, ${sortOrder}, TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM feature_translations
        WHERE locale_code = ${EN} AND title = ${feature.title.en}
      )
      RETURNING id`;

    const row = inserted[0];
    if (!row) continue; // already seeded — leave the editor's version alone

    for (const [locale, title] of [
      [BN, feature.title.bn],
      [EN, feature.title.en],
    ] as const) {
      await tx.$executeRaw`
        INSERT INTO feature_translations (feature_id, locale_code, title)
        VALUES (${row.id}, ${locale}, ${title})
        ON CONFLICT DO NOTHING`;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // One transaction: a half-applied seed would leave the vocabulary
  // inconsistent, and the foreign keys between these steps mean §B-19's order
  // is not optional.
  const generatedPassword = await prisma.$transaction(
    async (tx) => {
      await seedLocales(tx);
      await seedAuthorizationVocabulary(tx);
      await seedCategoryLookups(tx);
      const password = await seedSuperAdmin(tx);
      await seedAcademicYear(tx);
      await seedClassGrades(tx);
      await seedSingletons(tx);
      await seedPages(tx);
      await seedFeatures(tx);
      return password;
    },
    { timeout: 120_000 },
  );

  console.log('Seed complete.');

  if (generatedPassword === null) {
    console.log(`Super Admin '${SUPER_ADMIN_USERNAME}' already exists — password unchanged.`);
    return;
  }

  // Printed once, here, and nowhere else. It is not stored, not written to a
  // file, and not recoverable (AUDIT S-12).
  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────');
  console.log('  │ SUPER ADMIN CREATED — this password is shown ONCE');
  console.log(`  │   username: ${SUPER_ADMIN_USERNAME}`);
  console.log(`  │   password: ${generatedPassword}`);
  console.log('  │ Log in, change it immediately (you will be forced to),');
  console.log('  │ and set an email address so password reset can work.');
  console.log('  └──────────────────────────────────────────────────────────');
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
