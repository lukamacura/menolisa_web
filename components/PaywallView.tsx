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
import { SocialProofPolaroid, SymptomOutcomeCards } from "@/components/SocialProof";
import { META_CURRENCY, PLAN_VALUE } from "@/lib/metaPixel";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_ANCHOR_PRICE,
  PLAN_ANCHOR_PRICE_PER_DAY,
  PLAN_DISCOUNT_PCT,
  PLAN_DISCOUNT_WINDOW_MINUTES,
  PLAN_DISCOUNT_WINDOW_MS,
  PLAN_ID,
  PLAN_PRICE,
  PLAN_PRICE_PER_DAY,
  PLAN_WEEKS,
  formatPrice,
} from "@/lib/pricing";
import {
  PLAN_DAYS,
  formatPlanDate,
  getOfferPromise,
  planFinishDate,
} from "@/lib/planTimeline";
import { getSymptomTransforms } from "@/lib/testimonials";
import { trackFb } from "@/lib/metaPixelClient";
import { HighlightSweep } from "@/components/HighlightSweep";

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
  /**
   * Her selected symptoms, when we have them (the /register funnel has just
   * asked). Personalizes the before/after outcome cards; the dashboard paywall
   * has no quiz to draw from, so it falls back to a representative set.
   */
  topProblems?: string[];
  /**
   * Her selected goal ids, when we have them. Only the first is used - the far
   * end of the finish line is the outcome *she* picked, not one we assigned.
   */
  goal?: string[];
}

const PRICE = formatPrice(PLAN_PRICE);
const ANCHOR = formatPrice(PLAN_ANCHOR_PRICE);
const PER_DAY = `$${PLAN_PRICE_PER_DAY.toFixed(2)}`;
const ANCHOR_PER_DAY = `$${PLAN_ANCHOR_PRICE_PER_DAY.toFixed(2)}`;

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
 * nothing about - so the countdown has to sit out hydration rather than
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

/**
 * Her finish line, as a date.
 *
 * The one block on this page that belongs to her: today on the left in the words
 * she used for her worst symptom, the day her plan ends on the right in the goal
 * she picked. Everything else here - trust boxes, card wordmarks, guarantee - is
 * identical for every visitor.
 *
 * It earns its place directly above the price by supplying the denominator. The
 * card underneath quotes a per-day figure with nothing to divide by; "Aug 9 →
 * Oct 4, 56 days" is what turns $1.05/day back into the $59 she is about to pay,
 * and turns "8 weeks" from a duration into an appointment she can picture.
 *
 * No projected number appears here on purpose. See lib/planTimeline.ts.
 */
function PlanFinishLine({
  firstName,
  topProblems,
  goal,
}: {
  firstName?: string;
  topProblems?: string[];
  goal?: string[];
}) {
  // Resolved once per mount rather than per render, so a re-render at midnight
  // can't move her finish line by a day mid-session.
  const [start] = useState(() => new Date());
  const finish = planFinishDate(start);

  // The dates are timezone-dependent, so the server (UTC) and a visitor west of
  // it can disagree about today's date. The labels around them are stable, so
  // only the two date strings sit out hydration.
  const hydrated = useHydrated();
  const startLabel = formatPlanDate(start);
  const finishLabel = formatPlanDate(finish, true);

  const name = firstName?.trim();
  // Her own words on both ends: the "before" line for her #1 symptom, and the
  // promise attached to the goal she chose. If either is missing (the dashboard
  // paywall has no quiz behind it) the dates still stand on their own - a
  // generic finish line is fine, a stranger's symptom in her place is not.
  const before = getSymptomTransforms(topProblems ?? [], 1)[0]?.before;
  const after = goal && goal.length > 0 ? getOfferPromise(goal) : undefined;
  const personalized = Boolean(before && after);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.26 }}
      className="rounded-2xl border bg-white p-3.5 mb-3 shadow-sm"
      style={{ borderColor: "#E8DDD9" }}
    >
      <p className="text-[10px] font-bold tracking-wide uppercase text-[#9A9A9A] mb-2.5">
        {name ? `${name}'s finish line` : "Your finish line"}
      </p>

      {/* The two ends, with the arrow doing the work of the word "becomes" */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
            Today
          </p>
          {/* Non-breaking space holds the row's height through hydration. */}
          <p className="text-base font-bold text-[#7A7A7A] leading-tight tabular-nums">
            {hydrated ? startLabel : " "}
          </p>
        </div>

        <ArrowRight className="w-4 h-4 shrink-0 text-[#ff74b1]" aria-hidden />

        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#ff74b1]">
            Week {PLAN_WEEKS}
          </p>
          <p
            className="text-base font-extrabold leading-tight tabular-nums bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #ff74b1 0%, #65dbff 100%)" }}
          >
            {hydrated ? finishLabel : " "}
          </p>
        </div>
      </div>

      {personalized && (
        <>
          <div className="h-px my-3" style={{ background: "#E8DDD9" }} />
          <div className="grid grid-cols-2 gap-3">
            <p className="text-[11px] text-[#7A7A7A] leading-snug">{before}</p>
            <p className="text-[11px] font-semibold text-[#3D3D3D] leading-snug text-right">
              {after}
            </p>
          </div>
        </>
      )}

      <p className="text-[10px] text-[#9A9A9A] leading-snug mt-2.5">
        {hydrated ? (
          <>
            Your {PLAN_WEEKS} weeks run {startLabel} &ndash; {formatPlanDate(finish)}.
          </>
        ) : (
          <>Your plan runs {PLAN_WEEKS} weeks.</>
        )}{" "}
        {PLAN_DAYS} days, {PER_DAY} a day.
      </p>
    </motion.div>
  );
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
  topProblems,
  goal,
}: PaywallViewProps) {
  const { remainingMs, expired, reclaim } = useDiscountWindow();
  const name = firstName?.trim() ?? "";
  // The live price on the card. Only the discounted one is ever attached to a
  // checkout button - see PLAN_DISCOUNT_WINDOW_MS in lib/pricing.ts.
  const livePrice = expired ? ANCHOR : PRICE;
  const livePricePerDay = expired ? ANCHOR_PER_DAY : PER_DAY;

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
            src="/paywall/paywall.webp"
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
            Start your {PLAN_WEEKS} week plan{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #ff74b1, #65dbff)" }}
            >
              TODAY
            </span>
          </h2>
          <p className="text-sm sm:text-base text-[#5A5A5A]">
            {expired ? (
              <>
                Your <strong className="text-[#3D3D3D]">{PLAN_DISCOUNT_PCT}% off</strong> held
                for {PLAN_DISCOUNT_WINDOW_MINUTES} minutes and just ran out — you can get
                it back below.
              </>
            ) : (
              <>
                <strong className="text-[#3D3D3D]">{PLAN_DISCOUNT_PCT}% off</strong> our regular
                price. Do the {PLAN_WEEKS} weeks and still don’t feel better? Full refund.
              </>
            )}
          </p>
        </motion.div>

        {/* Her finish line, sitting above the countdown rather than between it
            and the price card: the countdown and the price are a matched pair
            (same pink border, same urgency), and splitting them to insert this
            broke that read. Outcome, then urgency, then number. */}
        <PlanFinishLine firstName={firstName} topProblems={topProblems} goal={goal} />

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
            {PLAN_WEEKS} WEEK PLAN &middot;{" "}
            {expired ? "REGULAR PRICE" : `${PLAN_DISCOUNT_PCT}% OFF`}
          </span>

          <div className="pt-2 text-center">
            <div className="flex items-baseline justify-center gap-2 flex-wrap">
              {!expired && (
                <span className="text-sm text-[#9A9A9A] line-through font-medium">
                  {ANCHOR_PER_DAY}
                </span>
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
                {livePricePerDay}
              </span>
              <span className="text-sm text-[#5A5A5A] font-medium">/ day</span>
            </div>
            <p className="text-xs text-[#5A5A5A] mt-1.5">
              {expired ? (
                <>
                  Back to the regular price &mdash; your {PRICE} rate is one tap away
                </>
              ) : (
                <>
                  Billed {PRICE} today &middot; renews every {PLAN_WEEKS} weeks, <br /> <b>cancel anytime</b> 
                </>
              )}
            </p>

            {/* What Stripe will actually accept, shown as the card/wallet marks
                she recognizes. "Stripe secured" tells her the checkout is safe
                but not that her wallet works there - and Apple Pay / Google Pay
                are the difference between one tap and finding a card. */}
            <div className="mt-3 flex justify-center border-t border-[#F0E6E2] pt-3">
              <Image
                src="/paywall/paywall_logos.webp"
                alt="Visa, Mastercard, Google Pay and Apple Pay accepted"
                width={430}
                height={140}
                className="h-auto w-full max-w-[200px] object-contain"
              />
            </div>
          </div>
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
          <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight mb-3">
            Everything included <HighlightSweep variant="yellow">for you</HighlightSweep>
          </h2>
          <ul className="space-y-2.5">
            {[
              {
                bold: `Personalized ${PLAN_WEEKS} week plan`,
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
              The {PLAN_WEEKS} Week Guarantee
            </h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              Follow <b>{PLAN_ADHERENCE_PCT}% of your plan</b> for {PLAN_WEEKS} weeks. If you still
              don’t feel better, we’ll{" "}
              <b className="text-green-700">refund you</b> in full.
            </p>
            <div className="w-16 h-px bg-green-300 my-3" />
            <p className="text-xs text-[#5A5A5A] leading-snug">
              Your plan counts itself as you tick off each day &mdash; nothing to submit, nothing to
              prove. Do the work and the risk is ours.
            </p>
          </div>
        </div>

        {/* Social proof + outcome cards, reused from the /register diagnosis
            screen (components/SocialProof.tsx) so the paywall carries the same
            proof even when reached directly (e.g. a lapsed dashboard user who
            never saw the diagnosis screen this session). */}
        <SocialProofPolaroid />
        <SymptomOutcomeCards topProblems={topProblems} />

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
            // Green, layered so it reads bright without failing contrast. The
            // base gradient travels through lighter greens (green-600 #16A34A
            // 50%) but keeps its darkest points under the label ends (green-700
            // #15803D at both corners, 4.9:1) so white text stays legible - a
            // fully pale green fill would drop under 4.5:1 everywhere the text
            // sits. On top, a lighter-green gloss highlight (green-400) fades
            // from the top edge, giving the fresh, lit look without touching the
            // text band. /register's pastel CTA can be light because it sits on
            // white; this one sits on a stack of pastel cards, so it stays
            // saturated to read as the one thing to press, and green echoes the
            // refund guarantee card above ("safe to press"). The green glow lifts
            // it off the page as one premium surface.
            className="relative w-full min-h-14 py-4 font-bold text-white rounded-2xl transition-all flex items-center justify-center gap-2 text-base sm:text-base disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group"
            style={{
              background:
                "linear-gradient(180deg, rgba(134,239,172,0.45) 0%, rgba(134,239,172,0) 46%), linear-gradient(135deg, #15803D 0%, #16A34A 50%, #15803D 100%)",
              boxShadow:
                "0 0 28px rgba(34,197,94,0.50), 0 8px 26px rgba(21,128,61,0.38), 0 2px 8px rgba(21,128,61,0.25)",
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
              </>
            ) : checkoutLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Redirecting to checkout&hellip;
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Get my plan for {PER_DAY}/day
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
              <span className="inline-flex items-center justify-center gap-1 flex-wrap">
                <b>Safe & Secure</b> with
                <Image
                  src="/paywall/stripe.webp"
                  alt="Stripe"
                  width={200}
                  height={83}
                  className="inline-block h-3.5 w-auto align-middle -translate-y-px"
                />
                . <b>Cancel anytime</b>.
              </span>
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
