"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { PricingModal } from "./PricingModal";

export type TrialState = "calm" | "warning" | "urgent" | "expired" | "subscriber";

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
  accountStatus?: string;
  /** When true, subscription is set to cancel (show "Access until" not "Renews") */
  subscriptionCanceled?: boolean;
  symptomCount?: number;
  patternCount?: number;
}

// Helper function to determine trial state
export function getTrialState(
  expired: boolean,
  daysLeft: number,
  remaining: { d: number; h: number; m: number }
): TrialState {
  if (expired) return "expired";
  // Urgent: less than 24 hours (0 days and any hours/minutes remaining)
  if (remaining.d === 0) return "urgent";
  // Warning: 1-2 days remaining
  if (daysLeft >= 1 && daysLeft <= 2) return "warning";
  // Calm: 3+ days remaining
  if (daysLeft >= 3) return "calm";
  return "calm"; // Default to calm
}

// Format countdown text
export function formatCountdown(
  state: TrialState,
  remaining: { d: number; h: number; m: number; s: number },
  subscriptionCanceled?: boolean
): string {
  if (state === "subscriber") {
    return subscriptionCanceled
      ? `Access ends in ${remaining.d}d ${remaining.h}h ${remaining.m}m`
      : `Renews in ${remaining.d}d ${remaining.h}h ${remaining.m}m`;
  }
  if (state === "urgent") {
    return `${remaining.h}h ${remaining.m}m remaining`;
  }
  return `Ends in ${remaining.d}d ${remaining.h}h ${remaining.m}m`;
}

export function TrialCard({ trial, accountStatus, subscriptionCanceled = false, symptomCount = 0, patternCount = 0 }: TrialCardProps) {
  const [now, setNow] = useState(new Date());
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [referralDiscountEligible, setReferralDiscountEligible] = useState(false);

  const isSubscriber = accountStatus === "paid";

  useEffect(() => {
    if (isSubscriber) return;
    let cancelled = false;
    fetch("/api/referral/discount-eligible", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { eligible: false }))
      .then((data) => {
        if (!cancelled && data?.eligible) setReferralDiscountEligible(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isSubscriber]);

  // Live countdown for urgent state (updates every minute)
  useEffect(() => {
    const state = isSubscriber ? "subscriber" : getTrialState(trial.expired, trial.daysLeft, trial.remaining);
    if (state === "urgent" && !trial.expired) {
      const interval = setInterval(() => {
        setNow(new Date());
      }, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [isSubscriber, trial.expired, trial.daysLeft, trial.remaining]);

  // Recalculate remaining time for urgent state
  const currentRemaining = trial.expired
    ? trial.remaining
    : trial.end
    ? (() => {
        const remainingMs = Math.max(0, trial.end.getTime() - now.getTime());
        return {
          d: Math.floor(remainingMs / 86400000),
          h: Math.floor((remainingMs % 86400000) / 3600000),
          m: Math.floor((remainingMs % 3600000) / 60000),
          s: Math.floor((remainingMs % 60000) / 1000),
        };
      })()
    : trial.remaining;

  const state = isSubscriber ? "subscriber" : getTrialState(trial.expired, trial.daysLeft, currentRemaining);
  const countdownText = formatCountdown(state, currentRemaining, subscriptionCanceled);

  // Get state-specific styling
  const getStateStyles = () => {
    switch (state) {
      case "subscriber":
        return {
          background: "from-gray-900 via-blue-900 to-pink-900",
          badgeBg: "bg-green-500/30",
          badgeText: "text-green-300",
          badgeBorder: "border-green-500/50",
          badgeLabel: "Subscriber",
          progressBar: "from-primary via-accent to-secondary",
          buttonStyle: "bg-white/10 hover:bg-white/20 text-white! border border-white/30 w-full",
          title: "Your plan",
        };
      case "calm":
        return {
          background: "from-gray-900 via-blue-900 to-pink-900",
          badgeBg: "bg-green-500/30",
          badgeText: "text-green-300",
          badgeBorder: "border-green-500/50",
          badgeLabel: "Active",
          progressBar: "from-primary via-accent to-secondary",
          buttonStyle: "bg-white/10 hover:bg-white/20 text-white! border border-white/30 w-full",
          title: "Your Trial",
        };
      case "warning":
        return {
          background: "from-orange-800 to-gray-900",
          badgeBg: "bg-orange-500/30",
          badgeText: "text-orange-300",
          badgeBorder: "border-orange-500/50",
          badgeLabel: "Last day",
          progressBar: "from-orange-500 to-amber-500",
          buttonStyle: "bg-orange-500/80 hover:bg-orange-500 text-white! border border-orange-400/50 w-full",
          title: "Your Trial",
        };
      case "urgent":
        return {
          background: "from-red-900 via-red-950 to-gray-900",
          badgeBg: "bg-red-500/30",
          badgeText: "text-red-300",
          badgeBorder: "border-red-500/50",
          badgeLabel: "Ends today",
          progressBar: "from-red-500 to-red-600",
          buttonStyle: "bg-red-500 hover:bg-red-600 text-white! border border-red-400/50 w-full",
          title: "Trial Ending Soon",
        };
      case "expired":
        return {
          background: "from-red-950 via-red-900 to-red-950",
          badgeBg: "bg-red-500/30",
          badgeText: "text-red-300",
          badgeBorder: "border-red-500/50",
          badgeLabel: "Expired",
          progressBar: "from-red-600 to-red-700",
          buttonStyle: "bg-red-600 hover:bg-red-700 text-white! border border-red-500/50 w-full",
          title: "Trial Ended",
        };
    }
  };

  const styles = getStateStyles();

  // Get CTA button text based on state (plan-agnostic so users choose monthly/annual in the modal)
  const getCTAText = () => {
    switch (state) {
      case "subscriber":
        return isPortalLoading ? "Opening…" : "Manage subscription";
      case "calm":
        return referralDiscountEligible ? "You have 50% off — Choose your plan" : "Choose your plan";
      case "warning":
        return referralDiscountEligible ? "50% off — Keep your progress" : "Keep your progress — Choose plan";
      case "urgent":
        return referralDiscountEligible ? "50% off — Save your progress" : "Save your progress";
      case "expired":
        return referralDiscountEligible ? "50% off — Unlock your patterns" : "Unlock your patterns";
    }
  };

  const handleCTAClick = async () => {
    if (state === "subscriber") {
      setIsPortalLoading(true);
      try {
        const res = await fetch("/api/stripe/create-portal", { method: "POST" });
        const data = await res.json();
        if (res.ok && data?.url) {
          window.location.href = data.url;
          return;
        }
        // Fallback if no portal (e.g. no stripe_customer_id)
        setIsPricingModalOpen(true);
      } catch {
        setIsPricingModalOpen(true);
      } finally {
        setIsPortalLoading(false);
      }
    } else {
      setIsPricingModalOpen(true);
    }
  };

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
              {state === "subscriber" ? (
                <p className="text-sm text-white/80">
                  {trial.end
                    ? subscriptionCanceled
                      ? `Access until ${trial.end.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })}`
                      : `Active until ${trial.end.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })}`
                    : "Your subscription is active"}
                </p>
              ) : state === "expired" ? (
                <p className="text-sm text-white/80">
                  Your data is saved for 30 days
                </p>
              ) : state === "warning" ? (
                <div className="flex items-center gap-2 text-sm text-amber-300 mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Your patterns and data will be locked tomorrow</span>
                </div>
              ) : state === "urgent" ? (
                <ul className="text-sm text-white/90 mt-3 space-y-1.5 list-disc list-inside">
                  <li>Your logged symptoms will be locked</li>
                  <li>Lisa&apos;s patterns will be hidden</li>
                  <li>You&apos;ll lose access to insights</li>
                </ul>
              ) : state === "calm" ? (
                <p className="text-sm text-white/80">
                  {trial.start && (
                    <>
                      Started {trial.start.toLocaleDateString()} · Ends{" "}
                      {trial.end?.toLocaleDateString()}
                    </>
                  )}
                </p>
              ) : null}
            </div>
            <div
              className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 ml-2 ${styles.badgeBg} ${styles.badgeText} ${styles.badgeBorder} border`}
            >
              {styles.badgeLabel}
            </div>
          </div>

          {state === "expired" && patternCount > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-white/10 border border-white/20">
              <p className="text-sm text-white/90">
                Lisa found {patternCount} {patternCount === 1 ? "pattern" : "patterns"} in your
                symptoms. Upgrade to see what she discovered.
              </p>
            </div>
          )}

          {!trial.expired && (
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-3">
                {state === "urgent" ? (
                  <span className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight">
                    {currentRemaining.h}h {currentRemaining.m}m
                  </span>
                ) : (
                  <>
                    <span className="text-5xl lg:text-6xl font-extrabold text-white tracking-tight">
                      {trial.daysLeft}
                    </span>
                    <span className="text-lg text-white/80">
                      {state === "subscriber"
                        ? subscriptionCanceled
                          ? "days of access left"
                          : "days until renewal"
                        : "days left"}
                    </span>
                  </>
                )}
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-[width] duration-500 bg-linear-to-r ${styles.progressBar}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, trial.progressPct))}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                {state === "subscriber" ? (
                  <span>
                    {subscriptionCanceled ? "Access until" : "Renews"}{" "}
                    {trial.end?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ) : (
                  <span>
                    {Math.min(trial.trialDays || 3, trial.elapsedDays)} / {trial.trialDays || 3}{" "}
                    days used
                  </span>
                )}
                <span>{trial.progressPct.toFixed(0)}%</span>
              </div>
            </div>
          )}

          {!trial.expired && (
            <div className="text-sm text-white/80 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>{countdownText}</span>
              </div>
            </div>
          )}

          {state === "expired" && (
            <div className="mb-4">
              <p className="text-sm text-white/70">
                Your data is saved for 30 days. Upgrade to unlock everything and see what Lisa
                found.
              </p>
            </div>
          )}

          <button
            onClick={handleCTAClick}
            disabled={state === "subscriber" && isPortalLoading}
            className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${styles.buttonStyle}`}
          >
            {getCTAText()}
          </button>
        </div>
      </div>

      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        trialState={state}
        timeRemaining={state === "urgent" ? countdownText : undefined}
        symptomCount={symptomCount}
        patternCount={patternCount}
      />
    </>
  );
}

