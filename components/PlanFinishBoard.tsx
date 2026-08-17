"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { Flame, Heart, Moon, Sun } from "lucide-react";
import { PLAN_WEEKS } from "@/lib/pricing";
import {
  PLAN_DAYS,
  formatPlanDate,
  getOfferPromise,
  planFinishDate,
} from "@/lib/planTimeline";
import { getSymptomTransforms } from "@/lib/testimonials";
import { cn } from "@/lib/utils";

/**
 * Her finish line, as a physical instrument.
 *
 * This block used to be two dates either side of an arrow. It was accurate and
 * completely inert: "Aug 17 → Sun, Oct 12" asks her to do the picturing, and the
 * picturing is the entire job of the block. Directly under it sits a price, and
 * a price is only ever compared against a thing you can see.
 *
 * So it is drawn as the object it describes: a taped-down paper chart with a
 * needle that travels the eight weeks in front of her. The needle is the only
 * moving part, it moves left to right (the direction of time, and of reading),
 * and the track colours in behind it — rose where she is now, amber through the
 * middle, green at the finish. Three pins along the way light as it passes them,
 * and the caption under the chart swaps to whatever the needle is standing on.
 *
 * Two constraints shaped it, both about who is reading:
 *
 * - **It has to survive at a glance and at 45-60 eyesight.** One instrument, one
 *   pointer, one caption at a time. Every milestone is a colour and an icon
 *   before it is a word, so the shape of the promise lands before any of the
 *   copy is read.
 * - **It sits above the price card, which has to stay on screen when she
 *   lands.** Hence a horizontal chart rather than a dial: it says the same thing
 *   in about half the height, and a horizontal scale reads as a timeline where a
 *   dial reads as a score.
 *
 * The ends stay her own words — her worst symptom on the left, the goal she
 * picked on the right — and nothing else is written on it. It carried a header
 * until 2026-08-17 ("Linda's finish line" on the left, "{PLAN_DAYS} days ·
 * $1.05 a day" on the right); both are gone. The board is the outcome, and the
 * price card 100px below it already states the per-day figure, the total and
 * the renewal — restating the denominator here started the money conversation
 * on top of the one element that was purely about how she will feel.
 *
 * No projected score appears anywhere on it. See lib/planTimeline.ts for why.
 */

const subscribeToNothing = () => () => {};

/**
 * `false` on the server and through hydration, `true` after. The two dates are
 * timezone-dependent, so the server (UTC) and a visitor west of it can disagree
 * about what "today" is; only the date strings sit out hydration, the labels
 * around them are stable. useSyncExternalStore is the one hook that flips after
 * hydration without a mismatch warning.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

type Stage = {
  /** Where on the track this stage begins, 0-1. */
  at: number;
  /** Week number shown on the pin. `null` for the "now" stage, which is the
   *  left-hand end of the track rather than a pin on it. */
  week: number | null;
  icon: typeof Moon;
  /** Caption shown while the needle stands on this stage. */
  text: string;
  /** Track colour at this stage — the pin, the caption chip and the needle
   *  badge all take it, so the whole instrument agrees at every position. */
  color: string;
  soft: string;
};

/**
 * The four stages, in order. Both ends are hers where we have the answers: the
 * "now" caption is the before-line for her #1 symptom, and week 8 is the promise
 * attached to the goal she chose. The two middle weeks are the same for everyone
 * — they describe the plan's shape, not her — and are deliberately modest: the
 * claim is that habits settle and energy steadies, not that anything is cured.
 */
function buildStages(topProblems?: string[], goal?: string[]): Stage[] {
  const transform = getSymptomTransforms(topProblems ?? [], 1)[0];
  const finish =
    transform?.after ?? (goal && goal.length > 0 ? getOfferPromise(goal) : "Feeling like yourself again");

  return [
    {
      at: 0,
      week: null,
      icon: Flame,
      text: transform?.before ?? "Where you are today",
      color: "#F43F5E",
      soft: "#FFE4E9",
    },
    {
      at: 0.25,
      week: 2,
      icon: Moon,
      text: "Habits stick. Nights start to settle.",
      color: "#F59E0B",
      soft: "#FEF3C7",
    },
    {
      at: 0.55,
      week: 4,
      icon: Sun,
      text: "Steadier energy through the afternoon.",
      color: "#84CC16",
      soft: "#ECFCCB",
    },
    {
      at: 1,
      week: PLAN_WEEKS,
      icon: Heart,
      text: finish,
      color: "#16A34A",
      soft: "#DCFCE7",
    },
  ];
}

/** Which stage the needle is standing on. */
function stageAt(stages: Stage[], t: number) {
  let index = 0;
  for (let i = 0; i < stages.length; i += 1) {
    // A pin lights just before the needle reaches it, so the caption changes as
    // the needle arrives rather than a beat after it has already passed.
    if (t >= stages[i].at - 0.03) index = i;
  }
  return index;
}

export function PlanFinishBoard({
  topProblems,
  goal,
  className,
}: {
  topProblems?: string[];
  goal?: string[];
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [stages] = useState(() => buildStages(topProblems, goal));

  // Resolved once per mount rather than per render, so a re-render at midnight
  // can't move her finish line by a day mid-session.
  const [start] = useState(() => new Date());
  const finish = planFinishDate(start);
  const hydrated = useHydrated();
  const startLabel = formatPlanDate(start);
  const finishLabel = formatPlanDate(finish, true);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(boardRef, { amount: 0.4 });

  // Reduced motion gets the finished chart rather than a still of the starting
  // line — with nothing moving, the only honest frame is the one where the
  // needle has arrived. It is gated on `hydrated` because useReducedMotion reads
  // false on the server and through hydration: branching the *first* render on
  // it renders "Today" on the server and "Week 8" on the client, which is a
  // hydration mismatch.
  const still = hydrated && Boolean(prefersReducedMotion);

  // 0 at today, 1 at week 8. Everything on the chart is a function of it.
  const sweep = useMotionValue(0);
  // A real needle has mass: it overshoots its mark slightly and settles. The
  // spring is what makes the thing read as an instrument rather than a progress
  // bar, so the fill and the needle both ride it.
  const needle = useSpring(sweep, { stiffness: 55, damping: 13, mass: 0.7 });
  // Clamped: the spring overshoots past 1 on arrival by design, but the needle
  // must not walk off the end of its own track.
  const position = useTransform(needle, (v) => `${Math.min(1, Math.max(0, v)) * 100}%`);

  const [travellingIndex, setIndex] = useState(0);
  const [travellingWeek, setWeek] = useState(0);
  const index = still ? stages.length - 1 : travellingIndex;
  const week = still ? PLAN_WEEKS : travellingWeek;

  // The caption only advances while the needle is travelling forward. On the
  // return stroke it would otherwise flick back through green → amber → rose in
  // half a second, which reads as a glitch rather than a reset.
  const last = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion) return;
    const unsubscribe = needle.on("change", (v) => {
      const returning = v < last.current - 0.002;
      last.current = v;
      const t = Math.min(1, Math.max(0, v));
      if (returning) {
        if (t < 0.08) {
          setIndex(0);
          setWeek(0);
        }
        return;
      }
      setIndex((prev) => {
        const next = stageAt(stages, t);
        return next === prev ? prev : next;
      });
      setWeek((prev) => {
        const next = Math.round(t * PLAN_WEEKS);
        return next === prev ? prev : next;
      });
    });
    return unsubscribe;
  }, [needle, stages, prefersReducedMotion]);

  // Runs only while the chart is actually on screen: it is an idle loop on a
  // page she may sit on for minutes, and an off-screen animation is battery she
  // is spending for nothing.
  useEffect(() => {
    if (prefersReducedMotion) {
      // Park the needle on the finish line. Motion values are not React state,
      // so this is safe to do from an effect.
      sweep.set(1);
      needle.jump(1);
      return;
    }
    if (!inView) return;
    const controls = animate(sweep, [0, 0, 1, 1, 0], {
      duration: 8.2,
      times: [0, 0.07, 0.55, 0.88, 1],
      ease: ["linear", [0.4, 0, 0.2, 1], "linear", [0.6, 0, 0.3, 1]],
      repeat: Infinity,
      repeatDelay: 0.4,
    });
    return () => controls.stop();
  }, [sweep, needle, inView, prefersReducedMotion]);

  const active = stages[index];

  return (
    <motion.div
      ref={boardRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.26 }}
      className={cn(
        // pt-5 rather than pt-3: with the header line gone the week pins would
        // otherwise start directly under the tape strips, which overhang 10px
        // into the card.
        "relative rounded-2xl border px-3.5 pt-5 pb-3 mb-2.5 shadow-sm",
        className
      )}
      style={{
        borderColor: "#E8DDD9",
        // Paper: warm white, faintly ruled. The rules are what make it read as a
        // chart pinned to a board rather than another rounded card in a stack of
        // rounded cards.
        backgroundColor: "#FFFDF8",
        backgroundImage:
          "repeating-linear-gradient(180deg, transparent 0 23px, rgba(61,61,61,0.045) 23px 24px)",
      }}
    >
      {/* Tape, holding the paper down. Two strips, both tilted, both translucent
          — the cheapest possible cue that this is an object and not a widget. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 left-5 h-4 w-11 -rotate-6 rounded-[2px]"
        style={{ background: "rgba(255,235,118,0.55)", boxShadow: "0 1px 2px rgba(61,61,61,0.12)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 right-5 h-4 w-11 rotate-6 rounded-[2px]"
        style={{ background: "rgba(255,235,118,0.55)", boxShadow: "0 1px 2px rgba(61,61,61,0.12)" }}
      />

      {/* ── The chart. Aria-hidden in full: it is an animation, and a caption
             that swaps every two seconds is noise to a screen reader. The same
             content is announced once, statically, at the bottom. ─────────── */}
      <div aria-hidden className="px-5">
        {/* Pins. Positioned by their own `at`, so moving a milestone moves its
            pin, its caption and the colour of the track under it together. */}
        <div className="relative h-9">
          {stages.slice(1).map((stage, i) => {
            const lit = index >= i + 1;
            return (
              <div
                key={stage.week}
                className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${stage.at * 100}%` }}
              >
                <motion.span
                  animate={{
                    scale: lit ? 1 : 0.82,
                    opacity: lit ? 1 : 0.45,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 18 }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white"
                  style={{
                    background: lit ? stage.color : "#E8DDD9",
                    boxShadow: lit ? `0 4px 12px ${stage.color}55` : "none",
                  }}
                >
                  <stage.icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                </motion.span>
                <span
                  className="mt-0.5 text-[9px] font-bold uppercase tracking-wide tabular-nums"
                  style={{ color: lit ? stage.color : "#B5ADA9" }}
                >
                  Wk {stage.week}
                </span>
              </div>
            );
          })}
        </div>

        {/* Needle + track. One relative box so the needle's stem can run from
            its badge down to the knob sitting on the track. */}
        <div className="relative h-[54px]">
          {/* Track, at the bottom of the box. The gradient is painted full width
              and *revealed* by the needle rather than stretched behind it, so
              week 8 is green at every position — the colours belong to the
              weeks, not to how far the needle has got. */}
          <div className="absolute inset-x-0 bottom-2 h-3 rounded-full overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, #F43F5E 0%, #FB923C 26%, #F59E0B 46%, #84CC16 72%, #16A34A 100%)",
              }}
            />
            {/* Everything ahead of the needle is unpainted paper. */}
            <motion.div
              className="absolute inset-y-0 right-0 bg-[#EDE4DF]"
              style={{ left: position }}
            />
            {/* Week ticks, over both layers. */}
            <div className="absolute inset-0 flex justify-between px-[1px]">
              {Array.from({ length: PLAN_WEEKS + 1 }).map((_, i) => (
                <span
                  key={i}
                  className="w-px h-full"
                  style={{ background: i === 0 || i === PLAN_WEEKS ? "transparent" : "rgba(255,255,255,0.55)" }}
                />
              ))}
            </div>
          </div>

          {/* The needle itself: a badge that reads the week, a stem, and a knob
              riding the track. */}
          <motion.div className="absolute inset-y-0 z-10" style={{ left: position }}>
            <div className="h-full -translate-x-1/2 flex flex-col items-center pb-[7px]">
              <motion.span
                animate={{ backgroundColor: active.color }}
                transition={{ duration: 0.35 }}
                className="rounded-full px-2 py-[3px] text-[10px] font-extrabold text-white whitespace-nowrap tabular-nums shadow-md"
              >
                {week === 0 ? "Today" : `Week ${week}`}
              </motion.span>
              <span className="w-[2px] flex-1 bg-[#3D3D3D]" />
              <span className="h-3.5 w-3.5 rounded-full bg-[#3D3D3D] ring-2 ring-white shadow-[0_2px_6px_rgba(61,61,61,0.45)]" />
            </div>
          </motion.div>
        </div>

        {/* The two ends, in dates. Non-breaking spaces hold the row's height
            through hydration. */}
        <div className="flex items-start justify-between -mt-1">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide text-[#B5ADA9]">Today</p>
            <p className="text-sm font-bold text-[#7A7A7A] leading-tight tabular-nums">
              {hydrated ? startLabel : " "}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-wide text-green-600">Finish</p>
            <p className="text-sm font-extrabold text-green-700 leading-tight tabular-nums">
              {hydrated ? finishLabel : " "}
            </p>
          </div>
        </div>
      </div>

      {/* The caption the needle is standing on.
          Fixed height, so a longer sentence can't shift the price card
          underneath it mid-animation.

          It sits *outside* the chart's `px-5` inset and is held to a single
          line, because a caption that wraps to two lines on one stage and one
          on the next makes the whole board jump every couple of seconds - and
          it changes four times per loop. The chart's inset exists so the
          needle's badge has room to hang off either end; the caption has no
          such constraint, so it gets the full card width. `nowrap` guarantees
          the rule, and the clamped size is what makes the guarantee free: the
          longest string here is ~41 characters, which fits at 10px on a 320px
          screen and grows to 12px once the card has the room. */}
      <div aria-hidden className="mt-2 min-h-[34px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-2 py-2",
              index === 0 ? "" : "font-semibold"
            )}
            style={{ background: active.soft }}
          >
            <active.icon className="h-3.5 w-3.5 shrink-0" style={{ color: active.color }} strokeWidth={2.5} />
            <span className="text-[clamp(10px,2.9vw,12px)] leading-snug text-[#3D3D3D] whitespace-nowrap">
              {active.text}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Announced once, in order, instead of the chart. */}
      <p className="sr-only">
        Your plan runs {PLAN_DAYS} days, from {startLabel} to {finishLabel}.{" "}
        {stages
          .map((stage) => {
            // Her own before/after lines have no terminal stop; the two middle
            // captions do. Adding one unconditionally reads out as "settle dot
            // dot" on a screen reader.
            const end = /[.!?]$/.test(stage.text) ? "" : ".";
            return `${stage.week === null ? "Today" : `Week ${stage.week}`}: ${stage.text}${end}`;
          })
          .join(" ")}
      </p>
    </motion.div>
  );
}
