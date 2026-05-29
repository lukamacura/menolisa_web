import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateTrialStatus, type TrialRow } from "@/lib/checkTrialStatus";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().max(254),
});

const SELECT_COLS =
  "trial_start, trial_end, trial_days, account_status, subscription_ends_at, subscription_canceled, payment_failed_at, dispute_flagged_at, stripe_subscription_id, provider";

// Pre-OTP gate for the register funnel: tells the client whether this email already
// belongs to an account with active access (paid/trialing/etc) so it can send them to
// /login instead of re-running the quiz + paywall. Returns a boolean only — never the
// user id — to limit enumeration. Unpaid / non-existent emails fall through to signup.
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const supabaseAdmin = getSupabaseAdmin();

    const { data: userId, error: lookupError } = await supabaseAdmin.rpc(
      "user_id_by_email",
      { p_email: email }
    );
    if (lookupError) {
      console.error("check-account: email lookup failed:", lookupError);
      // Fail open — let registration proceed rather than blocking a new user.
      return NextResponse.json({ hasAccount: false });
    }
    if (!userId) {
      return NextResponse.json({ hasAccount: false });
    }

    const { data: trial } = await supabaseAdmin
      .from("user_trials")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .maybeSingle();

    const hasAccount = evaluateTrialStatus(trial as TrialRow | null) === "allow";
    return NextResponse.json({ hasAccount });
  } catch (error) {
    console.error("check-account error:", error);
    return NextResponse.json({ hasAccount: false });
  }
}
