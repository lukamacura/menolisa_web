import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fulfillCheckout } from "@/lib/stripe/fulfillCheckout";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/stripe/sync-session — the success screen's safety net.
 *
 * `checkout.session.completed` is what normally fulfils a purchase, and it is
 * not guaranteed to arrive: a signing secret that no longer matches the
 * endpoint, an endpoint URL that 307s from the apex to `www` (Stripe does not
 * follow redirects), a Stripe incident. She has paid either way.
 *
 * So this runs the identical fulfillment — email bind, subscription row, plan
 * generation, welcome email — off the `session_id` her browser is holding.
 * `fulfillCheckout` claims the one-time side effects, so whichever of the two
 * gets there first does them and the other is a no-op.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session_id } = await req.json();
  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription"],
    });
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  // Verify this session belongs to the authenticated user. This is the whole
  // authorization check — the session id is the only thing the caller supplies,
  // and without this anyone could fulfil someone else's checkout onto their own
  // account.
  if (session.client_reference_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.payment_status !== "paid" || !session.subscription) {
    return NextResponse.json({ paid: false });
  }

  const result = await fulfillCheckout({
    supabaseAdmin: getSupabaseAdmin(),
    stripe,
    session,
    sessionUserId: user.id,
    atSec: Math.floor(Date.now() / 1000),
    // Never stamp the out-of-order watermark here: it records how far Stripe's
    // event stream has been processed, and a value from this path would make the
    // next genuine webhook look stale and be dropped.
  });

  return NextResponse.json({ paid: true, fulfilled: result.fulfilled });
}
