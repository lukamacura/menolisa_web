/**
 * Cycles — what happens when her eight weeks run out.
 *
 * A plan is not a thing she has, it is a thing she is eight weeks into. When
 * those weeks end she gets another one, written against how the last one
 * actually went, and the old one stays readable forever.
 *
 * `user_plans` is keyed `(user_id, cycle)`; cycle 1 is the plan she bought.
 * Almost every read wants her newest row, which is what `getActivePlan` is for
 * — reading `user_plans` by `user_id` alone now returns a row per cycle and
 * `.maybeSingle()` will throw once anyone reaches cycle 2.
 *
 * `user_plan_logs` is deliberately untouched by any of this. Task keys repeat
 * across cycles (every cycle has a `w1_movement0`), but every read of the logs
 * is already scoped to a date window and consecutive cycles never overlap in
 * time — the date tells the two apart, so nothing had to be migrated and every
 * old log stays scoreable.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_WEEKS, type Plan } from "@/lib/plan/generate";
import { computeHistory, type HistoryPayload, type PlanLogRow } from "@/lib/plan/history";
import { addDays } from "@/lib/plan/dates";

export { addDays, asUtc, daysBetween } from "@/lib/plan/dates";

/** Days one cycle covers. Day 0 is week 1 day 1; day 56 is the first day of the next cycle. */
export const PLAN_DAYS = PLAN_WEEKS * 7;

export type PlanRow = {
  cycle: number;
  status: string;
  plan: Plan | null;
  started_at: string | null;
  created_at: string;
  prior_adherence: Adherence | null;
};

const ROW_COLUMNS = "cycle, status, plan, started_at, created_at, prior_adherence";

/**
 * Her newest cycle, or null when she has never had a plan.
 *
 * Newest rather than "the ready one" on purpose: during a rollover the newest
 * row is the one still generating, and that is exactly the row the caller
 * should be waiting on.
 */
export async function getActivePlan(userId: string): Promise<PlanRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_plans")
    .select(ROW_COLUMNS)
    .eq("user_id", userId)
    .order("cycle", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PlanRow | null) ?? null;
}

/** One cycle, for the switcher on the progress screen. Oldest first. */
export type CycleSummary = {
  cycle: number;
  startedAt: string;
  /** Day 56 of the cycle. In the future for the one she is living in. */
  endsAt: string;
  current: boolean;
};

/**
 * Every cycle she has finished or started, oldest first.
 *
 * Only `ready` cycles with a stamped `started_at` appear: a row still being
 * written has no weeks to show, and one never opened has no window to score.
 */
export async function listCycles(userId: string): Promise<CycleSummary[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_plans")
    .select("cycle, started_at")
    .eq("user_id", userId)
    .eq("status", "ready")
    .not("started_at", "is", null)
    .order("cycle", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as { cycle: number; started_at: string }[];
  const newest = rows.length ? rows[rows.length - 1].cycle : 0;
  return rows.map((r) => ({
    cycle: r.cycle,
    startedAt: r.started_at,
    endsAt: addDays(r.started_at, PLAN_DAYS - 1),
    current: r.cycle === newest,
  }));
}

/**
 * The date to score a cycle against.
 *
 * A finished cycle is always scored against its last day, never against today
 * — otherwise every past cycle would render as seven weeks of blank future the
 * moment she moved on from it.
 */
export function scoringDate(startedAt: string, today: string): string {
  const lastDay = addDays(startedAt, PLAN_DAYS - 1);
  return today > lastDay ? lastDay : today;
}

// ─── Adherence ──────────────────────────────────────────────────────────────

/**
 * How much of the last plan she actually did, as whole percentages.
 *
 * This is the only thing a repeat plan knows about the one before it. It is
 * deliberately small: three pillar numbers and whether she faded or built. The
 * model is being asked to size the next eight weeks, not to psychoanalyse her,
 * and a bigger payload buys nothing but a longer prompt and more ways to drift.
 *
 * `null` on a pillar means the last plan never asked for it — not that she
 * scored zero. The prompt must never turn that into a criticism.
 */
export type Adherence = {
  /** The cycle this describes — the one that just ended. */
  cycle: number;
  /** 0-100, or null when the plan asked nothing of that pillar. */
  movement: number | null;
  nutrition: number | null;
  relaxation: number | null;
  /**
   * The plan's own weekly habit ("cool the room before bed").
   *
   * Deliberately absent from `overall`, `firstHalf` and `secondHalf`, which
   * measure the three pillars the app draws as rings — see `SCORED` in
   * history.ts. It is here because it is the one number the next plan most
   * needs and never had: habits were tickable and scored nowhere, so eight
   * weeks of "she kept none of them" and "she kept all of them" produced the
   * identical next plan.
   */
  habit: number | null;
  /** 0-100 across all three. */
  overall: number;
  /** Weeks 1-4 and weeks 5-8, so the prompt can tell a fade from a build. */
  firstHalf: number;
  secondHalf: number;
};

const pct = (ratio: number) => Math.round(Math.min(1, Math.max(0, ratio)) * 100);

/** Mean of the week scores in a range, as a percentage. Empty ranges score 0. */
function halfScore(history: HistoryPayload, from: number, to: number): number {
  const weeks = history.weeks.filter(
    (w) => w.number >= from && w.number <= to && w.state !== "locked"
  );
  if (!weeks.length) return 0;
  return pct(weeks.reduce((sum, w) => sum + w.score, 0) / weeks.length);
}

/** Turns a scored cycle into the handful of numbers the next prompt reads. */
export function summarizeAdherence(cycle: number, history: HistoryPayload): Adherence {
  const { overall } = history;
  return {
    cycle,
    movement: overall.movement ? pct(overall.movement.ratio) : null,
    nutrition: overall.nutrition ? pct(overall.nutrition.ratio) : null,
    relaxation: overall.relaxation ? pct(overall.relaxation.ratio) : null,
    habit: overall.habit ? pct(overall.habit.ratio) : null,
    overall: pct(overall.score),
    firstHalf: halfScore(history, 1, 4),
    secondHalf: halfScore(history, 5, PLAN_WEEKS),
  };
}

/**
 * Scores a finished cycle straight from the logs.
 *
 * Used at rollover, where there is no request to hang a client date off — the
 * cycle is scored against its own last day, which is the only date that can
 * ever produce the same answer twice.
 */
export async function scoreCycle(
  userId: string,
  row: Pick<PlanRow, "cycle" | "plan" | "started_at">
): Promise<Adherence | null> {
  if (!row.plan || !row.started_at) return null;

  const startedAt = row.started_at;
  const endsAt = addDays(startedAt, PLAN_DAYS - 1);

  const { data, error } = await getSupabaseAdmin()
    .from("user_plan_logs")
    .select("task_key, date, count")
    .eq("user_id", userId)
    .gte("date", startedAt)
    .lte("date", endsAt);

  // A plan written without her numbers is better than no plan at all, so a
  // failed read degrades to "we know nothing about the last eight weeks"
  // rather than blocking the rollover.
  if (error) {
    console.error("Plan: could not score the finished cycle:", error);
    return null;
  }

  return summarizeAdherence(
    row.cycle,
    computeHistory({
      date: endsAt,
      startedAt,
      plan: row.plan,
      logs: (data ?? []) as PlanLogRow[],
    })
  );
}
