/**
 * Extracts a bare provider video id from whatever an admin pastes.
 *
 * T-067's Contract: "Pasting a full YouTube URL extracts the id and stores
 * only that." `provider_video_id` is validated against
 * `/^[A-Za-z0-9_-]+$/` (T-034's `galleryVideoSchema`), which a raw URL never
 * matches — so the extraction has to happen before the value reaches the
 * schema, not after. `VideosPanel.tsx` calls this on every keystroke of the
 * paste field; the value that lands in the draft, and then in the save
 * payload, is always already the bare id.
 *
 * No import from React or the server here — this is deliberately a plain
 * module so both the client panel and (if a future card needs it) a server
 * handler can share the one definition of "what counts as the id."
 */

const YOUTUBE_URL_PATTERNS = [
  /youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/,
  /youtu\.be\/([A-Za-z0-9_-]{6,})/,
];

export function extractVideoId(providerCode: string, raw: string): string {
  const trimmed = raw.trim();

  if (providerCode === "youtube") {
    for (const pattern of YOUTUBE_URL_PATTERNS) {
      const match = pattern.exec(trimmed);
      if (match?.[1] !== undefined) return match[1];
    }
  }

  // Already a bare id, or a shape this function does not recognise — passed
  // through unchanged. The schema's own pattern is what ultimately refuses
  // anything that still looks like a URL.
  return trimmed;
}
