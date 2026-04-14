import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

const MS = {
  SECOND: 1000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
};

export type TrialStatus = {
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
  loading: boolean;
  error: string | null;
};

export function useTrialStatus(): TrialStatus & { refetch: () => Promise<void> } {
  const [trialStatus, setTrialStatus] = useState<TrialStatus>({
    expired: false,
    start: null,
    end: null,
    daysLeft: 3,
    elapsedDays: 0,
    progressPct: 0,
    remaining: { d: 3, h: 0, m: 0, s: 0 },
    accountStatus: "trial",
    subscriptionCanceled: false,
    paymentFailedAt: null,
    loading: true,
    error: null,
  });
  const [now, setNow] = useState<Date>(new Date());

  // Ticker for live countdown — 1s precision only when < 1 day remaining, else 1 min
  useEffect(() => {
    const interval =
      trialStatus.remaining.d === 0 ? MS.SECOND : MS.MINUTE;
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
  }, [trialStatus.remaining.d]);

  const fetchUserTrial = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_trials")
        .select("trial_start, trial_end, trial_days, account_status, subscription_ends_at, subscription_canceled, payment_failed_at")
        .eq("user_id", userId)
        .single();

      if (error) {
        // Check if table doesn't exist
        const errorMsg = error.message?.toLowerCase() || "";
        const isTableMissing = errorMsg.includes("does not exist") || 
                               errorMsg.includes("relation") ||
                               error.code === "42P01";
        
        if (isTableMissing) {
          // Table doesn't exist yet - return defaults silently
          return {
            trial_start: new Date().toISOString(),
            trial_end: null,
            trial_days: 3,
            account_status: "trial",
          };
        }
        
        // If row doesn't exist (PGRST116), try to create it
        if (error.code === "PGRST116") {
          const nowIso = new Date().toISOString();
          const { data: newTrial, error: insertError } = await supabase
            .from("user_trials")
            .insert([
              {
                user_id: userId,
                trial_start: nowIso,
                trial_days: 3,
                account_status: "trial",
              },
            ])
            .select("trial_start, trial_end, trial_days, account_status")
            .single();

          if (insertError) {
            // If insert fails, return defaults
            return {
              trial_start: nowIso,
              trial_end: null,
              trial_days: 3,
              account_status: "trial",
            };
          }
          return newTrial;
        }
        
        // Any other error - return defaults silently
        return {
          trial_start: new Date().toISOString(),
          trial_end: null,
          trial_days: 3,
          account_status: "trial",
        };
      }

      // If trial_start is null, initialize it
      if (!data.trial_start) {
        const nowIso = new Date().toISOString();
        const { data: updated, error: updateError } = await supabase
          .from("user_trials")
          .update({
            trial_start: nowIso,
            trial_days: data.trial_days || 3,
            account_status: "trial",
          })
          .eq("user_id", userId)
          .select("trial_start, trial_end, trial_days, account_status")
          .single();

        if (updateError) {
          return {
            trial_start: nowIso,
            trial_end: null,
            trial_days: data.trial_days || 3,
            account_status: "trial",
          };
        }
        return updated;
      }

      return data;
    } catch {
      // Silently return defaults on any error
      return {
        trial_start: new Date().toISOString(),
        trial_end: null,
        trial_days: 3,
        account_status: "trial",
      };
    }
  }, []);

  // Store the raw trial data separately from calculated values
  const [trialData, setTrialData] = useState<{
    trialDays: number;
    start: Date | null;
    end: Date | null;
    accountStatus: string;
    subscriptionEndsAt: Date | null;
    subscriptionCanceled: boolean;
    paymentFailedAt: Date | null;
  } | null>(null);

  const notAuthenticatedState: TrialStatus = {
    expired: false,
    start: null,
    end: null,
    daysLeft: 3,
    elapsedDays: 0,
    progressPct: 0,
    remaining: { d: 3, h: 0, m: 0, s: 0 },
    accountStatus: "trial",
    subscriptionCanceled: false,
    paymentFailedAt: null,
    loading: false,
    error: "User not authenticated",
  };

  const loadTrial = useCallback(async () => {
    setTrialStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        setTrialStatus(notAuthenticatedState);
        return;
      }

      let userTrial = await fetchUserTrial(userId);
      // Sync subscription from Stripe for paid users so "Access until" is correct even if webhook missed
      if (userTrial.account_status === "paid") {
        try {
          await fetch("/api/stripe/sync-subscription", { method: "POST", credentials: "include" });
          userTrial = await fetchUserTrial(userId);
        } catch {
          // ignore sync errors; use existing data
        }
      }
      const trialDays = userTrial.trial_days || 3;
      const start = userTrial.trial_start ? new Date(userTrial.trial_start) : null;
      const end = userTrial.trial_end ? new Date(userTrial.trial_end) : null;
      const subEnd = (userTrial as { subscription_ends_at?: string | null }).subscription_ends_at;
      const subscriptionEndsAt = subEnd ? new Date(subEnd) : null;
      const subscriptionCanceled = !!(userTrial as { subscription_canceled?: boolean }).subscription_canceled;
      const paymentFailedAtRaw = (userTrial as { payment_failed_at?: string | null }).payment_failed_at;
      const paymentFailedAt = paymentFailedAtRaw ? new Date(paymentFailedAtRaw) : null;

      setTrialData({
        trialDays,
        start,
        end,
        accountStatus: userTrial.account_status || "trial",
        subscriptionEndsAt,
        subscriptionCanceled,
        paymentFailedAt,
      });
      setTrialStatus((prev) => ({ ...prev, loading: false }));
    } catch (e) {
      setTrialStatus((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    }
  }, [fetchUserTrial]);

  // Fetch trial data on mount
  useEffect(() => {
    loadTrial();
  }, [loadTrial]);

  // Update calculations based on current time (runs every second but doesn't re-fetch)
  useEffect(() => {
    if (!trialData || trialStatus.loading) return;

    const { trialDays, start, end, accountStatus, subscriptionEndsAt, subscriptionCanceled, paymentFailedAt } = trialData;
    const nowTs = now.getTime();

    // Paid: expire only when subscription_ends_at is past; show subscription end as "end"
    if (accountStatus === "paid") {
      const endTs = subscriptionEndsAt ? subscriptionEndsAt.getTime() : nowTs + 365 * MS.DAY;
      const remainingMs = Math.max(0, endTs - nowTs);
      const expired = subscriptionEndsAt ? subscriptionEndsAt.getTime() < nowTs : false;
      const daysLeft = Math.max(0, Math.ceil(remainingMs / MS.DAY));
      const d = Math.floor(remainingMs / MS.DAY);
      const h = Math.floor((remainingMs % MS.DAY) / MS.HOUR);
      const m = Math.floor((remainingMs % MS.HOUR) / MS.MINUTE);
      const s = Math.floor((remainingMs % MS.MINUTE) / MS.SECOND);
      setTrialStatus({
        expired,
        start: start ?? new Date(nowTs - MS.DAY),
        end: subscriptionEndsAt ?? new Date(endTs),
        daysLeft,
        elapsedDays: 0,
        progressPct: 0,
        remaining: { d, h, m, s },
        trialDays,
        accountStatus: "paid",
        subscriptionCanceled,
        paymentFailedAt,
        loading: false,
        error: null,
      });
      return;
    }

    if (!start) {
      setTrialStatus({
        expired: false,
        start: null,
        end: null,
        daysLeft: trialDays,
        elapsedDays: 0,
        progressPct: 0,
        remaining: { d: trialDays, h: 0, m: 0, s: 0 },
        trialDays,
        accountStatus: accountStatus ?? "trial",
        subscriptionCanceled: false,
        paymentFailedAt,
        loading: false,
        error: null,
      });
      return;
    }

    const endTs = end ? end.getTime() : start.getTime() + trialDays * MS.DAY;
    const startTs = start.getTime();
    const remainingMs = Math.max(0, endTs - nowTs);
    const expired: boolean =
      accountStatus === "expired" ||
      remainingMs === 0 ||
      (end !== null && end.getTime() < nowTs);

    const elapsedDays = Math.floor((nowTs - startTs) / MS.DAY);
    const daysLeft = Math.max(0, Math.ceil(remainingMs / MS.DAY));
    const progressPct = Math.min(100, (elapsedDays / trialDays) * 100);

    const d = Math.floor(remainingMs / MS.DAY);
    const h = Math.floor((remainingMs % MS.DAY) / MS.HOUR);
    const m = Math.floor((remainingMs % MS.HOUR) / MS.MINUTE);
    const s = Math.floor((remainingMs % MS.MINUTE) / MS.SECOND);

    setTrialStatus({
      expired,
      start,
      end: new Date(endTs),
      daysLeft,
      elapsedDays,
      progressPct,
      remaining: { d, h, m, s },
      trialDays,
      accountStatus: accountStatus ?? "trial",
      subscriptionCanceled: false,
      paymentFailedAt,
      loading: false,
      error: null,
    });
  }, [trialData, now, trialStatus.loading]);

  return { ...trialStatus, refetch: loadTrial };
}

export type UseTrialStatusReturn = TrialStatus & { refetch: () => Promise<void> };

