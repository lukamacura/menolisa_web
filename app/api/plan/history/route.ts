import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { computeHistory, type PlanLogRow } from "@/lib/plan/history";
import {
  PLAN_DAYS,
  addDays,
  asUtc,
  daysBetween,
  getActivePlan,
  listCycles,
  scoringDate,
} from "@/lib/plan/cycles";
import type { Plan } from "@/lib/plan/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Her local date, from the client. Rejected if more than a day off ours — travel is fine, tampering isn't. */
function resolveDate(param: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param) || Number.isNaN(asUtc(param))) return today;
  return Math.abs(daysBetween(today, param)) <= 1 ? param : today;
}

/**
 * Her eight weeks, scored day by day, for the progress grid.
 *
 * Read-only and derived — see `lib/plan/history.ts` for the scoring rule.
 *
 * `?cycle=` picks which eight weeks. Omit it for the ones she is living in;
 * pass a number to read a finished plan. Every response carries `cycles`, the
 * whole list, so the app can offer the switcher without a second request — and
 * so a woman on her first plan gets a one-item list the UI knows to hide.
 *
 * The two things that make an old cycle score correctly:
 *
 * 1. **It is scored against its own last day, never against today.** Otherwise
 *    a plan she finished in March renders as seven weeks of blank future.
 * 2. **Its logs are bounded at both ends.** Task keys repeat across cycles —
 *    every cycle has a `w1_movement0` — so an open-ended `gte(started_at)`
 *    would pour the new plan's ticks into the old plan's week 1.
 *
 * Unlike `GET /api/plan` this never generates. A woman with no plan yet has no
 * grid to draw, and kicking a generation off a screen she opened to look
 * backwards would be surprising — so that case answers 404 and the app shows
 * its empty state.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkTrialExpired(user.id)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const date = resolveDate(req.nextUrl.searchParams.get("date"));

  const cycleParam = req.nextUrl.searchParams.get("cycle");
  const requestedCycle =
    cycleParam && /^\d+$/.test(cycleParam) ? Math.max(1, parseInt(cycleParam, 10)) : null;

  let row: { cycle: number; status: string; plan: Plan | null; started_at: string | null } | null;
  let cycles;
  try {
    [row, cycles] = await Promise.all([
      requestedCycle === null
        ? getActivePlan(user.id)
        : supabaseAdmin
            .from("user_plans")
            .select("cycle, status, plan, started_at")
            .eq("user_id", user.id)
            .eq("cycle", requestedCycle)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw error;
              return data;
            }),
      listCycles(user.id),
    ]);
  } catch (err) {
    console.error("Plan history: fetch failed:", err);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }

  if (!row || row.status !== "ready" || !row.plan) {
    return NextResponse.json({ error: "No plan yet" }, { status: 404 });
  }

  // `started_at` is stamped by the first `GET /api/plan`, which the app always
  // calls before this one. Falling back to today keeps a missing stamp rendering
  // as day 1 rather than throwing.
  const startedAt: string = row.started_at ?? date;
  const endsAt = addDays(startedAt, PLAN_DAYS - 1);

  const { data: logs, error: logsError } = await supabaseAdmin
    .from("user_plan_logs")
    .select("task_key, date, count")
    .eq("user_id", user.id)
    .gte("date", startedAt)
    .lte("date", endsAt);

  // The logs are the whole payload. Scoring a partial history would show her a
  // grid of days she is sure she completed sitting empty, which is worse than
  // an error she can pull to retry.
  if (logsError) {
    console.error("Plan history: log fetch failed:", logsError);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }

  return NextResponse.json({
    ...computeHistory({
      date: scoringDate(startedAt, date),
      startedAt,
      plan: row.plan as Plan,
      logs: (logs ?? []) as PlanLogRow[],
    }),
    cycle: row.cycle,
    cycles,
  });
}
