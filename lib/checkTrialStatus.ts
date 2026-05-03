import { getSupabaseAdmin } from "./supabaseAdmin";

export type TrialRow = {
  trial_start: string | null;
  trial_end: string | null;
  trial_days: number | null;
  account_status: string | null;
  subscription_ends_at: string | null;
};

export type TrialDecision = "allow" | "paywall" | "no-onboarding";

export function evaluateTrialStatus(row: TrialRow | null): TrialDecision {
  if (!row) return "no-onboarding";

  const status = row.account_status;

  if (status === "paid") {
    if (row.subscription_ends_at) {
      const end = new Date(row.subscription_ends_at);
      if (end < new Date()) return "paywall";
    }
    return "allow";
  }

  if (status === "expired") return "paywall";
  if (status === "pending_payment") return "paywall";

  if (row.trial_end) {
    if (new Date(row.trial_end) < new Date()) return "paywall";
    return "allow";
  }

  if (row.trial_start) {
    const trialDays = row.trial_days ?? 3;
    const trialEnd = new Date(row.trial_start);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    if (trialEnd < new Date()) return "paywall";
    return "allow";
  }

  return "allow";
}

export async function checkTrialExpired(userId: string): Promise<boolean> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_trials")
      .select("trial_start, trial_end, trial_days, account_status, subscription_ends_at")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116" || error.message?.toLowerCase().includes("does not exist")) {
        return false;
      }
      return false;
    }

    return evaluateTrialStatus(data as TrialRow) === "paywall";
  } catch {
    return false;
  }
}
