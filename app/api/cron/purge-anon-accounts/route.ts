import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Cron: delete abandoned anonymous accounts (daily, see vercel.json).
 *
 * `/register` mints an anonymous account for every woman who finishes the quiz,
 * so the ones who never reach checkout accumulate — and Supabase bills monthly
 * active users. A week is long enough that someone who bookmarked the paywall
 * and came back on the weekend still finds her plan waiting.
 *
 * All the safety lives in purge_stale_anonymous_users() (see
 * scripts/sql/2026-08-10-anonymous-funnel-accounts.sql): it will not touch an
 * account that has an email or a paid subscription, whatever this route asks
 * for.
 */
const PURGE_AFTER_HOURS = 24 * 7;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("purge_stale_anonymous_users", {
    p_older_than_hours: PURGE_AFTER_HOURS,
  });

  if (error) {
    console.error("purge-anon-accounts failed:", error);
    return NextResponse.json({ error: "Failed to purge anonymous accounts" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, purged: data ?? 0 });
}
