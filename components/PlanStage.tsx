"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_PILLARS, planPhaseForWeek } from "@/lib/planPillars";
import { PLAN_DAYS } from "@/lib/planTimeline";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * The plan scroll, staged.
 *
 * The scroll used to be a still: her name written on parchment, with two static
 * grids stacked underneath it (the 8-week arc, then "every day, four things").
 * Three separate things saying one thing. Now the parchment is the stage and
 * those grids play *inside* it, in the order she'd actually live them:
 *
 *   1. `plan`  - the sealed scroll with her name on it. This is yours.
 *   2. `today` - a phone rises out of the scroll: today's four tasks, ticking
 *                themselves off one by one.
 *   3. `weeks` - the same phone, one screen over: 56 days filling in week by
 *                week through the three phases, ending on a finished plan.
 *
 * **It is a film, not a widget.** Nothing here is tappable, draggable or
 * focusable - she is mid-funnel reading a pitch, and a control she has to
 * discover is a control that mostly goes undiscovered while stealing the taps
 * meant for the CTA. The whole subtree is `pointer-events-none` and exposed to
 * assistive tech as a single labelled image.
 *
 * Cost, because this plays on a $59 sales page on a mid-range phone:
 *
 * - **One clock.** Every act is driven off one `progress` motion value. The
 *   segment bar *is* that value (transform only, no renders), and the act flips
 *   when it reaches 1. One thing to pause, one thing to reset.
 * - **It only runs while she can see it.** `useInView` gates the clock and the
 *   CSS day-fill together, so a scrolled-past scroll costs nothing.
 * - **Renders are counted.** Both screens derive their state from `progress`
 *   and call `setState` only when the derived value actually changes: 4 renders
 *   for the tick-off, 8 for the week counter. The 56 day dots re-render never -
 *   they are CSS animations with a per-dot delay (see `.plan-day` in
 *   globals.css).
 * - **No blur, anywhere.** Animated `filter: blur()` is the one effect here
 *   that reliably drops frames on mobile; the letters and the act transitions
 *   use opacity and transform only.
 *
 * Geometry note: the paper inside offer.webp runs 10%-90% across and
 * 17.8%-83.3% down. The phone is pinned inside those bounds and the bottom roll
 * is painted back over the top of it (BOTTOM_ROLL_CLIP), so the phone rises out
 * from behind the roll instead of floating on the page.
 */

type ActId = "plan" | "today" | "weeks";

/* Holds are ~20% shorter than they were (4200/5200/5400): the whole loop ran
   just under 15s, which is a long time to hold a reader who is mid-scroll on a
   sales page, and every act had settled well before its hold ran out. The beat
   sheets below moved with them so nothing lands in a dead act - see
   TICK_START_MS and FILL_SPAN_MS.

   The captions are one short line each. They used to run to a full sentence of
   copy apiece, which is a second thing to read under a picture that is already
   saying it, and the block under the scroll had to reserve two lines of height
   for them. The picture makes the point; the caption only has to name it. */
const ACTS: { id: ActId; label: string; hold: number; caption: string }[] = [
  {
    id: "plan",
    label: "Your plan, sealed",
    hold: 3400,
    caption: "Your name on it, before you start.",
  },
  {
    id: "today",
    label: "A day on the plan",
    hold: 4200,
    caption: "Four small things a day.",
  },
  {
    id: "weeks",
    label: "The 8-week arc",
    hold: 4400,
    caption: "Eight weeks, three phases.",
  },
];

/** Where the scroll's bottom roll starts. The paper above it is repainted over
    the phone, so the phone reads as rising out of the scroll. */
const BOTTOM_ROLL_CLIP = "inset(81% 0 0 0)";

/** Ink color for everything written on the paper. */
const INK = "#5c4327";

const SCROLL_SIZES = "(max-width: 400px) 92vw, 340px";

/* Act 2's beat sheet, in ms from the act's start. The rows land by ~0.75s, so
   the first tick waits until she has had a moment to read them. The four ticks
   have to finish with room to spare inside the act's 4200ms hold, or "that's
   day one, done" flashes up as the act is already leaving. */
const TICK_START_MS = 1000;
const TICK_EVERY_MS = 620;

/* Act 3's beat sheet. Must stay in step with the per-dot delays below - the
   week counter reads off the same arithmetic the CSS delays are built from,
   and FILL_DOT_MS must match the `.plan-day` animation duration in
   globals.css. */
const FILL_START_MS = 340;
const FILL_SPAN_MS = 1850;
const FILL_DOT_MS = 220;
/** Gap between one day lighting up and the next. */
const FILL_STEP_MS = (FILL_SPAN_MS - FILL_DOT_MS) / (PLAN_DAYS - 1);

export function PlanStage({
  firstName,
  goalLabel,
  className,
}: {
  firstName?: string;
  /** Her #1 goal, lowercased, as it reads after "Designed to help you …". */
  goalLabel: string;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(stageRef, { amount: 0.3 });
  const [index, setIndex] = useState(0);
  const progress = useMotionValue(0);
  const playing = inView;
  const act = ACTS[index];

  /** The one clock. Resumes from wherever it was paused rather than restarting,
      so scrolling the scroll out of view and back doesn't replay an act.
      It runs under reduced motion too - `reduced` decides *how* each act draws
      itself, not whether she gets to see it. With no controls left, stopping
      the clock there would strand her on act 1 and hide two thirds of the
      offer. Each act instead settles instantly and cross-fades. */
  useEffect(() => {
    if (!playing) return;
    const remaining = ACTS[index].hold * (1 - progress.get());
    const controls = animate(progress, 1, {
      duration: Math.max(0.4, remaining / 1000),
      ease: "linear",
      onComplete: () => {
        progress.set(0);
        setIndex((i) => (i + 1) % ACTS.length);
      },
    });
    return () => controls.stop();
  }, [playing, index, progress, reduced]);

  return (
    <div
      className={cn("px-4 pt-3", className)}
      role="img"
      aria-label={
        `${firstName ? `${firstName}'s` : "Your"} personalized ${PLAN_WEEKS} week plan: ` +
        `four small things to do each day - ${PLAN_PILLARS.map((p) => p.label.toLowerCase()).join(", ")} - ` +
        `across ${PLAN_WEEKS} weeks in three phases, designed to help you ${goalLabel}.`
      }
    >
      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none relative mx-auto w-full max-w-[340px] select-none"
      >
        <Image
          src="/illustrations/offer.webp"
          alt=""
          width={1024}
          height={1536}
          sizes={SCROLL_SIZES}
          className="w-full h-auto"
          draggable={false}
          priority
        />

        {/* Act 1 - written on the paper itself. */}
        <AnimatePresence>
          {act.id === "plan" && (
            <SealedScroll key="sealed" firstName={firstName} goalLabel={goalLabel} reduced={reduced} />
          )}
        </AnimatePresence>

        {/* Acts 2 and 3 - one phone, two screens. It stays mounted between them
            so only the screen slides; it re-enters from behind the roll each
            time the loop comes back around. */}
        <div className="absolute inset-x-0 top-[18%] z-10 flex justify-center">
          <AnimatePresence>
            {act.id !== "plan" && (
              <PhoneMock
                key="phone"
                screen={act.id}
                reduced={reduced}
                playing={playing}
                goalLabel={goalLabel}
                progress={progress}
              />
            )}
          </AnimatePresence>
        </div>

        {/* The scroll's bottom roll, painted back on top. Same src and sizes as
            the base image, so it's the same cached file, not a second download.
            `loading="eager"` rather than `priority` - it must not lazy-load
            (the phone would float over unpainted paper for a frame) but it
            must not add a second preload link for a file already preloaded. */}
        <div className="absolute inset-0 z-20" style={{ clipPath: BOTTOM_ROLL_CLIP }}>
          <Image
            src="/illustrations/offer.webp"
            alt=""
            width={1024}
            height={1536}
            sizes={SCROLL_SIZES}
            className="w-full h-auto"
            draggable={false}
            loading="eager"
          />
        </div>
      </div>

      {/* Progress. A read-out, not a control - it tells her the scroll is
          playing and roughly how long the act has left. */}
      <div aria-hidden className="mt-4 flex items-center justify-center gap-2.5">
        {ACTS.map((a, i) => (
          <span key={a.id} className="block h-1 w-8 overflow-hidden rounded-full bg-[#E8DDD9] sm:w-10">
            {i === index ? (
              <motion.span
                className="block h-full w-full origin-left rounded-full bg-primary"
                style={{ scaleX: progress }}
              />
            ) : (
              <span
                className={cn(
                  "block h-full origin-left rounded-full bg-primary transition-[width] duration-300",
                  i < index ? "w-full" : "w-0"
                )}
              />
            )}
          </span>
        ))}
      </div>

      {/* One line, so the reserved height is one line. */}
      <div aria-hidden className="relative min-h-[20px] px-2">
        <AnimatePresence initial={false}>
          <motion.p
            key={act.id}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduced ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 text-center text-[10px] leading-snug text-[#9A9A9A]"
          >
            {act.caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Read a value off the act clock, re-rendering only when it actually changes.
 * Every derived beat in here goes through this - it's the difference between
 * 4 renders an act and one per frame.
 */
function useActBeat<T>(progress: MotionValue<number>, hold: number, derive: (elapsed: number) => T): T {
  const [value, setValue] = useState(() => derive(progress.get() * hold));
  useMotionValueEvent(progress, "change", (p) => {
    const next = derive(p * hold);
    setValue((prev) => (Object.is(prev, next) ? prev : next));
  });
  return value;
}

/* ── Act 1: the sealed scroll ───────────────────────────────────────────── */

/** Her name written onto the plan, letter by letter in script - the made-for-you
    moment, and the reason this reads as her plan rather than a program she has
    to fit into. */
function SealedScroll({
  firstName,
  goalLabel,
  reduced,
}: {
  firstName?: string;
  goalLabel: string;
  reduced: boolean;
}) {
  const fade = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div
      initial={reduced ? "show" : "hidden"}
      animate="show"
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.13, delayChildren: 0.14 } } }}
      transition={{ duration: 0.26 }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-[15%] py-[19%] text-center"
      style={{ color: INK }}
    >
      {/* A wax seal, not the reward illustration - this scroll carries her name,
          so the crest has to read as her plan being sealed, and it has to
          survive at 80px. */}
      <motion.div variants={fade} className="mb-1.5">
        <Image
          src="/illustrations/plan-preview.webp"
          alt=""
          width={500}
          height={500}
          sizes="64px"
          className="w-14 h-auto select-none drop-shadow-lg"
          draggable={false}
        />
      </motion.div>

      <motion.span
        variants={fade}
        className="mb-1.5 text-[8px] uppercase tracking-[0.24em] opacity-70 sm:text-[9px]"
        style={{ fontFamily: "var(--font-lora)" }}
      >
        Your Personalized {PLAN_WEEKS} Week Plan
      </motion.span>

      {/* Letter by letter, on opacity/transform only. This used to animate a
          per-letter blur, which is a filter repaint per glyph per frame. */}
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        className="flex"
      >
        {(firstName || "You").split("").map((ch, i) => (
          <motion.span
            key={`${ch}-${i}`}
            variants={{
              hidden: { opacity: 0, y: 12, rotate: -5 },
              show: {
                opacity: 1,
                y: 0,
                rotate: 0,
                transition: { type: "spring", stiffness: 300, damping: 24 },
              },
            }}
            className="font-script text-4xl leading-none sm:text-5xl"
          >
            {ch === " " ? " " : ch}
          </motion.span>
        ))}
      </motion.div>

      <motion.div variants={fade} className="my-2 h-px w-12" style={{ background: INK, opacity: 0.4 }} />

      <motion.p
        variants={fade}
        className="max-w-[92%] text-[11px] italic leading-snug sm:text-xs"
        style={{ fontFamily: "var(--font-lora)" }}
      >
        Designed to help you {goalLabel}.
      </motion.p>

      <motion.div variants={fade} className="mt-3 flex flex-col items-center">
        <span className="font-script text-xl leading-none sm:text-2xl">Lisa</span>
      </motion.div>
    </motion.div>
  );
}

/* ── Acts 2 and 3: the phone ────────────────────────────────────────────── */

/**
 * Everything inside the phone is sized in `cqw` against the frame's own width,
 * so the mock is one design that scales with the scroll instead of a px layout
 * that overflows on a 320px screen.
 *
 * The two screens always travel the same way (out left, in from right) because
 * the loop only ever runs forwards now.
 */
const screenVariants = {
  enter: { opacity: 0, x: "24%" },
  center: { opacity: 1, x: "0%" },
  exit: { opacity: 0, x: "-24%" },
};

function PhoneMock({
  screen,
  reduced,
  playing,
  goalLabel,
  progress,
}: {
  screen: Exclude<ActId, "plan">;
  reduced: boolean;
  playing: boolean;
  goalLabel: string;
  progress: MotionValue<number>;
}) {
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 110, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 110, scale: 0.94 }}
      transition={
        reduced
          ? { duration: 0.2 }
          : { type: "spring", stiffness: 190, damping: 24, mass: 0.8, opacity: { duration: 0.22 } }
      }
      style={{ containerType: "inline-size" }}
      className="w-[56%]"
    >
      {/* The frame runs from just under the top roll to just above the paper's
          bottom edge: any taller and it pokes out below the scroll, any shorter
          and its bottom edge shows instead of tucking behind the roll. */}
      <div className="rounded-[13cqw] bg-[#2C2420] p-[1.6cqw] shadow-[0_16px_34px_-12px_rgba(61,43,26,0.6)]">
        <div
          className="relative overflow-hidden rounded-[11.4cqw] bg-[#FFFCF8] [-webkit-text-size-adjust:100%]"
          style={{ aspectRatio: "9 / 17.8" }}
        >
          <StatusBar />
          <AnimatePresence initial={false}>
            <motion.div
              key={screen}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex flex-col px-[5.5cqw] pt-[12cqw] pb-[4cqw]"
            >
              {screen === "today" ? (
                <TodayScreen reduced={reduced} progress={progress} />
              ) : (
                <WeeksScreen
                  reduced={reduced}
                  playing={playing}
                  goalLabel={goalLabel}
                  progress={progress}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/** Decorative iOS status bar. Sits above the screens and never changes, so the
    two screens read as one device rather than two pictures. */
function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-[6cqw] pt-[3.4cqw] text-[#3D3D3D]">
      <span className="text-[3.4cqw] font-bold tracking-tight">9:41</span>
      <span className="flex items-center gap-[1.4cqw] opacity-70">
        <span className="flex items-end gap-[0.5cqw]">
          {[1.4, 2, 2.6, 3.2].map((h) => (
            <span key={h} className="w-[0.9cqw] rounded-[0.4cqw] bg-current" style={{ height: `${h}cqw` }} />
          ))}
        </span>
        <span className="relative block h-[3.2cqw] w-[6cqw] rounded-[1cqw] border-[0.5cqw] border-current">
          <span className="absolute inset-[0.6cqw] rounded-[0.4cqw] bg-current" />
        </span>
      </span>
    </div>
  );
}

/* ── Act 2: today ───────────────────────────────────────────────────────── */

const TODAY_HOLD = ACTS[1].hold;

/** Today's four tasks, ticking themselves off one a beat. This is the product
    in one gesture - the same list, the same check, the same "day one, done" the
    tracker gives her. */
function TodayScreen({ reduced, progress }: { reduced: boolean; progress: MotionValue<number> }) {
  const total = PLAN_PILLARS.length;
  const done = useActBeat(progress, TODAY_HOLD, (elapsed) => {
    if (reduced) return total;
    return Math.min(total, Math.max(0, Math.floor((elapsed - TICK_START_MS) / TICK_EVERY_MS) + 1));
  });
  const allDone = done === total;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[3.2cqw] font-bold uppercase tracking-[0.2em] text-primary">
            Week 1 of {PLAN_WEEKS}
          </p>
          <h3 className="text-[8cqw] font-extrabold uppercase leading-none tracking-tight text-[#3D3D3D]">
            Today
          </h3>
        </div>
        <span className="text-[3.6cqw] font-bold tabular-nums text-[#B9AEA6]">
          {done}/{total}
        </span>
      </div>

      <div className="mt-[2.6cqw] flex gap-[1.6cqw]">
        {PLAN_PILLARS.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              "h-[1.6cqw] flex-1 rounded-full transition-colors duration-300",
              i < done ? "bg-primary" : "bg-[#EFE4DC]"
            )}
          />
        ))}
      </div>

      <ul className="mt-[3.4cqw] flex flex-col gap-[3.4cqw]">
        {PLAN_PILLARS.map((p, i) => {
          const isDone = i < done;
          return (
            <motion.li
              key={p.key}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.22 + i * 0.07, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex w-full items-center gap-[3.2cqw] rounded-[4.6cqw] border px-[3.6cqw] py-[4cqw] text-left transition-colors duration-200",
                isDone ? "border-primary/35 bg-primary/8" : "border-[#EFE4DC] bg-white"
              )}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-[3.4cqw] transition-opacity duration-200",
                  "h-[13.5cqw] w-[13.5cqw]",
                  p.chip,
                  isDone && "opacity-55"
                )}
              >
                <p.icon className={cn("h-[7.4cqw] w-[7.4cqw]", p.tint)} strokeWidth={2.2} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[4.4cqw] font-bold leading-tight transition-colors duration-200",
                    isDone ? "text-[#B9AEA6] line-through" : "text-[#3D3D3D]"
                  )}
                >
                  {p.label}
                </span>
                <span className="block truncate text-[3.6cqw] leading-tight text-[#B0A69E]">
                  {p.task}
                </span>
              </span>

              <span
                className={cn(
                  "grid h-[8.4cqw] w-[8.4cqw] shrink-0 place-items-center rounded-full border-[0.9cqw] transition-colors duration-200",
                  isDone ? "border-primary bg-primary" : "border-[#E3D8D0] bg-white"
                )}
              >
                <AnimatePresence>
                  {isDone && (
                    <motion.span
                      initial={reduced ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 620, damping: 26 }}
                    >
                      <Check className="h-[4.4cqw] w-[4.4cqw] text-white" strokeWidth={4} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </motion.li>
          );
        })}
      </ul>

      {/* Fixed height so a row ticking off never moves the rows above it. */}
      <div className="relative mt-[3.4cqw] h-[10cqw]">
        <AnimatePresence initial={false} mode="wait">
          {allDone && (
            <motion.p
              key="done"
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="absolute inset-x-0 flex items-center justify-center gap-[1.6cqw] rounded-[3.6cqw] bg-green-50 py-[2.4cqw] text-[3.8cqw] font-bold text-green-700 ring-1 ring-green-200"
            >
              <Sparkles className="h-[4.2cqw] w-[4.2cqw]" strokeWidth={2.4} />
              That&apos;s day one, done.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ── Act 3: the eight weeks ─────────────────────────────────────────────── */

const WEEKS_HOLD = ACTS[2].hold;

/** The 56 dots, precomputed once at module scope: which week they belong to,
    what color they land on, and when. Nothing in here depends on props. */
const PLAN_DAY_DOTS = Array.from({ length: PLAN_WEEKS }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => ({
    color: planPhaseForWeek(w + 1).dot,
    delay: FILL_START_MS + (w * 7 + d) * FILL_STEP_MS,
  }))
);

/** 56 days filling in, week by week, through the three phases. The payoff for
    act 2: this is what those four taps a day add up to. The dots are CSS (see
    `.plan-day`); only the week badge and the phase line come off the clock, and
    they re-render 8 times in the act rather than 56. */
function WeeksScreen({
  reduced,
  playing,
  goalLabel,
  progress,
}: {
  reduced: boolean;
  playing: boolean;
  goalLabel: string;
  progress: MotionValue<number>;
}) {
  const week = useActBeat(progress, WEEKS_HOLD, (elapsed) => {
    if (reduced) return PLAN_WEEKS;
    const day = Math.floor((elapsed - FILL_START_MS) / FILL_STEP_MS) + 1;
    return Math.min(PLAN_WEEKS, Math.max(1, Math.ceil(day / 7)));
  });
  const finished = useActBeat(
    progress,
    WEEKS_HOLD,
    (elapsed) => reduced || elapsed >= FILL_START_MS + FILL_SPAN_MS
  );
  const phase = planPhaseForWeek(week);

  const gridStyle = useMemo(
    () => ({ "--plan-day-play": playing ? "running" : "paused" }) as React.CSSProperties,
    [playing]
  );

  return (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[3.2cqw] font-bold uppercase tracking-[0.2em] text-primary">Your plan</p>
          <h3 className="text-[8cqw] font-extrabold uppercase leading-none tracking-tight text-[#3D3D3D]">
            {PLAN_WEEKS} weeks
          </h3>
        </div>
        <span className="rounded-full bg-[#F6EEE8] px-[2.6cqw] py-[1.2cqw] text-[3.4cqw] font-bold tabular-nums text-[#7A6C62]">
          Week {week}
        </span>
      </div>

      <div className="mt-[4.5cqw] flex flex-col gap-[3cqw]" style={gridStyle}>
        {PLAN_DAY_DOTS.map((days, w) => (
          <div key={w} className="flex items-center gap-[2.8cqw]">
            <span className="w-[6.5cqw] shrink-0 text-[3cqw] font-bold tabular-nums text-[#C6BAB1]">
              W{w + 1}
            </span>
            <div className="flex gap-[3cqw]">
              {days.map((dot, d) => (
                <span
                  key={d}
                  className={cn("plan-day h-[7.4cqw] w-[7.4cqw]", reduced && "plan-day--static")}
                  style={
                    {
                      "--plan-day-color": dot.color,
                      "--plan-day-delay": `${dot.delay}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed height so the phase line and the finish badge trade places
          without the grid above them moving. */}
      <div className="relative mt-[4cqw] h-[9cqw]">
        <AnimatePresence initial={false} mode="wait">
          {finished ? (
            <motion.p
              key="done"
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
              className="absolute inset-x-0 flex items-center justify-center gap-[1.6cqw] rounded-[3.6cqw] bg-green-50 py-[2.2cqw] text-[3.9cqw] font-bold text-green-700 ring-1 ring-green-200"
            >
              <Check className="h-[4.2cqw] w-[4.2cqw]" strokeWidth={3.4} />
              {PLAN_WEEKS} weeks. Done.
            </motion.p>
          ) : (
            <motion.p
              key={phase.label}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 flex items-center justify-center gap-[2cqw] text-[3.9cqw] font-semibold text-[#5A5A5A]"
            >
              <span
                className="block h-[2.6cqw] w-[2.6cqw] rounded-full"
                style={{ background: phase.dot }}
              />
              {phase.label}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Her own finish line, under the arc. The eight weeks are only worth
          anything as the thing she said she wanted back. */}
      <p className="mt-[3cqw] rounded-[3.4cqw] bg-[#FBF4EE] px-[3cqw] py-[2.4cqw] text-center text-[3.5cqw] font-semibold leading-snug text-[#8A7A6E]">
        <span className="uppercase tracking-[0.16em] text-[#C0B0A2]">Goal </span>
        {goalLabel}
      </p>
    </>
  );
}
