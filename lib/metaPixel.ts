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
 * | `ViewContent`     | yes     | -    | paywall mount ($59)             |
 * | `InitiateCheckout`| yes     | yes  | paywall CTA ($59)               |
 * | `Purchase`        | yes     | yes  | checkout completed ($59)        |
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
 * `InitiateCheckout` and `Purchase` are each reported twice - once from the
 * browser, once server-side - so they survive Safari ITP, ad blockers, and users
 * who close the tab before the redirect. Meta collapses the pair on matching
 * (event_name, event_id), so both sides must carry the same id. `Purchase`
 * derives it from the Stripe Checkout Session (`purchaseEventId`); the two
 * `InitiateCheckout` copies are the same HTTP round trip, so the browser mints
 * the id and hands it to `create-checkout` in the request body.
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
 */
export const PLAN_VALUE = PLAN_PRICE;

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
