import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateWeeklyInsights, getWeekBoundaries, getPreviousWeekBoundaries } from "@/lib/insights/generateInsights";
import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// GET: Fetch or generate weekly insights
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Get current week boundaries
    const { weekStart, weekEnd } = getWeekBoundaries();
    const { weekStart: prevWeekStart, weekEnd: prevWeekEnd } = getPreviousWeekBoundaries();

    // Check if insights already exist for this week
    const { data: existingInsights } = await supabaseAdmin
      .from("weekly_insights")
      .select("*")
      .eq("user_id", user.id)
      .eq("week_start", weekStart.toISOString().split('T')[0])
      .eq("week_end", weekEnd.toISOString().split('T')[0]);

    // If insights exist and were created recently (within last hour), return them
    if (existingInsights && existingInsights.length > 0) {
      const mostRecent = existingInsights[0];
      const created = new Date(mostRecent.created_at);
      const now = new Date();
      const hoursSinceCreation = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceCreation < 1) {
        // Return existing insights
        return NextResponse.json({
          insights: existingInsights.map(insight => ({
            type: insight.insight_type,
            content: insight.content,
            data: insight.data_json || {},
          })),
          weekStart: weekStart.toISOString().split('T')[0],
          weekEnd: weekEnd.toISOString().split('T')[0],
        });
      }
    }

    // Fetch symptom logs for current week
    const { data: currentWeekLogs, error: currentError } = await supabaseAdmin
      .from("symptom_logs")
      .select(`
        *,
        symptoms (name, icon)
      `)
      .eq("user_id", user.id)
      .gte("logged_at", weekStart.toISOString())
      .lte("logged_at", weekEnd.toISOString())
      .order("logged_at", { ascending: false });

    if (currentError) {
      console.error("Error fetching current week logs:", currentError);
    }

    // Fetch symptom logs for previous week (for comparison)
    const { data: previousWeekLogs, error: prevError } = await supabaseAdmin
      .from("symptom_logs")
      .select(`
        *,
        symptoms (name, icon)
      `)
      .eq("user_id", user.id)
      .gte("logged_at", prevWeekStart.toISOString())
      .lte("logged_at", prevWeekEnd.toISOString())
      .order("logged_at", { ascending: false });

    if (prevError) {
      console.error("Error fetching previous week logs:", prevError);
    }

    // Generate insights
    const insights = generateWeeklyInsights(
      (currentWeekLogs || []) as SymptomLog[],
      (previousWeekLogs || []) as SymptomLog[]
    );

    // Delete old insights for this week (if any)
    await supabaseAdmin
      .from("weekly_insights")
      .delete()
      .eq("user_id", user.id)
      .eq("week_start", weekStart.toISOString().split('T')[0])
      .eq("week_end", weekEnd.toISOString().split('T')[0]);

    // Save new insights to database
    if (insights.length > 0) {
      const insightsToInsert = insights.map(insight => ({
        user_id: user.id,
        insight_type: insight.type,
        content: insight.content,
        data_json: insight.data,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
      }));

      const { error: insertError } = await supabaseAdmin
        .from("weekly_insights")
        .insert(insightsToInsert);

      if (insertError) {
        console.error("Error saving insights:", insertError);
      }
    }

    return NextResponse.json({
      insights,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
    });
  } catch (e) {
    console.error("GET /api/insights/weekly error:", e);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
