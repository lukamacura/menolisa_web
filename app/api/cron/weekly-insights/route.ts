import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateWeeklyInsights, getWeekBoundaries, getPreviousWeekBoundaries } from "@/lib/insights/generateInsights";
import { sendPushNotification } from "@/lib/sendPushNotification";
import type { SymptomLog } from "@/lib/symptom-tracker-constants";

export const runtime = "nodejs";

// Verify cron secret (if using Vercel Cron)
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Get current week boundaries (Sunday to Saturday)
    const { weekStart, weekEnd } = getWeekBoundaries();
    const { weekStart: prevWeekStart, weekEnd: prevWeekEnd } = getPreviousWeekBoundaries();

    // Get all users with weekly insights enabled
    const { data: users, error: usersError } = await supabaseAdmin
      .from("user_preferences")
      .select("user_id")
      .eq("weekly_insights_enabled", true);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ message: "No users with weekly insights enabled" });
    }

    // Pre-fetch names for all users in one query
    const userIds = users.map(u => u.user_id);
    const { data: profileRows } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, name")
      .in("user_id", userIds);
    const nameMap = new Map((profileRows || []).map(p => [p.user_id, p.name as string | null]));

    let processed = 0;
    let notificationsSent = 0;

    for (const userPref of users) {
      try {
        // Check if insights already generated and sent for this week
        // (No day/time filtering - runs once weekly for all users)
        const { data: existingInsights } = await supabaseAdmin
          .from("weekly_insights")
          .select("id, sent_as_notification")
          .eq("user_id", userPref.user_id)
          .eq("week_start", weekStart.toISOString().split('T')[0])
          .eq("week_end", weekEnd.toISOString().split('T')[0])
          .limit(1);

        if (existingInsights && existingInsights.length > 0 && existingInsights[0].sent_as_notification) {
          // Already sent this week
          continue;
        }

        // Fetch symptom logs for current week
        const { data: currentWeekLogs } = await supabaseAdmin
          .from("symptom_logs")
          .select(`
            *,
            symptoms (name, icon)
          `)
          .eq("user_id", userPref.user_id)
          .gte("logged_at", weekStart.toISOString())
          .lte("logged_at", weekEnd.toISOString());

        // Fetch symptom logs for previous week
        const { data: previousWeekLogs } = await supabaseAdmin
          .from("symptom_logs")
          .select(`
            *,
            symptoms (name, icon)
          `)
          .eq("user_id", userPref.user_id)
          .gte("logged_at", prevWeekStart.toISOString())
          .lte("logged_at", prevWeekEnd.toISOString());

        // Generate insights
        const insights = generateWeeklyInsights(
          (currentWeekLogs || []) as SymptomLog[],
          (previousWeekLogs || []) as SymptomLog[]
        );

        if (insights.length === 0) {
          continue; // No insights to send
        }

        // Delete old insights for this week
        await supabaseAdmin
          .from("weekly_insights")
          .delete()
          .eq("user_id", userPref.user_id)
          .eq("week_start", weekStart.toISOString().split('T')[0])
          .eq("week_end", weekEnd.toISOString().split('T')[0]);

        // Save insights
        const insightsToInsert = insights.map(insight => ({
          user_id: userPref.user_id,
          insight_type: insight.type,
          content: insight.content,
          data_json: insight.data,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          sent_as_notification: true, // Mark as sent
        }));

        await supabaseAdmin
          .from("weekly_insights")
          .insert(insightsToInsert);

        // Create notification
        const totalLogs = currentWeekLogs?.length || 0;
        const mostFrequentName = (currentWeekLogs && currentWeekLogs.length > 0)
          ? (() => {
              const counts: Record<string, number> = {};
              for (const log of currentWeekLogs) {
                const name = (log as { symptoms?: { name: string } }).symptoms?.name;
                if (name) counts[name] = (counts[name] || 0) + 1;
              }
              const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
              return top ? top[0] : null;
            })()
          : null;

        const firstName = nameMap.get(userPref.user_id)?.split(" ")[0] ?? null;
        const namePrefix = firstName ? `${firstName}, ` : "";

        let notificationTitle: string;
        let notificationContent: string;

        if (totalLogs > 0) {
          notificationTitle = "Lisa spotted something this week";
          notificationContent = mostFrequentName
            ? `${namePrefix}I tracked ${totalLogs} symptom${totalLogs === 1 ? "" : "s"} this week. ${mostFrequentName} showed up most — tap to see what I found.`
            : `You logged ${totalLogs} symptom${totalLogs === 1 ? "" : "s"} this week. Tap to see your patterns.`;
        } else {
          notificationTitle = "Your weekly summary is ready";
          notificationContent = "Your weekly summary is ready. Tap to see your insights.";
        }

        await supabaseAdmin
          .from("notifications")
          .insert([{
            user_id: userPref.user_id,
            type: "weekly_insights",
            title: notificationTitle,
            message: notificationContent,
            metadata: {
              weekStart: weekStart.toISOString().split('T')[0],
              weekEnd: weekEnd.toISOString().split('T')[0],
              primaryAction: {
                label: "See my insights",
                route: "/dashboard/overview",
                actionType: "navigate",
              },
            },
          }]);

        sendPushNotification({
          userId: userPref.user_id,
          title: notificationTitle,
          body: notificationContent,
          data: { screen: "Notifications" },
        }).catch(() => {});

        notificationsSent++;
        processed++;
      } catch (userError) {
        console.error(`Error processing user ${userPref.user_id}:`, userError);
        // Continue with next user
      }
    }

    return NextResponse.json({
      message: "Weekly insights processed",
      processed,
      notificationsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("GET /api/cron/weekly-insights error:", e);
    return NextResponse.json(
      { error: "Failed to process weekly insights" },
      { status: 500 }
    );
  }
}
