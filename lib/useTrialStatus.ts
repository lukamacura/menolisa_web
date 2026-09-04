import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabaseClient";
import {
  getAccountState,
  TRIAL_SELECT_COLS,
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
  /** End of the paid period. */
  end: Date | null;
  daysLeft: number;
  remaining: { d: number; h: number; m: number; s: number };
  accountStatus: string;
  /** True when subscription is set to cancel (show "Access until" not "Renews") */
  subscriptionCanceled: boolean;
  /** Set when Stripe's last renewal attempt failed. Null once the customer updates their card. */
  paymentFailedAt: Date | null;
  /** True when the user has ever had a paid Stripe sub — switches "trial ended" vs "subscription ended" copy. */
  previouslyPaid: boolean;
  /** True for Apple/Google IAP. Web should not show "Manage subscription" (Stripe portal). */
  isThirdPartyProvider: boolean;
  /**
   * True while the subscription is in its free trial — `trial_ends_at` equals
   * the period end. Switches the account card from "Renews" to "Free trial
   * ends", which is the difference between money she has paid and money she
   * has not.
   */
  inTrial: boolean;
  loading: boolean;
  error: string | null;
};

/**
 * `trial_ends_at` rides along for the copy. Its column is added by
 * scripts/sql/2026-09-04-free-trial.sql — a select naming a column that does
 * not exist fails the whole read, which this hook turns into "no row", which
 * the dashboard turns into a paywall for every paying customer. The migration
 * is not optional.
 */
const SELECT_COLS = `${TRIAL_SELECT_COLS}, trial_ends_at`;

type TrialRowWithTrial = AccountStateRow & { trial_ends_at?: string | null };

export function useTrialStatus(): TrialStatus & { refetch: () => Promise<void> } {
  const [trialStatus, setTrialStatus] = useState<TrialStatus>({
    state: "ended",
    expired: true,
    end: null,
    daysLeft: 0,
    remaining: { d: 0, h: 0, m: 0, s: 0 },
    accountStatus: "pending_payment",
    subscriptionCanceled: false,
    paymentFailedAt: null,
    previouslyPaid: false,
    isThirdPartyProvider: false,
    inTrial: false,
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
        const supabase = await getSupabase();
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

  // `undefined` = not yet fetched (keeps loading=true);
  // `null` = fetched, no row; object = fetched row.
  // Distinguishing these prevents a render where loading=false but `state` is still
  // the stale initial "ended" — which causes dashboard layout's gate to redirect to /paywall
  // before the derived effect below recomputes state. That redirect ping-pongs with /paywall's
  // own "has_access → /dashboard" redirect, creating an infinite loop.
  const [trialData, setTrialData] = useState<AccountStateRow | null | undefined>(undefined);
  const [didSync, setDidSync] = useState(false);

  const loadTrial = useCallback(async () => {
    setTrialStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const supabase = await getSupabase();
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
      // Setting trialData triggers the derived effect, which atomically writes
      // both the computed `state` and `loading: false` in one setTrialStatus call.
      setTrialData(row);
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
    if (trialData === undefined) return;

    const account = getAccountState(trialData, now);
    const subscriptionCanceled = !!trialData?.subscription_canceled;
    const trialEndsAt = (trialData as TrialRowWithTrial | null)?.trial_ends_at ?? null;
    const inTrial =
      !!trialEndsAt &&
      !!account.endsAt &&
      new Date(trialEndsAt).getTime() === account.endsAt.getTime() &&
      account.hasAccess;
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

    setTrialStatus({
      state: account.state,
      expired: !account.hasAccess,
      end: endsAt,
      daysLeft,
      remaining: { d, h, m, s },
      accountStatus: trialData?.account_status ?? "pending_payment",
      subscriptionCanceled,
      paymentFailedAt,
      previouslyPaid: account.previouslyPaid,
      isThirdPartyProvider: account.isThirdPartyProvider,
      inTrial,
      loading: false,
      error: null,
    });
  }, [trialData, now]);

  return { ...trialStatus, refetch: loadTrial };
}

;
