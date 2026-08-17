/**
 * T-067 Verify — pasting a full YouTube URL extracts the id and stores only
 * that. Pure-function coverage of `extractVideoId`, independent of the
 * database — see `actions.test.ts` for the write-path half of the Contract.
 */

import { describe, expect, it } from "vitest";

import { extractVideoId } from "@/lib/modules/gallery/video-id";

describe("extractVideoId", () => {
  it("extracts the id from a watch URL", () => {
    expect(
      extractVideoId("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a watch URL with extra query params", () => {
    expect(
      extractVideoId(
        "youtube",
        "https://www.youtube.com/watch?list=PLabc&v=dQw4w9WgXcQ&t=30s",
      ),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a youtu.be short link", () => {
    expect(extractVideoId("youtube", "https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts the id from an embed URL", () => {
    expect(
      extractVideoId("youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a shorts URL", () => {
    expect(
      extractVideoId("youtube", "https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("passes a bare id through unchanged", () => {
    expect(extractVideoId("youtube", "dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("trims surrounding whitespace from a pasted link", () => {
    expect(extractVideoId("youtube", "  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  it("does not touch a non-YouTube provider's value", () => {
    expect(extractVideoId("facebook", "https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
  });
});
