/**
 * Meta Pixel / Conversions API constants shared by client and server.
 *
 * ## The event set, and why it is this short
 *
 * Five events, all of them Meta *standard* events:
 *
 * | Event             | Browser | CAPI | Fires on                        |
 * |-------------------|---------|------|---------------------------------|
 * | `PageView`        | yes     | -    | every route                     |
 * | `Lead`            | -       | yes  | `user_profiles` insert          |
 * | `ViewContent`     | yes     | yes  | paywall mount ($59)             |
 * | `InitiateCheckout`| yes     | yes  | paywall CTA ($59)               |
 * | `Purchase`        | yes     | yes  | checkout completed — $0 on a trial, $59 for a returning customer |
 * | `Subscribe`       | -       | yes  | the trial's first paid invoice ($59) |
 *
 * `Purchase` fires when the free trial starts (lib/pricing.ts `TRIAL_DAYS`),
 * not when the $59 is collected a week later. That is a deliberate trade: the
 * live ad set optimises on Purchase, and moving the event to the first paid
 * invoice (or renaming it `StartTrial`) means a new ad set and a fresh
 * learning phase. Two rules keep it honest:
 *
 * 1. **Value is what moved.** A trial checkout reports `value: 0`; only a
 *    returning customer's $59-today checkout reports 59. Reporting the plan
 *    price on a saved card inflates Meta's revenue by the trial-cancel rate
 *    and is a lie the moment anyone value-optimises or audits the account.
 *    Once the trial → paid rate is known, `TRIAL_PURCHASE_VALUE` can become
 *    the expected value per trial (rate × PLAN_PRICE) — one constant, here.
 * 2. **Once per customer.** Nothing fires `Purchase` on the trial-end charge. The
 *    real money is `Subscribe` (a standard event, server-only, value 59) so a
 *    clean "money moved" signal exists to build a future ad set on, without
 *    the same click reporting two conversions a week apart.
 *
 * See "The free trial" in CLAUDE.md.
 *
 * Seven custom funnel events - `QuizStart`, `QuizStep`, `QuizComplete`,
 * `ResultsView`, `PlanView`, `PlanScrollDepth`, `ReliefDone` - were removed on
 * 2026-08-17, before the first campaign went live. They were good product
 * instrumentation and bad ad instrumentation, for three reasons:
 *
 * 1. **Aggregated Event Measurement caps a domain at 8 prioritized events.**
 *    Twelve events meant iOS traffic silently reported only the top 8, and any
 *    custom event ranked above `Purchase` cost real, attributable conversions.
 *    Five leaves headroom and makes the ranking obvious.
 * 2. **A custom event is invisible until someone defines a Custom Conversion
 *    for it**, and a Custom Conversion cannot be an optimization target as
 *    cheaply as a standard event can - standard events are what delivery,
 *    Advantage+ and the conversion-value rules are built around.
 * 3. **Only the five above can be spent against.** Per-question drop-off and
 *    scroll depth answer "which screen leaks", which is a product question with
 *    a product-analytics answer; routing it through the ad pixel bought noise in
 *    Events Manager and nothing in the auction.
 *
 * Do not re-add a custom event without deciding, first, which of the eight AEM
 * slots it takes and from whom. If the funnel screens need measuring again, they
 * need an analytics tool, not this file.
 *
 * ## Naming
 *
 * Names live here rather than inline because a typo doesn't fail - it silently
 * creates a new event in Events Manager and splits the funnel in half.
 *
 * ## Deduplication
 *
 * `ViewContent`, `InitiateCheckout` and `Purchase` are each reported twice -
 * once from the browser, once server-side - so they survive Safari ITP, ad
 * blockers, and users who close the tab before the redirect. Meta collapses the
 * pair on matching (event_name, event_id), so both sides must carry the same id.
 * Three events, three ways of agreeing on one:
 *
 * - `Purchase` derives it from the Stripe Checkout Session (`purchaseEventId`),
 *   which both sides can see independently.
 * - `InitiateCheckout` has no shared identifier, so the browser mints one
 *   (`newInitiateCheckoutEventId`) and hands it to `create-checkout` in the
 *   request body - the two copies are the same HTTP round trip.
 * - `ViewContent` derives it from the Supabase user id (`viewContentEventId`),
 *   so neither side has to tell the other anything. See that function for why
 *   that matters more than it looks.
 *
 * `Lead` is the odd one out: server-only, with an id that exists purely so a
 * retried save-quiz collapses to one event.
 */

import { PLAN_PRICE } from "@/lib/pricing";

/**
 * The dataset every event in the app lands in - `fbq('init')` in the browser and
 * the Graph API path the Conversions API POSTs to.
 *
 * `?? ` alone was not enough. A Vercel env var that exists but was left blank is
 * the empty STRING, which `??` happily accepts, and an empty pixel id means
 * `fbq('init', '')` plus a CAPI POST to `graph.facebook.com/v21.0//events` -
 * every event in the funnel silently discarded, with nothing in any log to say
 * so. (Same trap as `customer_email: ""` in create-checkout.) Trim first, so a
 * blank var falls through to the literal below rather than half-configuring us.
 */
export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "7118800424899365";

export const META_CURRENCY = "USD";

/**
 * Reported conversion value, in USD.
 *
 * There is one plan and no free trial, so the reported value is money actually
 * collected at checkout - Events Manager and Stripe should agree. (Before the
 * $59/8-week plan, annual was reported at its full $79 while the 3-day trial
 * charged $0, which made ad revenue run ahead of collected revenue by the
 * trial-cancel rate. That gap is gone.)
 *
 * Renewals are deliberately *not* reported: Purchase fires from
 * checkout.session.completed only, so Meta optimizes for new customers rather
 * than being fed a second conversion every 8 weeks for someone it already won.
 *
 * With the free trial this is the value of a *returning* customer's checkout
 * and of `Subscribe`; a trial checkout reports `TRIAL_PURCHASE_VALUE`.
 * Reconcile the Purchase count against `/admin`'s "free trials started", and
 * Subscribe against charges.
 */
export const PLAN_VALUE = PLAN_PRICE;

/**
 * `value` on the Purchase a free-trial checkout reports. Zero, because zero
 * was collected. Raise it to the expected value per trial (trial → paid rate
 * × PLAN_PRICE) once `/admin` can state that rate — never to PLAN_PRICE.
 */
export const TRIAL_PURCHASE_VALUE = 0;

/**
 * Event id for the `Subscribe` reported off a trial's first paid invoice.
 * Server-only — there is no browser copy — so the id exists so a retried
 * `invoice.payment_succeeded` collapses to one event inside Meta's window.
 */
export function subscribeEventId(stripeInvoiceId: string): string {
  return `subscribe_${stripeInvoiceId}`;
}

/** Dedup key linking the browser Purchase to the Conversions API Purchase. */
export function purchaseEventId(stripeSessionId: string): string {
  return `purchase_${stripeSessionId}`;
}

/**
 * Dedup key for the server-side Lead, derived from the Supabase user id.
 *
 * There is no browser copy to pair with - Lead is server-only (see
 * `sendMetaLead`). The id exists so that a retried or double-submitted
 * save-quiz collapses to one Lead inside Meta's dedup window instead of
 * reporting the same woman twice.
 */
export function leadEventId(userId: string): string {
  return `lead_${userId}`;
}

/**
 * Dedup key for `ViewContent`, derived from the Supabase user id.
 *
 * Both copies compute it from the same id rather than one side minting it and
 * shipping it to the other, which is what `InitiateCheckout` has to do. That is
 * not a stylistic difference - it is the whole security model of the beacon:
 * `/api/paywall-view` takes **no body at all**, so there is nothing for a caller
 * to forge. An endpoint that accepted an event_id (or a value, or an event name)
 * would be a way for anyone holding a session to inject arbitrary conversions
 * into the dataset.
 *
 * It also has a second, useful effect. Meta collapses same-name/same-id events
 * inside a 48-hour window, so this id is what makes ViewContent count **women
 * rather than page views**: she can bounce back from Stripe, hit Back into the
 * relief screen and return, or reopen the funnel in a second tab, and all of it
 * still reports one ViewContent. Before this, the browser fired on every mount
 * of `<PaywallView />` - it was running about 3x the number of Leads, which made
 * the paywall-to-checkout rate unreadable.
 *
 * The 48h window is the deliberate limit of that: a genuine return visit days
 * later reports a second view, which is right - that is a second decision.
 */
export function viewContentEventId(userId: string): string {
  return `vc_${userId}`;
}

/**
 * Longest event_id `create-checkout` will accept from a client. Meta's own limit
 * is far higher; this exists so a malformed body can't push junk into the
 * Conversions API payload.
 */
export const META_EVENT_ID_MAX_LEN = 100;

/** Mints the id both InitiateCheckout copies dedup on. Browser-side. */
export function newInitiateCheckoutEventId(): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `ic_${rand}`;
}

/** Shape check for an event_id arriving over the wire. */
export function isValidMetaEventId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= META_EVENT_ID_MAX_LEN &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}
