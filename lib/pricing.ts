/**
 * The single paid plan, in one place.
 *
 * MenoLisa sells one thing: a personalized 8-week plan for $59, billed as a
 * subscription that renews every 8 weeks (Stripe `interval: week`,
 * `interval_count: 8`). There is no free trial and no billing-period choice —
 * the card is charged at checkout.
 *
 * Every price shown to a user, and every value reported to Meta, derives from
 * the constants here. Hardcoding $59 in a component is how the paywall and the
 * Stripe invoice drift apart.
 */

/** Wire value for `plan` in POST /api/stripe/create-checkout and in Meta events. */
export const PLAN_ID = "plan8w" as const;
export type PlanId = typeof PLAN_ID;

/** Charged at checkout and every renewal, in USD. Must match STRIPE_PRICE_8WEEK. */
export const PLAN_PRICE = 59;

/** Billing period length. Also the length of the plan and of the refund guarantee. */
export const PLAN_WEEKS = 8;

/**
 * Minimum share of plan tasks she must tick off to qualify for the refund
 * guarantee. The condition is what makes the promise affordable to honor: it
 * only pays out to someone who did the work and still didn't improve, not to
 * someone who never opened the app.
 *
 * It is checkable without asking her for anything - every tick is a row in
 * `user_plan_logs` (see POST /api/plan/complete), so adherence is derived from
 * data we already hold. Say so in the copy; a threshold she cannot see her own
 * progress against reads as a trap rather than a promise.
 */
export const PLAN_ADHERENCE_PCT = 90;

/**
 * Strikethrough anchor — the "regular" price the $59 is framed against, i.e. a
 * flat 50% off. Not a price anything is ever billed at; it exists only to make
 * the discount legible. Change it here and every surface follows.
 */
export const PLAN_ANCHOR_PRICE = PLAN_PRICE * 2;

/** How much off the anchor the offer is, e.g. `50` → "50% OFF". Derived, never typed into copy. */
export const PLAN_DISCOUNT_PCT = Math.round(
  (1 - PLAN_PRICE / PLAN_ANCHOR_PRICE) * 100
);

/**
 * How long the paywall holds the discounted price open before the card reverts
 * to {@link PLAN_ANCHOR_PRICE}.
 *
 * The countdown is a display device only — Stripe has exactly one price
 * (`STRIPE_PRICE_8WEEK`, {@link PLAN_PRICE}) and charges it whenever a checkout
 * session is created. So the expired paywall must never offer a checkout button
 * at the anchor price: it offers a one-tap "reclaim the discount" instead, which
 * reopens the window. That way the number on the button is always the number on
 * the invoice. If we ever want expiry to actually bill more, it needs a second
 * Stripe Price plus a server-side deadline — the client clock can't be trusted.
 */
export const PLAN_DISCOUNT_WINDOW_MINUTES = 10;
export const PLAN_DISCOUNT_WINDOW_MS = PLAN_DISCOUNT_WINDOW_MINUTES * 60 * 1000;

/**
 * Referral reward: 50% off one invoice, granted by the Stripe coupon in
 * STRIPE_REFERRAL_COUPON_ID. Displayed price only — the actual discount is
 * applied by Stripe, so this must stay in sync with that coupon's percent off.
 */
export const PLAN_PRICE_REFERRAL = PLAN_PRICE / 2;

export function isPlanId(value: unknown): value is PlanId {
  return value === PLAN_ID;
}

/** `59` → `"$59"`, `29.5` → `"$29.50"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/** Per-day cost, for "about a dollar a day" framing. */
export const PLAN_PRICE_PER_DAY = PLAN_PRICE / (PLAN_WEEKS * 7);

/** Per-week cost, for "less than a coffee a week" framing. */
export const PLAN_PRICE_PER_WEEK = PLAN_PRICE / PLAN_WEEKS;
