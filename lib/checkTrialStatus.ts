import { getSupabaseAdmin } from "./supabaseAdmin";
import { getAccountState, stateAllowsAccess, type AccountStateRow } from "./getAccountState";

export type TrialRow = {
  trial_start: string | null;
  trial_end: string | null;
  trial_days: number | null;
  account_status: string | null;
  subscription_ends_at: string | null;
  subscription_canceled?: boolean | null;
  payment_failed_at?: string | null;
  dispute_flagged_at?: string | null;
  stripe_subscription_id?: string | null;
  provider?: string | null;
};

export type TrialDecision = "allow" | "paywall" | "no-onboarding";

const SELECT_COLS =
  "trial_start, trial_end, trial_days, account_status, subscription_ends_at, subscription_canceled, payment_failed_at, dispute_flagged_at, stripe_subscription_id, provider";

export function evaluateTrialStatus(row: TrialRow | null): TrialDecision {
  if (!row) return "no-onboarding";
  const { state } = getAccountState(row as AccountStateRow);
  return stateAllowsAccess(state) ? "allow" : "paywall";
}

export async function checkTrialExpired(userId: string): Promise<boolean> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_trials")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (error.code === "PGRST116" || error.message?.toLowerCase().includes("does not exist")) {
        return false;
      }
      return false;
    }

    return evaluateTrialStatus(data as TrialRow | null) === "paywall";
  } catch {
    return false;
  }
}
