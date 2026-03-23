import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { getSymptomTriggerList } from "@/lib/symptom-tracker-constants";

/**
 * Get user's custom triggers from user_preferences
 */
export async function getCustomTriggers(userId: string): Promise<string[]> {
  // This would fetch from user_preferences.custom_triggers
  // For now, return empty array - will be implemented when custom_triggers column is added
  return [];
}

/**
 * Save custom trigger to user's library
 */
export async function saveCustomTrigger(userId: string, trigger: string): Promise<void> {
  // This would update user_preferences.custom_triggers array
  // For now, no-op - will be implemented when custom_triggers column is added
}

/**
 * Get suggested triggers for a symptom based on user's historical patterns
 */
export function getSuggestedTriggers(
  symptomName: string,
  symptomId: string,
  logs: SymptomLog[],
  limit: number = 3
): string[] {
  const pool = getTriggerPool(symptomName);
  if (pool.length === 0) return [];

  const symptomLogs = logs.filter((log) => log.symptom_id === symptomId);

  if (symptomLogs.length === 0) {
    return pool.slice(0, limit);
  }

  const triggerCount = new Map<string, number>();
  symptomLogs.forEach((log) => {
    if (log.triggers && log.triggers.length > 0) {
      log.triggers.forEach((trigger) => {
        if (!pool.includes(trigger)) return;
        triggerCount.set(trigger, (triggerCount.get(trigger) || 0) + 1);
      });
    }
  });

  if (triggerCount.size === 0) {
    return pool.slice(0, limit);
  }

  return Array.from(triggerCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([trigger]) => trigger)
    .slice(0, limit);
}

function getTriggerPool(symptomName: string): string[] {
  return [...getSymptomTriggerList(symptomName)];
}

/**
 * Get remaining triggers (not in suggested list) for this symptom's pool only.
 */
export function getRemainingTriggers(suggested: string[], symptomName: string): string[] {
  const pool = getTriggerPool(symptomName);
  return pool.filter((trigger) => !suggested.includes(trigger));
}

