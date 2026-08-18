"use client";

/**
 * The photo lightbox (T-087) — ARCHITECTURE.md §B-12, PRODUCT-SPEC.md §P-6.8.
 *
 * **Contract:** "lightbox is keyboard-navigable and Escape-closable." Left and
 * right arrow keys move between photos, Escape closes, and focus both lands on
 * the dialog when it opens and returns to whatever had it before — a keyboard
 * user who opened the lightbox from the eleventh thumbnail is put back on the
 * eleventh thumbnail, not dropped at the top of the page.
 *
 * The overlay uses literal `black`/`white` rather than the `ink`/`surface`
 * design tokens: `tailwind.config.ts` documents that the token colours resolve
 * through CSS custom properties and do not support the `/opacity` slash
 * syntax, and a translucent scrim is exactly what this overlay needs.
 */

import { useEffect, useRef } from "react";

import type { Locale } from "@/lib/locale";

export type LightboxPhoto = {
  id: string;
  src: string;
  alt: string;
  caption: string | null;
  captionLang?: Locale;
};

export type LightboxLabels = { close: string; previous: string; next: string };

export type LightboxProps = {
  photos: readonly LightboxPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  labels: LightboxLabels;
};

export function Lightbox({ photos, index, onClose, onNavigate, labels }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const photo = photos[index];

  // Focus the dialog on open, and give focus back to whatever triggered it —
  // the grid thumbnail — once it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // Intentionally empty: this runs once for the lifetime of the dialog, not
    // once per photo navigated to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && photos.length > 1) {
        onNavigate((index - 1 + photos.length) % photos.length);
      } else if (event.key === "ArrowRight" && photos.length > 1) {
        onNavigate((index + 1) % photos.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, photos.length, onClose, onNavigate]);

  if (photo === undefined) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? photo.alt}
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label={labels.close}
        className="absolute right-4 top-4 rounded-btn bg-white/10 p-2 text-2xl text-white transition-colors hover:bg-white/20"
      >
        ×
      </button>

      {photos.length > 1 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate((index - 1 + photos.length) % photos.length);
          }}
          aria-label={labels.previous}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-btn bg-white/10 p-3 text-2xl text-white transition-colors hover:bg-white/20 sm:left-4"
        >
          ‹
        </button>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.src}
        alt={photo.alt}
        className="max-h-[75vh] max-w-full rounded-card object-contain"
        onClick={(event) => event.stopPropagation()}
      />

      {photo.caption === null ? null : (
        <p
          lang={photo.captionLang}
          className="mt-3 max-w-2xl text-center text-body text-white"
        >
          {photo.caption}
        </p>
      )}

      {photos.length > 1 ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate((index + 1) % photos.length);
          }}
          aria-label={labels.next}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-btn bg-white/10 p-3 text-2xl text-white transition-colors hover:bg-white/20 sm:right-4"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
