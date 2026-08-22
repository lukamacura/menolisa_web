import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { computeHistory, type PlanLogRow } from "@/lib/plan/history";
import type { Plan } from "@/lib/plan/generate";

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
 * Her eight weeks, scored day by day, for the progress grid.
 *
 * Read-only and derived — see `lib/plan/history.ts` for the scoring rule. There
 * is no date range to pass: the plan is always eight weeks from `started_at`,
 * so the span is a fact about her, not a client decision.
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

  const { data: row, error } = await supabaseAdmin
    .from("user_plans")
    .select("status, plan, started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Plan history: fetch failed:", error);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
  if (!row || row.status !== "ready" || !row.plan) {
    return NextResponse.json({ error: "No plan yet" }, { status: 404 });
  }

  // `started_at` is stamped by the first `GET /api/plan`, which the app always
  // calls before this one. Falling back to today keeps a missing stamp rendering
  // as day 1 rather than throwing.
  const startedAt: string = row.started_at ?? date;

  const { data: logs, error: logsError } = await supabaseAdmin
    .from("user_plan_logs")
    .select("task_key, date, count")
    .eq("user_id", user.id)
    .gte("date", startedAt);

  // The logs are the whole payload. Scoring a partial history would show her a
  // grid of days she is sure she completed sitting empty, which is worse than
  // an error she can pull to retry.
  if (logsError) {
    console.error("Plan history: log fetch failed:", logsError);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }

  return NextResponse.json(
    computeHistory({
      date,
      startedAt,
      plan: row.plan as Plan,
      logs: (logs ?? []) as PlanLogRow[],
    })
  );
}
