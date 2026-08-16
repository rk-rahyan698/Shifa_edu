/**
 * The `home` module's action inputs.
 *
 * T-034 declares what a hero slide, the home singleton and a feature may
 * contain, and none of it is restated here. What a *save* adds is the identity
 * of the row and, for the slides, an explicit ordering call:
 *
 * ```ts
 * { id: null, values: { … } }             // insert
 * { id: "42", values: { … } }             // update
 * { ids: ["7", "3", "9"] }                // the new order, top to bottom
 * ```
 *
 * `heroSlideSchema` carries a `.refine` (the schedule's end must follow its
 * start), which makes it a `ZodEffects` and therefore not extendable. Nesting
 * it under `values` sidesteps that without copying the rule — and it keeps the
 * same shape as the module's other saves, so a reader learns the convention
 * once. See `site-settings/schema.ts` for the same reasoning at more length.
 */

import { dbId, optionalDbId, strictObject } from "@/lib/validation/primitives";
import { featureSchema, heroSlideSchema } from "@/lib/validation/home";
import { z } from "zod";

/** `hero_slides` + its translations. `values` carries T-034's `ck_slide_range` mirror. */
export const heroSlideSaveSchema = strictObject({
  id: optionalDbId,
  values: heroSlideSchema,
});

/** `features` + its translations. */
export const featureSaveSchema = strictObject({
  id: optionalDbId,
  values: featureSchema,
});

/**
 * A new running order, as the complete list of ids from first to last.
 *
 * Positions rather than deltas: an admin who drags a slide to the top has
 * changed every row's `sort_order`, and posting one moved id would leave the
 * server to guess the rest. The whole list also makes the write idempotent —
 * replaying it lands the same order — which a "move up by one" call cannot be.
 */
export const heroSlideReorderSchema = strictObject({
  ids: z.array(dbId).min(1, "Nothing to reorder"),
});

/** Any child row of this module, by id. */
export const homeItemDeleteSchema = strictObject({ id: dbId });
