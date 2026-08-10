/**
 * Everything that has to happen once a checkout is paid, in one place.
 *
 * Two callers run this, and either one may be the only one that ever does:
 *
 *  - `app/api/stripe/webhook/route.ts` on `checkout.session.completed` — the
 *    normal path.
 *  - `app/api/stripe/sync-session/route.ts` — the fallback the success screen
 *    calls with its `session_id`. It exists because a webhook can simply never
 *    arrive: a stale signing secret, an endpoint pointed at a URL that 307s to
 *    `www`, a Stripe incident. Before this module that fallback recovered the
 *    subscription row and nothing else, so a missed webhook cost the customer
 *    her login address and her plan, with no way back.
 *
 * The side effects here are not idempotent — an email sends twice, a plan
 * regenerates — so they are guarded by a claim on `user_trials.fulfilled_at`
 * rather than a read-then-write check. See `claimFulfillment`.
 */

import { after } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeSubscription } from "@/lib/subscriptionWrite";
import { sendWelcomeEmail, sendAdminNotification } from "@/lib/resend";
import { generatePlan, markPlanGenerating } from "@/lib/plan/generate";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * Values `plan_type` can hold. `plan8w` — $59 per 8 weeks — is the only plan
 * sold, and there are no legacy subscribers on anything else.
 */
export type PlanType = "plan8w";

export function customerIdOf(
  customer: Stripe.Subscription["customer"] | Stripe.Invoice["customer"]
): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer && typeof customer.id === "string") {
    return customer.id;
  }
  return null;
}

export function subscriptionPeriodEndIso(subscription: Stripe.Subscription): string | null {
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
export function fallbackPeriodEndIso(fromSec: number): string {
  return new Date(fromSec * 1000 + PLAN_WEEKS * 7 * 86_400_000).toISOString();
}

/** Derive billing period + amount (cents) from the subscription's first price. */
export function planFromSubscription(
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
  if (error) console.error("Fulfil: quiz profile adoption failed:", error);
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
export async function resolveCheckoutAccount(
  supabaseAdmin: SupabaseClient,
  userId: string,
  email: string | null
): Promise<string> {
  if (!email) {
    console.warn(`Fulfil: checkout session for ${userId} carried no email`);
    return userId;
  }

  const { data: authData, error: readError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (readError || !authData?.user) {
    console.error("Fulfil: could not load user for email binding:", readError);
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
      `Fulfil: could not bind ${email} to user ${userId}, and no existing account holds it`,
      bindError,
      lookupError
    );
    return userId;
  }

  console.warn(`Fulfil: checkout email already belongs to ${existingId}; merging ${userId} into it`);
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
  if (dropError) console.error("Fulfil: could not drop merged trial row:", dropError);

  return existingId as string;
}

/**
 * Claim the one-time side effects for this account. Returns true to exactly one
 * caller, ever.
 *
 * The webhook and the success-screen fallback can both fulfil the same checkout,
 * concurrently — she lands on the success page at roughly the moment Stripe
 * fires the event. A read-then-write check would let both through, and she would
 * get two welcome emails and two plan generations racing to upsert the same row.
 *
 * The conditional UPDATE is the whole guard: Postgres serialises the two on the
 * row lock, so the second one re-evaluates `fulfilled_at is null` against the
 * first one's committed value and matches nothing.
 */
export async function claimFulfillment(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_trials")
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("fulfilled_at", null)
    .select("user_id");

  if (error) {
    // Fail closed on the side effects rather than risk sending twice — the plan
    // is still recoverable from GET /api/plan.
    console.error("Fulfil: could not claim fulfillment:", error);
    return false;
  }
  return !!data && data.length > 0;
}

async function sendFulfillmentEmails(supabaseAdmin: SupabaseClient, userId: string): Promise<void> {
  try {
    const { data: authData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authData.user?.email;
    if (!email) return;

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
  } catch (e) {
    console.error("Fulfil: welcome emails failed:", e);
  }
}

export type FulfillResult = {
  /** The account the subscription landed on. Differs from the session's user id
   *  when the email Stripe collected already belonged to another account. */
  userId: string;
  /** False when writeSubscription refused — an active sub on another provider. */
  written: boolean;
  /** True for the single caller that won the one-time side effects. */
  fulfilled: boolean;
  planType: PlanType | null;
  planAmount: number | null;
  subscriptionEndsAt: string | null;
};

/**
 * Bind the email, write the subscription, then — once — start the plan and send
 * the welcome email. Safe to call twice on the same session.
 */
export async function fulfillCheckout(opts: {
  supabaseAdmin: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
  /** User id carried by the session (`client_reference_id`, else metadata). */
  sessionUserId: string;
  /** Seconds. The Stripe event time on the webhook path, now on the fallback. */
  atSec: number;
  /**
   * Webhook only. The out-of-order watermark is a statement about events Stripe
   * delivered; the fallback stamping it would make the next genuine webhook look
   * stale and be dropped.
   */
  stampWatermark?: boolean;
}): Promise<FulfillResult> {
  const { supabaseAdmin, stripe, session, sessionUserId, atSec, stampWatermark } = opts;

  // Give the account its email before touching user_trials — see
  // resolveCheckoutAccount for why the order matters. May return a different id
  // than the session carried, when the address belongs to an older account.
  const userId = await resolveCheckoutAccount(
    supabaseAdmin,
    sessionUserId,
    session.customer_details?.email ?? session.customer_email ?? null
  );

  let subscription: Stripe.Subscription | null = null;
  let stripe_customer_id: string | null = null;

  // sync-session expands it; the webhook gets a bare id.
  if (session.subscription && typeof session.subscription === "object") {
    subscription = session.subscription as Stripe.Subscription;
  } else if (typeof session.subscription === "string") {
    try {
      subscription = await stripe.subscriptions.retrieve(session.subscription);
    } catch (err) {
      console.error("Fulfil: failed to fetch subscription:", err);
    }
  }

  let subscription_ends_at: string | null = null;
  let subscription_canceled = false;
  let plan_type: PlanType | null = null;
  let plan_amount: number | null = null;

  if (subscription) {
    subscription_ends_at = subscriptionPeriodEndIso(subscription);
    subscription_canceled = !!subscription.cancel_at;
    stripe_customer_id = customerIdOf(subscription.customer);
    ({ plan_type, plan_amount } = planFromSubscription(subscription));
  } else if (typeof session.customer === "string") {
    stripe_customer_id = session.customer;
  }

  const extras: Record<string, unknown> = { payment_failed_at: null };
  if (stampWatermark) extras.last_stripe_event_at = new Date(atSec * 1000).toISOString();
  if (stripe_customer_id) extras.stripe_customer_id = stripe_customer_id;
  if (subscription) extras.stripe_subscription_id = subscription.id;
  if (plan_type) extras.plan_type = plan_type;
  if (plan_amount !== null) extras.plan_amount = plan_amount;

  const result = await writeSubscription(supabaseAdmin, {
    userId,
    provider: "stripe",
    active: true,
    expiresAt: subscription_ends_at ?? fallbackPeriodEndIso(atSec),
    canceled: subscription_canceled,
    extras,
  });

  const base = {
    userId,
    planType: plan_type,
    planAmount: plan_amount,
    subscriptionEndsAt: subscription_ends_at,
  };

  if (!result.written) {
    console.warn(
      `Fulfil: conflict — user ${userId} already has an active ${result.existingProvider} sub`
    );
    return { ...base, written: false, fulfilled: false };
  }

  if (!(await claimFulfillment(supabaseAdmin, userId))) {
    return { ...base, written: true, fulfilled: false };
  }

  // Her 8-week plan. The row is claimed synchronously so the app can show
  // "building your plan" the moment she opens it; the slow LLM call runs after
  // the caller has already responded. If it never lands, GET /api/plan re-kicks
  // it.
  await markPlanGenerating(userId);
  after(() => generatePlan(userId));
  after(() => sendFulfillmentEmails(supabaseAdmin, userId));

  return { ...base, written: true, fulfilled: true };
}
