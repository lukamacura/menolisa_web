import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { writeSubscription } from "@/lib/subscriptionWrite";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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

  // Verify this session belongs to the authenticated user
  if (session.client_reference_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.payment_status !== "paid") {
    return NextResponse.json({ paid: false });
  }

  const subscription = session.subscription as Stripe.Subscription | null;
  if (!subscription) {
    return NextResponse.json({ paid: false });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const firstItem = subscription.items?.data?.[0];
  const periodEnd =
    firstItem && "current_period_end" in firstItem
      ? (firstItem as { current_period_end: number }).current_period_end
      : null;
  const expiresAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000).toISOString()
    : periodEnd
    ? new Date(periodEnd * 1000).toISOString()
    : null;

  await writeSubscription(supabaseAdmin, {
    userId: user.id,
    provider: "stripe",
    active: subscription.status === "active" || subscription.status === "trialing",
    expiresAt,
    canceled: !!subscription.cancel_at_period_end,
    extras: {
      stripe_customer_id:
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
      stripe_subscription_id: subscription.id,
    },
  });

  return NextResponse.json({ paid: true });
}
