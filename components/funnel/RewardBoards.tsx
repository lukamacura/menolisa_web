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

/** The gap between one written line and the next, on every board. */
const LINE_STEP = 0.13;

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
   * This board is four blocks that have to arrive in a reading order - the list,
   * then the verdict on the list, then why, then the thing she does about it -
   * and a shared `base + i * LINE_STEP` cursor put two pairs of them on the same
   * frame: the START HERE chip landed with the mechanism line, and the payload
   * landed with the prevalence line. Two things moving at once on a 320px board
   * is one thing nobody reads.
   *
   * The steps are tighter than the other two boards' 0.13 (0.10 between rows,
   * and the rows are single-line now) because the meter has already spent 1.7s
   * in front of this. The payload is legible at ~1.0s and the whole page has
   * settled by ~1.2s, against ~1.3s for <TrainingWeekBoard />.
   */
  const ROWS_BASE = 0.14;
  const ROW_STEP = 0.1;
  const rowsEnd = ROWS_BASE + rows.length * ROW_STEP;
  const chipAt = rowsEnd;
  const mechAt = rowsEnd + 0.14;
  const pctAt = mechAt + 0.11;
  // The payload gets a beat of air in front of it. It is the only block on the
  // board she is asked to act on, and arriving on the same cadence as the rows
  // above would file it as one more line of the same list.
  const moveAt = pctAt + 0.18;
  const signAt = moveAt + 0.22;

  return (
    <RewardPaper title="Where to start" meta="worst first">
      <div className="mt-2 space-y-1">
        {rows.map((row, n) => {
          const isTop = n === 0;
          return (
            <Line
              key={row.id}
              i={n}
              delay={ROWS_BASE + n * ROW_STEP}
              className="flex items-center gap-2"
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                  isTop
                    ? "border-primary bg-primary text-white"
                    : "border-[#E8DDD9] bg-white text-[#B5ADA9]"
                )}
              >
                <row.Icon className="h-4 w-4" strokeWidth={isTop ? 2.2 : 1.9} aria-hidden />
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
                   four names have arrived — the eye reads the list, then the
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
                <span className="shrink-0 text-[10.5px] font-extrabold tabular-nums text-[#C6BDB9]">
                  {n + 1}
                </span>
              )}
            </Line>
          );
        })}
      </div>

      {/* Why the top one is the top one, then the crowd — in that order and at
          that weight. The physiology is the argument; the percentage is the
          reassurance underneath it. */}
      {(mechanism || top) && (
        <div className="mt-2 border-t border-dashed border-[#E0D5D0] pt-1.5">
          {mechanism && (
            <Line i={0} delay={mechAt} className="text-[11.5px] leading-snug text-[#5A5A5A]">
              {mechanism}
            </Line>
          )}
          {top && (
            <Line i={0} delay={pctAt} className="mt-1 text-[10px] leading-snug text-[#9A9A9A]">
              {topPct}% of {cohort} report {top.label.toLowerCase()} too.
            </Line>
          )}
        </div>
      )}

      {/* The payload. It is the only block on any of the three boards that asks
          her to do something rather than showing her something, so it is the
          only one drawn as a panel — and it arrives last, on its own spring,
          because it is the reason the screen exists. */}
      {firstMove && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 24, delay: moveAt }
          }
          className="mt-2 rounded-xl border border-[#16A34A]/30 bg-[#16A34A]/[0.07] px-3 py-2"
        >
          <p className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-[#15803D]">
            <Moon className="h-3 w-3" strokeWidth={2.6} aria-hidden />
            Do this tonight
            <span className="ml-auto rounded bg-[#16A34A] px-1.5 py-[1px] text-[9px] tracking-normal text-white">
              Free
            </span>
          </p>
          <p className="mt-1 text-[12.5px] font-bold leading-snug text-[#3D3D3D]">{firstMove.do}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-[#5A5A5A]">{firstMove.why}</p>
        </motion.div>
      )}

      {/* The payload panel above is green rather than the primary tint the rest
          of the board uses, and that is the funnel's colour rule read straight:
          green is the gap and the thing that closes it, and this is the first
          moment in the funnel that anything closes any of it. The sign-off
          below stays the shared pill, so the boards still end the same way. */}
      <Signoff delay={signAt}>
        One thing, tonight.{" "}
        {rest > 0 ? (
          <>
            The other {rest} {rest === 1 ? "is" : "are"} in your{" "}
            <span className="whitespace-nowrap font-extrabold">{planWeeks}-week plan</span>.
          </>
        ) : (
          <>
            The rest is in your{" "}
            <span className="whitespace-nowrap font-extrabold">{planWeeks}-week plan</span>.
          </>
        )}
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
