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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("user_trials")
    .select("account_status, subscription_ends_at, plan_type, plan_amount")
    .eq("account_status", "paid");

  if (error) {
    console.error("Admin stats query failed:", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

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
  });
}
