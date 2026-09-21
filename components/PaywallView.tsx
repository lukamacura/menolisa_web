"use client";

import { ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  Dumbbell,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sunrise,
  X,
} from "lucide-react";
import { SocialProofPolaroid } from "@/components/SocialProof";
import {
  META_CURRENCY,
  newInitiateCheckoutEventId,
  viewContentEventId,
} from "@/lib/metaPixel";
import {
  GUARANTEE_BODY_HEAD,
  GUARANTEE_BODY_TAIL,
  GUARANTEE_DAYS,
  GUARANTEE_HEADLINE,
  GUARANTEE_INLINE_BODY,
  PLAN_ACCESS_DAYS,
  PLAN_BLOCKS_COPY,
  PLAN_ID,
  PLAN_WEEKS,
  PRICE_SUBLINE,
  QUIZ_DISCOUNT_PCT,
  QUIZ_PRICE_LABEL,
  QUIZ_PRICE_REASON,
  SUPPORT_EMAIL,
  WHAT_YOU_GET,
  formatChargeDate,
  formatPrice,
  perDayLabel,
  priceLine,
  type PlanOffer,
} from "@/lib/pricing";
import { trackFb } from "@/lib/metaPixelClient";
import { isQaSession, pingFunnelStep } from "@/lib/funnelClient";
import { SERVER_FUNNEL_STEPS, type PaywallExitReason } from "@/lib/funnelSteps";
import { BlurStack } from "@/components/BlurStack";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PlanFinishBoard } from "@/components/PlanFinishBoard";
import { getOfferPromise, getOutcomeHeadline } from "@/lib/planTimeline";
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
  /** Her first name from the quiz, for the line above the headline. */
  firstName?: string;
  /**
   * The price this account is offered: `planOffer(isQuizPriceEligible(...))`.
   * Required, because `create-checkout` decides the charge with the same
   * function; a default here is how the page and Stripe would disagree.
   */
  offer: PlanOffer;
}

const subscribeToNothing = () => () => {};

/**
 * The day her access would end if she bought now - `Nov 7` - for the details
 * sheet. Read through `useSyncExternalStore` because the server renders in
 * UTC, so the server snapshot is `null` and the sheet prints the duration
 * instead until hydration swaps the real date in. Mirrors what
 * `fulfillCheckout` writes (purchase time + PLAN_ACCESS_DAYS).
 */
const accessEndNow = () =>
  formatChargeDate(new Date(Date.now() + PLAN_ACCESS_DAYS * 24 * 60 * 60 * 1000));

function useAccessEnd(): string | null {
  return useSyncExternalStore(subscribeToNothing, accessEndNow, () => null);
}

/**
 * The 30-minute hold printed after QUIZ_PRICE_REASON. Two rules from the last
 * time a countdown lived here: it never changes a figure (at zero the sentence
 * disappears, the price does not move), and it never visibly resets - the
 * deadline is stamped in localStorage on first view, so a reload or a return
 * from Stripe's cancel URL continues the same clock.
 */
const PRICE_HOLD_MS = 30 * 60 * 1000;
const PRICE_HOLD_KEY = "menolisa.quizPriceHoldUntil";
let priceHoldUntil: number | null = null;

function priceHoldSecondsLeft(): number {
  if (priceHoldUntil === null) {
    try {
      const stored = Number(localStorage.getItem(PRICE_HOLD_KEY));
      if (stored > 0) priceHoldUntil = stored;
    } catch {}
    if (priceHoldUntil === null) {
      priceHoldUntil = Date.now() + PRICE_HOLD_MS;
      try {
        localStorage.setItem(PRICE_HOLD_KEY, String(priceHoldUntil));
      } catch {}
    }
  }
  return Math.max(0, Math.ceil((priceHoldUntil - Date.now()) / 1000));
}

const subscribeToSecond = (onTick: () => void) => {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
};

/** Seconds left on the hold; `null` on the server and before hydration. */
function usePriceHold(): number | null {
  return useSyncExternalStore(subscribeToSecond, priceHoldSecondsLeft, () => null);
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}


/**
 * The two people behind the product, shown with their faces in "The people
 * behind MenoLisa". Both are real and agreed to be shown (owner's call,
 * 2026-09-13). The roles are the ones the owner gave; do not dress them up
 * into credentials. Avatars are 192px crops in public/brand/.
 */
const FOUNDERS = [
  { name: "Zoe", role: "Came up with MenoLisa", src: "/brand/founder-zoka.webp" },
  { name: "Luka", role: "Built the app", src: "/brand/founder-luka.webp" },
];

/** "How it works", directly under the price. See the block where it renders. */
const HOW_IT_WORKS = [
  { Icon: Lock, bold: "Pay once", sub: "Secure, via Stripe" },
  { Icon: Smartphone, bold: "Get the app", sub: "iPhone or Android" },
  { Icon: Sunrise, bold: "Start day 1", sub: "Your plan is waiting" },
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
  power: { dot: "bg-[#E8A33D]", label: "Intervals" },
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

  // The rows, as one list: her pillars, then the tonight-move. Built before the
  // return because only the first one is shown in full - see the block on the
  // blur below.
  const items = [
    ...pillarRows.map((row) => {
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
            {/* Weight-first only: the link of the chain the results card
                showed her that this pillar works on. See WEIGHT_LINK_BY_PILLAR. */}
            {row.link && (
              <span className="mt-1 inline-block rounded-full bg-green-50 px-2 py-0.5 text-[10.5px] font-semibold text-green-700">
                Works on {row.link}
              </span>
            )}
          </span>
        </li>
      );
    }),
    firstMove ? (
      <li key="tonight" className="flex items-center gap-2.5">
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
    ) : null,
  ].filter(Boolean);
  const hidden = items.slice(1);

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
          Built around <b className="text-[#3D3D3D]">{symptomLabel.toLowerCase()}</b>, the symptom
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

      {/* One row plain, the rest going out of focus (2026-09-09).
          ────────────────────────────────────────────────────────────────
          The card printed her whole week in full. Everything on it is real -
          that rule has not moved - but printing all of it answers the question
          the screen exists to make her ask. She reads four sourced rows, agrees
          they look sensible, and has nothing left to find out.

          So the first row is hers to read and the ones under it fade out of
          focus: increasing blur, falling opacity, and a mask that takes the
          stack to nothing at the bottom edge. Not a fake list and not a lock
          screen - it is her own week, at the resolution of a page she has not
          turned yet.

          Blurred rows are inert (`pointer-events-none`, `select-none`) and
          `aria-hidden`: a screen reader would otherwise read out, in full, the
          exact content the sighted page is withholding, which is both a
          contradiction and a worse experience than the summary line under it.
          That line states what is behind the blur in numbers, so nothing here
          claims more than the card holds. */}
      <ul className="mt-3 space-y-2">{items[0]}</ul>
      <BlurStack items={hidden} as="ul" className="mt-2 space-y-2" />
      <p className="mt-3 flex items-center gap-1.5 text-[11px] leading-snug text-[#8A8A8A]">
        {hidden.length > 0 && <Lock className="h-3 w-3 shrink-0 text-[#B5ADA9]" />}
        {hidden.length > 0
          ? `${hidden.length} more in week 1, yours the moment you join.`
          : "Week 2 builds on what you actually did."}
      </p>
    </div>
  );
}

/** Once per tab: the exit question is asked at most once, whatever the trigger. */
const EXIT_ASKED_KEY = "menolisa:paywall-exit-asked";
/**
 * She has read to the bottom and then gone still: no scroll, no tap, this long.
 * This is the trigger that fires on a phone, and it is the only one whose
 * meaning is unambiguous - she saw the whole offer and stopped.
 */
const EXIT_SETTLED_MS = 10_000;
/**
 * Absolute fallback: this long on the page with no interaction of any kind.
 * Catches the visitor who never scrolls at all, which is its own answer.
 */
const EXIT_IDLE_MS = 45_000;
/** Fraction of the page she has to have reached for "read to the bottom". */
const EXIT_DEPTH = 0.85;

const EXIT_OPTIONS: { reason: Exclude<PaywallExitReason, "skipped">; label: string }[] = [
  { reason: "too_expensive", label: "Too expensive" },
  { reason: "not_sure_helps", label: "Not sure it'll help me" },
  { reason: "see_plan_first", label: "I want to see the plan first" },
  { reason: "dont_pay_for_apps", label: "I don't pay for apps" },
];

/**
 * The exit question (2026-09-08). One tap, skippable, asked once per tab. The
 * answer is one allowlisted token written to `funnel_events` (`paywall_exit`);
 * it is why she did not buy, never anything about her health.
 *
 * **It collected nothing for a week and the reason is worth keeping written
 * down.** The first cut had two triggers: `mouseleave` through the top of the
 * viewport, and a 30-second timer cancelled permanently by the first
 * `pointerdown`. On a phone `mouseleave` never fires at all, and a scroll *is*
 * a `pointerdown` - so the timer was killed by the first flick of her thumb and
 * the only visitor who could ever reach the question was one who never touched
 * the screen. Against 169 paywall views it fired once. Traffic here is an
 * Instagram in-app webview; a trigger that only works with a mouse measures
 * nobody.
 *
 * Three triggers now, and the middle one is the one that does the work:
 *
 *  - `mouseleave` through the top - desktop back-button intent. Unchanged.
 *  - **Read to the bottom, then went still.** Once she has passed
 *    {@link EXIT_DEPTH} of the page, {@link EXIT_SETTLED_MS} with no scroll and
 *    no tap asks the question. This is not exit *intent*, it is exit *fact*:
 *    she saw the whole offer, including the price and the guarantee, and
 *    stopped. Scrolling or tapping restarts the clock, so a slow reader is
 *    never interrupted mid-page.
 *  - A {@link EXIT_IDLE_MS} floor with no interaction at all, for the visitor
 *    who lands and never scrolls.
 *
 * `scrollRef` is the paywall's own scroll container, not the window: the page
 * scrolls inside a flex child, so `window.scrollY` is 0 for the whole session.
 */
function useExitQuestion(opts: {
  disabled: boolean;
  onOpen: () => void;
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const { disabled, onOpen, scrollRef } = opts;
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
    const el = scrollRef.current;
    let fired = false;
    let deep = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (fired || alreadyAsked()) return;
      fired = true;
      markAsked();
      onOpen();
    };
    // One timer, rearmed on every interaction. Its delay is short once she has
    // seen the whole page and long before that, so the question follows the
    // reading rather than interrupting it.
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, deep ? EXIT_SETTLED_MS : EXIT_IDLE_MS);
    };
    const onScroll = () => {
      if (el && !deep) {
        const max = el.scrollHeight - el.clientHeight;
        // A page shorter than its container can never be scrolled to 85% of
        // itself; treat "nothing to scroll" as already read.
        if (max <= 0 || (el.scrollTop + el.clientHeight) / el.scrollHeight >= EXIT_DEPTH) {
          deep = true;
        }
      }
      arm();
    };
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) fire();
    };

    arm();
    el?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", arm, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      if (timer) clearTimeout(timer);
      el?.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", arm);
      document.removeEventListener("mouseleave", onLeave);
    };
    // Mount-only by design; `disabled` flips only while a checkout is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
}

/**
 * The green CTA. Rendered twice - once in the fold directly under the price,
 * once in the sticky bar - so it is one component rather than two gradients
 * that drift apart.
 *
 * Green, layered so it reads bright without failing contrast (see the git
 * history for the contrast maths), and green because it echoes the guarantee:
 * "safe to press".
 *
 * **The label is the commitment, and since 2026-09-11 the commitment and the
 * deliverable are the same thing.** It said "Start my first week · $1" under
 * the weekly offer, because eight weeks was what she got while one week was
 * what she agreed to, and every 8-week cue had her pricing 8 x $4.99 before
 * reading the first dollar. One charge of {PRICE} buys the whole
 * {PLAN_WEEKS}-week block, so the honest label is the block.
 *
 * **No price on the button (2026-09-13).** The figure is the largest thing in
 * the price card and {PRICE_LINE} sits directly under this button in the
 * sticky bar, so the disclosure is still on the element she taps.
 *
 * **Shape mirrors `LandingCtaBar`, colour does not.** Same centred bold label,
 * same arrow in a translucent square pinned right, same press behaviour, so
 * the button she tapped on the landing page and the one she pays with read as
 * one control. The fill stays green for the reason above.
 */
function CheckoutButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="relative flex min-h-14 w-full items-center justify-center rounded-2xl px-12 text-center text-[17px] font-bold leading-tight tracking-[0.01em] text-white transition-transform hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background:
          "linear-gradient(180deg, rgba(134,239,172,0.45) 0%, rgba(134,239,172,0) 46%), linear-gradient(135deg, #15803D 0%, #16A34A 50%, #15803D 100%)",
        boxShadow:
          "0 0 28px rgba(34,197,94,0.50), 0 8px 26px rgba(21,128,61,0.38), 0 2px 8px rgba(21,128,61,0.25)",
        textShadow: "0 1px 1px rgba(10, 60, 30, 0.25)",
      }}
    >
      {loading ? "Redirecting to checkout…" : <>Start my {PLAN_WEEKS}-week plan</>}
      <span
        className="absolute right-2 grid h-10 w-10 place-items-center rounded-xl bg-white/20"
        aria-hidden
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        )}
      </span>
    </button>
  );
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
  firstName,
  offer,
}: PaywallViewProps) {
  // Same outcome as the finish board's far end (lib/planTimeline.ts) - the
  // headline and the chart have to name the same thing.
  const outcome = getOutcomeHeadline(goal ?? []);
  /** The only figure on this page she is charged; see lib/pricing.ts. */
  const PRICE = formatPrice(offer.price);
  const accessEnd = useAccessEnd();
  const priceHold = usePriceHold();
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
      value: offer.price,
      currency: META_CURRENCY,
    };

    // A QA walk (`?qa=1`) is dropped from `/admin` and from the ad platform
    // alike: nothing about it may train delivery. The server copies check
    // the same flag off the request body.
    if (isQaSession()) return;

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
    // A second tap while the first is in flight must not mint a second event
    // id: the parent drops the call, and the pixel copy would go out unpaired.
    if (checkoutLoading) return;
    const eventId = newInitiateCheckoutEventId();
    if (!isQaSession()) {
      trackFb(
        "InitiateCheckout",
        {
          content_name: PLAN_ID,
          content_category: trackingSource,
          content_type: "product",
          value: offer.price,
          currency: META_CURRENCY,
          num_items: 1,
        },
        { eventID: eventId }
      );
    }
    return onCheckout(eventId);
  };

  // The exit question.
  const [exitOpen, setExitOpen] = useState(false);
  const [exitAnswered, setExitAnswered] = useState(false);
  const weekOneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useExitQuestion({
    disabled: checkoutLoading,
    onOpen: () => setExitOpen(true),
    scrollRef,
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
    <div
      ref={scrollRef}
      className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(168px+env(safe-area-inset-bottom))] relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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

        {/* ── The product, top of the phone ─────────────────────────────────
            The page had no picture of the thing being sold: the only two
            images on it were the card marks and the Stripe badge. She is
            paying on a web page for something that lives in an app she has
            not downloaded, and nothing here showed her that app.

            A fixed-height window shows the top of the phone (status bar,
            "Steady the basics", the streak card) at a width where the screen
            text is readable, and a mask fades the rest out so it reads as a
            screen continuing past the edge. A mask rather than a gradient
            overlay because the page background is itself a gradient; an
            opaque fade would band against it.

            It was a 196px peek shifted up by 48px until 2026-09-13. The shift
            skipped 156px of transparent padding in an older export; the
            current master (640x1198) is opaque from y=10, so the same shift
            cut the top off the phone. No offset now. Re-measure the alpha
            bbox if the asset is ever re-exported.

            It is deliberately NOT the diagnosis screen's carousel shots.
            Those are PLAN_HERO_SLIDES, which she scrolled through seconds
            earlier at a readable size, and re-running them here is the
            second pitch this screen had removed. This is a different screen
            of the app (the daily checklist) doing a different job: evidence
            that the product exists and is finished. */}
        <div
          className="relative mx-auto mb-2 h-[210px] w-[260px] shrink-0 overflow-hidden sm:h-[250px] sm:w-[300px]"
          style={{
            // no-repeat is load-bearing: mask-repeat defaults to `repeat`, so
            // without it the gradient tiles down the box and the faded-out
            // half of the phone reappears underneath itself.
            WebkitMaskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskSize: "100% 100%",
            maskImage: "linear-gradient(to bottom, #000 80%, transparent 100%)",
            maskRepeat: "no-repeat",
            maskSize: "100% 100%",
          }}
          aria-hidden
        >
          <Image
            src="/screenshots/mockup.webp"
            alt=""
            width={640}
            height={1198}
            // Default quality: the screen text has to be legible now, which
            // the old quality-60 peek did not need.
            sizes="(min-width: 640px) 300px, 260px"
            priority
            className="absolute left-1/2 top-0 w-[260px] max-w-none -translate-x-1/2 sm:w-[300px]"
          />
        </div>

        {/* ══ The offer, above the fold ═══════════════════════════════════════
            The order of this screen is the whole change of 2026-09-08. It used
            to run: stars → her goal as the headline → the finish chart → the
            full week 1 card → a paragraph on billing blocks → the price. That
            is the right architecture for a $59 charge, where the number is the
            objection and every block above it exists to earn it.

            It is the wrong architecture for {PRICE}. At this size the price is
            not the objection, it is the strongest asset on the page - eight
            weeks of a plan for less than one session with a trainer - and it
            was the eighth block, roughly two screens down. Above the fold the
            figure appeared exactly once: at 16px, inside the sticky button, at
            the very bottom edge of the screen. 169 women reached this page over
            30 days and essentially none of them bought.

            Two more things were being spent badly:

            - **The headline re-told her the previous screen.** The diagnosis
              phase opens "{name}, here's your {PLAN_WEEKS}-week plan to
              {goal}". This screen then opened on the same promise in different
              words, so the largest type on the close carried information she
              already had - while the only new information on the page had no
              type at all.
            - **The stars sat above everything.** "4.9 · 12,800+ women" is the
              least substantiable claim on the screen, so it was the first claim
              she evaluated, and it taxed the guarantee 1,600px below it. It now
              sits with the rest of the social proof, low.

            So: eyebrow, the price as the headline, the price card, the button -
            all inside the first screen. Her goal stays, as the subline, which
            is where continuity belongs. ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-center mb-3"
        >
          {/* The bridge from the quiz: the plan is hers and it exists already.
              Her name when the funnel has it; the dashboard paywall has no
              quiz behind it and gets the nameless line. */}
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#A8899B] mb-1.5">
            {firstName ? `${firstName}, your plan is ready` : "Your plan is ready"}
          </p>
          {/* The headline is her outcome and when she has it (2026-09-09). It
              was the price - "Start tonight for {PRICE}." - from the
              2026-09-08 re-order, which put the page's only new information
              in its largest type and was right to. The price kept the size; it
              moved one block down into the card that already carries the
              numeral, so the headline can do the thing a headline is for.

              What she is buying is not a dollar, it is a date: the outcome she
              picked on the goal question, with the timeframe attached. The
              timeframe is what makes it a claim rather than a wish, and it is
              the same {PLAN_WEEKS} weeks <PlanFinishBoard /> draws in real
              dates 400px below.

              The subline went with it. "Your full {PLAN_WEEKS}-week plan to
              {goal}" said the headline's job twice and re-told the diagnosis
              screen a third time; the renewal it carried is on the price card,
              the sticky bar and Stripe's own submit text.

              The full stop lives inside the sweep: <HighlightSweep> is an
              inline-block, so anything appended after it wraps to a lone dot on
              the next line. */}
          <h1 className="text-[30px] sm:text-[36px] font-bold text-[#2B2627] leading-[1.08] tracking-[-0.02em] text-balance">
            {outcome}.
            <br />
            <HighlightSweep variant="green">{PLAN_WEEKS} weeks from now.</HighlightSweep>
          </h1>
          {/* What she is buying, in one sentence (2026-09-13). The page named
              an outcome and a price and never said what the thing *is*, and
              "I don't understand the offer" was the reported objection. One
              plain line: a daily plan, in an app, made from her answers, and
              the four things it covers (the same four pillars as
              lib/planPillars.ts and the first WHAT_YOU_GET row). */}
          <p className="mx-auto mt-2.5 max-w-84 text-[15px] leading-snug text-[#5A5A5A] text-balance">
            A day-by-day plan in the MenoLisa app, built from your answers: short workouts, food,
            calm and sleep.
          </p>
        </motion.div>

        {/* ── The price, as a number rather than a sentence ──────────────────
            There was no large numeral anywhere on this page. The offer was
            stated only as PRICE_LINE at 19px, which is prose - and a price
            screen is scanned before it is read. The figure gets the size; the
            sentence keeps the small type under it (and the screen reader).

            The money-back guarantee is inside this card on purpose: the price
            is where "what if this is a scam / what if it doesn't work for me"
            fires, so the answer has to sit in the same eyeful. The full green
            card is still down the page for the reader who wants terms.

            The strikethrough (2026-09-13) is not the $50 one removed on
            2026-09-12. That was a figure nobody was ever charged; the regular
            price here is charged by create-checkout (STRIPE_PRICE_PLAN_REGULAR)
            to anyone not on her first purchase after the quiz, and
            isQuizPriceEligible() decides it for this page and for Stripe with
            the same code. The line under the figure says why she gets it.
            Still no countdown.

            Every figure and sentence comes from lib/pricing.ts, and Stripe
            Checkout prints the same sentence under its pay button
            (CHECKOUT_SUBMIT_TEXT opens on PRICE_LINE verbatim). Never retype a
            figure here. ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3 }}
          className="relative rounded-2xl border bg-white px-4 pb-4 pt-5 mb-3 shadow-sm"
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
            YOUR {PLAN_WEEKS}-WEEK PLAN
          </span>

          {/* One sentence with the numeral inside it - "Full 8-Week Plan for
              $19" - rather than a figure with a caption beside it, so the
              price is still the largest thing above the fold and names what
              the money buys: the whole plan, not a subscription she has to
              work out. */}
          {offer.quizPrice && (
            <div className="mb-1 flex items-center justify-center gap-2">
              <span className="text-lg font-bold text-[#9A9A9A] line-through decoration-2">
                {formatPrice(offer.regularPrice)}
              </span>
              <span className="rounded-full bg-[#15803D] px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-white">
                {QUIZ_DISCOUNT_PCT}% OFF
              </span>
            </div>
          )}
          <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
            <span className="text-[22px] sm:text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#2B2627]">
              Full {PLAN_WEEKS}-Week Plan for
            </span>
            <span className="text-[56px] sm:text-[64px] font-extrabold leading-none tracking-[-0.03em] text-[#15803D] tabular-nums">
              {PRICE}
            </span>
          </p>
          {/* The per-day figure is derived (perDayLabel), never typed: it is
              the one payment spread over the PLAN_ACCESS_DAYS it buys. */}
          <p className="mt-1 text-center text-xs font-semibold text-[#8A8A8A]">
            One payment &middot; all {PLAN_WEEKS} weeks &middot;{" "}
            <span className="text-[#15803D]">just {perDayLabel(offer.price)}</span>
          </p>
          {offer.quizPrice && (
            <p className="mx-auto mt-2 max-w-76 text-center text-xs leading-snug text-[#5A5A5A]">
              <b className="text-[#15803D]">{QUIZ_PRICE_LABEL}.</b> {QUIZ_PRICE_REASON}
              {priceHold !== null && priceHold > 0 && (
                <>
                  {" "}It&apos;s valid for another{" "}
                  <b className="tabular-nums text-[#2B2627]">{formatClock(priceHold)}</b>{" "}
                  minutes.
                </>
              )}
            </p>
          )}
          {/* The offer as one sentence, for a screen reader and for the rule
              that this page and Stripe say the same words. */}
          <p className="sr-only">
            {offer.quizPrice
              ? `Regular price ${formatPrice(offer.regularPrice)}. ${QUIZ_PRICE_LABEL}: `
              : ""}
            {priceLine(offer.price)} {PRICE_SUBLINE} {GUARANTEE_HEADLINE}.
          </p>

          {/* What {PRICE} covers, shaped like the guarantee row under it so the
              two read as a pair: what you get, and what if it is not for you.
              The green "No subscription" beside it went on 2026-09-13; the
              fact is still on the sticky bar (priceLine) and in the details
              sheet ("Renews: Never"). */}
          <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-[#F6CFE0] bg-[#FFF3F8] px-3 py-2.5">
            <CalendarCheck className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.4} />
            <p className="text-left leading-snug">
              <b className="block text-[15px] text-[#2B2627]">All {PLAN_WEEKS} weeks included</b>
              {/* Concrete nouns, not product names: "Lisa" means nothing yet
                  at this point of the page. The full list is further down. */}
              <span className="block text-xs text-[#6B6B6B]">
                Daily plan, video workouts &amp; symptom tracker
              </span>
            </p>
          </div>

          {/* The row above answers "will this keep charging me". This one
              answers the bigger fear on a cold click - "what if it's not for
              me, or not real?" - with the one reassurance on the page she can
              hold us to in a contract (Terms §11). See the block above
              GUARANTEE_HEADLINE in lib/pricing.ts. */}
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50/80 px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" strokeWidth={2.4} />
            <p className="text-left text-xs leading-snug text-[#3D3D3D]">
              <b className="text-green-800">{GUARANTEE_HEADLINE}.</b>{" "}
              {GUARANTEE_INLINE_BODY}
            </p>
          </div>

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
        </motion.div>

        {/* No second CTA here, and it was measured rather than assumed. One was
            added under the price on the reasoning that the decision should be
            makeable without scrolling - then the fold was rendered at 390x700,
            the height of an Instagram in-app webview, and the sticky bar
            already starts at 555px with the identical green button in it. The
            in-fold copy landed at 571px, i.e. behind the bar on a short phone
            and as a second identical button ~90px above it on a tall one. The
            sticky bar *is* the in-fold CTA. */}

        {/* How it works, directly under the price (2026-09-13). It was the
            last block on the page as "What happens next", i.e. the mechanics
            of the purchase - pay on a web page, get an app, sign in - were
            explained ~2,000px after the number. For a woman who does not yet
            understand what she is buying, "where does this go after I pay?"
            is the question the price raises, so the answer sits under it: three
            steps she can read in one glance, and the one sentence that makes
            buying here rather than in a store make sense. */}
        <div className="mb-3 rounded-2xl border border-[#E8DDD9] bg-white px-3 py-3.5">
          <p className="mb-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
            How it works
          </p>
          <ol className="grid grid-cols-3 gap-1.5">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.bold} className="relative flex flex-col items-center text-center">
                {/* Connector to the next step, behind the icon row. */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-[calc(50%+22px)] right-[calc(-50%+22px)] top-[18px] border-t-2 border-dotted border-[#16A34A]/30"
                  />
                )}
                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#16A34A]/10">
                  <step.Icon className="h-4 w-4 text-[#15803D]" strokeWidth={2.4} />
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#16A34A] text-[9.5px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <b className="mt-1.5 text-[13px] leading-tight text-[#2B2627]">{step.bold}</b>
                <span className="text-[11px] leading-tight text-[#8A8A8A]">{step.sub}</span>
              </li>
            ))}
          </ol>
          {/* Why buy here rather than in the store: the plan her answers built
              is saved to this account, and nowhere else. */}
          <p className="mt-3 rounded-xl bg-[#F7F1EE] px-3 py-2 text-center text-xs leading-snug text-[#5A5A5A]">
            Sign in with the email you pay with. Your plan and your answers are already there,
            nothing to redo.
          </p>
        </div>

        {/* Her finish line, in dates. Below the price now - it is proof that
            supports the offer, not the thing that opens the screen. */}
        <PlanFinishBoard topProblems={topProblems} goal={goal} className="mb-2.5" />

        {/* Week 1, in full. The strongest block on this page that the diagnosis
            screen did not already show her, and the proof that the
            personalisation she was promised is real. */}
        <div ref={weekOneRef}>
          <WeekOneCard
            symptom={primarySymptom}
            goal={goal ?? []}
            rows={weekOne}
            week={week}
          />
        </div>

        {/* What {PRICE} buys, as things she will actually open (2026-09-12).
            It was three abstractions - "personalized plan", "Lisa", "symptom
            tracking" - which tell a cold visitor the category and nothing
            about the contents. Each row now names what it is and what it does
            for her, and each is sourced: see WHAT_YOU_GET. */}
        <div
          className="rounded-2xl border p-4 mb-3"
          style={{
            borderColor: "#f0d071",
            background: "linear-gradient(135deg, rgba(245,197,24,0.08) 0%, rgba(255,235,118,0.12) 50%, rgba(245,197,24,0.06) 100%)",
            boxShadow: "0 0 16px rgba(245,197,24,0.18)",
          }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight mb-3">
            What you get for <HighlightSweep variant="yellow">{PRICE}</HighlightSweep>
          </h2>
          <ul className="space-y-3">
            {WHAT_YOU_GET.map((item) => (
              <li key={item.bold} className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400/90 shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </span>
                <span className="text-sm text-[#3D3D3D] leading-snug">
                  <strong>{item.bold}</strong>
                  <span className="mt-0.5 block text-xs text-[#6B6B6B]">{item.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* A <ShotStage /> of screen1 / screen3 / screen4 closed this card
              until 2026-09-08. All three are slides of <PlanHeroCarousel /> on
              the diagnosis screen she was looking at seconds earlier, at a size
              where they can actually be read - so this was the same three
              images a second time, tilted to ~30% width behind a fade, on the
              screen whose job is to close rather than to pitch. The list above
              stays because the chat and the tracker are named nowhere else in
              the funnel; the pictures went. */}
          <p className="mt-3 text-center text-[11px] text-[#8A7F6B] leading-snug">
            All of it in one app, yours the moment you join. No add-ons, no upsells.
          </p>
        </div>

        {/* Who is behind this (2026-09-12; faces 2026-09-13). A cold visitor
            handing card details to an unnamed entity, in women's health, is
            gambling. Two real faces answer "who am I paying?" faster than any
            badge, and they sit directly above the members' own words so the
            page reads people → people. Every line is checkable: the three
            training modalities are what lib/plan/catalog.ts prescribes; the
            company and the address are the ones in the Terms.

            The "Lisa is an AI, not a doctor" row went on 2026-09-13 (owner's
            call: to this audience the word reads as "a chatbot instead of
            help"). The disclosure did not go - it is in Terms §1, and since
            2026-09-20 only there - and nothing here may imply Lisa is a person.

            **Do not add a name, a credential or an advisory board here unless
            it is real and the person has agreed to be named.** An invented
            OB-GYN converts for a week and is the whole of an FTC complaint. */}
        <div className="mb-4 rounded-2xl border border-[#E8DDD9] bg-white px-4 py-4">
          <p className="mb-3 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
            The people behind MenoLisa
          </p>
          <div className="flex justify-center gap-8">
            {FOUNDERS.map((f) => (
              <figure key={f.name} className="flex flex-col items-center text-center">
                <Image
                  src={f.src}
                  alt={f.name}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full object-cover shadow-[0_0_0_3px_#fff,0_0_0_5px_#F6CFE0,0_6px_16px_rgba(61,61,61,0.14)]"
                />
                <figcaption className="mt-2">
                  <b className="block text-sm leading-tight text-[#2B2627]">{f.name}</b>
                  <span className="block text-[11px] leading-tight text-[#8A8A8A]">{f.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          {/* "Email us", not the address. The page printed SUPPORT_EMAIL three
              times - here, in the guarantee card and in "The details" - and
              three copies of an address on a pay page reads as bracing for
              refunds. It prints once now, under Help in the details sheet. */}
          <p className="mx-auto mt-3 max-w-[20rem] text-center text-[13px] leading-snug text-[#5A5A5A]">
            A small team, not a faceless company. Email us and one of us will read it.
          </p>
          <ul className="mt-3.5 space-y-2.5 border-t border-[#F0E6E2] pt-3.5">
            {[
              {
                Icon: Dumbbell,
                bold: "Built on what the research supports",
                sub: "Strength training, daily walking and short intervals, set to the fitness level you told us.",
              },
              {
                Icon: Building2,
                bold: "A registered US company",
                sub: "Macura Solutions LLC, registered in Wyoming, USA.",
              },
            ].map((row) => (
              <li key={row.bold} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <row.Icon className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
                </span>
                <span className="min-w-0 text-sm leading-snug text-[#3D3D3D]">
                  <strong>{row.bold}</strong>
                  <span className="block text-xs text-[#6B6B6B] wrap-break-word">{row.sub}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[10.5px] leading-snug text-[#9A9A9A]">
            MenoLisa is a wellness product, not medical care.
          </p>
        </div>

        {/* Social proof, directly under the team: the people who made it, then
            the people who use it. <SymptomOutcomeCards /> is not here: those
            before/after cards are `getSymptomTransforms` on her own symptoms,
            which the diagnosis screen renders one screen earlier. The polaroid
            stays - it rotates through different women, so a second viewing is
            new proof rather than the same proof. */}
        {/* "4.9 · 12,800+ women" sat here until 2026-09-12. Nothing in the
            codebase or the database sources either number, and on the screen
            whose job is trust it is the one claim a sceptic can disprove -
            next to a guarantee she can hold us to. The members below are real
            and speak in their own words (lib/testimonials.ts drops anything
            unconfirmed from production). Put a rating back only with a
            source you can show. */}
        <p className="mb-2 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
          Members, in their own words
        </p>
        {/* Her screen-1 symptom leads the rotation: a weight-first buyer meets
            the weight story first, not whichever woman is at the top of the
            list. See getSocialProofMembers(). */}
        <SocialProofPolaroid leadWith={primarySymptom} />

        {/* The guarantee, in full - the terms, with the link to the contract
            that binds us to them. It moves with Terms §11 in both directions.
            Why it is back: lib/pricing.ts, the block above GUARANTEE_HEADLINE. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-xl font-bold text-green-800 mb-2">{GUARANTEE_HEADLINE}</h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              {/* Both halves come from GUARANTEE_BODY (split in lib/pricing.ts).
                  The head was retyped here in JSX, so an edit to the constant
                  moved the tail and left the bolded sentence behind. */}
              <b className="text-green-700">{GUARANTEE_BODY_HEAD}</b>{" "}
              <span className="wrap-break-word">{GUARANTEE_BODY_TAIL}</span>
            </p>
            <a
              href="/terms#money-back"
              className="mt-2 text-xs font-semibold text-green-700 underline underline-offset-2"
            >
              Full guarantee terms
            </a>
          </div>
        </div>

        {/* The details, as a fact sheet (2026-09-12), last: it is the page's
            FAQ. Every question a careful buyer asks before typing a card number
            - how much, does it renew, how long, where, how do I log in, can I
            get my money back, who do I ask - answered in one line each, with no
            adjectives. The access date is her real one: purchase day +
            PLAN_ACCESS_DAYS, which is exactly what fulfillCheckout writes.
            PLAN_BLOCKS_COPY stays as the footnote: it is the one sentence that
            says what happens when the weeks run out.

            The 2x2 trust grid that sat under it went on 2026-09-13. Its four
            tiles (instant access, iPhone & Android, built from your answers,
            Stripe secured) were each already said by "How it works", this
            sheet, the "What you get" list and the sticky bar. */}
        <div className="mb-4 rounded-2xl border border-[#E8DDD9] bg-white px-4 py-3.5">
          <p className="mb-1 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
            The details
          </p>
          <dl className="divide-y divide-[#F0E6E2]">
            {[
              { k: "Price", v: `${PRICE}, one payment` },
              { k: "Renews", v: "Never. No subscription" },
              {
                k: "Access",
                v: accessEnd
                  ? `${PLAN_WEEKS} weeks, until ${accessEnd}`
                  : `${PLAN_WEEKS} weeks (${PLAN_ACCESS_DAYS} days)`,
              },
              { k: "Where", v: "MenoLisa app, iPhone & Android" },
              { k: "Sign in", v: "The email you pay with. No password" },
              { k: "Refund", v: `Full refund within ${GUARANTEE_DAYS} days` },
              { k: "Help", v: SUPPORT_EMAIL },
            ].map((row) => (
              <div key={row.k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
                  {row.k}
                </dt>
                <dd className="min-w-0 wrap-break-word text-right text-[13px] font-semibold text-[#3D3D3D]">
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-center text-[11px] leading-snug text-[#8A8A8A]">
            {PLAN_BLOCKS_COPY}
          </p>
        </div>

      </motion.div>

      {/* Sticky CTA bar - fixed to the bottom on every viewport */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85 px-4 pt-3 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto w-full">
          {/* The checkout error lives on the bar she tapped, not at the foot
              of a 2,000px scroll: it used to render below the fact sheet, so
              a failed tap on the sticky button showed her nothing at all and
              read as a button that does nothing. */}
          {error && (
            <div
              role="alert"
              className="mb-2 rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-center text-[13px] leading-snug text-error"
            >
              {error}
            </div>
          )}
          <CheckoutButton loading={checkoutLoading} onClick={handleCheckoutClick} />
          {/* What she is agreeing to, on the element she agrees with. The price
              card scrolls away and this bar does not, so the one-charge terms
              are disclosed on the screen she is looking at when she taps.

              PRICE_LINE stays; the "Terms" link beside it went on 2026-09-12.
              It was there for the auto-renewal disclosure, and there is no
              renewal to disclose - checkout is `mode: "payment"`, so the whole
              of what she is agreeing to is the sentence already printed here.
              A legal link is a way off the page 40px under the only button
              that matters, and Terms is still one tap away in the guarantee
              card above (/terms#money-back), which is the section a buyer at
              this moment actually wants. */}
          <p className="text-[11px] sm:text-xs text-[#5A5A5A] text-center mt-2 leading-relaxed">
            {priceLine(offer.price)}
          </p>
          <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-1 sm:mt-1.5 leading-relaxed">
            <span className="inline-flex items-center justify-center gap-1 flex-wrap">
              {/* The guarantee rides the element she taps - the price card has
                  scrolled away by then. Stripe's submit text repeats it. */}
              <b className="text-green-700">{GUARANTEE_HEADLINE}</b> &middot;
              <b>Secure</b> with
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
                  Thank you, that helps.
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
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
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
 *  - **The countdown and the struck-through $50 anchor** (removed
 *    2026-09-12). $50 was never a price the plan was sold at, i.e. a
 *    former-price claim with nothing behind it. The $60 strikethrough that
 *    replaced it (2026-09-13) is a price create-checkout really charges; keep
 *    it that way or take it down. If a timer ever comes back, it must never
 *    change a figure and never visibly reset.
 *  - **The free-trial branch.** No `trial_period_days`, no "$0 today", no
 *    first-charge date. The card is charged the full {PRICE} at checkout.
 *  - **The first-week discount and its coupon.** Gone 2026-09-11 with the
 *    weekly plan. An introductory price that steps up is a second number on a
 *    screen whose whole problem was that it carried three.
 *  - **The browser `Purchase`.** Meta's Purchase fires from the Stripe webhook
 *    only, at the amount collected. See lib/metaPixel.ts.
 *  - **The duplicate phone shots and the duplicate before/after cards.** Both
 *    are the diagnosis screen's, one screen earlier, from the same sources
 *    (`PLAN_HERO_SLIDES`, `getSymptomTransforms`). A close is not a second
 *    pitch: re-running the previous screen buys no belief and adds scroll
 *    between her and the button.
 *  - **A price figure in the trust grid.** The price is above the fold and on
 *    the sticky bar; a third printing spent a quarter of the grid on nothing
 *    new.
 *  - **"Start my first week · $1" as the button.** That label was right for
 *    the weekly offer, where the deliverable was eight weeks and the
 *    commitment was one. Commitment and deliverable are the same block now, so
 *    the button names the block.
 */
