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
 * This route used to send a pre-renewal email and alert. **There are no
 * renewals any more** (2026-09-11): the plan is a single charge that buys
 * PLAN_ACCESS_DAYS of access, so nothing is ever billed again and there is
 * nothing to warn anyone about. The route keeps its name so vercel.json and
 * the runbook need no change.
 *
 * What it still does matters more than it used to. Under a subscription an
 * ending was rare — it meant she had cancelled. Now **every** customer's access
 * ends, on a date she was told once in the welcome email and has almost
 * certainly forgotten, so this alert is the only warning she gets that the app
 * is about to stop working. Do not make it conditional on cancellation.
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

    // **No `subscription_canceled` filter.** It was `.eq(..., true)` while the
    // product was a subscription, because an ending only happened when she had
    // cancelled. With one-time pricing that flag is false for every customer
    // alive, so the filter matched nobody and every access window would have
    // expired in silence — she opens the app one morning and it has stopped,
    // with no warning since the welcome email eight weeks earlier.
    //
    // The window itself is what scopes this now: a row is due an alert when its
    // access ends in ACCESS_ENDING_NOTICE_DAYS. Legacy cancelled subscriptions
    // still match on exactly the same condition, so nothing was lost.
    const { data: due, error } = await supabase
      .from("user_trials")
      .select("user_id, subscription_ends_at")
      .eq("account_status", "paid")
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
