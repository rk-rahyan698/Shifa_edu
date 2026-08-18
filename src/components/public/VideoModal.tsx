"use client";

/**
 * The video modal (T-087) — ARCHITECTURE.md §B-12, PRODUCT-SPEC.md §P-6.8,
 * ADR-006.
 *
 * Opens `video_providers.embed_url_template` with the id substituted — built
 * once, by `gallery/page.tsx`'s read model, never by this component — in an
 * iframe. §B-12's own migration comment is explicit that the embed URL is
 * derived, not stored, and that "building the iframe from the template is the
 * public renderer's job": this is that renderer.
 *
 * Escape-closable, like `Lightbox`, and the same focus-out/focus-back pair.
 */

import { useEffect, useRef } from "react";

import type { Locale } from "@/lib/locale";

export type VideoModalItem = {
  id: string;
  embedUrl: string;
  title: string;
  titleLang?: Locale;
  thumbnailSrc: string | null;
};

export type VideoModalProps = {
  video: VideoModalItem;
  onClose: () => void;
  closeLabel: string;
};

export function VideoModal({ video, onClose, closeLabel }: VideoModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
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
        aria-label={closeLabel}
        className="absolute right-4 top-4 rounded-btn bg-white/10 p-2 text-2xl text-white transition-colors hover:bg-white/20"
      >
        ×
      </button>

      <div
        className="aspect-video w-full max-w-3xl overflow-hidden rounded-card bg-black"
        onClick={(event) => event.stopPropagation()}
      >
        <iframe
          src={video.embedUrl}
          title={video.title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <p
        lang={video.titleLang}
        className="mt-3 max-w-2xl text-center text-body text-white"
      >
        {video.title}
      </p>
    </div>
  );
}
