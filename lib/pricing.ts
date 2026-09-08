/**
 * The single paid plan, in one place.
 *
 * MenoLisa sells one thing: a personalized 8-week plan, billed **weekly** —
 * {@link FIRST_WEEK_PRICE} for the first week, then {@link WEEKLY_PRICE} every
 * week until she cancels (2026-09-08). The plan itself still runs in
 * {@link PLAN_WEEKS}-week blocks; at the end of each block it is rebuilt from
 * her progress. Billing and plan length are two different numbers now and
 * nothing here conflates them.
 *
 * Every price shown to a user, and every value reported to Meta, derives from
 * the constants here. Hardcoding a dollar figure in a component is how the
 * paywall and the Stripe invoice drift apart. **The paywall's price line has
 * to match Stripe Checkout's custom text word for word** — both are built
 * from {@link PRICE_LINE} / {@link CHECKOUT_SUBMIT_TEXT} below.
 *
 * Stripe side (`scripts/stripe-weekly-price.ts` creates all of it):
 *   - Price: $4.99 USD, recurring, weekly → `STRIPE_PRICE_WEEKLY`.
 *   - Coupon {@link FIRST_WEEK_COUPON_ID}: $3.99 off, once — applied by
 *     `create-checkout` on every session, so the first invoice is $1.00.
 *   - No trial, no promo-code box.
 */

/** Wire value for `plan` in POST /api/stripe/create-checkout and in Meta events. */
export const PLAN_ID = "plan8w" as const;
export type PlanId = typeof PLAN_ID;

/** Charged every week after the first, in USD. Must match STRIPE_PRICE_WEEKLY. */
export const WEEKLY_PRICE = 4.99;

/** Off the first invoice, once. Must match the Stripe coupon below. */
export const FIRST_WEEK_DISCOUNT = 3.99;

/** What she pays today: the weekly price less the one-time coupon. */
export const FIRST_WEEK_PRICE = Math.round((WEEKLY_PRICE - FIRST_WEEK_DISCOUNT) * 100) / 100;

/**
 * The Stripe coupon that makes the first week $1. Same id in test and live
 * mode — the script creates it with this id when it is missing, so the code
 * never has to know which mode it is running in.
 */
export const FIRST_WEEK_COUPON_ID = "OuChKp3c";

/** Length of one plan block. The plan is rebuilt at the end of each. */
export const PLAN_WEEKS = 8;

/** Full refund of everything paid, no reason required, this many days from the first charge. Terms §11. */
export const MONEY_BACK_DAYS = 14;

/** `59` → `"$59"`, `4.99` → `"$4.99"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * The offer, in the words the paywall and Stripe Checkout both use. One string,
 * two surfaces. Change it here or it is no longer true that they match.
 */
export const PRICE_LINE = `Start your ${PLAN_WEEKS}-week plan — ${formatPrice(FIRST_WEEK_PRICE)} for the first week, then ${formatPrice(WEEKLY_PRICE)}/week.`;

/** The line under the price, on the paywall. */
export const PRICE_SUBLINE = `Cancel anytime. ${MONEY_BACK_DAYS}-day money-back guarantee.`;

/** The paragraph above the price: what the subscription actually is. */
export const PLAN_BLOCKS_COPY = `Your plan runs in ${PLAN_WEEKS}-week blocks. At the end of each block MenoLisa rebuilds it from your progress and new symptom scores. Cancel anytime from the app.`;

/** Stripe Checkout `custom_text.submit`. */
export const CHECKOUT_SUBMIT_TEXT = `First week ${formatPrice(FIRST_WEEK_PRICE)}, then ${formatPrice(WEEKLY_PRICE)}/week. Cancel anytime from the app. ${MONEY_BACK_DAYS}-day money-back guarantee.`;

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
