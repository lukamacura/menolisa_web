import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendRenewalNoticeEmail } from "@/lib/resend";
import { RENEWAL_NOTICE_DAYS } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron: warn every active subscriber RENEWAL_NOTICE_DAYS before her card is
 * charged again. Runs once daily (vercel.json).
 *
 * This replaced the nine-step email sequence on 2026-08-12. The sequence needed
 * a mirror table, two triggers and three SQL functions to answer "who is due for
 * which step"; one email keyed off a date needs a `where` clause. Everything it
 * dropped was either impossible (the p-1…p-6 winback needs an address the funnel
 * never collects) or the app's job now (the engagement drip).
 *
 * Idempotency without a mirror table: `renewal_notice_sent_for` stores the
 * `subscription_ends_at` we notified about. Equal means already warned about
 * *this* renewal; a later period end is a new renewal and arms the notice again,
 * so the same row is good for every cycle without ever being reset.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // A 24h-wide window, so a once-daily run matches each subscriber on exactly
    // one pass. Narrower and a missed run loses the notice entirely; wider and
    // only the sent-marker stops a second send.
    const from = new Date(Date.now() + RENEWAL_NOTICE_DAYS * 86_400_000);
    const to = new Date(from.getTime() + 86_400_000);

    const { data: due, error } = await supabase
      .from("user_trials")
      .select("user_id, subscription_ends_at, renewal_notice_sent_for")
      .eq("account_status", "paid")
      // Already cancelled means no charge is coming, so there is nothing to warn
      // about — telling her anyway reads as a threat to bill her regardless.
      .eq("subscription_canceled", false)
      .gte("subscription_ends_at", from.toISOString())
      .lt("subscription_ends_at", to.toISOString());

    if (error) {
      console.error("renewal-notices: query failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    let sent = 0;
    const errors: { user_id: string; error: string }[] = [];

    for (const row of due ?? []) {
      if (!row.subscription_ends_at) continue;
      // Already warned about this exact renewal.
      if (row.renewal_notice_sent_for === row.subscription_ends_at) continue;

      // The address lives in auth.users, which PostgREST cannot see. Volume here
      // is one lookup per renewing subscriber per day, so a per-row call is
      // cheaper than listing every user.
      const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("name")
        .eq("user_id", row.user_id)
        .maybeSingle();

      const { error: sendError } = await sendRenewalNoticeEmail(
        email,
        profile?.name ?? null,
        new Date(row.subscription_ends_at)
      );

      if (sendError) {
        console.warn("renewal-notices: send failed", row.user_id, sendError);
        errors.push({ user_id: row.user_id, error: sendError.message });
        continue;
      }

      // Marked only after Resend accepted it. A failed send stays unmarked and
      // is retried tomorrow, which is still inside the window.
      const { error: markError } = await supabase
        .from("user_trials")
        .update({ renewal_notice_sent_for: row.subscription_ends_at })
        .eq("user_id", row.user_id);

      if (markError) {
        console.warn("renewal-notices: mark failed", row.user_id, markError);
        errors.push({ user_id: row.user_id, error: `mark: ${markError.message}` });
        continue;
      }

      sent += 1;
    }

    return NextResponse.json({
      ok: true,
      sent,
      ...(errors.length > 0 && { errors }),
    });
  } catch (e) {
    console.error("renewal-notices error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
