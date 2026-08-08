import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_WEEKS } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~6.52 billing periods a year for an 8-week plan. Used to normalize it to MRR. */
const PERIODS_PER_YEAR_8W = 365.25 / (PLAN_WEEKS * 7);

// Admin panel password. Set ADMIN_PANEL_PASSWORD in the env + Vercel.
// No fallback: a default committed to the repo is a published password, and
// this endpoint hands out revenue figures and subscriber names. Unset means the
// panel is closed, which is the right failure mode for an admin surface.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD;

type TrialRow = {
  account_status: string | null;
  subscription_ends_at: string | null;
  plan_type: string | null;
  plan_amount: number | null;
  subscription_canceled: boolean | null;
};

type RecentSubscriber = {
  user_id: string;
  name: string | null;
  created_at: string | null;
  account_status: string | null;
  plan_type: string | null;
};

export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PANEL_PASSWORD is not set — admin stats endpoint disabled");
    return NextResponse.json({ error: "Admin panel is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.password !== "string" || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [trialsResult, recentTrialsResult] = await Promise.all([
    supabaseAdmin
      .from("user_trials")
      .select("account_status, subscription_ends_at, plan_type, plan_amount, subscription_canceled")
      .eq("account_status", "paid"),
    supabaseAdmin
      .from("user_trials")
      .select("user_id, created_at, account_status, plan_type")
      .order("created_at", { ascending: false })
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
    created_at: r.created_at,
    account_status: r.account_status,
    plan_type: r.plan_type,
  }));

  const now = Date.now();
  // MRR = real paying users only: not canceled, period not ended.
  const rows = ((data ?? []) as TrialRow[]).filter((r) => {
    if (r.subscription_canceled) return false;
    const endsMs = r.subscription_ends_at ? new Date(r.subscription_ends_at).getTime() : 0;
    return !endsMs || endsMs > now;
  });

  // plan8w is the only plan sold. Its MRR is normalized from the 8-week charge
  // to a monthly figure so the number is comparable to a monthly subscription.
  let plan8wCount = 0;
  let unknownCount = 0;
  let plan8wMrrCents = 0;

  for (const r of rows) {
    const amount = typeof r.plan_amount === "number" ? r.plan_amount : 0;
    if (r.plan_type === "plan8w") {
      plan8wCount += 1;
      plan8wMrrCents += Math.round((amount * PERIODS_PER_YEAR_8W) / 12);
    } else {
      unknownCount += 1;
    }
  }

  return NextResponse.json({
    totalSubscribers: rows.length,
    plan8w: {
      count: plan8wCount,
      mrr: plan8wMrrCents / 100,
    },
    unknownCount,
    totalMrr: plan8wMrrCents / 100,
    recentSubscribers,
  });
}
