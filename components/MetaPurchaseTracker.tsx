"use client";

import { useEffect } from "react";
import { META_CURRENCY, PLAN_VALUE, purchaseEventId } from "@/lib/metaPixel";
import { isPlanId } from "@/lib/pricing";
import { trackFbOnce } from "@/lib/metaPixelClient";

/**
 * Fires the browser-side Meta Purchase on a post-checkout landing.
 *
 * Mount on any page Stripe redirects to after a completed checkout; it reads
 * `session_id` and `plan` off the URL that create-checkout built. Reads them
 * from window.location rather than useSearchParams so it can be dropped into
 * routes without a Suspense boundary without forcing a client-side bailout.
 *
 * The Stripe webhook sends the same Purchase through the Conversions API with
 * an identical event_id, so exactly one is counted.
 *
 * A landing carrying a retired `plan` value - a checkout started before the
 * switch to the single 8-week plan - is skipped rather than reported at the new
 * price. The webhook's Conversions API copy reads the real amount off the Stripe
 * subscription, so those still get counted, at the price actually charged.
 */
export default function MetaPurchaseTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const plan = params.get("plan");
    if (!sessionId || !isPlanId(plan)) return;

    trackFbOnce(
      `purchase:${sessionId}`,
      "Purchase",
      {
        value: PLAN_VALUE,
        currency: META_CURRENCY,
        content_name: plan,
        content_type: "product",
        num_items: 1,
      },
      { eventID: purchaseEventId(sessionId) }
    );
  }, []);

  return null;
}
