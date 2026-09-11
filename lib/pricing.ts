/**
 * The single paid product, in one place.
 *
 * MenoLisa sells one thing: a personalized {@link PLAN_WEEKS}-week plan for
 * {@link PLAN_PRICE}, **charged once** (2026-09-11). It is not a subscription.
 * There is no auto-renewal, no card kept on file for a later charge, and
 * nothing for her to cancel. Access runs {@link PLAN_ACCESS_DAYS} days from
 * purchase and then ends; if she wants another block she comes back and buys
 * one.
 *
 * **One price, one charge, one number.** That is the whole design, and it is a
 * reaction to what came before it:
 *
 * - A $59 block with a free trial (to 2026-09-08).
 * - $1 for the first week, then $4.99/week, on a plan that ran in 8-week
 *   blocks (2026-09-08 → 09-11). Three different durations on one screen: the
 *   paywall spent its largest type reconciling them, Terms §10.1 had to state
 *   outright that "the billing period and the plan block are different
 *   lengths", and `/admin` grew a cohort table whose rows were weeks and whose
 *   columns were also weeks but meant something else. It sold 74 quiz
 *   finishers and two saved cards, both cancelled.
 * - $29 auto-renewing every 8 weeks (2026-09-11, for part of a day).
 *
 * What is gone, deliberately, and must not come back on its own:
 *
 * - **Auto-renewal.** `create-checkout` runs Stripe in `mode: "payment"`. No
 *   Subscription object is created, so `customer.subscription.*` never fires
 *   for a new customer. Re-introducing recurring billing is a Terms change
 *   (§10 currently promises the opposite), not a price change.
 * - **The first-week discount and its coupon.** No `discounts` array.
 * - **The free trial.** `getAccountState()` has never known what a trial is.
 * - **The money-back guarantee.** Removed 2026-09-09 across the paywall, the
 *   landing page, the FAQ, the welcome email and Terms §11 in one commit.
 *   **A refund promise on a marketing surface and Terms §11 move together, in
 *   both directions.**
 *
 * The risk reversal is no longer "you can cancel" — there is nothing to
 * cancel, which is itself the reassurance. See {@link GUARANTEE_HEADLINE}.
 *
 * Every price shown to a user, and every value reported to Meta, derives from
 * the constants here. Hardcoding a dollar figure in a component is how the
 * paywall and the Stripe receipt drift apart. **The paywall's price line and
 * Stripe Checkout's submit text are built from the same constant** — see
 * {@link PRICE_LINE} and {@link CHECKOUT_SUBMIT_TEXT}.
 *
 * Stripe side (`scripts/stripe-plan-price.ts` creates it):
 *   - Price: $29 USD, **one-time** (no `recurring`) → `STRIPE_PRICE_PLAN`.
 *   - No coupon, no trial, no promo-code box.
 */

/** Wire value for `plan` in POST /api/stripe/create-checkout and in Meta events. */
export const PLAN_ID = "plan8w" as const;
export type PlanId = typeof PLAN_ID;

/** Length of one plan block — and of the access one payment buys. */
export const PLAN_WEEKS = 8;

/**
 * What she pays, once, in USD. Must match the `unit_amount` on
 * `STRIPE_PRICE_PLAN`; `scripts/stripe-plan-price.ts` throws if they disagree.
 */
export const PLAN_PRICE = 29;

/**
 * How long one payment buys, in days.
 *
 * This is **the** access boundary now. Under the subscription plans Stripe
 * supplied a period end and this was only a fail-closed fallback; a one-time
 * payment has no period at all, so every paid row's `subscription_ends_at` is
 * computed from this and nothing else. Change it and you change what everyone
 * who pays from that moment on actually gets.
 */
export const PLAN_ACCESS_DAYS = PLAN_WEEKS * 7;

/** `59` → `"$59"`, `4.99` → `"$4.99"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * The offer, in the words the paywall and Stripe Checkout both use. One string,
 * two surfaces — {@link CHECKOUT_SUBMIT_TEXT} opens on this exact sentence, so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same. Change it here or it is no longer true that they match.
 *
 * **"once" is doing legal work, not sales work.** A woman of 45-60 arriving
 * from an Instagram ad assumes any card entry is a subscription trap, and the
 * single most valuable true thing this page can say is that it is not one.
 */
export const PRICE_LINE = `${formatPrice(PLAN_PRICE)} once for your full ${PLAN_WEEKS}-week plan. No subscription, no auto-renewal.`;

/**
 * The whole risk reversal. It used to be cancelling; there is nothing to
 * cancel now, and that is strictly better — "you will never be charged again"
 * is a fact about the charge rather than a promise about our behaviour, and it
 * needs no process, no email and no trust.
 */
export const NO_RENEWAL_COPY = `You are never charged again.`;

/** The line under the price, on the paywall. */
export const PRICE_SUBLINE = `One payment — nothing to cancel, and no card kept on file.`;

/**
 * ── The guarantee, as she experiences it ──────────────────────────────────
 *
 * There is no money-back guarantee and there has not been one since
 * 2026-09-09. At {@link PLAN_PRICE} a refund clause asks her to imagine
 * emailing us and to picture the product failing, at the moment belief is
 * highest, over an amount she does not need a process to recover.
 *
 * What replaces it is the structure of the offer itself: one charge, no
 * subscription, no renewal. The objection this screen actually has to answer
 * is *"will this quietly keep taking my money?"* — and the honest answer is
 * that it cannot, because there is no second charge to stop.
 *
 * If a refund promise ever comes back here, Terms §11 changes in the same
 * commit. A guarantee printed on the paywall and absent from the Terms is a
 * misrepresentation, and that coupling is why they have moved together every
 * time.
 */
export const GUARANTEE_HEADLINE = `One payment. No subscription.`;

/**
 * The row inside the price card, as two halves — the claim and the mechanism —
 * because the card bolds the first and not the second.
 *
 * Two constants rather than one string the component splits on a full stop:
 * there was a single `GUARANTEE_INLINE` here and **nothing imported it**,
 * because the markup needed the halves separately and retyped them instead. An
 * unused export in the file whose whole job is to be the single source is
 * worse than no export — the next edit changes it and no surface moves.
 */
export const GUARANTEE_INLINE_CLAIM = `${formatPrice(PLAN_PRICE)} today, and nothing after it.`;
export const GUARANTEE_INLINE_BODY = `No auto-renewal, no subscription, no second charge in ${PLAN_WEEKS} weeks.`;

/** The body of the full guarantee card. */
export const GUARANTEE_BODY = `${formatPrice(PLAN_PRICE)} is all you pay, and it buys the full ${PLAN_WEEKS} weeks. We don't keep your card for a future charge, there's no subscription to cancel, and nothing happens in ${PLAN_WEEKS} weeks unless you decide it does.`;

/**
 * What happens at the end — the answer to the one question the paywall's
 * headline raises and nothing else on the page answers: **what happens after
 * week {@link PLAN_WEEKS}?**
 *
 * Under the subscription plans this said the plan rebuilds itself and the next
 * block starts. It does not any more, and **saying so is not optional**: the
 * headline promises her outcome "{@link PLAN_WEEKS} weeks from now", so a
 * screen that left the ending unstated would be selling an open-ended product
 * she has not bought. A woman who discovers on day 57 that access has stopped,
 * having never been told, is a chargeback and a one-star review.
 *
 * It stays **disclosure, not a pitch**: small, centred and muted, below the
 * price and below Week 1. A comprehension task never goes in front of a
 * decision — it sat directly above the price until 2026-09-08 and was the last
 * thing she read before the number.
 */
export const PLAN_BLOCKS_COPY = `Your ${PLAN_WEEKS} weeks start the day you join and run for ${PLAN_ACCESS_DAYS} days. There's no subscription and no auto-renewal, so when the ${PLAN_WEEKS} weeks are up your access simply ends — unless you choose to come back for another block.`;

/**
 * Stripe Checkout `custom_text.submit`. Opens on {@link PRICE_LINE} verbatim so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same sentence.
 */
export const CHECKOUT_SUBMIT_TEXT = `${PRICE_LINE} ${NO_RENEWAL_COPY}`;

export function isPlanId(value: unknown): value is PlanId {
  return value === PLAN_ID;
}

/**
 * `Sep 11` — or `Jan 3, 2027` once the year turns, so a December date never
 * reads as already past. US format: the campaign is US-only.
 */
export function formatChargeDate(d: Date, now: Date = new Date()): string {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
