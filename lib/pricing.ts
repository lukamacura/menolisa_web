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
 * There is no money-back guarantee, and there was one until 2026-09-09.
 *
 * It was a 5-day full refund, demoted to a footnote on
 * 2026-09-08 and removed the next day. At {@link FIRST_WEEK_PRICE} the only
 * charge it could ever reach was the dollar — the first renewal is billed on
 * day 7, after a 5-day window closes — so it promised a process for recovering
 * an amount nobody needs a process for, and it spent words introducing the
 * possibility of failure at the moment belief is highest.
 *
 * {@link CANCEL_BEFORE_RENEWAL_COPY} is the whole risk reversal now: the dollar
 * is the entire downside and cancelling is the entire exit. **Do not re-add a
 * refund promise to a marketing surface without adding it back to Terms §11 in
 * the same commit** — a guarantee printed on the paywall and absent from the
 * Terms is a misrepresentation, and that coupling is why they moved together
 * both times.
 */

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

/**
 * The whole risk reversal, now that the refund is gone: cancelling is what
 * protects the {@link WEEKLY_PRICE}, and it is free and instant. Printed on
 * every surface that states the offer.
 */
export const CANCEL_BEFORE_RENEWAL_COPY = `Cancel before week 2 and you are never charged again.`;

/** The line under the price, on the paywall. */
export const PRICE_SUBLINE = `Cancel anytime from the app — ${CANCEL_BEFORE_RENEWAL_COPY[0].toLowerCase()}${CANCEL_BEFORE_RENEWAL_COPY.slice(1)}`;

/**
 * ── The guarantee, as she experiences it ──────────────────────────────────
 *
 * The risk reversal led on a "5-day money-back guarantee" until 2026-09-08,
 * became the dollar with the refund as a footnote that day, and lost the
 * footnote on 2026-09-09. What is left is the only thing that was ever load
 * bearing at this price: {@link FIRST_WEEK_PRICE} is the entire downside, and
 * cancelling in two taps is the entire exit.
 *
 * A refund clause asks her to imagine emailing us and to picture the product
 * failing, at the moment belief is highest, over an amount she does not need a
 * process to recover. Cancelling asks her to imagine two taps. If a refund
 * promise ever comes back here, Terms §11 changes in the same commit — see the
 * block above {@link CANCEL_BEFORE_RENEWAL_COPY}.
 */
export const GUARANTEE_HEADLINE = `Try MenoLisa for ${formatPrice(FIRST_WEEK_PRICE)}`;

/** One line, for the row inside the price card. */
export const GUARANTEE_INLINE = `Try it for ${formatPrice(FIRST_WEEK_PRICE)}. Don't like it? Just cancel — you're never charged again.`;

/** The body of the full guarantee card. */
export const GUARANTEE_BODY = `That's all you risk. If it's not for you, cancel in two taps from the app before week 2 and you are never charged again. No email, no phone call, no questions.`;

/**
 * What the subscription actually is - and, since 2026-09-09, the answer to the
 * one question the paywall's own headline raises and nothing on the page
 * answered: **what happens after week ${PLAN_WEEKS}?**
 *
 * The headline promises her outcome "${PLAN_WEEKS} weeks from now" and the
 * price renews weekly forever, so the screen was selling a finish line on a
 * subscription with no end - and the honest answer sat behind the phrase "runs
 * in ${PLAN_WEEKS}-week blocks", which is our word for it, not hers. It names
 * the week now, says the plan does not stop, and says the price does not move,
 * because the unspoken half of the question is whether week 9 costs more.
 *
 * It stays **disclosure, not a pitch**: small, centred and muted, below the
 * price and below Week 1. It sat directly above the price until 2026-09-08 -
 * the densest sentence on the screen, read last before the number - and a
 * comprehension task never goes in front of a decision. Answering a question
 * she has not asked yet, in the largest type available, is the same mistake in
 * the other direction.
 */
export const PLAN_BLOCKS_COPY = `Your plan doesn't stop at week ${PLAN_WEEKS}. MenoLisa rebuilds it from your progress and your new symptom scores, and the next ${PLAN_WEEKS} weeks start - still ${formatPrice(WEEKLY_PRICE)}/week, cancel anytime from the app.`;

/**
 * Stripe Checkout `custom_text.submit`. Opens on {@link PRICE_LINE} verbatim so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same sentence.
 */
export const CHECKOUT_SUBMIT_TEXT = `${PRICE_LINE} Cancel anytime from the app.`;

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
