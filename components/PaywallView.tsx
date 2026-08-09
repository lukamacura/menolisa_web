"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
  CreditCard,
} from "lucide-react";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import { META_CURRENCY, PLAN_VALUE } from "@/lib/metaPixel";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_ANCHOR_PRICE,
  PLAN_DISCOUNT_PCT,
  PLAN_DISCOUNT_WINDOW_MINUTES,
  PLAN_DISCOUNT_WINDOW_MS,
  PLAN_ID,
  PLAN_PRICE,
  PLAN_PRICE_PER_DAY,
  PLAN_WEEKS,
  formatPrice,
} from "@/lib/pricing";
import { trackFb } from "@/lib/metaPixelClient";

export interface PaywallViewProps {
  onCheckout: () => void | Promise<void>;
  checkoutLoading: boolean;
  error?: string | null;
  /** Optional banner above the hero (e.g. "Account under review" for disputed). */
  banner?: ReactNode;
  /** Optional back link (e.g. return to the diagnosis page). */
  onBack?: () => void;
  /**
   * Her first name, when we have it. Only used to address the countdown to her
   * plan ("reserved for Linda's plan") - a generic timer reads as site-wide
   * theatre, the same one reads as held for something that is already hers.
   */
  firstName?: string;
  /**
   * Which funnel this paywall belongs to. Sent to Meta as `content_category` so
   * the registration funnel and the expired-account paywall stay separable in
   * Events Manager.
   */
  trackingSource?: "register" | "dashboard";
}

const PRICE = formatPrice(PLAN_PRICE);
const ANCHOR = formatPrice(PLAN_ANCHOR_PRICE);
const PER_DAY = `$${PLAN_PRICE_PER_DAY.toFixed(2)}`;

/**
 * Where the deadline lives. sessionStorage, not state: a reload must not hand
 * her a fresh 10 minutes, or the countdown is visibly theatre. Per-tab-session
 * rather than localStorage, so someone coming back tomorrow starts a new window
 * instead of landing on a paywall that expired days ago.
 */
const DEADLINE_KEY = "menolisa:paywall-discount-deadline";

function readDeadline(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(DEADLINE_KEY));
    // A stored deadline further out than the full window means a stale or
    // tampered value; treat it as absent rather than honoring it.
    if (Number.isFinite(stored) && stored > 0 && stored <= Date.now() + PLAN_DISCOUNT_WINDOW_MS) {
      return stored;
    }
  } catch {
    // sessionStorage can throw in private/blocked contexts.
  }
  return 0;
}

function writeDeadline(deadline: number) {
  try {
    window.sessionStorage.setItem(DEADLINE_KEY, String(deadline));
  } catch {
    // Non-fatal: the countdown just resets on reload.
  }
}

/** `585000` → `"09:45"`. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const subscribeToNothing = () => () => {};

/**
 * `false` on the server and through hydration, `true` after. `/register` can
 * server-render the paywall (Stripe's cancel URL returns to `?phase=paywall`),
 * and by then sessionStorage may hold a half-spent deadline the server knew
 * nothing about — so the countdown has to sit out hydration rather than
 * disagree with the HTML. useSyncExternalStore is the one hook that flips after
 * hydration without a mismatch warning.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

/**
 * Countdown on the discounted price. The deadline is resolved during the first
 * render rather than in an effect, so once hydrated the paywall paints the
 * stored countdown directly instead of flashing a full window first.
 */
function useDiscountWindow() {
  const hydrated = useHydrated();
  const [deadline, setDeadline] = useState(() =>
    typeof window === "undefined" ? 0 : readDeadline() || Date.now() + PLAN_DISCOUNT_WINDOW_MS
  );
  const [now, setNow] = useState(() =>
    typeof window === "undefined" ? 0 : Date.now()
  );

  // Persisting is an external-system write, which is what effects are for.
  useEffect(() => {
    if (deadline) writeDeadline(deadline);
  }, [deadline]);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const reclaim = useCallback(() => {
    setNow(Date.now());
    setDeadline(Date.now() + PLAN_DISCOUNT_WINDOW_MS);
  }, []);

  const remainingMs =
    hydrated && deadline ? Math.max(0, deadline - now) : PLAN_DISCOUNT_WINDOW_MS;

  return { remainingMs, expired: remainingMs === 0, reclaim };
}

// Scannable 2x2 grid, one promise per box. At the payment moment she scans
// rather than reads, so every box is a 2-3 word headline with one support line.
const trustLabels = (price: string) => [
  {
    icon: CreditCard,
    bg: "bg-pink-100",
    fg: "text-pink-600",
    title: "One payment",
    sub: `${price} covers all ${PLAN_WEEKS} weeks`,
  },
  {
    icon: Zap,
    bg: "bg-yellow-100",
    fg: "text-yellow-700",
    title: "Instant access",
    sub: "Your plan is ready now",
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

export function PaywallView({
  onCheckout,
  checkoutLoading,
  error,
  banner,
  onBack,
  firstName,
  trackingSource,
}: PaywallViewProps) {
  const { remainingMs, expired, reclaim } = useDiscountWindow();
  const name = firstName?.trim() ?? "";
  // The live price on the card. Only the discounted one is ever attached to a
  // checkout button - see PLAN_DISCOUNT_WINDOW_MS in lib/pricing.ts.
  const livePrice = expired ? ANCHOR : PRICE;

  // ViewContent fires once when the paywall appears.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    trackFb("ViewContent", {
      content_name: "paywall",
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE,
      currency: META_CURRENCY,
    });
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // InitiateCheckout fires on the CTA - the moment she actually enters Stripe -
  // rather than on paywall view, so it reflects intent rather than exposure.
  const handleCheckoutClick = () => {
    trackFb("InitiateCheckout", {
      content_name: PLAN_ID,
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE,
      currency: META_CURRENCY,
      num_items: 1,
    });
    return onCheckout();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(140px+env(safe-area-inset-bottom))] relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
          <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-1.5 leading-tight">
            Start your {PLAN_WEEKS}-week plan{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #ff74b1, #65dbff)" }}
            >
              today
            </span>
          </h2>
          <p className="text-sm sm:text-base text-[#5A5A5A]">
            {expired ? (
              <>
                Your <strong className="text-[#3D3D3D]">{PLAN_DISCOUNT_PCT}% off</strong> held
                for {PLAN_DISCOUNT_WINDOW_MINUTES} minutes and just ran out &mdash; you can get
                it back below.
              </>
            ) : (
              <>
                <strong className="text-[#3D3D3D]">{PLAN_DISCOUNT_PCT}% off</strong> our regular
                price. Do the {PLAN_WEEKS} weeks and still don&apos;t feel better? Full refund.
              </>
            )}
          </p>
        </motion.div>

        {/* Countdown on the discounted price. Display only - the discount is
            always reclaimable, so the button below never quotes a price Stripe
            wouldn't charge. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-2 mb-3"
          style={
            expired
              ? { borderColor: "#E8DDD9", background: "rgba(154,154,154,0.08)" }
              : {
                  borderColor: "#ff74b1",
                  background:
                    "linear-gradient(135deg, rgba(255,116,177,0.10) 0%, rgba(255,157,108,0.10) 100%)",
                }
          }
        >
          <Clock
            className={`w-4 h-4 shrink-0 ${expired ? "text-[#9A9A9A]" : "text-[#ff74b1]"}`}
          />
          {expired ? (
            // Only the expiry is announced - a per-second aria-live countdown
            // would talk over everything else on the page.
            <p className="text-xs sm:text-sm font-semibold text-[#7A7A7A]" aria-live="polite">
              Your {PLAN_DISCOUNT_PCT}% discount has expired
            </p>
          ) : (
            <p className="text-xs sm:text-sm font-semibold text-[#3D3D3D]">
              {name
                ? `${PLAN_DISCOUNT_PCT}% off reserved for ${name}'s plan: `
                : `${PLAN_DISCOUNT_PCT}% off ends in `}
              <span className="font-extrabold tabular-nums text-[#ff74b1]">
                {formatRemaining(remainingMs)}
              </span>
            </p>
          )}
        </motion.div>

        {/* Price card - the single plan, no choice to make */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="relative rounded-2xl border bg-white p-4 mb-4 shadow-sm"
          style={{
            borderColor: expired ? "#E8DDD9" : "#ff74b1",
            backgroundImage: expired
              ? "none"
              : "linear-gradient(135deg, rgba(255,116,177,0.06) 0%, rgba(255,235,118,0.04) 50%, rgba(101,219,255,0.06) 100%)",
          }}
        >
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wide text-white shadow-md flex items-center gap-1 whitespace-nowrap"
            style={{
              background: expired
                ? "linear-gradient(135deg, #b0a8a4 0%, #9A9A9A 100%)"
                : "linear-gradient(135deg, #ff74b1 0%, #ff9d6c 100%)",
            }}
          >
            <Sparkles className="w-3 h-3" />
            {PLAN_WEEKS}-WEEK PLAN &middot;{" "}
            {expired ? "REGULAR PRICE" : `${PLAN_DISCOUNT_PCT}% OFF`}
          </span>

          <div className="pt-2 text-center">
            <div className="flex items-baseline justify-center gap-2 flex-wrap">
              {!expired && (
                <span className="text-sm text-[#9A9A9A] line-through font-medium">{ANCHOR}</span>
              )}
              <span
                className={
                  expired
                    ? "text-4xl font-extrabold text-[#7A7A7A]"
                    : "text-4xl font-extrabold bg-clip-text text-transparent"
                }
                style={
                  expired
                    ? undefined
                    : { backgroundImage: "linear-gradient(135deg, #ff74b1 0%, #65dbff 100%)" }
                }
              >
                {livePrice}
              </span>
              <span className="text-sm text-[#5A5A5A] font-medium">
                / {PLAN_WEEKS} weeks
              </span>
            </div>
            <p className="text-xs text-[#5A5A5A] mt-1.5">
              {expired ? (
                <>
                  Back to the regular price &mdash; your {PRICE} rate is one tap away
                </>
              ) : (
                <>
                  That&apos;s about {PER_DAY} a day &middot; renews every {PLAN_WEEKS} weeks,
                  cancel anytime
                </>
              )}
            </p>
          </div>
        </motion.div>

        {/* What Stripe will actually accept, named. "Stripe secured" tells her
            the checkout is safe but not that her wallet works there - and Apple
            Pay / Google Pay are the difference between one tap and finding a
            card. Wordmarks rather than brand logos: no third-party image assets
            to license, keep current, or ship on every page load. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-4">
          {["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay"].map((m) => (
            <span
              key={m}
              className="rounded-md border bg-white px-2 py-1 text-[10px] font-bold tracking-wide text-[#5A5A5A]"
              style={{ borderColor: "#E8DDD9" }}
            >
              {m}
            </span>
          ))}
        </div>

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
              {
                bold: `Personalized ${PLAN_WEEKS}-week plan`,
                sub: "daily movement, nutrition, relaxation & habits",
              },
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

        {/* Trust boxes */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {trustLabels(livePrice).map((item, i) => {
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
            page's guarantee card, restated at the moment of payment. It covers
            exactly one billing period, and it is conditional on adherence: the
            condition is the argument, not fine print. "This works if you do it"
            is a stronger claim than "no questions asked", and it is the only
            version we can afford to honor. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-base font-bold text-green-800 mb-2">
              The {PLAN_WEEKS}-Week Guarantee
            </h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              Follow <b>{PLAN_ADHERENCE_PCT}% of your plan</b> for {PLAN_WEEKS} weeks. If you still
              don&apos;t feel better, we&apos;ll{" "}
              <b className="text-green-700">refund you</b> in full.
            </p>
            <div className="w-16 h-px bg-green-300 my-3" />
            <p className="text-xs text-[#5A5A5A] leading-snug">
              Your plan counts itself as you tick off each day &mdash; nothing to submit, nothing to
              prove. Do the work and the risk is ours.
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
            disabled={checkoutLoading && !expired}
            onClick={expired ? reclaim : handleCheckoutClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            // Solid, not the pastel brand gradient. The gradient is the funnel's
            // house style, but on this screen it sits on top of pastel cards and
            // stops reading as the one thing to press - so the payment button is
            // the only element on the page in solid magenta with white text.
            className="relative w-full min-h-14 py-4 font-bold text-white rounded-2xl transition-all flex items-center justify-center gap-2 text-base sm:text-base disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group"
            style={{
              background: "#E0117A",
              boxShadow: "0 8px 24px rgba(224, 17, 122, 0.38), 0 2px 8px rgba(224, 17, 122, 0.22)",
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
            {expired ? (
              <>
                <RotateCcw className="w-4 h-4" />
                Get my {PLAN_DISCOUNT_PCT}% discount back
                <ArrowRight className="w-4 h-4" />
              </>
            ) : checkoutLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Redirecting to checkout&hellip;
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Get my {PLAN_WEEKS}-week plan &mdash; {PRICE}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
          <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-2 sm:mt-3 leading-relaxed">
            {expired ? (
              <>
                One tap reopens your {PRICE} rate for another{" "}
                {PLAN_DISCOUNT_WINDOW_MINUTES} minutes.
              </>
            ) : (
              <>
                Billed {PRICE} today, then every {PLAN_WEEKS} weeks. Cancel anytime.
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
