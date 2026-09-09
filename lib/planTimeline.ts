/**
 * Her plan as a stretch of calendar, shared by the /register diagnosis screen
 * and the paywall.
 *
 * "8 weeks" is an abstraction; "Sunday, October 4" is a date she can picture.
 * Everything here is arithmetic on a start date plus copy she chose herself —
 * no projected metric. The diagnosis score deliberately does not appear: it is
 * a fear device for the results screen, and reusing it as a promised outcome at
 * the payment moment would be laundering it into something it was never
 * measured to be.
 */
import { PLAN_WEEKS } from "@/lib/pricing";

/** Length of the plan in days — also the denominator behind PLAN_PRICE_PER_DAY. */
export const PLAN_DAYS = PLAN_WEEKS * 7;

/**
 * Her #1 goal as a second-person outcome phrase, used to build the personalized
 * promise ("{outcome} in 8 weeks") and the far end of the paywall's finish line.
 * This is the spine of the offer — the emotional finish line she picked.
 */
export const GOAL_PROMISE: Record<string, string> = {
  sleep_through_night: "Sleep through the night",
  think_clearly: "Think clearly again",
  feel_like_myself: "Feel calm and steady again",
  understand_patterns: "Understand your body", // legacy: retired option
  data_for_doctor: "Walk into your doctor with real answers",
  get_body_back: "Lose the weight",
};

export function getOfferPromise(goals: string[]): string {
  return GOAL_PROMISE[goals[0]] ?? "Feel like yourself again";
}

/**
 * The same promise as a headline: her outcome with the trailing "again"
 * dropped, so it can carry a full stop and a timeframe after it
 * ("Feel calm and steady. 8 weeks from now.").
 *
 * "again" is right mid-sentence and wrong as the last word before a period —
 * it looks back at a state she has lost, and a headline over a plan has to
 * point forward at the date it finishes.
 */
export function getOutcomeHeadline(goals: string[]): string {
  return getOfferPromise(goals).replace(/\s+again$/i, "");
}

/** The day her plan ends: `start` + the full {@link PLAN_DAYS}. */
export function planFinishDate(start: Date): Date {
  const finish = new Date(start);
  finish.setDate(finish.getDate() + PLAN_DAYS);
  return finish;
}

/**
 * `"Aug 9"`, or `"Sun, Oct 4"` with the weekday. Pinned to en-US rather than the
 * visitor's locale so the two ends of the finish line always read as a matched
 * pair, and so the string matches the rest of the funnel's copy.
 *
 * Timezone-dependent by nature — render the result only after hydration, or the
 * server (UTC) and a visitor west of it will disagree about what "today" is.
 */
export function formatPlanDate(date: Date, withWeekday = false): string {
  return date.toLocaleDateString(
    "en-US",
    withWeekday
      ? { weekday: "short", month: "short", day: "numeric" }
      : { month: "short", day: "numeric" }
  );
}
