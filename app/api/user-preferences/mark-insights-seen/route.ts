/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { PlainLanguageInsight } from "@/lib/trackerAnalysis";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// Helper: Create a unique key for an insight to check if it's been seen
function getInsightKey(insight: PlainLanguageInsight): string {
  // Create a unique identifier based on insight type and key fields
  const parts: string[] = [insight.type];
  
  if (insight.symptomName) parts.push(`symptom:${insight.symptomName}`);
  if (insight.triggerName) parts.push(`trigger:${insight.triggerName}`);
  if (insight.timeOfDay) parts.push(`time:${insight.timeOfDay}`);
  if (insight.changeDirection) parts.push(`change:${insight.changeDirection}`);
  
  return parts.join('|');
}

// Helper: Check if an insight matches a seen insight
function insightsMatch(insight: PlainLanguageInsight, seen: any): boolean {
  if (seen.type !== insight.type) return false;
  
  // Match based on type-specific fields
  switch (insight.type) {
    case 'trigger':
      return seen.symptom === insight.symptomName && seen.trigger === insight.triggerName;
    case 'time-of-day':
      return seen.symptom === insight.symptomName && seen.timeOfDay === insight.timeOfDay;
    case 'progress':
      return seen.symptom === insight.symptomName && seen.changeDirection === insight.changeDirection;
    case 'correlation':
      return seen.symptom === insight.symptomName;
    case 'pattern':
      return seen.symptom === insight.symptomName;
    default:
      return false;
  }
}

// POST: Mark insights as seen
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { insights } = body as { insights: PlainLanguageInsight[] };

    if (!insights || !Array.isArray(insights)) {
      return NextResponse.json(
        { error: "Invalid request: insights must be an array" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Get current user preferences
    const { data: currentPrefs, error: fetchError } = await supabaseAdmin
      .from("user_preferences")
      .select("last_seen_insights")
      .eq("user_id", user.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
      console.error("Error fetching user preferences:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch user preferences" },
        { status: 500 }
      );
    }

    const existingSeen: any[] = currentPrefs?.last_seen_insights || [];
    const now = new Date().toISOString();

    // Add new insights to seen list, avoiding duplicates
    const newSeenInsights: any[] = [...existingSeen];

    for (const insight of insights) {
      // Check if this insight is already in the seen list
      const alreadySeen = newSeenInsights.some(seen => insightsMatch(insight, seen));
      
      if (!alreadySeen) {
        // Create a seen insight object
        const seenInsight: any = {
          type: insight.type,
          seen_at: now,
        };

        // Add type-specific fields
        if (insight.symptomName) seenInsight.symptom = insight.symptomName;
        if (insight.triggerName) seenInsight.trigger = insight.triggerName;
        if (insight.timeOfDay) seenInsight.timeOfDay = insight.timeOfDay;
        if (insight.changeDirection) seenInsight.changeDirection = insight.changeDirection;
        if (insight.changePercent) seenInsight.changePercent = insight.changePercent;

        newSeenInsights.push(seenInsight);
      }
    }

    // Update user preferences
    const { error: updateError } = await supabaseAdmin
      .from("user_preferences")
      .upsert({
        user_id: user.id,
        last_seen_insights: newSeenInsights,
        insights_generated_at: now,
      }, {
        onConflict: 'user_id',
      });

    if (updateError) {
      console.error("Error updating user preferences:", updateError);
      return NextResponse.json(
        { error: "Failed to update user preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      marked: insights.length,
      total_seen: newSeenInsights.length,
    });
  } catch (e: any) {
    console.error("POST /api/user-preferences/mark-insights-seen error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

