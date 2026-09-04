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
  // Her first name comes along because this is the one endpoint the app polls
  // for "who is this and what may she see". The alternative was a second call
  // from every screen that wants to address her by name, which is how a hot
  // path picks up an extra round trip per render.
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabase
      .from("user_trials")
      // `trial_ends_at` comes from scripts/sql/2026-09-04-free-trial.sql;
      // naming it before that runs fails this read for every caller, app
      // included. Apply the migration before deploying.
      .select(`${TRIAL_SELECT_COLS}, trial_ends_at`)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("name, training_time")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (error && error.code !== "PGRST116") {
    console.error("account/status DB error:", error);
    return NextResponse.json({ error: "Failed to load account status" }, { status: 500 });
  }

  const row =
    (data as (TrialRow & AccountStateRow & { trial_ends_at?: string | null }) | null) ?? null;
  const decision = evaluateTrialStatus(row);
  const expired = decision === "paywall";
  const account = getAccountState(row);
  // The free trial, for a client that wants to say "first charge" rather than
  // "renews". Nothing in the app *needs* it: a trialing row is an ordinary
  // paid subscriber whose period ends in TRIAL_DAYS days, and `days_left` already
  // says so.
  const trialEndsAt = row?.trial_ends_at ?? null;
  const inTrial =
    !!trialEndsAt &&
    !!account.endsAt &&
    new Date(trialEndsAt).getTime() === account.endsAt.getTime() &&
    account.hasAccess;

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
    trial_ends_at: trialEndsAt,
    in_trial: inTrial,
    has_onboarding: row !== null,
    // First name only, already trimmed. Null when the quiz never captured one —
    // every surface that uses it must read fine without it.
    first_name: (profile?.name ?? "").trim().split(" ")[0] || null,
    // "morning" | "midday" | "evening" — when she said she trains, which is what
    // the app's local movement reminder is scheduled against. Null for every
    // account that predates the question; the app falls back to an evening
    // reminder, which is what everybody got before it existed.
    training_time: profile?.training_time ?? null,
  });
}
