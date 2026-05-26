"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CreditCard } from "lucide-react";
import type { AccountState } from "@/lib/getAccountState";

export type { AccountState };

// Legacy export — superset that still accepts old visual names from older callers.
// New code should use AccountState directly.
export type TrialState = AccountState | "calm" | "warning" | "urgent" | "subscriber" | "expired";

export interface TrialCardProps {
  trial: {
    expired: boolean;
    start: Date | null;
    end: Date | null;
    daysLeft: number;
    elapsedDays: number;
    progressPct: number;
    remaining: { d: number; h: number; m: number; s: number };
    trialDays?: number;
  };
  /** Canonical state — preferred. If omitted, derived from accountStatus + flags. */
  accountState?: AccountState;
  accountStatus?: string;
  subscriptionCanceled?: boolean;
  paymentFailedAt?: Date | null;
  isThirdPartyProvider?: boolean;
}

function formatCountdown(remaining: { d: number; h: number; m: number }): string {
  if (remaining.d === 0) return `${remaining.h}h ${remaining.m}m remaining`;
  return `${remaining.d}d ${remaining.h}h ${remaining.m}m`;
}

type Visuals = {
  background: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  badgeLabel: string;
  progressBar: string;
  buttonStyle: string;
  title: string;
};

function visualsFor(state: AccountState, daysLeft: number): Visuals {
  if (state === "trialing") {
    if (daysLeft <= 0) {
      return {
        background: "from-red-900 via-red-950 to-gray-900",
        badgeBg: "bg-red-500/30",
        badgeText: "text-red-300",
        badgeBorder: "border-red-500/50",
        badgeLabel: "Trial ends today",
        progressBar: "from-red-500 to-red-600",
        buttonStyle: "bg-red-500 hover:bg-red-600 !text-white border border-red-400/50 w-full",
        title: "Your free trial",
      };
    }
    if (daysLeft <= 2) {
      return {
        background: "from-orange-800 to-gray-900",
        badgeBg: "bg-orange-500/30",
        badgeText: "text-orange-300",
        badgeBorder: "border-orange-500/50",
        badgeLabel: "Last days",
        progressBar: "from-orange-500 to-amber-500",
        buttonStyle: "bg-orange-500/80 hover:bg-orange-500 !text-white border border-orange-400/50 w-full",
        title: "Your free trial",
      };
    }
    return {
      background: "from-gray-900 via-blue-900 to-pink-900",
      badgeBg: "bg-green-500/30",
      badgeText: "text-green-300",
      badgeBorder: "border-green-500/50",
      badgeLabel: "Free trial",
      progressBar: "from-primary via-accent to-secondary",
      buttonStyle: "bg-white/10 hover:bg-white/20 !text-white border border-white/30 w-full",
      title: "Your free trial",
    };
  }

  if (state === "active") {
    return {
      background: "from-gray-900 via-blue-900 to-pink-900",
      badgeBg: "bg-green-500/30",
      badgeText: "text-green-300",
      badgeBorder: "border-green-500/50",
      badgeLabel: "Subscriber",
      progressBar: "from-primary via-accent to-secondary",
      buttonStyle: "bg-white/10 hover:bg-white/20 !text-white border border-white/30 w-full",
      title: "Your plan",
    };
  }

  if (state === "canceling") {
    return {
      background: "from-amber-900 via-gray-900 to-gray-900",
      badgeBg: "bg-amber-500/30",
      badgeText: "text-amber-200",
      badgeBorder: "border-amber-500/50",
      badgeLabel: "Canceling",
      progressBar: "from-amber-500 to-orange-500",
      buttonStyle: "bg-white/10 hover:bg-white/20 !text-white border border-white/30 w-full",
      title: "Your plan",
    };
  }

  if (state === "past_due") {
    return {
      background: "from-red-900 via-gray-900 to-gray-900",
      badgeBg: "bg-red-500/30",
      badgeText: "text-red-200",
      badgeBorder: "border-red-500/50",
      badgeLabel: "Payment failed",
      progressBar: "from-red-500 to-red-600",
      buttonStyle: "bg-red-500 hover:bg-red-600 !text-white border border-red-400/50 w-full",
      title: "Update payment",
    };
  }

  if (state === "disputed") {
    return {
      background: "from-gray-950 to-gray-900",
      badgeBg: "bg-red-500/30",
      badgeText: "text-red-300",
      badgeBorder: "border-red-500/50",
      badgeLabel: "Under review",
      progressBar: "from-red-600 to-red-700",
      buttonStyle: "bg-white/10 hover:bg-white/20 !text-white border border-white/30 w-full",
      title: "Account under review",
    };
  }

  // ended
  return {
    background: "from-red-950 via-red-900 to-red-950",
    badgeBg: "bg-red-500/30",
    badgeText: "text-red-300",
    badgeBorder: "border-red-500/50",
    badgeLabel: "Ended",
    progressBar: "from-red-600 to-red-700",
    buttonStyle: "bg-red-600 hover:bg-red-700 !text-white border border-red-500/50 w-full",
    title: "Subscription ended",
  };
}

function deriveState(
  accountStatus: string | undefined,
  trialExpired: boolean,
  subscriptionCanceled: boolean,
  paymentFailedAt: Date | null
): AccountState {
  if (accountStatus === "paid") {
    if (paymentFailedAt) return "past_due";
    if (subscriptionCanceled) return "canceling";
    if (trialExpired) return "ended"; // shouldn't happen, fail-safe
    return "active";
  }
  if (trialExpired || accountStatus === "expired" || accountStatus === "pending_payment") {
    return "ended";
  }
  // No explicit state — default safe.
  return "ended";
}

export function TrialCard({
  trial,
  accountState,
  accountStatus,
  subscriptionCanceled = false,
  paymentFailedAt = null,
  isThirdPartyProvider = false,
}: TrialCardProps) {
  const [now, setNow] = useState(new Date());
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const state: AccountState =
    accountState ??
    deriveState(accountStatus, trial.expired, subscriptionCanceled, paymentFailedAt);

  // Live countdown only when < 24h remain.
  useEffect(() => {
    if (trial.remaining.d === 0 && !trial.expired) {
      const interval = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(interval);
    }
  }, [trial.remaining.d, trial.expired]);

  const currentRemaining = (() => {
    if (!trial.end) return trial.remaining;
    const remainingMs = Math.max(0, trial.end.getTime() - now.getTime());
    return {
      d: Math.floor(remainingMs / 86_400_000),
      h: Math.floor((remainingMs % 86_400_000) / 3_600_000),
      m: Math.floor((remainingMs % 3_600_000) / 60_000),
      s: Math.floor((remainingMs % 60_000) / 1000),
    };
  })();

  const styles = visualsFor(state, trial.daysLeft);
  const countdownText = formatCountdown(currentRemaining);

  const getCTAText = () => {
    switch (state) {
      case "active":
        return isPortalLoading ? "Opening…" : isThirdPartyProvider ? "Manage in store" : "Manage subscription";
      case "canceling":
        return isPortalLoading ? "Opening…" : "Resume subscription";
      case "past_due":
        return isPortalLoading ? "Opening…" : "Update payment";
      case "trialing":
        return isPortalLoading
          ? "Opening…"
          : isThirdPartyProvider
            ? "Manage in store"
            : "Manage subscription";
      case "ended":
      case "disputed":
        // These states are redirected to /paywall by the dashboard layout —
        // this card should not render for them. Fail-safe label only.
        return "Open paywall";
    }
  };

  const handleCTAClick = async () => {
    if (state === "ended" || state === "disputed") {
      // Should not be reachable — layout redirects these states to /paywall.
      window.location.href = "/paywall";
      return;
    }
    if (isThirdPartyProvider) {
      // Apple/Google: deep-link to their store; no Stripe portal.
      window.location.href = "https://apps.apple.com/account/subscriptions";
      return;
    }
    setIsPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      setPortalError(
        data?.error ||
          "Couldn't open the billing portal. Please try again or email support@menolisa.com."
      );
    } catch {
      setPortalError(
        "Couldn't open the billing portal. Please try again or email support@menolisa.com."
      );
    } finally {
      setIsPortalLoading(false);
    }
  };

  // Header body content per state.
  const headerBody = (() => {
    if (state === "active" || state === "canceling") {
      return (
        <p className="text-sm text-white/80">
          {trial.end
            ? state === "canceling"
              ? `Access until ${trial.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
              : `Renews ${trial.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
            : "Your subscription is active"}
        </p>
      );
    }
    if (state === "past_due") {
      return (
        <div className="flex items-start gap-2 text-sm text-red-100 mt-2">
          <CreditCard className="h-4 w-4 mt-0.5 shrink-0" />
          <span>We couldn&apos;t charge your card. Update payment to keep access.</span>
        </div>
      );
    }
    // ended / disputed — handled by /paywall redirect; render nothing here.
    if (state === "ended" || state === "disputed") return null;
    // trialing — card on file, sub already active
    const billingDate = trial.end
      ? trial.end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : null;
    if (trial.daysLeft <= 2) {
      return (
        <div className="space-y-2 mt-2">
          {billingDate && (
            <p className="text-sm text-white/80">First charge on {billingDate}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>Your card will be charged soon — cancel anytime below</span>
          </div>
        </div>
      );
    }
    return (
      <p className="text-sm text-white/80">
        {billingDate
          ? <>Free until {billingDate}. Your card will be charged then.</>
          : "Free trial active"}
      </p>
    );
  })();

  const showCountdownBlock =
    state === "trialing" || state === "active" || state === "canceling" || state === "past_due";

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border border-white/25 bg-linear-to-l ${styles.background} backdrop-blur-lg p-6 lg:p-8 shadow-xl transition-all duration-300`}
      >
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl lg:text-3xl font-extrabold text-white! mb-2">
                {styles.title}
              </h2>
              {headerBody}
            </div>
            <div
              className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 ml-2 ${styles.badgeBg} ${styles.badgeText} ${styles.badgeBorder} border`}
            >
              {styles.badgeLabel}
            </div>
          </div>

          {showCountdownBlock && (
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-3">
                {trial.daysLeft <= 0 && state === "trialing" ? (
                  <span className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
                    {currentRemaining.h}h {currentRemaining.m}m
                  </span>
                ) : (
                  <>
                    <span className="text-5xl lg:text-6xl font-extrabold text-white tracking-tight">
                      {trial.daysLeft}
                    </span>
                    <span className="text-lg text-white/80">
                      {state === "trialing"
                        ? "days until first charge"
                        : state === "canceling"
                          ? "days of access left"
                          : state === "past_due"
                            ? "days to update card"
                            : "days until renewal"}
                    </span>
                  </>
                )}
              </div>
              {state === "trialing" && (
                <>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full transition-[width] duration-500 bg-linear-to-r ${styles.progressBar}`}
                      style={{ width: `${Math.max(0, Math.min(100, trial.progressPct))}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <span>
                      {Math.min(trial.trialDays || 3, trial.elapsedDays)} / {trial.trialDays || 3} days used
                    </span>
                    <span>{trial.progressPct.toFixed(0)}%</span>
                  </div>
                </>
              )}
            </div>
          )}

          {showCountdownBlock && (
            <div className="text-sm text-white/80 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{countdownText}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleCTAClick}
            disabled={isPortalLoading}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${styles.buttonStyle}`}
          >
            {getCTAText()}
          </button>
          {portalError && (
            <p className="mt-3 text-sm text-red-200" role="alert">
              {portalError}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
