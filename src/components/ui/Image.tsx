/**
 * The public image component (T-101) — ARCHITECTURE.md §A-10.3, §A-11.
 *
 * "No bare `<img>`" (this card's Contract) means every public-facing image
 * routes through here instead of the CDN URL going straight into an `<img
 * src>`. What that buys, in one component:
 *
 * - **`srcset` from `media_variants`**, not from Next's own image optimizer.
 *   T-037's upload pipeline already resized and re-encoded every image once,
 *   at 400px and 800px, into AVIF, WebP and the source format. Routing
 *   through `next/image` here would ask a *second* optimizer to resize an
 *   image T-037 already resized — doubled processing for the same bytes, and
 *   one that additionally cannot serve a signed, 15-minute private URL
 *   (§A-10.2) because its own fetch would outlive the signature just as
 *   often as it wouldn't. `next.config.js` sets `images.unoptimized` for the
 *   same reason: this component is the optimizer.
 * - **AVIF → WebP → source format**, as three `<source>` elements in a
 *   `<picture>`. The browser picks the first it can decode; the final `<img>`
 *   is the source-format fallback for a browser that supports neither.
 * - **Explicit `width`/`height`** on every element in the picture, straight
 *   from `media_assets` — this is what keeps CLS ≤ 0.1 (§A-11): the box is
 *   the right size before a single byte of the image has arrived.
 * - **A placeholder that fills that box**, so the gap between layout and
 *   paint is a soft tint instead of a blank rectangle. There is no stored
 *   thumbnail to blur (no `blurhash` column exists on `media_assets`), so the
 *   placeholder is a generated two-tone gradient at the image's own aspect
 *   ratio rather than a miniature of the real picture — a real blur-up needs
 *   a schema change this card's Files line does not reach.
 * - **`loading="lazy"` by default**, everywhere except where a caller marks
 *   `priority` — the hero slide or whatever else is the page's LCP element.
 *
 * This component is presentational only: it takes already-resolved URLs, the
 * same way `GalleryGrid` and `HeroSlider` already take a `src: string` built
 * by the page's own `imageUrlFor`/`publicUrl` call. It does not import
 * `@/lib/storage` — signing a private URL is a server-side decision a
 * component has no business re-making per render, and a component that
 * cannot resolve a URL by itself is one that never needs an env var to be
 * unit-tested.
 *
 * No `"use client"` of its own — nothing here holds state or attaches a
 * handler — but nothing requires it either: `blurPlaceholderDataUrl` uses
 * `btoa`, not `Buffer`, specifically so this component still works if a
 * future client-side consumer (a `"use client"` gallery or carousel) renders
 * it directly rather than receiving it as a server-rendered child.
 */

export type ImageVariant = {
  /** The resolved, fetchable URL — e.g. `publicUrl(variant.storageKey)`. */
  url: string;
  /** `media_variants.mime_type` — `image/avif`, `image/webp`, or the source format. */
  mimeType: string;
  /** `media_variants.width_px`. Variants are always images, so never null in practice. */
  widthPx: number;
};

export type ResponsiveImageProps = {
  /**
   * The original asset's own URL — `media_assets.storage_key`, resolved.
   * Used as the final `<img src>` and, since the original is never re-encoded
   * into AVIF/WebP, doubles as that format's only guaranteed source.
   */
  src: string;
  /** `media_assets.mime_type` — the fallback format the plain `<img>` uses. */
  mimeType: string;
  /** `media_assets.width_px`. Required — an image with no known width does not reach this component. */
  width: number;
  /** `media_assets.height_px`. */
  height: number;
  alt: string;
  /**
   * The 400/800-wide AVIF and WebP derivatives `media_variants` holds for
   * this asset. Grouped into one `<source>` per format, most-preferred format
   * first. Omit for an asset with no derivatives yet (mid-migration, or a
   * format `buildVariants` does not cover) — the `<img>` fallback still works.
   */
  variants?: readonly ImageVariant[];
  /**
   * The `sizes` attribute shared by every `<source>` and the `<img>`. Defaults
   * to full-bleed; a grid tile or a fixed-width figure should pass its own —
   * an inherited default here would silently over-fetch on every other layout.
   */
  sizes?: string;
  /**
   * Set for the page's LCP candidate (a hero slide, a detail page's lead
   * photo) to skip lazy-loading and hint the browser to fetch it first.
   * Everything else lazy-loads, which is §A-11's "lazy below the fold" by
   * construction: a page has at most one or two priority images.
   */
  priority?: boolean;
  className?: string;
};

/**
 * The two modern formats this component ever emits a `<source>` for, in the
 * order the browser should try them — §A-10.3 generates no others.
 */
const MODERN_FORMAT_ORDER = ["image/avif", "image/webp"] as const;

export function ResponsiveImage({
  src,
  mimeType,
  width,
  height,
  alt,
  variants = [],
  sizes = "100vw",
  priority = false,
  className,
}: ResponsiveImageProps) {
  const sourcesByFormat = groupVariantsByFormat(variants);

  return (
    <span
      className={className}
      style={{
        display: "block",
        position: "relative",
        aspectRatio: `${width} / ${height}`,
        backgroundImage: `url("${blurPlaceholderDataUrl(width, height)}")`,
        backgroundSize: "cover",
        backgroundColor: "var(--color-surface-alt)",
      }}
    >
      <picture>
        {MODERN_FORMAT_ORDER.map((format) => {
          const sources = sourcesByFormat.get(format);
          if (sources === undefined || sources.length === 0) return null;
          return (
            <source
              key={format}
              type={format}
              sizes={sizes}
              srcSet={sources
                .map((source) => `${source.url} ${source.widthPx}w`)
                .join(", ")}
            />
          );
        })}
        {/* The source format's own `<source>` — completes the AVIF → WebP →
            source-format chain as three real `<picture>` candidates rather
            than leaving the third tier implicit in the `<img>` below. A
            browser new enough to support `<picture>` but too old for either
            modern format lands here instead of falling all the way through
            to the universal fallback. */}
        <source type={mimeType} sizes={sizes} srcSet={`${src} ${width}w`} />
        {/* eslint-disable-next-line @next/next/no-img-element -- this IS the image component */}
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
    </span>
  );
}

/**
 * Groups a flat `media_variants` slice into per-format lists, each sorted
 * ascending by width so the narrowest candidate is first in `srcSet` — the
 * order `srcSet` itself does not require, but that keeps the markup
 * deterministic across renders of the same data.
 */
function groupVariantsByFormat(
  variants: readonly ImageVariant[],
): ReadonlyMap<string, ImageVariant[]> {
  const byFormat = new Map<string, ImageVariant[]>();
  for (const variant of variants) {
    const bucket = byFormat.get(variant.mimeType);
    if (bucket === undefined) {
      byFormat.set(variant.mimeType, [variant]);
    } else {
      bucket.push(variant);
    }
  }
  for (const bucket of byFormat.values()) {
    bucket.sort((a, b) => a.widthPx - b.widthPx);
  }
  return byFormat;
}

/**
 * A generated two-tone gradient, shaped to the image's own aspect ratio, as a
 * data-URI `background-image`. Stands in for a real blur-up (§A-10.3's
 * pipeline stores no per-image thumbnail to blur) — it fills the box with the
 * right proportions and the site's own surface tones instead of a blank
 * rectangle, and is gone the moment the real image paints over it.
 */
function blurPlaceholderDataUrl(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="#FAF7F0"/>` +
    `<stop offset="100%" stop-color="#EDE9DD"/>` +
    `</linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
