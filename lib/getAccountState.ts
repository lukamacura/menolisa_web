/**
 * Canonical account state derivation.
 *
 * All access decisions and UI branching go through getAccountState().
 * One enum, one helper, consumed by API, hooks, and components.
 */

export type AccountState =
  | "trialing"   // Stripe sub status=trialing, card on file, not yet charged
  | "active"     // paying subscriber, renews normally
  | "canceling"  // paid but cancel_at_period_end=true; access until endsAt
  | "past_due"   // last invoice failed; Stripe retrying; keep access
  | "ended"      // sub deleted / no row / pending checkout — paywall
  | "disputed";  // chargeback opened — locked

export type AccountStateRow = {
  account_status: string | null;
  subscription_ends_at: string | null;
  subscription_canceled: boolean | null;
  payment_failed_at: string | null;
  dispute_flagged_at?: string | null;
  trial_start: string | null;
  trial_end: string | null;
  trial_days: number | null;
  stripe_subscription_id?: string | null;
  provider?: string | null;
};

export type AccountStateResult = {
  state: AccountState;
  /** Access cutoff (subscription end, trial end, or null when no upcoming boundary). */
  endsAt: Date | null;
  /** Whole days until endsAt, floored at 0. Null when endsAt is null. */
  daysLeft: number | null;
  /** True when the user has ever had a paid/active Stripe sub — used to switch ended copy. */
  previouslyPaid: boolean;
  /** True when this account is on a non-Stripe provider (Apple/Google IAP). */
  isThirdPartyProvider: boolean;
  /** True when the user keeps access (UI shows TrialCard, not paywall). */
  hasAccess: boolean;
};

const DAY_MS = 86_400_000;

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

export function getAccountState(
  row: AccountStateRow | null,
  now: Date = new Date()
): AccountStateResult {
  // No row at all → ended (middleware should redirect to /register).
  if (!row) {
    return {
      state: "ended",
      endsAt: null,
      daysLeft: null,
      previouslyPaid: false,
      isThirdPartyProvider: false,
      hasAccess: false,
    };
  }

  const provider = (row.provider ?? "stripe").toLowerCase();
  const isThirdPartyProvider = provider === "apple" || provider === "google";
  const previouslyPaid = !!row.stripe_subscription_id || provider !== "stripe";

  const subEnd = toDate(row.subscription_ends_at);
  const trialEnd = toDate(row.trial_end);
  // Prefer the subscription end (Stripe authoritative); fall back to trial_end.
  const endsAt = subEnd ?? trialEnd;

  // Disputes lock the account regardless of other flags.
  if (row.dispute_flagged_at) {
    return {
      state: "disputed",
      endsAt,
      daysLeft: endsAt ? daysBetween(now, endsAt) : null,
      previouslyPaid,
      isThirdPartyProvider,
      hasAccess: false,
    };
  }

  const status = row.account_status;

  // Hard-ended states: Stripe deleted the sub, or user never finished checkout.
  if (status === "expired" || status === "pending_payment") {
    return {
      state: "ended",
      endsAt,
      daysLeft: endsAt ? daysBetween(now, endsAt) : null,
      previouslyPaid,
      isThirdPartyProvider,
      hasAccess: false,
    };
  }

  if (status === "paid") {
    // Paid sub whose period has elapsed silently — treat as ended.
    if (subEnd && subEnd.getTime() < now.getTime()) {
      return {
        state: "ended",
        endsAt: subEnd,
        daysLeft: 0,
        previouslyPaid: true,
        isThirdPartyProvider,
        hasAccess: false,
      };
    }

    // Trial still running? trial_end is set during the Stripe trial period.
    const inTrial = !!trialEnd && trialEnd.getTime() > now.getTime();

    if (row.payment_failed_at) {
      return {
        state: "past_due",
        endsAt,
        daysLeft: endsAt ? daysBetween(now, endsAt) : null,
        previouslyPaid: true,
        isThirdPartyProvider,
        hasAccess: true,
      };
    }

    if (row.subscription_canceled) {
      return {
        state: "canceling",
        endsAt,
        daysLeft: endsAt ? daysBetween(now, endsAt) : null,
        previouslyPaid: true,
        isThirdPartyProvider,
        hasAccess: true,
      };
    }

    if (inTrial) {
      return {
        state: "trialing",
        endsAt: trialEnd,
        daysLeft: trialEnd ? daysBetween(now, trialEnd) : null,
        previouslyPaid: false,
        isThirdPartyProvider,
        hasAccess: true,
      };
    }

    return {
      state: "active",
      endsAt,
      daysLeft: endsAt ? daysBetween(now, endsAt) : null,
      previouslyPaid: true,
      isThirdPartyProvider,
      hasAccess: true,
    };
  }

  // Unknown / null status → fail closed.
  return {
    state: "ended",
    endsAt,
    daysLeft: endsAt ? daysBetween(now, endsAt) : null,
    previouslyPaid,
    isThirdPartyProvider,
    hasAccess: false,
  };
}

/** Convenience: a state qualifies for the dashboard? */
export function stateAllowsAccess(state: AccountState): boolean {
  return state === "trialing" || state === "active" || state === "canceling" || state === "past_due";
}
