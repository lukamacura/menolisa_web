/**
 * Meta Pixel / Conversions API constants shared by client and server.
 *
 * Purchase is reported twice - once from the browser pixel on the post-checkout
 * landing, once server-side from the Stripe webhook - so it survives Safari ITP,
 * ad blockers, and users who close the tab before the success redirect. Meta
 * collapses the pair on matching (event_name, event_id), which is why both sides
 * must derive the id the same way via `purchaseEventId`.
 */

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "7118800424899365";

export const META_CURRENCY = "USD";

export type MetaPlan = "annual" | "monthly";

/**
 * Reported conversion value per plan, in USD.
 *
 * Annual is reported at its full $79 even though the 3-day trial charges $0 at
 * checkout - a deliberate choice to give Meta's optimizer enough Purchase volume
 * to learn on. Reported ad revenue therefore runs ahead of collected revenue by
 * the trial-cancel rate; reconcile in Stripe, not Events Manager.
 */
export const PLAN_VALUE: Record<MetaPlan, number> = {
  annual: 79,
  monthly: 12,
};

export function isMetaPlan(value: unknown): value is MetaPlan {
  return value === "annual" || value === "monthly";
}

/** Dedup key linking the browser Purchase to the Conversions API Purchase. */
export function purchaseEventId(stripeSessionId: string): string {
  return `purchase_${stripeSessionId}`;
}

/**
 * Top-of-funnel steps, fired from the `/register` quiz.
 *
 * `QuizStart` and `QuizComplete` are custom events - each needs a Custom
 * Conversion defined in Events Manager before it can be optimized for or used to
 * build an audience. `Lead` is a Meta standard event and needs no setup, which is
 * why the email-verified step uses it: while Purchase volume is too low to exit
 * the learning phase, Lead is the fallback optimization objective.
 *
 * `onceKey` is the sessionStorage key `trackFbOnce` dedups on, so a refresh or a
 * StrictMode double-effect can't inflate a step.
 *
 * Names live here rather than inline because a typo doesn't fail - it silently
 * creates a new event in Events Manager and splits the funnel in half.
 */
export const META_FUNNEL_STEPS = {
  quizStart: { name: "QuizStart", onceKey: "quiz_start" },
  quizComplete: { name: "QuizComplete", onceKey: "quiz_complete" },
  lead: { name: "Lead", onceKey: "lead" },
} as const;

export type MetaFunnelStep = (typeof META_FUNNEL_STEPS)[keyof typeof META_FUNNEL_STEPS];
