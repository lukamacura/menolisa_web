"use client";

import { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Zap,
  CreditCard,
} from "lucide-react";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import { SocialProofPolaroid, SymptomOutcomeCards } from "@/components/SocialProof";
import {
  META_CURRENCY,
  PLAN_VALUE,
  newInitiateCheckoutEventId,
  viewContentEventId,
} from "@/lib/metaPixel";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_ANCHOR_PRICE_PER_DAY,
  PLAN_DISCOUNT_PCT,
  PLAN_DISCOUNT_WINDOW_MINUTES,
  PLAN_DISCOUNT_WINDOW_MS,
  PLAN_ID,
  PLAN_PRICE,
  PLAN_PRICE_PER_DAY,
  PLAN_WEEKS,
  RENEWAL_NOTICE_DAYS,
  formatPrice,
} from "@/lib/pricing";
import { trackFb } from "@/lib/metaPixelClient";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PlanFinishBoard } from "@/components/PlanFinishBoard";
import { PhoneShot, ShotStage, SHOT_W, SHOT_H } from "@/components/PhoneShots";
import { getOfferPromise } from "@/lib/planTimeline";

export interface PaywallViewProps {
  /**
   * Starts the Stripe checkout. Receives the `event_id` this component just
   * fired the browser InitiateCheckout with - pass it to `create-checkout` as
   * `meta_event_id` so the server copy dedups against it instead of
   * double-counting her.
   */
  onCheckout: (metaEventId: string) => void | Promise<void>;
  checkoutLoading: boolean;
  error?: string | null;
  /** Optional banner above the hero (e.g. "Account under review" for disputed). */
  banner?: ReactNode;
  /** Optional back link (e.g. return to the diagnosis page). */
  onBack?: () => void;
  /**
   * Her first name, when we have it. Used in exactly one place - the price hold
   * ("Linda, your $59 rate is held while you finish"). A generic hold reads as
   * site-wide theatre; the same sentence with her name in it reads as held for
   * something that is already hers. It is deliberately the only place: the
   * finish board above it carried her name too until 2026-08-17, and two
   * mail-merges inside one screen height undo what one of them buys.
   */
  firstName?: string;
  /**
   * Which funnel this paywall belongs to. Sent to Meta as `content_category` so
   * the registration funnel and the expired-account paywall stay separable in
   * Events Manager.
   */
  trackingSource?: "register" | "dashboard";
  /**
   * Her Supabase user id. Both callers have it before this component renders -
   * the funnel signed her in anonymously back on the calculating screen, and
   * `/paywall` resolved her session before it dropped the loader.
   *
   * It is what makes `ViewContent` a count of women rather than of mounts: it
   * keys the once-per-tab guard and derives the `event_id` that the Conversions
   * API copy independently derives too (`viewContentEventId`). Absent, the event
   * still fires from the browser - undeduplicated and with no server copy, which
   * is what the whole screen did until 2026-08-19.
   */
  userId?: string | null;
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
const PER_DAY = `$${PLAN_PRICE_PER_DAY.toFixed(2)}`;
const ANCHOR_PER_DAY = `$${PLAN_ANCHOR_PRICE_PER_DAY.toFixed(2)}`;

/**
 * Where the deadline lives. sessionStorage, not state: a reload must not hand
 * her a fresh 10 minutes, or the countdown is visibly theatre — and a timer that
 * is caught resetting takes the refund guarantee's credibility down with it,
 * which is the reason the first version of this countdown (with its one-tap "get
 * my discount back" button, which *did* visibly reset) was cut on 2026-08-12.
 * There is no reclaim button now: it runs down once per tab and stays down.
 *
 * Per-tab-session rather than localStorage, so someone coming back tomorrow
 * starts a new window instead of landing on a paywall that expired days ago.
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
 * `false` on the server and through hydration, `true` after. The paywall can be
 * server-rendered, and by then sessionStorage may hold a half-spent deadline the
 * server knew nothing about — so the countdown has to sit out hydration rather
 * than disagree with the HTML. useSyncExternalStore is the one hook that flips
 * after hydration without a mismatch warning.
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
 *
 * `expired` changes copy and colour and nothing else — see
 * {@link PLAN_DISCOUNT_WINDOW_MS} for why the button and the invoice never move.
 */
function useDiscountWindow() {
  const hydrated = useHydrated();
  const [deadline] = useState(() =>
    typeof window === "undefined" ? 0 : readDeadline() || Date.now() + PLAN_DISCOUNT_WINDOW_MS
  );
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

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

  const remainingMs =
    hydrated && deadline ? Math.max(0, deadline - now) : PLAN_DISCOUNT_WINDOW_MS;

  return { remainingMs, expired: remainingMs === 0 };
}

/**
 * The finish line moved into <PlanFinishBoard /> (components/PlanFinishBoard.tsx)
 * when it stopped being two dates and an arrow and became a chart with a needle
 * on it. The reasoning for both the block and its position lives there.
 */

// Scannable 2x2 grid, one promise per box. At the payment moment she scans
// rather than reads, so every box is a 2-3 word headline with one support line.
//
// Box 1 used to read "One payment / $59 covers all 8 weeks", which sat about
// 100px under the price card's "renews every 8 weeks" and flatly contradicted
// it. This grid is the part of the page she *scans* rather than reads, so the
// false half is the half that lands - and a subscriber who believed "one
// payment" disputes the week-8 charge. The reassurance she actually needs here
// is that the renewal is escapable, which is both true and stronger.
const trustLabels = (price: string) => [
  {
    icon: CreditCard,
    bg: "bg-pink-100",
    fg: "text-pink-600",
    title: `Cancel before renewal`,
    sub: `and the ${price} is all you ever pay`,
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
  userId,
}: PaywallViewProps) {
  const name = firstName?.trim() ?? "";
  // Same promise as the finish board's far end (lib/planTimeline.ts) - the
  // headline and the chart should name the same outcome.
  const promise = getOfferPromise(goal ?? []);

  // Display-only price window. Nothing below the fold branches on it except the
  // hold band and the price card - the CTA, the checkout call and the invoice
  // are identical either side of zero.
  const { remainingMs, expired } = useDiscountWindow();

  // ViewContent: she has seen the offer. Reported twice, browser and server, and
  // counted once per woman rather than once per mount.
  //
  // Three guards stack, each covering what the one before it can't:
  //
  //   1. `viewTracked` - this mount. Cheap, and the only one that survives a
  //      browser with storage disabled.
  //   2. `sessionStorage` - this tab. The ref alone was the whole guard until
  //      2026-08-19, and a ref dies with the mount: `<PaywallView />` sits under
  //      `<AnimatePresence mode="wait" key={phase}>` in the funnel, so Back into
  //      the relief screen and forward again remounted it, as did returning from
  //      a cancelled Stripe checkout. It was reporting ~3x the number of Leads,
  //      which is why "reached the paywall" could not be divided by anything.
  //   3. Meta's own 48h dedup on `(event_name, event_id)` - every tab, every
  //      device. This is also the browser/server pair's dedup, which is why the
  //      id is derived from her user id rather than minted: see
  //      `viewContentEventId`.
  //
  // The beacon fires alongside the pixel, not instead of it, and neither waits
  // on the other - an ad blocker takes out fbevents.js, ITP takes out the
  // cookies, and this route is unaffected by both. `keepalive` so it survives
  // her tapping the CTA a moment later and the page navigating to Stripe.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;

    const params = {
      content_name: "paywall",
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE,
      currency: META_CURRENCY,
    };

    // No id to dedup on and no session for the beacon to authenticate. Report
    // the view rather than lose it, and accept the double count. Neither caller
    // reaches here in practice; see the `userId` prop.
    if (!userId) {
      trackFb("ViewContent", params);
      return;
    }

    const storageKey = `fb:vc:${userId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Private mode / storage disabled - fall through and let guard 3 handle it.
    }

    trackFb("ViewContent", params, { eventID: viewContentEventId(userId) });

    void fetch(
      `/api/paywall-view${trackingSource ? `?source=${trackingSource}` : ""}`,
      { method: "POST", credentials: "include", keepalive: true }
    ).catch(() => {
      // The pixel copy already went. A failed beacon costs match quality on the
      // ad-blocked cohort, never the event.
    });
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // InitiateCheckout fires on the CTA - the moment she actually enters Stripe -
  // rather than on paywall view, so it reflects intent rather than exposure.
  //
  // Reported twice, browser and server, on one id minted here: this is the last
  // event before the money and the one delivery leans on while Purchase volume
  // is below learning-phase exit, so losing a third of it to ITP and ad blockers
  // is not affordable. `create-checkout` sends the server copy - see
  // `sendMetaInitiateCheckout`.
  const handleCheckoutClick = () => {
    const eventId = newInitiateCheckoutEventId();
    trackFb(
      "InitiateCheckout",
      {
        content_name: PLAN_ID,
        content_category: trackingSource,
        content_type: "product",
        value: PLAN_VALUE,
        currency: META_CURRENCY,
        num_items: 1,
      },
      { eventID: eventId }
    );
    return onCheckout(eventId);
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
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}

        {banner && <div className="mb-3">{banner}</div>}

        {/* Social proof: stars + count */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-2"
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
          className="text-center mb-2.5"
        >
          {/* Leads with the outcome she picked, not the mechanics of the offer -
              the same promise as the finish board's far end (lib/planTimeline.ts,
              getOfferPromise), so the headline and the chart name the same thing.
              Price cut and refund move to a subline underneath: still on screen
              with the price card, still the terms of the deal, just not what she
              reads first. */}
          <h2 className="text-xl sm:text-2xl font-bold text-[#3D3D3D] leading-tight text-balance">
            <HighlightSweep variant="green">{promise}</HighlightSweep> in{" "}
            {PLAN_WEEKS} weeks or a full refund if it doesn’t work
          </h2>
          <p className="text-sm text-[#5A5A5A] mt-1">
            Start today,{" "}
            <span
              className="font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #ff74b1, #65dbff)" }}
            >
              {PLAN_DISCOUNT_PCT}% off
            </span>{" "}
   
          </p>
        </motion.div>

        {/* Her finish line, sitting above the price hold rather than between it
            and the price card: the hold and the price are a matched pair (same
            pink border, same urgency), and splitting them to insert this broke
            that read. Outcome, then hold, then number. */}
        <PlanFinishBoard topProblems={topProblems} goal={goal} className="mb-2.5" />

        {/* The price hold. Same pink pairing with the card below that the
            countdown had, minus the clock: it says the number is hers and will
            not move, which is the only claim about the price that is actually
            true. See the note about the retired countdown above. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 mb-2.5"
          style={{
            borderColor: "#ff74b1",
            background:
              "linear-gradient(135deg, rgba(255,116,177,0.10) 0%, rgba(255,157,108,0.10) 100%)",
          }}
        >
          <Lock className="w-4 h-4 shrink-0 text-[#ff74b1]" />
          <p className="text-xs sm:text-sm font-semibold text-[#3D3D3D]">
            {name ? `${name}, your ` : "Your "}
            <span className="font-extrabold text-[#ff74b1]">{PRICE}</span> rate is held
            while you finish
          </p>
        </motion.div>

        {/* Price card - the single plan, no choice to make */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="relative rounded-2xl border bg-white p-4 mb-4 shadow-sm"
          style={{
            borderColor: "#ff74b1",
            backgroundImage:
              "linear-gradient(135deg, rgba(255,116,177,0.06) 0%, rgba(255,235,118,0.04) 50%, rgba(101,219,255,0.06) 100%)",
          }}
        >
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wide text-white shadow-md flex items-center gap-1 whitespace-nowrap"
            style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ff9d6c 100%)" }}
          >
            <Sparkles className="w-3 h-3" />
            {PLAN_WEEKS} WEEK PLAN &middot; {PLAN_DISCOUNT_PCT}% OFF
          </span>

          <div className="pt-2 text-center">
            <div className="flex items-baseline justify-center gap-2 flex-wrap">
              <span className="text-sm text-[#9A9A9A] line-through font-medium">
                {ANCHOR_PER_DAY}
              </span>
              <span
                className="text-4xl font-extrabold bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #ff74b1 0%, #65dbff 100%)" }}
              >
                {PER_DAY}
              </span>
              <span className="text-sm text-[#5A5A5A] font-medium">/ day</span>
            </div>
            {/* The renewal is stated at the price, not in the small print under
                the button. She is agreeing to a subscription; burying that is
                how a week-8 charge turns into a chargeback. */}
            <p className="text-xs text-[#5A5A5A] mt-1.5">
              Billed {PRICE} today &middot; renews every {PLAN_WEEKS} weeks
              <br />
              We email you {RENEWAL_NOTICE_DAYS} days before. <b>Cancel anytime.</b>
            </p>

            {/* What Stripe will actually accept, shown as the card/wallet marks
                she recognizes. "Stripe secured" tells her the checkout is safe
                but not that her wallet works there - and Apple Pay / Google Pay
                are the difference between one tap and finding a card. */}
            <div className="mt-3 flex justify-center border-t border-[#F0E6E2] pt-3">
              <Image
                src="/badges/payment-methods.webp"
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
              { bold: "Symptom tracking", sub: "with symptom history" },
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

          {/* The list above is three promises; this is the three promises as
              screens that exist. Same treatment as the /register plan card
              (components/PhoneShots.tsx) on purpose — a woman who walked the
              funnel should recognise these as the same product she was just
              shown, and one who landed here cold (the dashboard paywall) gets
              her only look at it before the card.

              The stage crops them and fades to the card's own yellow rather
              than to `--card`, since that is the surface underneath here. */}
          <div className="mt-3.5 -mx-1 overflow-hidden rounded-xl ring-1 ring-yellow-300/50">
            <ShotStage className="h-40" fadeFrom="from-[#FEFAEC]">
              <PhoneShot
                src="/screenshots/screen1.webp"
                alt="Day 1 of your plan in the MenoLisa app"
                rotate={-8}
                className="w-[30%] -mr-3 mt-3"
                width={SHOT_W}
                height={SHOT_H}
              />
              <PhoneShot
                src="/screenshots/screen3.webp"
                alt="Your habits in the MenoLisa app"
                rotate={0}
                delay={0.1}
                className="w-[32%] z-10"
                width={SHOT_W}
                height={SHOT_H}
              />
              <PhoneShot
                src="/screenshots/screen4.webp"
                alt="Streaks and badges in the MenoLisa app"
                rotate={8}
                delay={0.18}
                className="w-[30%] -ml-3 mt-3"
                width={SHOT_W}
                height={SHOT_H}
              />
            </ShotStage>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#8A7F6B] leading-snug">
            Real screens from the app &mdash; yours the moment you join.
          </p>
        </div>

        {/* Trust boxes */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {trustLabels(PRICE).map((item, i) => {
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
            disabled={checkoutLoading}
            onClick={handleCheckoutClick}
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
            {checkoutLoading ? (
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
            <span className="inline-flex items-center justify-center gap-1 flex-wrap">
              <b>Safe & Secure</b> with
              <Image
                src="/badges/stripe.webp"
                alt="Stripe"
                width={200}
                height={83}
                className="inline-block h-3.5 w-auto align-middle -translate-y-px"
              />
              . <b>Cancel anytime</b>.
            </span>
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
