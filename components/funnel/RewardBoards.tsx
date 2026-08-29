"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Dumbbell, Footprints, Moon, Utensils, Zap } from "lucide-react";
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
 */

const PAPER = {
  borderColor: "#E8DDD9",
  backgroundColor: "#FFFDF8",
  backgroundImage:
    "repeating-linear-gradient(180deg, transparent 0 23px, rgba(61,61,61,0.045) 23px 24px)",
} as const;

/** Shared shell: paper, tape, a header rule. */
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
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 10, rotate: -0.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative w-full max-w-sm mx-auto rounded-2xl border px-3 pt-5 pb-3 shadow-sm",
        className
      )}
      style={PAPER}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 left-6 h-4 w-11 -rotate-6 rounded-[2px]"
        style={{ background: "rgba(255,235,118,0.55)", boxShadow: "0 1px 2px rgba(61,61,61,0.12)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 right-6 h-4 w-11 rotate-6 rounded-[2px]"
        style={{ background: "rgba(255,235,118,0.55)", boxShadow: "0 1px 2px rgba(61,61,61,0.12)" }}
      />

      <div className="flex items-center justify-between gap-2 border-b border-dashed border-[#E0D5D0] pb-1.5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#B5ADA9]">
          {title}
        </p>
        {meta ? (
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-primary tabular-nums">
            {meta}
          </span>
        ) : null}
      </div>

      {children}
    </motion.div>
  );
}

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
  children,
  className,
}: {
  i: number;
  base?: number;
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
          : { type: "spring", stiffness: 320, damping: 26, delay: base + i * 0.13 }
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

/** The small pen-tick that lands on a finished row. */
function Tick({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      initial={reduced ? false : { scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 15, delay }}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-[#16A34A]"
    >
      <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
    </motion.span>
  );
}

/** The handwritten closing line every board ends on. */
function Signoff({ delay, children }: { delay: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.p
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : delay, duration: 0.4 }}
      className="mt-2.5 rounded-xl border border-primary/20 bg-primary/[0.07] px-3 py-2 text-center text-[12px] sm:text-[13px] font-semibold leading-snug text-[#3D3D3D]"
    >
      {children}
    </motion.p>
  );
}

/* ── Board 1: her symptoms, logged ─────────────────────────────────────────
 *
 * Was: one prevalence number, one symptom, three icon chips.
 *
 * Now: every symptom she picked gets its own line, with its own prevalence bar
 * filling behind it. The point of the screen is "we heard all of it and none of
 * it is your fault", and a list of four is the only shape that can say "all of
 * it". The bars are the same figures the old single number came from
 * (`SYMPTOM_PREVALENCE`), just shown per row instead of once.
 */
export type SymptomRow = { id: string; label: string; pct: number; Icon: LucideIcon };

export function SymptomLoadBoard({
  rows,
  cohort,
}: {
  rows: SymptomRow[];
  cohort: string;
}) {
  const reduced = useReducedMotion();
  return (
    <RewardPaper title="What you told Lisa" meta={`${rows.length} logged`}>
      <div className="mt-2 space-y-1.5">
        {rows.map((row, i) => (
          <Line key={row.id} i={i} className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/5 text-primary">
              <row.Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] font-bold text-[#3D3D3D]">{row.label}</span>
                <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-primary">
                  {row.pct}%
                </span>
              </span>
              {/* The bar is the "you are not the odd one out" argument, drawn.
                  It fills after its row has landed, so the eye reads the name
                  first and the size of the crowd second. */}
              <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-[#EDE4DF]">
                <motion.span
                  className="block h-full rounded-full bg-primary/70"
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${row.pct}%` }}
                  transition={
                    reduced ? { duration: 0 } : { duration: 0.7, delay: 0.34 + i * 0.13, ease: [0.22, 1, 0.36, 1] }
                  }
                />
              </span>
            </span>
            <Tick delay={0.42 + i * 0.13} />
          </Line>
        ))}
      </div>

      <p className="mt-2 border-t border-dashed border-[#E0D5D0] pt-1.5 text-[10px] leading-snug text-[#9A9A9A]">
        % = how many {cohort} report the same thing.
      </p>

      <Signoff delay={0.35 + rows.length * 0.13}>
        You&apos;re not broken. This is your <span className="font-extrabold">biology</span> — and
        every line above is <span className="font-extrabold">workable</span>.
      </Signoff>
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
  const bookendCls =
    "flex items-center justify-between gap-2 rounded-md bg-[#F3EDE9] px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-wide text-[#8C8279]";
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
