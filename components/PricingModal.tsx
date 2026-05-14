"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Lock, Clock, ShieldAlert, LifeBuoy } from "lucide-react";
import type { AccountState } from "@/lib/getAccountState";
import type { TrialState } from "./TrialCard";

const PRICE_MONTHLY_FULL = 12;
const PRICE_ANNUAL_FULL = 79;
const PRICE_ANNUAL_PER_MONTH_FULL = 6.58;
const PRICE_MONTHLY_HALF = 6;
const PRICE_ANNUAL_HALF = 39.5;
const PRICE_ANNUAL_PER_MONTH_HALF = 3.29;
const SUPPORT_EMAIL = "support@menolisa.com";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Canonical state — preferred. */
  accountState?: AccountState;
  /** @deprecated — use accountState. Mapped to AccountState internally for back-compat. */
  trialState?: TrialState;
  /** When true, ended copy reads as "subscription ended" instead of "trial ended". */
  previouslyPaid?: boolean;
  timeRemaining?: string;
  symptomCount?: number;
  patternCount?: number;
  userName?: string;
}

function legacyToAccountState(s: TrialState | undefined): AccountState {
  if (!s) return "ended";
  // New canonical names pass through.
  if (s === "trialing" || s === "active" || s === "canceling" || s === "past_due" || s === "ended" || s === "disputed") {
    return s;
  }
  // Legacy names → canonical.
  if (s === "expired") return "ended";
  if (s === "subscriber") return "active";
  // calm | warning | urgent → trialing
  return "trialing";
}

export function PricingModal({
  isOpen,
  onClose,
  accountState,
  trialState,
  previouslyPaid = false,
  timeRemaining,
  symptomCount = 0,
  patternCount = 0,
  userName,
}: PricingModalProps) {
  const state: AccountState = accountState ?? legacyToAccountState(trialState);
  const isLockout = state === "ended" || state === "disputed";

  const [billingTab, setBillingTab] = useState<"annual" | "monthly">("annual");
  const [showContent, setShowContent] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [referralDiscountEligible, setReferralDiscountEligible] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("pricing-modal-animations")) return;

    const style = document.createElement("style");
    style.id = "pricing-modal-animations";
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fadeInUp {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const contentTimer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(contentTimer);
    }
    document.body.style.overflow = "";
    setTimeout(() => setShowContent(false), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (state === "disputed") return;
    let cancelled = false;
    fetch("/api/referral/discount-eligible", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { eligible: false }))
      .then((data) => {
        if (!cancelled && data?.eligible) setReferralDiscountEligible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, state]);

  useEffect(() => {
    if (!isOpen) setReferralDiscountEligible(false);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!isOpen) return null;

  const handlePlanSelect = async (plan: "monthly" | "annual") => {
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          return_origin: typeof window !== "undefined" ? window.location.origin : undefined,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckoutError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setCheckoutError("Checkout could not be started. Please try again.");
    } catch {
      setCheckoutError("Network error. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const headline = (() => {
    const name = userName || "Hey";

    if (state === "disputed") {
      return {
        title: "Your account is under review",
        subtitle: "Email us so we can help resolve this and restore access.",
      };
    }

    if (state === "ended") {
      if (previouslyPaid) {
        return {
          title: `${name}, your subscription has ended.`,
          subtitle: "Resubscribe to unlock Lisa and pick up where you left off.",
        };
      }
      return {
        title: `${name}, your trial has ended.`,
        subtitle: "Choose a plan to unlock Lisa and your insights.",
      };
    }

    if (state === "trialing" && timeRemaining) {
      return {
        title: `${name}, your trial ends in ${timeRemaining}.`,
        subtitle: "Keep your data and patterns — pick a plan now.",
      };
    }

    if (patternCount > 0) {
      return {
        title: `${name}, Lisa found ${patternCount} ${patternCount === 1 ? "pattern" : "patterns"} in your symptoms.`,
        subtitle: "Upgrade to see what's triggering them.",
      };
    }

    if (symptomCount > 0) {
      return {
        title: `${name}, you've logged ${symptomCount} ${symptomCount === 1 ? "symptom" : "symptoms"} this week.`,
        subtitle: "Lisa found patterns — upgrade to see them.",
      };
    }

    return {
      title: `Take control of your symptoms, ${name}.`,
      subtitle: "Lisa is ready to help you find answers.",
    };
  })();

  const perMonthAnnual = referralDiscountEligible ? PRICE_ANNUAL_PER_MONTH_HALF : PRICE_ANNUAL_PER_MONTH_FULL;
  const annualTotal = referralDiscountEligible ? PRICE_ANNUAL_HALF : PRICE_ANNUAL_FULL;
  const monthlyPrice = referralDiscountEligible ? PRICE_MONTHLY_HALF : PRICE_MONTHLY_FULL;
  const formatMoney = (n: number) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));

  const modalContent = (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-4"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        onClick={isLockout ? undefined : onClose}
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          opacity: showContent ? 1 : 0,
          cursor: isLockout ? "default" : "pointer",
        }}
      />

      <div
        className="relative z-10 rounded-2xl shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto transition-all duration-500 ease-out"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--card)",
          transform: showContent ? "scale(1) translateY(0)" : "scale(0.95) translateY(20px)",
          opacity: showContent ? 1 : 0,
        }}
      >
        {!isLockout && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 p-1.5 rounded-full transition-colors z-20"
            style={{ backgroundColor: "transparent", color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            aria-label="Close modal"
          >
            <X className="h-4 w-4" style={{ color: "var(--muted-foreground)" }} />
          </button>
        )}

        {state === "disputed" ? (
          <div className="p-6 sm:p-8 text-center">
            <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--foreground)" }} />
            <h2 className="text-xl sm:text-2xl font-extrabold mb-2" style={{ color: "var(--foreground)" }}>
              {headline.title}
            </h2>
            <p className="text-sm sm:text-base mb-6" style={{ color: "var(--muted-foreground)" }}>
              {headline.subtitle}
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Account%20under%20review`}
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-3.5 rounded-xl font-bold text-base"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              <LifeBuoy className="h-4 w-4" />
              Email support
            </a>
          </div>
        ) : (
          <>
            <div className="pt-12 sm:pt-11 px-4 sm:px-5 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div
                className="flex rounded-xl p-1 border max-w-md mx-auto"
                style={{ backgroundColor: "var(--muted)", borderColor: "var(--border)" }}
                role="tablist"
                aria-label="Billing period"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={billingTab === "annual"}
                  className="flex-1 py-2.5 px-3 rounded-lg text-sm sm:text-base font-semibold transition-colors"
                  style={{
                    backgroundColor: billingTab === "annual" ? "var(--card)" : "transparent",
                    color: "var(--foreground)",
                    boxShadow: billingTab === "annual" ? "var(--shadow-sm)" : "none",
                  }}
                  onClick={() => setBillingTab("annual")}
                >
                  Annual
                  <span className="block text-xs font-normal mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {referralDiscountEligible ? "50% off first year" : "Save money"}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={billingTab === "monthly"}
                  className="flex-1 py-2.5 px-3 rounded-lg text-sm sm:text-base font-semibold transition-colors"
                  style={{
                    backgroundColor: billingTab === "monthly" ? "var(--card)" : "transparent",
                    color: "var(--foreground)",
                    boxShadow: billingTab === "monthly" ? "var(--shadow-sm)" : "none",
                  }}
                  onClick={() => setBillingTab("monthly")}
                >
                  Monthly
                </button>
              </div>
            </div>

            <div
              className="p-4 sm:p-6 border-b transition-all duration-500"
              style={{
                borderColor: "var(--border)",
                opacity: showContent ? 1 : 0,
                transform: showContent ? "translateY(0)" : "translateY(-12px)",
              }}
            >
              <div className="text-center w-full px-2 sm:px-4">
                <h2
                  className="text-base sm:text-xl md:text-2xl font-extrabold mb-2 sm:mb-3 leading-snug sm:leading-normal"
                  style={{ color: "var(--foreground)" }}
                >
                  {headline.title}
                </h2>
                <p
                  className="text-sm sm:text-base leading-relaxed"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {headline.subtitle}
                </p>
              </div>

              {(state === "trialing" || state === "ended") && (
                <div className="mt-3 p-2.5 rounded-lg flex items-center justify-center gap-2 bg-yellow-500/20 border border-yellow-500/20">
                  <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--foreground)" }} />
                  <p className="text-xs sm:text-sm font-semibold text-center" style={{ color: "var(--foreground)" }}>
                    {state === "trialing" && timeRemaining
                      ? `Your trial ends in ${timeRemaining} — don't lose your data`
                      : previouslyPaid
                        ? "Your subscription has ended — resubscribe to keep your data"
                        : "Your trial has ended — pick a plan to continue"}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 sm:p-5 pb-14">
              {checkoutError && (
                <div
                  className="mb-4 p-3 rounded-lg text-center text-sm font-medium"
                  style={{
                    backgroundColor: "rgba(239, 68, 68, 0.15)",
                    color: "var(--foreground)",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                  }}
                >
                  {checkoutError}
                </div>
              )}

              {referralDiscountEligible && (
                <div
                  className="mb-4 p-3 rounded-lg text-center text-sm font-bold border"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                    borderColor: "var(--primary)",
                  }}
                >
                  50% off your first subscription. Your price below.
                </div>
              )}

              <div
                className="rounded-xl border p-4 sm:p-5"
                style={{
                  borderColor: "var(--primary)",
                  opacity: showContent ? 1 : 0,
                  transitionDelay: "150ms",
                }}
              >
                {billingTab === "annual" ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                      {referralDiscountEligible ? "Annual (50% off)" : "Billed Annually, best value"}
                    </p>
                    <div className="flex items-baseline gap-1 flex-wrap mb-1">
                      <span className="text-4xl sm:text-5xl font-extrabold tabular-nums" style={{ color: "var(--primary)" }}>
                        ${formatMoney(perMonthAnnual)}
                      </span>
                      <span className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
                        /month
                      </span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
                      Billed ${formatMoney(annualTotal)} per year
                    </p>
                    {!referralDiscountEligible && (
                      <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                        Monthly billing: ${PRICE_MONTHLY_FULL}/mo (${12 * PRICE_MONTHLY_FULL}/yr)
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handlePlanSelect("annual")}
                      disabled={checkoutLoading}
                      className="w-full px-4 py-3.5 rounded-xl font-bold text-base transition-opacity disabled:opacity-70 disabled:pointer-events-none"
                      style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {checkoutLoading ? "Redirecting…" : "Continue"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--muted-foreground)" }}>
                      Monthly
                    </p>
                    <div className="flex items-baseline gap-1 flex-wrap mb-1">
                      {referralDiscountEligible && (
                        <span className="text-2xl font-bold line-through mr-1" style={{ color: "var(--muted-foreground)" }}>
                          ${PRICE_MONTHLY_FULL}
                        </span>
                      )}
                      <span className="text-4xl sm:text-5xl font-extrabold tabular-nums" style={{ color: "var(--foreground)" }}>
                        ${formatMoney(monthlyPrice)}
                      </span>
                      <span className="text-lg sm:text-xl font-semibold" style={{ color: "var(--foreground)" }}>
                        /month
                      </span>
                    </div>
                    <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                      Billed monthly. Cancel anytime.
                    </p>
                    <button
                      type="button"
                      onClick={() => handlePlanSelect("monthly")}
                      disabled={checkoutLoading}
                      className="w-full px-4 py-3.5 rounded-xl font-bold text-base transition-opacity disabled:opacity-70 disabled:pointer-events-none"
                      style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                    >
                      {checkoutLoading ? "Redirecting…" : "Continue"}
                    </button>
                  </>
                )}
              </div>

              <p
                className="text-xs sm:text-sm text-center mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span>Instant access</span>
                <span aria-hidden>·</span>
                <span>Cancel anytime</span>
                <span aria-hidden>·</span>
                <span>Secure checkout</span>
              </p>

              <div className="border-t mt-4 pt-4" style={{ borderColor: "var(--border)" }}>
                <h4 className="text-sm font-bold mb-2 text-center" style={{ color: "var(--foreground)" }}>
                  With Lisa, you&apos;ll…
                </h4>
                <ul className="space-y-2">
                  {[
                    "Understand your body better",
                    "Spot what triggers symptoms",
                    "Track patterns over time",
                    "Chat with Lisa anytime",
                  ].map((text, index) => (
                    <li
                      key={text}
                      className="flex items-center gap-2 text-sm"
                      style={{
                        color: "var(--foreground)",
                        animation: `fadeInUp 0.4s ease-out ${index * 0.05}s both`,
                      }}
                    >
                      <Check className="h-4 w-4 shrink-0" style={{ color: "var(--primary)" }} />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 pt-3 border-t text-center" style={{ borderColor: "var(--border)" }}>
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs sm:text-sm font-bold"
                  style={{
                    backgroundColor: "var(--muted)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  7-day money-back guarantee
                </div>
                <p className="text-xs mt-2 max-w-sm mx-auto" style={{ color: "var(--muted-foreground)" }}>
                  Not seeing value? Full refund, no questions asked.
                </p>
              </div>

              {state === "ended" && (
                <p className="text-xs text-center mt-4" style={{ color: "var(--muted-foreground)" }}>
                  Need help?{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Account%20help`}
                    className="underline"
                    style={{ color: "var(--foreground)" }}
                  >
                    Contact support
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(modalContent, document.body);
}
