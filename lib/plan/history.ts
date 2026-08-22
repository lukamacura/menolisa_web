/**
 * Scores her eight weeks, day by day, from the same logs everything else reads.
 *
 * Like `lib/rewards/compute.ts`, nothing is stored: the grid is a pure function
 * of `user_plan_logs` and the plan she was given, so it is retroactive on the
 * day it ships and can never disagree with what she actually did.
 *
 * The one rule worth understanding before changing anything here:
 *
 *   **A weekly task is never scored against a single day.**
 *
 * Movement is usually `cadence: "weekly", target: 2` — the plan asks for two
 * sessions somewhere in seven days, and never says which days. Scoring a day as
 * `0 of 2 movement` on the five days she was meant to rest would paint a
 * perfect week two-thirds empty. So a weekly task contributes to a day only
 * when she did it (a full 1.0, never a 0), and gets its real denominator at the
 * week level, where the plan actually made a promise. Daily and `per_day` tasks
 * are scored against their target every day, because there the plan did.
 */

import { NUTRITION, nutritionKey } from "@/lib/plan/catalog";
import { PLAN_WEEKS, type Plan, type PlanTask } from "@/lib/plan/generate";

const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const addDays = (d: string, n: number) => new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((asUtc(to) - asUtc(from)) / DAY);

/** Row target by log key, so a day's count can be scored against a finished row. */
const NUTRITION_TARGETS = new Map(NUTRITION.map((n) => [nutritionKey(n.id), n.target]));
const NUTRITION_ROWS = NUTRITION.length;

const PILLARS = ["movement", "nutrition", "relaxation"] as const;
export type HistoryPillar = (typeof PILLARS)[number];

export type PlanLogRow = { task_key: string; date: string; count: number | null };

/**
 * One pillar's standing over some span.
 *
 * `ratio` is the only field the ring reads. `done`/`target` are for the
 * sentence underneath it — they are raw counts (sessions, finished rows) and do
 * not always divide into `ratio`, because a pillar with two tasks averages
 * their ratios rather than pooling their totals.
 */
export type PillarProgress = { done: number; target: number; ratio: number };

/** `null` means "the plan asked nothing of her here" — never render it as a zero. */
export type DayProgress = {
  date: string;
  /** 1-based within the plan. */
  dayOfPlan: number;
  week: number;
  state: "past" | "today" | "future";
  movement: PillarProgress | null;
  nutrition: PillarProgress | null;
  relaxation: PillarProgress | null;
  /** Mean of the pillars that were in play. 0 on a future day. */
  score: number;
};

export type WeekProgress = {
  number: number;
  title: string;
  /** Empty on a locked week — she cannot read ahead. */
  focus: string;
  state: "past" | "current" | "locked";
  startDate: string;
  endDate: string;
  movement: PillarProgress | null;
  nutrition: PillarProgress | null;
  relaxation: PillarProgress | null;
  score: number;
  days: DayProgress[];
};

export type HistoryPayload = {
  startedAt: string;
  /** The date this was scored against — her local day, already validated. */
  date: string;
  currentWeek: number;
  totalWeeks: number;
  /** Days of the plan elapsed so far, capped at the plan's length. */
  daysElapsed: number;
  weeks: WeekProgress[];
  overall: {
    movement: PillarProgress | null;
    nutrition: PillarProgress | null;
    relaxation: PillarProgress | null;
    score: number;
  };
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Mean of the ratios that exist, or null when the plan asked for none of them. */
function meanRatio(parts: (PillarProgress | null)[]): number {
  const live = parts.filter((p): p is PillarProgress => p !== null);
  if (!live.length) return 0;
  return live.reduce((sum, p) => sum + p.ratio, 0) / live.length;
}

/**
 * What one task asks of one day.
 *
 * A weekly task returns null on a day she skipped it: not a failure, just not
 * today's question. See the rule at the top of this file.
 */
function dayRatio(task: PlanTask, count: number): number | null {
  if (task.cadence === "weekly") return count > 0 ? 1 : null;
  return clamp01(count / Math.max(1, task.target));
}

/** What one task asks of a week, given how many of its days have actually happened. */
function weekRatio(task: PlanTask, weekCount: number, elapsedDays: number): number | null {
  if (elapsedDays <= 0) return null;
  const target =
    task.cadence === "weekly" ? task.target : Math.max(1, task.target) * elapsedDays;
  return clamp01(weekCount / Math.max(1, target));
}

type Input = {
  /** Her local date, already validated by the route. */
  date: string;
  startedAt: string;
  plan: Plan;
  logs: PlanLogRow[];
};

export function computeHistory({ date, startedAt, plan, logs }: Input): HistoryPayload {
  // counts[taskKey][date] — one pass, so eight weeks of rows are walked once
  // rather than once per task per day.
  const counts = new Map<string, Map<string, number>>();
  for (const log of logs) {
    const n = Math.max(0, log.count ?? 1);
    if (!n) continue;
    let days = counts.get(log.task_key);
    if (!days) counts.set(log.task_key, (days = new Map()));
    days.set(log.date, (days.get(log.date) ?? 0) + n);
  }
  const countOn = (key: string, day: string) => counts.get(key)?.get(day) ?? 0;

  const currentWeek = Math.min(
    Math.max(Math.floor(daysBetween(startedAt, date) / 7) + 1, 1),
    PLAN_WEEKS
  );
  // Past day 56 the plan keeps rendering but the grid stops growing — there are
  // only ever eight rows, and the last one fills up and stays full.
  const daysElapsed = Math.min(Math.max(daysBetween(startedAt, date) + 1, 1), PLAN_WEEKS * 7);

  /** Finished nutrition rows on one day. A half-drunk water row is not finished. */
  function nutritionOn(day: string): PillarProgress {
    let done = 0;
    for (const [key, target] of NUTRITION_TARGETS) {
      if (countOn(key, day) >= target) done += 1;
    }
    return { done, target: NUTRITION_ROWS, ratio: clamp01(done / NUTRITION_ROWS) };
  }

  const weeks: WeekProgress[] = Array.from({ length: PLAN_WEEKS }, (_, index) => {
    const number = index + 1;
    const stored = plan.weeks.find((w) => w.number === number);
    const state = number > currentWeek ? "locked" : number === currentWeek ? "current" : "past";
    const startDate = addDays(startedAt, index * 7);
    const endDate = addDays(startDate, 6);

    const tasks = (stored?.tasks ?? []).filter(
      (t) => t.pillar === "movement" || t.pillar === "relaxation"
    );
    const byPillar = (pillar: "movement" | "relaxation") =>
      tasks.filter((t) => t.pillar === pillar);

    const days: DayProgress[] = Array.from({ length: 7 }, (_, offset) => {
      const day = addDays(startDate, offset);
      const dayOfPlan = index * 7 + offset + 1;
      const dayState = day < date ? "past" : day === date ? "today" : "future";

      if (dayState === "future") {
        return {
          date: day,
          dayOfPlan,
          week: number,
          state: dayState,
          movement: null,
          nutrition: null,
          relaxation: null,
          score: 0,
        };
      }

      /** Pool one pillar's tasks for this day, averaging their ratios. */
      const pillarOn = (pillar: "movement" | "relaxation"): PillarProgress | null => {
        const ratios: number[] = [];
        let done = 0;
        let target = 0;
        for (const task of byPillar(pillar)) {
          const count = countOn(task.key, day);
          const ratio = dayRatio(task, count);
          if (ratio === null) continue;
          ratios.push(ratio);
          done += count;
          target += task.cadence === "weekly" ? Math.max(1, count) : Math.max(1, task.target);
        }
        if (!ratios.length) return null;
        return {
          done,
          target,
          ratio: ratios.reduce((a, b) => a + b, 0) / ratios.length,
        };
      };

      const movement = pillarOn("movement");
      const nutrition = nutritionOn(day);
      const relaxation = pillarOn("relaxation");

      return {
        date: day,
        dayOfPlan,
        week: number,
        state: dayState,
        movement,
        nutrition,
        relaxation,
        score: meanRatio([movement, nutrition, relaxation]),
      };
    });

    // Only days that have happened may count against her. A week she is three
    // days into is scored out of three days, not seven.
    const elapsed = days.filter((d) => d.state !== "future");

    const weekPillar = (pillar: "movement" | "relaxation"): PillarProgress | null => {
      const list = byPillar(pillar);
      if (!list.length || !elapsed.length) return null;
      const ratios: number[] = [];
      let done = 0;
      let target = 0;
      for (const task of list) {
        const weekCount = elapsed.reduce((sum, d) => sum + countOn(task.key, d.date), 0);
        const ratio = weekRatio(task, weekCount, elapsed.length);
        if (ratio === null) continue;
        ratios.push(ratio);
        done += weekCount;
        target +=
          task.cadence === "weekly" ? task.target : Math.max(1, task.target) * elapsed.length;
      }
      if (!ratios.length) return null;
      return { done, target, ratio: ratios.reduce((a, b) => a + b, 0) / ratios.length };
    };

    const weekNutrition: PillarProgress | null = elapsed.length
      ? (() => {
          const done = elapsed.reduce((sum, d) => sum + (d.nutrition?.done ?? 0), 0);
          const target = NUTRITION_ROWS * elapsed.length;
          return { done, target, ratio: clamp01(done / target) };
        })()
      : null;

    const movement = weekPillar("movement");
    const relaxation = weekPillar("relaxation");

    return {
      number,
      title: stored?.title ?? `Week ${number}`,
      focus: state === "locked" ? "" : stored?.focus ?? "",
      state,
      startDate,
      endDate,
      movement,
      nutrition: weekNutrition,
      relaxation,
      score: meanRatio([movement, weekNutrition, relaxation]),
      days,
    };
  });

  // Plan-to-date. Averaged over the weeks that have started rather than pooled
  // over raw counts, so week 1 and week 8 weigh the same and one heroic week
  // cannot hide six quiet ones.
  const livePillar = (pillar: HistoryPillar): PillarProgress | null => {
    const parts = weeks
      .filter((w) => w.state !== "locked")
      .map((w) => w[pillar])
      .filter((p): p is PillarProgress => p !== null);
    if (!parts.length) return null;
    return {
      done: parts.reduce((sum, p) => sum + p.done, 0),
      target: parts.reduce((sum, p) => sum + p.target, 0),
      ratio: parts.reduce((sum, p) => sum + p.ratio, 0) / parts.length,
    };
  };

  const movement = livePillar("movement");
  const nutrition = livePillar("nutrition");
  const relaxation = livePillar("relaxation");

  return {
    startedAt,
    date,
    currentWeek,
    totalWeeks: PLAN_WEEKS,
    daysElapsed,
    weeks,
    overall: {
      movement,
      nutrition,
      relaxation,
      score: meanRatio([movement, nutrition, relaxation]),
    },
  };
}
