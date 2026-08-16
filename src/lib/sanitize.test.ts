/**
 * T-034 Verify — the XSS payload suite (§A-12).
 *
 * Every payload below is asserted **neutralized**, not merely "changed": the
 * check is that no executable construct survives, because a sanitizer that
 * rewrites `<script>` into `<scr ipt>` passes a naive diff test and still ships
 * the hole.
 *
 * Pure functions over strings, so no database and no environment.
 */

import { describe, expect, it } from "vitest";

import {
  isCleanHtml,
  isEmptyHtml,
  sanitizeHtml,
  SANITIZE_OPTIONS,
  stripHtml,
} from "@/lib/sanitize";

/** Nothing that can execute or reach off-site may survive sanitizing. */
function expectNeutralized(payload: string): string {
  const clean = sanitizeHtml(payload);

  expect(clean.toLowerCase()).not.toContain("<script");
  expect(clean.toLowerCase()).not.toContain("javascript:");
  expect(clean.toLowerCase()).not.toContain("<iframe");
  expect(clean.toLowerCase()).not.toContain("<svg");
  expect(clean.toLowerCase()).not.toContain("<img");
  expect(clean.toLowerCase()).not.toContain("onerror");
  expect(clean.toLowerCase()).not.toContain("onload");
  expect(clean.toLowerCase()).not.toContain("onclick");
  expect(clean.toLowerCase()).not.toContain("<style");
  expect(clean).not.toContain("style=");

  return clean;
}

describe("the four named payloads (T-034 Verify)", () => {
  it("neutralizes <script>", () => {
    expect(expectNeutralized("<script>alert(1)</script>")).toBe("");
  });

  it("neutralizes onerror=", () => {
    expect(expectNeutralized('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("neutralizes a javascript: href, keeping the link text", () => {
    const clean = expectNeutralized('<a href="javascript:alert(1)">Notice</a>');
    expect(clean).toContain("Notice");
    expect(clean).not.toContain("href");
  });

  it("neutralizes an SVG payload", () => {
    expect(expectNeutralized('<svg/onload=alert(1)><svg onload="alert(1)"></svg>')).toBe(
      "",
    );
  });
});

describe("payload variations that defeat naive filters", () => {
  const payloads = [
    "<SCRIPT>alert(1)</SCRIPT>",
    "<scr<script>ipt>alert(1)</scr</script>ipt>",
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="java\tscript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    "<body onload=alert(1)>",
    '<iframe src="https://evil.example"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="javascript:alert(1)">',
    '<form action="https://evil.example"><input name="password"></form>',
    "<style>body{background:url('javascript:alert(1)')}</style>",
    '<div style="background:url(javascript:alert(1))">x</div>',
    "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    "<template><script>alert(1)</script></template>",
    "<xss onafterscriptexecute=alert(1)>x</xss>",
  ];

  it.each(payloads)("neutralizes %s", (payload) => {
    expectNeutralized(payload);
  });
});

describe("legitimate formatting survives", () => {
  it("keeps the tags a school notice needs", () => {
    const html =
      "<h2>ভর্তি বিজ্ঞপ্তি</h2><p><strong>জরুরি</strong> — <em>আজ</em></p>" +
      "<ul><li>এক</li><li>দুই</li></ul><blockquote>উদ্ধৃতি</blockquote>";

    expect(sanitizeHtml(html)).toBe(html);
    expect(isCleanHtml(html)).toBe(true);
  });

  it("keeps an http link and a table", () => {
    const html =
      '<p><a href="https://example.org" title="x">Link</a></p>' +
      "<table><tbody><tr><th>A</th><td>1</td></tr></tbody></table>";

    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps mailto and tel links — a school page is mostly contact details", () => {
    const html =
      '<p><a href="mailto:office@example.org">Email</a> ' +
      '<a href="tel:+8801700000000">Call</a></p>';

    expect(sanitizeHtml(html)).toBe(html);
  });

  it("keeps <span lang> so the §A-7.3 fallback stays screen-reader correct", () => {
    const html = '<p>English text <span lang="bn" dir="ltr">বাংলা</span></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("drops class and id without dropping the element", () => {
    expect(sanitizeHtml('<p class="danger" id="x">Text</p>')).toBe("<p>Text</p>");
  });
});

describe("link hardening", () => {
  it("adds rel=noopener noreferrer to a link that opens a new tab", () => {
    const clean = sanitizeHtml('<a href="https://example.org" target="_blank">x</a>');

    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it("leaves a same-tab link's rel alone", () => {
    expect(sanitizeHtml('<a href="https://example.org">x</a>')).toBe(
      '<a href="https://example.org">x</a>',
    );
  });

  it("refuses a protocol-relative href, which resolves off-origin", () => {
    expect(sanitizeHtml('<a href="//evil.example">x</a>')).not.toContain("evil.example");
  });
});

describe("sanitizeHtml is idempotent", () => {
  const inputs = [
    "<p>plain</p>",
    '<a href="https://example.org" target="_blank">x</a>',
    "<script>alert(1)</script><p>after</p>",
    "<p>a &amp; b</p>",
    "<h2>শিরোনাম</h2>",
  ];

  it.each(inputs)("re-sanitizing %s changes nothing", (input) => {
    const once = sanitizeHtml(input);
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe("stripHtml and isEmptyHtml", () => {
  it("reduces markup to its text", () => {
    expect(stripHtml("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });

  it("drops a script's contents rather than exposing them as text", () => {
    expect(stripHtml("<script>alert(1)</script>")).toBe("");
  });

  it("treats structurally empty rich text as empty", () => {
    expect(isEmptyHtml("<p></p>")).toBe(true);
    expect(isEmptyHtml("<p>&nbsp;</p>")).toBe(true);
    expect(isEmptyHtml("   ")).toBe(true);
    // The whole payload is discarded, so a "non-empty" input is empty content.
    expect(isEmptyHtml("<script>alert(1)</script>")).toBe(true);
    expect(isEmptyHtml("<p>real</p>")).toBe(false);
  });
});

describe("the allowlist itself", () => {
  it("names no tag that can execute or embed", () => {
    const forbidden = [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "img",
    ];
    for (const tag of forbidden) {
      expect(SANITIZE_OPTIONS.allowedTags).not.toContain(tag);
    }
  });

  it("allows no scheme that can execute", () => {
    expect(SANITIZE_OPTIONS.allowedSchemes).toEqual(["http", "https", "mailto", "tel"]);
    expect(SANITIZE_OPTIONS.allowProtocolRelative).toBe(false);
  });
});
