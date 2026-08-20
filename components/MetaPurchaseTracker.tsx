"use client";

import { useEffect } from "react";
import { META_CURRENCY, PLAN_VALUE, purchaseEventId } from "@/lib/metaPixel";
import { isPlanId } from "@/lib/pricing";
import { getSupabase } from "@/lib/supabaseClient";
import { identifyMetaUser, trackFbOnce } from "@/lib/metaPixelClient";

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
 *
 * ## Why it identifies her first
 *
 * `identifyMetaUser()` runs in `completeRegistration()` and in the resume
 * restore, and neither survives the trip to Stripe: coming back to
 * `?phase=download` is a cold page load, so the pixel here was initialised with
 * no advanced matching at all. That left the browser `Purchase` matching on
 * `_fbp`/`_fbc`/IP/UA alone while `ViewContent` and `InitiateCheckout` - fired
 * in the same page life as the sign-in - both carried `external_id`.
 *
 * It matters more than a missing parameter usually would, because Meta keeps the
 * copy of a deduplicated pair that **arrives first**, and the browser copy fires
 * on landing while the Conversions API copy waits on the Stripe webhook. So the
 * surviving Purchase was routinely the weaker of the two, and the richer server
 * one - hashed email, external_id, and now name and address - was the one being
 * discarded.
 *
 * `getSession()` reads the token the client already holds rather than
 * round-tripping to Supabase like `getUser()`, so this costs no network call;
 * anything that goes wrong falls through and fires the event unidentified,
 * because an under-matched Purchase still beats a missing one.
 */
export default function MetaPurchaseTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const plan = params.get("plan");
    if (!sessionId || !isPlanId(plan)) return;

    const fire = () =>
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

    void (async () => {
      try {
        const supabase = await getSupabase();
        const { data } = await supabase.auth.getSession();
        identifyMetaUser(data.session?.user?.id);
      } catch {
        // Fall through - see the docstring. The event is worth more than the
        // parameter.
      }
      fire();
    })();
  }, []);

  return null;
}
