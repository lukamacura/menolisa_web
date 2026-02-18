import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushNotification } from "@/lib/sendPushNotification";

export const runtime = "nodejs";
export const maxDuration = 60;

const MS = { DAY: 24 * 60 * 60 * 1000 };

type TrialRow = {
  user_id: string;
  trial_start: string | null;
  trial_end: string | null;
  trial_days: number | null;
  account_status: string | null;
};

function getTrialState(
  row: TrialRow
): { state: "warning" | "urgent" | "expired"; daysLeft: number } | null {
  const now = Date.now();
  const trialDays = row.trial_days ?? 3;
  const start = row.trial_start ? new Date(row.trial_start).getTime() : now;
  const endMs = row.trial_end
    ? new Date(row.trial_end).getTime()
    : start + trialDays * MS.DAY;
  const remainingMs = Math.max(0, endMs - now);
  const expired = row.account_status === "expired" || remainingMs === 0 || endMs <= now;
  const daysLeft = expired ? 0 : Math.max(0, Math.ceil(remainingMs / MS.DAY));
  const d = Math.floor(remainingMs / MS.DAY);

  if (expired) {
    return { state: "expired", daysLeft: 0 };
  }
  if (d === 0) {
    return { state: "urgent", daysLeft: 0 };
  }
  if (daysLeft >= 1 && daysLeft <= 2) {
    return { state: "warning", daysLeft };
  }
  return null;
}

/**
 * Cron: trial reminders for mobile users.
 * Sends in-app + push notifications when trial is near end or ended.
 * Run daily (e.g. Vercel Cron). At most one trial notification per user per day.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStartStr = todayStart.toISOString();

    // Users in trial (not paid)
    const { data: rows, error: fetchError } = await supabase
      .from("user_trials")
      .select("user_id, trial_start, trial_end, trial_days, account_status")
      .neq("account_status", "paid");

    if (fetchError) {
      console.error("trial-reminders: fetch user_trials error", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch trial users" },
        { status: 500 }
      );
    }

    const users = (rows ?? []) as TrialRow[];
    let sent = 0;

    for (const row of users) {
      const result = getTrialState(row);
      if (!result) continue;

      // Dedupe: at most one trial notification per user per day
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("type", "trial")
        .gte("created_at", todayStartStr)
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      let title: string;
      let message: string;
      let priority: "high" | "medium" = "medium";

      if (result.state === "expired") {
        title = "Trial ended";
        message = "Your trial has ended. Manage your subscription at menolisa.com to continue.";
        priority = "high";
      } else if (result.state === "urgent") {
        title = "Trial Ending Today";
        message = "Your trial ends today. Manage your subscription at menolisa.com.";
        priority = "high";
      } else {
        title = "Trial Ending Soon";
        message = `Your trial ends in ${result.daysLeft} ${result.daysLeft === 1 ? "day" : "days"}. Manage your subscription at menolisa.com.`;
        priority = "medium";
      }

      const { error: insertError } = await supabase.from("notifications").insert([
        {
          user_id: row.user_id,
          type: "trial",
          title,
          message,
          priority,
          show_once: false,
          metadata: {
            primaryAction: {
              label: "Manage subscription",
              route: "/dashboard/settings",
              actionType: "open_settings",
            },
          },
        },
      ]);

      if (insertError) {
        console.warn("trial-reminders: insert notification failed", row.user_id, insertError);
        continue;
      }

      await sendPushNotification({
        userId: row.user_id,
        title,
        body: message,
        skipPreferenceCheck: true,
        data: { action: "upgrade" },
      }).catch((e) => {
        console.warn("trial-reminders: push failed", row.user_id, e);
      });

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent, total: users.length });
  } catch (e) {
    console.error("trial-reminders error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
