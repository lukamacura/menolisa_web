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

/**
 * Full refund of everything paid, no reason required, this many days from the
 * first charge. Terms §11.
 *
 * **At 5 days the window closes before week 2 is billed** (the first renewal is
 * day 7), so the only charge it can ever refund is the {@link FIRST_WEEK_PRICE}
 * first-week charge. That is why {@link CANCEL_BEFORE_RENEWAL_COPY} exists and
 * is printed beside the guarantee everywhere the guarantee appears: cancelling
 * is what protects the {@link WEEKLY_PRICE}, and it is the larger number. Copy
 * that leans on the refund alone overstates what the refund reaches.
 */
export const MONEY_BACK_DAYS = 5;

/** `59` → `"$59"`, `4.99` → `"$4.99"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * The offer, in the words the paywall and Stripe Checkout both use. One string,
 * two surfaces — {@link CHECKOUT_SUBMIT_TEXT} opens on this exact sentence.
 * Change it here or it is no longer true that they match.
 *
 * It used to open `Start your ${PLAN_WEEKS}-week plan — …`. The plan length is
 * what she *gets*; one week for ${formatPrice(FIRST_WEEK_PRICE)} is what she
 * *commits to*, and leading with the longer number made her price the whole
 * block (8 × ${formatPrice(WEEKLY_PRICE)}) before reading the first one.
 */
export const PRICE_LINE = `${formatPrice(FIRST_WEEK_PRICE)} for your first week, then ${formatPrice(WEEKLY_PRICE)}/week.`;

/** The line under the price, on the paywall. */
export const PRICE_SUBLINE = `Cancel anytime. ${MONEY_BACK_DAYS}-day money-back guarantee.`;

/**
 * What protects the {@link WEEKLY_PRICE}, as opposed to the refund window,
 * which only ever reaches the {@link FIRST_WEEK_PRICE} charge — see
 * {@link MONEY_BACK_DAYS}. Printed beside the guarantee on every surface that
 * states it, because it is the larger of the two reassurances and it is free.
 */
export const CANCEL_BEFORE_RENEWAL_COPY = `Cancel before week 2 and you are never charged again.`;

/**
 * ── The guarantee, as she experiences it ──────────────────────────────────
 *
 * The risk reversal led on "{@link MONEY_BACK_DAYS}-day money-back guarantee"
 * until 2026-09-08. That was the right headline when the charge was $59 and
 * the refund was the only thing standing between her and losing real money.
 * It is the wrong headline at {@link FIRST_WEEK_PRICE}, for two reasons that
 * point the same way:
 *
 *  - **The refund reaches almost nothing.** The window closes on day 5 and the
 *    first renewal is billed on day 7, so the only charge it can ever refund
 *    is the dollar. Leading on it promises a process for recovering an amount
 *    nobody needs a process for.
 *  - **A refund clause introduces the possibility of failure** at the moment
 *    belief is highest, and it asks her to imagine emailing us. "Cancel" asks
 *    her to imagine two taps. The dollar is the entire downside and cancelling
 *    is the entire exit — say that, and there is nothing left to reverse.
 *
 * So the headline is the dollar, the mechanism is cancelling, and the refund
 * survives as a footnote — which is proportionate to what it actually covers.
 * **The refund is not removed:** Terms §11 is a contract and the card has to
 * stay true to it (see "Legal pages" in CLAUDE.md §4). It is demoted, not cut.
 */
export const GUARANTEE_HEADLINE = `Try MenoLisa for ${formatPrice(FIRST_WEEK_PRICE)}`;

/** One line, for the row inside the price card. */
export const GUARANTEE_INLINE = `Try it for ${formatPrice(FIRST_WEEK_PRICE)}. Don't like it? Just cancel — you're never charged again.`;

/** The body of the full guarantee card. */
export const GUARANTEE_BODY = `That's all you risk. If it's not for you, cancel in two taps from the app before week 2 and you are never charged again. No email, no phone call, no questions.`;

/** The refund, in its proper place: underneath, in small type. */
export const REFUND_FOOTNOTE = `Want the dollar back too? Tell us within ${MONEY_BACK_DAYS} days and we refund everything you've paid. No reason needed.`;

/** The paragraph above the price: what the subscription actually is. */
export const PLAN_BLOCKS_COPY = `Your plan runs in ${PLAN_WEEKS}-week blocks. At the end of each block MenoLisa rebuilds it from your progress and new symptom scores. Cancel anytime from the app.`;

/**
 * Stripe Checkout `custom_text.submit`. Opens on {@link PRICE_LINE} verbatim so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same sentence.
 */
export const CHECKOUT_SUBMIT_TEXT = `${PRICE_LINE} Cancel anytime from the app. ${MONEY_BACK_DAYS}-day money-back guarantee.`;

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
