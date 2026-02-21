import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/referral/discount-eligible
 * Returns whether the current user is eligible for the one-time 50% referral discount.
 *
 * inviteCopyState values:
 *   "no_referrals"      — trial user, no referrals yet → show "50% OFF first subscription" to motivate
 *   "eligible"          — has referrals, discount not used, not paid → "50% OFF first subscription"
 *   "already_subscribed"— has referrals, discount not used, already paid → "50% OFF next payment"
 *   "already_used"      — referral coupon was applied at checkout (one-time, done) → friend benefit only
 *   "subscribed"        — paid subscriber with no referrals → friend benefit only
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

    // eligible = can use discount at next checkout
    const eligible = hasReferred && discountNotUsed && !isPaid;

    let inviteCopyState: "eligible" | "already_used" | "already_subscribed" | "no_referrals" | "subscribed";

    if (!hasReferred) {
      // No friends signed up yet
      inviteCopyState = isPaid ? "subscribed" : "no_referrals";
    } else if (!discountNotUsed) {
      // referral_discount_used_at is set — coupon was applied at checkout, one-time done
      inviteCopyState = "already_used";
    } else if (isPaid) {
      // Earned the discount but subscribed before using it — pending for next payment
      inviteCopyState = "already_subscribed";
    } else {
      // Has referrals, discount not used, not yet paid — will be applied at next checkout
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
