/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseAdmin } from "./supabaseAdmin";
import type { SymptomLog } from "./symptom-tracker-constants";

export interface ProactiveCheckIn {
  symptomName: string;
  usualTime: string;
  message: string;
}

/**
 * Analyze user's symptom logs to detect time-of-day patterns
 * Returns proactive check-in suggestions based on patterns
 */
export async function analyzeProactiveCheckIns(
  userId: string,
  days: number = 30
): Promise<ProactiveCheckIn[]> {
  const supabaseAdmin = getSupabaseAdmin();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const { data: logs } = await supabaseAdmin
    .from("symptom_logs")
    .select(`
      *,
      symptoms (name, icon)
    `)
    .eq("user_id", userId)
    .gte("logged_at", cutoffDate.toISOString())
    .order("logged_at", { ascending: false });

  if (!logs || logs.length === 0) {
    return [];
  }

  // Group logs by symptom and time of day
  const patterns: Record<string, Record<string, number>> = {};
  
  logs.forEach((log: any) => {
    const symptomName = log.symptoms?.name || "Unknown";
    const timeOfDay = log.time_of_day || getTimeOfDayFromDate(log.logged_at);
    
    if (!patterns[symptomName]) {
      patterns[symptomName] = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    }
    
    if (timeOfDay && patterns[symptomName][timeOfDay]) {
      patterns[symptomName][timeOfDay]++;
    }
  });

  // Find symptoms with strong time-of-day patterns
  const checkIns: ProactiveCheckIn[] = [];
  const now = new Date();
  const currentHour = now.getHours();
  const currentTimeOfDay = getTimeOfDayFromDate(now.toISOString());

  Object.entries(patterns).forEach(([symptomName, timeCounts]) => {
    const total = Object.values(timeCounts).reduce((a, b) => a + b, 0);
    if (total < 3) return; // Need at least 3 occurrences

    const maxTime = Object.entries(timeCounts).reduce((max, [time, count]) =>
      count > max[1] ? [time, count] : max,
      ["", 0]
    );

    const maxPercentage = (maxTime[1] / total) * 100;
    
    // If this symptom usually occurs at current time of day, suggest check-in
    if (maxTime[0] === currentTimeOfDay && maxPercentage > 40) {
      const timeLabel = {
        morning: "morning",
        afternoon: "afternoon",
        evening: "evening",
        night: "night",
      }[maxTime[0]] || maxTime[0];

      checkIns.push({
        symptomName,
        usualTime: timeLabel,
        message: `Hey! I noticed you usually log ${symptomName} around this time. How are you feeling right now?`,
      });
    }
  });

  return checkIns;
}

function getTimeOfDayFromDate(dateString: string): string {
  const date = new Date(dateString);
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

