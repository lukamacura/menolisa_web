/**
 * Browser half of funnel measurement. Shared by `/register` (every screen), the
 * paywall (the exit question) and both checkout callers (the visit id that
 * lets the webhook key `purchase_completed` to this quiz walk).
 *
 * See `POST /api/funnel-step` for the payload rules and why the endpoint is
 * unauthenticated, and `lib/funnelEvents.ts` for the server-side rows.
 */
import type { PaywallExitReason } from "@/lib/funnelSteps";

const FUNNEL_SESSION_KEY = "menolisa:funnel-session";
const FUNNEL_QA_KEY = "menolisa:funnel-qa";

/**
 * A random id for this visit. Not an account and not a device id: it lives in
 * `sessionStorage`, so it dies with the tab and never links two visits.
 *
 * Returns null when storage or `randomUUID` is unavailable rather than falling
 * back to something weaker — a measurement that cannot identify a visit is not
 * worth a row, and in-app webviews are exactly where a half-working id would
 * quietly corrupt the drop-off curve this table exists to draw.
 */
export function funnelSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(FUNNEL_SESSION_KEY);
    if (existing) return existing;
    if (typeof crypto?.randomUUID !== "function") return null;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(FUNNEL_SESSION_KEY, id);
    return id;
  } catch {
    return null;
  }
}

/**
 * True when this visit is a QA run.
 *
 * Set by `?qa=1` on any load, then remembered for the rest of the tab, because
 * the funnel is one page and the Stripe round-trip returns to `?phase=download`
 * without the parameter. A QA visit still writes rows — it writes them with
 * `is_test`, and everything it goes on to buy is stamped the same way through
 * `create-checkout`, so `/admin` can drop the whole chain rather than only the
 * screens. (Until 2026-09-08 the pings were skipped instead, which left the
 * checkout and the charge unflagged.)
 *
 * Scope is `funnel_events` and `user_profiles.is_test`. Suppressing Meta is
 * Global Privacy Control's job (`lib/privacySignals.ts`).
 */
export function isQaSession(): boolean {
  if (typeof window === "undefined") return false;
  const fromUrl = new URLSearchParams(window.location.search).get("qa") === "1";
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(FUNNEL_QA_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(FUNNEL_QA_KEY) === "1";
  } catch {
    return fromUrl;
  }
}

/**
 * Fire and forget. `keepalive` so a ping started as she taps through survives
 * the render that follows it, and every failure is swallowed: this is
 * instrumentation, and instrumentation must never be visible to the woman being
 * instrumented.
 */
export function pingFunnelStep(
  step: string,
  stepIndex: number,
  detail?: PaywallExitReason
) {
  const sessionId = funnelSessionId();
  if (!sessionId) return;
  try {
    void fetch("/api/funnel-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        step,
        step_index: stepIndex,
        ...(detail ? { detail } : {}),
        ...(isQaSession() ? { is_test: true } : {}),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignored, deliberately.
  }
}
