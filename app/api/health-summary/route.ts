/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchTrackerData, analyzeTrackerData } from "@/lib/trackerAnalysis";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// Format severity number to word
function formatSeverity(severity: number): string {
  if (severity <= 1) return "Mild";
  if (severity <= 2) return "Moderate";
  return "Severe";
}

// Calculate days tracked - only counts logs within the date range
function calculateDaysTracked(symptomLogs: any[], startDate: Date, endDate: Date): { daysTracked: number; totalDays: number; percentage: number } {
  // Normalize dates for comparison (set to start/end of day)
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);
  
  // Only count logs that fall within the date range
  const logsInRange = symptomLogs.filter(log => {
    const logDate = new Date(log.logged_at);
    return logDate >= rangeStart && logDate <= rangeEnd;
  });
  
  // Count unique dates (using local date string to avoid timezone issues)
  const loggedDates = new Set(
    logsInRange.map(log => {
      const d = new Date(log.logged_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  const daysTracked = loggedDates.size;
  
  // Calculate total days in range
  const daysDiff = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = Math.max(1, daysDiff); // At least 1 day
  
  const percentage = Math.min(100, Math.round((daysTracked / totalDays) * 100));
  
  return { daysTracked, totalDays, percentage };
}

// Count good days - with date range filtering
function countGoodDays(symptomLogs: any[], startDate?: Date, endDate?: Date): number {
  let logsToCount = symptomLogs.filter(log => log.symptom_name === "Good Day");
  
  // Filter by date range if provided
  if (startDate && endDate) {
    const rangeStart = new Date(startDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(endDate);
    rangeEnd.setHours(23, 59, 59, 999);
    
    logsToCount = logsToCount.filter(log => {
      const logDate = new Date(log.logged_at);
      return logDate >= rangeStart && logDate <= rangeEnd;
    });
  }
  
  // Count unique dates (using local date to avoid timezone issues)
  const goodDayDates = new Set(
    logsToCount.map(log => {
      const d = new Date(log.logged_at);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  return goodDayDates.size;
}

// Calculate week-by-week breakdown
function calculateWeekByWeek(symptomLogs: any[], startDate: Date, endDate: Date) {
  const weeks: any[] = [];
  const currentDate = new Date(startDate);
  
  let weekNum = 1;
  while (currentDate <= endDate) {
    const weekEnd = new Date(currentDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());
    
    const weekLogs = symptomLogs.filter(log => {
      const logDate = new Date(log.logged_at);
      return logDate >= currentDate && logDate <= weekEnd;
    });
    
    // Filter out "Good Day" from symptom count
    const symptomLogsOnly = weekLogs.filter(log => log.symptom_name !== "Good Day");
    const symptomCount = new Set(symptomLogsOnly.map(log => log.symptom_id)).size;
    
    const avgSeverity = symptomLogsOnly.length > 0
      ? (symptomLogsOnly.reduce((sum, log) => sum + log.severity, 0) / symptomLogsOnly.length).toFixed(1)
      : "0.0";
    
    const goodDays = new Set(
      weekLogs.filter(log => log.symptom_name === "Good Day")
        .map(log => new Date(log.logged_at).toDateString())
    ).size;
    
    weeks.push({
      week: weekNum,
      symptoms: symptomCount,
      avgSeverity,
      goodDays,
    });
    
    currentDate.setDate(currentDate.getDate() + 7);
    weekNum++;
  }
  
  // Calculate trends
  if (weeks.length >= 2) {
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    
    const symptomTrend = lastWeek.symptoms < firstWeek.symptoms ? "↓ Improving" 
      : lastWeek.symptoms > firstWeek.symptoms ? "↑ More symptoms"
      : "→ Stable";
    
    const severityTrend = parseFloat(lastWeek.avgSeverity) < parseFloat(firstWeek.avgSeverity) ? "↓ Better"
      : parseFloat(lastWeek.avgSeverity) > parseFloat(firstWeek.avgSeverity) ? "↑ Higher"
      : "→ Stable";
    
    const goodDaysTrend = lastWeek.goodDays > firstWeek.goodDays ? "↑ Nice!"
      : lastWeek.goodDays < firstWeek.goodDays ? "↓ Fewer"
      : "→ Stable";
    
    return { weeks, symptomTrend, severityTrend, goodDaysTrend };
  }
  
  return { weeks, symptomTrend: "", severityTrend: "", goodDaysTrend: "" };
}

// Calculate trigger frequencies
function calculateTriggerFrequencies(symptomLogs: any[]) {
  const triggerCounts: Record<string, number> = {};
  let totalLogsWithTriggers = 0;
  
  symptomLogs.forEach(log => {
    if (log.triggers && Array.isArray(log.triggers) && log.triggers.length > 0) {
      totalLogsWithTriggers++;
      log.triggers.forEach((trigger: string) => {
        triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
      });
    }
  });
  
  if (totalLogsWithTriggers === 0) return [];
  
  return Object.entries(triggerCounts)
    .map(([name, count]) => ({
      name,
      percentage: Math.round((count / totalLogsWithTriggers) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);
}

// Generate personalized "Things to Explore" based on data
function generateExploreItems(summary: any, symptomLogs: any[]): string[] {
  const items: string[] = [];
  
  // Pattern-based items
  const patterns = summary.plainLanguageInsights.filter((insight: any) => 
    insight.type === 'pattern' || insight.type === 'time-of-day' || insight.type === 'trigger'
  );
  
  patterns.slice(0, 3).forEach((insight: any) => {
    if (insight.type === 'time-of-day' && insight.symptomName && insight.timeOfDay) {
      const timeLabels: Record<string, string> = {
        morning: 'morning (6am-12pm)',
        afternoon: 'afternoon (2-6pm)',
        evening: 'evening (6-10pm)',
        night: 'night (10pm-6am)',
      };
      const timeLabel = timeLabels[insight.timeOfDay as string] || insight.timeOfDay;
      items.push(`Your ${insight.symptomName.toLowerCase()} cluster in the ${timeLabel} - what happens around that time? Lunch? Work stress? Caffeine?`);
    } else if (insight.type === 'trigger' && insight.symptomName && insight.triggerName) {
      items.push(`${insight.symptomName} appears after ${insight.triggerName.toLowerCase()} - consider tracking ${insight.triggerName.toLowerCase()}-free weeks to confirm this pattern.`);
    } else if (insight.text) {
      // Extract actionable part from insight text
      const text = insight.text;
      if (text.includes('sleep')) {
        items.push(`Sleep quality affects your symptoms - improving sleep might help with overall wellness.`);
      } else {
        items.push(text.replace(/\.$/, '') + ' - explore what might be contributing.');
      }
    }
  });
  
  // Default items if not enough patterns
  const defaultItems = [
    "What changes have you noticed over the past month?",
    "Are any symptoms affecting your daily life significantly?",
    "What approaches have you tried so far?",
  ];
  
  // Fill remaining slots with defaults
  while (items.length < 3) {
    const defaultItem = defaultItems[items.length];
    if (defaultItem) items.push(defaultItem);
  }
  
  return items.slice(0, 3);
}

// GET: Generate health summary data (returns JSON, frontend converts to text)
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    
    // Calculate days to fetch based on date range or default
    let days = parseInt(searchParams.get("days") || "30", 10);
    if (startDateParam && endDateParam) {
      const start = new Date(startDateParam);
      const end = new Date(endDateParam);
      days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    // Fetch and analyze tracker data
    const trackerData = await fetchTrackerData(user.id, days);
    const summary = analyzeTrackerData(
      trackerData.symptomLogs,
      trackerData.dailyMood
    );

    // Get user profile for name
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("name")
      .eq("user_id", user.id)
      .single();

    const userName = profile?.name?.trim() || null;

    // Format dates
    const reportStartDate = startDateParam
      ? new Date(startDateParam)
      : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const reportEndDate = endDateParam ? new Date(endDateParam) : new Date();

    // Filter out "Good Day" from symptoms list
    const symptomStatsWithoutGoodDay = Object.entries(summary.symptoms.byName)
      .filter(([name]) => name !== "Good Day")
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 5)
      .map(([name, stats]) => {
        // Find most common severity for this symptom
        const symptomLogs = trackerData.symptomLogs.filter(log => log.symptom_name === name);
        const severityCounts: Record<number, number> = {};
        symptomLogs.forEach(log => {
          severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;
        });
        const mostSeverity = Object.entries(severityCounts)
          .sort(([, a], [, b]) => b - a)[0]?.[0];
        
        return {
          name,
          count: stats.count,
          avgSeverity: stats.avgSeverity,
          mostSeverity: parseInt(mostSeverity || "2"),
          trend: stats.trend,
        };
      });

    // Calculate "At a Glance" metrics
    const daysTracked = calculateDaysTracked(
      trackerData.symptomLogs,
      reportStartDate,
      reportEndDate
    );
    const goodDays = countGoodDays(trackerData.symptomLogs, reportStartDate, reportEndDate);
    
    // Get most common symptoms (excluding Good Day)
    const mostCommonSymptoms = symptomStatsWithoutGoodDay
      .slice(0, 2)
      .map(s => s.name)
      .join(", ");
    
    // Calculate typical severity (most common severity level)
    const allSeverities = trackerData.symptomLogs
      .filter(log => log.symptom_name !== "Good Day")
      .map(log => log.severity);
    const severityCounts: Record<number, number> = {};
    allSeverities.forEach(sev => {
      severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    });
    const typicalSeverity = Object.entries(severityCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 2;

    // Calculate week-by-week
    const weekByWeek = calculateWeekByWeek(
      trackerData.symptomLogs,
      reportStartDate,
      reportEndDate
    );

    // Calculate triggers
    const triggers = calculateTriggerFrequencies(trackerData.symptomLogs);

    // Get patterns (from plain language insights)
    const patterns = summary.plainLanguageInsights
      .filter((insight: any) => 
        insight.type === 'pattern' || 
        insight.type === 'correlation' || 
        insight.type === 'time-of-day' ||
        insight.type === 'trigger'
      )
      .map((insight: any) => insight.text)
      .slice(0, 5);

    // Generate explore items
    const exploreItems = generateExploreItems(summary, trackerData.symptomLogs);

    // Generate report data
    const report = {
      userName,
      dateRange: {
        start: reportStartDate.toISOString(),
        end: reportEndDate.toISOString(),
      },
      atAGlance: {
        daysTracked: daysTracked.daysTracked,
        totalDays: daysTracked.totalDays,
        trackingPercentage: daysTracked.percentage,
        totalSymptoms: trackerData.symptomLogs.filter(log => {
          if (log.symptom_name === "Good Day") return false;
          const logDate = new Date(log.logged_at);
          return logDate >= reportStartDate && logDate <= reportEndDate;
        }).length,
        goodDays,
        mostCommonSymptoms,
        typicalSeverity: parseInt(typicalSeverity.toString()),
      },
      topSymptoms: symptomStatsWithoutGoodDay,
      patterns,
      weekByWeek,
      triggers,
      exploreItems,
    };

    return NextResponse.json({ report });
  } catch (e: any) {
    console.error("GET /api/health-summary error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

