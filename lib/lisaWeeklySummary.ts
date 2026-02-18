/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchTrackerData, analyzeTrackerData } from "./trackerAnalysis";

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  totalSymptoms: number;
  mostFrequentSymptom: string | null;
  topInsights: string[];
  streak: number;
  message: string;
}

/**
 * Generate a conversational weekly summary for Lisa to share with the user
 */
export async function generateWeeklySummary(
  userId: string
): Promise<WeeklySummary | null> {
  const trackerData = await fetchTrackerData(userId, 7); // Last 7 days
  const summary = analyzeTrackerData(
    trackerData.symptomLogs,
    trackerData.dailyMood
  );

  if (trackerData.symptomLogs.length === 0) {
    return null;
  }

  // Calculate streak
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  
  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    checkDate.setHours(0, 0, 0, 0);
    
    const hasLog = trackerData.symptomLogs.some((log) => {
      const logDate = new Date(log.logged_at);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === checkDate.getTime();
    });
    
    if (hasLog) {
      streak++;
    } else {
      if (i === 0) continue;
      break;
    }
  }

  // Get most frequent symptom
  const symptomCounts: Record<string, number> = {};
  trackerData.symptomLogs.forEach((log: any) => {
    const name = log.symptom_name || log.symptoms?.name || "Unknown";
    symptomCounts[name] = (symptomCounts[name] || 0) + 1;
  });

  const mostFrequent = Object.entries(symptomCounts).reduce(
    (max, [name, count]) => (count > max[1] ? [name, count] : max),
    ["", 0]
  );

  // Get top insights
  const topInsights = summary.plainLanguageInsights
    .slice(0, 3)
    .map((insight) => insight.text);

  // Calculate week dates
  const weekEnd = new Date();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  // Generate conversational message
  const message = `Here's your week:

📊 ${summary.symptoms.total} symptoms logged${streak === 7 ? " (you're consistent!)" : ""}
${mostFrequent[0] ? `🔥 ${mostFrequent[0]}: ${mostFrequent[1]} ${mostFrequent[1] === 1 ? "time" : "times"}` : ""}
${topInsights.length > 0 ? `\nOne pattern I noticed: ${topInsights[0]}` : ""}

Anything you want to focus on this week?`;

  return {
    weekStart: weekStart.toLocaleDateString(),
    weekEnd: weekEnd.toLocaleDateString(),
    totalSymptoms: summary.symptoms.total,
    mostFrequentSymptom: mostFrequent[0] || null,
    topInsights,
    streak,
    message,
  };
}

