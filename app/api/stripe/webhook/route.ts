import { NextRequest, NextResponse, after } from "next/server";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { writeSubscription } from "@/lib/subscriptionWrite";
import { sendWelcomeEmail, sendChargeConfirmedEmail, sendAdminNotification } from "@/lib/resend";
import { generatePlan, markPlanGenerating } from "@/lib/plan/generate";
import { sendMetaPurchase, metaMatchDataFrom } from "@/lib/metaCapi";
import { META_CURRENCY, PLAN_VALUE, purchaseEventId } from "@/lib/metaPixel";
import { PLAN_WEEKS } from "@/lib/pricing";

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
 * Access cutoff to use when Stripe gave us no period end but we are about to
 * mark the account paid.
 *
 * getAccountState() fails closed on a paid row with no cutoff, so writing null
 * here would lock out someone who just paid. One plan length from the event is
 * the honest guess: it is exactly what the price bills, and the next renewal
 * webhook overwrites it with Stripe's real date anyway.
 */
function fallbackPeriodEndIso(fromSec: number): string {
  return new Date(fromSec * 1000 + PLAN_WEEKS * 7 * 86_400_000).toISOString();
}

/**
 * Values `plan_type` can hold. `plan8w` — $59 per 8 weeks — is the only plan
 * sold, and there are no legacy subscribers on anything else.
 */
type PlanType = "plan8w";

/** Derive billing period + amount (cents) from the subscription's first price. */
function planFromSubscription(
  subscription: Stripe.Subscription
): { plan_type: PlanType | null; plan_amount: number | null } {
  const price = subscription.items?.data?.[0]?.price;
  const interval = price?.recurring?.interval ?? null;
  const intervalCount = price?.recurring?.interval_count ?? 1;
  const plan_type: PlanType | null =
    interval === "week" && intervalCount === PLAN_WEEKS ? "plan8w" : null;
  const plan_amount = typeof price?.unit_amount === "number" ? price.unit_amount : null;
  return { plan_type, plan_amount };
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

/** Quiz answers `/api/auth/save-quiz` writes. Listed explicitly so a merge copies
 *  data and never identity columns. */
const QUIZ_PROFILE_COLUMNS = [
  "name",
  "age_band",
  "top_problems",
  "timing",
  "here_for",
  "tried_options",
  "hrt_status",
  "doctor_status",
  "goal",
  "goals",
  "qualifier",
  "height_cm",
  "weight_kg",
  "height_unit",
  "weight_unit",
  "fitness_level",
].join(",");

/**
 * Move the funnel's quiz answers onto the account that survives a merge — but
 * only when that account has no profile of its own. An existing profile is real
 * data she built up; a fresh re-take of the quiz does not outrank it.
 */
async function adoptQuizProfile(
  supabaseAdmin: SupabaseClient,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  const { data: target } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", toUserId)
    .maybeSingle();
  if (target) return;

  // The column list is built at runtime, so postgrest-js can't infer a row type
  // for it — hence the cast.
  const { data } = await supabaseAdmin
    .from("user_profiles")
    .select(QUIZ_PROFILE_COLUMNS)
    .eq("user_id", fromUserId)
    .maybeSingle();
  const source = data as Record<string, unknown> | null;
  if (!source) return;

  const { error } = await supabaseAdmin
    .from("user_profiles")
    .insert({ ...source, user_id: toUserId });
  if (error) console.error("Webhook: quiz profile adoption failed:", error);
}

/**
 * Bind the email Stripe collected to the account that is paying, and return the
 * user id the subscription belongs to.
 *
 * The `/register` funnel signs her in anonymously — no email is asked for
 * anywhere before the card — so the account arriving here usually has none.
 * That address has to land before anything else runs:
 *   - it is how she logs into the mobile app afterwards (OTP needs an address);
 *   - the welcome email below reads it back off `auth.users`;
 *   - `sync_email_sequence_recipient()` returns early for an emailless user, so
 *     the paid drip only ever starts if the email is set *before* `user_trials`
 *     is written (that write is what fires the sync trigger).
 *
 * Usually the id is unchanged. When the address already belongs to another
 * account — she bought before, or signed up in the app — the subscription goes
 * to *that* account instead of minting a duplicate she could never log into.
 */
async function resolveCheckoutAccount(
  supabaseAdmin: SupabaseClient,
  userId: string,
  email: string | null
): Promise<string> {
  if (!email) {
    console.warn(`Webhook: checkout session for ${userId} carried no email`);
    return userId;
  }

  const { data: authData, error: readError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (readError || !authData?.user) {
    console.error("Webhook: could not load user for email binding:", readError);
    return userId;
  }
  // Already has an address (mobile signup, returning subscriber). Never
  // overwrite it with whatever was typed into Stripe.
  if (authData.user.email) return userId;

  const { error: bindError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (!bindError) return userId;

  // Only one account can hold an address, so a failure here is almost always a
  // collision. Find the account that already holds it and merge into it.
  const { data: existingId, error: lookupError } = await supabaseAdmin.rpc(
    "auth_user_id_by_email",
    { p_email: email }
  );
  if (lookupError || !existingId) {
    console.error(
      `Webhook: could not bind ${email} to user ${userId}, and no existing account holds it`,
      bindError,
      lookupError
    );
    return userId;
  }

  console.warn(
    `Webhook: checkout email already belongs to ${existingId}; merging ${userId} into it`
  );
  await adoptQuizProfile(supabaseAdmin, userId, existingId as string);

  // Drop the funnel account's subscription row. Stripe does not guarantee
  // delivery order, so `customer.subscription.created` may already have marked
  // it paid off the same metadata user id — leaving two rows claiming one
  // subscription, and an account the purge cron would then refuse to clean up
  // because it looks like a paying customer.
  const { error: dropError } = await supabaseAdmin
    .from("user_trials")
    .delete()
    .eq("user_id", userId);
  if (dropError) console.error("Webhook: could not drop merged trial row:", dropError);

  return existingId as string;
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
  const sessionUserId =
    session.client_reference_id ?? (session.metadata?.user_id as string | undefined) ?? null;
  if (!sessionUserId) {
    console.error("Webhook checkout.session.completed: no user id in session");
    return { ok: true };
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Give the account its email before touching user_trials — see
  // resolveCheckoutAccount for why the order matters. May return a different id
  // than the session carried, when the address belongs to an older account.
  const userId = await resolveCheckoutAccount(
    supabaseAdmin,
    sessionUserId,
    session.customer_details?.email ?? session.customer_email ?? null
  );

  if (await isStaleEvent(supabaseAdmin, userId, eventCreatedSec)) return { ok: true };

  let subscription_ends_at: string | null = null;
  let stripe_customer_id: string | null = null;
  let stripe_subscription_id: string | null = null;
  let subscription_canceled = false;
  let plan_type: PlanType | null = null;
  let plan_amount: number | null = null;

  if (session.subscription && typeof session.subscription === "string") {
    try {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      subscription_ends_at = subscriptionPeriodEndIso(subscription);
      subscription_canceled = !!subscription.cancel_at;
      stripe_customer_id = customerIdOf(subscription.customer);
      stripe_subscription_id = subscription.id;
      ({ plan_type, plan_amount } = planFromSubscription(subscription));
    } catch (err) {
      console.error("Webhook: failed to fetch subscription:", err);
    }
  } else if (session.customer && typeof session.customer === "string") {
    stripe_customer_id = session.customer;
  }

  const extras: Record<string, unknown> = {
    payment_failed_at: null,
    last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
  };
  if (stripe_customer_id) extras.stripe_customer_id = stripe_customer_id;
  if (stripe_subscription_id) extras.stripe_subscription_id = stripe_subscription_id;
  if (plan_type) extras.plan_type = plan_type;
  if (plan_amount !== null) extras.plan_amount = plan_amount;

  try {
    const result = await writeSubscription(supabaseAdmin, {
      userId,
      provider: "stripe",
      active: true,
      expiresAt: subscription_ends_at ?? fallbackPeriodEndIso(eventCreatedSec),
      canceled: subscription_canceled,
      extras,
    });
    if (!result.written) {
      console.warn(
        `Webhook: checkout.session.completed conflict — user ${userId} already has active ${result.existingProvider} sub`
      );
    } else {
      // Server-side Purchase for Meta ads attribution. Deduped against the
      // browser pixel copy on the success page via a shared event_id. Deferred
      // with after() so Stripe gets its 200 without waiting on Meta.
      after(() =>
        sendMetaPurchase({
          eventId: purchaseEventId(session.id),
          eventTimeSec: eventCreatedSec,
          // Prefer the real amount off the Stripe price - it stays right even
          // for a legacy plan or a coupon-discounted first invoice. PLAN_VALUE
          // is only the floor for when the subscription fetch above failed.
          value: plan_amount != null ? plan_amount / 100 : PLAN_VALUE,
          currency: META_CURRENCY,
          email: session.customer_details?.email ?? session.customer_email ?? null,
          userId,
          planType: plan_type,
          ...metaMatchDataFrom(session.metadata),
        })
      );

      // Her 8-week plan. The row is claimed synchronously so the app can show
      // "building your plan" the moment she opens it; the slow LLM call runs
      // after Stripe already has its 200. If it never lands, GET /api/plan
      // re-kicks it.
      await markPlanGenerating(userId);
      after(() => generatePlan(userId));

      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authData.user?.email;
        if (email) {
          const { data: profile } = await supabaseAdmin
            .from("user_profiles")
            .select("name")
            .eq("user_id", userId)
            .maybeSingle();
          await Promise.all([
            sendWelcomeEmail(email, profile?.name ?? null),
            sendAdminNotification(
              `New subscriber — ${email}`,
              `<p>New subscriber: <strong>${email}</strong>${profile?.name ? ` (${profile.name})` : ""}</p><p>Started: ${new Date().toUTCString()}</p>`
            ),
          ]);
        }
      } catch (e) {
        console.error("Webhook: welcome emails failed:", e);
      }
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
  const { plan_type, plan_amount } = planFromSubscription(subscription);
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
    ...(plan_type && { plan_type }),
    ...(plan_amount !== null && { plan_amount }),
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
      expiresAt:
        isActive && !subscription_ends_at
          ? fallbackPeriodEndIso(eventCreatedSec)
          : subscription_ends_at,
      canceled: subscription_canceled,
      extras: {
        stripe_subscription_id: subscription.id,
        last_stripe_event_at: new Date(eventCreatedSec * 1000).toISOString(),
        ...(stripe_customer_id && { stripe_customer_id }),
        ...(plan_type && { plan_type }),
        ...(plan_amount !== null && { plan_amount }),
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

  // If this paid invoice consumed the referral coupon, stamp the referrer's row.
  const referralCouponId = process.env.STRIPE_REFERRAL_COUPON_ID;
  if (referralCouponId && (invoice.amount_paid ?? 0) > 0 && userId) {
    try {
      const { data: existingTrial } = await supabaseAdmin
        .from("user_trials")
        .select("referral_discount_used_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!existingTrial?.referral_discount_used_at) {
        const fullInvoice = await stripe.invoices.retrieve(invoice.id!, {
          expand: ["discounts.coupon"],
        });
        const discounts = (fullInvoice.discounts ?? []) as Array<{ coupon?: string | { id: string } } | string>;
        const matched = discounts.some((d) => {
          if (typeof d === "string") return false;
          const coupon = d.coupon;
          if (!coupon) return false;
          const id = typeof coupon === "string" ? coupon : coupon.id;
          return id === referralCouponId;
        });
        if (matched) {
          updatePayload.referral_discount_used_at = new Date().toISOString();
        }
      }
    } catch (err) {
      console.error("Webhook invoice.payment_succeeded: referral coupon check failed:", err);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("user_trials")
    .update(updatePayload)
    .eq("stripe_subscription_id", stripe_subscription_id)
    .select("user_id");

  if (error) {
    console.error("Webhook invoice.payment_succeeded: update failed:", error);
    return { ok: false, error: error.message };
  }

  // Fire charge confirmation email once, regardless of which DB path succeeds.
  const chargeUserId = ((updated && updated.length > 0 ? updated[0]?.user_id : userId) ?? null) as string | null;
  if (chargeUserId && (invoice.amount_paid ?? 0) > 0) {
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(chargeUserId);
      const email = authData.user?.email;
      if (email) {
        const { data: profile } = await supabaseAdmin
          .from("user_profiles")
          .select("name")
          .eq("user_id", chargeUserId)
          .maybeSingle();
        await Promise.all([
          sendChargeConfirmedEmail(email, profile?.name ?? null),
          sendAdminNotification(
            `New payment — ${email}`,
            `<p>Payment received: <strong>${email}</strong>${profile?.name ? ` (${profile.name})` : ""}</p><p>Amount: $${((invoice.amount_paid ?? 0) / 100).toFixed(2)}</p><p>At: ${new Date().toUTCString()}</p>`
          ),
        ]);
      }
    } catch (e) {
      console.error("Webhook invoice.payment_succeeded: charge emails failed:", e);
    }
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
