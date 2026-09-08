"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sunrise,
  X,
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
  FIRST_WEEK_PRICE,
  MONEY_BACK_DAYS,
  PLAN_BLOCKS_COPY,
  PLAN_ID,
  PLAN_WEEKS,
  PRICE_LINE,
  PRICE_SUBLINE,
  WEEKLY_PRICE,
  formatPrice,
} from "@/lib/pricing";
import { trackFb } from "@/lib/metaPixelClient";
import { pingFunnelStep } from "@/lib/funnelClient";
import { SERVER_FUNNEL_STEPS, type PaywallExitReason } from "@/lib/funnelSteps";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PlanFinishBoard } from "@/components/PlanFinishBoard";
import { PhoneShot, ShotStage, SHOT_W, SHOT_H } from "@/components/PhoneShots";
import { getOfferPromise } from "@/lib/planTimeline";
import { pillarFor, type WeekOneRow } from "@/lib/planPillars";
import type { PlannerDay } from "@/components/funnel/RewardBoards";
import { SYMPTOM_FIRST_MOVE, SYMPTOM_LABELS } from "@/lib/quiz-results-helpers";

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
   * API copy independently derives too (`viewContentEventId`).
   */
  userId?: string | null;
  /**
   * Her selected symptom(s), when we have them (the /register funnel has just
   * asked). The first one is the symptom week 1 of her plan is written around;
   * the dashboard paywall has no quiz to draw from, so it falls back to a
   * representative set.
   */
  topProblems?: string[];
  /**
   * Her selected goal ids, when we have them. Only the first is used - the far
   * end of the finish line is the outcome *she* picked, not one we assigned.
   */
  goal?: string[];
  /**
   * Her week 1, one row per pillar, from `buildWeekOneRows()` - her answers
   * plus `lib/plan/catalog.ts`, no model call. Built by the caller because the
   * catalog is a lazy chunk there and must not become a static import here.
   *
   * Absent (the dashboard paywall, which has no quiz to draw from) means the
   * whole card is dropped. It is never filled in with defaults: see the note
   * on <WeekOneCard />.
   */
  weekOne?: WeekOneRow[];
  /**
   * The same seven days <TrainingWeekBoard /> drew in the funnel, so the strip
   * on the card is her real week rather than seven identical boxes.
   */
  week?: PlannerDay[];
}

const FIRST_WEEK = formatPrice(FIRST_WEEK_PRICE);
const WEEKLY = formatPrice(WEEKLY_PRICE);

// Scannable 2x2 grid, one promise per box. At the payment moment she scans
// rather than reads, so every box is a 2-3 word headline with one support line.
const TRUST_LABELS = [
  {
    icon: CreditCard,
    bg: "bg-pink-100",
    fg: "text-pink-600",
    title: `${FIRST_WEEK} today`,
    sub: `then ${WEEKLY} a week, cancel anytime`,
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
    sub: "From the app. No calls, no hoops",
  },
  {
    icon: ShieldCheck,
    bg: "bg-green-100",
    fg: "text-green-700",
    title: "Stripe secured",
    sub: "We never see your card",
  },
];

/**
 * Week 1 of her plan, above the price.
 *
 * **Every row is hers or it is not here.** The card printed the four
 * `PLAN_PILLARS` fallback tasks until 2026-09-08 - "10-min walk", "25-30g
 * protein at breakfast", "4-7-8 breathing", "Lights out by 10:30" - under a
 * line saying it was built around the symptom she said hits hardest. Three
 * things were wrong with that and they compound:
 *
 * - **It contradicted the funnel.** <TrainingWeekBoard /> had shown her a real
 *   week four screens earlier: a 15-25 minute walk every day and two to four
 *   strength sessions, read out of `MOVEMENT_VOLUME` and `cardioForWeek()`.
 *   Then the screen with the price on it said "10-min walk". Whichever she
 *   believed, one of them was selling her something the other denied.
 * - **None of the four existed in the product.** No level is prescribed a
 *   10-minute walk; the protein row's `target` is 3, not breakfast; 4-7-8 is
 *   in no `RELAXATION` row; "Lights out by 10:30" is in no `FALLBACK_HABITS`
 *   entry. Every one of them is discovered to be wrong on day 1 in the app,
 *   which is inside the refund window.
 * - **It de-escalated at the close.** The funnel's three payoffs escalate -
 *   her ranking, her week, her session 1 - and each hands her something she
 *   did not walk in with. This card then handed back four strings identical
 *   for every woman, at the exact moment she is deciding whether the
 *   personalisation was real.
 *
 * So the rows come from `buildWeekOneRows()` (her taps plus the catalog), the
 * day strip is her actual seven days, and a pillar with nothing true to say is
 * dropped. With no rows and no tonight-move - the dashboard paywall, which has
 * no quiz behind it - the card does not render at all. Nothing on it is
 * written for this screen; if it cannot be sourced, it is not shown.
 */
const TONE_DOT: Record<PlannerDay["chips"][number]["tone"], { dot: string; label: string }> = {
  strength: { dot: "bg-primary", label: "Strength" },
  cardio: { dot: "bg-[#16A34A]", label: "Walk" },
  power: { dot: "bg-[#F59E0B]", label: "Intervals" },
};

function WeekOneCard({
  symptom,
  goal,
  rows,
  week,
}: {
  symptom: string | null;
  goal: string[];
  rows?: WeekOneRow[];
  week?: PlannerDay[];
}) {
  const symptomLabel = symptom ? SYMPTOM_LABELS[symptom] ?? null : null;
  const firstMove = symptom ? SYMPTOM_FIRST_MOVE[symptom] ?? null : null;
  const promise = getOfferPromise(goal);
  const pillarRows = rows ?? [];

  // Nothing sourced, nothing shown.
  if (!pillarRows.length && !firstMove) return null;

  // Only the tones her week actually contains, in the order they are drawn.
  const tones = week
    ? (Object.keys(TONE_DOT) as (keyof typeof TONE_DOT)[]).filter((t) =>
        week.some((d) => d.chips.some((c) => c.tone === t))
      )
    : [];

  return (
    <div className="mb-3 rounded-2xl border border-[#E8DDD9] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-primary">
            Week 1 of {PLAN_WEEKS}
          </p>
          <h2 className="text-lg font-bold leading-tight text-[#2B2627]">Your first week</h2>
        </div>
        <p className="shrink-0 text-right text-[11px] leading-tight text-[#8A8A8A]">
          Goal
          <span className="block text-xs font-semibold text-[#3D3D3D]">{promise}</span>
        </p>
      </div>
      {symptomLabel && (
        <p className="mt-1.5 text-xs text-[#5A5A5A]">
          Built around <b className="text-[#3D3D3D]">{symptomLabel.toLowerCase()}</b> - the symptom
          you said hits hardest.
        </p>
      )}

      {/* Her seven days, at the shape the plan really schedules them - rest
          days included. Seven identical boxes labelled D1-D7 said nothing and
          implied the week was flat, which it is not. */}
      {week && week.length > 0 && (
        <>
          <div className="mt-3 flex gap-1">
            {week.map((day) => (
              <div
                key={day.label}
                className={`flex-1 rounded-md px-0.5 py-1 text-center ${
                  day.chips.length ? "bg-[#F7F1EE]" : "bg-[#FBF8F6]"
                }`}
              >
                <span className="block text-[9.5px] font-bold uppercase tracking-wide text-[#8A7F7A]">
                  {day.label}
                </span>
                <span className="mt-1 flex items-center justify-center gap-[3px]">
                  {day.chips.length === 0 ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#E4DAD5]" />
                  ) : (
                    day.chips.map((chip) => (
                      <span
                        key={chip.text}
                        className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[chip.tone].dot}`}
                      />
                    ))
                  )}
                </span>
              </div>
            ))}
          </div>
          {tones.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              {tones.map((t) => (
                <span key={t} className="flex items-center gap-1 text-[10px] text-[#8A8A8A]">
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[t].dot}`} />
                  {TONE_DOT[t].label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <ul className="mt-3 space-y-2">
        {pillarRows.map((row) => {
          const pillar = pillarFor(row.key);
          if (!pillar) return null;
          return (
            <li key={row.key} className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${pillar.chip}`}
              >
                <pillar.icon className={`h-4 w-4 ${pillar.tint}`} strokeWidth={2.2} />
              </span>
              <span className="min-w-0 text-sm leading-snug text-[#3D3D3D]">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
                  {pillar.label}
                </span>
                <span className="block font-semibold">{row.task}</span>
                {row.note && (
                  <span className="block text-xs leading-snug text-[#8A8A8A]">{row.note}</span>
                )}
              </span>
            </li>
          );
        })}
        {firstMove && (
          <li className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100">
              <Sunrise className="h-4 w-4 text-rose-500" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 text-sm leading-snug text-[#3D3D3D]">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
                Tonight, for {symptomLabel?.toLowerCase()}
              </span>
              <span className="block font-semibold">{firstMove.do}</span>
            </span>
          </li>
        )}
      </ul>
      <p className="mt-3 text-[11px] leading-snug text-[#8A8A8A]">
        Week 2 builds on what you actually did.
      </p>
    </div>
  );
}

/** Once per tab: the exit question is asked at most once, whatever the trigger. */
const EXIT_ASKED_KEY = "menolisa:paywall-exit-asked";
/** Seconds on the paywall without a tap before the question is asked. */
const EXIT_IDLE_MS = 30_000;

const EXIT_OPTIONS: { reason: Exclude<PaywallExitReason, "skipped">; label: string }[] = [
  { reason: "too_expensive", label: "Too expensive" },
  { reason: "not_sure_helps", label: "Not sure it'll help me" },
  { reason: "see_plan_first", label: "I want to see the plan first" },
  { reason: "dont_pay_for_apps", label: "I don't pay for apps" },
];

/**
 * The exit question (2026-09-08). One tap, skippable, asked once per tab, on
 * either of two triggers: the cursor leaving through the top of the viewport
 * (desktop back-button intent) or 30 seconds on the page with no tap at all.
 * Any tap on the page cancels the idle timer - a woman scrolling and reading
 * is not leaving. The answer is one allowlisted token written to
 * `funnel_events` (`paywall_exit`); it is why she did not buy, never anything
 * about her health.
 */
function useExitQuestion(opts: { disabled: boolean; onOpen: () => void }) {
  const { disabled, onOpen } = opts;
  const askedRef = useRef(false);

  const alreadyAsked = () => {
    if (askedRef.current) return true;
    try {
      return window.sessionStorage.getItem(EXIT_ASKED_KEY) === "1";
    } catch {
      return false;
    }
  };
  const markAsked = () => {
    askedRef.current = true;
    try {
      window.sessionStorage.setItem(EXIT_ASKED_KEY, "1");
    } catch {
      // Per-tab dedupe lost; the ref still holds for this mount.
    }
  };

  useEffect(() => {
    if (disabled || alreadyAsked()) return;
    let fired = false;
    const fire = () => {
      if (fired || alreadyAsked()) return;
      fired = true;
      markAsked();
      onOpen();
    };
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(fire, EXIT_IDLE_MS);
    const cancelIdle = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) fire();
    };
    document.addEventListener("pointerdown", cancelIdle, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      cancelIdle();
      document.removeEventListener("pointerdown", cancelIdle);
      document.removeEventListener("mouseleave", onLeave);
    };
    // Mount-only by design; `disabled` flips only while a checkout is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
}

export function PaywallView({
  onCheckout,
  checkoutLoading,
  error,
  banner,
  onBack,
  trackingSource,
  topProblems,
  goal,
  weekOne,
  week,
  userId,
}: PaywallViewProps) {
  // Same promise as the finish board's far end (lib/planTimeline.ts) - the
  // headline and the chart should name the same outcome.
  const promise = getOfferPromise(goal ?? []);
  const primarySymptom = topProblems?.[0] ?? null;

  // ViewContent: she has seen the offer. Reported twice, browser and server, and
  // counted once per woman rather than once per mount.
  //
  // Three guards stack, each covering what the one before it can't:
  //
  //   1. `viewTracked` - this mount. Cheap, and the only one that survives a
  //      browser with storage disabled.
  //   2. `sessionStorage` - this tab. The ref alone was the whole guard until
  //      2026-08-19, and a ref dies with the mount: `<PaywallView />` sits under
  //      `<AnimatePresence mode="wait" key={phase}>` in the funnel, so Back and
  //      forward again remounted it, as did returning from a cancelled Stripe
  //      checkout.
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

  // The exit question.
  const [exitOpen, setExitOpen] = useState(false);
  const [exitAnswered, setExitAnswered] = useState(false);
  const weekOneRef = useRef<HTMLDivElement | null>(null);
  useExitQuestion({
    disabled: checkoutLoading,
    onOpen: () => setExitOpen(true),
  });
  const answerExit = useCallback(
    (reason: PaywallExitReason) => {
      pingFunnelStep("paywall_exit", SERVER_FUNNEL_STEPS.paywall_exit, reason);
      if (reason === "skipped") {
        setExitOpen(false);
        return;
      }
      setExitAnswered(true);
      window.setTimeout(() => {
        setExitOpen(false);
        // The one answer the page can act on: the plan is right there.
        if (reason === "see_plan_first") {
          weekOneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 900);
    },
    []
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(168px+env(safe-area-inset-bottom))] relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
          {/* The bridge: she came in on a free quiz and this is the first screen
              with a price on it. One line names the switch before the headline
              makes the claim. */}
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#A8899B] mb-1.5">
            Your audit is done &amp; free. This is the plan it built.
          </p>
          {/* Leads with the outcome she picked - the same promise as the finish
              board's far end (getOfferPromise). The full stop lives inside the
              sweep: <HighlightSweep> is an inline-block, so anything appended
              after it wraps to a lone dot on the next line. */}
          <h1 className="text-[27px] sm:text-[32px] font-bold text-[#2B2627] leading-[1.1] tracking-[-0.02em] text-balance">
            <HighlightSweep variant="green">{promise}.</HighlightSweep>
            <br />
            {PLAN_WEEKS} weeks from today.
          </h1>
          <p className="text-sm text-[#5A5A5A] mt-1">Starts the moment you join</p>
        </motion.div>

        {/* Her finish line. */}
        <PlanFinishBoard topProblems={topProblems} goal={goal} className="mb-2.5" />

        {/* Week 1, in full, before the number. What she is buying is a plan, so
            the plan is on the screen before the price is. */}
        <div ref={weekOneRef}>
          <WeekOneCard
            symptom={primarySymptom}
            goal={goal ?? []}
            rows={weekOne}
            week={week}
          />
        </div>

        {/* What the subscription is, in one paragraph, above the price. She is
            agreeing to a weekly charge for a plan that runs in blocks; the two
            cadences are different and this is where the difference is stated. */}
        <p className="mb-2.5 px-1 text-center text-sm leading-relaxed text-[#5A5A5A]">
          {PLAN_BLOCKS_COPY}
        </p>

        {/* Price card - the single plan, no choice to make. The price line is
            PRICE_LINE from lib/pricing.ts, the same string Stripe Checkout
            prints under its pay button (CHECKOUT_SUBMIT_TEXT is built from the
            same constants). Keep them derived; never retype a figure here. */}
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
            YOUR {PLAN_WEEKS} WEEK PLAN
          </span>

          <div className="pt-2 text-center">
            <p className="text-[19px] sm:text-[21px] font-extrabold text-[#2B2627] leading-snug text-balance">
              {PRICE_LINE}
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[#3D3D3D]">{PRICE_SUBLINE}</p>

            <dl className="mt-3 overflow-hidden rounded-xl border border-[#EFE2E8] bg-white/70 text-left">
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="text-sm font-semibold text-[#3D3D3D]">Today</dt>
                <dd className="text-sm font-extrabold tabular-nums text-[#15803D]">{FIRST_WEEK}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#F4EAEF] px-3 py-2">
                <dt className="text-sm text-[#5A5A5A]">
                  From week 2
                  <span className="block text-xs text-[#8A8A8A]">every week, until you cancel</span>
                </dt>
                <dd className="shrink-0 whitespace-nowrap text-sm font-extrabold tabular-nums text-[#3D3D3D]">
                  {WEEKLY}
                </dd>
              </div>
            </dl>

            {/* What Stripe will actually accept, shown as the card/wallet marks
                she recognizes. */}
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

          {/* The three promises as screens that exist. */}
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
          {TRUST_LABELS.map((item, i) => {
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

        {/* The money-back guarantee (2026-09-08). Terms §11 states it in the
            same words; keep the two in step. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-base font-bold text-green-800 mb-2">
              {MONEY_BACK_DAYS}-day money-back guarantee
            </h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              Start for <b>{FIRST_WEEK}</b>. If it isn&apos;t for you, tell us within{" "}
              {MONEY_BACK_DAYS} days and we refund <b className="text-green-700">everything</b>{" "}
              you&apos;ve paid. No reason needed.
            </p>
            <div className="w-16 h-px bg-green-300 my-3" />
            <p className="text-xs text-[#5A5A5A] leading-snug">
              We can offer this because we&apos;re sure of the plan. Cancel in two taps from the
              app &mdash; no email, no phone call, no questions.
            </p>
          </div>
        </div>

        {/* Social proof + outcome cards, reused from the /register diagnosis
            screen (components/SocialProof.tsx) so the paywall carries the same
            proof even when reached directly. */}
        <SocialProofPolaroid />
        <SymptomOutcomeCards topProblems={topProblems} />

        {/* What actually happens when she taps the button. The last unanswered
            objection here is mechanical: she is paying on a web page for a
            product that lives in an app she has not downloaded. Step 3 is the
            promise the download screen then has to keep. */}
        <div className="mb-4 rounded-2xl border border-[#E8DDD9] bg-white px-4 py-3.5">
          <p className="mb-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
            What happens next
          </p>
          <ol className="space-y-2.5">
            {[
              {
                Icon: Lock,
                bold: "Secure checkout",
                sub: `Stripe takes ${FIRST_WEEK} today — we never see your card.`,
              },
              {
                Icon: Smartphone,
                bold: "Download the app",
                sub: "iPhone or Android. Sign in with the email you just used.",
              },
              {
                Icon: Sunrise,
                bold: "Day 1 is waiting",
                sub: "Your plan is already built. Start it tonight or tomorrow.",
              },
            ].map((step, i) => (
              <li key={step.bold} className="flex items-start gap-2.5">
                <span className="relative mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#16A34A]/10">
                  <step.Icon className="h-3.5 w-3.5 text-[#15803D]" strokeWidth={2.4} />
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#16A34A] text-[9px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0 text-sm leading-snug text-[#3D3D3D]">
                  <strong>{step.bold}</strong>
                  <span className="block text-xs text-[#6B6B6B]">{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
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
            onClick={handleCheckoutClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            // Green, layered so it reads bright without failing contrast (see
            // the git history for the contrast maths). Green echoes the
            // guarantee card above: "safe to press".
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
                Start my {PLAN_WEEKS}-week plan &middot; {FIRST_WEEK}
              </>
            )}
          </motion.button>
          {/* The terms she is agreeing to, on the element she agrees with. The
              price card scrolls away and this bar does not, so the renewal is
              disclosed on the screen she is looking at when she taps. */}
          <p className="text-[11px] sm:text-xs text-[#5A5A5A] text-center mt-2 leading-relaxed">
            {FIRST_WEEK} today &middot; then {WEEKLY}/week &middot;{" "}
            <a href="/terms#subscription" className="underline">
              Cancel anytime
            </a>{" "}
            &middot; {MONEY_BACK_DAYS}-day money-back guarantee
          </p>
          <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-1 sm:mt-1.5 leading-relaxed">
            <span className="inline-flex items-center justify-center gap-1 flex-wrap">
              <b>Safe & Secure</b> with
              <Image
                src="/badges/stripe.webp"
                alt="Stripe"
                width={200}
                height={83}
                className="inline-block h-3.5 w-auto align-middle -translate-y-px"
              />
            </span>
          </p>
        </div>
      </div>

      {/* The exit question. A bottom sheet, one tap, skippable. */}
      <AnimatePresence>
        {exitOpen && (
          <motion.div
            key="exit-question"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-exit-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
            onClick={() => answerExit("skipped")}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {exitAnswered ? (
                <p className="py-6 text-center text-base font-semibold text-[#3D3D3D]">
                  Thank you &mdash; that helps.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
                        One quick question
                      </p>
                      <h2
                        id="paywall-exit-title"
                        className="mt-0.5 text-lg font-bold leading-tight text-[#2B2627]"
                      >
                        What&apos;s holding you back?
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => answerExit("skipped")}
                      aria-label="Skip"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4EFEC] text-[#7A7A7A]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {EXIT_OPTIONS.map((o) => (
                      <button
                        key={o.reason}
                        type="button"
                        onClick={() => answerExit(o.reason)}
                        className="w-full rounded-xl border border-[#E8DDD9] bg-white px-4 py-3 text-left text-sm font-semibold text-[#3D3D3D] transition-colors hover:border-primary/60 hover:bg-primary/5"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => answerExit("skipped")}
                    className="mt-3 w-full py-2 text-center text-xs font-semibold text-[#9A9A9A] underline underline-offset-2"
                  >
                    Skip
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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

/**
 * What is deliberately gone from this screen (2026-09-08), so nobody brings it
 * back by reflex:
 *
 *  - **The countdown and the struck-through anchor price.** There is one price
 *    and the paywall states it in the same words Stripe prints, so there is no
 *    "regular price" to run a clock against and no display state that can
 *    differ from the charge.
 *  - **The free-trial branch.** No `trial_period_days`, no "$0 today", no
 *    first-charge date. The card is charged $1 at checkout.
 *  - **The browser `Purchase`.** Meta's Purchase fires from the Stripe webhook
 *    only, at the amount collected. See lib/metaPixel.ts.
 */
