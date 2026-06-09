"use client";

import { ReactNode } from "react";
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
}

export function PaywallView({
  selectedPlan,
  onSelectPlan,
  onCheckout,
  checkoutLoading,
  error,
  banner,
  onBack,
}: PaywallViewProps) {
  const isAnnual = selectedPlan === "annual";

  const trustLabels = isAnnual
    ? [
        {
          icon: Zap,
          bg: "bg-pink-100",
          fg: "text-pink-600",
          text: (
            <>
              <strong>Nothing charged today.</strong> Trial starts the moment you sign up
            </>
          ),
        },
        {
          icon: Clock,
          bg: "bg-yellow-100",
          fg: "text-yellow-700",
          text: (
            <>
              We&apos;ll <strong>email you 24h before</strong> the trial ends. No surprises
            </>
          ),
        },
        {
          icon: Check,
          bg: "bg-sky-100",
          fg: "text-sky-600",
          text: (
            <>
              <strong>Cancel in 2 taps.</strong> No calls, no hoops
            </>
          ),
        },
        {
          icon: ShieldCheck,
          bg: "bg-green-100",
          fg: "text-green-700",
          text: (
            <>
              Stripe-secured. <strong>We never see your card</strong>
            </>
          ),
        },
      ]
    : [
        {
          icon: CreditCard,
          bg: "bg-pink-100",
          fg: "text-pink-600",
          text: (
            <>
              <strong>Billed monthly.</strong> No annual commitment required
            </>
          ),
        },
        {
          icon: Check,
          bg: "bg-sky-100",
          fg: "text-sky-600",
          text: (
            <>
              <strong>Cancel in 2 taps.</strong> No calls, no hoops
            </>
          ),
        },
        {
          icon: ShieldCheck,
          bg: "bg-green-100",
          fg: "text-green-700",
          text: (
            <>
              Stripe-secured. <strong>We never see your card</strong>
            </>
          ),
        },
        {
          icon: Zap,
          bg: "bg-yellow-100",
          fg: "text-yellow-700",
          text: (
            <>
              <strong>Instant access.</strong> Start tracking your symptoms today
            </>
          ),
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
            src="/paywall.png"
            alt=""
            width={280}
            height={160}
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
          className="rounded-2xl border p-4 mb-4"
          style={{
            borderColor: "#f5c518",
            background: "linear-gradient(135deg, rgba(245,197,24,0.08) 0%, rgba(255,235,118,0.12) 50%, rgba(245,197,24,0.06) 100%)",
            boxShadow: "0 0 16px rgba(245,197,24,0.25), 0 0 32px rgba(245,197,24,0.12), inset 0 0 20px rgba(245,197,24,0.05)",
          }}
        >
          <p
            className="text-xs font-bold mb-2.5"
            style={{
              color: "#d4a800",
              textShadow: "0 0 8px rgba(245,197,24,0.7), 0 0 16px rgba(245,197,24,0.4)",
            }}
          >
            Everything included
          </p>
          <ul className="space-y-2">
            {[
              { bold: "Personalized 8-week plan", sub: "built around your symptoms" },
              { bold: "Lisa", sub: "your 24/7 menopause AI companion" },
              { bold: "Symptom tracking", sub: "with doctor-ready reports" },
            ].map((item) => (
              <li key={item.bold} className="flex items-start gap-2">
                <Check className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <span className="text-sm text-[#3D3D3D] leading-snug">
                  <strong>{item.bold}</strong>
                  <span className="text-[#7A7A7A]"> - {item.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Trust labels */}
        <ul className="space-y-2 mb-5 text-sm text-[#3D3D3D]">
          {trustLabels.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                className="flex items-center gap-2.5"
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${item.bg}`}
                >
                  <Icon className={`w-3.5 h-3.5 ${item.fg}`} />
                </span>
                <span className="leading-snug">{item.text}</span>
              </motion.li>
            );
          })}
        </ul>

        {/* The 80+ Guarantee - same conditional risk-reversal as the diagnosis
            page, restated in one line at the moment of payment. */}
        <div className="flex items-start gap-2.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 mb-4">
          <ShieldCheck className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-800 leading-snug">The 80+ Guarantee</p>
            <p className="text-xs text-[#5A5A5A] leading-snug mt-0.5">
              Follow your 8-week plan and don&apos;t reach a score of 80+? We&apos;ll refund you in full.
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
          onClick={() => onCheckout(selectedPlan)}
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
              Claim MenoLisa & 8 week Plan
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Claim MenoLisa & 8 week Plan
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
        <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-2 sm:mt-3 leading-relaxed">
          {isAnnual ? (
            <>
              $79/year. 3 days free. Cancel anytime.
            </>
          ) : (
            <>
            $12/month. All features included. Cancel anytime.
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
