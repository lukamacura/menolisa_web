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
 * How long the paywall shows the discounted price before the card reverts to
 * {@link PLAN_ANCHOR_PRICE}.
 *
 * **Display only, in one direction.** Stripe has exactly one price
 * (`STRIPE_PRICE_8WEEK`, {@link PLAN_PRICE}) and charges it whenever a checkout
 * session is created. Expiry changes every figure the paywall *shows* — the CTA
 * included — and nothing about what she is billed: she pays {@link PLAN_PRICE}
 * whether the clock ran out or not.
 *
 * The single rule that makes that safe: **the page may understate what she pays
 * and must never overstate it.** Every displayed figure is >= the charge, so the
 * worst case is a woman who expected $118 being charged $59. Reverse that — a
 * second Stripe Price billed when the client-side timer says expired — and a
 * user's own system clock decides whether she pays double for the same product.
 * If expiry should ever really change the price, the deadline moves server-side
 * and the charge is derived there.
 *
 * The full reasoning, and what must not be "fixed", is at the bottom of
 * `components/PaywallView.tsx`.
 *
 * **Thirty minutes, not ten (2026-08-30).** Ten was long enough to decide and
 * far too short to *read*. The paywall is ~2000px — headline, finish board,
 * price card, the included list with three screenshots, the trust grid, the
 * guarantee, a testimonial and three outcome cards — and it is read on a phone,
 * in an in-app browser, by a woman in her fifties deciding on $59. She routinely
 * spent longer than the window on the page, and what she got for reading
 * carefully was the displayed price doubling to {@link PLAN_ANCHOR_PRICE} and a
 * CTA quoting $2.11/day. The considered reader is the buyer; the clock was
 * punishing her specifically.
 *
 * The return-from-Stripe path made it worse. The deadline is persisted in
 * `sessionStorage`, so a woman who tapped through to the card form, hesitated,
 * and came back found the price had doubled at the exact moment she was closest
 * to paying.
 *
 * An expired countdown converts at roughly nothing, so the risk here is
 * one-sided: thirty minutes gives up a sliver of urgency and removes the state
 * that was costing whole sales. Do not lower it back without measuring how long
 * the paywall actually takes to read.
 */
export const PLAN_DISCOUNT_WINDOW_MINUTES = 30;
export const PLAN_DISCOUNT_WINDOW_MS = PLAN_DISCOUNT_WINDOW_MINUTES * 60 * 1000;

/**
 * How many days before a renewal we email her — and, because the paywall says so
 * at the price, a promise made before she pays.
 *
 * Three, not one. The week-8 charge is the single most disputable moment in the
 * product: it lands exactly when she is least certain the plan worked, and a
 * day's warning is not enough time to act on. Three days is also the floor
 * several US auto-renewal statutes set, California's ARL among them.
 *
 * Read by `/api/cron/renewal-notices` (the send window) and by the paywall (the
 * promise), so both move together. This is the only scheduled email left in the
 * product — see `scripts/sql/2026-08-12-drop-email-sequences.sql`.
 */
export const RENEWAL_NOTICE_DAYS = 3;

export function isPlanId(value: unknown): value is PlanId {
  return value === PLAN_ID;
}

/** `59` → `"$59"`, `29.5` → `"$29.50"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/** Per-day cost, for "about a dollar a day" framing. */
export const PLAN_PRICE_PER_DAY = PLAN_PRICE / (PLAN_WEEKS * 7);

/** Per-day cost of the strikethrough anchor, for the same framing once the discount expires. */
export const PLAN_ANCHOR_PRICE_PER_DAY = PLAN_ANCHOR_PRICE / (PLAN_WEEKS * 7);

/** Per-week cost, for "less than a coffee a week" framing. */
export const PLAN_PRICE_PER_WEEK = PLAN_PRICE / PLAN_WEEKS;
