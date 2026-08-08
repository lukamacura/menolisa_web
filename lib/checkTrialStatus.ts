import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  getAccountState,
  stateAllowsAccess,
  TRIAL_SELECT_COLS,
  type AccountStateRow,
} from "./getAccountState";

export { TRIAL_SELECT_COLS };

export type TrialRow = {
  account_status: string | null;
  subscription_ends_at: string | null;
  subscription_canceled?: boolean | null;
  payment_failed_at?: string | null;
  dispute_flagged_at?: string | null;
  stripe_subscription_id?: string | null;
  provider?: string | null;
};

export type TrialDecision = "allow" | "paywall" | "no-onboarding";

const SELECT_COLS = TRIAL_SELECT_COLS;

export function evaluateTrialStatus(row: TrialRow | null): TrialDecision {
  if (!row) return "no-onboarding";
  const { state } = getAccountState(row as AccountStateRow);
  return stateAllowsAccess(state) ? "allow" : "paywall";
}

/**
 * The gate every paid API route calls. Returns true when access must be denied.
 *
 * Fails **closed**: no row, a query error, or an unreadable table all deny.
 * The alternative locks out nobody but hands the whole product to anyone
 * holding a session — a user with no `user_trials` row has not paid, and a
 * database we cannot read is not evidence that they did.
 */
export async function checkTrialExpired(userId: string): Promise<boolean> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_trials")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("checkTrialExpired: user_trials read failed, denying access:", error);
      return true;
    }

    // "no-onboarding" (no row) denies too — only an explicit "allow" opens the gate.
    return evaluateTrialStatus(data as TrialRow | null) !== "allow";
  } catch (err) {
    console.error("checkTrialExpired: unexpected failure, denying access:", err);
    return true;
  }
}
