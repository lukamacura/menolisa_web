import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccountState, TRIAL_SELECT_COLS, type AccountStateRow } from "@/lib/getAccountState";
import { PLAN_WEEKS } from "@/lib/plan/generate";
import {
  dailyNudgeCopy,
  streakRiskCopy,
  weekStartCopy,
  weeklyRecapCopy,
} from "@/lib/alerts/catalog";
import { sendAlerts, type AlertRequest } from "@/lib/alerts/send";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The engagement alerts, in two passes a day (vercel.json).
 *
 *   morning  — the daily nudge, for anyone who has not touched today's plan.
 *   evening  — one of: a new plan week starting, the Sunday recap, a streak
 *              about to break.
 *
 * Money alerts are not here: a renewal is due on a date that has nothing to do
 * with these slots (cron/renewal-notices) and a declined card has to be said
 * the moment Stripe says it (the webhook).
 *
 * **One alert per user per pass.** The evening rules can all fire on the same
 * Sunday, and three pushes in one evening is precisely the noise that gets an
 * app muted. They are ranked instead, and the loser waits for a quieter day.
 *
 * Everything is bulk-read. The old crons ran three or four queries *per user*
 * inside a loop, which is what capped them at a few hundred accounts per run.
 *
 * Timezone caveat: there is nowhere to read a user's timezone from yet, so
 * "today" is the UTC date and the slots fire at one wall-clock time for
 * everyone. `user_plan_logs.date` is written from the client's *local* date, so
 * the two agree except for a few hours either side of midnight. Per-user send
 * times are the natural next step and need only a column on `user_preferences`.
 */

const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const addDays = (d: string, n: number) => new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.floor((asUtc(to) - asUtc(from)) / DAY);

/** A streak shorter than this is not yet worth naming, so it is never at risk. */
const STREAK_WORTH_SAVING = 3;

/** How far back to read logs when measuring a streak. Longer runs simply cap here. */
const STREAK_LOOKBACK_DAYS = 90;

/**
 * User ids per `.in()` filter.
 *
 * PostgREST puts the list in the query string, so one call covering the whole
 * base eventually exceeds the URL limit — and it fails by returning fewer rows,
 * not by erroring. A short read here would look like "nobody was active today"
 * and nudge people who had already done their plan.
 */
const ID_CHUNK = 400;

/**
 * Run an `.in("user_id", …)` read in URL-sized batches and concatenate.
 *
 * The row type is asserted rather than inferred: the generated Supabase types
 * describe an embedded `symptoms (name)` as an array, while PostgREST returns a
 * single object for a many-to-one join, and every call site here reads a handful
 * of named columns it already knows the shape of.
 */
async function selectByUser<T>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

type PlanShape = {
  weeks?: { number: number; title?: string | null }[];
} | null;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slot = req.nextUrl.searchParams.get("slot");
  if (slot !== "morning" && slot !== "evening") {
    return NextResponse.json({ error: "slot must be morning or evening" }, { status: 400 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const supabase = getSupabaseAdmin();

    // ---- who is eligible at all ------------------------------------------
    //
    // Notifications off means no engagement alert, in-app row included. She
    // turned them off; a silent pile waiting in the Alerts tab is not what the
    // switch means.
    const { data: prefRows, error: prefError } = await supabase
      .from("user_preferences")
      .select("user_id, weekly_insights_enabled")
      .eq("notification_enabled", true);

    if (prefError) {
      console.error("cron/alerts: preference read failed", prefError);
      return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
    }

    const candidates = prefRows ?? [];
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, slot, considered: 0, sent: 0 });
    }

    const candidateIds = candidates.map((row) => row.user_id as string);
    const recapEnabled = new Set(
      candidates
        .filter((row) => row.weekly_insights_enabled !== false)
        .map((row) => row.user_id as string)
    );

    // Access is the server's decision, never re-derived from raw columns here.
    const trialRows = await selectByUser<{ user_id: string }>(candidateIds, (batch) =>
      supabase.from("user_trials").select(`user_id, ${TRIAL_SELECT_COLS}`).in("user_id", batch)
    );

    const withAccess = new Set(
      trialRows
        .filter((row) => getAccountState(row as unknown as AccountStateRow).hasAccess)
        .map((row) => row.user_id)
    );

    const userIds = candidateIds.filter((id) => withAccess.has(id));
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, slot, considered: candidateIds.length, sent: 0 });
    }

    const requests =
      slot === "morning"
        ? await buildMorning(supabase, userIds, today)
        : await buildEvening(supabase, userIds, today, recapEnabled);

    const delivered = (await sendAlerts(requests)).filter(Boolean).length;

    return NextResponse.json({
      ok: true,
      slot,
      considered: userIds.length,
      matched: requests.length,
      sent: delivered,
    });
  } catch (e) {
    console.error("cron/alerts error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

// ---------------------------------------------------------------------------
// Morning: the daily nudge
// ---------------------------------------------------------------------------

async function buildMorning(
  supabase: Supabase,
  userIds: string[],
  today: string
): Promise<AlertRequest[]> {
  const [activeRows, planRows, profileRows] = await Promise.all([
    selectByUser<{ user_id: string }>(userIds, (batch) =>
      supabase.from("user_plan_logs").select("user_id").in("user_id", batch).eq("date", today)
    ),
    // No plan means nothing to nudge her towards — hers is still being written.
    selectByUser<{ user_id: string }>(userIds, (batch) =>
      supabase.from("user_plans").select("user_id").in("user_id", batch).eq("status", "ready")
    ),
    selectByUser<{ user_id: string; name: string | null }>(userIds, (batch) =>
      supabase.from("user_profiles").select("user_id, name").in("user_id", batch)
    ),
  ]);

  const activeToday = new Set(activeRows.map((row) => row.user_id));
  const hasPlan = new Set(planRows.map((row) => row.user_id));
  const firstNames = new Map(
    profileRows.map((row) => [row.user_id, (row.name ?? "").trim().split(" ")[0] || null])
  );

  return userIds
    .filter((id) => hasPlan.has(id) && !activeToday.has(id))
    .map((id) => ({
      userId: id,
      kind: "daily_nudge" as const,
      copy: dailyNudgeCopy(firstNames.get(id) ?? null),
      occurrence: today,
    }));
}

// ---------------------------------------------------------------------------
// Evening: at most one of week start, recap, streak risk
// ---------------------------------------------------------------------------

async function buildEvening(
  supabase: Supabase,
  userIds: string[],
  today: string,
  recapEnabled: Set<string>
): Promise<AlertRequest[]> {
  const tomorrow = addDays(today, 1);
  // Sunday evening looks back over the seven days ending today.
  const isSunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const weekAgo = addDays(today, -6);

  type SymptomRow = { user_id: string; symptoms?: { name?: string } | { name?: string }[] | null };

  const [planRows, logRows, symptomRows] = await Promise.all([
    selectByUser<{ user_id: string; started_at: string | null; plan: PlanShape }>(
      userIds,
      (batch) =>
        supabase
          .from("user_plans")
          .select("user_id, started_at, plan")
          .in("user_id", batch)
          .eq("status", "ready")
    ),
    selectByUser<{ user_id: string; date: string }>(userIds, (batch) =>
      supabase
        .from("user_plan_logs")
        .select("user_id, date")
        .in("user_id", batch)
        .gte("date", addDays(today, -STREAK_LOOKBACK_DAYS))
    ),
    isSunday
      ? selectByUser<SymptomRow>(userIds, (batch) =>
          supabase
            .from("symptom_logs")
            .select("user_id, symptoms (name)")
            .in("user_id", batch)
            .gte("logged_at", `${weekAgo}T00:00:00Z`)
        )
      : Promise.resolve([] as SymptomRow[]),
  ]);

  /** Every date each user has any activity on. Drives both streaks and recap. */
  const activeDates = new Map<string, Set<string>>();
  for (const row of logRows) {
    const set = activeDates.get(row.user_id) ?? new Set<string>();
    set.add(row.date);
    activeDates.set(row.user_id, set);
  }

  /** Symptom names per user. Empty strings keep the count right when a join misses. */
  const symptomsByUser = new Map<string, string[]>();
  for (const row of symptomRows) {
    const joined = Array.isArray(row.symptoms) ? row.symptoms[0] : row.symptoms;
    const list = symptomsByUser.get(row.user_id) ?? [];
    list.push(joined?.name ?? "");
    symptomsByUser.set(row.user_id, list);
  }

  const plans = new Map(
    planRows.map((row) => [row.user_id, { startedAt: row.started_at, plan: row.plan }])
  );

  const requests: AlertRequest[] = [];

  for (const userId of userIds) {
    const dates = activeDates.get(userId) ?? new Set<string>();

    // 1. A new plan week starting tomorrow. The most useful thing we can say,
    //    and it only comes round seven times in the whole eight weeks.
    const planEntry = plans.get(userId);
    if (planEntry?.startedAt) {
      const dayIndex = daysBetween(planEntry.startedAt, tomorrow);
      const week = Math.floor(dayIndex / 7) + 1;
      if (dayIndex > 0 && dayIndex % 7 === 0 && week <= PLAN_WEEKS) {
        const title = planEntry.plan?.weeks?.find((w) => w.number === week)?.title ?? null;
        requests.push({
          userId,
          kind: "week_start",
          copy: weekStartCopy(week, title),
          occurrence: String(week),
        });
        continue;
      }
    }

    // 2. The Sunday recap.
    if (isSunday && recapEnabled.has(userId)) {
      const symptoms = (symptomsByUser.get(userId) ?? []).filter(Boolean);
      const activeDays = [...dates].filter((d) => d >= weekAgo && d <= today).length;
      requests.push({
        userId,
        kind: "weekly_recap",
        copy: weeklyRecapCopy({
          activeDays,
          symptomCount: (symptomsByUser.get(userId) ?? []).length,
          topSymptom: mostFrequent(symptoms),
        }),
        occurrence: today,
      });
      continue;
    }

    // 3. A streak she is hours from losing.
    if (!dates.has(today)) {
      const streak = streakEndingOn(dates, addDays(today, -1));
      if (streak >= STREAK_WORTH_SAVING) {
        requests.push({
          userId,
          kind: "streak_risk",
          copy: streakRiskCopy(streak),
          occurrence: today,
        });
      }
    }
  }

  return requests;
}

/**
 * Consecutive active days ending on `lastDay`.
 *
 * Mirrors the rule in lib/rewards/compute.ts — a day counts if she touched
 * anything at all — so the number here is the number her Rewards screen shows.
 */
function streakEndingOn(dates: Set<string>, lastDay: string): number {
  let streak = 0;
  let cursor = lastDay;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function mostFrequent(names: string[]): string | null {
  if (names.length === 0) return null;
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
