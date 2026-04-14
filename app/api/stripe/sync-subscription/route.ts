import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * POST /api/stripe/sync-subscription
 * Syncs subscription status from Stripe into user_trials (subscription_ends_at, subscription_canceled).
 * Call this when loading trial/subscription UI so the app shows correct "Access until" even if the webhook missed an event.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: row, error: fetchError } = await supabaseAdmin
      .from("user_trials")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ ok: true, synced: false }); // no subscription to sync
    }

    let subscription: Stripe.Subscription | null = null;

    if (row.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      } catch (e) {
        // Subscription may have been deleted
        return NextResponse.json({ ok: true, synced: false });
      }
    } else if (row.stripe_customer_id) {
      const subs = await stripe.subscriptions.list({
        customer: row.stripe_customer_id,
        status: "active",
        limit: 1,
      });
      subscription = subs.data[0] ?? null;
    }

    if (!subscription) {
      return NextResponse.json({ ok: true, synced: false });
    }

    const firstItem = subscription.items?.data?.[0];
    const periodEnd =
      firstItem && "current_period_end" in firstItem ? firstItem.current_period_end : null;
    const endTs = subscription.cancel_at ?? periodEnd;
    if (!endTs) {
      return NextResponse.json({ ok: true, synced: false });
    }

    const subscription_ends_at = new Date(endTs * 1000).toISOString();
    const subscription_canceled = !!subscription.cancel_at;

    const isActive = subscription.status === "active" || subscription.status === "trialing";
    const { error: updateError } = await supabaseAdmin
      .from("user_trials")
      .update({
        provider: "stripe",
        subscription_ends_at,
        subscription_canceled,
        stripe_subscription_id: subscription.id,
        account_status: isActive ? "paid" : "expired",
        ...(isActive && { payment_failed_at: null }),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("sync-subscription: update failed", updateError);
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, synced: true });
  } catch (err) {
    console.error("sync-subscription error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to sync subscription." },
      { status: 500 }
    );
  }
}
