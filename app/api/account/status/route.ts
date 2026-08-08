import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  evaluateTrialStatus,
  TRIAL_SELECT_COLS,
  type TrialRow,
} from "@/lib/checkTrialStatus";
import { getAccountState, type AccountStateRow } from "@/lib/getAccountState";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/status
 * Canonical account/trial status for web + mobile clients.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_trials")
    .select(TRIAL_SELECT_COLS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("account/status DB error:", error);
    return NextResponse.json({ error: "Failed to load account status" }, { status: 500 });
  }

  const row = (data as (TrialRow & AccountStateRow) | null) ?? null;
  const decision = evaluateTrialStatus(row);
  const expired = decision === "paywall";
  const account = getAccountState(row);

  return NextResponse.json({
    expired,
    decision,
    state: account.state,
    ends_at: account.endsAt ? account.endsAt.toISOString() : null,
    days_left: account.daysLeft,
    previously_paid: account.previouslyPaid,
    is_third_party_provider: account.isThirdPartyProvider,
    has_access: account.hasAccess,
    account_status: row?.account_status ?? null,
    subscription_ends_at: row?.subscription_ends_at ?? null,
    subscription_canceled: row?.subscription_canceled ?? false,
    payment_failed_at: row?.payment_failed_at ?? null,
    has_onboarding: row !== null,
  });
}
