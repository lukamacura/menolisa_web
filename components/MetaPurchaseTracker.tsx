"use client";

import { useEffect } from "react";
import { META_CURRENCY, PLAN_VALUE, isMetaPlan, purchaseEventId } from "@/lib/metaPixel";
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
 */
export default function MetaPurchaseTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const plan = params.get("plan");
    if (!sessionId || !isMetaPlan(plan)) return;

    trackFbOnce(
      `purchase:${sessionId}`,
      "Purchase",
      {
        value: PLAN_VALUE[plan],
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
