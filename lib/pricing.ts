/**
 * The single paid plan, in one place.
 *
 * MenoLisa sells one thing: a personalized 8-week plan for $59, billed as a
 * subscription that renews every 8 weeks (Stripe `interval: week`,
 * `interval_count: 8`). There is no billing-period choice. The card is saved
 * at checkout and first charged {@link TRIAL_DAYS} days later.
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

/** Billing period length. Also the length of the plan. */
export const PLAN_WEEKS = 8;

// There is no outcome or adherence refund guarantee any more (2026-09-04). The
// "100% guarantee" on the paywall *is* the free trial: try it, cancel before
// the first charge, pay nothing. `PLAN_ADHERENCE_PCT` (90) and Terms §12's
// adherence maths went with it; the only refund promise left is Terms §11.

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
 * How many days before a charge we email her — and, because the paywall says so
 * at the price, a promise made before she pays.
 *
 * **Two constants, not one (2026-09-04).** One covered both charges and was cut
 * 3 → 2 so the notice would still land inside a five-day trial. That silently
 * shortened the warning on the {@link PLAN_WEEKS}-week {@link PLAN_PRICE}
 * renewal too, which never needed shortening: the renewal notice is the
 * cheapest chargeback insurance in the product, and two days' warning on a $59
 * auto-renewal to a woman who last thought about us eight weeks ago is thin.
 * The trial's constraint is real but it belongs only to the trial.
 *
 * {@link TRIAL_NOTICE_DAYS} must be shorter than {@link TRIAL_DAYS} (asserted
 * below). {@link RENEWAL_NOTICE_DAYS} has no such ceiling — an 8-week period is
 * far longer than any notice — so it is free to be the longer, safer number.
 *
 * Both are read by `/api/cron/renewal-notices` (which picks per row, since a
 * trialing row and a renewing row are the same shape), the paywall, the emails,
 * the in-app alerts, the Terms and the Privacy policy. Every surface derives;
 * never type either number into copy.
 */
export const RENEWAL_NOTICE_DAYS = 3;

/**
 * Days before the free trial's first charge that we email and alert her.
 *
 * Must stay under {@link TRIAL_DAYS} or the promise on the paywall ("we email
 * you N days before your first charge") is false for trial customers — the
 * notice would be scheduled for a day that arrives after the money has already
 * moved. At 2 against a 5-day trial it lands on day 3.
 */
export const TRIAL_NOTICE_DAYS = 2;

/**
 * The free trial (2026-09-04). Card up front, nothing charged for
 * {@link TRIAL_DAYS} days, then {@link PLAN_PRICE} for the first
 * {@link PLAN_WEEKS}-week period and every one after it.
 *
 * Length lives here and nowhere else: Stripe's `trial_period_days`, the paywall
 * copy, the welcome email, the Terms and the admin conversion cohort all derive
 * from it. Copy says "free trial" and prints this number — never "free week",
 * which was true for one day (it shipped at 7 and became 5 on 2026-09-04).
 * The trial is *not* a state `getAccountState()` knows about — a trialing
 * subscription is `paid` with `subscription_ends_at = trial_end`, so
 * `subscription_ends_at` stays the only access boundary and the mobile app sees
 * an ordinary subscriber with {@link TRIAL_DAYS} days left.
 */
export const TRIAL_DAYS = 5;

/**
 * What was sold, stamped on the Checkout Session and the subscription so every
 * downstream reader (webhook, success screen, /admin) knows without a second
 * lookup. `paid_upfront` is the returning customer — one free trial per person
 * — and every session created before 2026-09-04 carries neither.
 *
 * The trial id does not encode the length on purpose: it is persisted on
 * `user_trials.offer_variant`, Stripe metadata and the success URL, so a
 * length change must not re-key it. `trial7_free` is what the first day's
 * sessions carry; read both through {@link isTrialOffer}, never by `===`.
 */
export const OFFER_VARIANT_TRIAL = "trial_free" as const;
export const OFFER_VARIANT_PAID = "paid_upfront" as const;
export type OfferVariant = typeof OFFER_VARIANT_TRIAL | typeof OFFER_VARIANT_PAID;

/** The id the 2026-09-04 seven-day sessions were stamped with. Read-only. */
const LEGACY_OFFER_VARIANT_TRIAL = "trial7_free";

/** Whether an `offer_variant` (row, metadata or `?offer=`) sold a free trial. */
export function isTrialOffer(value: unknown): boolean {
  return value === OFFER_VARIANT_TRIAL || value === LEGACY_OFFER_VARIANT_TRIAL;
}

// The notice has to land *inside* the trial or the promise on the paywall
// ("we email you N days before your first charge") is false for trial customers.
// Only the trial has this ceiling; RENEWAL_NOTICE_DAYS is bounded by the 8-week
// period, which no plausible notice length can exceed.
if (TRIAL_NOTICE_DAYS >= TRIAL_DAYS) {
  throw new Error(
    `TRIAL_NOTICE_DAYS (${TRIAL_NOTICE_DAYS}) must be shorter than TRIAL_DAYS (${TRIAL_DAYS})`
  );
}

/** When a trial that starts at `from` first charges. */
export function trialEndDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}

/**
 * `Sep 11` — or `Jan 3, 2027` once the year turns, so a December trial never
 * names a date that reads as already past. US format: the campaign is US-only.
 */
export function formatChargeDate(d: Date, now: Date = new Date()): string {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

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
