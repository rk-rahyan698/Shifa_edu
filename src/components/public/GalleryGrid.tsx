"use client";

/**
 * The gallery grid (T-087) — ARCHITECTURE.md §B-12, PRODUCT-SPEC.md §P-6.8.
 *
 * One component for both halves of the single `/gallery` route (ADR-006):
 * a photo grid opening `Lightbox`, or a video grid opening `VideoModal`. The
 * two share this file rather than being split further because they share the
 * one piece of state this whole component exists for — which tile, if any, is
 * open — and `page.tsx`'s Files line has no room for a fourth component to
 * hold that state instead.
 *
 * `"use client"`: this is the one interactive island on the page. `page.tsx`
 * remains a Server Component and passes already-resolved, locale-correct
 * props in — no locale or fallback logic crosses this boundary.
 */

import { useState } from "react";

import {
  Lightbox,
  type LightboxLabels,
  type LightboxPhoto,
} from "@/components/public/Lightbox";
import { VideoModal, type VideoModalItem } from "@/components/public/VideoModal";

export type GalleryGridProps =
  | {
      kind: "photos";
      items: readonly LightboxPhoto[];
      labels: LightboxLabels;
    }
  | {
      kind: "videos";
      items: readonly VideoModalItem[];
      labels: { close: string; playPrefix: string };
    };

export function GalleryGrid(props: GalleryGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (props.kind === "photos") {
    const { items, labels } = props;
    const openPhoto = openIndex === null ? undefined : items[openIndex];

    return (
      <>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="block aspect-square w-full overflow-hidden rounded-card transition-opacity hover:opacity-90"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>

        {openPhoto === undefined ? null : (
          <Lightbox
            photos={items}
            index={openIndex ?? 0}
            onClose={() => setOpenIndex(null)}
            onNavigate={setOpenIndex}
            labels={labels}
          />
        )}
      </>
    );
  }

  const { items, labels } = props;
  const openVideo = openIndex === null ? undefined : items[openIndex];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((video, index) => (
          <li key={video.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="group relative block aspect-square w-full overflow-hidden rounded-card transition-opacity hover:opacity-90"
            >
              {video.thumbnailSrc === null ? (
                <span
                  aria-hidden="true"
                  className="flex h-full w-full items-center justify-center bg-surface-alt"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailSrc}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center bg-black/25 text-3xl text-white"
              >
                ▶
              </span>
              <span className="sr-only">
                {labels.playPrefix} {video.title}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {openVideo === undefined ? null : (
        <VideoModal
          video={openVideo}
          onClose={() => setOpenIndex(null)}
          closeLabel={labels.close}
        />
      )}
    </>
  );
}
