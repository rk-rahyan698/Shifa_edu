# Shifa International School — Website & Admin Panel

A bilingual (Bangla-default, English-secondary) public website and content management system, specified in full before any code is written. This repository currently holds **documentation only**.

## Document map

Read in this order of authority. Where two documents disagree, the one higher in this list wins.

| File | Role | Authority |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System architecture (Part A) and database design (Part B) | **Authoritative** — the single technical source of truth. Wins over every other document. |
| [`PRODUCT-SPEC.md`](PRODUCT-SPEC.md) | Page-by-page UI specs, admin screens, API surface, tech stack, reference data | Authoritative for product-level detail. Assumes every decision in `ARCHITECTURE.md`. |
| [`design-system.md`](design-system.md) | Palette, typography, components, accessibility contrast | Authoritative for **visual design only**. |
| [`school-website-spec-final.md`](school-website-spec-final.md) | The original Bangla-language requirements | **Historical only.** Business intent, not implementation guidance. Every technical section in it is superseded. |

Two further files drive the build itself:

| File | Role |
|---|---|
| [`build-state.json`](build-state.json) | Task status and the dependency graph. **The only place status lives**, and the only authoritative dependency graph. Start every session here. |
| [`BUILD-TRACKER.md`](BUILD-TRACKER.md) | The task catalogue — one card per task: what to load, what to touch, where to stop, how to verify. It defines tasks; it never records status. |

## Resuming work

Paste this to start any session:

```
Read build-state.json and follow its read_order_for_ai. Do exactly one task, then stop.
```

## Ground rule

No agent may originate a fact about this school — no counts, rates, names, fees, phone numbers, dates or registration numbers. Where a value is structurally required but not yet supplied, the literal marker `[[CONTENT REQUIRED — DO NOT PUBLISH]]` is written instead, and the publish gate refuses it. See `ARCHITECTURE.md` §A-3.1.
