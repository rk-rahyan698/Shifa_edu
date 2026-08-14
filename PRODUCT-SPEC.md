# Shifa International School — Product Specification

**Version:** 1.0
**Date:** 14 August 2026
**Domain:** shifaintschool.com
**Status:** Product-level specification — page layouts, admin UI, API surface, reference data.

> **Relationship to the other documents.** This file assumes every decision in `ARCHITECTURE.md` (schema, permission model, i18n/URL strategy, security) and every token in `design-system.md` (colors, fonts, components) as settled fact and specifies product behavior on top of them. It does **not** re-argue or restate those decisions — where a UI element depends on one, it links to the section rather than duplicating it. If anything below appears to conflict with `ARCHITECTURE.md` or `design-system.md`, those two files win; file an ADR and correct this document.
>
> This document originates from `PRD.md` (retired). Its §5 (schema), §6 (auth), §10 (design tokens), §13.1 (security checklist) and §16 (dev checklist) are dropped entirely — they are superseded by `ARCHITECTURE.md` Parts A/B, `design-system.md`, and `BUILD-TRACKER.md` respectively, and restating them here would just create a second copy to keep in sync.

---

## Table of Contents

- [P-1. Project Overview](#p-1-project-overview)
- [P-2. School Facts — Known vs. Needs Verification](#p-2-school-facts--known-vs-needs-verification)
- [P-3. Tech Stack](#p-3-tech-stack)
- [P-4. Project Structure](#p-4-project-structure)
- [P-5. Full Route Table](#p-5-full-route-table)
- [P-6. Public Pages — Detailed Specs](#p-6-public-pages--detailed-specs)
- [P-7. Admin Panel — Detailed Specs](#p-7-admin-panel--detailed-specs)
- [P-8. API / Server Action Reference](#p-8-api--server-action-reference)
- [P-9. SEO Checklist](#p-9-seo-checklist)
- [P-10. File Upload Quick Reference](#p-10-file-upload-quick-reference)
- [P-11. Environment Variables](#p-11-environment-variables)

---

## P-1. Project Overview

A bilingual (Bangla-default, English-secondary) website for Shifa International School: 8 public pages plus sub-pages, a full CMS admin panel with Super Admin + per-module Admin permissions, notice board, faculty directory, gallery, admission info with fees, and a contact inbox.

**Phase 1 (build now):** 8 public pages, bilingual · Super Admin + Admin login, independent per-module permission toggles · full admin panel for every public section · faculty profiles with dormant login credentials ready for Phase 2 · notice board with category filter and multiple attachments · photo/video gallery · contact form + inbox · responsive, mobile-first.

**Phase 2 (designed for now, not built):** faculty self-service login, student/parent dashboards, online admission, SMS/email notifications, results, attendance. See `ARCHITECTURE.md` §A-17 for what Phase 1 already builds to make this cheap, and §B-20 for the extension schema sketch.

For scope boundaries and architectural principles, see `ARCHITECTURE.md` §A-1.

---

## P-2. School Facts — Known vs. Needs Verification

These are the concrete facts collected about the school during requirements gathering. Some are stable identity facts safe to seed directly; others are the kind of published claim `ARCHITECTURE.md` §A-3.1 and §B-19 deliberately keep **out** of the seed script until the school verifies them with a date. Treat the "Needs verification" rows as still open items on the §A-3.1 checklist, not as ready-to-publish numbers.

### Confirmed — safe to seed as identity/content facts

| Field | Value |
|---|---|
| School name (EN) | Shifa International School |
| School name (BN) | শিফা ইন্টারন্যাশনাল স্কুল |
| Slogan (EN) | Quality Education from Pre-Play to Class 10 |
| Slogan (BN) | প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা |
| EIIN | 311011906 |
| Founded | 2020 |
| Classes offered | Pre-Play to Class 10 |
| Curriculum | NCTB + Spoken English + Digital Literacy + Islamic Education |
| Principal | Md. Abdul Mannan (মো. আব্দুল মান্নান) |
| Address (EN) | Mokka Lakeview Tower, Muktinagar, Siddhirganj, Narayanganj |
| Address (BN) | মক্কা লেকভিউ টাওয়ার, মুক্তিনগর, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ |
| Domain | shifaintschool.com |

### Needs verification before publishing — do not seed, do not hardcode

| Field | Collected value | Status |
|---|---|---|
| Total students | "400+" | Not a real number — see §A-3.1 item 11. `site_stats` renders nothing until the school supplies a verified count and date. |
| Total teachers | "25" | Same — needs a `verified_on` date. |
| Pass rate | *(none collected — was an invented example in the old PRD)* | Never seed. Add only when the school supplies a real, dated figure. |
| EMIS code, School Code, BIIN | *(not yet collected — EIIN above is the only confirmed registration number)* | §A-3.1 item 10. |

### Class grades (structural — safe to seed)

Fourteen grades, Pre-Play through Class 10, `sort_order` ascending. These are names, not claims, so they seed directly into `class_grades` (§B-8):

| EN | BN | | EN | BN |
|---|---|---|---|---|
| Pre-Play | প্রি-প্লে | | Class 4 | চতুর্থ শ্রেণি |
| Play | প্লে | | Class 5 | পঞ্চম শ্রেণি |
| Nursery | নার্সারি | | Class 6 | ষষ্ঠ শ্রেণি |
| KG | কেজি | | Class 7 | সপ্তম শ্রেণি |
| Class 1 | প্রথম শ্রেণি | | Class 8 | অষ্টম শ্রেণি |
| Class 2 | দ্বিতীয় শ্রেণি | | Class 9 | নবম শ্রেণি |
| Class 3 | তৃতীয় শ্রেণি | | Class 10 | দশম শ্রেণি |

### Features / facilities (structural — safe to seed)

Per `ARCHITECTURE.md` §B-19, these describe facilities rather than unverifiable claims, so they seed directly into `features`:

| EN | BN | Icon |
|---|---|---|
| Experienced Teachers | অভিজ্ঞ শিক্ষক | GraduationCap |
| Digital Literacy | ডিজিটাল সাক্ষরতা | Monitor |
| Spoken English | স্পোকেন ইংলিশ | MessageCircle |
| Islamic Education | ইসলামিক শিক্ষা | BookOpen |
| Library | লাইব্রেরি | Library |
| Safe Campus | নিরাপদ ক্যাম্পাস | Shield |

---

## P-3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Server Components for the public read path (§A-6) — most public pages need no client-side fetch at all. |
| Language | TypeScript | Across the full stack. |
| Database | PostgreSQL | Schema is hand-designed SQL (`ARCHITECTURE.md` Part B); Prisma maps *over* it, not the other way round (§B-18). Budget for a paid tier or run the documented keepalive job — free tiers pause inactive projects (§A-4.1 deployment note). |
| ORM | Prisma | Type-safe queries; migrations follow the expand→migrate→contract discipline in §A-14.2. |
| Auth | Custom session table (§A-9.2), not a library's default session model | Opaque token in an HTTP-only cookie; only its SHA-256 hash is stored; `revoked_at` is checked on every request. If using a library (e.g. Auth.js) for the credential/login flow, its session strategy must be swapped for this schema — the revocation and lockout guarantees in §A-9 are not optional. |
| Styling | Tailwind CSS | Tokens from `design-system.md`, wired as CSS custom properties per `ARCHITECTURE.md` §A-8 — no hex literal in a component. |
| File storage | Object storage with two buckets (public / private) | Supabase Storage or Cloudinary both work; whichever is chosen must support the public/private split and signed URLs required by §A-10.2. Local disk storage is development-only, never production. |
| i18n routing | Locale-prefixed paths, Bangla unprefixed | §A-7.1. `next-intl` or an equivalent App Router–aware i18n library can drive this, but the URL contract (bare path = Bangla, `/en` = English, no cookie-based routing) is fixed regardless of library. |
| Deployment | Vercel (or equivalent) | Three environments — local, staging, production (§A-14.1). |
| Monitoring | Sentry (free tier) + external uptime monitor | §A-15. |
| Email | Any transactional provider | Needed for password reset (§A-9.2) and the weekly content-freshness report (§A-15). |

---

## P-4. Project Structure

```
shifa-edu/
├── prisma/
│   ├── schema.prisma              # Mapped over the hand-written SQL in ARCHITECTURE.md Part B
│   ├── seed.ts                    # Idempotent — see ARCHITECTURE.md §B-19
│   └── migrations/
├── public/
│   └── images/                    # Static, non-uploaded assets only
├── src/
│   ├── app/
│   │   ├── (public)/              # Bangla default — no locale segment in the path
│   │   │   ├── page.tsx                       # Home  /
│   │   │   ├── about/page.tsx                 # About  /about
│   │   │   ├── academics/
│   │   │   │   ├── page.tsx                   # /academics
│   │   │   │   ├── routines/page.tsx          # /academics/routines
│   │   │   │   ├── calendar/page.tsx          # /academics/calendar
│   │   │   │   └── exams/page.tsx             # /academics/exams
│   │   │   ├── admission/page.tsx             # /admission
│   │   │   ├── faculty/page.tsx               # /faculty
│   │   │   ├── notices/
│   │   │   │   ├── page.tsx                   # /notices
│   │   │   │   └── [id]/page.tsx              # /notices/:id
│   │   │   ├── gallery/page.tsx               # /gallery — one route, ?type=&category= filters (ADR-006)
│   │   │   ├── contact/page.tsx               # /contact
│   │   │   ├── privacy-policy/page.tsx        # /privacy-policy (§A-16.2)
│   │   │   ├── terms/page.tsx                 # /terms
│   │   │   └── login/page.tsx                 # /login — single form, no role selector (§A-9.2)
│   │   ├── en/                    # Mirrors (public)/ under the /en prefix — see §A-7.1
│   │   │   └── ...                            # same tree, English locale
│   │   ├── admin/                             # Protected, always dynamic, bilingual chrome (ADR-007)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                       # /admin
│   │   │   ├── site-settings/page.tsx
│   │   │   ├── home/page.tsx
│   │   │   ├── about/page.tsx
│   │   │   ├── academics/page.tsx
│   │   │   ├── admission/page.tsx
│   │   │   ├── faculty/page.tsx
│   │   │   ├── notices/page.tsx
│   │   │   ├── gallery/page.tsx
│   │   │   ├── media/page.tsx                 # Media library (§A-10.1)
│   │   │   ├── messages/page.tsx
│   │   │   ├── users/page.tsx                 # Super Admin only
│   │   │   └── profile/page.tsx
│   │   ├── api/                               # Route handlers for mutations not modeled as Server Actions
│   │   │   ├── auth/route.ts
│   │   │   ├── upload/route.ts
│   │   │   └── contact/route.ts
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── public/     # Header, Footer, LanguageSwitcher, HeroSlider, StatsBar, NoticeCard, FacultyCard, GalleryGrid, ContactForm
│   │   ├── admin/       # AdminSidebar, AdminHeader, PermissionGate, RichTextEditor, ImageUploader, DataTable, PermissionMatrix
│   │   └── ui/          # Button, Modal, Toast, ...
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts             # Session issue/verify/revoke — §A-9.2
│   │   ├── permissions.ts      # can(user, module, action) — §A-9.3
│   │   ├── i18n.ts             # Locale resolution + fallback — §A-7.3, §A-7.4
│   │   └── upload.ts           # §A-10.3 pipeline
│   ├── i18n/
│   │   ├── bn.json              # namespaces: common, public, admin, errors (§A-7.2)
│   │   └── en.json
│   ├── hooks/
│   │   ├── useLocale.ts
│   │   └── usePermission.ts
│   └── types/
│       └── index.ts
├── .env.local
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

> **`(public)/` vs `en/` is illustrative, not prescriptive.** The binding contract is the URL shape in §A-7.1 (bare path = Bangla, `/en/*` = English, no cookie-based routing); the exact route-group mechanism (parallel trees, a `[locale]` segment, middleware rewrites) is an implementation choice for task T-030/T-080, not an architectural decision.

**Two structural corrections from the retired PRD's file tree**, both already decided in `ARCHITECTURE.md`:
- No `gallery/photos/page.tsx` or `gallery/videos/page.tsx` — one `gallery/page.tsx` with query-param filters (ADR-006).
- `login/page.tsx` is a single username+password form — no role selector (§A-9.2, AUDIT S-8).

---

## P-5. Full Route Table

### Public routes (17)

| Route (Bangla, default) | English | Page |
|---|---|---|
| `/` | `/en` | Home |
| `/about` | `/en/about` | About Us |
| `/academics` | `/en/academics` | Academics |
| `/academics/routines` | `/en/academics/routines` | Class Routines |
| `/academics/calendar` | `/en/academics/calendar` | Academic Calendar |
| `/academics/exams` | `/en/academics/exams` | Exam Schedule |
| `/admission` | `/en/admission` | Admission |
| `/faculty` | `/en/faculty` | Our Teachers |
| `/notices` | `/en/notices` | Notice Board |
| `/notices/:id` | `/en/notices/:id` | Notice Detail |
| `/gallery` | `/en/gallery` | Gallery (photos + videos, filterable — ADR-006) |
| `/contact` | `/en/contact` | Contact Us |
| `/privacy-policy` | `/en/privacy-policy` | Privacy Policy (§A-16.2) |
| `/terms` | `/en/terms` | Terms |
| `/cookie-notice` | `/en/cookie-notice` | Cookie Notice (§A-16.2, T-089) |
| `/login` | `/en/login` | Login |
| *(any unmatched path)* | *(any unmatched path under `/en`)* | 404, error, and maintenance states — bilingual, **not indexed** (T-090) |

> **Login route and role selection.** `/login` + `/en/login` is the authoritative path pair; `/admin/login`, from অংশ ২ of the historical `school-website-spec-final.md`, is **superseded** (that document also contradicts itself, giving `/login` in its §৯). The Phase 1 login page has **no role selector** — a single username-or-email + password form that routes by the authenticated user's stored role (§A-9.2, AUDIT S-8). The historical spec's four-way selector (Administrator / Teacher / Student / Guardian) is not buildable in Phase 1 in any case: `faculty` is Phase 2a and `student` / `guardian` are Phase 2b per `ARCHITECTURE.md` §A-9.5.

### Admin routes (13) — bilingual UI (ADR-007), no locale prefix on the path itself

| Route | Page |
|---|---|
| `/admin` | Dashboard |
| `/admin/site-settings` | Site Settings (incl. protected branding, §A-9.4) |
| `/admin/home` | Home Content Editor |
| `/admin/about` | About Content Editor |
| `/admin/academics` | Academics Manager |
| `/admin/admission` | Admission Manager |
| `/admin/faculty` | Faculty Manager |
| `/admin/notices` | Notice Manager |
| `/admin/gallery` | Gallery Manager |
| `/admin/media` | Media Library |
| `/admin/messages` | Contact Messages |
| `/admin/users` | Manage Admins — Super Admin only |
| `/admin/profile` | My Profile |

### Future routes (Phase 2)

| Route | Page |
|---|---|
| `/teacher` | Teacher Dashboard |
| `/student` | Student Dashboard |
| `/parent` | Parent Dashboard |

---

## P-6. Public Pages — Detailed Specs

### P-6.1 Shared layout

**Header/Navbar** — Left: logo + school name, links to `/`. Center/right: nav links (Home, About Us, Academics, Admission, Our Teachers, Notice Board, Gallery, Contact Us). Far right: language switcher (rewrites the path per §A-7.1, does not just flip a cookie) + Login button. Mobile: hamburger → slide-out drawer. Sticky on scroll.

**Footer** — Col 1: logo, name, slogan, EIIN badge. Col 2: quick links. Col 3: contact info (address, phones, email, office hours — from `site_settings`). Col 4: social icons + Google Map mini-embed. Bottom bar: copyright + links to Privacy Policy and Terms.

### P-6.2 Home (`/`)

| Section | Data source | Behavior |
|---|---|---|
| Hero Slider | `hero_slides` | Auto-rotating, 3–5 slides, 5s interval. Optional title/subtitle overlay per slide. |
| School at a Glance | `home_content` intro text | 2–3 lines + "Learn More" → `/about` |
| Stats Bar | `site_stats` | Renders **only** counters with a `verified_on` date (§A-3.1 item 11). Empty until the school supplies real numbers — do not fill with placeholder figures. |
| Latest Notices | `notices` (published, latest 5) | Date badge, title, excerpt. "View All" → `/notices` |
| Features | `features` | Icon + title + description grid |
| Gallery Preview | `gallery_photos` (latest 6) | Grid, click → lightbox. "View All" → `/gallery` |
| CTA Banner | `home_content` CTA text | Full-width banner → `/admission` |

### P-6.3 About Us (`/about`)

| Section | Data source |
|---|---|
| History | `about_content.history` |
| Vision & Mission | `about_content.vision` (blockquote), `.mission` (bullet list) |
| Principal's Message | `about_content.principal_message` + photo — does not render without the principal's publish consent (§A-16.2) |
| Registration Info | `registrations` (EIIN, EMIS code, School Code, BIIN) |
| Managing Committee | `committee_members` |
| Achievements | `achievements` |
| Curriculum Highlights | `academic_info.curriculum` |

### P-6.4 Academics (`/academics`)

| Section | Data source |
|---|---|
| Class Structure | `class_grades` + `class_sections` (real section rows, §ADR "sections as first-class table") |
| Curriculum / Board | `academic_info.curriculum` |
| Subject List | `subjects` grouped by class, via `class_subjects` junction |
| Class Timing | `academic_info.class_timing` |
| Assessment Method | `academic_info.assessment_method` |

**Sub-pages:** `/academics/routines` (`routines`, per-class PDF), `/academics/calendar` (`calendar_events` + `calendar_event_types` lookup), `/academics/exams` (`exam_schedules`, filterable by class).

### P-6.5 Admission (`/admission`)

| Section | Data source |
|---|---|
| Status Banner | `admission_info.is_open`, `.status_banner` |
| Process Steps | `admission_info.process_steps` |
| Eligibility | `admission_info.eligibility` |
| Important Dates | `admission_info.important_dates` |
| Required Documents | `admission_info.required_documents` |
| Fee Structure | `fee_structures` + `fee_items` + `fee_types` — table: Class → Admission Fee → Monthly Fee → itemized other charges. Currency ৳ (BDT). |
| Download Form | `admission_info.form_media_id` |
| FAQ | `admission_faqs`, accordion |

### P-6.6 Faculty / Our Teachers (`/faculty`)

Card grid (3–4/row desktop), `faculty` + `faculty_translations` where `is_active = true`, sorted by `sort_order`. Each card: photo (placeholder if none), name, designation, subject, qualification; optional experience years and bio. **A profile does not render without `publish_consent_at`, and its photo does not render without `photo_consent_at`** (§A-16.2). Internal fields (personal phone/email, joining date) live in `faculty_private` — a physically separate table the public read path never joins to (§A-16.1).

### P-6.7 Notice Board (`/notices`)

**List** — cards newest-first, paginated (10/page). Each: date badge, title, category tag (`notice_categories` lookup, not an enum — ADR-002), excerpt. Filter via `?category=`.

**Detail** (`/notices/:id`) — full rich-text content, published date, category, download links for each row in `notice_attachments` (a notice may carry more than one file — routine + seat plan + syllabus is a real case, unlike the retired PRD's single-attachment field).

### P-6.8 Gallery (`/gallery`)

One route (ADR-006), query-filtered: `?type=photos|videos&category=`.

- **Photos:** masonry/grid, category filter (`gallery_categories` lookup: Campus, Classrooms, Events, Activities), lightbox with prev/next, lazy-loaded.
- **Videos:** card grid, thumbnail + play icon, opens the YouTube/Facebook embed in a modal (`gallery_videos`, provider from a lookup table).

### P-6.9 Contact Us (`/contact`)

| Section | Data source |
|---|---|
| Contact Info | `site_settings` + `contact_channels` (address, labeled phone numbers, email, office hours) |
| Google Map | `site_settings.google_map_embed` |
| Inquiry Form | Writes a `contact_messages` row |

**Form validation:** Name required (min 2 chars) · Phone required, Bangladeshi format (`01XXXXXXXXX`) · Email optional, valid format if present · Message required (min 10 chars) · rate-limited to 3 submissions/IP/hour (§A-12). The form must show the consent statement required by §A-16.2 next to the submit button — what is collected, why, and the 12-month retention period.

---

## P-7. Admin Panel — Detailed Specs

### P-7.1 Admin layout

```
┌─────────────────────────────────────────────────────┐
│  ADMIN HEADER — Logo | "অ্যাডমিন প্যানেল" | user | Logout │
├──────────┬──────────────────────────────────────────┤
│ SIDEBAR  │          MAIN CONTENT AREA                │
│ 📊 Dash  │                                           │
│ ⚙️ Site  │  (Only modules the user has ≥1 permission │
│ 🏠 Home  │   row for are shown — §A-9.3. Super Admin │
│  ...     │   always sees everything.)                │
│ 👥 Users │  (Super Admin only)                        │
│ 🔐 Prof  │                                           │
└──────────┴──────────────────────────────────────────┘
```

- Sidebar collapsible on mobile.
- **Bilingual** (ADR-007) — reverses the retired PRD's "English-only, internal tool" assumption.
- Sidebar in the design-system.md Deep Forest Green primary token with a light content area — not an arbitrary dark theme; the admin panel uses the same tokens as the public site (§A-8).

### P-7.2 Dashboard (`/admin`)

Stats cards (Total Students, Total Teachers, Total Notices, Unread Messages — the first two only if `site_stats` has verified values), Recent Activity (last 10 `activity_logs` rows), Quick Actions (Add Notice, Add Faculty, Upload Photo).

### P-7.3 Site Settings (`/admin/site-settings`)

Two physically separate concerns, per §A-9.4 — do not let a single form imply a single permission:

| Data | Table | Who may edit |
|---|---|---|
| School name, logo, favicon | `site_branding` | Super Admin, or an admin holding the `edit_branding` special grant |
| Slogan, registration numbers, founded year, address, phones, email, office hours, map, social links | `site_settings` + children | Any admin with `site_settings:edit` |

Granting `site_settings:edit` never unlocks the branding fields — they are a separate form section, gated by a separate check, backed by a separate table. This is the fix for the retired PRD's `canEditBranding` contradiction (§A-9.4).

### P-7.4 Home Content Editor (`/admin/home`)

Hero Slider: sortable list, image upload + optional title/subtitle per locale, add/remove/reorder. Intro Text: dual editor (BN required, EN optional with a missing-translation badge — §A-7.3). CTA: text + button text + link. Features: CRUD table (title, description, icon, sort order, active toggle).

### P-7.5 About Content Editor (`/admin/about`)

History: dual rich text. Vision/Mission: dual textarea. Principal's Message: dual rich text + photo upload + **consent checkbox** (`publish_consent_at`) that must be set before the section can be published. Managing Committee: CRUD (name, designation, photo, sort order). Achievements: CRUD (title, description, year, icon, sort order).

### P-7.6 Academics Manager (`/admin/academics`)

General info (curriculum, class timing, assessment method — dual textareas). Class Grades: CRUD, each expands to its `class_sections` (real rows, not a count) and `subjects`. Routines: per-class-section PDF upload. Calendar Events: CRUD with `calendar_event_types` picked from a managed lookup, not a hardcoded dropdown. Exam Schedules: CRUD per class/term.

### P-7.7 Admission Manager (`/admin/admission`)

Status toggle + banner text. Process/eligibility/documents/dates: dual rich text. Form PDF upload. Fee Structure: class → fee items (extensible — admission, monthly, transport, lab, session — not a single "other charges" slot). FAQ: CRUD.

### P-7.8 Faculty Manager (`/admin/faculty`)

| Field | Notes |
|---|---|
| Photo, Name (EN/BN), Designation (EN/BN), Subject, Qualification, Experience, Bio | Public fields — `faculty` + `faculty_translations` |
| Personal phone, personal email, joining date | `faculty_private` — never queried by any public path |
| `photo_consent_at`, `publish_consent_at` | Must both be set before the profile is eligible to render publicly |
| Active toggle, sort order | |

On creation: system auto-generates a `faculty_id` (e.g. `SIS-F-001`) and a temporary credential, stored against the shared `users` table (not a second password store — §A-9.1), displayed once, copyable. Login stays disabled until Phase 2.

### P-7.9 Notice Manager (`/admin/notices`)

CRUD: Title (EN/BN), Category (from `notice_categories`), Content (rich text, sanitized on write and render — §A-12), **multiple** attachments, Publish Date. **`publish` is a distinct permission action from `add`/`edit`** (§A-5.2) — an admin can be allowed to draft and edit a notice without being allowed to make it public. A notice is public only when `status = 'published'` **and** `published_at <= now()`.

### P-7.10 Gallery Manager (`/admin/gallery`)

Photos tab: grid, drag-and-drop multi-upload, category + caption per photo, reorder. Videos tab: paste YouTube/Facebook URL + title, auto-extract thumbnail, delete.

### P-7.11 Contact Messages (`/admin/messages`)

List (name, phone, email, preview, date, read status) → detail view → mark read/unread → delete with confirmation. No reply functionality in Phase 1. Messages auto-purge at 12 months (§A-16.2).

### P-7.12 Manage Admins (`/admin/users`) — Super Admin only

Admin list: username, display name, status, last login, actions. Create Admin: username, display name, generated password, role — **every module starts with zero permission rows**, not a "View always on" default (this closes the retired PRD's B-1 contradiction — see §A-9.3).

Permission matrix — every cell, **including View**, is an explicit toggle for an Admin account; only Super Admin implicitly has everything:

```
┌──────────────────┬─────┬──────┬────────┬─────────┬──────┐
│ Module           │ Add │ Edit │ Delete │ Publish │ View │
├──────────────────┼─────┼──────┼────────┼─────────┼──────┤
│ Site Settings    │  —  │ 🔘   │   —    │    —    │ 🔘   │
│ Home Content     │  —  │ 🔘   │   —    │    —    │ 🔘   │
│ About Us         │  —  │ 🔘   │   —    │    —    │ 🔘   │
│ Academics        │ 🔘  │ 🔘   │  🔘    │    —    │ 🔘   │
│ Admission        │  —  │ 🔘   │   —    │    —    │ 🔘   │
│ Faculty          │ 🔘  │ 🔘   │  🔘    │    —    │ 🔘   │
│ Notices          │ 🔘  │ 🔘   │  🔘    │   🔘    │ 🔘   │
│ Gallery          │ 🔘  │ 🔘   │  🔘    │    —    │ 🔘   │
│ Contact Messages │  —  │  —   │  🔘    │    —    │ 🔘   │
└──────────────────┴─────┴──────┴────────┴─────────┴──────┘
🔘 toggle (off by default)   — not applicable to this module (§A-5.2 module_actions)
```

The `edit_branding` special grant is shown as a separate lock badge next to a user's row, not as a cell in this matrix (§A-9.4) — it is not a module permission, it is a special grant.

### P-7.13 My Profile (`/admin/profile`)

View own display name, username, role, last login. Change password (current + new + confirm). Read-only view of own permissions.

---

## P-8. API / Server Action Reference

> The architecture's primary render path is Server Components reading repositories directly (§A-6) — most public pages need **no** REST endpoint at all. The table below enumerates the set of mutations (and the few genuinely useful public reads, e.g. for a future headless/mobile client) that must exist; whether each is implemented as a Next.js Server Action or a route handler is an implementation choice. What's fixed regardless of that choice: **every** mutating one passes the full six-stage pipeline in `ARCHITECTURE.md` §A-5.1.

### Public (no auth) — optional beyond the contact mutation

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/contact` | The one public endpoint every implementation needs — rate-limited (§A-12) |
| `GET` | `/api/notices` | Optional JSON surface; supports `?category=`, pagination |
| `GET` | `/api/gallery` | Optional; supports `?type=&category=` |
| `GET` | `/api/*` (site-settings, home, about, academics, admission, faculty) | Optional — only needed for a non-server-component client |

### Admin (auth + permission required)

Every row below requires a valid, non-revoked session and the named module+action permission (§A-9.3). `POST/PUT/DELETE` on `notices` additionally distinguishes `edit` from `publish`.

| Module | Action | Example route/action |
|---|---|---|
| `site_settings` | `edit` | Update settings (not branding) |
| `site_settings` (branding) | `edit_branding` grant | Update name/logo/favicon — separate from the row above |
| `home` | `edit` | Update content, hero slides, features |
| `about` | `edit` | Update content, committee, achievements |
| `academics` | `add`/`edit`/`delete` | Classes, sections, subjects, routines, calendar, exams |
| `admission` | `add`/`edit`/`delete` | Info, fee items, FAQ |
| `faculty` | `add`/`edit`/`delete` | Profile CRUD — public and private fields via separate calls |
| `notice` | `add`/`edit`/`delete`/`publish` | Publish is a distinct grant |
| `gallery` | `add`/`edit`/`delete` | Photos, videos |
| `contact` | `view`/`delete` | Message inbox |
| `media` | `add`/`delete` | Upload endpoint, shared by every module (§A-10) |
| `users` | Super Admin only | Create/suspend/delete admins, edit permissions and grants |

### Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | Username/email + password. No role parameter (§A-9.2). |
| `POST` | `/api/auth/logout` | Revokes the session. |
| `GET` | `/api/auth/session` | Current user + permission set. |
| `PUT` | `/api/auth/password` | Change own password. |
| `POST` | `/api/auth/password-reset/request` | Emails a single-use, 30-min token. |
| `POST` | `/api/auth/password-reset/confirm` | Consumes the token. |

---

## P-9. SEO Checklist

Per-page meta tags, language-aware, pointing at genuinely distinct URLs (§A-7.1 / ADR-005):

```html
<!-- Home, Bangla -->
<html lang="bn">
<head>
  <title>শিফা ইন্টারন্যাশনাল স্কুল — প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা</title>
  <meta name="description" content="নারায়ণগঞ্জের শিফা ইন্টারন্যাশনাল স্কুল — NCTB কারিকুলামে মানসম্মত শিক্ষা। EIIN: 311011906" />
  <link rel="canonical" href="https://shifaintschool.com/" />
  <link rel="alternate" hreflang="bn" href="https://shifaintschool.com/" />
  <link rel="alternate" hreflang="en" href="https://shifaintschool.com/en" />
  <link rel="alternate" hreflang="x-default" href="https://shifaintschool.com/" />
</head>
```

Checklist:
- [ ] Unique `<title>` per page, per locale, with school name
- [ ] Unique `<meta name="description">` per page, per locale
- [ ] Single `<h1>` per page
- [ ] Semantic HTML5 landmarks
- [ ] `alt` text on every image (sourced from `media_assets.alt_text`, translatable — §A-10.1)
- [ ] `<link rel="canonical">` on every page
- [ ] Open Graph tags
- [ ] JSON-LD Organization schema
- [ ] `sitemap.xml`, generated per locale
- [ ] `robots.txt` — allow public, disallow `/admin`
- [ ] LCP/CLS/bundle budgets met — see `ARCHITECTURE.md` §A-2 Efficient table for the actual numbers and gates

---

## P-10. File Upload Quick Reference

| Type | Max size | Formats | Used for |
|---|---|---|---|
| Images | 5 MB | JPEG, PNG, WebP, AVIF | Gallery, faculty photos, hero slides, logo |
| PDFs | 10 MB | PDF | Routines, admission form, notice attachments |
| Video | — | URL only (YouTube/Facebook embed) | Never uploaded directly |

Full pipeline (MIME sniffing from bytes, EXIF stripping, randomized keys, resize/encode, dedupe, orphan cleanup) is specified in `ARCHITECTURE.md` §A-10.3 — this table is size/format limits only. Whichever storage provider is chosen (Supabase Storage, Cloudinary) must support the public/private bucket split in §A-10.2; local disk storage is development-only.

---

## P-11. Environment Variables

```env
# .env.local — never commit; no literal value in any document (§A-12)
DATABASE_URL="postgresql://..."
SESSION_SECRET="random-32-char-string"
APP_URL="https://shifaintschool.com"

# Object storage (two buckets — public, private; §A-10.2)
STORAGE_URL="..."
STORAGE_PUBLIC_BUCKET="..."
STORAGE_PRIVATE_BUCKET="..."
STORAGE_ACCESS_KEY="..."
STORAGE_SECRET_KEY="..."

# Email (password reset, content-freshness report)
EMAIL_PROVIDER_API_KEY="..."

# Monitoring
SENTRY_DSN="..."

# Optional
GOOGLE_MAPS_API_KEY="..."
```

---

*Companion documents: `ARCHITECTURE.md` (system architecture, database, all rationale/ADRs), `design-system.md` (visual design tokens and components), `school-website-spec-final.md` (original Bangla-language business intent).*
