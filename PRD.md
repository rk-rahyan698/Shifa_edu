# Product Requirements Document (PRD)
# Shifa International School — Website & Admin Panel

> **Version:** 1.0
> **Date:** August 13, 2026
> **Domain:** shifaintschool.com
> **Status:** Phase 1 — Ready for Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Internationalization (i18n)](#4-internationalization-i18n)
5. [Database Schema](#5-database-schema)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Public Pages — Detailed Specs](#7-public-pages--detailed-specs)
8. [Admin Panel — Detailed Specs](#8-admin-panel--detailed-specs)
9. [API Endpoints](#9-api-endpoints)
10. [UI/UX Design Guidelines](#10-uiux-design-guidelines)
11. [SEO Requirements](#11-seo-requirements)
12. [File Upload & Storage](#12-file-upload--storage)
13. [Security Requirements](#13-security-requirements)
14. [Seed Data](#14-seed-data)
15. [Phase 2 — Future Scope](#15-phase-2--future-scope)
16. [Development Checklist](#16-development-checklist)

---

## 1. Project Overview

### 1.1 What is this?

A bilingual (Bangla + English) school website for **Shifa International School**, a K-10 school in Narayanganj, Bangladesh. The site has:

- **8 public-facing pages** (Home, About, Academics, Admission, Faculty, Notices, Gallery, Contact)
- **A full admin panel** with role-based permissions (Super Admin + Admin)
- **Bilingual content** — every page renders in both Bangla and English, toggled via a header language switcher
- **A CMS-like admin panel** where all public page content is editable — no code changes needed to update content

### 1.2 School Information (Seed Data)

| Field | Value |
|-------|-------|
| **School Name** | Shifa International School |
| **Slogan (EN)** | Quality Education from Pre-Play to Class 10 |
| **Slogan (BN)** | প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা |
| **EIIN** | 311011906 |
| **Founded** | 2020 |
| **Students** | 400+ |
| **Teachers** | 25 |
| **Classes** | Pre-Play to Class 10 |
| **Curriculum** | NCTB + Spoken English + Digital Literacy + Islamic Education |
| **Principal** | Md. Abdul Mannan (মো. আব্দুল মান্নান) |
| **Address (EN)** | Mokka Lakeview Tower, Muktinagar, Siddhirganj, Narayanganj |
| **Address (BN)** | মক্কা লেকভিউ টাওয়ার, মুক্তিনগর, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ |
| **Domain** | shifaintschool.com |

### 1.3 Phase 1 Scope (Build Now)

1. 8 public pages with full bilingual support
2. Super Admin + Admin login with permission-based access control
3. Complete admin panel for managing all public page content
4. Faculty profile database with auto-generated Faculty ID + hashed password (login disabled for now)
5. Notice board with category filtering and attachment support
6. Photo/Video gallery with category management
7. Contact form with message inbox in admin panel
8. Responsive design — mobile-first

### 1.4 Phase 2 Scope (Build Later — but design for it now)

- Teacher/Staff login and self-service profile editing
- Student dashboard (results, attendance)
- Parent/Guardian dashboard
- Online admission form
- SMS/Email notification system

---

## 2. Tech Stack

### 2.1 Recommended Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| **Framework** | Next.js 14+ (App Router) | SSR for SEO, API routes for backend, file-based routing |
| **Language** | TypeScript | Type safety across full stack |
| **Database** | PostgreSQL (via Supabase or Neon) | Relational data fits this project; free tier available |
| **ORM** | Prisma | Type-safe database queries, easy migrations |
| **Auth** | NextAuth.js (Auth.js v5) | Credential-based login, session management |
| **Styling** | Tailwind CSS v3 | Rapid UI development, responsive design |
| **File Storage** | Supabase Storage or Cloudinary | Image/PDF uploads for gallery, faculty photos, notices |
| **Deployment** | Vercel | Seamless Next.js deployment, free tier |
| **i18n** | next-intl or custom JSON-based | Bilingual content management |

### 2.2 Alternative Stack (Simpler)

If the developer prefers a lighter setup:

| Layer | Alternative |
|-------|------------|
| **Framework** | Vite + React (SPA) with Express.js backend |
| **Database** | SQLite (via better-sqlite3) for development, PostgreSQL for production |
| **Auth** | Custom JWT-based auth |
| **Styling** | Vanilla CSS or Tailwind |

> **Note to Claude Code:** Use the recommended stack (Next.js + Prisma + PostgreSQL) unless the developer explicitly requests otherwise.

---

## 3. Project Structure

```
shifa-edu/
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Seed data (school info, super admin, sample content)
│   └── migrations/
├── public/
│   ├── images/                # Static images (logo, default placeholders)
│   └── uploads/               # Uploaded files (if local storage)
├── src/
│   ├── app/
│   │   ├── (public)/          # Public route group
│   │   │   ├── page.tsx                   # Home /
│   │   │   ├── about/page.tsx             # About /about
│   │   │   ├── academics/
│   │   │   │   ├── page.tsx               # Academics /academics
│   │   │   │   ├── routines/page.tsx      # Class Routines /academics/routines
│   │   │   │   ├── calendar/page.tsx      # Academic Calendar /academics/calendar
│   │   │   │   └── exams/page.tsx         # Exam Schedule /academics/exams
│   │   │   ├── admission/page.tsx         # Admission /admission
│   │   │   ├── faculty/page.tsx           # Faculty /faculty
│   │   │   ├── notices/
│   │   │   │   ├── page.tsx               # Notice Board /notices
│   │   │   │   └── [id]/page.tsx          # Notice Detail /notices/:id
│   │   │   ├── gallery/
│   │   │   │   ├── page.tsx               # Gallery landing (redirects or tabs)
│   │   │   │   ├── photos/page.tsx        # Photo Gallery /gallery/photos
│   │   │   │   └── videos/page.tsx        # Video Gallery /gallery/videos
│   │   │   ├── contact/page.tsx           # Contact /contact
│   │   │   └── login/page.tsx             # Login /login
│   │   ├── admin/                         # Admin route group (protected)
│   │   │   ├── layout.tsx                 # Admin layout with sidebar
│   │   │   ├── page.tsx                   # Dashboard /admin
│   │   │   ├── site-settings/page.tsx     # Site Settings /admin/site-settings
│   │   │   ├── home/page.tsx              # Home Editor /admin/home
│   │   │   ├── about/page.tsx             # About Editor /admin/about
│   │   │   ├── academics/page.tsx         # Academics Manager /admin/academics
│   │   │   ├── admission/page.tsx         # Admission Manager /admin/admission
│   │   │   ├── faculty/page.tsx           # Faculty Manager /admin/faculty
│   │   │   ├── notices/page.tsx           # Notice Manager /admin/notices
│   │   │   ├── gallery/page.tsx           # Gallery Manager /admin/gallery
│   │   │   ├── messages/page.tsx          # Contact Messages /admin/messages
│   │   │   ├── users/page.tsx             # Manage Admins /admin/users (Super Admin)
│   │   │   └── profile/page.tsx           # My Profile /admin/profile
│   │   ├── api/                           # API routes
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── upload/route.ts
│   │   │   └── contact/route.ts
│   │   ├── layout.tsx                     # Root layout
│   │   └── globals.css
│   ├── components/
│   │   ├── public/                        # Public page components
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   ├── HeroSlider.tsx
│   │   │   ├── StatsBar.tsx
│   │   │   ├── NoticeCard.tsx
│   │   │   ├── FacultyCard.tsx
│   │   │   ├── GalleryGrid.tsx
│   │   │   └── ContactForm.tsx
│   │   ├── admin/                         # Admin components
│   │   │   ├── AdminSidebar.tsx
│   │   │   ├── AdminHeader.tsx
│   │   │   ├── PermissionGate.tsx         # Hides UI if no permission
│   │   │   ├── RichTextEditor.tsx
│   │   │   ├── ImageUploader.tsx
│   │   │   ├── DataTable.tsx
│   │   │   └── PermissionMatrix.tsx
│   │   └── ui/                            # Shared UI components
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Toast.tsx
│   │       └── ...
│   ├── lib/
│   │   ├── prisma.ts                      # Prisma client singleton
│   │   ├── auth.ts                        # Auth configuration
│   │   ├── permissions.ts                 # Permission checking utilities
│   │   ├── i18n.ts                        # Internationalization utilities
│   │   └── upload.ts                      # File upload utilities
│   ├── i18n/
│   │   ├── bn.json                        # Bangla translations (static UI)
│   │   └── en.json                        # English translations (static UI)
│   ├── hooks/
│   │   ├── useLanguage.ts
│   │   └── usePermission.ts
│   └── types/
│       └── index.ts                       # TypeScript type definitions
├── .env.local                             # Environment variables
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## 4. Internationalization (i18n)

### 4.1 Strategy

| Aspect | Implementation |
|--------|---------------|
| **URL Strategy** | Same URLs for both languages — no `/en/` or `/bn/` prefix |
| **Language Storage** | Cookie (`locale=bn` or `locale=en`) + localStorage fallback |
| **Default Language** | Bangla (BN) |
| **Switcher Location** | Persistent toggle in the header/navbar: `🇧🇩 বাংলা | 🇬🇧 English` |
| **Admin Panel Language** | English only (internal tool — no translation needed) |

### 4.2 Content Types

**Static UI text** (menus, buttons, labels, form placeholders):
- Stored in `src/i18n/bn.json` and `src/i18n/en.json`
- Example:

```json
// en.json
{
  "nav": {
    "home": "Home",
    "about": "About Us",
    "academics": "Academics",
    "admission": "Admission",
    "faculty": "Our Teachers",
    "notices": "Notice Board",
    "gallery": "Gallery",
    "contact": "Contact Us",
    "login": "Login"
  },
  "home": {
    "learn_more": "Learn More",
    "view_all": "View All",
    "apply_now": "Apply Now",
    "stats": {
      "students": "Students",
      "teachers": "Teachers",
      "founded": "Founded",
      "pass_rate": "Pass Rate"
    }
  },
  "footer": {
    "copyright": "© {year} Shifa International School. All rights reserved.",
    "quick_links": "Quick Links",
    "contact_info": "Contact Info",
    "follow_us": "Follow Us"
  }
}
```

```json
// bn.json
{
  "nav": {
    "home": "হোম",
    "about": "আমাদের সম্পর্কে",
    "academics": "একাডেমিক",
    "admission": "ভর্তি তথ্য",
    "faculty": "শিক্ষকমণ্ডলী",
    "notices": "নোটিশ বোর্ড",
    "gallery": "গ্যালারি",
    "contact": "যোগাযোগ",
    "login": "লগইন"
  },
  "home": {
    "learn_more": "আরও জানুন",
    "view_all": "সব দেখুন",
    "apply_now": "আবেদন করুন",
    "stats": {
      "students": "শিক্ষার্থী",
      "teachers": "শিক্ষক",
      "founded": "প্রতিষ্ঠিত",
      "pass_rate": "পাসের হার"
    }
  },
  "footer": {
    "copyright": "© {year} শিফা ইন্টারন্যাশনাল স্কুল। সর্বস্বত্ব সংরক্ষিত।",
    "quick_links": "দ্রুত লিংক",
    "contact_info": "যোগাযোগের তথ্য",
    "follow_us": "ফলো করুন"
  }
}
```

**Dynamic content** (admin-editable page content):
- Every text field in the database has two columns: `*_bn` and `*_en`
- Example: `slogan_bn`, `slogan_en` in the `site_settings` table
- Admin panel shows dual input fields side-by-side for each translatable field
- Both Bangla and English are required for critical fields (titles, descriptions)
- The public site reads the appropriate column based on the active language

### 4.3 SEO for Bilingual

- `<html lang="bn">` or `<html lang="en">` set dynamically
- `<title>` and `<meta name="description">` change with the active language
- Consider adding `<link rel="alternate" hreflang="bn">` and `<link rel="alternate" hreflang="en">` for each page

---

## 5. Database Schema

### 5.1 Complete Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ──────────────────────────────────────────
// AUTH & PERMISSIONS
// ──────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN
  ADMIN
  FACULTY     // Future: Phase 2
}

model User {
  id            String       @id @default(cuid())
  username      String       @unique
  password      String       // bcrypt hashed
  displayName   String
  role          UserRole
  isActive      Boolean      @default(true)
  lastLogin     DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
  permissions   Permission[]
  activityLogs  ActivityLog[]
}

// Cascading access levels: each level includes everything below it.
// NONE  → sees nothing, module hidden entirely
// VIEW  → can only view
// EDIT  → can view + edit + add (view included automatically)
// DELETE → can view + edit + add + delete (highest level, everything included)
enum AccessLevel {
  NONE
  VIEW
  EDIT
  DELETE
}

model Permission {
  id        String      @id @default(cuid())
  userId    String
  module    String      // home, about, academics, admission, faculty, notice, gallery, contact, school_settings
  level     AccessLevel @default(NONE)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, module])
}

model ActivityLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // CREATE, UPDATE, DELETE
  module    String
  details   String?  // JSON string with change details
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ──────────────────────────────────────────
// SITE SETTINGS (singleton-like, 1 row)
// ──────────────────────────────────────────

model SiteSettings {
  id               String  @id @default(cuid())
  schoolNameEn     String  @default("Shifa International School")
  schoolNameBn     String  @default("শিফা ইন্টারন্যাশনাল স্কুল")
  logoUrl          String?
  sloganEn         String  @default("Quality Education from Pre-Play to Class 10")
  sloganBn         String  @default("প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা")
  eiin             String  @default("311011906")
  emisCode         String?
  schoolCode       String?
  biin             String?
  foundedYear      Int     @default(2020)
  totalStudents    String  @default("400+")
  totalTeachers    String  @default("25")
  passRate         String? // e.g., "95%"

  // Footer / Contact Info
  addressEn        String?
  addressBn        String?
  phone1           String?
  phone1Label      String? // e.g., "Principal"
  phone2           String?
  phone2Label      String? // e.g., "Office"
  email            String?
  officeHoursEn    String?
  officeHoursBn    String?
  googleMapEmbed   String? // iframe embed URL
  facebookUrl      String?
  youtubeUrl       String?
  twitterUrl       String?

  updatedAt        DateTime @updatedAt
}

// ──────────────────────────────────────────
// HOME PAGE CONTENT
// ──────────────────────────────────────────

model HeroSlide {
  id          String   @id @default(cuid())
  imageUrl    String
  titleEn     String?
  titleBn     String?
  subtitleEn  String?
  subtitleBn  String?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model HomeContent {
  id              String  @id @default(cuid())
  introTextEn     String? // 2-3 line school intro
  introTextBn     String?
  ctaTextEn       String? @default("Admissions Open for 2026 — Pre-Play to Class 9")
  ctaTextBn       String? @default("ভর্তি চলছে ২০২৬ — প্রি-প্লে থেকে নবম শ্রেণি")
  ctaButtonTextEn String? @default("Apply Now")
  ctaButtonTextBn String? @default("আবেদন করুন")
  ctaLink         String? @default("/admission")
  updatedAt       DateTime @updatedAt
}

model Feature {
  id          String   @id @default(cuid())
  titleEn     String
  titleBn     String
  descriptionEn String?
  descriptionBn String?
  icon        String?  // Icon name or URL
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

// ──────────────────────────────────────────
// ABOUT PAGE CONTENT
// ──────────────────────────────────────────

model AboutContent {
  id                    String  @id @default(cuid())
  historyEn             String? // Rich text / markdown
  historyBn             String?
  visionEn              String?
  visionBn              String?
  missionEn             String? // Could store as JSON array of bullet points
  missionBn             String?
  principalMessageEn    String? // 4-5 paragraphs
  principalMessageBn    String?
  principalName         String  @default("Md. Abdul Mannan")
  principalNameBn       String  @default("মো. আব্দুল মান্নান")
  principalPhotoUrl     String?
  principalDesignationEn String? @default("Principal")
  principalDesignationBn String? @default("অধ্যক্ষ")
  updatedAt             DateTime @updatedAt
}

model CommitteeMember {
  id             String  @id @default(cuid())
  nameEn         String
  nameBn         String
  designationEn  String  // e.g., Chairman, Member
  designationBn  String
  photoUrl       String?
  sortOrder      Int     @default(0)
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
}

model Achievement {
  id             String   @id @default(cuid())
  titleEn        String
  titleBn        String
  descriptionEn  String?
  descriptionBn  String?
  year           Int?
  icon           String?
  sortOrder      Int      @default(0)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
}

// ──────────────────────────────────────────
// ACADEMICS
// ──────────────────────────────────────────

model AcademicInfo {
  id                    String  @id @default(cuid())
  curriculumEn          String? // NCTB + extras
  curriculumBn          String?
  classTimingEn         String? // School hours description
  classTimingBn         String?
  assessmentMethodEn    String? // Exam system description
  assessmentMethodBn    String?
  updatedAt             DateTime @updatedAt
}

model ClassGrade {
  id           String    @id @default(cuid())
  nameEn       String    // e.g., "Pre-Play", "Class 1", "Class 10"
  nameBn       String    // e.g., "প্রি-প্লে", "প্রথম শ্রেণি"
  sections     Int       @default(1) // Number of sections (A, B, etc.)
  sortOrder    Int       @default(0)
  isActive     Boolean   @default(true)
  subjects     Subject[]
  routines     ClassRoutine[]
  examSchedules ExamSchedule[]
  feeStructures FeeStructure[]
}

model Subject {
  id          String     @id @default(cuid())
  nameEn      String
  nameBn      String
  classGradeId String
  classGrade  ClassGrade @relation(fields: [classGradeId], references: [id], onDelete: Cascade)
  sortOrder   Int        @default(0)
}

model ClassRoutine {
  id          String     @id @default(cuid())
  classGradeId String
  classGrade  ClassGrade @relation(fields: [classGradeId], references: [id], onDelete: Cascade)
  fileUrl     String     // PDF file URL
  titleEn     String?
  titleBn     String?
  uploadedAt  DateTime   @default(now())
}

model AcademicCalendarEvent {
  id          String   @id @default(cuid())
  titleEn     String
  titleBn     String
  descriptionEn String?
  descriptionBn String?
  eventDate   DateTime
  endDate     DateTime? // For multi-day events
  eventType   String    // holiday, exam, event, vacation
  createdAt   DateTime  @default(now())
}

model ExamSchedule {
  id          String     @id @default(cuid())
  examNameEn  String     // e.g., "First Term Exam"
  examNameBn  String
  classGradeId String
  classGrade  ClassGrade @relation(fields: [classGradeId], references: [id], onDelete: Cascade)
  examDate    DateTime
  descriptionEn String?
  descriptionBn String?
  createdAt   DateTime   @default(now())
}

// ──────────────────────────────────────────
// ADMISSION
// ──────────────────────────────────────────

model AdmissionInfo {
  id                    String  @id @default(cuid())
  isOpen                Boolean @default(true)
  statusBannerEn        String? @default("Admissions Open for 2026 — Pre-Play to Class 9")
  statusBannerBn        String? @default("ভর্তি চলছে ২০২৬ — প্রি-প্লে থেকে নবম শ্রেণি")
  processStepsEn        String? // JSON array of steps or rich text
  processStepsBn        String?
  eligibilityEn         String? // Rich text
  eligibilityBn         String?
  requiredDocumentsEn   String? // Rich text or JSON array
  requiredDocumentsBn   String?
  importantDatesEn      String? // Rich text
  importantDatesBn      String?
  formPdfUrl            String? // Downloadable PDF form
  updatedAt             DateTime @updatedAt
}

model FeeStructure {
  id             String     @id @default(cuid())
  classGradeId   String
  classGrade     ClassGrade @relation(fields: [classGradeId], references: [id], onDelete: Cascade)
  admissionFee   Decimal?   @db.Decimal(10,2)
  monthlyFee     Decimal?   @db.Decimal(10,2)
  otherCharges   Decimal?   @db.Decimal(10,2)
  otherChargesLabelEn String?
  otherChargesLabelBn String?
  updatedAt      DateTime   @updatedAt
}

model AdmissionFaq {
  id          String   @id @default(cuid())
  questionEn  String
  questionBn  String
  answerEn    String
  answerBn    String
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

// ──────────────────────────────────────────
// FACULTY
// ──────────────────────────────────────────

model Faculty {
  id               String   @id @default(cuid())
  // Public fields
  nameEn           String
  nameBn           String
  designationEn    String   // e.g., "Assistant Teacher"
  designationBn    String
  subjectEn        String?
  subjectBn        String?
  qualificationEn  String?  // e.g., "M.A., B.Ed."
  qualificationBn  String?
  experienceYears  Int?
  bioEn            String?  // 1-2 lines
  bioBn            String?
  photoUrl         String?
  sortOrder        Int      @default(0)
  isActive         Boolean  @default(true)

  // Internal fields (NOT shown publicly)
  personalPhone    String?
  personalEmail    String?
  joiningDate      DateTime?

  // Future login (fields created now, login disabled)
  facultyId        String?  @unique  // Auto-generated unique ID
  password         String?           // bcrypt hashed (temp password)
  isLoginEnabled   Boolean  @default(false)

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

// ──────────────────────────────────────────
// NOTICES
// ──────────────────────────────────────────

enum NoticeCategory {
  GENERAL
  ADMISSION
  EXAM
  HOLIDAY
}

model Notice {
  id            String         @id @default(cuid())
  titleEn       String
  titleBn       String
  contentEn     String         // Rich text / markdown
  contentBn     String
  category      NoticeCategory @default(GENERAL)
  attachmentUrl String?        // PDF or image
  isPublished   Boolean        @default(true)
  publishedAt   DateTime       @default(now())
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

// ──────────────────────────────────────────
// GALLERY
// ──────────────────────────────────────────

enum GalleryCategory {
  CAMPUS
  CLASSROOMS
  EVENTS
  ACTIVITIES
}

model GalleryPhoto {
  id          String          @id @default(cuid())
  imageUrl    String
  captionEn   String?
  captionBn   String?
  category    GalleryCategory @default(CAMPUS)
  sortOrder   Int             @default(0)
  createdAt   DateTime        @default(now())
}

model GalleryVideo {
  id          String   @id @default(cuid())
  videoUrl    String   // YouTube or Facebook embed URL
  titleEn     String?
  titleBn     String?
  thumbnailUrl String?
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())
}

// ──────────────────────────────────────────
// CONTACT FORM MESSAGES
// ──────────────────────────────────────────

model ContactMessage {
  id        String   @id @default(cuid())
  name      String
  phone     String
  email     String?
  message   String
  isRead    Boolean  @default(false)
  createdAt DateTime @default(now())
}
```

### 5.2 Key Schema Notes

1. **Bilingual fields:** Every user-facing text field has `*En` and `*Bn` variants.
2. **Singleton tables:** `SiteSettings`, `HomeContent`, `AboutContent`, `AcademicInfo`, `AdmissionInfo` — these have exactly 1 row, created via seed.
3. **Faculty login readiness:** `facultyId` and `password` fields exist from day one but `isLoginEnabled` is `false`.
4. **Permission per module:** The `Permission` model maps each admin user to each module with granular CRUD toggles.
5. **Decimal for fees:** Using `Decimal(10,2)` for money values (Bangladeshi Taka).

---

## 6. Authentication & Authorization

### 6.1 Login System

| Aspect | Details |
|--------|---------|
| **Login URL** | `/login` (public page with role selector) |
| **Admin Login** | Username + Password (credential-based) |
| **Password Storage** | bcrypt hash (min 10 rounds) |
| **Session** | HTTP-only cookie, 24-hour expiry, auto-refresh |
| **Session Timeout** | 24 hours of inactivity |

### 6.2 Role System

```
┌──────────────┐
│  SUPER_ADMIN │ ─── Full access, bypasses all permission checks
├──────────────┤
│    ADMIN     │ ─── Access determined by Permission table entries
├──────────────┤
│   FACULTY    │ ─── Phase 2: Can only edit own profile (limited fields)
└──────────────┘
```

### 6.3 Permission Checking Logic

```typescript
// lib/permissions.ts — Pseudocode

// Cascading levels — each level includes every action below it:
// NONE < VIEW < EDIT < DELETE
const LEVEL_RANK = { NONE: 0, VIEW: 1, EDIT: 2, DELETE: 3 };
const ACTION_MIN_LEVEL = { view: 1, add: 2, edit: 2, delete: 3 }; // add/edit both require EDIT level

async function checkPermission(
  userId: string,
  module: string,
  action: 'add' | 'edit' | 'delete' | 'view'
): Promise<boolean> {
  const user = await getUser(userId);

  // Super Admin bypasses ALL permission checks
  if (user.role === 'SUPER_ADMIN') return true;

  // Admin — check Permission table (no row = NONE = no access at all)
  const permission = await prisma.permission.findUnique({
    where: { userId_module: { userId, module } }
  });

  const currentLevel = permission ? LEVEL_RANK[permission.level] : LEVEL_RANK.NONE;
  return currentLevel >= ACTION_MIN_LEVEL[action];
}
```

### 6.4 Permission Matrix (Default State)

When Super Admin creates a new Admin account, **every module defaults to `NONE`** — the new Admin sees and can do nothing until the Super Admin explicitly raises a module's level. There is no automatic `VIEW` access.

| Module | Default `level` |
|--------|-----------------|
| `school_settings` | `NONE` 🔒 (protected — see 6.4.1) |
| `home` | `NONE` |
| `about` | `NONE` |
| `academics` | `NONE` |
| `admission` | `NONE` |
| `faculty` | `NONE` |
| `notice` | `NONE` |
| `gallery` | `NONE` |
| `contact` | `NONE` |

The admin sidebar must only render a module link if the current user's level for that module is `VIEW` or higher (Super Admin always sees everything).

#### 6.4.1 `school_settings` special rule
Even when a Super Admin raises an Admin's `school_settings` level, `EDIT`/`DELETE` on this module only ever grants edit rights to footer/contact fields — **School Name and Logo remain Super-Admin-only** regardless of the Admin's assigned level, unless the Super Admin explicitly flags that specific Admin with a separate `canEditBranding: true` override (kept off the standard cascade so raising `school_settings` to `EDIT` for general footer editing doesn't accidentally unlock the school's name/logo).

### 6.5 Frontend Permission Enforcement

```typescript
// components/admin/PermissionGate.tsx
// Wraps any admin UI element and hides/disables it based on permission

<PermissionGate module="faculty" action="add">
  <Button>Add New Teacher</Button>
</PermissionGate>

// If the current admin doesn't have faculty.canAdd, the button is hidden
```

> **Critical:** Frontend hiding is UX only. **All permission checks MUST also happen server-side** in API routes / Server Actions. Never trust the frontend alone.

---

## 7. Public Pages — Detailed Specs

### 7.1 Shared Layout (All Public Pages)

#### Header / Navbar
- **Left:** School logo + name (linked to `/`)
- **Center/Right:** Navigation links: Home, About Us, Academics, Admission, Our Teachers, Notice Board, Gallery, Contact Us
- **Far Right:** Language switcher toggle (`🇧🇩 বাংলা | 🇬🇧 English`) + Login button
- **Mobile:** Hamburger menu → slide-out drawer with all links + language switcher
- **Behavior:** Sticky header on scroll, with slight blur/shadow

#### Footer
- **Column 1:** School logo, name, slogan, EIIN badge
- **Column 2:** Quick Links (all nav items)
- **Column 3:** Contact info — address, phone numbers, email, office hours
- **Column 4:** Social media icons (Facebook, YouTube) + Google Map mini embed
- **Bottom bar:** Copyright line: `© {year} Shifa International School. All rights reserved.`

---

### 7.2 Home Page (`/`)

| Section | Component | Data Source | Behavior |
|---------|-----------|-------------|----------|
| **Hero Slider** | `HeroSlider.tsx` | `HeroSlide` table | Auto-rotating image slider (3–5 slides), 5s interval. Each slide can have optional title + subtitle overlay. School name + slogan overlay on first slide. |
| **School at a Glance** | Inline | `HomeContent.introText` | 2–3 line paragraph + "Learn More" button → `/about` |
| **Stats Bar** | `StatsBar.tsx` | `SiteSettings` (totalStudents, totalTeachers, foundedYear, passRate) | 4 animated counter cards with icons. Count-up animation on scroll into view. |
| **Latest Notices** | `NoticeCard.tsx` | `Notice` table (latest 5, published only) | Card list with date badge, title, excerpt. "View All" → `/notices` |
| **Features** | Inline grid | `Feature` table | Icon + title + description cards in a 2×3 or 3×2 grid |
| **Gallery Preview** | `GalleryGrid.tsx` | `GalleryPhoto` table (latest 6) | Masonry or grid layout. Click → lightbox. "View All" → `/gallery` |
| **CTA Banner** | Inline | `HomeContent.ctaText` | Full-width gradient banner with text + button → `/admission` |

---

### 7.3 About Us (`/about`)

| Section | Data Source | Notes |
|---------|-------------|-------|
| **Breadcrumb** | Static | Home > About Us |
| **Page Hero** | Static + DB | Page title with decorative background |
| **History** | `AboutContent.history` | Rich text, 2–3 paragraphs |
| **Vision & Mission** | `AboutContent.vision`, `AboutContent.mission` | Vision as blockquote, Mission as bullet list |
| **Principal's Message** | `AboutContent.principalMessage`, `principalPhotoUrl` | Photo on left, message on right. Name + designation below photo. |
| **Registration Info** | `SiteSettings` (eiin, emisCode, schoolCode, biin) | Card/badge display |
| **Managing Committee** | `CommitteeMember` table | Table or card grid: Photo, Name, Designation |
| **Achievements** | `Achievement` table | Timeline or card list |
| **Curriculum Highlights** | `AcademicInfo.curriculum` | NCTB + Spoken English + Digital Literacy + Islamic Education |

---

### 7.4 Academics (`/academics`)

**Main Page Sections:**

| Section | Data Source |
|---------|-------------|
| **Class Structure** | `ClassGrade` table — list all grades with section count |
| **Curriculum / Board** | `AcademicInfo.curriculum` |
| **Subject List** | `Subject` table grouped by `ClassGrade` — accordion/expandable per class |
| **Class Timing** | `AcademicInfo.classTiming` |
| **Assessment Method** | `AcademicInfo.assessmentMethod` |

**Sub-pages:**

| Route | Page | Data Source |
|-------|------|-------------|
| `/academics/routines` | Class Routines | `ClassRoutine` table — per-class PDF download links |
| `/academics/calendar` | Academic Calendar | `AcademicCalendarEvent` table — calendar view or timeline |
| `/academics/exams` | Exam Schedule | `ExamSchedule` table — filterable by class |

---

### 7.5 Admission (`/admission`)

| Section | Data Source | Notes |
|---------|-------------|-------|
| **Status Banner** | `AdmissionInfo.isOpen`, `statusBanner` | Green banner if open, gray if closed |
| **Admission Process** | `AdmissionInfo.processSteps` | Step-by-step visual (stepper UI or numbered cards) |
| **Eligibility** | `AdmissionInfo.eligibility` | Table or list per class |
| **Important Dates** | `AdmissionInfo.importantDates` | Timeline or card layout |
| **Required Documents** | `AdmissionInfo.requiredDocuments` | Checklist with icons |
| **Fee Structure** | `FeeStructure` + `ClassGrade` | Table: Class → Admission Fee → Monthly Fee → Other. Currency: ৳ (BDT) |
| **Download Form** | `AdmissionInfo.formPdfUrl` | Button to download PDF |
| **FAQ** | `AdmissionFaq` table | Accordion — click to expand/collapse |

---

### 7.6 Faculty / Our Teachers (`/faculty`)

| Section | Data Source | Notes |
|---------|-------------|-------|
| **Page Header** | Static | "Our Teachers" / "শিক্ষকমণ্ডলী" |
| **Teacher Grid** | `Faculty` table (isActive=true, sorted by sortOrder) | Card grid (3-4 per row on desktop). Each card: Photo (with placeholder if none), Name, Designation, Subject, Qualification. Optional: Experience years, Bio. |

**Card design:**
- Circular or rounded-square photo
- Name in bold
- Designation as subtitle
- Subject and qualification as smaller text
- Hover effect: slight scale-up or shadow increase

---

### 7.7 Notice Board (`/notices`)

**List Page (`/notices`):**

| Element | Details |
|---------|---------|
| **Layout** | List of notice cards, newest first, with pagination (10 per page) |
| **Each Card** | Date badge (colorful), Title, Category tag, Excerpt (first 100 chars of content) |
| **Category Filter** | Tab bar or dropdown: All, General, Admission, Exam, Holiday |
| **URL** | Filtering via query param: `/notices?category=exam` |

**Detail Page (`/notices/:id`):**

| Element | Details |
|---------|---------|
| **Layout** | Full notice content (rich text), published date, category tag |
| **Attachment** | Download button if `attachmentUrl` exists |
| **Back Link** | "← Back to Notices" |

---

### 7.8 Gallery (`/gallery`)

The main `/gallery` route renders as a **tabbed page** with two tabs: Photos and Videos.

**Photo Tab (`/gallery` default or `/gallery/photos`):**

| Element | Details |
|---------|---------|
| **Layout** | Masonry grid or uniform grid |
| **Filter** | Category tabs: All, Campus, Classrooms, Events, Activities |
| **Lightbox** | Click any photo → full-screen lightbox with prev/next navigation |
| **Lazy Loading** | Images load as user scrolls |

**Video Tab (`/gallery/videos`):**

| Element | Details |
|---------|---------|
| **Layout** | Card grid (2-3 per row) |
| **Each Card** | Thumbnail + play icon overlay + title |
| **Click** | Opens YouTube/Facebook embed in a modal or inline player |

---

### 7.9 Contact Us (`/contact`)

| Section | Data Source | Notes |
|---------|-------------|-------|
| **Contact Info** | `SiteSettings` | Address, Phone (with labels), Email, Office Hours — displayed as icon + text cards |
| **Google Map** | `SiteSettings.googleMapEmbed` | Embedded Google Map iframe |
| **Inquiry Form** | New `ContactMessage` on submit | Fields: Name (required), Phone (required), Email (optional), Message (required). Success toast: "Your message has been sent!" |

**Form Validation:**
- Name: required, min 2 chars
- Phone: required, Bangladeshi phone format (01XXXXXXXXX)
- Email: optional, valid email format if provided
- Message: required, min 10 chars
- Rate limiting: max 3 submissions per IP per hour (prevent spam)

---

## 8. Admin Panel — Detailed Specs

### 8.1 Admin Layout

```
┌─────────────────────────────────────────────────────┐
│  ADMIN HEADER                                       │
│  Logo | "Admin Panel" | Logged in as: Name | Logout │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │          MAIN CONTENT AREA               │
│          │                                          │
│ 📊 Dash  │   (Changes based on selected page)       │
│ ⚙️ Site  │                                          │
│ 🏠 Home  │                                          │
│ ℹ️ About │                                          │
│ 📚 Acad  │                                          │
│ 🎓 Admis │                                          │
│ 👩‍🏫 Facul │                                          │
│ 📋 Notic │                                          │
│ 🖼️ Galle │                                          │
│ 📩 Msgs  │                                          │
│ ─────── │                                          │
│ 👥 Users │ (Super Admin only)                       │
│ 🔐 Prof  │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

- **Sidebar:** Collapsible on mobile. Show only modules the current user has at least `canView` permission for.
- **Admin Panel Language:** English only.
- **Color scheme:** Dark sidebar, light content area.

### 8.2 Dashboard (`/admin`)

| Widget | Data |
|--------|------|
| **Stats Cards** | Total Students, Total Teachers, Total Notices, Unread Messages |
| **Recent Activity** | Last 10 actions from `ActivityLog` (e.g., "Admin X edited Home content", "Notice Y published") |
| **Quick Actions** | Buttons: Add Notice, Add Faculty, Upload Photo |

### 8.3 Site Settings (`/admin/site-settings`)

**Protected fields** (School Name, Logo) — only editable if:
- User is `SUPER_ADMIN`, OR
- User is `ADMIN` with `school_settings.canEdit = true`

**Form fields:**

| Field | Type | Notes |
|-------|------|-------|
| School Name (EN) | Text input | Protected 🔒 |
| School Name (BN) | Text input | Protected 🔒 |
| Logo | Image upload | Protected 🔒 |
| Slogan (EN) | Text input | |
| Slogan (BN) | Text input | |
| EIIN | Text input | |
| EMIS Code | Text input | |
| School Code | Text input | |
| BIIN | Text input | |
| Founded Year | Number | |
| Total Students | Text | e.g., "400+" |
| Total Teachers | Text | |
| Pass Rate | Text | e.g., "95%" |
| Address (EN) | Textarea | |
| Address (BN) | Textarea | |
| Phone 1 | Text | + Label (e.g., "Principal") |
| Phone 2 | Text | + Label (e.g., "Office") |
| Email | Text | |
| Office Hours (EN) | Text | |
| Office Hours (BN) | Text | |
| Google Map Embed URL | Text | |
| Facebook URL | Text | |
| YouTube URL | Text | |

### 8.4 Home Content Editor (`/admin/home`)

| Section | UI |
|---------|-----|
| **Hero Slider** | Sortable list of slides. Each: image upload + optional title (EN/BN) + subtitle (EN/BN). Add/remove/reorder slides. |
| **Intro Text** | Dual textarea (EN + BN) |
| **CTA** | Text (EN/BN) + Button text (EN/BN) + Link URL |
| **Features** | CRUD table: Title (EN/BN), Description (EN/BN), Icon, Sort Order, Active toggle |

### 8.5 About Content Editor (`/admin/about`)

| Section | UI |
|---------|-----|
| **History** | Dual rich text editor (EN + BN) |
| **Vision** | Dual textarea (EN + BN) |
| **Mission** | Dual textarea (EN + BN) — supports bullet points |
| **Principal's Message** | Dual rich text (EN + BN) + Photo upload + Name (EN/BN) + Designation (EN/BN) |
| **Managing Committee** | CRUD table: Name (EN/BN), Designation (EN/BN), Photo, Sort Order |
| **Achievements** | CRUD table: Title (EN/BN), Description (EN/BN), Year, Icon, Sort Order |

### 8.6 Academics Manager (`/admin/academics`)

| Section | UI |
|---------|-----|
| **General Info** | Curriculum (EN/BN), Class Timing (EN/BN), Assessment Method (EN/BN) — textareas |
| **Class Grades** | CRUD table: Name (EN/BN), Sections count, Sort Order. Each grade expands to show subjects. |
| **Subjects** | Nested CRUD under each Class Grade: Name (EN/BN), Sort Order |
| **Routines** | Per-class PDF upload. Shows current file + replace button. |
| **Calendar Events** | CRUD table: Title (EN/BN), Date, End Date, Event Type (holiday/exam/event/vacation) |
| **Exam Schedules** | CRUD table: Exam Name (EN/BN), Class, Date, Description (EN/BN) |

### 8.7 Admission Manager (`/admin/admission`)

| Section | UI |
|---------|-----|
| **Admission Status** | Toggle switch (Open/Closed) + Banner text (EN/BN) |
| **Process Steps** | Dual rich text (EN/BN) |
| **Eligibility** | Dual rich text (EN/BN) |
| **Required Documents** | Dual rich text (EN/BN) |
| **Important Dates** | Dual rich text (EN/BN) |
| **Form PDF** | PDF upload + current file preview |
| **Fee Structure** | Table: Select Class → Admission Fee → Monthly Fee → Other Charges + Label |
| **FAQ** | CRUD: Question (EN/BN) + Answer (EN/BN) + Sort Order |

### 8.8 Faculty Manager (`/admin/faculty`)

**CRUD Table with Modal/Page for Add/Edit:**

| Field | Type | Notes |
|-------|------|-------|
| Photo | Image upload | Circular preview |
| Name (EN) | Text | Required |
| Name (BN) | Text | Required |
| Designation (EN) | Text | Required |
| Designation (BN) | Text | Required |
| Subject (EN) | Text | |
| Subject (BN) | Text | |
| Qualification (EN) | Text | |
| Qualification (BN) | Text | |
| Experience (Years) | Number | Optional |
| Bio (EN) | Textarea | Optional, 1-2 lines |
| Bio (BN) | Textarea | Optional |
| Personal Phone | Text | Internal only ⚠️ |
| Personal Email | Text | Internal only ⚠️ |
| Joining Date | Date picker | Internal only ⚠️ |
| Active | Toggle | Show/hide on public site |
| Sort Order | Number | Display order |

**On creation:**
- System auto-generates a unique `facultyId` (e.g., `SIS-F-001`)
- System auto-generates a temporary password (random 8-char alphanumeric)
- Both are stored but login is disabled (`isLoginEnabled = false`)
- Display the generated ID + temp password to the admin once (copyable)

### 8.9 Notice Manager (`/admin/notices`)

**CRUD Table:**

| Field | Type |
|-------|------|
| Title (EN) | Text |
| Title (BN) | Text |
| Category | Dropdown: General, Admission, Exam, Holiday |
| Content (EN) | Rich text editor |
| Content (BN) | Rich text editor |
| Attachment | File upload (PDF/image) |
| Published | Toggle |
| Publish Date | Date picker |

### 8.10 Gallery Manager (`/admin/gallery`)

**Two tabs: Photos | Videos**

**Photos tab:**
- Grid view of all uploaded photos
- Upload: Drag-and-drop zone or file picker (multiple files)
- Each photo: Category dropdown (Campus/Classrooms/Events/Activities), Caption (EN/BN), Delete button
- Reorder via drag-and-drop or sort order input

**Videos tab:**
- List of video entries
- Add: Paste YouTube/Facebook URL + Title (EN/BN)
- System auto-extracts thumbnail (or manual upload)
- Delete button per entry

### 8.11 Contact Messages (`/admin/messages`)

| Feature | Details |
|---------|---------|
| **List View** | Table: Name, Phone, Email, Message preview, Date, Read status |
| **Detail View** | Click row → expand or modal with full message |
| **Mark as Read** | Click to toggle read/unread |
| **Delete** | Delete with confirmation dialog |
| **No Reply** | No reply functionality (Phase 1) — admin reads and responds offline |

### 8.12 Manage Admins (`/admin/users`) — Super Admin Only

**This entire page is hidden from non-Super-Admin users.**

**Admin List:**
- Table: Username, Display Name, Role, Status (Active/Suspended), Last Login, Actions (Edit Permissions, Suspend, Delete)

**Create New Admin:**
- Form: Username, Display Name, Password (auto-generated or manual), Role (Admin)
- On submit: Create user with all permissions set to OFF

**Edit Permissions (Modal or dedicated page):**
- Matrix view — rows = modules, columns = Add/Edit/Delete/View
- Toggle switches for each cell
- Save button applies changes immediately
- Visual feedback: green = on, gray = off, lock icon = Super Admin only

```
┌──────────────────┬─────┬──────┬────────┬──────┐
│ Module           │ Add │ Edit │ Delete │ View │
├──────────────────┼─────┼──────┼────────┼──────┤
│ School Settings  │  —  │ 🔘   │   —    │  ✅  │
│ Home Content     │  —  │ 🔘   │   —    │  ✅  │
│ About Us         │  —  │ 🔘   │   —    │  ✅  │
│ Academics        │ 🔘  │ 🔘   │  🔘    │  ✅  │
│ Admission        │  —  │ 🔘   │   —    │  ✅  │
│ Faculty          │ 🔘  │ 🔘   │  🔘    │  ✅  │
│ Notices          │ 🔘  │ 🔘   │  🔘    │  ✅  │
│ Gallery          │ 🔘  │ 🔘   │  🔘    │  ✅  │
│ Contact Messages │  —  │  —   │  🔘    │  ✅  │
└──────────────────┴─────┴──────┴────────┴──────┘
🔘 = Toggle (on/off)    ✅ = Always on    — = Not applicable
```

### 8.13 My Profile (`/admin/profile`)

| Feature | Details |
|---------|---------|
| **View** | Display Name, Username, Role, Last Login |
| **Change Password** | Current Password + New Password + Confirm |
| **View Permissions** | Read-only matrix of own permissions (Admin only) |

---

## 9. API Endpoints

### 9.1 Public API (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/site-settings` | Get site settings (public fields only) |
| `GET` | `/api/home` | Get home page content (slides, stats, features, CTA) |
| `GET` | `/api/about` | Get about page content |
| `GET` | `/api/academics` | Get academics info, class grades, subjects |
| `GET` | `/api/academics/routines` | Get class routines (PDF links) |
| `GET` | `/api/academics/calendar` | Get academic calendar events |
| `GET` | `/api/academics/exams` | Get exam schedules |
| `GET` | `/api/admission` | Get admission info, fee structure, FAQs |
| `GET` | `/api/faculty` | Get active faculty profiles (public fields only) |
| `GET` | `/api/notices` | Get published notices (supports `?category=` filter, pagination) |
| `GET` | `/api/notices/:id` | Get single notice detail |
| `GET` | `/api/gallery/photos` | Get photos (supports `?category=` filter) |
| `GET` | `/api/gallery/videos` | Get videos |
| `POST` | `/api/contact` | Submit contact form (rate-limited) |

### 9.2 Admin API (Auth Required)

All admin endpoints require valid session + permission check.

| Method | Endpoint | Module | Action | Description |
|--------|----------|--------|--------|-------------|
| `PUT` | `/api/admin/site-settings` | `school_settings` | `edit` | Update site settings |
| `PUT` | `/api/admin/home` | `home` | `edit` | Update home content |
| `POST` | `/api/admin/home/slides` | `home` | `edit` | Add hero slide |
| `PUT` | `/api/admin/home/slides/:id` | `home` | `edit` | Update hero slide |
| `DELETE` | `/api/admin/home/slides/:id` | `home` | `edit` | Delete hero slide |
| `POST` | `/api/admin/home/features` | `home` | `edit` | Add feature |
| `PUT` | `/api/admin/home/features/:id` | `home` | `edit` | Update feature |
| `DELETE` | `/api/admin/home/features/:id` | `home` | `edit` | Delete feature |
| `PUT` | `/api/admin/about` | `about` | `edit` | Update about content |
| `POST` | `/api/admin/about/committee` | `about` | `edit` | Add committee member |
| `PUT` | `/api/admin/about/committee/:id` | `about` | `edit` | Update member |
| `DELETE` | `/api/admin/about/committee/:id` | `about` | `edit` | Delete member |
| `POST` | `/api/admin/about/achievements` | `about` | `edit` | Add achievement |
| `PUT` | `/api/admin/about/achievements/:id` | `about` | `edit` | Update achievement |
| `DELETE` | `/api/admin/about/achievements/:id` | `about` | `edit` | Delete achievement |
| `PUT` | `/api/admin/academics` | `academics` | `edit` | Update general academic info |
| `POST` | `/api/admin/academics/classes` | `academics` | `add` | Add class grade |
| `PUT` | `/api/admin/academics/classes/:id` | `academics` | `edit` | Update class grade |
| `DELETE` | `/api/admin/academics/classes/:id` | `academics` | `delete` | Delete class grade |
| `POST` | `/api/admin/academics/subjects` | `academics` | `add` | Add subject |
| `DELETE` | `/api/admin/academics/subjects/:id` | `academics` | `delete` | Delete subject |
| `POST` | `/api/admin/academics/routines` | `academics` | `add` | Upload routine PDF |
| `DELETE` | `/api/admin/academics/routines/:id` | `academics` | `delete` | Delete routine |
| `POST` | `/api/admin/academics/calendar` | `academics` | `add` | Add calendar event |
| `PUT` | `/api/admin/academics/calendar/:id` | `academics` | `edit` | Update event |
| `DELETE` | `/api/admin/academics/calendar/:id` | `academics` | `delete` | Delete event |
| `POST` | `/api/admin/academics/exams` | `academics` | `add` | Add exam schedule |
| `PUT` | `/api/admin/academics/exams/:id` | `academics` | `edit` | Update exam |
| `DELETE` | `/api/admin/academics/exams/:id` | `academics` | `delete` | Delete exam |
| `PUT` | `/api/admin/admission` | `admission` | `edit` | Update admission info |
| `POST` | `/api/admin/admission/fees` | `admission` | `edit` | Add/update fee structure |
| `POST` | `/api/admin/admission/faq` | `admission` | `edit` | Add FAQ |
| `PUT` | `/api/admin/admission/faq/:id` | `admission` | `edit` | Update FAQ |
| `DELETE` | `/api/admin/admission/faq/:id` | `admission` | `edit` | Delete FAQ |
| `POST` | `/api/admin/faculty` | `faculty` | `add` | Add faculty member |
| `PUT` | `/api/admin/faculty/:id` | `faculty` | `edit` | Update faculty |
| `DELETE` | `/api/admin/faculty/:id` | `faculty` | `delete` | Delete faculty |
| `POST` | `/api/admin/notices` | `notice` | `add` | Create notice |
| `PUT` | `/api/admin/notices/:id` | `notice` | `edit` | Update notice |
| `DELETE` | `/api/admin/notices/:id` | `notice` | `delete` | Delete notice |
| `POST` | `/api/admin/gallery/photos` | `gallery` | `add` | Upload photo(s) |
| `DELETE` | `/api/admin/gallery/photos/:id` | `gallery` | `delete` | Delete photo |
| `POST` | `/api/admin/gallery/videos` | `gallery` | `add` | Add video link |
| `DELETE` | `/api/admin/gallery/videos/:id` | `gallery` | `delete` | Delete video |
| `GET` | `/api/admin/messages` | `contact` | `view` | List contact messages |
| `PUT` | `/api/admin/messages/:id/read` | `contact` | `view` | Mark as read |
| `DELETE` | `/api/admin/messages/:id` | `contact` | `delete` | Delete message |
| `POST` | `/api/admin/upload` | — | — | File upload (images, PDFs) |

### 9.3 Super Admin Only API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all admin accounts |
| `POST` | `/api/admin/users` | Create new admin |
| `PUT` | `/api/admin/users/:id` | Update admin (suspend/activate) |
| `DELETE` | `/api/admin/users/:id` | Delete admin |
| `GET` | `/api/admin/users/:id/permissions` | Get admin's permissions |
| `PUT` | `/api/admin/users/:id/permissions` | Update admin's permissions |

### 9.4 Auth API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login (username + password) |
| `POST` | `/api/auth/logout` | Logout (destroy session) |
| `GET` | `/api/auth/session` | Get current session / user info |
| `PUT` | `/api/auth/password` | Change own password |

---

## 10. UI/UX Design Guidelines

### 10.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| **Primary** | `#1B5E20` (Deep Green) | Buttons, links, accents — represents education & growth |
| **Primary Light** | `#4CAF50` | Hover states, backgrounds |
| **Primary Dark** | `#0D3B0F` | Header, footer, dark sections |
| **Secondary** | `#FF8F00` (Amber) | CTA buttons, badges, highlights |
| **Background** | `#FAFAFA` | Page background |
| **Surface** | `#FFFFFF` | Card backgrounds |
| **Text Primary** | `#212121` | Main text |
| **Text Secondary** | `#616161` | Subtitles, meta info |
| **Border** | `#E0E0E0` | Dividers, card borders |
| **Success** | `#2E7D32` | Success messages |
| **Error** | `#C62828` | Errors, delete buttons |
| **Warning** | `#F57F17` | Warnings |

### 10.2 Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| **Bangla Text** | Hind Siliguri (Google Fonts) | — | — |
| **English Text** | Inter (Google Fonts) | — | — |
| **H1** | — | 2.5rem / 40px | 700 (Bold) |
| **H2** | — | 2rem / 32px | 600 (Semibold) |
| **H3** | — | 1.5rem / 24px | 600 |
| **Body** | — | 1rem / 16px | 400 |
| **Small** | — | 0.875rem / 14px | 400 |

### 10.3 Design Principles

1. **Clean & Professional** — This is a school website; convey trust and professionalism
2. **Mobile-First** — Most users (parents) will access via mobile phones
3. **Bangla-Ready** — Ensure all layouts accommodate longer Bangla text without breaking
4. **Accessibility** — Sufficient color contrast, keyboard navigation, alt text for images
5. **Fast Loading** — Optimize images (WebP, lazy loading), minimize JS bundle size

### 10.4 Component Design Specs

**Buttons:**
- Primary: Green background, white text, rounded corners (8px), subtle shadow
- Secondary: White background, green border, green text
- CTA: Amber/gold background, dark text, slightly larger, pulsing subtle animation
- Hover: Darken 10%, slight scale (1.02)

**Cards:**
- White background, subtle border (1px #E0E0E0), border-radius 12px
- Shadow: `0 2px 8px rgba(0,0,0,0.08)`
- Hover: Shadow increases, slight translate-up (translateY(-2px))

**Form Inputs:**
- Border: 1px #D0D0D0, border-radius 8px, padding 12px
- Focus: Green border, subtle green glow
- Error: Red border, error message below

**Tables (Admin):**
- Striped rows, hover highlight
- Header: Dark green background, white text
- Pagination: Bottom of table

### 10.5 Responsive Breakpoints

| Name | Width | Layout |
|------|-------|--------|
| Mobile | < 768px | Single column, hamburger menu |
| Tablet | 768px – 1024px | 2-column grids |
| Desktop | > 1024px | Full layout, sidebar (admin) |

---

## 11. SEO Requirements

### 11.1 Per-Page Meta Tags

Every page must have unique, language-aware meta tags:

```html
<!-- Example: Home page in Bangla -->
<html lang="bn">
<head>
  <title>শিফা ইন্টারন্যাশনাল স্কুল — প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা</title>
  <meta name="description" content="নারায়ণগঞ্জের শিফা ইন্টারন্যাশনাল স্কুল — প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত NCTB কারিকুলামে মানসম্মত শিক্ষা। EIIN: 311011906" />
  <link rel="alternate" hreflang="bn" href="https://shifaintschool.com/" />
  <link rel="alternate" hreflang="en" href="https://shifaintschool.com/" />
</head>
```

### 11.2 SEO Checklist

- [ ] Unique `<title>` per page (with school name)
- [ ] Unique `<meta name="description">` per page
- [ ] Single `<h1>` per page
- [ ] Semantic HTML5 (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`)
- [ ] All images have `alt` text
- [ ] `<link rel="canonical">` on every page
- [ ] Open Graph tags (`og:title`, `og:description`, `og:image`)
- [ ] Structured data (JSON-LD) for Organization schema
- [ ] Sitemap.xml auto-generated
- [ ] robots.txt (allow public pages, disallow admin)
- [ ] Fast page load (target < 3s)

---

## 12. File Upload & Storage

### 12.1 Upload Requirements

| File Type | Max Size | Accepted Formats | Used For |
|-----------|----------|-------------------|----------|
| Images | 5 MB | JPEG, PNG, WebP | Gallery, faculty photos, hero slides, logo |
| PDFs | 10 MB | PDF | Routines, admission forms, notice attachments |
| Videos | N/A | URL only (YouTube/Facebook) | Gallery videos (embed, not upload) |

### 12.2 Image Processing

- On upload: resize to max 1920px width (maintain aspect ratio)
- Generate thumbnail (400px width) for gallery grid
- Convert to WebP if browser supports it
- Store original + thumbnail

### 12.3 Storage Options

| Option | Details |
|--------|---------|
| **Supabase Storage** | Recommended. Free tier: 1GB. Integrates well with Supabase DB. |
| **Cloudinary** | Alternative. Free tier: 25GB bandwidth. Good image optimization. |
| **Local** | Development only. Store in `public/uploads/`. Not for production. |

---

## 13. Security Requirements

### 13.1 Checklist

- [ ] All passwords hashed with bcrypt (min 10 salt rounds)
- [ ] HTTP-only, Secure, SameSite cookies for sessions
- [ ] CSRF protection on all forms
- [ ] Rate limiting on login (max 5 attempts per 15 minutes per IP)
- [ ] Rate limiting on contact form (max 3 submissions per hour per IP)
- [ ] SQL injection prevention (Prisma ORM handles this)
- [ ] XSS prevention — sanitize all user input, especially rich text fields
- [ ] File upload validation — check MIME type server-side, not just extension
- [ ] Admin routes protected by middleware (redirect to login if no session)
- [ ] Permission checks on EVERY server-side action (not just UI hiding)
- [ ] Environment variables for all secrets (DB URL, auth secret, etc.)
- [ ] No sensitive data in client-side code or git
- [ ] HTTPS enforced in production
- [ ] Content Security Policy headers

### 13.2 Environment Variables

```env
# .env.local (DO NOT COMMIT)
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="random-32-char-string"
NEXTAUTH_URL="https://shifaintschool.com"

# File storage
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_ANON_KEY="..."
SUPABASE_SERVICE_KEY="..."

# Optional
GOOGLE_MAPS_API_KEY="..."
```

---

## 14. Seed Data

The database seed script (`prisma/seed.ts`) should create:

### 14.1 Super Admin Account

```typescript
{
  username: "superadmin",
  password: bcrypt.hash("ChangeMe@2026"),  // MUST be changed on first login
  displayName: "Super Admin",
  role: "SUPER_ADMIN",
  isActive: true
}
```

### 14.2 Site Settings (1 row)

```typescript
{
  schoolNameEn: "Shifa International School",
  schoolNameBn: "শিফা ইন্টারন্যাশনাল স্কুল",
  sloganEn: "Quality Education from Pre-Play to Class 10",
  sloganBn: "প্রি-প্লে থেকে দশম শ্রেণি পর্যন্ত মানসম্মত শিক্ষা",
  eiin: "311011906",
  foundedYear: 2020,
  totalStudents: "400+",
  totalTeachers: "25",
  addressEn: "Mokka Lakeview Tower, Muktinagar, Siddhirganj, Narayanganj",
  addressBn: "মক্কা লেকভিউ টাওয়ার, মুক্তিনগর, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ",
}
```

### 14.3 Class Grades

```typescript
const classes = [
  { nameEn: "Pre-Play", nameBn: "প্রি-প্লে", sortOrder: 1 },
  { nameEn: "Play", nameBn: "প্লে", sortOrder: 2 },
  { nameEn: "Nursery", nameBn: "নার্সারি", sortOrder: 3 },
  { nameEn: "KG", nameBn: "কেজি", sortOrder: 4 },
  { nameEn: "Class 1", nameBn: "প্রথম শ্রেণি", sortOrder: 5 },
  { nameEn: "Class 2", nameBn: "দ্বিতীয় শ্রেণি", sortOrder: 6 },
  { nameEn: "Class 3", nameBn: "তৃতীয় শ্রেণি", sortOrder: 7 },
  { nameEn: "Class 4", nameBn: "চতুর্থ শ্রেণি", sortOrder: 8 },
  { nameEn: "Class 5", nameBn: "পঞ্চম শ্রেণি", sortOrder: 9 },
  { nameEn: "Class 6", nameBn: "ষষ্ঠ শ্রেণি", sortOrder: 10 },
  { nameEn: "Class 7", nameBn: "সপ্তম শ্রেণি", sortOrder: 11 },
  { nameEn: "Class 8", nameBn: "অষ্টম শ্রেণি", sortOrder: 12 },
  { nameEn: "Class 9", nameBn: "নবম শ্রেণি", sortOrder: 13 },
  { nameEn: "Class 10", nameBn: "দশম শ্রেণি", sortOrder: 14 },
];
```

### 14.4 Sample Features

```typescript
const features = [
  { titleEn: "Experienced Teachers", titleBn: "অভিজ্ঞ শিক্ষক", icon: "GraduationCap" },
  { titleEn: "Digital Literacy", titleBn: "ডিজিটাল সাক্ষরতা", icon: "Monitor" },
  { titleEn: "Spoken English", titleBn: "স্পোকেন ইংলিশ", icon: "MessageCircle" },
  { titleEn: "Islamic Education", titleBn: "ইসলামিক শিক্ষা", icon: "BookOpen" },
  { titleEn: "Library", titleBn: "লাইব্রেরি", icon: "Library" },
  { titleEn: "Safe Campus", titleBn: "নিরাপদ ক্যাম্পাস", icon: "Shield" },
];
```

### 14.5 Singleton Content Rows

Create 1 row each (with empty/default content) for:
- `HomeContent`
- `AboutContent`
- `AcademicInfo`
- `AdmissionInfo`

---

## 15. Phase 2 — Future Scope

These features are **NOT built in Phase 1** but the database schema and architecture should accommodate them easily:

| Feature | Notes |
|---------|-------|
| **Faculty Login** | Enable `isLoginEnabled` for faculty. New dashboard at `/teacher`. Can edit own photo, bio, contact info. |
| **Result Management** | Teachers upload results **only for their own assigned students** (never a class-wide public list). Students view **only their own** result after logging in with their Student ID + password — no result data is ever shown on a public page. Server-side must verify the logged-in student ID matches the requested result's student ID on every request (prevent IDOR — one student must never be able to view another's result by changing an ID/URL). |
| **Student Dashboard** | `/student` — View own results (see Result Management above), attendance, notices |
| **Parent Dashboard** | `/parent` — View own child's results, attendance, fee status (same per-user access control as above) |
| **Online Admission Form** | Replace PDF download with online form → application tracking |
| **SMS/Email Notifications** | Send notice alerts to parents/guardians |
| **Attendance Tracking** | Daily attendance with reports |
| **Fee Payment** | Online fee payment integration (bKash, Nagad, bank) |

**Architecture choices to support Phase 2:**
1. `User.role` already includes `FACULTY` enum value
2. `Faculty` table already has `facultyId` + `password` fields
3. Database is relational and can add `Student`, `Parent`, `Result`, `Attendance` tables
4. Auth system (NextAuth) supports multiple roles out of the box

---

## 16. Development Checklist

### Phase 1 — Build Order

```
1. Project Setup
   [ ] Initialize Next.js project with TypeScript + Tailwind
   [ ] Set up Prisma with PostgreSQL
   [ ] Configure environment variables
   [ ] Set up file upload service

2. Database
   [ ] Create Prisma schema (all models)
   [ ] Run initial migration
   [ ] Create seed script with all seed data
   [ ] Run seed

3. Authentication
   [ ] Set up NextAuth with credential provider
   [ ] Build login page with role selector
   [ ] Implement session management
   [ ] Create auth middleware for admin routes
   [ ] Build permission checking utility

4. Internationalization
   [ ] Create bn.json and en.json translation files
   [ ] Build LanguageSwitcher component
   [ ] Create useLanguage hook
   [ ] Implement language-aware content loading

5. Public Layout
   [ ] Header with nav + language switcher + login button
   [ ] Footer with all sections
   [ ] Responsive mobile menu

6. Public Pages (one by one)
   [ ] Home page (all 7 sections)
   [ ] About Us page
   [ ] Academics page + 3 sub-pages
   [ ] Admission page
   [ ] Faculty page
   [ ] Notice Board (list + detail)
   [ ] Gallery (photos + videos tabs)
   [ ] Contact Us page (with form)

7. Admin Layout
   [ ] Admin sidebar + header
   [ ] Permission-based sidebar filtering
   [ ] PermissionGate component

8. Admin Pages (one by one)
   [ ] Dashboard
   [ ] Site Settings
   [ ] Home Content Editor
   [ ] About Content Editor
   [ ] Academics Manager
   [ ] Admission Manager
   [ ] Faculty Manager
   [ ] Notice Manager
   [ ] Gallery Manager
   [ ] Contact Messages
   [ ] Manage Admins (Super Admin)
   [ ] My Profile

9. API Routes
   [ ] All public GET endpoints
   [ ] All admin CRUD endpoints (with permission checks)
   [ ] File upload endpoint
   [ ] Contact form submission endpoint

10. Polish
    [ ] SEO meta tags on all pages
    [ ] Image optimization / lazy loading
    [ ] Error pages (404, 500)
    [ ] Loading states / skeletons
    [ ] Toast notifications for admin actions
    [ ] Confirm dialogs for destructive actions
    [ ] Activity logging for admin actions

11. Testing & Deployment
    [ ] Test all public pages in both languages
    [ ] Test admin CRUD operations
    [ ] Test permission system (create admin with limited access)
    [ ] Test responsive design on mobile
    [ ] Deploy to Vercel
    [ ] Connect custom domain (shifaintschool.com)
    [ ] Set up production database
    [ ] Run seed in production
    [ ] Change Super Admin password
```

---

## Appendix A: Full Route Table

### Public Routes (15)

| Route | Page (EN) | Page (BN) |
|-------|-----------|-----------|
| `/` | Home | হোম |
| `/about` | About Us | আমাদের সম্পর্কে |
| `/academics` | Academics | একাডেমিক |
| `/academics/routines` | Class Routines | ক্লাস রুটিন |
| `/academics/calendar` | Academic Calendar | একাডেমিক ক্যালেন্ডার |
| `/academics/exams` | Exam Schedule | পরীক্ষার সময়সূচি |
| `/admission` | Admission | ভর্তি তথ্য |
| `/faculty` | Our Teachers | শিক্ষকমণ্ডলী |
| `/notices` | Notice Board | নোটিশ বোর্ড |
| `/notices/:id` | Notice Detail | নোটিশ বিস্তারিত |
| `/gallery` | Gallery | গ্যালারি |
| `/gallery/photos` | Photo Gallery | ছবি গ্যালারি |
| `/gallery/videos` | Video Gallery | ভিডিও গ্যালারি |
| `/contact` | Contact Us | যোগাযোগ |
| `/login` | Login | লগইন |

### Admin Routes (12)

| Route | Page |
|-------|------|
| `/admin` | Dashboard |
| `/admin/site-settings` | Site Settings |
| `/admin/home` | Home Content Editor |
| `/admin/about` | About Content Editor |
| `/admin/academics` | Academics Manager |
| `/admin/admission` | Admission Manager |
| `/admin/faculty` | Faculty Manager |
| `/admin/notices` | Notice Manager |
| `/admin/gallery` | Gallery Manager |
| `/admin/messages` | Contact Messages |
| `/admin/users` | Manage Admins (Super Admin only) |
| `/admin/profile` | My Profile |

### Future Routes (Phase 2)

| Route | Page |
|-------|------|
| `/teacher` | Teacher Dashboard |
| `/student` | Student Dashboard |
| `/parent` | Parent Dashboard |

---

*End of PRD — This document is the single source of truth for building the Shifa International School website.*
