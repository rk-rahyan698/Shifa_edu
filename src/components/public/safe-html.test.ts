/**
 * T-080 — the render-side sanitization layer (§A-12's second layer).
 *
 * The point under test is not "does sanitize-html work" — T-034 covers the
 * allowlist itself. It is that the *render* path applies that same allowlist to
 * whatever is actually in the column, including markup no write pipeline ever
 * saw, and that it reports "nothing to render" rather than an empty box.
 */

import { describe, expect, it } from "vitest";

import { renderableHtml, sanitizeForRender } from "@/components/public/safe-html";

describe("sanitizeForRender", () => {
  it("strips a script that reached the column without passing the write layer", () => {
    // A seed script, a migration or a pre-rule-change backup can all produce
    // this row. The write layer never ran on it; this one does.
    const clean = sanitizeForRender("<p>Notice</p><script>alert(1)</script>");
    expect(clean).toBe("<p>Notice</p>");
    expect(clean).not.toContain("script");
  });

  it("neutralizes a javascript: href while keeping the link text", () => {
    const clean = sanitizeForRender('<p><a href="javascript:alert(1)">Read</a></p>');
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain("Read");
  });

  it("drops an event handler attribute", () => {
    expect(sanitizeForRender('<p onclick="steal()">Hi</p>')).toBe("<p>Hi</p>");
  });

  it("keeps the lang attribute §A-7.3's Bangla fallback depends on", () => {
    // An English page rendering Bangla-fallback content wraps it in
    // <span lang="bn"> so a screen reader switches pronunciation. Stripping the
    // attribute would silently break that accessibility promise.
    const clean = sanitizeForRender('<p><span lang="bn">নোটিশ</span></p>');
    expect(clean).toContain('lang="bn"');
  });

  it("is idempotent, so a re-render never mangles a stored body", () => {
    const once = sanitizeForRender("<p><strong>ভর্তি</strong> চলছে</p>");
    expect(sanitizeForRender(once)).toBe(once);
  });

  it("applies the same allowlist as the write layer, not a second copy", async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize");
    const input =
      '<h2>Title</h2><img src="x" onerror="alert(1)"><a target="_blank" href="https://example.org">go</a>';
    expect(sanitizeForRender(input)).toBe(sanitizeHtml(input));
  });
});

describe("renderableHtml", () => {
  it("returns null for absent content so the section is omitted", () => {
    expect(renderableHtml(null)).toBeNull();
    expect(renderableHtml(undefined)).toBeNull();
    expect(renderableHtml("")).toBeNull();
    expect(renderableHtml("   ")).toBeNull();
  });

  it("returns null for markup that is visually empty", () => {
    expect(renderableHtml("<p></p>")).toBeNull();
    expect(renderableHtml("<p>&nbsp;</p>")).toBeNull();
  });

  it("returns null when every tag was refused — the empty-box case", () => {
    // A raw-length check would call this "content" and render a blank region.
    expect(renderableHtml("<script>alert(1)</script>")).toBeNull();
  });

  it("returns the sanitized markup when there is something to show", () => {
    expect(renderableHtml("<p>Hello<script>x</script></p>")).toBe("<p>Hello</p>");
  });

  it("passes a placeholder marker through so review can see it", () => {
    // T-113's gate fails the build on this text. Hiding it here would defeat
    // the marker's entire purpose.
    const marker = "[[CONTENT REQUIRED — DO NOT PUBLISH]]";
    expect(renderableHtml(`<p>${marker}</p>`)).toContain(marker);
  });
});
