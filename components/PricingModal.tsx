
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Lock, Zap, Crown, Sparkles, Clock, Star } from "lucide-react";
import type { TrialState } from "./TrialCard";

const PRICE_MONTHLY_FULL = 12;
const PRICE_ANNUAL_FULL = 79;
const PRICE_ANNUAL_PER_MONTH_FULL = 6.58;
const PRICE_MONTHLY_HALF = 6;
const PRICE_ANNUAL_HALF = 39.5;
const PRICE_ANNUAL_PER_MONTH_HALF = 3.29;

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  trialState: TrialState;
  timeRemaining?: string;
  symptomCount?: number;
  patternCount?: number;
  userName?: string;
}

export function PricingModal({
  isOpen,
  onClose,
  trialState,
  timeRemaining,
  symptomCount = 0,
  patternCount = 0,
  userName,
}: PricingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual" | null>(null);
  const [hoveredPlan, setHoveredPlan] = useState<"monthly" | "annual" | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [referralDiscountEligible, setReferralDiscountEligible] = useState(false);

  // Inject animation styles on mount (client-side only to prevent hydration issues)
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Check if styles already exist
    if (document.getElementById("pricing-modal-animations")) return;

    const style = document.createElement("style");
    style.id = "pricing-modal-animations";
    style.textContent = `
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.9;
          transform: scale(1.05);
        }
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @keyframes float {
        0%, 100% {
          transform: translateY(0px);
          opacity: 0.3;
        }
        50% {
          transform: translateY(-15px);
          opacity: 0.6;
        }
      }

      @keyframes glow {
        0%, 100% {
          box-shadow: 0 0 5px rgba(255, 116, 177, 0.5);
        }
        50% {
          box-shadow: 0 0 20px rgba(255, 116, 177, 0.8), 0 0 30px rgba(192, 132, 252, 0.6);
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Prevent body scroll when modal is open + staggered content reveal
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Delay content reveal for smooth entrance
      const contentTimer = setTimeout(() => setShowContent(true), 100);
      return () => {
        clearTimeout(contentTimer);
      };
    } else {
      document.body.style.overflow = "";
      // Move state update out of the effect
      setTimeout(() => setShowContent(false), 0);
    }
  }, [isOpen]);

  // Fetch referral 50% discount eligibility when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch("/api/referral/discount-eligible", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { eligible: false }))
      .then((data) => {
        if (!cancelled && data?.eligible) setReferralDiscountEligible(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);
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

  // Calculate days until trial ends from timeRemaining string (e.g., "2h 30m" or "3 days")
  const getDaysUntilTrialEnds = (): number | null => {
    if (!timeRemaining) return null;
    const daysMatch = timeRemaining.match(/(\d+)\s*days?/i);
    if (daysMatch) return parseInt(daysMatch[1], 10);
    // If it's hours/minutes, it's less than 1 day
    if (timeRemaining.includes('h') || timeRemaining.includes('m')) return 0;
    return null;
  };

  // Generate personalized headline
  const getPersonalizedHeadline = () => {
    const name = userName || "Hey";
    const daysUntilEnd = getDaysUntilTrialEnds();

    // If trial is ending soon
    if (trialState === "urgent" && daysUntilEnd !== null) {
      return {
        title: `${name}, your trial ends in ${daysUntilEnd === 0 ? 'less than a day' : `${daysUntilEnd} ${daysUntilEnd === 1 ? 'day' : 'days'}`}.`,
        subtitle: "Keep your data and patterns - upgrade now.",
      };
    }

    // If trial expired
    if (trialState === "expired") {
      return {
        title: `${name}, your trial has ended.`,
        subtitle: "Your data is saved for 30 days - upgrade to keep everything.",
      };
    }

    // If user has patterns detected
    if (patternCount > 0) {
      return {
        title: `${name}, Lisa found ${patternCount} ${patternCount === 1 ? 'pattern' : 'patterns'} in your symptoms.`,
        subtitle: "Upgrade to see what's triggering them.",
      };
    }

    // If user has symptom data
    if (symptomCount > 0) {
      return {
        title: `${name}, you've logged ${symptomCount} ${symptomCount === 1 ? 'symptom' : 'symptoms'} this week.`,
        subtitle: "Lisa found patterns - upgrade to see them.",
      };
    }

    // Fallback
    return {
      title: `Take control of your symptoms, ${name}.`,
      subtitle: "Lisa is ready to help you find answers.",
    };
  };

  const headline = getPersonalizedHeadline();

  const modalContent = (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-4"
      style={{
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        style={{
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          opacity: showContent ? 1 : 0,
        }}
      />

      {/* Modal Content */}
      <div
        className="relative z-10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto transition-all duration-500 ease-out"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--card)",
          transform: showContent ? "scale(1) translateY(0)" : "scale(0.95) translateY(20px)",
          opacity: showContent ? 1 : 0,
          minHeight: "auto",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 rounded-full transition-colors z-20"
          style={{
            backgroundColor: "transparent",
            color: "var(--muted-foreground)",
          }}
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

        {/* Header */}
        <div
          className="p-4 sm:p-6 border-b transition-all duration-500"
          style={{
            borderColor: "var(--border)",
            opacity: showContent ? 1 : 0,
            transform: showContent ? "translateY(0)" : "translateY(-20px)",
          }}
        >
          <div className="text-center w-full px-2 sm:px-4">
            <h2
              className="text-base sm:text-xl md:text-2xl font-extrabold mb-2 sm:mb-3 transition-all duration-700 leading-snug sm:leading-normal"
              style={{
                color: "var(--foreground)",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                hyphens: "auto",
                whiteSpace: "normal",
                overflow: "visible",
                textOverflow: "clip",
              }}
            >
              {headline.title}
            </h2>
            <p 
              className="text-sm sm:text-base leading-relaxed"
              style={{
                color: "var(--muted-foreground)",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "normal",
              }}
            >
              {headline.subtitle}
            </p>
          </div>
          
          {/* Urgency Banner */}
          {(trialState === "urgent" || trialState === "expired") && (
            <div 
              className="mt-3 p-2.5 rounded-lg flex items-center justify-center gap-2 bg-yellow-500/20 border border-yellow-500/20"

            >
              <Clock className="h-4 w-4" style={{ color: "var(--foreground)" }} />
              <p 
                className="text-xs sm:text-sm font-semibold text-center"
                style={{ color: "var(--foreground)" }}
              >
                {trialState === "urgent" && timeRemaining
                  ? `Your trial ends in ${timeRemaining} - don't lose your data`
                  : "⚠️ Your trial has ended - your data is saved for 30 days"}
              </p>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="p-3 sm:p-4 pb-16">{/* Extra bottom padding for fixed notification */}

          {checkoutError && (
            <div
              className="mb-4 p-3 rounded-lg text-center text-sm font-medium"
              style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--foreground)", border: "1px solid rgba(239, 68, 68, 0.4)" }}
            >
              {checkoutError}
            </div>
          )}

          {referralDiscountEligible && (
            <div
              className="mb-4 p-3 rounded-lg text-center text-sm font-bold border"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)", borderColor: "var(--primary)" }}
            >
              50% off your first subscription — your price below
            </div>
          )}

          {/* Testimonial - Above pricing cards */}
          <div 
            className="mb-4 p-3 rounded-lg text-center border"
            style={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-center justify-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <p className="text-sm font-bold italic mb-1" style={{ color: "var(--foreground)" }}>
              &quot;Finally I understand why I feel awful on certain days. Lisa found that coffee was triggering my hot flashes.&quot;
            </p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>- Michelle, 52</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 items-end">
            {/* Annual Plan - Violet/Lavender Family */}
            <div
              className="md:order-2"
              style={{
                order: 1, // Show annual first on mobile
              }}
            >
              <div
                className="relative rounded-xl p-3 cursor-pointer transition-all duration-500 ease-out group overflow-hidden flex flex-col"
                style={{
                  backgroundColor: hoveredPlan === "annual" || selectedPlan === "annual"
                    ? "var(--card)"
                    : "var(--card)",
                  border: "2px solid var(--primary)",
                  transform: hoveredPlan === "annual" ? "scale(1.03) translateY(-3px)" : "scale(1.01)",
                  boxShadow: hoveredPlan === "annual" || selectedPlan === "annual"
                    ? "var(--shadow-lg)"
                    : "var(--shadow-md)",
                  opacity: showContent ? 1 : 0,
                  transitionDelay: "300ms",
                }}
                onMouseEnter={() => setHoveredPlan("annual")}
                onMouseLeave={() => setHoveredPlan(null)}
                onClick={() => setSelectedPlan("annual")}
              >
                {/* Shimmer effect on hover */}
                {hoveredPlan === "annual" && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                      animation: "shimmer 1.5s infinite",
                    }}
                  />
                )}

                {/* Floating particles effect */}
                {hoveredPlan === "annual" && (
                  <>
                    <div
                      className="absolute w-2 h-2 rounded-full bg-white/40"
                      style={{
                        top: "20%",
                        left: "10%",
                        animation: "float 3s ease-in-out infinite",
                      }}
                    />
                    <div
                      className="absolute w-1.5 h-1.5 rounded-full bg-white/30"
                      style={{
                        top: "60%",
                        right: "15%",
                        animation: "float 2.5s ease-in-out infinite 0.5s",
                      }}
                    />
                  </>
                )}
                {/* Best Value Badge - Now inside card */}
                <div
                  className="absolute top-2 right-2 px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-lg transition-all duration-300"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                    animation: hoveredPlan === "annual" ? "pulse 2s infinite" : "none",
                  }}
                >
                  <Crown className="w-3 h-3" />
                  {referralDiscountEligible ? "50% OFF" : "SAVE 45%"}
                </div>

                {/* Icon */}
                <div className="flex items-center justify-between mb-2">
                  <div
                    className="p-2 rounded-lg transition-all duration-300"
                    style={{
                      backgroundColor: "var(--primary)",
                      transform: hoveredPlan === "annual" ? "rotate(-10deg) scale(1.1)" : "rotate(0deg) scale(1)",
                    }}
                  >
                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--primary-foreground)" }} />
                  </div>
                  {selectedPlan === "annual" && (
                    <div className="animate-in zoom-in duration-300">
                      <div className="p-1.5 rounded-full" style={{ backgroundColor: "var(--chart-1)" }}>
                        <Check className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: "var(--primary-foreground)" }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mb-3 flex-1">
                  <h3 className="text-lg sm:text-3xl font-bold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--foreground)" }}>
                    Annual
                    <span 
                      className="text-sm font-bold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--primary)",
                        color: "var(--primary-foreground)",
                      }}
                    >
                      Most Popular
                    </span>
                  </h3>
                  {/* Price anchoring with strikethrough; show 50% off price when eligible */}
                  <div className="flex items-baseline gap-2 mb-1">
                    {referralDiscountEligible ? (
                      <>
                        <span
                          className="text-xl sm:text-2xl font-bold line-through"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          ${PRICE_ANNUAL_FULL}
                        </span>
                        <span
                          className="text-3xl sm:text-4xl font-extrabold transition-all duration-300"
                          style={{ color: "var(--primary)" }}
                        >
                          ${PRICE_ANNUAL_HALF}
                        </span>
                        <span className="text-base sm:text-lg font-medium" style={{ color: "var(--foreground)" }}>/year</span>
                      </>
                    ) : (
                      <>
                        <span
                          className="text-xl sm:text-2xl font-bold line-through"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          $144
                        </span>
                        <span
                          className="text-3xl sm:text-4xl font-extrabold transition-all duration-300"
                          style={{ color: "var(--primary)" }}
                        >
                          ${PRICE_ANNUAL_FULL}
                        </span>
                        <span className="text-base sm:text-lg font-medium" style={{ color: "var(--foreground)" }}>/year</span>
                      </>
                    )}
                  </div>
                  <div className="mb-1">
                    <span
                      className="text-lg sm:text-xl font-medium"
                      style={{ color: "var(--foreground)" }}
                    >
                      ${referralDiscountEligible ? PRICE_ANNUAL_PER_MONTH_HALF : PRICE_ANNUAL_PER_MONTH_FULL}/mo
                    </span>
                  </div>
                  <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Billed annually • Best value</p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Most women choose this</p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlanSelect("annual");
                  }}
                  disabled={checkoutLoading}
                  className="w-full px-4 py-3 sm:py-4 rounded-xl font-bold text-sm sm:text-lg transition-all duration-300 transform hover:scale-105 relative overflow-hidden group disabled:opacity-70 disabled:pointer-events-none"
                  style={{
                    backgroundColor: "var(--primary)",
                    color: "var(--primary-foreground)",
                    boxShadow: hoveredPlan === "annual" ? "var(--shadow-lg)" : "var(--shadow-md)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {checkoutLoading ? "Redirecting…" : referralDiscountEligible ? `Choose Annual — $${PRICE_ANNUAL_HALF}/year` : "Choose Annual - Save 45%"}
                  </span>
                </button>
              </div>
            </div>

            {/* Monthly Plan - Blue Family */}
            <div
              className="md:order-1"
              style={{
                order: 2, // Show monthly second on mobile
              }}
            >
              <div
              className="relative rounded-xl p-3 cursor-pointer transition-all duration-500 ease-out group overflow-hidden flex flex-col"
              style={{
                backgroundColor: hoveredPlan === "monthly" || selectedPlan === "monthly"
                  ? "var(--card)"
                  : "var(--card)",
                border: "2px solid var(--chart-2)",
                transform: hoveredPlan === "monthly" ? "scale(1.02) translateY(-2px)" : "scale(1)",
                boxShadow: hoveredPlan === "monthly" || selectedPlan === "monthly"
                  ? "var(--shadow-lg)"
                  : "var(--shadow-md)",
                opacity: showContent ? 1 : 0,
                transitionDelay: "200ms",
              }}
              onMouseEnter={() => setHoveredPlan("monthly")}
              onMouseLeave={() => setHoveredPlan(null)}
              onClick={() => setSelectedPlan("monthly")}
            >
              {/* Shimmer effect on hover for more liveliness */}
              {hoveredPlan === "monthly" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
              )}

              {/* Icon */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className="p-2 rounded-lg transition-all duration-300"
                  style={{
                    backgroundColor: hoveredPlan === "monthly" || selectedPlan === "monthly"
                      ? "var(--chart-2)"
                      : "var(--secondary)",
                    transform: hoveredPlan === "monthly" ? "rotate(10deg) scale(1.1)" : "rotate(0deg) scale(1)",
                    boxShadow: hoveredPlan === "monthly" ? "var(--shadow-md)" : "none",
                  }}
                >
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: "var(--primary-foreground)" }} />
                </div>
                {selectedPlan === "monthly" && (
                  <div className="animate-in zoom-in duration-300">
                    <div className="p-1.5 rounded-full" style={{ backgroundColor: "var(--chart-2)" }}>
                      <Check className="w-3 h-3 sm:w-4 sm:h-4" style={{ color: "var(--primary-foreground)" }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-3 flex-1">
                <h3 className="text-lg sm:text-3xl font-bold mb-1.5" style={{ color: "var(--foreground)" }}>
                  Monthly
                </h3>
                <div className="flex items-baseline gap-1 mb-1 flex-wrap">
                  {referralDiscountEligible && (
                    <span
                      className="text-xl sm:text-2xl font-bold line-through mr-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      ${PRICE_MONTHLY_FULL}
                    </span>
                  )}
                  <span
                    className="text-3xl sm:text-4xl font-extrabold transition-all duration-300"
                    style={{ 
                      color: "var(--chart-2)",
                      textShadow: hoveredPlan === "monthly" ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                    }}
                  >
                    ${referralDiscountEligible ? PRICE_MONTHLY_HALF : PRICE_MONTHLY_FULL}
                  </span>
                  <span className="text-base sm:text-lg font-medium" style={{ color: "var(--foreground)" }}>/month</span>
                </div>
                <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Billed monthly • Cancel anytime</p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlanSelect("monthly");
                }}
                disabled={checkoutLoading}
                className="w-full px-4 py-3 sm:py-4 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 transform hover:scale-105 relative overflow-hidden group disabled:opacity-70 disabled:pointer-events-none"
                style={{
                  backgroundColor: hoveredPlan === "monthly" ? "var(--chart-2)" : "var(--secondary)",
                  color: "var(--primary-foreground)",
                  boxShadow: hoveredPlan === "monthly" 
                    ? "var(--shadow-lg)" 
                    : "var(--shadow-md)",
                  transform: hoveredPlan === "monthly" ? "scale(1.02)" : "scale(1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--chart-2)";
                  e.currentTarget.style.opacity = "0.95";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--secondary)";
                  e.currentTarget.style.opacity = "1";
                }}
              >
                <span className="relative z-10">{checkoutLoading ? "Redirecting…" : referralDiscountEligible ? `Start Monthly — $${PRICE_MONTHLY_HALF}/mo` : "Start Monthly"}</span>
                {hoveredPlan === "monthly" && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                      animation: "shimmer 1s infinite",
                    }}
                  />
                )}
              </button>
            </div>
            </div>

          </div>

          {/* What happens next reassurance */}
          <div className="mt-4 mb-4 text-center">
            <p className="text-sm font-medium flex items-center justify-center gap-2 flex-wrap" style={{ color: "var(--muted-foreground)" }}>
              <span className="flex items-center gap-1">
                Instant access
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                Cancel anytime
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                Secure checkout
              </span>
            </p>
          </div>

          {/* Outcomes List */}
          <div className="border-t pt-3 sm:pt-4" style={{ borderColor: "var(--border)" }}>
            <h4 className="text-base sm:text-lg font-bold mb-3 text-center" style={{ color: "var(--foreground)" }}>
              With Lisa, you&apos;ll...
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { text: "Finally understand your body", color: "var(--chart-1)" },
                { text: "Discover what triggers your symptoms", color: "var(--chart-2)" },
                { text: "Track patterns and see progress", color: "var(--chart-3)" },
                { text: "Get answers from Lisa anytime", color: "var(--chart-4)" },
              ].map((feature, index) => (
                <div
                  key={feature.text}
                  className="flex items-center gap-2 p-2 rounded-lg hover:shadow-sm transition-all duration-300"
                  style={{
                    backgroundColor: "var(--card)",
                    animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`,
                  }}
                >
                  <div 
                    className="p-1 rounded-md shrink-0"
                    style={{ backgroundColor: feature.color }}
                  >
                    <Check className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
                  </div>
                  <span className="font-medium text-sm sm:text-lg" style={{ color: "var(--foreground)" }}>{feature.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-col items-center gap-2">
              <div 
                className="flex items-center gap-2 px-4 py-2 rounded-full border"
                style={{
                  backgroundColor: "var(--chart-2)",
                  borderColor: "var(--chart-2)",
                  color: "var(--foreground)",
                }}
              >
                <Lock className="h-4 w-4" />
                <span className="text-xs sm:text-sm font-bold">
                  7-Day Money-Back Guarantee
                </span>
              </div>
              <p className="text-sm text-center max-w-md" style={{ color: "var(--muted-foreground)" }}>
                Not seeing value? Full refund, no questions asked.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render using portal to ensure it's at the root level
  if (typeof window === "undefined") return null;
  return createPortal(modalContent, document.body);
}

