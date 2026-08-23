import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { computeRewards, type PlanLogRow, type PlanShape } from "@/lib/rewards/compute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const daysBetween = (from: string, to: string) => Math.floor((asUtc(to) - asUtc(from)) / DAY);

/** Her local date, from the client. Rejected if more than a day off ours — travel is fine, tampering isn't. */
function resolveDate(param: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param) || Number.isNaN(asUtc(param))) return today;
  return Math.abs(daysBetween(today, param)) <= 1 ? param : today;
}

/**
 * Her XP, level, streak and every achievement, derived from history.
 *
 * Read-only: this route writes nothing, and no other route writes anything on
 * its behalf. Ticking a box in `POST /api/plan/complete` is what moves these
 * numbers, which is why they can never disagree with what she actually did.
 *
 * Unlike `GET /api/plan` this does not need a generated plan — the stored plan
 * is used only to tell a movement tick from a relaxation one, and its absence
 * degrades to a key heuristic rather than an error. Rewards keep working while
 * a plan is still being written.
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

  const [planResult, logsResult, symptomResult] = await Promise.all([
    // Every cycle, oldest first. Rewards need both ends of that list and they
    // are not the same row: the plan being scored is her newest one, while the
    // week origin is her *first* start date. Bucketing weekly XP from the
    // current cycle instead would shift every week boundary at a rollover and
    // hand her a half-week that scores as a bad one.
    supabaseAdmin
      .from("user_plans")
      .select("cycle, plan, started_at")
      .eq("user_id", user.id)
      .order("cycle", { ascending: true }),
    // No date floor: XP and lifetime badges count everything she has ever done,
    // including ticks logged before `started_at` was stamped.
    supabaseAdmin.from("user_plan_logs").select("task_key, date, count").eq("user_id", user.id),
    supabaseAdmin.from("symptom_logs").select("logged_at").eq("user_id", user.id),
  ]);

  // A reward screen is never worth failing a request over, but silently scoring
  // a partial history would show her a streak that is quietly wrong — and the
  // logs are the one input nothing else can stand in for.
  if (logsResult.error) {
    console.error("Rewards: log fetch failed:", logsResult.error);
    return NextResponse.json({ error: "Failed to load rewards" }, { status: 500 });
  }
  if (planResult.error) console.error("Rewards: plan fetch failed:", planResult.error);
  if (symptomResult.error) console.error("Rewards: symptom fetch failed:", symptomResult.error);

  const cycleRows = (planResult.data ?? []) as {
    cycle: number;
    plan: unknown;
    started_at: string | null;
  }[];

  const payload = computeRewards({
    date,
    plan: (cycleRows.length ? cycleRows[cycleRows.length - 1].plan : null) as PlanShape,
    startedAt: cycleRows.find((r) => r.started_at)?.started_at ?? null,
    logs: (logsResult.data ?? []) as PlanLogRow[],
    symptomTimestamps: (symptomResult.data ?? [])
      .map((row) => row.logged_at as string)
      .filter(Boolean),
  });

  return NextResponse.json(payload);
}
