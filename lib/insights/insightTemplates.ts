// Insight text templates - pure data reflection, no AI, no medical advice

export type InsightType = 
  | 'frequency' 
  | 'comparison' 
  | 'consistency' 
  | 'trigger_pattern' 
  | 'time_pattern' 
  | 'good_days' 
  | 'severity';

export interface InsightData {
  type: InsightType;
  content: string;
  data: Record<string, any>;
}

// Frequency insight: "You logged X symptoms this week. Most frequent: Y (Z)."
export function generateFrequencyInsight(
  totalLogs: number,
  mostFrequent: { name: string; count: number }[]
): InsightData | null {
  if (totalLogs === 0) return null;
  
  const topSymptom = mostFrequent[0];
  if (!topSymptom) return null;
  
  const content = `You logged ${totalLogs} symptom${totalLogs === 1 ? '' : 's'} this week. Most frequent: ${topSymptom.name} (${topSymptom.count}).`;
  
  return {
    type: 'frequency',
    content,
    data: { totalLogs, mostFrequent: mostFrequent.slice(0, 3) }
  };
}

// Comparison insight: "X: Y this week vs. Z last week."
export function generateComparisonInsight(
  symptomName: string,
  thisWeek: number,
  lastWeek: number
): InsightData | null {
  if (thisWeek === 0 && lastWeek === 0) return null;
  if (lastWeek === 0) return null; // Only show if we have last week data
  
  const content = `${symptomName}: ${thisWeek} this week vs. ${lastWeek} last week.`;
  
  return {
    type: 'comparison',
    content,
    data: { symptomName, thisWeek, lastWeek }
  };
}

// Consistency insight: "You tracked X out of 7 days this week."
export function generateConsistencyInsight(daysTracked: number): InsightData {
  const content = `You tracked ${daysTracked} out of 7 days this week.`;
  
  return {
    type: 'consistency',
    content,
    data: { daysTracked }
  };
}

// Trigger pattern insight: "You tagged 'X' on Y logs this week."
export function generateTriggerPatternInsight(
  triggerName: string,
  count: number
): InsightData {
  const content = `You tagged '${triggerName}' on ${count} log${count === 1 ? '' : 's'} this week.`;
  
  return {
    type: 'trigger_pattern',
    content,
    data: { triggerName, count }
  };
}

// Time pattern insight: "Most symptoms logged in the [time]."
export function generateTimePatternInsight(
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night',
  count: number
): InsightData | null {
  if (count < 4) return null; // Only show if 4+ symptoms at same time
  
  const timeLabel = timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1);
  const content = `Most symptoms logged in the ${timeOfDay}.`;
  
  return {
    type: 'time_pattern',
    content,
    data: { timeOfDay, count }
  };
}

// Good days insight: "You had X good days this week."
export function generateGoodDaysInsight(count: number): InsightData | null {
  if (count === 0) return null;
  
  const content = `You had ${count} good day${count === 1 ? '' : 's'} this week.`;
  
  return {
    type: 'good_days',
    content,
    data: { count }
  };
}

// Severity insight: "Severity: X mild, Y moderate, Z severe."
export function generateSeverityInsight(
  mild: number,
  moderate: number,
  severe: number
): InsightData | null {
  const total = mild + moderate + severe;
  if (total < 3) return null; // Only show if 3+ logs
  
  const parts: string[] = [];
  if (mild > 0) parts.push(`${mild} mild`);
  if (moderate > 0) parts.push(`${moderate} moderate`);
  if (severe > 0) parts.push(`${severe} severe`);
  
  if (parts.length === 0) return null;
  
  const content = `Severity: ${parts.join(', ')}.`;
  
  return {
    type: 'severity',
    content,
    data: { mild, moderate, severe, total }
  };
}
