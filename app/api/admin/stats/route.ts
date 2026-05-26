import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin panel password. Set ADMIN_PANEL_PASSWORD in .env.local + Vercel.
// Falls back to the agreed value so the page works out of the box.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD || "Lm_.com2006";

type TrialRow = {
  account_status: string | null;
  subscription_ends_at: string | null;
  plan_type: string | null;
  plan_amount: number | null;
};

type RecentSubscriber = {
  user_id: string;
  name: string | null;
  trial_start: string | null;
  account_status: string | null;
  plan_type: string | null;
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [trialsResult, recentTrialsResult] = await Promise.all([
    supabaseAdmin
      .from("user_trials")
      .select("account_status, subscription_ends_at, plan_type, plan_amount")
      .eq("account_status", "paid"),
    supabaseAdmin
      .from("user_trials")
      .select("user_id, trial_start, account_status, plan_type")
      .order("trial_start", { ascending: false })
      .limit(10),
  ]);

  const { data, error } = trialsResult;

  if (error || recentTrialsResult.error) {
    console.error("Admin stats query failed:", error ?? recentTrialsResult.error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  const recentRows = recentTrialsResult.data ?? [];
  const recentUserIds = recentRows.map((r) => r.user_id);

  const { data: profilesData } = await supabaseAdmin
    .from("user_profiles")
    .select("user_id, name")
    .in("user_id", recentUserIds.length > 0 ? recentUserIds : ["00000000-0000-0000-0000-000000000000"]);

  const nameMap = new Map((profilesData ?? []).map((p) => [p.user_id, p.name]));

  const recentSubscribers: RecentSubscriber[] = recentRows.map((r) => ({
    user_id: r.user_id,
    name: nameMap.get(r.user_id) ?? null,
    trial_start: r.trial_start,
    account_status: r.account_status,
    plan_type: r.plan_type,
  }));

  const now = Date.now();
  // "Currently subscribed" = card on file, not past the period end (active + in trial).
  const rows = ((data ?? []) as TrialRow[]).filter((r) => {
    const endsMs = r.subscription_ends_at ? new Date(r.subscription_ends_at).getTime() : 0;
    return !endsMs || endsMs > now;
  });

  let monthlyCount = 0;
  let annualCount = 0;
  let unknownCount = 0;
  let monthlyMrrCents = 0;
  let annualMrrCents = 0;

  for (const r of rows) {
    const amount = typeof r.plan_amount === "number" ? r.plan_amount : 0;
    if (r.plan_type === "monthly") {
      monthlyCount += 1;
      monthlyMrrCents += amount;
    } else if (r.plan_type === "annual") {
      annualCount += 1;
      annualMrrCents += Math.round(amount / 12); // normalize annual to monthly
    } else {
      unknownCount += 1;
    }
  }

  const totalMrrCents = monthlyMrrCents + annualMrrCents;
  const pct = (part: number) => (totalMrrCents > 0 ? Math.round((part / totalMrrCents) * 100) : 0);

  return NextResponse.json({
    totalSubscribers: rows.length,
    monthly: {
      count: monthlyCount,
      mrr: monthlyMrrCents / 100,
      percent: pct(monthlyMrrCents),
    },
    annual: {
      count: annualCount,
      mrr: annualMrrCents / 100,
      percent: pct(annualMrrCents),
    },
    unknownCount,
    totalMrr: totalMrrCents / 100,
    recentSubscribers,
  });
}
