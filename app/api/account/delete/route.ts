import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Tables cleared explicitly before the auth user goes away.
 *
 * This list is *not* the mechanism — every one of these carries
 * `user_id references auth.users on delete cascade`, so
 * `auth.admin.deleteUser` below would remove them anyway, along with
 * `user_plans`, `user_plan_logs` and `user_habits`, which were never on this
 * list at all. Keep it as an ordering
 * detail that makes the intent readable; never treat it as the guarantee.
 * A new user table is covered by adding the FK, not by adding a line here.
 */
const TABLES_TO_CLEAR: { table: string; column: string }[] = [
  { table: "notifications", column: "user_id" },
  { table: "user_push_tokens", column: "user_id" },
  { table: "symptom_logs", column: "user_id" },
  { table: "symptoms", column: "user_id" },
  { table: "weekly_insights", column: "user_id" },
  { table: "user_plan_logs", column: "user_id" },
  { table: "user_habits", column: "user_id" },
  { table: "user_plans", column: "user_id" },
  { table: "user_preferences", column: "user_id" },
  { table: "user_profiles", column: "user_id" },
  { table: "user_trials", column: "user_id" },
];

/** Stripe error codes that mean "there is nothing left to cancel". */
function isAlreadyGone(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeError && err.code === "resource_missing";
}

/**
 * Stop billing before the account disappears.
 *
 * `user_trials` holds the only mapping from this user to her Stripe customer
 * and subscription, and we are about to delete it. If the subscription is still
 * live when that row goes, she keeps getting charged $59 every 8 weeks with no
 * record left tying the charge to anyone — and the renewal webhook can no
 * longer resolve a user_id, so its metadata-fallback insert fails the FK to a
 * now-deleted auth user.
 *
 * Cancelled immediately rather than at period end: her access dies with the
 * account, so there is nothing left to run out. No proration is requested —
 * refunds for unused time stay a manual support decision.
 *
 * Returns false if Stripe is reachable but refused, which aborts the deletion.
 * Leaving her data in place is recoverable; a live untraceable subscription is
 * not.
 */
async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
      return true;
    }
    await stripe.subscriptions.cancel(subscriptionId);
    return true;
  } catch (e) {
    if (isAlreadyGone(e)) return true;
    console.error("Account delete: Stripe cancel failed:", subscriptionId, e);
    return false;
  }
}

/**
 * POST /api/account/delete
 * Permanently deletes the authenticated user's account and all associated data.
 * Requires Bearer token (mobile) or cookie session (web).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const supabase = getSupabaseAdmin();

    // Read the billing link before anything deletes the row that holds it.
    const { data: trial } = await supabase
      .from("user_trials")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (trial?.stripe_subscription_id) {
      const canceled = await cancelSubscription(trial.stripe_subscription_id);
      if (!canceled) {
        return NextResponse.json(
          {
            error:
              "We could not cancel your subscription, so we have not deleted your account — deleting it now would keep billing you. Please try again or contact support.",
          },
          { status: 502 }
        );
      }
    }

    // Transcripts first, and fatally. Historically this was one warn-and-continue
    // entry in the loop below, which meant a failure here still deleted the auth
    // user and returned success, orphaning her chat history permanently with no
    // key left to find it by. The migration in
    // scripts/sql/2026-08-15-account-delete-cascade.sql gives conversations a
    // cascading FK too; this stays as the check that fails loudly.
    const { error: conversationsError } = await supabase
      .from("conversations")
      .delete()
      .eq("user_id", userId);

    if (conversationsError) {
      console.error("Account delete: conversations delete failed:", conversationsError);
      return NextResponse.json(
        { error: "Failed to delete account. Please try again or contact support." },
        { status: 500 }
      );
    }

    // The rest are all cascade-backed, so a failure here is recoverable by the
    // deleteUser below. Log and continue.
    for (const { table, column } of TABLES_TO_CLEAR) {
      const { error } = await supabase.from(table).delete().eq(column, userId);
      if (error) {
        console.warn(`Account delete: ${table} delete failed (cascade will cover it):`, error.message);
      }
    }

    // Deletes the auth user and cascades every remaining user-scoped row.
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Account delete: auth.admin.deleteUser failed:", authError);
      return NextResponse.json(
        { error: "Failed to delete account. Please try again or contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Account delete error:", e);
    return NextResponse.json(
      { error: "Failed to delete account. Please try again." },
      { status: 500 }
    );
  }
}
