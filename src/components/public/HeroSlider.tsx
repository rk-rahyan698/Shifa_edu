"use client";

/**
 * The homepage hero slider (T-081) — PRODUCT-SPEC.md §P-6.2.
 *
 * "Auto-rotating, 3–5 slides, 5s interval. Optional title/subtitle overlay per
 * slide." Auto-rotation pauses on hover or keyboard focus, and never starts at
 * all when the visitor's system asks for reduced motion — an auto-advancing
 * hero is exactly the kind of motion design-system.md §9 exists to give a
 * visitor a way out of.
 *
 * A single slide renders statically, with no controls: there is nothing to
 * rotate to. Zero slides render nothing at all, the same "no empty shells"
 * contract `StatsBar` and `FeatureGrid` carry.
 *
 * Client-only for the interval and pause state. Every string arrives already
 * resolved and translated — the same rule `Header`'s doc comment states — so
 * `src/i18n/*.json` never enters this bundle.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

export type HeroSlideItem = {
  id: string;
  imageUrl: string;
  imageAlt: string;
  title: string;
  /** Set only when `title` fell back to Bangla on an English page (§A-7.3). */
  titleLang?: "bn" | "en";
  subtitle: string | null;
  subtitleLang?: "bn" | "en";
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type HeroSliderProps = {
  slides: readonly HeroSlideItem[];
  /** Milliseconds between automatic advances. Defaults to the spec's 5s. */
  intervalMs?: number;
  previousLabel: string;
  nextLabel: string;
  /** `{n}` and `{total}` are replaced with the 1-based slide number and count. */
  goToSlideTemplate: string;
};

export function HeroSlider({
  slides,
  intervalMs = 5000,
  previousLabel,
  nextLabel,
  goToSlideTemplate,
}: HeroSliderProps) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducesMotion, setReducesMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducesMotion(query.matches);
    const onChange = () => setReducesMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Guards against `slides.length` shrinking between renders (a revalidated
  // page with fewer slides than the client's stale index).
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (slides.length < 2 || isPaused || reducesMotion) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, reducesMotion, intervalMs]);

  if (slides.length === 0) return null;

  const active = slides[index % slides.length]!;
  const hasControls = slides.length > 1;

  return (
    <section
      aria-roledescription={hasControls ? "carousel" : undefined}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onKeyDown={(event) => {
        if (!hasControls) return;
        if (event.key === "ArrowLeft") {
          setIndex((current) => (current - 1 + slides.length) % slides.length);
        } else if (event.key === "ArrowRight") {
          setIndex((current) => (current + 1) % slides.length);
        }
      }}
      className="relative overflow-hidden bg-primary"
    >
      <div className="relative aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[21/9]">
        {/* Remote-storage image; `next/image` needs `images.remotePatterns`,
            which is T-101's card, not this one. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={active.id}
          src={active.imageUrl}
          alt={active.imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* A Forest Green duotone, not a full-image filter (design-system.md
            §6) — a gradient from the brand primary to transparent, so the
            overlay reads as the school's own colour rather than a generic
            dark scrim. */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary to-transparent opacity-80" />

        <div className="absolute inset-x-0 bottom-0 px-4 pb-10 sm:px-10 sm:pb-16">
          <div className="mx-auto max-w-6xl">
            <h2
              lang={active.titleLang}
              className="font-heading text-h1 font-bold text-surface drop-shadow"
            >
              {active.title}
            </h2>
            {active.subtitle === null ? null : (
              <p
                lang={active.subtitleLang}
                className="mt-3 max-w-2xl text-body-lg text-surface opacity-95"
              >
                {active.subtitle}
              </p>
            )}
            {active.ctaLabel === null || active.ctaHref === null ? null : (
              <Link href={active.ctaHref} className="btn-cta mt-6 inline-flex">
                {active.ctaLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {hasControls ? (
        <>
          <button
            type="button"
            aria-label={previousLabel}
            onClick={() =>
              setIndex((current) => (current - 1 + slides.length) % slides.length)
            }
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-btn bg-surface px-3 py-2 text-primary hover:bg-surface-alt sm:left-4"
          >
            <span aria-hidden="true" className="block text-2xl leading-none">
              ‹
            </span>
          </button>
          <button
            type="button"
            aria-label={nextLabel}
            onClick={() => setIndex((current) => (current + 1) % slides.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-btn bg-surface px-3 py-2 text-primary hover:bg-surface-alt sm:right-4"
          >
            <span aria-hidden="true" className="block text-2xl leading-none">
              ›
            </span>
          </button>

          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            {slides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                aria-label={goToSlideTemplate
                  .replace("{n}", String(slideIndex + 1))
                  .replace("{total}", String(slides.length))}
                aria-current={slideIndex === index ? "true" : undefined}
                onClick={() => setIndex(slideIndex)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  slideIndex === index ? "bg-accent" : "bg-surface hover:bg-accent-tint"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
