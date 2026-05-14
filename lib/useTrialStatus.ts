import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  getAccountState,
  type AccountState,
  type AccountStateRow,
} from "./getAccountState";

const MS = {
  SECOND: 1000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
};

export type TrialStatus = {
  /** Canonical state — branch UI on this, not on `accountStatus`. */
  state: AccountState;
  /** True iff the user has no access (state === ended | disputed). */
  expired: boolean;
  start: Date | null;
  end: Date | null;
  daysLeft: number;
  elapsedDays: number;
  progressPct: number;
  remaining: { d: number; h: number; m: number; s: number };
  trialDays?: number;
  accountStatus: string;
  /** True when subscription is set to cancel (show "Access until" not "Renews") */
  subscriptionCanceled: boolean;
  /** Set when Stripe's last renewal attempt failed. Null once the customer updates their card. */
  paymentFailedAt: Date | null;
  /** True when the user has ever had a paid Stripe sub — switches "trial ended" vs "subscription ended" copy. */
  previouslyPaid: boolean;
  /** True for Apple/Google IAP. Web should not show "Manage subscription" (Stripe portal). */
  isThirdPartyProvider: boolean;
  loading: boolean;
  error: string | null;
};

const SELECT_COLS =
  "trial_start, trial_end, trial_days, account_status, subscription_ends_at, subscription_canceled, payment_failed_at, dispute_flagged_at, stripe_subscription_id, provider";

export function useTrialStatus(): TrialStatus & { refetch: () => Promise<void> } {
  const [trialStatus, setTrialStatus] = useState<TrialStatus>({
    state: "ended",
    expired: true,
    start: null,
    end: null,
    daysLeft: 0,
    elapsedDays: 0,
    progressPct: 0,
    remaining: { d: 0, h: 0, m: 0, s: 0 },
    accountStatus: "pending_payment",
    subscriptionCanceled: false,
    paymentFailedAt: null,
    previouslyPaid: false,
    isThirdPartyProvider: false,
    loading: true,
    error: null,
  });
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = trialStatus.remaining.d === 0 ? MS.SECOND : MS.MINUTE;
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
  }, [trialStatus.remaining.d]);

  const fetchUserTrial = useCallback(
    async (userId: string): Promise<AccountStateRow | null> => {
      try {
        const { data, error } = await supabase
          .from("user_trials")
          .select(SELECT_COLS)
          .eq("user_id", userId)
          .maybeSingle();

        if (error) return null;
        return (data as AccountStateRow | null) ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  const [trialData, setTrialData] = useState<AccountStateRow | null>(null);
  const [didSync, setDidSync] = useState(false);

  const loadTrial = useCallback(async () => {
    setTrialStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        setTrialData(null);
        setTrialStatus((prev) => ({
          ...prev,
          loading: false,
          error: "User not authenticated",
        }));
        return;
      }

      let row = await fetchUserTrial(userId);
      // One-shot Stripe sync for paid rows so endsAt is fresh after a missed webhook.
      if (!didSync && row?.account_status === "paid") {
        try {
          await fetch("/api/stripe/sync-subscription", {
            method: "POST",
            credentials: "include",
          });
          row = await fetchUserTrial(userId);
        } catch {
          // ignore — fall through with stale row
        }
        setDidSync(true);
      }
      setTrialData(row);
      setTrialStatus((prev) => ({ ...prev, loading: false }));
    } catch (e) {
      setTrialStatus((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    }
  }, [fetchUserTrial, didSync]);

  useEffect(() => {
    loadTrial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute derived values whenever data or `now` change.
  useEffect(() => {
    if (trialStatus.loading) return;

    const account = getAccountState(trialData, now);
    const trialDays = trialData?.trial_days ?? 3;
    const start = trialData?.trial_start ? new Date(trialData.trial_start) : null;
    const subscriptionCanceled = !!trialData?.subscription_canceled;
    const paymentFailedAt = trialData?.payment_failed_at
      ? new Date(trialData.payment_failed_at)
      : null;

    const endsAt = account.endsAt;
    const nowTs = now.getTime();
    const remainingMs = endsAt ? Math.max(0, endsAt.getTime() - nowTs) : 0;
    const d = Math.floor(remainingMs / MS.DAY);
    const h = Math.floor((remainingMs % MS.DAY) / MS.HOUR);
    const m = Math.floor((remainingMs % MS.HOUR) / MS.MINUTE);
    const s = Math.floor((remainingMs % MS.MINUTE) / MS.SECOND);
    const daysLeft = Math.max(0, Math.ceil(remainingMs / MS.DAY));

    // Progress only meaningful during trialing — based on trial_start + trial_days.
    let elapsedDays = 0;
    let progressPct = 0;
    if (account.state === "trialing" && start) {
      elapsedDays = Math.floor((nowTs - start.getTime()) / MS.DAY);
      progressPct = Math.min(100, Math.max(0, (elapsedDays / trialDays) * 100));
    }

    setTrialStatus({
      state: account.state,
      expired: !account.hasAccess,
      start,
      end: endsAt,
      daysLeft,
      elapsedDays,
      progressPct,
      remaining: { d, h, m, s },
      trialDays,
      accountStatus: trialData?.account_status ?? "pending_payment",
      subscriptionCanceled,
      paymentFailedAt,
      previouslyPaid: account.previouslyPaid,
      isThirdPartyProvider: account.isThirdPartyProvider,
      loading: false,
      error: null,
    });
  }, [trialData, now, trialStatus.loading]);

  return { ...trialStatus, refetch: loadTrial };
}

export type UseTrialStatusReturn = TrialStatus & { refetch: () => Promise<void> };
