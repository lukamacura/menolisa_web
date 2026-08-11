/**
 * Turns her raw history into the reward payload.
 *
 * Everything is derived on read from rows that already exist — `user_plan_logs`
 * and `symptom_logs`. There is no XP column and no achievements table, on
 * purpose:
 *
 * - It is **retroactive**. Someone six weeks into her plan opens the rewards
 *   screen and finds the badges she has already earned, instead of a wall of
 *   zeroes on the day this shipped.
 * - It **cannot drift**. XP is a pure function of the logs — the count of
 *   finished things times a constant — so a double-tapped button, a replayed
 *   offline write, or an un-ticked box can never leave a stored total that
 *   disagrees with what she actually did.
 * - It has **no failure mode of its own**. Nothing new is written on the hot
 *   path, so the reward system cannot break the act of ticking a box.
 *
 * The cost is one full walk of her logs per read. That is the same walk
 * `GET /api/plan` already does, over a table that holds at most a few thousand
 * rows per user after eight weeks.
 */

import { NUTRITION, isRelaxationId, nutritionKey } from "@/lib/plan/catalog";
import {
  ACHIEVEMENTS,
  DAILY_XP_GOAL,
  XP_PER_COMPLETION,
  evaluate,
  levelForXp,
  type AchievementProgress,
  type RewardLevel,
  type RewardMetric,
  type RewardPillar,
} from "./catalog";

const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const addDays = (d: string, n: number) => new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((asUtc(to) - asUtc(from)) / DAY);

/** Sat/Sun for a plain `YYYY-MM-DD`, read in UTC so it can't shift with server DST. */
function isWeekend(date: string): boolean {
  const day = new Date(asUtc(date)).getUTCDay();
  return day === 0 || day === 6;
}

const WATER_KEY = nutritionKey("water_6");
const PROTEIN_KEY = nutritionKey("protein_25_30g");

/** Row target by log key, so a day's count can be scored against it. */
const NUTRITION_TARGETS = new Map(NUTRITION.map((n) => [nutritionKey(n.id), n.target]));

export type PlanLogRow = { task_key: string; date: string; count: number | null };

/** The stored plan, narrowed to the one thing this file needs from it. */
export type PlanShape = {
  weeks?: { number: number; tasks?: { key: string; pillar: string }[] }[];
} | null;

export type RewardStats = Record<RewardMetric, number> & {
  /** XP earned on the requested date. */
  todayXp: number;
  /** Days in a row, up to today. */
  streak: number;
  /** Whether anything at all is logged for the requested date. */
  activeToday: boolean;
};

export type RewardsPayload = {
  date: string;
  /** `perCompletion` is sent so the app can label a reward without hardcoding it. */
  xp: { total: number; today: number; goal: number; perCompletion: number };
  level: RewardLevel;
  streak: { current: number; best: number; activeToday: boolean };
  stats: RewardStats;
  achievements: AchievementProgress[];
  /** Every tier she has earned, across all families. The client diffs this. */
  earned: string[];
};

/**
 * Which pillar a plan task key belongs to.
 *
 * The stored plan is authoritative — task keys are `w<n>_<suffix>` where the
 * suffix may be whatever the generating model chose, so it cannot be parsed.
 * The heuristic below is only a fallback for logs whose task has since been
 * regenerated out of the plan; without it those ticks would silently score as
 * habits and her movement badge would stall for reasons she cannot see.
 */
function buildPillarMap(plan: PlanShape): Map<string, RewardPillar> {
  const map = new Map<string, RewardPillar>();
  for (const week of plan?.weeks ?? []) {
    for (const task of week.tasks ?? []) {
      if (task.pillar === "movement" || task.pillar === "relaxation" || task.pillar === "habit") {
        map.set(task.key, task.pillar);
      }
    }
  }
  return map;
}

/** Best guess for a key the current plan no longer contains. */
function fallbackPillar(taskKey: string): RewardPillar {
  const suffix = taskKey.replace(/^w\d+_/, "");
  if (isRelaxationId(suffix)) return "relaxation";
  if (suffix.startsWith("movement")) return "movement";
  if (suffix.startsWith("relaxation")) return "relaxation";
  return "habit";
}

export type ComputeInput = {
  /** Her local date, already validated by the route. */
  date: string;
  plan: PlanShape;
  /** `user_plans.started_at`, when she has one. */
  startedAt: string | null;
  logs: PlanLogRow[];
  /** `symptom_logs.logged_at`, any parseable timestamp. */
  symptomTimestamps: string[];
};

export function computeRewards({
  date,
  plan,
  startedAt,
  logs,
  symptomTimestamps,
}: ComputeInput): RewardsPayload {
  const pillars = buildPillarMap(plan);

  /**
   * Completions per day. XP is just this times a constant, so goal days,
   * today's total and the lifetime figure all fall out of one pass.
   */
  const doneByDate = new Map<string, number>();
  const addDone = (day: string, n: number) =>
    doneByDate.set(day, (doneByDate.get(day) ?? 0) + n);

  /** Every day she touched anything. Drives streaks, active days, weekends. */
  const activeDays = new Set<string>();

  /** Nutrition day totals, keyed `<key>|<date>`, so rows can be scored once. */
  const nutritionCounts = new Map<string, number>();

  let completions = 0;
  let totalTicks = 0;
  let movementSessions = 0;
  let relaxationSessions = 0;
  let habitTicks = 0;

  for (const log of logs) {
    const count = Math.max(0, log.count ?? 1);
    if (count === 0) continue;

    const day = log.date;
    activeDays.add(day);
    totalTicks += count;

    if (log.task_key.startsWith("nut_")) {
      // Scored below, once per row per day, against the row's own target — a
      // half-drunk water row is not a finished thing and pays nothing yet.
      const bucket = `${log.task_key}|${day}`;
      nutritionCounts.set(bucket, (nutritionCounts.get(bucket) ?? 0) + count);
      continue;
    }

    // Everything else is one finished thing per tick: a session done, a habit
    // kept. `count` above 1 means she did it more than once that day.
    if (log.task_key.startsWith("habit_")) {
      habitTicks += count;
    } else {
      const pillar = pillars.get(log.task_key) ?? fallbackPillar(log.task_key);
      if (pillar === "movement") movementSessions += count;
      else if (pillar === "relaxation") relaxationSessions += count;
      else habitTicks += count;
    }

    completions += count;
    addDone(day, count);
  }

  // ---- nutrition rows, water, protein ------------------------------------
  let nutritionRows = 0;
  let waterDays = 0;
  let proteinDays = 0;
  for (const [bucket, count] of nutritionCounts) {
    const separator = bucket.indexOf("|");
    const key = bucket.slice(0, separator);
    const target = NUTRITION_TARGETS.get(key);
    if (target === undefined || count < target) continue;
    nutritionRows += 1;
    if (key === WATER_KEY) waterDays += 1;
    if (key === PROTEIN_KEY) proteinDays += 1;
    completions += 1;
    addDone(bucket.slice(separator + 1), 1);
  }

  // Symptoms are logged outside the plan but are still her showing up, so they
  // hold the streak too and pay like anything else she finishes.
  let symptomLogs = 0;
  for (const stamp of symptomTimestamps) {
    const day = stamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    symptomLogs += 1;
    activeDays.add(day);
    totalTicks += 1;
    completions += 1;
    addDone(day, 1);
  }

  const totalXp = completions * XP_PER_COMPLETION;

  // ---- day-shaped metrics -------------------------------------------------
  let goalDays = 0;
  let bigDays = 0;
  for (const done of doneByDate.values()) {
    const earned = done * XP_PER_COMPLETION;
    if (earned >= DAILY_XP_GOAL) goalDays += 1;
    if (earned >= DAILY_XP_GOAL * 2) bigDays += 1;
  }

  const sortedDays = [...activeDays].sort();
  const weekendDays = sortedDays.filter(isWeekend).length;

  // ---- streaks ------------------------------------------------------------
  //
  // Measured to yesterday when nothing is logged today, matching how the plan's
  // own per-row streaks read. A 40-day run must not show as 0 every morning
  // before she has opened the app — that is precisely when it has to motivate.
  const activeToday = activeDays.has(date);
  let cursor = activeToday ? date : addDays(date, -1);
  let streak = 0;
  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  let bestStreak = 0;
  let run = 0;
  let previous = "";
  let comebacks = 0;
  for (const day of sortedDays) {
    if (previous && daysBetween(previous, day) === 1) {
      run += 1;
    } else {
      // Three or more missed days, then she came back. Worth saying so.
      if (previous && daysBetween(previous, day) >= 4) comebacks += 1;
      run = 1;
    }
    if (run > bestStreak) bestStreak = run;
    previous = day;
  }
  bestStreak = Math.max(bestStreak, streak);

  // ---- weeks --------------------------------------------------------------
  //
  // Bucketed from the plan's own start date so "week 3" here means the same
  // week it means everywhere else in the app. Without a plan we fall back to
  // her first active day, which keeps the badges working during generation.
  const weekOrigin = startedAt ?? sortedDays[0] ?? date;
  const weekIndex = (day: string) => Math.floor(daysBetween(weekOrigin, day) / 7);

  const daysPerWeek = new Map<number, number>();
  for (const day of sortedDays) {
    const index = weekIndex(day);
    if (index < 0) continue;
    daysPerWeek.set(index, (daysPerWeek.get(index) ?? 0) + 1);
  }

  const strongWeeks = [...daysPerWeek.values()].filter((n) => n >= 5).length;

  // The furthest week she actually logged in, not the week the calendar says
  // she is on. Graduate should reward showing up, never mere elapsed time.
  const planWeek = sortedDays.length
    ? Math.min(8, Math.max(...sortedDays.map((day) => weekIndex(day) + 1)))
    : 0;

  const stats: RewardStats = {
    bestStreak,
    totalXp,
    nutritionRows,
    waterDays,
    proteinDays,
    movementSessions,
    relaxationSessions,
    habitTicks,
    goalDays,
    activeDays: activeDays.size,
    symptomLogs,
    planWeek,
    weekendDays,
    totalTicks,
    comebacks,
    bigDays,
    strongWeeks,
    todayXp: (doneByDate.get(date) ?? 0) * XP_PER_COMPLETION,
    streak,
    activeToday,
  };

  const achievements = ACHIEVEMENTS.map((family) => evaluate(family, stats[family.metric] ?? 0));

  return {
    date,
    xp: {
      total: totalXp,
      today: stats.todayXp,
      goal: DAILY_XP_GOAL,
      perCompletion: XP_PER_COMPLETION,
    },
    level: levelForXp(totalXp),
    streak: { current: streak, best: bestStreak, activeToday },
    stats,
    achievements,
    earned: achievements.flatMap((a) => a.earned),
  };
}
