"use client";

import { ReactNode, useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
  CreditCard,
} from "lucide-react";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import { META_CURRENCY, PLAN_VALUE } from "@/lib/metaPixel";
import { trackFb } from "@/lib/metaPixelClient";

export type PaywallPlan = "annual" | "monthly";

export interface PaywallViewProps {
  selectedPlan: PaywallPlan;
  onSelectPlan: (plan: PaywallPlan) => void;
  onCheckout: (plan: PaywallPlan) => void | Promise<void>;
  checkoutLoading: boolean;
  error?: string | null;
  /** Optional banner above the hero (e.g. "Account under review" for disputed). */
  banner?: ReactNode;
  /** Optional back link (e.g. return to the diagnosis page). */
  onBack?: () => void;
  /**
   * Which funnel this paywall belongs to. Sent to Meta as `content_category` so
   * the registration funnel and the expired-account paywall stay separable in
   * Events Manager.
   */
  trackingSource?: "register" | "dashboard";
}

export function PaywallView({
  selectedPlan,
  onSelectPlan,
  onCheckout,
  checkoutLoading,
  error,
  banner,
  onBack,
  trackingSource,
}: PaywallViewProps) {
  const isAnnual = selectedPlan === "annual";

  // ViewContent fires once when the paywall appears - not on every plan toggle,
  // which would inflate the count and skew the ViewContent -> InitiateCheckout rate.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackFb("ViewContent", {
      content_name: "paywall",
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE[selectedPlan],
      currency: META_CURRENCY,
    });
    // Intentionally mount-only: selectedPlan is read for the initial value only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // InitiateCheckout fires on the CTA - the moment she actually enters Stripe -
  // rather than on paywall view, so it reflects intent rather than exposure.
  const handleCheckoutClick = (plan: PaywallPlan) => {
    trackFb("InitiateCheckout", {
      content_name: plan,
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE[plan],
      currency: META_CURRENCY,
      num_items: 1,
    });
    return onCheckout(plan);
  };

  // Second list is deliberately short-form: 4 boxes, one promise each. At the
  // payment moment she scans rather than reads, so every box is a 2-3 word
  // headline with a single supporting line.
  const trustLabels = isAnnual
    ? [
        {
          icon: Zap,
          bg: "bg-pink-100",
          fg: "text-pink-600",
          title: "$0 today",
          sub: "Nothing charged now",
        },
        {
          icon: Clock,
          bg: "bg-yellow-100",
          fg: "text-yellow-700",
          title: "24h reminder",
          sub: "Email before trial ends",
        },
        {
          icon: Check,
          bg: "bg-sky-100",
          fg: "text-sky-600",
          title: "Cancel in 2 taps",
          sub: "No calls, no hoops",
        },
        {
          icon: ShieldCheck,
          bg: "bg-green-100",
          fg: "text-green-700",
          title: "Stripe secured",
          sub: "We never see your card",
        },
      ]
    : [
        {
          icon: CreditCard,
          bg: "bg-pink-100",
          fg: "text-pink-600",
          title: "Billed monthly",
          sub: "No yearly commitment",
        },
        {
          icon: Zap,
          bg: "bg-yellow-100",
          fg: "text-yellow-700",
          title: "Instant access",
          sub: "Start tracking today",
        },
        {
          icon: Check,
          bg: "bg-sky-100",
          fg: "text-sky-600",
          title: "Cancel in 2 taps",
          sub: "No calls, no hoops",
        },
        {
          icon: ShieldCheck,
          bg: "bg-green-100",
          fg: "text-green-700",
          title: "Stripe secured",
          sub: "We never see your card",
        },
      ];

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(140px+env(safe-area-inset-bottom))] relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"

    >

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-md mx-auto w-full flex flex-col"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] mb-2 self-start transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to my overview
          </button>
        )}

        {banner && <div className="mb-3">{banner}</div>}

        {/* Hero image with colorful halo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="relative flex justify-center mb-3 sm:mb-4"
        >
          <div
            aria-hidden
            className="absolute inset-0 blur-2xl opacity-50"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,116,177,0.5) 0%, rgba(255,235,118,0.3) 40%, transparent 70%)",
            }}
          />
          <Image
            src="/paywall.webp"
            alt=""
            width={280}
            height={280}
            className="relative object-contain w-full max-h-[130px] sm:max-h-40"
          />
        </motion.div>

        {/* Social proof: stars + count */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-3"
        >
          <div className="flex">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <span className="text-xs sm:text-sm font-semibold text-[#3D3D3D]">
            4.9 &middot;{" "}
            <AnimatedCounter
              target={12800}
              formatter={(n) => `${n.toLocaleString("en-US")}+`}
            />{" "}
            women
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-center mb-4 sm:mb-5"
        >
          {isAnnual ? (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-1.5 leading-tight">
                Try Lisa free for{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(135deg, #ff74b1, #65dbff)" }}
                >
                  3 days
                </span>
              </h2>
              <p className="text-sm sm:text-base text-[#5A5A5A]">
                <strong className="text-[#3D3D3D]">$0 charged today.</strong> We&apos;ll remind you 24h
                before your trial ends.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-1.5 leading-tight">
                Start your Lisa journey{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(135deg, #65dbff, #ff74b1)" }}
                >
                  today
                </span>
              </h2>
              <p className="text-sm sm:text-base text-[#5A5A5A]">
                <strong className="text-[#3D3D3D]">50% off</strong> our regular price. Cancel anytime.
              </p>
            </>
          )}
        </motion.div>

        {/* Plan toggle */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative flex rounded-2xl p-1 border mb-3 shadow-sm"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E8DDD9" }}
          role="tablist"
          aria-label="Billing period"
        >
          <span
            className="absolute -top-2.5 left-[25%] -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wide text-white shadow-md flex items-center gap-1"
            style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ff9d6c 100%)" }}
          >
            <Sparkles className="w-3 h-3" />
            MOST POPULAR &middot; 50% OFF
          </span>

          <button
            type="button"
            role="tab"
            aria-selected={selectedPlan === "annual"}
            onClick={() => onSelectPlan("annual")}
            className="flex-1 py-3 px-3 rounded-xl text-sm font-semibold transition-all relative"
            style={{
              background:
                selectedPlan === "annual"
                  ? "linear-gradient(135deg, rgba(255,116,177,0.15) 0%, rgba(101,219,255,0.15) 100%)"
                  : "transparent",
              color: "#3D3D3D",
              boxShadow:
                selectedPlan === "annual"
                  ? "inset 0 0 0 2px #ff74b1, 0 2px 8px rgba(255,116,177,0.2)"
                  : "none",
            }}
          >
            Annual
            <span className="block text-[10px] font-medium mt-0.5 text-[#9A9A9A] line-through">$13.17/mo</span>
            <span className="block text-xs font-bold mt-0 text-[#ff74b1]">$6.58/mo</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedPlan === "monthly"}
            onClick={() => onSelectPlan("monthly")}
            className="flex-1 py-3 px-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              backgroundColor: selectedPlan === "monthly" ? "#F5EFEC" : "transparent",
              color: "#3D3D3D",
              boxShadow:
                selectedPlan === "monthly"
                  ? "inset 0 0 0 2px #65dbff, 0 2px 8px rgba(101,219,255,0.18)"
                  : "none",
            }}
          >
            Monthly
            <span className="block text-[10px] font-medium mt-0.5 text-[#9A9A9A] line-through">$24/mo</span>
            <span className="block text-xs font-bold mt-0 text-[#5A5A5A]">$12/mo</span>
          </button>
        </motion.div>

        {/* Price summary card */}
        <motion.div
          key={selectedPlan}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border bg-white p-4 mb-4 shadow-sm"
          style={{
            borderColor: selectedPlan === "annual" ? "#ff74b1" : "#E8DDD9",
            backgroundImage:
              selectedPlan === "annual"
                ? "linear-gradient(135deg, rgba(255,116,177,0.06) 0%, rgba(255,235,118,0.04) 50%, rgba(101,219,255,0.06) 100%)"
                : "none",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs sm:text-sm font-medium text-[#5A5A5A]">
              {isAnnual ? "After your 3-day free trial" : "Starting today"}
            </span>
            {isAnnual ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-green-700 bg-green-100">
                <TrendingUp className="w-3 h-3" />
                Save $65/yr
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold text-pink-700 bg-pink-100">
                <Sparkles className="w-3 h-3" />
                50% off
              </span>
            )}
          </div>

          {isAnnual ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm text-[#9A9A9A] line-through font-medium">$13.17</span>
                <span
                  className="text-4xl font-extrabold bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(135deg, #ff74b1 0%, #65dbff 100%)",
                  }}
                >
                  $6.58
                </span>
                <span className="text-sm text-[#5A5A5A] font-medium">/ month</span>
              </div>
              <p className="text-xs text-[#5A5A5A] mt-1">
                Billed $79 once a year &middot; less than a coffee per week
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm text-[#9A9A9A] line-through font-medium">$24</span>
                <span
                  className="text-4xl font-extrabold bg-clip-text text-transparent"
                  style={{
                    backgroundImage: "linear-gradient(135deg, #65dbff 0%, #ff74b1 100%)",
                  }}
                >
                  $12
                </span>
                <span className="text-sm text-[#5A5A5A] font-medium">/ month</span>
              </div>
              <p className="text-xs text-[#5A5A5A] mt-1">Billed monthly &middot; cancel anytime</p>
            </>
          )}
        </motion.div>

        {/* What's included - reminds her what she's paying for at the decision point */}
        <div
          className="rounded-2xl border p-4 mb-3"
          style={{
            borderColor: "#f0d071",
            background: "linear-gradient(135deg, rgba(245,197,24,0.08) 0%, rgba(255,235,118,0.12) 50%, rgba(245,197,24,0.06) 100%)",
            boxShadow: "0 0 16px rgba(245,197,24,0.18)",
          }}
        >
          <p className="text-xs font-bold tracking-wide uppercase mb-2.5 text-[#8a6d00]">
            Everything included
          </p>
          <ul className="space-y-2.5">
            {[
              { bold: "Personalized 8-week plan", sub: "daily movement, nutrition, relaxation & habits" },
              { bold: "Lisa", sub: "your 24/7 menopause AI companion" },
              { bold: "Symptom tracking", sub: "with doctor-ready reports" },
            ].map((item) => (
              <li key={item.bold} className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400/90 shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </span>
                <span className="text-sm text-[#3D3D3D] leading-snug">
                  <strong>{item.bold}</strong>
                  <span className="text-[#6B6B6B]"> &mdash; {item.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Trust boxes - scannable 2x2 grid, one promise per box */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {trustLabels.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                className="rounded-xl border bg-white px-3 py-2.5 shadow-sm"
                style={{ borderColor: "#E8DDD9" }}
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full mb-1.5 ${item.bg}`}
                >
                  <Icon className={`w-4 h-4 ${item.fg}`} />
                </span>
                <p className="text-sm font-bold text-[#3D3D3D] leading-tight">{item.title}</p>
                <p className="text-xs text-[#7A7A7A] leading-snug mt-0.5">{item.sub}</p>
              </motion.div>
            );
          })}
        </div>

        {/* The 8-Week Guarantee - identical copy and layout to the diagnosis
            page's guarantee card, restated at the moment of payment. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-base font-bold text-green-800 mb-2">The 8-Week Guarantee</h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              If you don&apos;t feel better in <b>8 weeks</b>, we&apos;ll{" "}
              <b className="text-green-700">refund you</b> in full.
            </p>
            <div className="w-16 h-px bg-green-300 my-3" />
            <p className="text-xs text-[#5A5A5A] leading-snug">
              No conditions, no hoops. The only way to lose is to not start.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
            {error}
          </div>
        )}
      </motion.div>

      {/* Sticky CTA bar - fixed to the bottom on every viewport */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85 px-4 pt-3 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto w-full">
        <motion.button
          type="button"
          disabled={checkoutLoading}
          onClick={() => handleCheckoutClick(selectedPlan)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="relative w-full min-h-14 py-4 font-bold text-foreground rounded-2xl transition-all flex items-center justify-center gap-2 text-base sm:text-base disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group"
          style={{
            background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)",
            boxShadow:
              "0 8px 24px rgba(255, 116, 177, 0.4), 0 2px 8px rgba(101, 219, 255, 0.25)",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"
            style={{
              background:
                "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
            }}
          />
          {checkoutLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Redirecting to checkout&hellip;
            </>
          ) : isAnnual ? (
            <>
              <Lock className="w-4 h-4" />
              Start my 3-day free trial
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Get my plan &mdash; $12/mo
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
        <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-2 sm:mt-3 leading-relaxed">
          {isAnnual ? (
            <>
              $0 today, then $79/year. Cancel anytime.
            </>
          ) : (
            <>
              Billed $12/month. All features included. Cancel anytime.
            </>
          )}
        </p>
        </div>
      </div>
    </div>
  );
}

/** Banner used for `disputed` users in the dashboard paywall. */
export function DisputedAccountBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <strong className="block">Your account is under review.</strong>
        <span>
          A payment dispute was filed. Email{" "}
          <a className="underline" href="mailto:support@menolisa.com">
            support@menolisa.com
          </a>{" "}
          to resolve.
        </span>
      </div>
    </div>
  );
}
