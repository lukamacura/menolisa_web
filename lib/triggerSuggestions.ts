import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { TRIGGER_OPTIONS } from "@/lib/symptom-tracker-constants";

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
  symptomId: string,
  logs: SymptomLog[],
  limit: number = 3
): string[] {
  // Filter logs for this symptom
  const symptomLogs = logs.filter(log => log.symptom_id === symptomId);
  
  if (symptomLogs.length === 0) {
    // No logs yet - return default triggers based on symptom name (we'll enhance this later)
    return getDefaultTriggersForSymptom(symptomId, limit);
  }

  // Count trigger frequency
  const triggerCount = new Map<string, number>();
  symptomLogs.forEach(log => {
    if (log.triggers && log.triggers.length > 0) {
      log.triggers.forEach(trigger => {
        triggerCount.set(trigger, (triggerCount.get(trigger) || 0) + 1);
      });
    }
  });

  if (triggerCount.size === 0) {
    // No triggers logged yet - return defaults
    return getDefaultTriggersForSymptom(symptomId, limit);
  }

  // Sort triggers by frequency
  const sortedTriggers = Array.from(triggerCount.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([trigger]) => trigger)
    .slice(0, limit);

  return sortedTriggers;
}

/**
 * Get default triggers for a symptom based on common patterns
 */
function getDefaultTriggersForSymptom(symptomId: string, limit: number): string[] {
  // This is a fallback - we could enhance this with symptom-specific defaults
  // For now, return the most common triggers globally
  return TRIGGER_OPTIONS.slice(0, limit);
}

/**
 * Get remaining triggers (not in suggested list)
 */
export function getRemainingTriggers(suggested: string[]): string[] {
  return TRIGGER_OPTIONS.filter(trigger => !suggested.includes(trigger));
}

