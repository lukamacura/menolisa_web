"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Dumbbell, Footprints, Moon, Utensils, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three quiz reward payoffs, drawn as taped paper.
 *
 * Until 2026-08-29 all three were the same screen: a medallion icon, a 6xl
 * count-up, one sentence, a pink pill. Three times. That template had two
 * problems and they compound.
 *
 * - **It is one screen shown three times.** The third one is invisible; by then
 *   the eye knows the shape and skips it. A reward that is not noticed is not a
 *   reward, it is a delay between questions.
 * - **Every number was a claim about a database, not a thing she gets.** "42
 *   moves matched to your level" cannot be pictured, so it cannot be wanted.
 *   The one thing she is actually buying — the sessions — was never once shown
 *   before the price.
 *
 * So the payoffs are objects now, in the same idiom as <PlanFinishBoard />:
 * warm ruled paper, two strips of tape, a header rule, and content that writes
 * itself in a line at a time as though someone were filling it out in front of
 * her. The tape is doing real work — it is the cheapest possible signal that
 * this is a document about her rather than another card in a funnel.
 *
 * The rule for all three: **nothing on a board is written here.** Every row is
 * either one of her own answers read back or a value pulled from
 * `lib/plan/catalog.ts` — the same tables `generatePlan()` reads. That is what
 * makes the third board the strong one: the exercise names and the sets on it
 * are the session she gets on day one, not a mock-up of one.
 *
 * There is a second rule, added 2026-08-30 when board 1 was rebuilt: **a board
 * has to hand her something she did not walk in with.** Boards 2 and 3 always
 * passed it — her week, her session 1. Board 1 did not: it read her own answers
 * back with a prevalence figure attached, which is a receipt, and it did it in
 * the most expensive slot in the funnel. It now ranks those answers and gives
 * her one free thing to do tonight. See the note above <StartingPointBoard />.
 */

const PAPER = {
  borderColor: "#E8DDD9",
  backgroundColor: "#FFFDF8",
  backgroundImage:
    "repeating-linear-gradient(180deg, transparent 0 23px, rgba(61,61,61,0.045) 23px 24px)",
} as const;

/** The eased curve every non-spring beat on a board uses. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * `--primary` (oklch 0.6209 0.1801 348.14) resolved to sRGB.
 *
 * Literal rather than `var(--primary)` because it goes inside a
 * `radial-gradient()` string with its own alpha stops, and a CSS variable
 * holding an oklch triple cannot be given one without `color-mix()` - which is
 * the one thing this funnel cannot rely on, since a decorative background that
 * fails to parse renders as nothing at all and takes the whole effect with it
 * on exactly the older in-app webviews the ad traffic arrives in.
 */
const GLOW_RGB = "208, 79, 153";

/**
 * The bloom behind a payoff: brightest as the paper lands, settling to a faint
 * halo rather than to nothing.
 *
 * It settles rather than clearing because the halo is doing a second job after
 * the arrival is over - it is what separates a reward screen from a question
 * screen at a glance, on a funnel where both are a card on the same background.
 */
const GLOW_PEAK = 1;
const GLOW_REST = 0.4;

/**
 * The arrival, and why it is the loudest thing on a board that is otherwise
 * quiet paper.
 *
 * These payoffs are the funnel's only unpaid deliveries - the screens where she
 * is handed something rather than asked for something - and until 2026-09-03
 * they arrived on a 0.4s fade and half a degree of rotation. That is the
 * entrance of a loading state, not of a reward, and the meter immediately in
 * front of it has just spent 600ms saying something was being worked out. A
 * payoff that materialises the way a skeleton does gets read as the next
 * screen, not as a thing earned.
 *
 * So the paper now arrives the way the print does on <SocialProofPolaroid /> -
 * the one animation in the funnel that reads as *handed to you* - in three
 * beats, then a gloss:
 *
 *   1. a **bloom** behind the card, brightest at the landing (see `GLOW_PEAK`).
 *   2. the **paper**, dropped in over-rotated and sprung flat rather than
 *      tweened. A spring overshoots and settles, which is what makes an object
 *      read as having weight; a tween is a fade with a direction.
 *   3. the **tape**, pressed down *after* the paper has landed, and the header
 *      rule drawn left to right - the same "filled out in front of her" idiom
 *      the rows underneath already use. Tape that arrives with the paper is a
 *      graphic; tape that arrives after it is someone sticking it down.
 *
 * Then one **gloss** crosses the page at 0.55s. Once, never on a loop - a
 * repeating shine is a banner ad, which is the same rule the print's gloss
 * keeps in components/SocialProof.tsx.
 *
 * **Nothing here branches rendered markup on `useReducedMotion()`.** Every
 * element is always in the tree and only its `animate` target changes, so this
 * cannot mismatch on hydration - the trap documented at length on
 * <SocialProofPolaroid />. Reduced motion gets the resting halo and the taped
 * paper, with no movement at all: the bloom is simply already at rest and the
 * gloss stays parked off the left edge.
 */
function RewardPaper({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("relative w-full max-w-sm mx-auto", className)}>
      {/* The bloom. First in the DOM and left at `z-index: auto` while the
          paper below is `z-10`, rather than given a negative z - a `-z-10` here
          would put it behind whatever ancestor background happens to be
          painting, which on this funnel is not always nothing.

          No `blur-*` class: the falloff is in the gradient stops already, and a
          filter on a 400px box is the one thing on this screen that costs a
          mid-range phone real frames. */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.9 }}
        animate={
          reduced
            ? { opacity: GLOW_REST, scale: 1 }
            : { opacity: [0, GLOW_PEAK, GLOW_REST], scale: [0.9, 1.06, 1] }
        }
        transition={
          reduced ? { duration: 0 } : { duration: 1.25, times: [0, 0.34, 1], ease: EASE }
        }
        className="pointer-events-none absolute -inset-6 rounded-[36px]"
        style={{
          background: `radial-gradient(58% 52% at 50% 46%, rgba(${GLOW_RGB},0.45), rgba(${GLOW_RGB},0.14) 55%, rgba(${GLOW_RGB},0) 78%)`,
        }}
      />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 22, scale: 0.94, rotate: -1.8 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 150, damping: 16, mass: 0.9 }
        }
        className="relative z-10 rounded-2xl border px-3 pt-5 pb-3 shadow-sm"
        style={PAPER}
      >
        <Tape side="left" reduced={!!reduced} />
        <Tape side="right" reduced={!!reduced} />

        <div className="relative flex items-center justify-between gap-2 pb-1.5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#B5ADA9]">
            {title}
          </p>
          {meta ? (
            <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-primary tabular-nums">
              {meta}
            </span>
          ) : null}
          {/* The rule, drawn rather than present. Zero-height with a bottom
              border, so the dashes are the border's and not a repeating
              gradient we would then have to keep in sync with the ones below. */}
          <motion.span
            aria-hidden
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.24, duration: 0.45, ease: EASE }}
            style={{ transformOrigin: "left" }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 border-b border-dashed border-[#E0D5D0]"
          />
        </div>

        {children}

        {/* The gloss, clipped to the paper by its own layer rather than by
            `overflow-hidden` on the card - the tape sits at -top-1.5 and would
            lose its top edge to a clip on the card itself. Last in the DOM so
            the light crosses the writing, which is what a light does. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
        >
          {/* `skewX` is a motion prop, not a `-skew-x-12` class, for the same
              reason the tape's rotation is: framer writes the element's whole
              inline `transform` the moment it animates `x`, and an inline
              transform beats the class - so a Tailwind skew here is silently
              dropped and the gloss crosses as a flat vertical band. */}
          <motion.span
            initial={{ x: "-150%", skewX: -12 }}
            animate={{ x: reduced ? "-150%" : "150%", skewX: -12 }}
            transition={reduced ? { duration: 0 } : { delay: 0.55, duration: 1.05, ease: "easeInOut" }}
            className="absolute inset-y-0 block w-2/3"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.72), rgba(255,255,255,0))",
            }}
          />
        </span>
      </motion.div>
    </div>
  );
}

/**
 * One strip of washi tape, pressed down over the paper's top edge.
 *
 * The rotation is a motion value and not a `-rotate-6` class: framer writes the
 * whole `transform`, so a Tailwind rotation on the same element is silently
 * dropped the moment `scale` is animated. Both halves have to live here.
 */
function Tape({ side, reduced }: { side: "left" | "right"; reduced: boolean }) {
  const angle = side === "left" ? -6 : 6;
  return (
    <motion.span
      aria-hidden
      initial={reduced ? false : { opacity: 0, scale: 0.5, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: angle }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 420,
              damping: 18,
              delay: side === "left" ? 0.2 : 0.27,
            }
      }
      className={cn(
        "pointer-events-none absolute -top-1.5 h-4 w-11 rounded-[2px]",
        side === "left" ? "left-6" : "right-6"
      )}
      style={{
        background: "rgba(255,235,118,0.55)",
        boxShadow: "0 1px 2px rgba(61,61,61,0.12)",
      }}
    />
  );
}

/** The gap between one written line and the next, on every board. */
const LINE_STEP = 0.13;

/**
 * The grey label strip that heads a section on a board.
 *
 * It is what makes a payoff read as a filled-in document rather than a card:
 * every block on <FirstSessionBoard /> and <StartingPointBoard /> opens with
 * one, and every row under it carries a value in the same right-hand column.
 * <FirstSessionBoard /> uses it free-standing for the warm-up and cool-down
 * bookends, so that one adds its own rounding; <StartingPointBoard /> uses it
 * as the head of a bordered block, where rounding is the block's job.
 */
const SECTION_BAR =
  "flex items-center justify-between gap-2 bg-[#F3EDE9] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide text-[#8C8279]";

/**
 * One line of a board, written in.
 *
 * The stagger is the whole effect: four rows arriving together is a card, four
 * rows arriving in sequence is someone filling a page out. `base` lets a board
 * start its rows after its own headline has landed.
 */
function Line({
  i,
  base = 0.18,
  delay,
  children,
  className,
}: {
  i: number;
  base?: number;
  /** Absolute delay, overriding `base + i * STEP`. See <StartingPointBoard />. */
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
              type: "spring",
              stiffness: 320,
              damping: 26,
              delay: delay ?? base + i * LINE_STEP,
            }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * The one count-up that survived the redesign, on the week board's total.
 *
 * The old screens ran three of these at 6xl, one per reward, which is how a
 * device stops being a device. One, at header size, over a week she can see
 * being filled in underneath it, is the whole of the ticking budget.
 */
function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return (
    <>
      {display}
      {suffix}
    </>
  );
}

/**
 * The handwritten closing line every board ends on.
 *
 * It arrives last and it is the sentence she leaves the screen with, so it gets
 * the one beat of theatre left over from the paper's own landing: a spring with
 * a hair of scale in it, and a single ring pulse that expands out of the pill
 * and clears. That is the board saying it has finished writing itself.
 *
 * The pulse is a separate absolutely-positioned ring rather than an animated
 * `box-shadow`, so it costs one composited layer and no repaints, and it clears
 * to nothing - a resting glow here would compete with the bloom behind the
 * whole card, which is the element that owns "this is a reward".
 */
function Signoff({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.p
      initial={reduced ? false : { opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: "spring", stiffness: 320, damping: 22, delay }
      }
      className="relative mt-2.5 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 py-2 text-center text-[12px] sm:text-[13px] font-semibold leading-snug text-[#3D3D3D]"
    >
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.96 }}
        animate={reduced ? { opacity: 0 } : { opacity: [0, 0.85, 0], scale: [0.96, 1.06, 1.1] }}
        transition={
          reduced
            ? { duration: 0 }
            : { delay: delay + 0.05, duration: 0.85, times: [0, 0.3, 1], ease: EASE }
        }
        className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/45"
      />
      <span className="relative">{children}</span>
    </motion.p>
  );
}

/* ── Board 1: where she starts, and the one thing she does tonight ─────────
 *
 * Was (until 2026-08-30): "What you told Lisa" — her symptoms listed back in
 * the order she tapped them, each with a prevalence bar, under the sign-off
 * "you're not broken, this is your biology".
 *
 * It was the weakest of the three payoffs sitting in the most expensive slot in
 * the funnel, and it failed the same test board 3 was rebuilt to pass. Three
 * things were wrong with it and they compound:
 *
 * - **It was a receipt, not a gift.** Every row was data she had typed thirty
 *   seconds earlier. The only new information on the screen was the percentage,
 *   and the percentage is about other people. Boards 2 and 3 hand her an object
 *   she did not have — her week, her session 1. This handed back her own
 *   homework.
 * - **The prevalence figure argued the wrong way.** "80% of women like you have
 *   this" is a normalisation claim, and normalisation is the right *empathy*
 *   move and the wrong *conversion* move at question 6: "everyone has it, it's
 *   normal" is the belief that has kept her doing nothing for four years. She
 *   also already agreed — the ad said it, and the start headline says it again
 *   ("It isn't in your head"), so this was the third telling before question 7
 *   and it bought no new belief.
 * - **It spent the funnel's best argument early, in its weakest form.** The
 *   results screen makes the same case with mechanism lines and a cohort
 *   benchmark (<ScoreCauseCard />), six screens later. Repetition without
 *   escalation reads as padding.
 *
 * The tell was in the loader: its meter said "Ranking what to move first…" and
 * then the board showed an unranked list. The meter already knew what this
 * screen should have been.
 *
 * So the board keeps the paper and loses the payload. Now it does three things,
 * in the order a woman needs them:
 *
 *   1. **Ranks.** `getTopBurdenSymptoms()` — the same function the results
 *      screen uses for `scoreDrivers`, so the two screens can never disagree
 *      about her worst one. A ranking is the first thing on this screen she
 *      could not have got by googling, and it opens a loop the results screen
 *      then closes.
 *   2. **Explains the top one.** One line of SYMPTOM_MECHANISM, for #1 only.
 *      Not all four: the results card owns the full convergence argument, and
 *      running it here in miniature is what made this screen a duplicate.
 *   3. **Pays her.** SYMPTOM_FIRST_MOVE — one specific, free thing she can do
 *      tonight for her worst symptom, before the price has been mentioned. This
 *      is the whole reason the screen was rebuilt: it turns the first payoff
 *      from a claim into a delivered good, so finishing the quiz stops being a
 *      bet and becomes a continuation.
 *
 * The prevalence figure survives as one grey line under the mechanism, which is
 * where it belongs — the same demotion board 3 gave its pool count. "You're not
 * the odd one out" is a true and useful beat; it is not a payoff.
 *
 * What the board deliberately does **not** claim: that her plan treats these in
 * this order. It doesn't — `relaxationForSymptom()` walks `top_problems` in tap
 * order — so "START HERE" is scoped to what this screen actually delivers, the
 * thing she does tonight. Ranking by daily cost is a statement about the
 * symptom (SYMPTOM_IMPACT, the same model behind her score), never a
 * measurement of her.
 *
 * **Laid out as a ledger, 2026-08-31.** The content above was right and the
 * shape was not: boards 2 and 3 are ruled lists where every row is an identity
 * on the left and a value on the right, bracketed by grey SECTION_BAR strips,
 * and this one was four chips over two loose paragraphs with a green box
 * stapled underneath. Same three beats, now in that idiom - hairline-ruled
 * rows each ending in a boxed rank (#1 is the START HERE chip, which is the
 * value this screen exists to produce), then two headed blocks for the why and
 * the payload. Nothing was added or removed to do it; the prevalence line just
 * moved inside the block it is a footnote to.
 *
 * **The payload made the hero, 2026-09-03.** The ledger fixed the shape and
 * flattened the hierarchy: the ranking, the why-block, the tonight-block and
 * the sign-off were four boxes of the same weight, and the one she is paid
 * with was the smallest type on the board (12.5px inside a 5% tint) - followed
 * by a pink sign-off that arrived *after* it, with the board's only ring
 * pulse, and took the last beat. So the eye landed on the sign-off and the
 * gift read as a footnote to the ranking. Now: the why is plain text under the
 * list (no box, no bar), the tonight-block is a solid-green-headed note at
 * 15.5px with the ring pulse and the board's only shadow, and the sign-off is
 * one grey line beneath it. One box on the board, and it is the thing she
 * takes home.
 */
export type StartingPointRow = { id: string; label: string; Icon: LucideIcon };

export function StartingPointBoard({
  rows,
  cohort,
  topPct,
  mechanism,
  firstMove,
  planWeeks,
}: {
  rows: StartingPointRow[];
  cohort: string;
  topPct: number;
  mechanism?: string;
  firstMove?: { do: string; why: string };
  planWeeks: number;
}) {
  const reduced = useReducedMotion();
  const top = rows[0];
  const rest = Math.max(0, rows.length - 1);

  /* The reveal, written out rather than derived from a running index.
   *
   * This board is three sections that have to arrive in a reading order - the
   * ranking, the verdict on the ranking, then the thing she does about it - and
   * a shared `base + i * LINE_STEP` cursor put pairs of them on the same frame.
   * Two things moving at once on a 320px board is one thing nobody reads.
   *
   * The steps are tighter than the other two boards' 0.13 (0.10 between rows,
   * and the rows are single-line) because the meter has already spent 1.7s in
   * front of this. The payload is legible at ~1.0s and the whole page has
   * settled by ~1.2s, against ~1.3s for <TrainingWeekBoard />.
   */
  const ROWS_BASE = 0.14;
  const ROW_STEP = 0.1;
  const rowsEnd = ROWS_BASE + rows.length * ROW_STEP;
  const chipAt = rowsEnd;
  const whyBarAt = rowsEnd + 0.12;
  const mechAt = whyBarAt + 0.09;
  const pctAt = mechAt + 0.09;
  // The payload gets a beat of air in front of it. It is the only block on the
  // board she is asked to act on, and arriving on the same cadence as the rows
  // above would file it as one more line of the same list.
  const moveAt = pctAt + 0.16;
  const signAt = moveAt + 0.22;

  return (
    <RewardPaper title="Where to start" meta="worst first">
      {/* Section 1 - the ranking, as a ruled list. Hairlines and a boxed value
          on every row are what make this read as a filled-in form rather than a
          stack of chips; it is the same skeleton as <FirstSessionBoard />'s
          movement rows, which is the point. */}
      <div className="mt-1.5">
        {rows.map((row, n) => {
          const isTop = n === 0;
          return (
            <Line
              key={row.id}
              i={n}
              delay={ROWS_BASE + n * ROW_STEP}
              className="flex items-center gap-2 border-b border-dashed border-[#EFE6E1] py-[3px] last:border-0"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border",
                  isTop
                    ? "border-primary bg-primary text-white"
                    : "border-[#E8DDD9] bg-white text-[#B5ADA9]"
                )}
              >
                <row.Icon className="h-3.5 w-3.5" strokeWidth={isTop ? 2.2 : 1.9} aria-hidden />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[12.5px] leading-tight",
                  isTop ? "font-extrabold text-[#3D3D3D]" : "font-semibold text-[#8C8279]"
                )}
              >
                {row.label}
              </span>
              {isTop ? (
                /* The one beat of theatre on the board, and it lands after all
                   four names have arrived - the eye reads the list, then the
                   list is decided. A chip that animated in with its own row
                   would just be a label. */
                <motion.span
                  initial={reduced ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 18, delay: chipAt }
                  }
                  className="shrink-0 rounded-md bg-primary px-1.5 py-[2px] text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-white"
                >
                  Start here
                </motion.span>
              ) : (
                <span className="shrink-0 rounded-md border border-[#E0D5D0] bg-white px-1.5 py-[1px] text-[10.5px] font-extrabold tabular-nums text-[#8C8279]">
                  #{n + 1}
                </span>
              )}
            </Line>
          );
        })}
      </div>

      {/* Section 2 - why the top one is the top one, then the crowd, in that
          order and at that weight. The physiology is the argument; the
          percentage is the reassurance underneath it. Plain text, no box: it
          is the bridge between the ranking and the payload, and a bordered
          block here was a third object competing with the one that matters. */}
      {(mechanism || top) && (
        <div className="mt-1.5 px-0.5">
          {mechanism && (
            <Line i={0} delay={mechAt} className="text-[11.5px] leading-snug text-[#5A5A5A]">
              <span className="text-[9.5px] font-extrabold uppercase tracking-wide text-[#8C8279]">
                Why it&apos;s first
              </span>{" "}
              &middot; {mechanism}
            </Line>
          )}
          {top && (
            <Line
              i={0}
              delay={pctAt}
              className={cn("text-[10px] leading-snug text-[#9A9A9A]", mechanism && "mt-0.5")}
            >
              <span className="font-bold tabular-nums text-[#7A7A7A]">{topPct}%</span> of {cohort}{" "}
              report {top.label.toLowerCase()} too.
            </Line>
          )}
        </div>
      )}

      {/* Section 3 - the payload, in the same headed-block idiom as section 2 so
          the board reads as one document with three parts. It is the only block
          on any of the three boards that asks her to do something rather than
          showing her something, so it arrives last, on its own spring, and it
          is the one block drawn in green.

          Green rather than the primary tint the rest of the board uses is the
          funnel's colour rule read straight: green is the gap and the thing
          that closes it, and this is the first moment in the funnel that
          anything closes any of it. */}
      {firstMove && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 280, damping: 22, delay: moveAt }
          }
          className="relative mt-2.5"
        >
          {/* The ring pulse the sign-off used to own. It is the board's one
              "look here" gesture, and it belongs on the thing she is being
              handed, not on the sentence after it. */}
          <motion.span
            aria-hidden
            initial={{ opacity: 0, scale: 0.97 }}
            animate={reduced ? { opacity: 0 } : { opacity: [0, 0.9, 0], scale: [0.97, 1.05, 1.09] }}
            transition={
              reduced
                ? { duration: 0 }
                : { delay: moveAt + 0.12, duration: 0.95, times: [0, 0.3, 1], ease: EASE }
            }
            className="pointer-events-none absolute -inset-0.5 rounded-2xl ring-[3px] ring-[#16A34A]/50"
          />
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-[#16A34A] bg-[#F3FBF5]"
            style={{ boxShadow: "0 8px 22px rgba(22,163,74,0.22), 0 1px 3px rgba(22,163,74,0.18)" }}
          >
            <div className="flex items-center justify-between gap-2 bg-[#16A34A] px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-white">
              <span className="flex min-w-0 items-center gap-1.5">
                <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
                <span className="truncate">Your move for tonight</span>
              </span>
              <span className="shrink-0 rounded bg-white/25 px-1.5 py-[1px] text-[9.5px] tracking-normal">
                Free
              </span>
            </div>
            <div className="px-3 pt-2.5 pb-2.5">
              <p className="text-[15.5px] font-extrabold leading-snug text-[#3D3D3D] text-balance">
                {firstMove.do}
              </p>
              <p className="mt-2 border-t border-dashed border-[#CDE7D4] pt-1.5 text-[11.5px] leading-snug text-[#5A5A5A]">
                {firstMove.why}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Not <Signoff />: that is a pink box with a ring pulse, and on this
          board it sat directly under the payload and outshone it. One quiet
          line - it is the caption to the gift, not a second gift. */}
      <Line
        i={0}
        delay={signAt}
        className="mt-2 text-center text-[11px] leading-snug text-[#8C8279]"
      >
        One thing, tonight.{" "}
        {rest > 0 ? (
          <>
            The other {rest} {rest === 1 ? "is" : "are"} in your{" "}
            <span className="whitespace-nowrap font-bold text-[#5A5A5A]">{planWeeks}-week plan</span>.
          </>
        ) : (
          <>
            The rest is in your{" "}
            <span className="whitespace-nowrap font-bold text-[#5A5A5A]">{planWeeks}-week plan</span>.
          </>
        )}
      </Line>
    </RewardPaper>
  );
}

/* ── Board 2: her training week ────────────────────────────────────────────
 *
 * Was: a minutes count-up and seven dots.
 *
 * Now: the seven days written out with what actually lands on each one. The
 * dots said "four of your days have something in them" and stopped there, which
 * is the least interesting true thing about her week. What answers "I don't
 * have time" is seeing Tuesday say *20 min walk* and Wednesday say *rest* —
 * the week she is being asked for, at the size it really is.
 *
 * Every chip is scheduled by the caller off `MOVEMENT_VOLUME` and
 * `cardioForWeek(level, 1)`, so this is week 1 of the plan she buys.
 */
export type DayChip = { text: string; tone: "strength" | "cardio" | "power" };
export type PlannerDay = { label: string; chips: DayChip[] };

const CHIP_TONE: Record<DayChip["tone"], { cls: string; Icon: LucideIcon }> = {
  strength: { cls: "border-primary/25 bg-primary/10 text-primary", Icon: Dumbbell },
  cardio: { cls: "border-[#16A34A]/25 bg-[#16A34A]/10 text-[#15803D]", Icon: Footprints },
  power: { cls: "border-[#F59E0B]/30 bg-[#F59E0B]/12 text-[#B45309]", Icon: Zap },
};

export function TrainingWeekBoard({
  days,
  totalMinutes,
  food,
  windDown,
}: {
  days: PlannerDay[];
  totalMinutes: number;
  food?: string;
  windDown?: string;
}) {
  return (
    <RewardPaper title="Your week 1" meta={<CountUp value={totalMinutes} suffix=" min total" />}>
      <div className="mt-1.5">
        {days.map((day, i) => (
          <Line
            key={day.label + i}
            i={i}
            base={0.12}
            className="flex items-center gap-2 border-b border-dashed border-[#EFE6E1] py-[3px] last:border-0"
          >
            <span
              className={cn(
                "w-7 shrink-0 text-[10px] font-extrabold uppercase tracking-wide",
                day.chips.length ? "text-[#3D3D3D]" : "text-[#C6BDB9]"
              )}
            >
              {day.label}
            </span>
            {day.chips.length === 0 ? (
              <span className="text-[11px] italic text-[#C6BDB9]">rest</span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-center gap-1">
                {day.chips.map((chip) => {
                  const tone = CHIP_TONE[chip.tone];
                  return (
                    <span
                      key={chip.text}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-[2px] text-[10.5px] font-bold whitespace-nowrap",
                        tone.cls
                      )}
                    >
                      <tone.Icon className="h-3 w-3" strokeWidth={2.4} aria-hidden />
                      {chip.text}
                    </span>
                  );
                })}
              </span>
            )}
          </Line>
        ))}
      </div>

      {(food || windDown) && (
        <div className="mt-2 border-t border-dashed border-[#E0D5D0] pt-1.5 space-y-1">
          {food && (
            <Line i={7} base={0.12} className="flex items-center justify-between gap-2">
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-[#B5ADA9]">
                <Utensils className="h-3 w-3" aria-hidden /> Food
              </span>
              <span className="text-right text-[11.5px] font-semibold leading-snug text-[#3D3D3D]">
                {food}
              </span>
            </Line>
          )}
          {windDown && (
            <Line i={8} base={0.12} className="flex items-center justify-between gap-2">
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-[#B5ADA9]">
                <Moon className="h-3 w-3" aria-hidden /> Wind-down
              </span>
              <span className="text-right text-[11.5px] font-semibold leading-snug text-[#3D3D3D]">
                {windDown}
              </span>
            </Line>
          )}
        </div>
      )}

      <Signoff delay={1.3}>
        <span className="font-extrabold">{totalMinutes} minutes</span> across the whole week.
        That&apos;s the entire ask.
      </Signoff>
    </RewardPaper>
  );
}

/* ── Board 3: her first session, written out ───────────────────────────────
 *
 * Was: "42 moves matched to your level — nothing generic."
 *
 * That sentence asked her to take our word for it one screen before the price,
 * which is the worst place in the funnel to be asking for trust rather than
 * spending it. This board is the same claim, discharged: the movement names,
 * the sets and the seconds are read out of `lib/plan/catalog.ts` by the same
 * functions the generator calls — `allowedExercises()`, `defaultDoseForWeek()`,
 * `buildPowerBlock()` — for week 1. She is looking at Monday.
 *
 * The pool size survives as one small line under the rule, where it belongs:
 * it is the footnote to the session, not the headline over it.
 */
export type SessionRow = { name: string; dose: string; power?: boolean };

export function FirstSessionBoard({
  heading,
  minutesLabel,
  warmup,
  rows,
  cooldown,
  poolCount,
  sessionsTotal,
}: {
  heading: string;
  minutesLabel: string;
  warmup?: { count: number; minutes: number };
  rows: SessionRow[];
  cooldown?: { count: number; minutes: number };
  poolCount: number;
  sessionsTotal: string;
}) {
  const bookendCls = cn(SECTION_BAR, "rounded-md");
  let i = 0;
  return (
    <RewardPaper title={heading} meta={minutesLabel}>
      <div className="mt-2 space-y-1">
        {warmup && (
          <Line i={i++} className={bookendCls}>
            <span>Warm-up · {warmup.count} moves</span>
            <span className="tabular-nums">{warmup.minutes} min</span>
          </Line>
        )}

        {rows.map((row, n) => (
          <Line key={row.name} i={i++} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold tabular-nums",
                row.power ? "bg-[#F59E0B] text-white" : "bg-[#3D3D3D] text-white"
              )}
            >
              {row.power ? <Zap className="h-3 w-3" strokeWidth={2.6} aria-hidden /> : n + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold leading-tight text-[#3D3D3D]">
              {row.name}
            </span>
            <span className="shrink-0 rounded-md border border-[#E0D5D0] bg-white px-1.5 py-[1px] text-[10.5px] font-extrabold tabular-nums text-[#5A5A5A]">
              {row.dose}
            </span>
          </Line>
        ))}

        {cooldown && (
          <Line i={i++} className={bookendCls}>
            <span>Cool-down · {cooldown.count} stretches</span>
            <span className="tabular-nums">{cooldown.minutes} min</span>
          </Line>
        )}
      </div>

      <p className="mt-2 border-t border-dashed border-[#E0D5D0] pt-1.5 text-[10px] leading-snug text-[#9A9A9A]">
        Picked from the <span className="font-bold text-[#7A7A7A]">{poolCount} movements</span>{" "}
        cleared for your level — not from a template.
      </p>

      <Signoff delay={0.3 + i * 0.13}>
        This is <span className="font-extrabold">session 1</span> of {sessionsTotal}. It&apos;s
        already built.
      </Signoff>
    </RewardPaper>
  );
}
