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
  sessionCooldown,
  sessionPower,
  sessionWarmup,
  type Plan,
} from "@/lib/plan/generate";
import {
  PLAN_DAYS,
  getActivePlan,
  scoreCycle,
  type PlanRow,
} from "@/lib/plan/cycles";
import { addDays, asUtc, daysBetween } from "@/lib/plan/dates";
import {
  NUTRITION,
  NUTRITION_GROUP_ORDER,
  SUPPLEMENT_OPTIONS,
  meditationMedia,
  nutritionKey,
} from "@/lib/plan/catalog";

export const runtime = "nodejs";

/**
 * Plan generation runs inside `after()` and measures 15-17 seconds — two
 * OpenAI calls, in parallel, on a prompt that carries her whole pool.
 *
 * `after()` work is billed against THIS function's duration, so without this
 * line the route inherits the platform default. If that default is below the
 * generation time the callback is killed mid-flight, the row stays
 * `generating`, and the app's poll re-kicks a run that is guaranteed to die the
 * same way — "building your plan" forever, on an account that has paid.
 *
 * Sixty is roughly 3.5x the measured time, which covers a slow OpenAI without
 * holding a function open for five minutes over a hung socket.
 */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  // Her newest cycle. Reading by user_id alone would return a row per cycle
  // she has ever had, so everything here goes through the helper.
  let row: PlanRow | null;
  try {
    row = await getActivePlan(user.id);
  } catch (err) {
    console.error("Plan: fetch failed:", err);
    return NextResponse.json({ error: "Failed to load plan" }, { status: 500 });
  }

  if (!row) {
    // checkTrialExpired passed, so she is paying and simply has no plan — the
    // fulfillment that claims this row never ran for her. Kick it here rather
    // than reporting "none", which she can't act on and which the stall re-kick
    // below can never reach, since that needs a row to already exist.
    const { claimed } = await markPlanGenerating(user.id, 1);
    if (claimed) after(() => generatePlan(user.id, { cycle: 1 }));
    return NextResponse.json({ status: "generating", cycle: 1 });
  }

  if (row.status !== "ready" || !row.plan) {
    // The app polls this endpoint every few seconds while it shows "building
    // your plan", so once the row goes stale an unguarded re-kick spawns a
    // fresh pair of OpenAI calls on *every* poll. The conditional update is the
    // claim: Postgres serialises concurrent pollers on the row lock, so exactly
    // one of them matches `created_at < stale` and gets a row back.
    //
    // Scoped to the cycle, or a stalled rollover would be "fixed" by
    // regenerating the finished plan underneath it.
    const { cycle, prior_adherence: adherence } = row;
    const { data: claimed } = await supabaseAdmin
      .from("user_plans")
      .update({ created_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("cycle", cycle)
      .neq("status", "ready")
      .lt("created_at", new Date(Date.now() - STALL_MS).toISOString())
      .select("cycle");
    // `prior_adherence` was written by the claim, so a re-kick rebuilds the
    // same plan it would have built the first time — a stalled rollover does
    // not quietly lose the last eight weeks and restart her at beginner.
    if (claimed?.length) after(() => generatePlan(user.id, { cycle, adherence }));
    // The cycle rides along on `generating` so the app knows, while it waits,
    // that eight weeks just ended — that is what lets it show her the recap
    // during the wait rather than after it.
    return NextResponse.json({ status: "generating", cycle });
  }

  // Week 1 starts the first time she opens the plan, not when she paid — she
  // buys on web and may not install the app for days. The same is true of every
  // cycle after: a rollover is stamped from the day she comes back, so a woman
  // who was away for a month opens on day 1 of the new plan rather than in
  // week 5 of one she has never seen.
  const startedAt: string = row.started_at ?? date;
  if (!row.started_at) {
    await supabaseAdmin
      .from("user_plans")
      .update({ started_at: startedAt })
      .eq("user_id", user.id)
      .eq("cycle", row.cycle);
  }

  // ─── Rollover ─────────────────────────────────────────────────────────────
  // Eight weeks are up. Score what she just did and write her the next eight,
  // reusing the machinery the very first plan runs through — the app already
  // knows how to render `generating` and poll, so there is nothing new for it
  // to learn here.
  if (daysBetween(startedAt, date) >= PLAN_DAYS) {
    const nextCycle = row.cycle + 1;
    // Scored before the claim, not after, so the row the claim inserts already
    // carries the numbers. That is what lets the stall re-kick above rebuild
    // the same plan instead of a de-personalised one.
    const adherence = await scoreCycle(user.id, { ...row, started_at: startedAt });
    const { claimed } = await markPlanGenerating(user.id, nextCycle, adherence);
    if (claimed) after(() => generatePlan(user.id, { cycle: nextCycle, adherence }));
    return NextResponse.json({ status: "generating", cycle: nextCycle });
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
      tasks: week.tasks.map((t) => ({
          key: t.key,
          pillar: t.pillar,
          title: t.title,
          why: t.why,
          cadence: t.cadence,
          target: t.target,
          doneToday: countIn(t.key, date, date),
          doneThisWeek: countIn(t.key, weekStart, weekEnd),
          // The main work, and only the main work — every adherence and volume
          // read in this app measures this array.
          exercises: hydrateExercises(t, includeMedia),
          // The bookends around it. Undefined on a session that wants none (a
          // snack, a walk), so the app draws no empty section.
          warmup: sessionWarmup(t, includeMedia),
          // Bone loading, between the work and the cool-down. Undefined on the
          // same sessions the bookends skip, and on every plan generated before
          // it existed — the app draws the section only when it is present.
          power: sessionPower(t, includeMedia),
          // How many of the week's sessions that block belongs to. The plan
          // holds one session repeated `target` times, so this is the only way
          // "twice a week" can be said; the app counts completions against it.
          powerSessions: t.powerSessions,
          cooldown: sessionCooldown(t, includeMedia),
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
    // Which eight weeks these are. 1 is the plan she bought; the app compares
    // this against the last cycle it showed her to know when to run the recap.
    cycle: row.cycle,
    startedAt,
    currentWeek,
    weeks,
    nutrition,
    habits: habitRows,
    resistSuggestions,
    // The guided meditation, offered beside whatever relaxation the plan asked
    // for. Not part of any week, and not something the model schedules — see
    // `meditationMedia()`. Media-gated with the clips, for the same reason: the
    // web dashboard has no player and must not be handed audio it would only
    // pay egress for.
    meditation: includeMedia ? meditationMedia() : undefined,
  });
}
