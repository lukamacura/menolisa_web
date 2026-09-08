/**
 * Constants shared by the browser (`lib/funnelClient.ts`, the paywall) and
 * the server (`lib/funnelEvents.ts`, the routes). No Node imports here — this
 * module is bundled into client components.
 */

/** Positions after the 22 funnel screens (`POST_QUIZ_BASE` 18 + five phases). Under the route's MAX_STEP_INDEX of 40. */
export const SERVER_FUNNEL_STEPS = {
  paywall_exit: 23,
  checkout_opened: 24,
  purchase_completed: 25,
  subscription_canceled: 26,
  payment_failed: 27,
} as const;
export type ServerFunnelStep = keyof typeof SERVER_FUNNEL_STEPS;

/** The one-tap exit question's answers. `skipped` is a tap on the close control. */
export const PAYWALL_EXIT_REASONS = [
  "too_expensive",
  "not_sure_helps",
  "see_plan_first",
  "dont_pay_for_apps",
  "skipped",
] as const;
export type PaywallExitReason = (typeof PAYWALL_EXIT_REASONS)[number];

export function isPaywallExitReason(v: unknown): v is PaywallExitReason {
  return typeof v === "string" && (PAYWALL_EXIT_REASONS as readonly string[]).includes(v);
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isFunnelSessionId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Stripe metadata keys `create-checkout` writes and the webhook reads back. */
export const FUNNEL_SESSION_METADATA_KEY = "funnel_session_id";
export const IS_TEST_METADATA_KEY = "is_test";
