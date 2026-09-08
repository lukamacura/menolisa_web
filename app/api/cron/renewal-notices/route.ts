import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { accessEndingCopy } from "@/lib/alerts/catalog";
import { sendAlerts, type AlertRequest } from "@/lib/alerts/send";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Days before a cancelled subscription's access ends that she is told in-app. */
const ACCESS_ENDING_NOTICE_DAYS = 2;

/**
 * Cron: tell every subscriber who has cancelled that her access is about to
 * end. Runs once daily (vercel.json).
 *
 * This route used to send the pre-renewal email and in-app alert too. Both
 * went on 2026-09-08 with weekly billing: the plan charges $4.99 every seven
 * days, and a warning before each one is an email a week to every customer,
 * which is spam rather than chargeback insurance. The paywall and Terms no
 * longer promise a reminder; the welcome email states the weekly charge and
 * the first renewal date once, and Stripe's own receipts can cover the rest.
 * The route keeps its name so vercel.json and the runbook need no change.
 *
 * What is left matters to her rather than to us: a cancelled subscription's
 * end date is the day the app stops working, and this alert is the only place
 * she is told before it happens. `sendAlerts` dedupes on the occurrence, so a
 * daily run sends it once per period end.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = Date.now();
    const from = new Date(now + ACCESS_ENDING_NOTICE_DAYS * 86_400_000);
    const to = new Date(now + (ACCESS_ENDING_NOTICE_DAYS + 1) * 86_400_000);

    const { data: due, error } = await supabase
      .from("user_trials")
      .select("user_id, subscription_ends_at")
      .eq("account_status", "paid")
      .eq("subscription_canceled", true)
      .gte("subscription_ends_at", from.toISOString())
      .lt("subscription_ends_at", to.toISOString());

    if (error) {
      console.error("renewal-notices: query failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    const alerts: AlertRequest[] = (due ?? [])
      .filter((r) => !!r.subscription_ends_at)
      .map((r) => ({
        userId: r.user_id,
        kind: "access_ending",
        copy: accessEndingCopy(new Date(r.subscription_ends_at as string)),
        occurrence: r.subscription_ends_at as string,
      }));

    const alerted = (await sendAlerts(alerts)).filter(Boolean).length;
    return NextResponse.json({ ok: true, alerted });
  } catch (e) {
    console.error("renewal-notices error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
