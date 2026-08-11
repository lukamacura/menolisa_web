import { NextRequest, NextResponse, after } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  PLAN_WEEKS,
  generatePlan,
  hydrateExercises,
  hydrateRelaxation,
  markPlanGenerating,
  type Plan,
} from "@/lib/plan/generate";
import {
  NUTRITION,
  NUTRITION_GROUP_ORDER,
  SUPPLEMENT_OPTIONS,
  nutritionKey,
} from "@/lib/plan/catalog";

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
//
// `user_plans.created_at` is the clock: on an unfinished row it means "when the
// current attempt was claimed", and the re-kick below moves it forward. It stops
// being touched once the row is `ready`.
const STALL_MS = 120_000;

const PILLARS = new Set(["movement", "relaxation", "habit"]);

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

  // Exercise clips exist for the mobile app only — the web dashboard has no
  // player. This is opt-in rather than sniffed from the auth method, because
  // "can you play video" is a rendering question, not an auth one: a web player
  // could be added later without having to pretend to be mobile. The mobile app
  // sends ?media=1; everything else gets name + props and no URLs.
  const includeMedia = req.nextUrl.searchParams.get("media") === "1";

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
    // checkTrialExpired passed, so she is paying and simply has no plan — the
    // fulfillment that claims this row never ran for her. Kick it here rather
    // than reporting "none", which she can't act on and which the stall re-kick
    // below can never reach, since that needs a row to already exist.
    await markPlanGenerating(user.id);
    after(() => generatePlan(user.id));
    return NextResponse.json({ status: "generating" });
  }
  if (row.status !== "ready" || !row.plan) {
    // The app polls this endpoint every few seconds while it shows "building
    // your plan", so once the row goes stale an unguarded re-kick spawns a
    // fresh pair of OpenAI calls on *every* poll. The conditional update is the
    // claim: Postgres serialises concurrent pollers on the row lock, so exactly
    // one of them matches `created_at < stale` and gets a row back.
    const { data: claimed } = await supabaseAdmin
      .from("user_plans")
      .update({ created_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .neq("status", "ready")
      .lt("created_at", new Date(Date.now() - STALL_MS).toISOString())
      .select("user_id");
    if (claimed?.length) after(() => generatePlan(user.id));
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
      .select("id, title, kind")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  const countIn = (key: string, from: string, to: string) =>
    (logs ?? []).reduce(
      (sum, l) => (l.task_key === key && l.date >= from && l.date <= to ? sum + (l.count ?? 1) : sum),
      0
    );

  // One pass over the logs, so streaks for ten nutrition rows plus every habit
  // don't each re-walk the whole array. Counts, not just dates: a row with a
  // target of 3 needs to know whether that day reached 3 or stopped at 1.
  const countsByKey = new Map<string, Map<string, number>>();
  for (const l of logs ?? []) {
    let days = countsByKey.get(l.task_key);
    if (!days) countsByKey.set(l.task_key, (days = new Map()));
    days.set(l.date, (days.get(l.date) ?? 0) + (l.count ?? 1));
  }

  /**
   * Days in a row up to today, counting only days that reached `target`. If she
   * hasn't ticked it yet *today* the run is measured to yesterday instead —
   * otherwise a 40-day streak would read as zero every morning until she opens
   * the app, which is exactly the moment it needs to be motivating.
   */
  function streaks(key: string, target = 1): { streak: number; bestStreak: number } {
    const counts = countsByKey.get(key);
    if (!counts?.size) return { streak: 0, bestStreak: 0 };

    const days = new Set(
      [...counts].filter(([, n]) => n >= target).map(([d]) => d)
    );
    if (!days.size) return { streak: 0, bestStreak: 0 };

    let cursor = days.has(date) ? date : addDays(date, -1);
    let streak = 0;
    while (days.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }

    const sorted = [...days].sort();
    let best = 0;
    let run = 0;
    let prev = "";
    for (const d of sorted) {
      run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    }
    return { streak, bestStreak: Math.max(best, streak) };
  }

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
      tasks: week.tasks
        .filter((t) => PILLARS.has(t.pillar))
        .map((t) => ({
          key: t.key,
          pillar: t.pillar,
          title: t.title,
          why: t.why,
          cadence: t.cadence,
          target: t.target,
          doneToday: countIn(t.key, date, date),
          doneThisWeek: countIn(t.key, weekStart, weekEnd),
          exercises: hydrateExercises(t, includeMedia),
          // Breathing pattern and round count, so the app can run the timer
          // without shipping its own copy of the protocol.
          relaxation: hydrateRelaxation(t),
        })),
    };
  });

  // Nutrition is not a weekly task — all ten show every day, for everyone, in
  // the funnel's order and grouping. The week only decides what's highlighted.
  //
  // `count`/`target`/`max` carry the meal structure: protein, fat, fiber and
  // the post-meal walk are ticked once per meal, water once per glass.
  // `doneToday` stays a boolean and now means "reached target", so a client
  // that only knows about ticks still reads a full day correctly.
  const focusIds = new Set(plan.weeks.find((w) => w.number === currentWeek)?.nutritionFocus ?? []);
  const nutritionItems = NUTRITION.map((item) => {
    const key = nutritionKey(item.id);
    const count = countIn(key, date, date);
    return {
      id: item.id,
      key,
      title: item.label,
      group: item.group,
      focus: focusIds.has(item.id),
      // Hers, written at generation. Plans made before nutritionWhy existed
      // have none, so the catalog's default stands in — the row always opens
      // on a reason.
      why: plan.nutritionWhy?.[item.id] || item.why,
      target: item.target,
      max: item.max ?? item.target,
      count,
      doneToday: count >= item.target,
      ...streaks(key, item.target),
    };
  });

  const nutrition = {
    total: nutritionItems.length,
    doneToday: nutritionItems.filter((n) => n.doneToday).length,
    groups: NUTRITION_GROUP_ORDER.map((title) => ({
      title,
      items: nutritionItems.filter((n) => n.group === title),
    })),
    supplements: SUPPLEMENT_OPTIONS,
  };

  const habitRows = (habits ?? []).map((h) => {
    const key = `habit_${h.id}`;
    return {
      id: h.id,
      title: h.title,
      kind: (h.kind ?? "build") as "build" | "resist",
      doneToday: countIn(key, date, date),
      ...streaks(key),
    };
  });

  // Only ones she hasn't taken up. A resist habit she never chose isn't a habit,
  // it's a lecture — the app offers, she opts in.
  const taken = new Set(habitRows.map((h) => h.title.toLowerCase()));
  const resistSuggestions = (plan.resistSuggestions ?? []).filter(
    (s) => !taken.has(s.title.toLowerCase())
  );

  return NextResponse.json({
    status: "ready",
    date,
    startedAt,
    currentWeek,
    weeks,
    nutrition,
    habits: habitRows,
    resistSuggestions,
  });
}
