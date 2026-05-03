import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { evaluateTrialStatus, type TrialRow } from "@/lib/checkTrialStatus";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/status
 * Canonical account/trial status for web + mobile clients.
 * Mobile uses this to decide whether to show the paywall — must be authoritative.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_trials")
    .select("trial_start, trial_end, trial_days, account_status, subscription_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("account/status DB error:", error);
    return NextResponse.json({ error: "Failed to load account status" }, { status: 500 });
  }

  const row = (data as TrialRow | null) ?? null;
  const decision = evaluateTrialStatus(row);
  const expired = decision === "paywall";

  return NextResponse.json({
    expired,
    decision,
    account_status: row?.account_status ?? null,
    trial_start: row?.trial_start ?? null,
    trial_end: row?.trial_end ?? null,
    trial_days: row?.trial_days ?? null,
    subscription_ends_at: row?.subscription_ends_at ?? null,
    has_onboarding: row !== null,
  });
}
