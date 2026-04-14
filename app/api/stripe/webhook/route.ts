import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { writeSubscription } from "@/lib/subscriptionWrite";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

type HandlerResult = { ok: boolean; error?: string };

// ---------- helpers ----------

function customerIdOf(customer: Stripe.Subscription["customer"] | Stripe.Invoice["customer"]): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") {
    return customer.id;
  }
  return null;
}

function subscriptionPeriodEndIso(subscription: Stripe.Subscription): string | null {
  const firstItem = subscription.items?.data?.[0];
  const periodEnd =
    firstItem && "current_period_end" in firstItem
      ? (firstItem as { current_period_end: number }).current_period_end
      : null;
  const endTs = subscription.cancel_at ?? periodEnd;
  return endTs ? new Date(endTs * 1000).toISOString() : null;
}

/**
 * Resolve a user_id either from the stored row (preferred) or from the Stripe object metadata.
 * Returns null when the subscription isn't linked to any known user yet.
 */
async function resolveUserId(
  supabaseAdmin: SupabaseClient,
  opts: { stripeSubscriptionId?: string | null; stripeCustomerId?: string | null; metadataUserId?: string | null }
): Promise<string | null> {
  if (opts.stripeSubscriptionId) {
    const { data } = await supabaseAdmin
      .from("user_trials")
      .select("user_id")
      .eq("stripe_subscription_id", opts.stripeSubscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  if (opts.stripeCustomerId) {
    const { data } = await supabaseAdmin
      .from("user_trials")
      .select("user_id")
      .eq("stripe_customer_id", opts.stripeCustomerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id as string;
  }
  return opts.metadataUserId ?? null;
}

/**
 * Out-of-order guard. Returns true when this event is older than the last one we processed for the user,
 * in which case the caller should short-circuit without writing. Updates the watermark on success.
 */
async function isStaleEvent(
  supabaseAdmin: SupabaseClient,
  userId: string,
  eventCreatedSec: number
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_trials")
    .select("last_stripe_event_at")
    .eq("user_id", userId)
    .maybeSingle();
  const last = data?.last_stripe_event_at ? new Date(data.last_stripe_event_at).getTime() : 0;
  return eventCreatedSec * 1000 < last;
}

async function stampEventWatermark(
  supabaseAdmin: SupabaseClient,
  userId: string,
  eventCreatedSec: number
): Promise<void> {
  await supabaseAdmin
    .from("user_trials")
    .update({ last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString() })
    .eq("user_id", userId);
}

// ---------- handlers ----------

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  eventCreatedSec: number
): Promise<HandlerResult> {
  const userId = session.client_reference_id ?? (session.metadata?.user_id as string | undefined) ?? null;
  if (!userId) {
    console.error("Webhook checkout.session.completed: no user id in session");
    return { ok: true };
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec)) return { ok: true };

  let subscription_ends_at: string | null = null;
  let stripe_customer_id: string | null = null;
  let stripe_subscription_id: string | null = null;
  let subscription_canceled = false;

  if (session.subscription && typeof session.subscription === "string") {
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      subscription_ends_at = subscriptionPeriodEndIso(subscription);
      subscription_canceled = !!subscription.cancel_at;
      stripe_customer_id = customerIdOf(subscription.customer);
      stripe_subscription_id = subscription.id;
    } catch (err) {
      console.error("Webhook: failed to fetch subscription:", err);
    }
  } else if (session.customer && typeof session.customer === "string") {
    stripe_customer_id = session.customer;
  }

  const nowIso = new Date().toISOString();
  const referralDiscountApplied = session.metadata?.referral_discount_applied === "true";
  const extras: Record<string, unknown> = {
    payment_failed_at: null,
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
  };
  if (stripe_customer_id) extras.stripe_customer_id = stripe_customer_id;
  if (stripe_subscription_id) extras.stripe_subscription_id = stripe_subscription_id;
  if (referralDiscountApplied) extras.referral_discount_used_at = nowIso;

  try {
    const result = await writeSubscription(supabaseAdmin, {
      userId,
      provider: "stripe",
      active: true,
      expiresAt: subscription_ends_at,
      canceled: subscription_canceled,
      extras,
    });
    if (!result.written) {
      console.warn(
        `Webhook: checkout.session.completed conflict — user ${userId} already has active ${result.existingProvider} sub`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert";
    console.error("Webhook: failed to upsert user_trials:", err);
    return { ok: false, error: message };
  }
  return { ok: true };
}

async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
  eventCreatedSec: number
): Promise<HandlerResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const subscription_ends_at = subscriptionPeriodEndIso(subscription);
  const subscription_canceled = !!subscription.cancel_at;
  const stripe_customer_id = customerIdOf(subscription.customer);
  const metadataUserId = (subscription.metadata?.user_id as string | undefined) ?? null;

  const userId = await resolveUserId(supabaseAdmin, {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: stripe_customer_id,
    metadataUserId,
  });

  if (userId && (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec))) return { ok: true };

  // Subscription is active/trialing → mark paid and clear payment-failed flag.
  const isActive = subscription.status === "active" || subscription.status === "trialing";

  const updatePayload: Record<string, unknown> = {
    provider: "stripe",
    stripe_subscription_id: subscription.id,
    subscription_canceled,
    updated_at: new Date().toISOString(),
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
    ...(subscription_ends_at && { subscription_ends_at }),
    ...(stripe_customer_id && { stripe_customer_id }),
    ...(isActive && { account_status: "paid", payment_failed_at: null }),
  };

  // Try update by subscription id first.
  const { data: bySubId, error: err1 } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscription.id)
    .select("user_id");

  if (err1) {
    console.error("Webhook: subscription upsert by stripe_subscription_id failed:", err1);
    return { ok: false, error: err1.message };
  }
  if (bySubId && bySubId.length > 0) return { ok: true };

  if (!userId) {
    console.warn("Webhook: subscription upsert — no row matched and no user_id in metadata", subscription.id);
    return { ok: true };
  }

  // Fall back to upsert via writeSubscription (handles provider-collision guard).
  try {
    const result = await writeSubscription(supabaseAdmin, {
      userId,
      provider: "stripe",
      active: isActive,
      expiresAt: subscription_ends_at,
      canceled: subscription_canceled,
      extras: {
        stripe_subscription_id: subscription.id,
        last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
        ...(stripe_customer_id && { stripe_customer_id }),
        ...(isActive && { payment_failed_at: null }),
      },
    });
    if (!result.written) {
      console.warn(
        `Webhook: subscription upsert conflict — user ${userId} already has active ${result.existingProvider} sub`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "upsert failed";
    console.error("Webhook: subscription upsert failed:", err);
    return { ok: false, error: message };
  }
  return { ok: true };
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  eventCreatedSec: number
): Promise<HandlerResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe_customer_id = customerIdOf(subscription.customer);
  const metadataUserId = (subscription.metadata?.user_id as string | undefined) ?? null;

  const userId = await resolveUserId(supabaseAdmin, {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: stripe_customer_id,
    metadataUserId,
  });
  if (userId && (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec))) return { ok: true };

  const updatePayload = {
    account_status: "expired",
    updated_at: new Date().toISOString(),
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
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
  if (updatedRows && updatedRows.length > 0) return { ok: true };

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

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  eventCreatedSec: number
): Promise<HandlerResult> {
  // Only process subscription invoices.
  const subId =
    (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription ?? null;
  const stripe_subscription_id = typeof subId === "string" ? subId : subId?.id ?? null;
  if (!stripe_subscription_id) return { ok: true };

  const supabaseAdmin = getSupabaseAdmin();
  const stripe_customer_id = customerIdOf(invoice.customer);

  const userId = await resolveUserId(supabaseAdmin, {
    stripeSubscriptionId: stripe_subscription_id,
    stripeCustomerId: stripe_customer_id,
  });
  if (userId && (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec))) return { ok: true };

  // Refresh period end from the subscription object — invoice.lines isn't a reliable source across API versions.
  let subscription_ends_at: string | null = null;
  let subscription_canceled = false;
  try {
    const subscription = await stripe.subscriptions.retrieve(stripe_subscription_id);
    subscription_ends_at = subscriptionPeriodEndIso(subscription);
    subscription_canceled = !!subscription.cancel_at;
  } catch (err) {
    console.error("Webhook invoice.payment_succeeded: failed to fetch subscription:", err);
  }

  const updatePayload: Record<string, unknown> = {
    account_status: "paid",
    provider: "stripe",
    stripe_subscription_id,
    subscription_canceled,
    payment_failed_at: null,
    updated_at: new Date().toISOString(),
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
    ...(subscription_ends_at && { subscription_ends_at }),
    ...(stripe_customer_id && { stripe_customer_id }),
  };

  const { data: updated, error } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .select("user_id");

  if (error) {
    console.error("Webhook invoice.payment_succeeded: update failed:", error);
    return { ok: false, error: error.message };
  }
  if (updated && updated.length > 0) return { ok: true };

  if (!userId) return { ok: true };

  const { error: fallbackError } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("user_id", userId);
  if (fallbackError) {
    console.error("Webhook invoice.payment_succeeded: fallback update failed:", fallbackError);
    return { ok: false, error: fallbackError.message };
  }
  return { ok: true };
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  eventCreatedSec: number
): Promise<HandlerResult> {
  const subId =
    (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription ?? null;
  const stripe_subscription_id = typeof subId === "string" ? subId : subId?.id ?? null;
  if (!stripe_subscription_id) return { ok: true };

  const supabaseAdmin = getSupabaseAdmin();
  const stripe_customer_id = customerIdOf(invoice.customer);

  const userId = await resolveUserId(supabaseAdmin, {
    stripeSubscriptionId: stripe_subscription_id,
    stripeCustomerId: stripe_customer_id,
  });
  if (userId && (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec))) return { ok: true };

  // Flag the account; keep access until the subscription is actually deleted by Stripe's dunning flow.
  const updatePayload = {
    payment_failed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
  };

  const { data: updated, error } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .select("user_id");

  if (error) {
    console.error("Webhook invoice.payment_failed: update failed:", error);
    return { ok: false, error: error.message };
  }
  if (updated && updated.length > 0) return { ok: true };

  if (!userId) return { ok: true };
  const { error: fallbackError } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("user_id", userId);
  if (fallbackError) {
    console.error("Webhook invoice.payment_failed: fallback update failed:", fallbackError);
    return { ok: false, error: fallbackError.message };
  }
  return { ok: true };
}

async function handleChargeDisputeCreated(
  dispute: Stripe.Dispute,
  eventCreatedSec: number
): Promise<HandlerResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const stripe_customer_id =
    typeof dispute.charge === "string"
      ? null
      : (dispute.charge as Stripe.Charge | null)?.customer
        ? customerIdOf((dispute.charge as Stripe.Charge).customer)
        : null;

  // If we only have a charge id string, fetch it to pull the customer.
  let customerId = stripe_customer_id;
  if (!customerId && typeof dispute.charge === "string") {
    try {
      const charge = await stripe.charges.retrieve(dispute.charge);
      customerId = customerIdOf(charge.customer);
    } catch (err) {
      console.error("Webhook charge.dispute.created: failed to fetch charge:", err);
    }
  }
  if (!customerId) {
    console.warn("Webhook charge.dispute.created: no customer id, skipping");
    return { ok: true };
  }

  const userId = await resolveUserId(supabaseAdmin, { stripeCustomerId: customerId });
  if (userId && (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec))) return { ok: true };

  const updatePayload = {
    dispute_flagged_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_customer_id", customerId);
  if (error) {
    console.error("Webhook charge.dispute.created: update failed:", error);
    return { ok: false, error: error.message };
  }
  // Loud log so you can investigate manually — dispute windows matter.
  console.warn(`Stripe dispute opened for customer ${customerId} (dispute=${dispute.id}) — review in dashboard`);
  return { ok: true };
}

// ---------- route ----------

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
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

  // Idempotency: insert first; if the id already exists, we've seen this event and ack silently.
  const supabaseAdmin = getSupabaseAdmin();
  const { error: insertErr } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });
  if (insertErr) {
    if (insertErr.code === "23505") {
      // duplicate — already processed
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Storage error: ack so Stripe doesn't hammer us, but log loudly.
    console.error("Webhook: failed to record event (continuing):", insertErr);
  }

  const eventCreatedSec = event.created;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const result = await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to update subscription status" },
            { status: 500 }
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const result = await handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to update subscription" },
            { status: 500 }
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const result = await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to expire subscription" },
            { status: 500 }
          );
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const result = await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to record invoice payment" },
            { status: 500 }
          );
        }
        break;
      }
      case "invoice.payment_failed": {
        const result = await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to record payment failure" },
            { status: 500 }
          );
        }
        break;
      }
      case "charge.dispute.created": {
        const result = await handleChargeDisputeCreated(
          event.data.object as Stripe.Dispute,
          eventCreatedSec
        );
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error ?? "Failed to record dispute" },
            { status: 500 }
          );
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    // Clear the idempotency row so Stripe's retry gets another chance.
    await supabaseAdmin.from("stripe_webhook_events").delete().eq("event_id", event.id);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
