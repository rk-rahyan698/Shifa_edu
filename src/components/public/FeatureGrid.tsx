/**
 * The homepage features grid (T-081) — PRODUCT-SPEC.md §P-6.2: "Icon + title +
 * description grid."
 *
 * `features.icon` (§B-10) carries a Lucide identifier — the seed writes
 * `GraduationCap`, `Monitor`, `MessageCircle` and so on — for an icon library
 * that is not yet a dependency of this project; adding one is a `package.json`
 * change outside this card's Files. Printing the raw identifier as if it were
 * display text would be worse than omitting it, so a card illustrates itself
 * with the admin's own image when one is set (`features.media_id`) and runs on
 * title and description alone otherwise. Wiring the icon set is left for
 * whichever later card adds the dependency.
 *
 * A Server Component: nothing here is interactive. Returns `null` with no
 * active features — the same "no empty shells" contract `HeroSlider` and
 * `StatsBar` carry.
 */

export type FeatureGridItem = {
  id: string;
  title: string;
  /** Set only when `title` fell back to Bangla on an English page (§A-7.3). */
  titleLang?: "bn" | "en";
  description: string | null;
  descriptionLang?: "bn" | "en";
  imageUrl: string | null;
  imageAlt: string;
};

export type FeatureGridProps = {
  heading: string;
  features: readonly FeatureGridItem[];
};

export function FeatureGrid({ heading, features }: FeatureGridProps) {
  if (features.length === 0) return null;

  return (
    <section
      aria-labelledby="home-features"
      className="mx-auto max-w-6xl px-4 py-12 sm:px-6"
    >
      <h2 id="home-features" className="font-heading text-h2 text-primary">
        {heading}
      </h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.id} className="card card-accent">
            {feature.imageUrl === null ? null : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={feature.imageUrl}
                alt={feature.imageAlt}
                loading="lazy"
                className="-mx-6 -mt-6 mb-4 h-40 w-[calc(100%+3rem)] object-cover"
              />
            )}
            <h3 lang={feature.titleLang} className="font-heading text-h3 text-ink">
              {feature.title}
            </h3>
            {feature.description === null ? null : (
              <p lang={feature.descriptionLang} className="mt-2 text-body text-ink-muted">
                {feature.description}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
