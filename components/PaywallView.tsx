"use client";

import { ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
} from "lucide-react";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import { SocialProofPolaroid } from "@/components/SocialProof";
import {
  META_CURRENCY,
  PLAN_VALUE,
  newInitiateCheckoutEventId,
  viewContentEventId,
} from "@/lib/metaPixel";
import {
  FIRST_WEEK_PRICE,
  GUARANTEE_HEADLINE,
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
}

const FIRST_WEEK = formatPrice(FIRST_WEEK_PRICE);
const WEEKLY = formatPrice(WEEKLY_PRICE);

/**
 * "Start tonight" is a promise about her evening, so it has to be true when she
 * reads it. Before {@link EVENING_HOUR} her local time it is "today"; after it,
 * "tonight" - the same offer, in the word that is not already wrong.
 *
 * Read through `useSyncExternalStore` rather than computed during render,
 * because the server has no clock she shares: the build runs in UTC, so a
 * component that read the hour inline would hydrate one word and repaint
 * another. The server snapshot is the word the copy was written in; the client
 * snapshot is the truth, and React swaps it in after hydration. There is
 * nothing to subscribe to - the word only has to be right when the page loads,
 * and a woman who sits on this screen through 5pm has a bigger problem than
 * the tense.
 */
const EVENING_HOUR = 17;

const subscribeToNothing = () => () => {};
const startWordNow = (): "tonight" | "today" =>
  new Date().getHours() >= EVENING_HOUR ? "tonight" : "today";

function useStartWord(): "tonight" | "today" {
  return useSyncExternalStore(subscribeToNothing, startWordNow, () => "tonight");
}

// Scannable 2x2 grid, one promise per box. At the payment moment she scans
// rather than reads, so every box is a 2-3 word headline with one support line.
//
// **No box states the price.** One did (`$1 today / then $4.99 a week`) until
// 2026-09-08, when the price card was still the eighth block on the page and
// this grid was one of the few places the figure appeared at all. The price is
// now the second block, above the fold, and it is also on the sticky bar - so
// that box was the third printing of one number, spending a quarter of the grid
// on nothing new. The slot went to the objection this screen actually leaves
// unanswered: she is paying on a web page for a product that lives in an app
// she has not downloaded.
const TRUST_LABELS = [
  {
    icon: Zap,
    bg: "bg-yellow-100",
    fg: "text-yellow-700",
    title: "Instant access",
    sub: "Your plan is ready now",
  },
  {
    icon: Smartphone,
    bg: "bg-pink-100",
    fg: "text-pink-600",
    title: "iPhone & Android",
    sub: "Download right after checkout",
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
          ? `${hidden.length} more in week 1 — yours the moment you join.`
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
 * **The label is the commitment, not the deliverable.** It read "Start my
 * {PLAN_WEEKS}-week plan" until 2026-09-08, which asks for eight weeks on a
 * screen that is charging for one - and every 8-week cue on the page had her
 * pricing the block (8 x {WEEKLY}) before she had read the first dollar. The
 * {PLAN_WEEKS}-week plan is what she gets; one week for {FIRST_WEEK} is what
 * she agrees to.
 */
function CheckoutButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void | Promise<void>;
}) {
  return (
    <motion.button
      type="button"
      disabled={loading}
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
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
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          Redirecting to checkout&hellip;
        </>
      ) : (
        <>
          <Lock className="w-4 h-4" />
          Start my first week &middot; {FIRST_WEEK}
        </>
      )}
    </motion.button>
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
}: PaywallViewProps) {
  // Same outcome as the finish board's far end (lib/planTimeline.ts) - the
  // headline and the chart have to name the same thing.
  const outcome = getOutcomeHeadline(goal ?? []);
  const startWord = useStartWord();
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

        {/* ══ The offer, above the fold ═══════════════════════════════════════
            The order of this screen is the whole change of 2026-09-08. It used
            to run: stars → her goal as the headline → the finish chart → the
            full week 1 card → a paragraph on billing blocks → the price. That
            is the right architecture for a $59 charge, where the number is the
            objection and every block above it exists to earn it.

            It is the wrong architecture for {FIRST_WEEK}. At a dollar the price
            is not the objection, it is the strongest asset on the page - it
            collapses "is this worth $59?" into "is this worth a coffee?" - and
            it was the eighth block, roughly two screens down. Above the fold
            the figure appeared exactly once: at 16px, inside the sticky button,
            at the very bottom edge of the screen. 169 women reached this page
            over 30 days and essentially none of them bought.

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
          {/* The bridge: she came in on a free quiz and this is the first screen
              with a price on it. One line names the switch before the headline
              makes the claim. */}
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#A8899B] mb-1.5">
            Your audit is done &amp; free. This is the plan it built.
          </p>
          {/* The headline is her outcome and when she has it (2026-09-09). It
              was the price - "Start tonight for {FIRST_WEEK}." - from the
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
        </motion.div>

        {/* ── The price, as a number rather than a sentence ──────────────────
            There was no large numeral anywhere on this page. The offer was
            stated only as PRICE_LINE at 19px, which is prose - and a price
            screen is scanned before it is read. The figure gets the size; the
            sentence keeps the small type under it (and the screen reader).

            The guarantee row is inside this card on purpose. "then {WEEKLY}/
            week" raises its objection - *they will keep charging me* - the
            instant she reads it, and the answer was four blocks and ~1,600px
            below. Objection and answer have to fit in one eyeful. The full
            green card is still down the page for the reader who wants terms.

            Both figures and both sentences come from lib/pricing.ts, and Stripe
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
            YOUR FIRST WEEK
          </span>

          {/* The old headline, in the block that owns the number. It reads as
              one sentence with the numeral inside it - "Start tonight for $1" -
              rather than as a figure with a caption beside it, so the price is
              still the largest thing above the fold and still says what the
              dollar buys: an evening, not a subscription. */}
          <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 text-center">
            <span className="text-[22px] sm:text-[24px] font-bold leading-tight tracking-[-0.01em] text-[#2B2627]">
              Start {startWord} for
            </span>
            <span className="text-[56px] sm:text-[64px] font-extrabold leading-none tracking-[-0.03em] text-[#15803D] tabular-nums">
              {FIRST_WEEK}
            </span>
          </p>
          {/* The offer as one sentence, for a screen reader and for the rule
              that this page and Stripe say the same words. */}
          <p className="sr-only">
            {PRICE_LINE} {PRICE_SUBLINE}
          </p>

          <div className="mt-3.5 flex items-baseline justify-between gap-3 rounded-xl border border-[#EFE2E8] bg-white/70 px-3 py-2 text-left">
            <span className="text-sm text-[#5A5A5A]">
              From week 2
              <span className="block text-xs text-[#8A8A8A]">every week, until you cancel</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-base font-extrabold tabular-nums text-[#3D3D3D]">
              {WEEKLY}
            </span>
          </div>

          {/* The answer to the objection the row above just raised - and the
              answer is the dollar and cancelling. There is no refund clause to
              fall back on since 2026-09-09; see the block on GUARANTEE_HEADLINE
              in lib/pricing.ts. */}
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50/80 px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" strokeWidth={2.4} />
            <p className="text-left text-xs leading-snug text-[#3D3D3D]">
              <b className="text-green-800">Try it for {FIRST_WEEK}.</b>{" "}
              Don&apos;t like it? Just cancel &mdash; you&apos;re never charged again.
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

        {/* What the subscription is, in one paragraph - and the answer to
            "what happens after week 8", which the headline above raises and
            nothing else on the page answered. Deliberately here and not in the
            headline's type: it sat directly above the price until 2026-09-08,
            the densest sentence on the screen and the last thing she read
            before the number, and a comprehension task never goes in front of a
            decision. An answer to a question she has not asked yet is the same
            mistake enlarged. See the block on PLAN_BLOCKS_COPY in
            lib/pricing.ts. */}
        <p className="mb-4 px-1 text-center text-sm leading-relaxed text-[#5A5A5A]">
          {PLAN_BLOCKS_COPY}
        </p>
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

          {/* A <ShotStage /> of screen1 / screen3 / screen4 closed this card
              until 2026-09-08. All three are slides of <PlanHeroCarousel /> on
              the diagnosis screen she was looking at seconds earlier, at a size
              where they can actually be read - so this was the same three
              images a second time, tilted to ~30% width behind a fade, on the
              screen whose job is to close rather than to pitch. The list above
              stays because Lisa and the tracker are named nowhere else in the
              funnel; the pictures went. */}
          <p className="mt-3 text-center text-[11px] text-[#8A7F6B] leading-snug">
            All of it in the app, yours the moment you join.
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

        {/* The guarantee. It is the dollar and cancelling, and as of 2026-09-09
            that is all it is - the money-back footnote that sat under it is
            gone from here and from Terms §11 in the same commit, which is the
            coupling that has to hold in both directions. Why the reframe:
            lib/pricing.ts, the block above GUARANTEE_HEADLINE. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-xl font-bold text-green-800 mb-2">{GUARANTEE_HEADLINE}</h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              <b className="text-green-700">{FIRST_WEEK} is all you risk.</b>{" "}
              If it isn&apos;t for you, cancel in two taps from the app before week 2 and you are
              never charged again. No email, no phone call, no questions.
            </p>
          </div>
        </div>

        {/* Social proof, low on the page rather than above the headline.
            <SymptomOutcomeCards /> went with it: those before/after cards are
            `getSymptomTransforms` on her own symptoms, which is exactly what
            the diagnosis screen renders one screen earlier from the same
            function. A close that re-runs the previous screen's pitch buys no
            belief and adds scroll between her and the button. The polaroid
            stays - it rotates through different women, so a second viewing is
            new proof rather than the same proof. */}
        <div className="mb-2 flex items-center justify-center gap-2">
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
        </div>
        <SocialProofPolaroid />

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
          <CheckoutButton loading={checkoutLoading} onClick={handleCheckoutClick} />
          {/* The terms she is agreeing to, on the element she agrees with. The
              price card scrolls away and this bar does not, so the renewal is
              disclosed on the screen she is looking at when she taps. */}
          <p className="text-[11px] sm:text-xs text-[#5A5A5A] text-center mt-2 leading-relaxed">
            {PRICE_LINE}{" "}
            <a href="/terms#subscription" className="underline">
              Cancel anytime
            </a>
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
 *  - **The duplicate phone shots and the duplicate before/after cards.** Both
 *    are the diagnosis screen's, one screen earlier, from the same sources
 *    (`PLAN_HERO_SLIDES`, `getSymptomTransforms`). A close is not a second
 *    pitch: re-running the previous screen buys no belief and adds scroll
 *    between her and the button.
 *  - **A price figure in the trust grid.** The price is above the fold and on
 *    the sticky bar; a third printing spent a quarter of the grid on nothing
 *    new.
 *  - **"Start my {PLAN_WEEKS}-week plan" as the button.** The label states the
 *    commitment now - one week - because the deliverable's length is not what
 *    she is agreeing to pay for.
 */
