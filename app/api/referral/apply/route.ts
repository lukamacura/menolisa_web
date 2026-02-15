import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const MAX_REFERRED_AGE_MINUTES = 10;

/**
 * POST /api/referral/apply
 * Called server-side (e.g. from save-quiz) when a new user signs up with a referral code.
 * Body: { referredUserId: string, referralCode: string }
 * - Resolves code to referrer, inserts referral row, sets reward_applied_at. Referrer gets 50% off first subscription at checkout.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const referredUserId = body.referredUserId as string | undefined;
    const referralCode = (body.referralCode as string)?.trim();

    if (!referredUserId || !referralCode) {
      return NextResponse.json(
        { error: "referredUserId and referralCode are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: referrerProfile, error: codeError } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("referral_code", referralCode.toUpperCase())
      .maybeSingle();

    if (codeError || !referrerProfile) {
      return NextResponse.json(
        { error: "Invalid referral code" },
        { status: 400 }
      );
    }

    const referrerId = referrerProfile.user_id as string;
    if (referrerId === referredUserId) {
      return NextResponse.json(
        { error: "Cannot refer yourself" },
        { status: 400 }
      );
    }

    const { data: referredUser } = await supabaseAdmin.auth.admin.getUserById(
      referredUserId
    );
    if (referredUser?.user?.created_at) {
      const created = new Date(referredUser.user.created_at).getTime();
      const maxAge = MAX_REFERRED_AGE_MINUTES * 60 * 1000;
      if (Date.now() - created > maxAge) {
        return NextResponse.json(
          { error: "Referral must be applied shortly after signup" },
          { status: 400 }
        );
      }
    }

    const { data: referredTrial } = await supabaseAdmin
      .from("user_trials")
      .select("account_status")
      .eq("user_id", referredUserId)
      .maybeSingle();
    if (referredTrial?.account_status === "paid") {
      return NextResponse.json(
        { error: "Referral cannot be applied for an already subscribed account" },
        { status: 400 }
      );
    }

    const { data: existingReferral } = await supabaseAdmin
      .from("referrals")
      .select("id, reward_applied_at")
      .eq("referrer_id", referrerId)
      .eq("referred_id", referredUserId)
      .maybeSingle();

    let referralId: string;
    if (existingReferral) {
      referralId = existingReferral.id;
      if (existingReferral.reward_applied_at) {
        return NextResponse.json({ success: true, alreadyApplied: true });
      }
    } else {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("referrals")
        .insert({
          referrer_id: referrerId,
          referred_id: referredUserId,
        })
        .select("id")
        .single();

      if (insertErr) {
        if (insertErr.code === "23505") {
          return NextResponse.json({ success: true, alreadyApplied: true });
        }
        console.error("Referral insert error:", insertErr);
        return NextResponse.json(
          { error: "Failed to record referral" },
          { status: 500 }
        );
      }
      referralId = inserted.id;
    }

    const now = new Date();
    await supabaseAdmin
      .from("referrals")
      .update({ reward_applied_at: now.toISOString() })
      .eq("id", referralId);

    await supabaseAdmin.from("notifications").insert({
      user_id: referrerId,
      type: "referral_reward",
      title: "Your friend signed up!",
      message: "You've earned 50% off your first subscription when you upgrade.",
      priority: "medium",
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/referral/apply error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
