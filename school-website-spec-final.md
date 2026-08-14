# স্কুল ওয়েবসাইট — পেজ কনটেন্ট গাইড ও অ্যাডমিন প্যানেল স্পেসিফিকেশন

> ## ⛔ SUPERSEDED — HISTORICAL RECORD ONLY / বাতিল — শুধুমাত্র ঐতিহাসিক নথি
>
> **English.** This document records the school's **original business intent** only. It is **not** an implementation specification. Every technical section in it — the permission model, the table sketches, the route and login structure — is **superseded by `ARCHITECTURE.md`**, specifically:
>
> - **ADR-003** — permissions are rows in a junction table (`user_module_permissions`); presence of a row is the grant, absence is denial. **Never** `can_add` / `can_edit` / `can_delete` / `can_view` boolean columns.
> - **ADR-005** — locale-prefixed URLs: Bangla unprefixed (`/notices`), English `/en`-prefixed (`/en/notices`).
> - **ADR-006** — a single `/gallery` route with query filters; no `/gallery/photos` or `/gallery/videos` routes.
> - **ADR-007** — the admin panel is **bilingual**, not English-only.
>
> **No agent may implement anything from this file directly.** Read it to understand what the school asked for and why; build only from `ARCHITECTURE.md`, `PRODUCT-SPEC.md` and `design-system.md`.
>
> **বাংলা।** এই ডকুমেন্টে কেবল স্কুলের **মূল ব্যবসায়িক চাহিদা** লিপিবদ্ধ আছে। এটি কোনো **ইমপ্লিমেন্টেশন স্পেসিফিকেশন নয়**। এখানকার প্রতিটি টেকনিক্যাল অংশ — পারমিশন মডেল, টেবিলের কাঠামো, রুট ও লগইন স্ট্রাকচার — **`ARCHITECTURE.md` দ্বারা বাতিল ও প্রতিস্থাপিত**, বিশেষত:
>
> - **ADR-003** — পারমিশন থাকবে একটি জাংশন টেবিলের সারি হিসেবে (`user_module_permissions`); সারি থাকা মানে অনুমতি, সারি না থাকা মানে নিষেধ। **কখনোই** `can_add` / `can_edit` / `can_delete` / `can_view` বুলিয়ান কলাম নয়।
> - **ADR-005** — URL-এ লোকেল প্রিফিক্স: বাংলা প্রিফিক্সবিহীন (`/notices`), ইংরেজি `/en` প্রিফিক্সসহ (`/en/notices`)।
> - **ADR-006** — একটিমাত্র `/gallery` রুট, কুয়েরি ফিল্টারসহ; `/gallery/photos` বা `/gallery/videos` নামে আলাদা রুট নেই।
> - **ADR-007** — অ্যাডমিন প্যানেল **দ্বিভাষিক**, শুধু ইংরেজি নয়।
>
> **কোনো এজেন্ট এই ফাইল থেকে সরাসরি কিছু ইমপ্লিমেন্ট করবে না।** স্কুল কী চেয়েছিল এবং কেন — কেবল সেটুকু বোঝার জন্যই এটি পড়া হবে; তৈরি করার সময় অনুসরণ করতে হবে `ARCHITECTURE.md`, `PRODUCT-SPEC.md` ও `design-system.md`।

> **Status.** This is the original Bangla-language requirements document — kept as the record of *business intent* (what the school asked for and why). It is **not** current technical guidance: `ARCHITECTURE.md` (system architecture + database design) and `design-system.md` (visual design) are authoritative for all technical decisions, and `PRODUCT-SPEC.md` is authoritative for current page-by-page UI specs, admin screens, and the API surface. Where this document's permission model, page structure, or design ideas differ from those three — e.g. the module × action *concept* behind the permission matrix below is what `ARCHITECTURE.md` §A-9.3 kept, but its `can_add` / `can_edit` / `can_delete` / `can_view` boolean columns were **not** — ADR-003 replaces them with rows in `user_module_permissions` — and the page/admin route structure was revised (see `ARCHITECTURE.md`'s ADR table) — the newer documents win. The unfinished "next step" at the end of this document (going page-by-page to collect the school's real content) is now tracked, with named owners, as the Content Collection Checklist in `ARCHITECTURE.md` §A-3.1.
>
> এই ডকুমেন্টটা দুই ভাগে সাজানো:
> **অংশ ১** — প্রতিটা পাবলিক পেজে কী কী তথ্য থাকবে (ফাঁকা জায়গায় নিজের স্কুলের তথ্য বসাও)
> **অংশ ২** — Super Admin ও Admin কীভাবে এই সব কনটেন্ট নিয়ন্ত্রণ করবে

---

# অংশ ১: পেজ কনটেন্ট স্ট্রাকচার

## ১. Home (হোমপেজ)

| সেকশন | কী থাকবে |
|---|---|
| হেডার/হিরো | স্কুলের নাম, লোগো, স্লোগান/মটো, ব্যাকগ্রাউন্ড ছবি বা স্লাইডার (৩-৫টা ছবি) |
| সংক্ষিপ্ত পরিচিতি | ২-৩ লাইনে স্কুল সম্পর্কে (About পেজের প্রিভিউ, "আরও জানুন" বাটনসহ) |
| পরিসংখ্যান বার | মোট শিক্ষার্থী সংখ্যা, শিক্ষক সংখ্যা, প্রতিষ্ঠার সাল, পাসের হার (৪টা সংখ্যা, আইকনসহ) |
| নোটিশ হাইলাইট | সর্বশেষ ৩-৫টা নোটিশের শিরোনাম (Notice পেজের লিংকসহ) |
| ফিচার/সুবিধা | স্কুলের বিশেষত্ব (যেমন: অভিজ্ঞ শিক্ষক, লাইব্রেরি, ল্যাব, পরিবহন — যা যা আছে) |
| গ্যালারি প্রিভিউ | ৪-৬টা সাম্প্রতিক ছবি (Gallery পেজের লিংকসহ) |
| CTA সেকশন | "ভর্তি চলছে" জাতীয় বার্তা + Admission পেজের বাটন |
| ফুটার | ঠিকানা, ফোন, ইমেইল, সোশ্যাল মিডিয়া আইকন, কপিরাইট লাইন |

**সংগৃহীত তথ্য (Shifa):**
- স্কুলের নাম: Shifa International School
- স্লোগান (SEO title): "Quality Education from Pre-Play to Class 10"
- শিক্ষার্থী: 400+
- শিক্ষক: 25
- প্রতিষ্ঠার সাল: 2020
- ক্লাস: Pre-Play to Class 10
- Registration badge: EIIN 311011906 (School Code, BIIN — Admin প্যানেল থেকে যোগ করা যাবে)
- Facebook link — Admin প্যানেল থেকে URL যোগ করতে হবে

---

## ২. About Us (আমাদের সম্পর্কে)

| সেকশন | কী থাকবে |
|---|---|
| ইতিহাস | কবে, কীভাবে, কার উদ্যোগে স্কুল প্রতিষ্ঠিত হলো — ২-৩ প্যারাগ্রাফ |
| ভিশন | স্কুলের দীর্ঘমেয়াদী লক্ষ্য (১-২ লাইন) |
| মিশন | সেই লক্ষ্যে পৌঁছানোর পথ (৩-৫টা বুলেট পয়েন্ট) |
| প্রিন্সিপালের বার্তা | প্রিন্সিপালের ছবি + স্বাক্ষরসহ একটা বার্তা (৪-৫ প্যারাগ্রাফ) |
| ম্যানেজিং কমিটি | কমিটির সদস্যদের নাম, পদবি (Owner/Chairman সহ) — টেবিল আকারে |
| অর্জন | কোনো পুরস্কার, স্বীকৃতি, উল্লেখযোগ্য সাফল্য থাকলে তালিকা |

**সংগৃহীত তথ্য (Shifa):**
- প্রতিষ্ঠার সাল: 2020
- কারিকুলাম: NCTB জাতীয় শিক্ষাক্রম + Spoken English + Digital Literacy + Islamic Education
- প্রিন্সিপাল: মো. আব্দুল মান্নান
- Registration Info: EIIN 311011906, EMIS code, School Code, BIIN (প্রয়োজনীয় নম্বরগুলো Admin প্যানেল থেকে যোগ/আপডেট করা যাবে)
- ভিশন/মিশন লম্বা টেক্সট — ইচ্ছাকৃতভাবে বাদ, এর বদলে সংক্ষিপ্ত "School at a Glance" থাকবে হোমপেজে
- ম্যানেজিং কমিটি — আলাদা পেজ না রেখে About-এর Registration Info অংশে ফোল্ড করা হয়েছে (কমিটি সদস্যদের নাম Admin প্যানেল থেকে যোগ করা হবে)

---

## ৩. Academics (একাডেমিক)

| সেকশন | কী থাকবে |
|---|---|
| শ্রেণি কাঠামো | Play/Nursery থেকে Class 10 পর্যন্ত, প্রতি শ্রেণিতে সেকশন সংখ্যা |
| শিক্ষাক্রম/বোর্ড | কোন বোর্ডের আন্ডারে (জাতীয় শিক্ষাক্রম/ইংলিশ মিডিয়াম/মাদ্রাসা ইত্যাদি) |
| বিষয় তালিকা | প্রতি শ্রেণিতে কী কী বিষয় পড়ানো হয় (সংক্ষেপে) |
| ক্লাস সময়সূচি | স্কুলের সময়, শিফট থাকলে তার বিবরণ |
| একাডেমিক ক্যালেন্ডার | ছুটির তালিকা, পরীক্ষার মাস/সময় (বছরের মূল ইভেন্টগুলো) |
| মূল্যায়ন পদ্ধতি | পরীক্ষা কীভাবে হয় (সাপ্তাহিক টেস্ট, টার্ম পরীক্ষা, বার্ষিক পরীক্ষা ইত্যাদি) |

**সংগৃহীত তথ্য (Shifa):**
- কারিকুলাম: NCTB + Spoken English + Digital Literacy + Islamic Education
- ক্লাস রুটিন: প্রতি ক্লাসের জন্য PDF আপলোড/ডাউনলোড (routines টেবিল: class_name, file_url)
- পরীক্ষার সময়সূচি: exam_schedules টেবিল (exam_name, class_name, exam_date, description)
- *(রুটিন ও পরীক্ষার তারিখ Admin প্যানেল থেকে আপলোড ও ম্যানেজ করা হবে)*

---

## ৪. Admission (ভর্তি তথ্য)

| সেকশন | কী থাকবে |
|---|---|
| ভর্তি প্রক্রিয়া | ধাপে ধাপে কীভাবে ভর্তি হয় (ফর্ম সংগ্রহ → জমা → ভর্তি পরীক্ষা/ইন্টারভিউ → ফলাফল → ভর্তি নিশ্চিতকরণ) |
| যোগ্যতা | কোন শ্রেণিতে ভর্তির জন্য বয়স/পূর্ব যোগ্যতা কী লাগবে |
| সময়সূচি | ভর্তি ফর্ম দেওয়া শুরু ও শেষ তারিখ, ভর্তি পরীক্ষার তারিখ |
| প্রয়োজনীয় কাগজপত্র | জন্মসনদ, ছবি, আগের স্কুলের সনদ ইত্যাদির তালিকা |
| ফি স্ট্রাকচার | ভর্তি ফি, মাসিক বেতন, অন্যান্য চার্জ (টেবিল আকারে, শ্রেণিভিত্তিক) |
| FAQ | ৫-৮টা কমন প্রশ্ন-উত্তর |
| ফর্ম | ডাউনলোডযোগ্য PDF ফর্ম বা অনলাইন ফর্ম লিংক |

**সংগৃহীত তথ্য (Shifa):**
- Admission status ব্যানার (নমুনা): "✅ Admissions Open for 2026 — Pre-Play to Class 9"
- Fee structure টেবিল কাঠামো: Class → Admission Fee → Monthly Fee → Other Charges *(টাকার অংক Admin প্যানেল থেকে সেট করা হবে)*
- Apply প্রক্রিয়া: Phase 1-এ ডাউনলোডযোগ্য PDF ফর্ম, Phase 2-এ অনলাইন ফর্ম
- *(ভর্তির ধাপ, তারিখ, প্রয়োজনীয় কাগজপত্রের তালিকা Admin প্যানেল থেকে আপডেট করা হবে)*

---

## ৫. Faculty (শিক্ষকমণ্ডলী)

**পাবলিক পেজে যা দেখাবে:**

| ফিল্ড | বিবরণ |
|---|---|
| ছবি | প্রোফাইল ফটো |
| নাম | পূর্ণ নাম |
| পদবি | যেমন: সহকারী শিক্ষক, সিনিয়র শিক্ষক, বিভাগীয় প্রধান |
| বিষয় | কোন বিষয় পড়ান |
| শিক্ষাগত যোগ্যতা | যেমন: এম.এ, বি.এড |
| অভিজ্ঞতা | কত বছর ধরে শিক্ষকতা করছেন (ঐচ্ছিক) |
| সংক্ষিপ্ত বায়ো | ১-২ লাইন (ঐচ্ছিক) |

**সিস্টেমে থাকবে কিন্তু পাবলিকে দেখাবে না:** ব্যক্তিগত ফোন/ইমেইল, জয়েনিং তারিখ (internal record)

**Faculty অ্যাকাউন্ট সিস্টেম (ভবিষ্যতের ভিত্তি এখনই তৈরি হবে):**
- Admin যখন নতুন faculty যোগ করবে, সিস্টেম **অটোমেটিক্যালি** একটা ইউনিক **Faculty ID** ও একটা **সাময়িক পাসওয়ার্ড** জেনারেট করবে
- এখন এই লগইন সিস্টেম চালু থাকবে না, কিন্তু ডেটাবেজে Faculty ID + hashed password ফিল্ড শুরু থেকেই রাখা হবে — যাতে ভবিষ্যতে সহজে চালু করা যায়, আলাদা করে ডেটা মাইগ্রেট করতে না হয়
- **ভবিষ্যতে Faculty লগইন করলে যা করতে পারবে:** নিজের প্রোফাইল দেখা, নিজের প্রোফাইলের নির্দিষ্ট অংশ (ছবি, বায়ো, যোগাযোগ তথ্য) নিজে এডিট করা

**সংগৃহীত তথ্য (Shifa):**
- সেকশনের নাম: "Our Teachers"
- ফিল্ড: ছবি, নাম, পদবি (designation), বিষয় (subject), যোগ্যতা (qualification)
- *(শিক্ষকদের নাম ও তথ্য Admin প্যানেল থেকে ডেটাবেজে যোগ করা হবে)*

---

## ৬. Notice (নোটিশ বোর্ড)

| সেকশন | কী থাকবে |
|---|---|
| নোটিশ লিস্ট | তারিখ, শিরোনাম, সংক্ষিপ্ত বিবরণ — নতুন থেকে পুরাতন সাজানো |
| ক্যাটাগরি | পরীক্ষা/ছুটি/ইভেন্ট/সাধারণ — ফিল্টার করার সুবিধা |
| অ্যাটাচমেন্ট | প্রয়োজনে PDF/ছবি ডাউনলোড লিংক |

**সংগৃহীত তথ্য (Shifa):**
- ক্যাটাগরি: General, Admission, Exam, Holiday
- ফিল্ড: title, category, content, attachment_url, published_at
- *(নোটিশগুলো Admin প্যানেল থেকে তৈরি ও পাবলিশ করা হবে)*

---

## ৭. Gallery (গ্যালারি)

| সেকশন | কী থাকবে |
|---|---|
| ছবি গ্যালারি | ইভেন্ট/ক্যাটাগরি অনুযায়ী সাজানো (স্পোর্টস, সাংস্কৃতিক অনুষ্ঠান, ক্লাসরুম, ক্যাম্পাস) |
| ভিডিও গ্যালারি (ঐচ্ছিক) | YouTube ভিডিও এমবেড |

**সংগৃহীত তথ্য (Shifa):**
- ছবির ক্যাটাগরি: Campus, Classrooms, Events, Activities
- ভিডিও গ্যালারি: YouTube/Facebook ভিডিও এমবেড সাপোর্ট
- *(প্রয়োজনীয় ছবি ও ভিডিও Admin প্যানেল থেকে গ্যালারিতে আপলোড করা হবে)*

---

## ৮. Contact Us (যোগাযোগ)

| সেকশন | কী থাকবে |
|---|---|
| ঠিকানা | পূর্ণ ঠিকানা |
| ফোন/মোবাইল | অফিসিয়াল নম্বর (একাধিক হলে বিভাগ উল্লেখসহ) |
| ইমেইল | অফিসিয়াল ইমেইল |
| অফিস সময় | কোন সময় অফিস খোলা থাকে |
| ম্যাপ | Google Map লোকেশন এমবেড |
| যোগাযোগ ফর্ম | নাম, ইমেইল, বিষয়, মেসেজ — সাবমিট করলে অ্যাডমিনের কাছে যাবে |

**সংগৃহীত তথ্য (Shifa):**
- ঠিকানা: মক্কা লেকভিউ টাওয়ার, মুক্তিনগর, সিদ্ধিরগঞ্জ, নারায়ণগঞ্জ
- ফোন: Principal + Office নম্বর (Admin প্যানেল থেকে আপডেট করা হবে)
- ইমেইল: অফিসিয়াল ইমেইল (যেমন: `notifications@shifaintschool.com`, Admin প্যানেল থেকে সেট করা যাবে)
- Google Map: স্কুলের লোকেশন এমবেড করা হবে
- ইনকোয়ারি ফর্ম ফিল্ড: Name, Phone, Email (ঐচ্ছিক), Message

---

## ৯. Login সিস্টেম ও ডোমেইন
- **লগইন:** একটাই `/login` পেজ, role selection (Administrator / Teacher-Staff / Student / Guardian)
- **রিডাইরেক্ট:** Admin → dashboard, Teacher → teacher dashboard, Student → student dashboard, Parent → parent dashboard
- **ডোমেইন:** shifaintschool.com (বিদ্যমান ডোমেইন)

---

# অংশ ২: অ্যাডমিন সিস্টেম — Super Admin + Admin (Permission-Based)

## মূল ধারণা
দুইটা লেভেল থাকবে:
- **Super Admin** — সর্বোচ্চ ক্ষমতাসম্পন্ন; অন্য Admin-দের কে কী করতে পারবে সেটা ঠিক করে দেয়
- **Admin** — দৈনন্দিন কাজ চালায়, কিন্তু শুধু Super Admin-এর দেওয়া অনুমতি অনুযায়ী নির্দিষ্ট কাজগুলোই করতে পারবে

## লগইন সিস্টেম
- একটাই লগইন পেজ (`/admin/login`), Username + Password দিয়ে লগইন
- লগইনের সময় role (`super_admin` / `admin`) অনুযায়ী একই ড্যাশবোর্ডে ঢুকবে, কিন্তু Admin-এর ক্ষেত্রে শুধু অনুমতি থাকা মডিউলগুলোই দেখাবে/এডিট করা যাবে
- পাসওয়ার্ড hashed থাকবে, সেশন টাইমআউট থাকবে

## Super Admin-এর ক্ষমতা (সবসময় পূর্ণ, কারো অনুমতি লাগে না)
- School Name ও Logo — এই দুইটা **protected/critical settings**, শুধু Super Admin এডিট করতে পারবে by default
- নতুন Admin অ্যাকাউন্ট তৈরি করা, সাসপেন্ড/ডিলিট করা
- প্রতিটা Admin-এর জন্য আলাদা আলাদা permission সেট/পরিবর্তন করা
- চাইলে কোনো Admin-কে School Name/Logo এডিট করার permission-ও দিতে পারবে — সম্পূর্ণ নিয়ন্ত্রণ Super Admin-এর হাতে

## Admin-এর ক্ষমতা
Default অবস্থায় নতুন Admin অ্যাকাউন্টে **কোনো permission থাকবে না** — Super Admin ম্যানুয়ালি টিক দিয়ে দিয়ে অনুমতি দেবে।

## Permission Matrix
প্রতিটা মডিউলে **Add / Edit / Delete / View** — এই ৪টা আলাদা টগল থাকবে। Super Admin প্রতিটা Admin-এর জন্য প্রতিটা মডিউলে এগুলো on/off করতে পারবে।

| মডিউল | Add | Edit | Delete | View |
|---|---|---|---|---|
| **School Name/Logo** | — | 🔒 (default: off) | — | ✅ |
| **Home পেজ কনটেন্ট** | — | টগল | — | ✅ |
| **About Us** | — | টগল | — | ✅ |
| **Academics (ক্লাস তালিকা)** | টগল | টগল | টগল | ✅ |
| **Admission তথ্য** | — | টগল | — | ✅ |
| **Faculty প্রোফাইল** | টগল | টগল | টগল | ✅ |
| **Notice** | টগল | টগল | টগল | ✅ |
| **Gallery** | টগল | টগল | টগল | ✅ |
| **Contact ফর্ম মেসেজ** | — | — | টগল | ✅ |
| **নতুন Admin তৈরি** | 🔒 শুধু Super Admin | — | 🔒 শুধু Super Admin | — |

**উদাহরণ:** Super Admin একজন Admin-কে Faculty-তে "Add" ও "Delete" permission দিলো, কিন্তু "Edit" দিলো না — তাহলে সেই Admin নতুন faculty যোগ ও মুছে ফেলতে পারবে, কিন্তু বিদ্যমান কারো তথ্য এডিট করতে পারবে না (এডিট বাটন hide/disabled থাকবে)।

## কীভাবে কাজ করবে (UI)
- Super Admin-এর একটা আলাদা সেকশন থাকবে: **"Manage Admins"**
- সব Admin-এর তালিকা, প্রতিটার পাশে "Edit Permissions" বাটন
- ক্লিক করলে মডিউল × অ্যাকশন টগল লিস্ট খুলবে, Save করলেই সাথে সাথে অ্যাক্সেস পরিবর্তিত হবে

## টেকনিক্যাল ডিজাইন (AI-কে বলার জন্য)

> ⛔ **এই অংশটি বাতিল — ইমপ্লিমেন্ট করা যাবে না।** নিচের `Permissions Table`-এর `can_add` / `can_edit` / `can_delete` / `can_view` বুলিয়ান কলামগুলো **ADR-003** দ্বারা স্পষ্টভাবে প্রত্যাখ্যাত। প্রকৃত মডেল একটি জাংশন টেবিল — দেখুন `ARCHITECTURE.md` §A-9.3 ও §B-4।
>
> ⛔ **Superseded — do not implement.** The `can_add` / `can_edit` / `can_delete` / `can_view` boolean columns sketched below are explicitly rejected by **ADR-003**. The real model is the junction table `user_module_permissions` — see `ARCHITECTURE.md` §A-9.3 and §B-4.

```
Users Table:
- user_id
- username / login_id
- password (hashed)
- role: super_admin / admin

Permissions Table:
- permission_id
- user_id (কোন Admin-এর জন্য)
- module (home / about / academics / admission / faculty / notice / gallery / contact / school_settings)
- can_add (true/false)
- can_edit (true/false)
- can_delete (true/false)
- can_view (true/false)
```

**নিয়ম:**
- `role = super_admin` হলে সব permission check বাইপাস হয়ে যাবে (সবসময় true ধরা হবে)
- `role = admin` হলে প্রতিটা add/edit/delete অ্যাকশনের আগে সার্ভার সাইডে Permissions Table চেক হবে
- `school_settings` মডিউলে by default কোনো Admin-এর permission `false` থাকবে — Super Admin ম্যানুয়ালি `true` না করলে কেউ পরিবর্তন করতে পারবে না
- ফ্রন্টএন্ডে permission না থাকলে বাটন/অপশন hide/disable থাকবে, কিন্তু আসল যাচাই সবসময় ব্যাকএন্ডেই হবে (ফ্রন্টএন্ড bypass করা সম্ভব বলে শুধু UI hide-এর উপর ভরসা করা যাবে না)

## Faculty লগইন ভবিষ্যতে চালু হলে
তখন একই Permission সিস্টেমে নতুন role যোগ হবে: `role: super_admin / admin / faculty` — এবং Faculty রোলের জন্য অনেক সীমিত permission সেট থাকবে (শুধু নিজের প্রোফাইলের নির্দিষ্ট অংশ এডিট করা)।

---

# সারসংক্ষেপ — Phase 1-এ যা বানাতে হবে

1. ৮টা পাবলিক পেজ (Home, About, Academics, Admission, Faculty, Notice, Gallery, Contact)
2. Academics পেজে dynamic ক্লাস তালিকা (Admin থেকে add/edit/delete, ভবিষ্যতে ক্লাস বাড়ানো যাবে)
3. Faculty ডেটাবেজে ID + password ফিল্ড রেডি (লগইন সিস্টেম আপাতত বন্ধ)
4. Super Admin + Admin দুই লেভেলের লগইন
5. Super Admin-এর "Manage Admins" প্যানেল — প্রতিটা Admin-এর জন্য module-wise Add/Edit/Delete/View permission টগল
6. School Name ও Logo — protected, default off, শুধু Super Admin (বা Super Admin-এর অনুমতি পাওয়া Admin) এডিট করতে পারবে

---

---

# অংশ ৩: সম্পূর্ণ এডিটেবল কনটেন্ট তালিকা

সাইটের প্রতিটা তথ্য Super Admin ও Admin (Admin-এর ক্ষেত্রে শুধু Super Admin অনুমতি দিলে) — উভয়েই এডিট করতে পারবে। নিচের টেবিলে পুরো সাইটের সব এডিটেবল কনটেন্ট এক জায়গায় দেওয়া হলো।

| পেজ/মডিউল | এডিটযোগ্য তথ্য | Super Admin | Admin (permission সাপেক্ষে) |
|---|---|---|---|
| **Site Settings** | School Name, Logo | ✅ সবসময় | 🔒 শুধু অনুমতি পেলে |
| **Site Settings** | ফুটার তথ্য (ঠিকানা, ফোন, ইমেইল, সোশ্যাল লিংক) | ✅ | ✅ (permission সাপেক্ষে) |
| **Home** | হিরো ব্যানার/স্লাইডার ছবি | ✅ | ✅ (permission সাপেক্ষে) |
| **Home** | স্লোগান, সংক্ষিপ্ত পরিচিতি টেক্সট | ✅ | ✅ (permission সাপেক্ষে) |
| **Home** | পরিসংখ্যান (স্টুডেন্ট/টিচার সংখ্যা, পাসের হার, প্রতিষ্ঠার সাল) | ✅ | ✅ (permission সাপেক্ষে) |
| **Home** | ফিচার/সুবিধার তালিকা | ✅ | ✅ (permission সাপেক্ষে) |
| **Home** | CTA টেক্সট | ✅ | ✅ (permission সাপেক্ষে) |
| **About Us** | ইতিহাস | ✅ | ✅ (permission সাপেক্ষে) |
| **About Us** | ভিশন ও মিশন | ✅ | ✅ (permission সাপেক্ষে) |
| **About Us** | প্রিন্সিপালের বার্তা ও ছবি | ✅ | ✅ (permission সাপেক্ষে) |
| **About Us** | ম্যানেজিং কমিটির সদস্য (নাম, পদবি, ছবি) — যোগ/এডিট/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **About Us** | অর্জন/স্বীকৃতির তালিকা | ✅ | ✅ (permission সাপেক্ষে) |
| **Academics** | শ্রেণি কাঠামো ও সেকশন তথ্য | ✅ | ✅ (permission সাপেক্ষে) |
| **Academics** | প্রতিটা ক্লাসের বিষয় তালিকা | ✅ | ✅ (permission সাপেক্ষে) |
| **Academics** | বোর্ড/কারিকুলাম তথ্য, ক্লাস সময়সূচি | ✅ | ✅ (permission সাপেক্ষে) |
| **Academics** | একাডেমিক ক্যালেন্ডার (ছুটি, পরীক্ষার সময়) | ✅ | ✅ (permission সাপেক্ষে) |
| **Academics** | মূল্যায়ন পদ্ধতির বিবরণ | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | ভর্তি প্রক্রিয়ার ধাপ | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | যোগ্যতা, তারিখ/সময়সূচি | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | প্রয়োজনীয় কাগজপত্রের তালিকা | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | ফি স্ট্রাকচার টেবিল | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | FAQ — যোগ/এডিট/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **Admission** | ভর্তি ফর্ম (PDF) আপলোড | ✅ | ✅ (permission সাপেক্ষে) |
| **Faculty** | ফ্যাকাল্টি প্রোফাইল (ছবি, নাম, পদবি, বিষয়, যোগ্যতা, অভিজ্ঞতা, বায়ো) — যোগ/এডিট/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **Faculty** | Faculty ID/পাসওয়ার্ড জেনারেশন (নতুন faculty যোগের সময় অটো) | ✅ | ✅ (permission সাপেক্ষে) |
| **Notice** | নোটিশ (শিরোনাম, তারিখ, বিবরণ, ক্যাটাগরি, অ্যাটাচমেন্ট) — যোগ/এডিট/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **Gallery** | ছবি আপলোড/ডিলিট, ক্যাটাগরি | ✅ | ✅ (permission সাপেক্ষে) |
| **Gallery** | ভিডিও লিংক যোগ/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **Contact** | ঠিকানা, ফোন, ইমেইল, অফিস সময়, ম্যাপ লোকেশন | ✅ | ✅ (permission সাপেক্ষে) |
| **Contact** | কন্টাক্ট ফর্মের মেসেজ দেখা/ডিলিট | ✅ | ✅ (permission সাপেক্ষে) |
| **Admin ম্যানেজমেন্ট** | নতুন Admin অ্যাকাউন্ট তৈরি/ডিলিট | ✅ শুধু Super Admin | ❌ |
| **Admin ম্যানেজমেন্ট** | Admin-দের permission সেট/পরিবর্তন | ✅ শুধু Super Admin | ❌ |

**মূলনীতি:** Admin কোনো তথ্য তখনই এডিট করতে পারবে, যখন Super Admin তাকে সেই নির্দিষ্ট মডিউলের জন্য Edit/Add/Delete permission দিয়েছে (অংশ ২-এর Permission Matrix অনুযায়ী)। Super Admin সবসময়, সবকিছু, কোনো permission ছাড়াই এডিট করতে পারবে — এবং একমাত্র Super Admin-ই ঠিক করে দেবে কোন Admin কোন মডিউলে কী করতে পারবে।

---

## পরবর্তী ধাপ
এই ডকুমেন্ট + প্রতিটা পেজের আসল কনটেন্ট (স্কুলের নাম, ঠিকানা, ফি, শিক্ষকদের তথ্য ইত্যাদি) + লোগো/ছবি — সব একসাথে AI-কে দিলেই পুরো ওয়েবসাইট + এই permission সিস্টেমসহ Admin প্যানেল বানিয়ে দিতে পারবে।

চাইলে এখন প্রতিটা পেজের আসল কনটেন্ট নিয়ে ধাপে ধাপে এগোতে পারি — কোন পেজ দিয়ে শুরু করবে?
