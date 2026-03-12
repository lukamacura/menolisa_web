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

    // Pre-fetch names for all users in one query
    const userIds = users.map(u => u.user_id);
    const { data: profileRows } = await supabase
      .from("user_profiles")
      .select("user_id, name")
      .in("user_id", userIds);
    const nameMap = new Map((profileRows || []).map(p => [p.user_id, p.name as string | null]));

    let sent = 0;

    for (const row of users) {
      const result = getTrialState(row);
      if (!result) continue;

      // Phase 1: skip if same state already sent today
      const { data: sentToday } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("type", "trial")
        .gte("created_at", todayStartStr)
        .limit(1)
        .maybeSingle();

      if (sentToday) continue;

      // Phase 2: delete all prior undismissed trial notifications (supersede old state)
      await supabase
        .from("notifications")
        .delete()
        .eq("user_id", row.user_id)
        .eq("type", "trial")
        .eq("dismissed", false)
        .lt("created_at", todayStartStr);

      // Fetch total log count for this user
      const { count: totalLogs } = await supabase
        .from("symptom_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", row.user_id);
      const logCount = totalLogs ?? 0;

      const firstName = nameMap.get(row.user_id)?.split(" ")[0] ?? null;
      const namePrefix = firstName ? `${firstName}, ` : "";

      let title: string;
      let message: string;
      let priority: "high" | "medium" = "medium";
      let ctaLabel: string;

      if (result.state === "expired") {
        title = "Your access has paused";
        message = logCount > 0
          ? `${namePrefix}your ${logCount} symptom log${logCount === 1 ? "" : "s"} are safe. Reactivate anytime to pick up where you left off.`
          : `${namePrefix}your logs are safe. Reactivate anytime to pick up where you left off.`;
        priority = "high";
        ctaLabel = "Reactivate";
      } else if (result.state === "urgent") {
        title = "Today is your last day";
        message = logCount > 0
          ? `${namePrefix}your trial ends today. You've logged ${logCount} symptom${logCount === 1 ? "" : "s"} — don't lose this data or the patterns Lisa is building.`
          : `${namePrefix}your trial ends today. There's still time to log and let Lisa find your patterns.`;
        priority = "high";
        ctaLabel = "Don't lose my data";
      } else {
        // warning state (1–2 days left)
        if (result.daysLeft === 1) {
          title = "Lisa is still learning about you";
          message = logCount > 0
            ? `${namePrefix}you have 1 day left. I've logged ${logCount} symptom${logCount === 1 ? "" : "s"} with you so far — keep tracking to uncover your patterns.`
            : `${namePrefix}you have 1 day left. There's still time to log and let Lisa find your patterns.`;
        } else {
          title = "Your trial ends in 2 days";
          message = logCount > 0
            ? `${namePrefix}I've been tracking ${logCount} symptom${logCount === 1 ? "" : "s"} with you. Keep your access to see where this goes.`
            : `Your trial ends in 2 days. There's still time to log and let Lisa find your patterns.`;
        }
        priority = "medium";
        ctaLabel = "Keep my access";
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
              label: ctaLabel,
              route: "/checkout",
              actionType: "navigate",
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
