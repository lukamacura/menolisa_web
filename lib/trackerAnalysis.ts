/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@supabase/supabase-js";
import type { SymptomLog } from "./symptom-tracker-constants";

const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Types
interface SymptomLogWithName extends SymptomLog {
  symptom_name?: string;
  symptom_icon?: string;
}

interface DailyMood {
  id: string;
  user_id: string;
  date: string;
  mood: number; // 1-4 scale: 1=rough, 2=meh, 3=good, 4=great
  created_at: string;
  updated_at: string;
}

export interface PlainLanguageInsight {
  text: string;
  type: 'progress' | 'pattern' | 'correlation' | 'time-of-day' | 'trigger';
  priority: 'high' | 'medium' | 'low';
  // Context data for generating "Ask Lisa" prompts
  symptomName?: string;
  triggerName?: string;
  timeOfDay?: string;
  percentage?: number;
  changeDirection?: 'up' | 'down';
  changePercent?: number;
}

export interface TrackerSummary {
  symptoms: {
    total: number;
    byName: Record<string, { count: number; avgSeverity: number; trend: string }>;
    avgSeverity: number;
    trend: string;
    recent: SymptomLogWithName[];
  };
  mood: {
    total: number;
    weeklyAverage: number;
    trend: string;
    distribution: Record<string, number>; // Count by mood level (1-4)
    recentDays: DailyMood[];
  };
  patterns: {
    correlations: string[];
    insights: string[];
  };
  plainLanguageInsights: PlainLanguageInsight[];
}

// Fetch tracker data for a user
export async function fetchTrackerData(
  userId: string,
  days: number = 30
): Promise<{
  symptomLogs: SymptomLogWithName[];
  dailyMood: DailyMood[];
}> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString();
  const cutoffDateOnly = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD for date column

  const [symptomLogsResult, dailyMoodResult] = await Promise.all([
    supabaseClient
      .from("symptom_logs")
      .select(`
        *,
        symptoms (name, icon)
      `)
      .eq("user_id", userId)
      .gte("logged_at", cutoffISO)
      .order("logged_at", { ascending: false }),
    supabaseClient
      .from("daily_mood")
      .select("*")
      .eq("user_id", userId)
      .gte("date", cutoffDateOnly)
      .order("date", { ascending: false }),
  ]);

  // Transform symptom logs to include name and icon
  const symptomLogs: SymptomLogWithName[] = (symptomLogsResult.data || []).map((log: any) => ({
    ...log,
    symptom_name: log.symptoms?.name,
    symptom_icon: log.symptoms?.icon,
  }));

  return {
    symptomLogs,
    dailyMood: dailyMoodResult.data || [],
  };
}

// Generate plain-language insights
function generatePlainLanguageInsights(
  symptomLogs: SymptomLogWithName[]
): PlainLanguageInsight[] {
  const insights: PlainLanguageInsight[] = [];

  if (symptomLogs.length === 0) {
    return insights;
  }

  // Group logs by symptom name
  const logsBySymptom: Record<string, SymptomLogWithName[]> = {};
  symptomLogs.forEach((log) => {
    const name = log.symptom_name || 'Unknown';
    if (!logsBySymptom[name]) {
      logsBySymptom[name] = [];
    }
    logsBySymptom[name].push(log);
  });

  // Time-of-day analysis
  const timeOfDayCounts: Record<string, Record<string, number>> = {};
  Object.entries(logsBySymptom).forEach(([symptomName, logs]) => {
    timeOfDayCounts[symptomName] = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    logs.forEach((log) => {
      const timeOfDay = log.time_of_day || getTimeOfDayFromDate(log.logged_at);
      if (timeOfDay && timeOfDayCounts[symptomName][timeOfDay]) {
        timeOfDayCounts[symptomName][timeOfDay]++;
      }
    });
  });

  // Find most common time of day for each symptom
  Object.entries(timeOfDayCounts).forEach(([symptomName, counts]) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total >= 3) {
      const maxCount = Math.max(...Object.values(counts));
      const maxTimeOfDay = Object.entries(counts).find(([_, count]) => count === maxCount)?.[0];
      if (maxTimeOfDay && maxCount / total > 0.4) {
        const timeLabel = {
          morning: '6am-12pm',
          afternoon: '12pm-6pm',
          evening: '6pm-10pm',
          night: '10pm-6am',
        }[maxTimeOfDay] || maxTimeOfDay;
        insights.push({
          text: `${symptomName} happen most between ${timeLabel}`,
          type: 'time-of-day',
          priority: 'medium',
        });
      }
    }
  });

  // Trigger analysis
  const triggerFrequency: Record<string, Record<string, number>> = {};
  Object.entries(logsBySymptom).forEach(([symptomName, logs]) => {
    triggerFrequency[symptomName] = {};
    logs.forEach((log) => {
      (log.triggers || []).forEach((trigger) => {
        triggerFrequency[symptomName][trigger] = (triggerFrequency[symptomName][trigger] || 0) + 1;
      });
    });
  });

  Object.entries(triggerFrequency).forEach(([symptomName, triggers]) => {
    const totalLogs = logsBySymptom[symptomName].length;
    Object.entries(triggers).forEach(([trigger, count]) => {
      const percentage = Math.round((count / totalLogs) * 100);
      if (percentage >= 50 && totalLogs >= 3) {
        insights.push({
          text: `${trigger} appears in ${percentage}% of your ${symptomName} logs. Might be worth experimenting with cutting back.`,
          type: 'trigger',
          priority: 'high',
          symptomName,
          triggerName: trigger,
          percentage,
        });
      }
    });
  });

  // Progress analysis (compare last 2 weeks vs first 2 weeks)
  if (symptomLogs.length >= 10) {
    const sortedLogs = [...symptomLogs].sort((a, b) => 
      new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    );
    const firstHalf = sortedLogs.slice(0, Math.floor(sortedLogs.length / 2));
    const secondHalf = sortedLogs.slice(Math.floor(sortedLogs.length / 2));

    Object.entries(logsBySymptom).forEach(([symptomName, allLogs]) => {
      const firstHalfLogs = allLogs.filter(log => 
        firstHalf.some(f => f.id === log.id)
      );
      const secondHalfLogs = allLogs.filter(log => 
        secondHalf.some(s => s.id === log.id)
      );

      if (firstHalfLogs.length >= 3 && secondHalfLogs.length >= 3) {
        const firstCount = firstHalfLogs.length;
        const secondCount = secondHalfLogs.length;
        const firstAvgSeverity = firstHalfLogs.reduce((sum, log) => sum + log.severity, 0) / firstCount;
        const secondAvgSeverity = secondHalfLogs.reduce((sum, log) => sum + log.severity, 0) / secondCount;

        const countChange = ((secondCount - firstCount) / firstCount) * 100;
        const severityChange = ((secondAvgSeverity - firstAvgSeverity) / firstAvgSeverity) * 100;

        if (countChange < -20 && severityChange < -10) {
          insights.push({
            text: `Great news: Your ${symptomName} are down ${Math.round(Math.abs(countChange))}% this week. Severity also dropped from moderate to mild. Whatever you're doing, keep it up!`,
            type: 'progress',
            priority: 'high',
            symptomName,
            changeDirection: 'down',
            changePercent: Math.round(Math.abs(countChange)),
          });
        } else if (countChange > 20 || severityChange > 10) {
          insights.push({
            text: `${symptomName} have increased ${Math.round(countChange)}% - let's discuss strategies to manage this`,
            type: 'progress',
            priority: 'high',
            symptomName,
            changeDirection: 'up',
            changePercent: Math.round(countChange),
          });
        }
      }
    });
  }

  // Day of week patterns
  const dayOfWeekCounts: Record<string, Record<string, number>> = {};
  Object.entries(logsBySymptom).forEach(([symptomName, logs]) => {
    dayOfWeekCounts[symptomName] = {};
    logs.forEach((log) => {
      const day = new Date(log.logged_at).toLocaleDateString('en-US', { weekday: 'long' });
      dayOfWeekCounts[symptomName][day] = (dayOfWeekCounts[symptomName][day] || 0) + 1;
    });
  });

  Object.entries(dayOfWeekCounts).forEach(([symptomName, days]) => {
    const total = Object.values(days).reduce((a, b) => a + b, 0);
    if (total >= 5) {
      const maxDay = Object.entries(days).reduce((max, [day, count]) => 
        count > max[1] ? [day, count] : max, ['', 0]
      );
      const maxDayPercentage = (maxDay[1] / total) * 100;
      if (maxDayPercentage > 30) {
        insights.push({
          text: `${symptomName} peak on ${maxDay[0]}s`,
          type: 'pattern',
          priority: 'medium',
        });
      }
    }
  });

  // Sleep correlation with other symptoms (e.g., brain fog)
  Object.entries(logsBySymptom).forEach(([symptomName, logs]) => {
    if (symptomName === "Insomnia" || symptomName === "Sleep issues") {
      // Find days with sleep issues
      const sleepIssueDays = new Set(
        logs.map(log => new Date(log.logged_at).toDateString())
      );

      // Check correlation with brain fog or other symptoms
      Object.entries(logsBySymptom).forEach(([otherSymptomName, otherLogs]) => {
        if (otherSymptomName !== symptomName && otherSymptomName.toLowerCase().includes('brain')) {
          const brainFogOnSleepDays = otherLogs.filter(log =>
            sleepIssueDays.has(new Date(log.logged_at).toDateString())
          ).length;
          const brainFogOnOtherDays = otherLogs.filter(log =>
            !sleepIssueDays.has(new Date(log.logged_at).toDateString())
          ).length;

          if (brainFogOnSleepDays > 0 && brainFogOnOtherDays > 0) {
            const ratio = brainFogOnSleepDays / (brainFogOnSleepDays + brainFogOnOtherDays);
            if (ratio >= 0.6 && logs.length >= 5) {
              insights.push({
                text: `On days you log poor sleep, ${otherSymptomName} is 2x more likely. Improving sleep might help with clarity.`,
                type: 'correlation',
                priority: 'high',
                symptomName: otherSymptomName,
              });
            }
          }
        }
      });
    }
  });

  // Sort insights by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights.slice(0, 8); // Limit to top 8 insights
}

// Helper to get time of day from date
function getTimeOfDayFromDate(dateString: string): 'morning' | 'afternoon' | 'evening' | 'night' | null {
  const date = new Date(dateString);
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

// Analyze patterns and generate insights
export function analyzeTrackerData(
  symptomLogs: SymptomLogWithName[],
  dailyMood: DailyMood[] = []
): TrackerSummary {
  // Symptoms analysis
  const symptomByName: Record<string, { severities: number[]; dates: Date[] }> = {};
  let totalSeverity = 0;

  symptomLogs.forEach((log) => {
    const name = log.symptom_name || 'Unknown';
    if (!symptomByName[name]) {
      symptomByName[name] = { severities: [], dates: [] };
    }
    symptomByName[name].severities.push(log.severity);
    symptomByName[name].dates.push(new Date(log.logged_at));
    totalSeverity += log.severity;
  });

  const symptomStats: Record<string, { count: number; avgSeverity: number; trend: string }> = {};
  Object.keys(symptomByName).forEach((name) => {
    const data = symptomByName[name];
    const count = data.severities.length;
    const avgSeverity = data.severities.reduce((a, b) => a + b, 0) / count;
    
    // Calculate trend (comparing first half vs second half)
    let trend = "stable";
    if (count >= 4) {
      const mid = Math.floor(count / 2);
      const firstHalf = data.severities.slice(0, mid);
      const secondHalf = data.severities.slice(mid);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const change = ((secondAvg - firstAvg) / firstAvg) * 100;
      
      if (change < -10) trend = "decreasing";
      else if (change > 10) trend = "increasing";
    }
    
    symptomStats[name] = { count, avgSeverity: Math.round(avgSeverity * 10) / 10, trend };
  });

  const avgSeverity = symptomLogs.length > 0 ? totalSeverity / symptomLogs.length : 0;
  
  // Calculate overall symptom trend
  let overallTrend = "stable";
  if (symptomLogs.length >= 4) {
    const mid = Math.floor(symptomLogs.length / 2);
    const firstHalf = symptomLogs.slice(0, mid);
    const secondHalf = symptomLogs.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b.severity, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b.severity, 0) / secondHalf.length;
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    if (change < -10) overallTrend = "decreasing";
    else if (change > 10) overallTrend = "increasing";
  }

  // Mood analysis
  const moodDistribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0 };
  let totalMoodScore = 0;
  
  dailyMood.forEach((m) => {
    moodDistribution[String(m.mood)] = (moodDistribution[String(m.mood)] || 0) + 1;
    totalMoodScore += m.mood;
  });

  // Calculate weekly mood average
  const weekAgoMood = new Date();
  weekAgoMood.setDate(weekAgoMood.getDate() - 7);
  const weekMood = dailyMood.filter((m) => new Date(m.date) >= weekAgoMood);
  const weeklyMoodAverage = weekMood.length > 0 
    ? Math.round((weekMood.reduce((sum, m) => sum + m.mood, 0) / weekMood.length) * 10) / 10 
    : 0;

  // Calculate mood trend (comparing first half vs second half)
  let moodTrend = "stable";
  if (dailyMood.length >= 4) {
    const sortedMood = [...dailyMood].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const mid = Math.floor(sortedMood.length / 2);
    const firstHalf = sortedMood.slice(0, mid);
    const secondHalf = sortedMood.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b.mood, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b.mood, 0) / secondHalf.length;
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 10) moodTrend = "improving";
    else if (change < -10) moodTrend = "declining";
  }

  // Pattern detection
  const correlations: string[] = [];
  const insights: string[] = [];

  // Symptom frequency insights (updated for 1-3 scale)
  Object.entries(symptomStats).forEach(([name, stats]) => {
    if (stats.count >= 5 && stats.avgSeverity >= 2.5) {
      insights.push(`"${name}" appears frequently with high severity (avg ${stats.avgSeverity}/3) - consider discussing with healthcare provider`);
    }
    if (stats.trend === "decreasing") {
      insights.push(`Good news: "${name}" symptoms are trending downward`);
    } else if (stats.trend === "increasing") {
      insights.push(`"${name}" symptoms are increasing - let's discuss strategies to manage this`);
    }
  });

  // Generate plain-language insights
  const plainLanguageInsights = generatePlainLanguageInsights(symptomLogs);

  return {
    symptoms: {
      total: symptomLogs.length,
      byName: symptomStats,
      avgSeverity: Math.round(avgSeverity * 10) / 10,
      trend: overallTrend,
      recent: symptomLogs.slice(0, 5),
    },
    mood: {
      total: dailyMood.length,
      weeklyAverage: weeklyMoodAverage,
      trend: moodTrend,
      distribution: moodDistribution,
      recentDays: dailyMood.slice(0, 7),
    },
    patterns: {
      correlations,
      insights,
    },
    plainLanguageInsights,
  };
}

// Format tracker summary for AI context
export function formatTrackerSummary(summary: TrackerSummary): string {
  const parts: string[] = [];

  parts.push("=== USER TRACKER DATA (Last 30 days) ===");

  // Symptoms
  const todayDateStr = new Date().toISOString().split('T')[0];
  
  parts.push("\nSYMPTOMS:");
  if (summary.symptoms.total === 0) {
    parts.push("- No symptoms logged");
  } else {
    parts.push(`- Total logged: ${summary.symptoms.total}`);
    parts.push(`- Average severity: ${summary.symptoms.avgSeverity}/3`);
    parts.push(`- Overall trend: ${summary.symptoms.trend}`);
    
    if (Object.keys(summary.symptoms.byName).length > 0) {
      parts.push("- By symptom:");
      Object.entries(summary.symptoms.byName).forEach(([name, stats]) => {
        parts.push(`  • ${name}: ${stats.count} occurrences, avg severity ${stats.avgSeverity}/3, trend: ${stats.trend}`);
      });
    }
    
    // Show TODAY's symptoms specifically
    const todaySymptoms = summary.symptoms.recent.filter(log => {
      const logDate = new Date(log.logged_at).toISOString().split('T')[0];
      return logDate === todayDateStr;
    });
    
    if (todaySymptoms.length > 0) {
      const severityLabels: Record<number, string> = { 1: 'mild', 2: 'moderate', 3: 'severe' };
      parts.push("- TODAY's symptom logs:");
      todaySymptoms.forEach(log => {
        const time = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        parts.push(`  • ${time}: ${log.symptom_name || 'Unknown'} (${severityLabels[log.severity] || log.severity})`);
      });
    } else {
      parts.push("- TODAY's symptom logs: None yet");
    }
  }

  // Mood (Daily Check-in)
  parts.push("\nDAILY MOOD:");
  if (summary.mood.total === 0) {
    parts.push("- No mood data logged");
  } else {
    const moodLabels: Record<string, string> = {
      '1': 'Rough day',
      '2': 'Meh',
      '3': 'Good',
      '4': 'Great day'
    };
    parts.push(`- Days logged: ${summary.mood.total}`);
    parts.push(`- Weekly average: ${summary.mood.weeklyAverage}/4`);
    parts.push(`- Mood trend: ${summary.mood.trend}`);
    
    // Show distribution
    const distribution = Object.entries(summary.mood.distribution)
      .filter(([_, count]) => count > 0)
      .map(([mood, count]) => `${moodLabels[mood]}: ${count} days`)
      .join(', ');
    if (distribution) {
      parts.push(`- Distribution: ${distribution}`);
    }
    
    // Show recent mood entries (last 7 days)
    if (summary.mood.recentDays.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      parts.push("- Recent mood (last 7 days):");
      summary.mood.recentDays.slice(0, 7).forEach((m) => {
        const moodDateStr = new Date(m.date).toISOString().split('T')[0];
        const isToday = moodDateStr === todayStr;
        const dateStr = new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const todayLabel = isToday ? ' (TODAY)' : '';
        parts.push(`  • ${dateStr}${todayLabel}: ${moodLabels[String(m.mood)] || m.mood}`);
      });
      
      // Check if today has a mood entry
      const hasTodayMood = summary.mood.recentDays.some(m => 
        new Date(m.date).toISOString().split('T')[0] === todayStr
      );
      if (!hasTodayMood) {
        parts.push("  • NOTE: No mood logged for today yet");
      }
    }
  }

  // Patterns and insights
  if (summary.patterns.correlations.length > 0 || summary.patterns.insights.length > 0) {
    parts.push("\nPATTERNS & INSIGHTS:");
    summary.patterns.correlations.forEach((corr) => parts.push(`- ${corr}`));
    summary.patterns.insights.forEach((insight) => parts.push(`- ${insight}`));
  }

  parts.push("\n=== END TRACKER DATA ===\n");

  return parts.join("\n");
}
