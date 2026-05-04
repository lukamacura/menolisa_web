import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/referral/discount-eligible
 * Returns whether the current user is eligible for the one-time 50% referral discount.
 *
 * inviteCopyState values:
 *   "no_referrals"  — no referrals yet, not paid (legacy users) → motivational copy
 *   "eligible"      — has referrals, discount not yet consumed → coupon sits on Stripe customer for next invoice
 *   "already_used"  — referral discount has already been consumed by an invoice → friend benefit only
 *   "subscribed"    — paid subscriber with no referrals → friend benefit only
 *
 * Auth: cookie (web) or Bearer (mobile).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [refRes, trialRes] = await Promise.all([
      supabaseAdmin.from("referrals").select("id").eq("referrer_id", user.id).limit(1),
      supabaseAdmin
        .from("user_trials")
        .select("referral_discount_used_at, account_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const hasReferred = (refRes.data?.length ?? 0) > 0;
    const discountNotUsed = trialRes.data?.referral_discount_used_at == null;
    const accountStatus = trialRes.data?.account_status ?? null;
    const isPaid = accountStatus === "paid";

    // eligible = a referral coupon is (or will be) sitting on the Stripe customer waiting for the next invoice
    const eligible = hasReferred && discountNotUsed;

    let inviteCopyState: "eligible" | "already_used" | "no_referrals" | "subscribed";

    if (!hasReferred) {
      inviteCopyState = isPaid ? "subscribed" : "no_referrals";
    } else if (!discountNotUsed) {
      inviteCopyState = "already_used";
    } else {
      inviteCopyState = "eligible";
    }

    return NextResponse.json({
      eligible,
      inviteCopyState,
      discountAlreadyUsed: !discountNotUsed,
      accountStatus,
    });
  } catch (e) {
    console.error("GET /api/referral/discount-eligible error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
