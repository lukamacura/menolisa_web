"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock, CreditCard } from "lucide-react";
import type { AccountState } from "@/lib/getAccountState";
import { PLAN_PRICE, PLAN_WEEKS, formatPrice } from "@/lib/pricing";

export type { AccountState };

export interface TrialCardProps {
  trial: {
    expired: boolean;
    /** End of the paid period. */
    end: Date | null;
    daysLeft: number;
    remaining: { d: number; h: number; m: number; s: number };
  };
  /** Canonical state — preferred. If omitted, derived from accountStatus + flags. */
  accountState?: AccountState;
  accountStatus?: string;
  subscriptionCanceled?: boolean;
  paymentFailedAt?: Date | null;
  isThirdPartyProvider?: boolean;
  /**
   * The free week is running: `trial.end` is the first charge, not a renewal.
   * "Renews Sep 11" to a woman who has paid nothing reads as a charge she
   * did not agree to; "Free week ends Sep 11 · then $59" is the fact.
   */
  inTrial?: boolean;
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

function visualsFor(state: AccountState): Visuals {
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
  expired: boolean,
  subscriptionCanceled: boolean,
  paymentFailedAt: Date | null
): AccountState {
  if (accountStatus === "paid") {
    if (paymentFailedAt) return "past_due";
    if (subscriptionCanceled) return "canceling";
    if (expired) return "ended"; // shouldn't happen, fail-safe
    return "active";
  }
  // Anything else — expired, pending_payment, unknown — fails closed.
  return "ended";
}

export function TrialCard({
  trial,
  accountState,
  accountStatus,
  subscriptionCanceled = false,
  paymentFailedAt = null,
  isThirdPartyProvider = false,
  inTrial = false,
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

  const styles = visualsFor(state);
  const countdownText = formatCountdown(currentRemaining);

  const getCTAText = () => {
    switch (state) {
      case "active":
        return isPortalLoading ? "Opening…" : isThirdPartyProvider ? "Manage in store" : "Manage subscription";
      case "canceling":
        return isPortalLoading ? "Opening…" : "Resume subscription";
      case "past_due":
        return isPortalLoading ? "Opening…" : "Update payment";
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
      const when = trial.end?.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return (
        <p className="text-sm text-white/80">
          {!when
            ? "Your subscription is active"
            : state === "canceling"
              ? inTrial
                ? `Free week ends ${when} · you won't be charged`
                : `Access until ${when}`
              : inTrial
                ? `Free week ends ${when} · then ${formatPrice(PLAN_PRICE)} for ${PLAN_WEEKS} weeks`
                : `Renews ${when}`}
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
    return null;
  })();

  const showCountdownBlock =
    state === "active" || state === "canceling" || state === "past_due";

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
                <span className="text-5xl lg:text-6xl font-extrabold text-white tracking-tight">
                  {trial.daysLeft}
                </span>
                <span className="text-lg text-white/80">
                  {state === "canceling"
                    ? "days of access left"
                    : state === "past_due"
                      ? "days to update card"
                      : inTrial
                        ? "days of free week left"
                        : "days until renewal"}
                </span>
              </div>
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
