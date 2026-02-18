import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { sendPushNotification } from "@/lib/sendPushNotification";

export const runtime = "nodejs";

// This endpoint is called by Vercel Cron once per day at 9:00 AM UTC
// It sends daily reminders to all users who:
// - Have notifications enabled
// - Haven't logged symptoms today
// - Haven't received a reminder today already
// - Have an active trial

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const now = new Date();
    
    // Get today's date range in UTC
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    const todayEnd = new Date(today);
    todayEnd.setUTCHours(23, 59, 59, 999);
    const todayEndStr = todayEnd.toISOString();

    // Fetch all users who have notifications enabled (no time filtering)
    const { data: users, error: usersError } = await supabaseAdmin
      .from("user_preferences")
      .select("user_id")
      .eq("notification_enabled", true);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json(
        { error: "Failed to fetch users" },
        { status: 500 }
      );
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ 
        message: "No users with notifications enabled",
        count: 0,
        timestamp: now.toISOString(),
      });
    }

    let notificationsCreated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each user
    for (const userPref of users) {
      try {
        // Check if user has already logged symptoms today
        const { data: symptomLogs, error: logsError } = await supabaseAdmin
          .from("symptom_logs")
          .select("id")
          .eq("user_id", userPref.user_id)
          .gte("logged_at", todayStart)
          .lte("logged_at", todayEndStr)
          .limit(1);

        if (logsError) {
          console.error(`Error checking symptoms for user ${userPref.user_id}:`, logsError);
          errors++;
          continue;
        }

        // Skip if user already logged symptoms today
        if (symptomLogs && symptomLogs.length > 0) {
          skipped++;
          continue;
        }

        // Skip if trial is expired
        const isExpired = await checkTrialExpired(userPref.user_id);
        if (isExpired) {
          skipped++;
          continue;
        }

        // Check if reminder already sent today (prevent duplicates)
        const { data: existingNotification } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("user_id", userPref.user_id)
          .eq("type", "reminder")
          .eq("title", "Time to check in")
          .gte("created_at", todayStart)
          .lte("created_at", todayEndStr)
          .limit(1)
          .maybeSingle();

        if (existingNotification) {
          skipped++;
          continue;
        }

        // Create reminder notification
        const { error: notificationError } = await supabaseAdmin
          .from("notifications")
          .insert([
            {
              user_id: userPref.user_id,
              type: "reminder",
              title: "Time to check in",
              message: "How are you feeling today? Track your symptoms to see patterns.",
              priority: "medium",
              auto_dismiss: true,
              auto_dismiss_seconds: 30,
              show_once: false,
              show_on_pages: [],
              metadata: {
                primaryAction: {
                  label: "Track Now",
                  route: "/dashboard/symptoms",
                  actionType: "navigate",
                },
              },
              seen: false,
              dismissed: false,
            },
          ]);

        if (notificationError) {
          console.error(`Error creating notification for user ${userPref.user_id}:`, notificationError);
          errors++;
        } else {
          notificationsCreated++;
          sendPushNotification({
            userId: userPref.user_id,
            title: "Time to check in",
            body: "How are you feeling today? Track your symptoms to see patterns.",
          }).catch(() => {});
        }
      } catch (error) {
        console.error(`Error processing user ${userPref.user_id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Daily reminders processed`,
      totalUsers: users.length,
      notificationsCreated,
      skipped,
      errors,
      timestamp: now.toISOString(),
    });
  } catch (e) {
    console.error("GET /api/cron/daily-reminders error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
