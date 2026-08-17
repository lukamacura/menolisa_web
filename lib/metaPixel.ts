/**
 * Meta Pixel / Conversions API constants shared by client and server.
 *
 * Purchase is reported twice - once from the browser pixel on the post-checkout
 * landing, once server-side from the Stripe webhook - so it survives Safari ITP,
 * ad blockers, and users who close the tab before the success redirect. Meta
 * collapses the pair on matching (event_name, event_id), which is why both sides
 * must derive the id the same way via `purchaseEventId`.
 */

import { PLAN_PRICE } from "@/lib/pricing";

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "7118800424899365";

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
 * Every step of the `/register` funnel, in the order she walks them.
 *
 * These are all custom events - each needs a Custom Conversion defined in
 * Events Manager before it can be optimized for or used to build an audience.
 *
 * **`Lead` is deliberately not in this list.** It is the one funnel event that
 * has to mean "a new woman", because it is the fallback optimization objective
 * while Purchase volume is below learning-phase exit - so it is sent
 * server-side from `/api/auth/save-quiz` on profile insert instead, where the
 * database already knows whether this account has finished the quiz before.
 * See `sendMetaLead`.
 *
 * `onceKey` is the sessionStorage key `trackFbOnce` dedups on, so a refresh or a
 * StrictMode double-effect can't inflate a step. Note what that dedup actually
 * buys: "once per tab", not once per person - a returning ad click in a fresh
 * tab reports these again, which is right for a visit-scoped event and was
 * wrong for Lead.
 *
 * Names live here rather than inline because a typo doesn't fail - it silently
 * creates a new event in Events Manager and splits the funnel in half.
 *
 * **The four screens between `QuizComplete` and the paywall used to be
 * unmeasured.** `ViewContent` fires on paywall mount and nothing fired before
 * it, so results / plan / relief were a black box: there was no way to tell
 * whether the post-quiz sequence leaked 20% or 70%, and therefore no way to
 * rank a fix against any other. Every screen that can lose her now reports.
 */
export const META_FUNNEL_STEPS = {
  quizStart: { name: "QuizStart", onceKey: "quiz_start" },
  quizComplete: { name: "QuizComplete", onceKey: "quiz_complete" },
  resultsView: { name: "ResultsView", onceKey: "results_view" },
  planView: { name: "PlanView", onceKey: "plan_view" },
  reliefDone: { name: "ReliefDone", onceKey: "relief_done" },
  checklistDone: { name: "ChecklistDone", onceKey: "checklist_done" },
} as const;

export type MetaFunnelStep = (typeof META_FUNNEL_STEPS)[keyof typeof META_FUNNEL_STEPS];

/**
 * Per-question drop-off, as one event name with a `step_index` parameter.
 *
 * A separate event per question would be 13 Custom Conversions to define and a
 * chart nobody reads; one event broken down by parameter is a drop curve in a
 * single Events Manager view. The dedup key carries the index, so each question
 * reports once per session but moving forward through the quiz reports every
 * step - going *back* and forward again does not double-count.
 */
export const META_QUIZ_STEP_EVENT = "QuizStep";

export function quizStepOnceKey(index: number): string {
  return `quiz_step_${index}`;
}

/**
 * How deep she scrolled the plan screen, bucketed. The longest scroll in the
 * funnel: without this, "she saw the plan" and "she reached the CTA" are the
 * same number. Buckets rather than raw percentages so the breakdown has four
 * rows instead of a hundred.
 *
 * Both long scrolls in the funnel report through this one event, separated by a
 * `screen` parameter, so Events Manager needs one Custom Conversion broken down
 * two ways (`screen` × `depth`) rather than one per screen. The name is legacy
 * — it covered only the plan screen for a day — and is kept because renaming it
 * would silently orphan the Custom Conversion already defined against it.
 *
 * The results screen is the more important of the two: it is four stacked cards
 * ending on "your 8-week plan is ready", which is the block that closes the
 * promise the start screen made. Without a depth reading, "reached results" and
 * "saw the plan exists" were the same number.
 */
export const META_SCROLL_EVENT = "PlanScrollDepth";
export const META_SCROLL_BUCKETS = [25, 50, 75, 100] as const;

/** Which long scroll reported. Sent as the `screen` param on every bucket. */
export type MetaScrollScreen = "results" | "plan";

export function scrollDepthOnceKey(screen: MetaScrollScreen, bucket: number): string {
  return `${screen}_scroll_${bucket}`;
}
