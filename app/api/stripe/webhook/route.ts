import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<{ ok: boolean; error?: string }> {
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  if (!userId) {
    console.error("Webhook checkout.session.completed: no user id in session");
    return { ok: true };
  }

  let subscription_ends_at: string | null = null;
  let stripe_customer_id: string | null = null;
  let stripe_subscription_id: string | null = null;

  let subscription_canceled = false;
  if (session.subscription && typeof session.subscription === "string") {
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const firstItem = subscription.items?.data?.[0];
      const periodEnd = firstItem && "current_period_end" in firstItem ? firstItem.current_period_end : null;
      if (subscription.cancel_at) {
        subscription_ends_at = new Date(subscription.cancel_at * 1000).toISOString();
        subscription_canceled = true;
      } else if (periodEnd) {
        subscription_ends_at = new Date(periodEnd * 1000).toISOString();
      }
      stripe_customer_id = typeof subscription.customer === "string" ? subscription.customer : (subscription.customer as { id?: string })?.id ?? null;
      stripe_subscription_id = subscription.id;
    } catch (err) {
      console.error("Webhook: failed to fetch subscription:", err);
      // Still mark paid; we can update period later via subscription.updated
    }
  } else if (session.customer && typeof session.customer === "string") {
    stripe_customer_id = session.customer;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: userId,
    account_status: "paid",
    subscription_canceled,
    updated_at: nowIso,
    referral_discount_used_at: nowIso,
  };
  if (subscription_ends_at) row.subscription_ends_at = subscription_ends_at;
  if (stripe_customer_id) row.stripe_customer_id = stripe_customer_id;
  if (stripe_subscription_id) row.stripe_subscription_id = stripe_subscription_id;

  const { error } = await supabaseAdmin
    .from("user_trials")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error("Webhook: failed to upsert user_trials:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<{ ok: boolean; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin();
  const firstItem = subscription.items?.data?.[0];
  const periodEnd = firstItem && "current_period_end" in firstItem ? firstItem.current_period_end : null;
  const endTs = subscription.cancel_at ?? periodEnd;
  if (!endTs) {
    return { ok: true };
  }
  const subscription_ends_at = new Date(endTs * 1000).toISOString();
  const subscription_canceled = !!subscription.cancel_at;
  const stripe_customer_id =
    typeof subscription.customer === "string"
      ? subscription.customer
      : (subscription.customer as { id?: string })?.id ?? null;

  const updatePayload = {
    subscription_ends_at,
    subscription_canceled,
    stripe_subscription_id: subscription.id,
    ...(stripe_customer_id && { stripe_customer_id }),
    account_status: "paid",
    updated_at: new Date().toISOString(),
  };

  const { data: bySubId, error: err1 } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id");

  if (err1) {
    console.error("Webhook: subscription.updated update by stripe_subscription_id failed:", err1);
    return { ok: false, error: err1.message };
  }
  if (bySubId && bySubId.length > 0) {
    return { ok: true };
  }

  const userId = (subscription.metadata?.user_id as string) ?? null;
  if (!userId) {
    console.warn("Webhook: subscription.updated no row matched and no metadata.user_id", subscription.id);
    return { ok: true };
  }

  const { data: byUserId, error: err2 } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("user_id", userId)
    .select("user_id");

  if (err2) {
    console.error("Webhook: subscription.updated update by user_id failed:", err2);
    return { ok: false, error: err2.message };
  }
  if (byUserId && byUserId.length > 0) {
    return { ok: true };
  }

  const { error: upsertErr } = await supabaseAdmin.from("user_trials").upsert(
    {
      user_id: userId,
      account_status: "paid",
      subscription_ends_at,
      subscription_canceled,
      stripe_subscription_id: subscription.id,
      ...(stripe_customer_id && { stripe_customer_id }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (upsertErr) {
    console.error("Webhook: subscription.updated upsert failed:", upsertErr);
    return { ok: false, error: upsertErr.message };
  }
  return { ok: true };
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<{ ok: boolean; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const updatePayload = {
    account_status: "expired",
    updated_at: new Date().toISOString(),
  };

  const { data: updatedRows, error } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id");

  if (error) {
    console.error("Webhook: subscription.deleted update failed:", error);
    return { ok: false, error: error.message };
  }

  if (updatedRows && updatedRows.length > 0) {
    return { ok: true };
  }

  const userId = subscription.metadata?.user_id as string | undefined;
  if (!userId) return { ok: true };

  const { error: fallbackError } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("user_id", userId);

  if (fallbackError) {
    console.error("Webhook: subscription.deleted fallback by user_id failed:", fallbackError);
    return { ok: false, error: fallbackError.message };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to update subscription status" },
            { status: 500 }
          );
        }
        break;
      }
      case "customer.subscription.updated": {
        const result = await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to update subscription" },
            { status: 500 }
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const result = await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to expire subscription" },
            { status: 500 }
          );
        }
        break;
      }
      default:
        // Acknowledge other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
