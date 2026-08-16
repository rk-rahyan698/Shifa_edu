/**
 * T-034 Verify — schemas reject unknown keys with 422, and the shared
 * validators hold.
 *
 * Pure functions over plain objects: no database, no environment. The
 * repository-level checks are T-111's.
 */

import { describe, expect, it } from "vitest";

import { parseInput, VALIDATION_STATUS } from "@/lib/validation";
import { contactSubmissionSchema } from "@/lib/validation/contact";
import { facultySchema } from "@/lib/validation/faculty";
import { galleryPhotoSchema } from "@/lib/validation/gallery";
import { noticePublishSchema, noticeSchema } from "@/lib/validation/notice";
import {
  bdPhone,
  dbId,
  emailAddress,
  hexColour,
  httpUrl,
  linkTarget,
  money,
  richText,
  slug,
  translationSet,
  plainText,
} from "@/lib/validation/primitives";
import { siteStatSchema } from "@/lib/validation/site-settings";
import {
  password,
  permissionMatrixSchema,
  userCreateSchema,
} from "@/lib/validation/users";

/** A valid notice payload, reused as the base for the rejection cases. */
function validNotice() {
  return {
    noticeCategoryId: "3",
    isPinned: false,
    translations: {
      bn: {
        slug: "ভর্তি-বিজ্ঞপ্তি",
        title: "ভর্তি বিজ্ঞপ্তি",
        excerpt: "সংক্ষিপ্ত",
        bodyHtml: "<p>বিস্তারিত</p>",
      },
    },
  };
}

describe("unknown keys are a 422 (§A-5.1 stage 3)", () => {
  it("rejects a key the schema never declared, naming it", () => {
    const result = parseInput(userCreateSchema, {
      username: "rahim",
      email: "rahim@example.org",
      displayName: "Rahim",
      isAdmin: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.status).toBe(VALIDATION_STATUS);
    expect(result.errors).toContainEqual({
      path: "isAdmin",
      message: "Unknown field 'isAdmin'",
    });
  });

  it("rejects an unknown key nested inside a translation, with a dotted path", () => {
    const input = validNotice();
    const withExtra = {
      ...input,
      translations: {
        bn: { ...input.translations.bn, statusCode: "published" },
      },
    };

    const result = parseInput(noticeSchema, withExtra);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({
      path: "translations.bn.statusCode",
      message: "Unknown field 'statusCode'",
    });
  });

  it("reports every unknown key separately, not as one lumped issue", () => {
    const result = parseInput(userCreateSchema, {
      username: "rahim",
      email: "rahim@example.org",
      displayName: "Rahim",
      isAdmin: true,
      roleCodes: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(["isAdmin", "roleCodes"]),
    );
  });

  it("accepts the same payload once the unknown key is gone", () => {
    const result = parseInput(userCreateSchema, {
      username: "Rahim",
      email: "Rahim@Example.ORG",
      displayName: "  Rahim   Uddin ",
      preferredLocale: "bn",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.username).toBe("rahim");
    expect(result.data.email).toBe("rahim@example.org");
    expect(result.data.displayName).toBe("Rahim Uddin");
    expect(result.data.roleCode).toBe("admin");
  });
});

describe("translationSet — Bangla required, English optional (§A-7.3)", () => {
  const schema = translationSet({ title: plainText(50) });

  it("accepts Bangla alone", () => {
    expect(schema.safeParse({ bn: { title: "শিরোনাম" } }).success).toBe(true);
  });

  it("accepts both locales", () => {
    expect(
      schema.safeParse({ bn: { title: "শিরোনাম" }, en: { title: "Title" } }).success,
    ).toBe(true);
  });

  it("blocks a save with English only — Bangla is the required locale", () => {
    expect(schema.safeParse({ en: { title: "Title" } }).success).toBe(false);
  });

  it("refuses a half-filled English row rather than storing it", () => {
    expect(schema.safeParse({ bn: { title: "শিরোনাম" }, en: {} }).success).toBe(false);
  });

  it("refuses an unknown locale key", () => {
    expect(
      schema.safeParse({ bn: { title: "শিরোনাম" }, ar: { title: "عنوان" } }).success,
    ).toBe(false);
  });
});

describe("shared validators", () => {
  it("accepts a Bangladeshi mobile number however it was typed", () => {
    for (const input of [
      "01712345678",
      "017 1234 5678",
      "017-1234-5678",
      "+8801712345678",
    ]) {
      expect(bdPhone.parse(input)).toBe("01712345678");
    }
  });

  it("rejects a number that is not one", () => {
    for (const input of [
      "0171234567",
      "017123456789",
      "1712345678",
      "02123456789",
      "abc",
    ]) {
      expect(bdPhone.safeParse(input).success).toBe(false);
    }
  });

  it("lowercases an email, since users.email is CITEXT", () => {
    expect(emailAddress.parse(" Office@Example.ORG ")).toBe("office@example.org");
    expect(emailAddress.safeParse("not-an-email").success).toBe(false);
  });

  it("refuses a javascript: URL that new URL() considers well-formed", () => {
    // The whole reason httpUrl exists: `z.string().url()` accepts this.
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(
      false,
    );
    expect(httpUrl.parse("https://example.org/x")).toBe("https://example.org/x");
  });

  it("accepts a site-relative path as a link target but not a protocol-relative one", () => {
    expect(linkTarget.parse("/admission")).toBe("/admission");
    expect(linkTarget.safeParse("//evil.example").success).toBe(false);
    expect(linkTarget.safeParse("javascript:alert(1)").success).toBe(false);
  });

  it("matches the hex colour CHECK constraint", () => {
    expect(hexColour.parse("#1A73E8")).toBe("#1A73E8");
    expect(hexColour.safeParse("#1a73e").success).toBe(false);
    expect(hexColour.safeParse("red").success).toBe(false);
  });

  it("accepts a Bangla slug — the column is per-locale for exactly that", () => {
    expect(slug.parse("ভর্তি-বিজ্ঞপ্তি")).toBe("ভর্তি-বিজ্ঞপ্তি");
    expect(slug.parse("Admission-2026".toLowerCase())).toBe("admission-2026");
    expect(slug.safeParse("Admission 2026").success).toBe(false);
    expect(slug.safeParse("double--hyphen").success).toBe(false);
    expect(slug.safeParse("/notices/x").success).toBe(false);
  });

  it("yields bigint ids whatever the wire format was", () => {
    expect(dbId.parse("42")).toBe(42n);
    expect(dbId.parse(42)).toBe(42n);
    expect(dbId.parse(42n)).toBe(42n);
    expect(dbId.safeParse("0").success).toBe(false);
    expect(dbId.safeParse(-1).success).toBe(false);
    expect(dbId.safeParse("12abc").success).toBe(false);
  });

  it("keeps money as a decimal string, never a float", () => {
    expect(money.parse("1500.50")).toBe("1500.50");
    expect(money.parse(1500.5)).toBe("1500.50");
    expect(money.safeParse("-1").success).toBe(false);
    expect(money.safeParse("1.005").success).toBe(false);
  });

  it("sanitizes rich text on the way through, not on the way out", () => {
    expect(richText().parse("<p>Hi</p><script>alert(1)</script>")).toBe("<p>Hi</p>");
    // A payload with nothing left after sanitizing is an empty required field.
    expect(richText().safeParse("<script>alert(1)</script>").success).toBe(false);
  });

  it("enforces a password floor without composition theatre", () => {
    expect(password.safeParse("short").success).toBe(false);
    expect(password.safeParse("correct horse battery staple").success).toBe(true);
    // bcrypt truncates past 72 bytes, and Bangla reaches that in ~24 characters.
    expect(password.safeParse("আমারসোনারবাংলাআমিতোমায়ভালোবাসিআমারসোনার").success).toBe(
      false,
    );
  });
});

describe("schemas mirror the CHECK constraints they sit above", () => {
  it("refuses a published notice with no publication timestamp", () => {
    expect(
      noticePublishSchema.safeParse({ id: "1", statusCode: "published" }).success,
    ).toBe(false);
    expect(
      noticePublishSchema.safeParse({
        id: "1",
        statusCode: "published",
        publishedAt: "2026-08-16T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("refuses a faculty photo with no recorded photo consent (§A-16.2)", () => {
    const base = {
      designationId: "2",
      photoMediaId: "9",
      translations: { bn: { fullName: "রহিম উদ্দিন" } },
    };

    const withoutConsent = facultySchema.safeParse(base);
    expect(withoutConsent.success).toBe(false);
    if (!withoutConsent.success) {
      expect(withoutConsent.error.issues[0]?.path).toEqual(["photoConsentAt"]);
    }

    expect(
      facultySchema.safeParse({ ...base, photoConsentAt: "2026-08-16T10:00:00Z" })
        .success,
    ).toBe(true);
  });

  it("refuses publishing a faculty profile with no publish consent", () => {
    expect(
      facultySchema.safeParse({
        designationId: "2",
        statusCode: "published",
        translations: { bn: { fullName: "রহিম উদ্দিন" } },
      }).success,
    ).toBe(false);
  });

  it("refuses an active gallery photo with no subject consent", () => {
    const base = { galleryAlbumId: "1", mediaId: "2" };

    // Defaults to inactive, so the plain payload is fine.
    expect(galleryPhotoSchema.safeParse(base).success).toBe(true);
    expect(galleryPhotoSchema.safeParse({ ...base, isActive: true }).success).toBe(false);
    expect(
      galleryPhotoSchema.safeParse({
        ...base,
        isActive: true,
        subjectConsentAt: "2026-08-16T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("refuses an active statistic with no verification date (§A-3.1)", () => {
    const base = { code: "pass_rate", translations: { bn: { label: "পাসের হার" } } };

    expect(siteStatSchema.safeParse({ ...base, isActive: true }).success).toBe(false);
    expect(
      siteStatSchema.safeParse({ ...base, isActive: true, verifiedOn: "2026-01-31" })
        .success,
    ).toBe(true);
  });
});

describe("the public contact form is the strictest schema (§A-16.2)", () => {
  const valid = {
    name: "রহিম উদ্দিন",
    phone: "01712345678",
    message: "আমি ভর্তির তথ্য জানতে চাই।",
    consentGiven: true,
  };

  it("accepts a well-formed submission", () => {
    const result = parseInput(contactSubmissionSchema, valid);
    expect(result.ok).toBe(true);
  });

  it("refuses an unticked consent box", () => {
    expect(
      contactSubmissionSchema.safeParse({ ...valid, consentGiven: false }).success,
    ).toBe(false);
    const withoutConsent: Record<string, unknown> = { ...valid };
    delete withoutConsent.consentGiven;
    expect(contactSubmissionSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("refuses server-set fields posted by the client", () => {
    for (const field of ["ipHash", "userAgent", "submittedAt", "statusCode"]) {
      const result = parseInput(contactSubmissionSchema, { ...valid, [field]: "x" });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors.some((e) => e.path === field)).toBe(true);
    }
  });
});

describe("the permission matrix is validated against the module registry", () => {
  it("accepts a real module:action pair", () => {
    expect(
      permissionMatrixSchema.safeParse({
        userId: "5",
        permissions: [{ moduleCode: "notice", actionCode: "publish" }],
        specialGrants: ["edit_branding"],
      }).success,
    ).toBe(true);
  });

  it("refuses a module or action that is not a seeded code", () => {
    expect(
      permissionMatrixSchema.safeParse({
        userId: "5",
        permissions: [{ moduleCode: "notices", actionCode: "publish" }],
        specialGrants: [],
      }).success,
    ).toBe(false);

    expect(
      permissionMatrixSchema.safeParse({
        userId: "5",
        permissions: [{ moduleCode: "notice", actionCode: "publsh" }],
        specialGrants: [],
      }).success,
    ).toBe(false);
  });
});

describe("a valid payload survives round-trip", () => {
  it("parses a notice and sanitizes its body", () => {
    const input = validNotice();
    const result = parseInput(noticeSchema, {
      ...input,
      translations: {
        ...input.translations,
        bn: {
          ...input.translations.bn,
          bodyHtml: '<p>বিস্তারিত</p><img src=x onerror="alert(1)">',
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.noticeCategoryId).toBe(3n);
    expect(result.data.translations.bn.bodyHtml).toBe("<p>বিস্তারিত</p>");
    expect(result.data.translations.en).toBeUndefined();
  });
});
