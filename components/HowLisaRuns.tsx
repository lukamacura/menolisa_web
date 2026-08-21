"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * How the plan actually gets run - the loop, played.
 *
 * This block used to be three icon rows with a title and a line of body copy
 * each: a feature list. A feature list answers "what do you get", and by this
 * point in the funnel she has already been shown that (block 1 is the plan
 * itself, with real app shots). What she has *not* been told is what the days
 * are like - what she does, what Lisa does, and in what order. That is a
 * sequence, so it is drawn as one.
 *
 * Four steps, one lit at a time, on a rail that travels downward between them
 * and then rewinds. The rewind is the point: steps 2-4 are a loop she lives
 * every day for {PLAN_WEEKS} weeks, not a checklist she completes once.
 *
 * Rules it shares with `<PlanStage />`, for the same reasons:
 *
 * - **It is a film, not a widget.** Nothing is tappable or focusable; there is
 *   no "next". A control here would steal taps from the CTA.
 * - **It only runs while she can see it** (`useInView`), and it is one
 *   `setTimeout` per step - four state changes a loop, no per-frame work in
 *   React. Everything that moves is a transform or an opacity, handed to the
 *   compositor once per step.
 * - **Nothing moves that she has to read.** The titles and bodies are static
 *   and full-contrast the whole time; the animation is the highlight, the rail
 *   and the badges. A step she has not reached yet is still legible, so a woman
 *   who scrolls past mid-loop misses nothing.
 * - **No blur.** Opacity, transform and color only.
 *
 * ── Why the rail travels rather than snaps ──────────────────────────────────
 *
 * It used to fill a segment in 0.45s *after* the step it belonged to had
 * finished, which put a 2.6s pause between every movement: the sequence read as
 * four separate reveals with dead air in them. The fill now runs the length of
 * the step it sits under, linearly, so the line is always descending and lands
 * on the next badge at the exact moment that badge lights. One continuous
 * motion, one animation per step.
 *
 * The rewind is deliberately hung on the *last* step rather than on the restart.
 * Emptying the rail at the moment step 1 relights would read as a glitch - two
 * things changing on the same frame in opposite directions. Doing it under "and
 * she's there at 2am", bottom segment first, is the loop visibly resetting for
 * tomorrow while she is reading the beat that says so.
 *
 * ── Why the spotlight carries its own radius and ring ───────────────────────
 *
 * The travelling highlight is a shared-layout element (`layoutId`), so it
 * measures the rows itself - the steps can have one-line or three-line bodies
 * and it still lands exactly on them, with no fixed pixel geometry to re-tune
 * when the copy changes length. But framer plays a layout animation as a
 * *scale* projection, and a scaled box distorts its own corners and its own
 * outline - rows differ in height here, so every move is a scale. framer
 * corrects `borderRadius` and `boxShadow` for exactly this, and it can only
 * correct values it owns: a `rounded-2xl` / `ring-1` pair is invisible to it.
 * Both are therefore inline style values. Do not move them back into
 * `className`.
 *
 * The rail segments live *inside* each row and stretch across the list gap with
 * a negative bottom margin, for the same no-fixed-geometry reason.
 */

/** How long each step holds. The last one holds longer - it is the beat before
    the loop restarts, and a restart that lands too fast reads as a glitch
    rather than as "and again tomorrow". */
const STEP_MS = 2600;
const LAST_STEP_MS = 3600;

/** The spotlight's corner radius, in px. Inline rather than `rounded-2xl` so
    framer can scale-correct it while the pill is travelling - see above. */
const SPOTLIGHT_RADIUS = 16;
/** Its hairline, as an inset shadow for the same reason a `ring-*` class can't
    be used: framer corrects `boxShadow` under projection, and corrects nothing
    it cannot see. Literal rgb rather than `var(--primary)` or a `color-mix()`
    on purpose - the corrector parses the shadow string number by number, and a
    CSS function with a percentage in it hands it a number that is not a
    length. This is `--primary` (oklch 0.6209 0.1801 348.14) resolved. */
const SPOTLIGHT_RING = "inset 0 0 0 1px rgba(208, 79, 153, 0.20)";

type Step = { title: string; body: string };

function buildSteps(topLabel: string): Step[] {
  return [
    {
      title: "It all lives in one app",
      body: `Your ${PLAN_WEEKS}-week plan, a habit tracker and a symptom tracker - already filled in, nothing to set up.`,
    },
    {
      title: "You tick off today",
      body: "Four small things, and one tap for how you felt. Two minutes, and you're done.",
    },
    {
      title: "Lisa reads what you logged",
      body: `She rewrites next week around your ${topLabel} - so the plan follows you, not a template.`,
    },
    {
      title: "And she's there at 2am",
      body: "Ask her anything, any hour. Straight answers, no waiting room.",
    },
  ];
}

export function HowLisaRuns({
  topLabel,
  className,
}: {
  /** Her worst symptom, lowercased, as it reads after "around your …". */
  topLabel: string;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const steps = useMemo(() => buildSteps(topLabel), [topLabel]);
  const lastIndex = steps.length - 1;

  const listRef = useRef<HTMLOListElement | null>(null);
  const inView = useInView(listRef, { amount: 0.4 });

  const [cursor, setCursor] = useState(0);
  /* Under reduced motion the loop never runs, so it settles on the last step:
     every rail filled, every badge lit. She gets the whole sequence at once
     instead of being stranded on step 1 with three greyed-out rows. Derived
     rather than seeded into `useState`, because `useReducedMotion()` is false
     on the first render of a server-rendered tree - a state initializer would
     read it before it is true and strand exactly the visitor it is for. */
  const active = reduced ? lastIndex : cursor;

  useEffect(() => {
    if (reduced || !inView) return;
    const t = setTimeout(
      () => setCursor((i) => (i + 1) % steps.length),
      cursor === lastIndex ? LAST_STEP_MS : STEP_MS
    );
    return () => clearTimeout(t);
  }, [cursor, inView, reduced, steps.length, lastIndex]);

  /* The last step is when the rail empties for tomorrow - see the docstring.
     Never under reduced motion, where "the last step" is the resting state. */
  const rewinding = !reduced && active === lastIndex;

  return (
    <ol
      ref={listRef}
      className={cn(
        "relative flex flex-col gap-4 rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 shadow-md shadow-primary/5",
        className
      )}
    >
      {steps.map((step, i) => {
        const isActive = i === active;
        const isPast = i < active;
        const isLast = i === lastIndex;
        /* Filled once its step has been reached, and *reaching* 1 across the
           step it sits under - so segment `i` is mid-travel exactly while step
           `i` is being read. */
        const railFilled = !rewinding && i <= active;

        return (
          <li key={step.title} className="relative flex gap-3">
            {/* The travelling highlight. One element for the whole list - it
                slides between rows rather than fading in and out, which is what
                makes four separate rows read as one moving sequence. */}
            {isActive && (
              <motion.span
                aria-hidden
                layoutId="how-lisa-runs-spotlight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        opacity: { duration: 0.25, ease: "easeOut" },
                        // Critically damped: the pill must arrive under the row
                        // it is lighting and stop. An overshoot here reads as a
                        // wobble on a card that is making a promise.
                        layout: { type: "spring", stiffness: 230, damping: 32, mass: 0.85 },
                      }
                }
                className="absolute -inset-x-2 -inset-y-1.5 bg-primary/6"
                style={{ borderRadius: SPOTLIGHT_RADIUS, boxShadow: SPOTLIGHT_RING }}
              />
            )}

            {/* Badge column. `items-center` puts the rail on the badge's axis,
                and the rail is `flex-1` so it measures itself. */}
            <div aria-hidden className="relative flex w-7 shrink-0 flex-col items-center">
              <motion.span
                // Scale, not size: a transform costs the compositor nothing and
                // cannot reflow the row it is sitting in.
                animate={{ scale: isActive && !reduced ? 1.06 : 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 380, damping: 24, mass: 0.6 }
                }
                className={cn(
                  "relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums transition-colors duration-500",
                  isActive
                    ? "bg-primary text-white shadow-sm shadow-primary/30"
                    : isPast
                      ? "bg-primary/15 text-primary"
                      : "bg-[#F4EBE4] text-[#B9AEA6]"
                )}
              >
                {i + 1}
                {/* One soft ring, breathing, on the step being spoken. */}
                {isActive && !reduced && (
                  <motion.span
                    className="absolute inset-0 rounded-full ring-2 ring-primary"
                    initial={{ opacity: 0.45, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.7 }}
                    transition={{ duration: 1.5, ease: "easeOut", repeat: Infinity }}
                  />
                )}
              </motion.span>

              {/* The rail. `-mb-4` cancels the list gap so the segments join up
                  into one continuous line; the fill inside it descends across
                  the step it belongs to and rewinds under the last one. */}
              {!isLast && (
                <span className="relative mt-1.5 -mb-4 w-px flex-1 overflow-hidden rounded-full bg-[#EFE4DC]">
                  <motion.span
                    className="absolute inset-0 origin-top rounded-full bg-primary/40"
                    initial={false}
                    animate={{ scaleY: railFilled ? 1 : 0 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : rewinding
                          ? {
                              // Bottom segment first, so the line retracts the
                              // way it was drawn.
                              duration: 0.55,
                              ease: [0.4, 0, 0.2, 1],
                              delay: (lastIndex - 1 - i) * 0.08,
                            }
                          : isActive
                            // Linear and exactly as long as the step: the line
                            // is a clock, and a clock that eases is a clock
                            // that lies about where it is.
                            ? { duration: STEP_MS / 1000, ease: "linear" }
                            : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
                    }
                  />
                </span>
              )}
            </div>

            <div className="relative min-w-0 pb-0.5">
              <p className="text-xs font-bold text-[#3D3D3D] leading-tight">{step.title}</p>
              <p className="text-[11px] text-[#5A5A5A] leading-snug mt-0.5">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
