import { NextRequest, NextResponse, after } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_WEEKS, generatePlan, hydrateExercises, type Plan } from "@/lib/plan/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All date maths is done in UTC on plain YYYY-MM-DD strings, so it can't drift
// with the server's DST. The client tells us its local date; we only sanity-check it.
const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const addDays = (d: string, n: number) => new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((asUtc(to) - asUtc(from)) / DAY);

/** Her local date, from the client. Rejected if more than a day off ours — travel is fine, tampering isn't. */
function resolveDate(param: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param) || Number.isNaN(asUtc(param))) return today;
  return Math.abs(daysBetween(today, param)) <= 1 ? param : today;
}

// A run that never finished (function evicted, OpenAI hung). Opening the plan
// re-kicks it, which is why there's no separate sweep cron.
const STALL_MS = 120_000;

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkTrialExpired(user.id)) {
    return NextResponse.json({ error: "Trial expired" }, { status: 403 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const date = resolveDate(req.nextUrl.searchParams.get("date"));

  const { data: row, error } = await supabaseAdmin
    .from("user_plans")
    .select("status, plan, started_at, created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Plan: fetch failed:", error);
    return NextResponse.json({ error: "Failed to load plan" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ status: "none" });
  }
  if (row.status !== "ready" || !row.plan) {
    if (Date.now() - new Date(row.created_at).getTime() > STALL_MS) {
      after(() => generatePlan(user.id));
    }
    return NextResponse.json({ status: "generating" });
  }

  // Week 1 starts the first time she opens the plan, not when she paid — she
  // buys on web and may not install the app for days.
  const startedAt: string = row.started_at ?? date;
  if (!row.started_at) {
    await supabaseAdmin.from("user_plans").update({ started_at: startedAt }).eq("user_id", user.id);
  }

  const currentWeek = Math.min(Math.max(Math.floor(daysBetween(startedAt, date) / 7) + 1, 1), PLAN_WEEKS);

  const [{ data: logs }, { data: habits }] = await Promise.all([
    supabaseAdmin
      .from("user_plan_logs")
      .select("task_key, date, count")
      .eq("user_id", user.id)
      .gte("date", startedAt),
    supabaseAdmin
      .from("user_habits")
      .select("id, title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const countIn = (key: string, from: string, to: string) =>
    (logs ?? []).reduce(
      (sum, l) => (l.task_key === key && l.date >= from && l.date <= to ? sum + (l.count ?? 1) : sum),
      0
    );

  const plan = row.plan as Plan;
  const weeks = Array.from({ length: PLAN_WEEKS }, (_, i) => {
    const n = i + 1;
    const week = plan.weeks.find((w) => w.number === n);
    const state = n > currentWeek ? "locked" : n === currentWeek ? "current" : "past";

    // Future weeks give up their title only — she sees the whole map, but can't jump ahead.
    if (!week || state === "locked") {
      return { number: n, title: week?.title ?? `Week ${n}`, focus: "", state, tasks: [] };
    }

    const weekStart = addDays(startedAt, i * 7);
    const weekEnd = addDays(weekStart, 6);

    return {
      number: n,
      title: week.title,
      focus: week.focus,
      state,
      tasks: week.tasks.map((t) => ({
        key: t.key,
        pillar: t.pillar,
        title: t.title,
        why: t.why,
        cadence: t.cadence,
        target: t.target,
        doneToday: countIn(t.key, date, date),
        doneThisWeek: countIn(t.key, weekStart, weekEnd),
        exercises: hydrateExercises(t),
      })),
    };
  });

  return NextResponse.json({
    status: "ready",
    date,
    startedAt,
    currentWeek,
    weeks,
    habits: (habits ?? []).map((h) => ({
      id: h.id,
      title: h.title,
      doneToday: countIn(`habit_${h.id}`, date, date),
    })),
  });
}
