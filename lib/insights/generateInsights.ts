// Weekly insights generation - pure data calculations, no AI

import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import {
  generateFrequencyInsight,
  generateComparisonInsight,
  generateConsistencyInsight,
  generateTriggerPatternInsight,
  generateTimePatternInsight,
  generateGoodDaysInsight,
  generateSeverityInsight,
  type InsightData,
} from "./insightTemplates";

export interface WeeklyInsight {
  type: string;
  content: string;
  data: Record<string, any>;
}

/**
 * Generate weekly insights from symptom logs
 * Pure data calculations - no AI, no medical advice
 */
export function generateWeeklyInsights(
  currentWeekLogs: SymptomLog[],
  previousWeekLogs: SymptomLog[],
  weekStart: Date,
  weekEnd: Date
): WeeklyInsight[] {
  const insights: WeeklyInsight[] = [];

  // 1. Frequency insight
  if (currentWeekLogs.length > 0) {
    // Count by symptom name
    const symptomCounts = new Map<string, number>();
    currentWeekLogs.forEach(log => {
      const symptomName = log.symptoms?.name || 'Unknown';
      symptomCounts.set(symptomName, (symptomCounts.get(symptomName) || 0) + 1);
    });
    
    const mostFrequent = Array.from(symptomCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    
    const frequencyInsight = generateFrequencyInsight(currentWeekLogs.length, mostFrequent);
    if (frequencyInsight) {
      insights.push(frequencyInsight);
    }
  }

  // 2. Comparison insights (for top symptoms)
  if (currentWeekLogs.length > 0 && previousWeekLogs.length > 0) {
    // Get top symptom from current week
    const symptomCounts = new Map<string, number>();
    currentWeekLogs.forEach(log => {
      const symptomName = log.symptoms?.name || 'Unknown';
      symptomCounts.set(symptomName, (symptomCounts.get(symptomName) || 0) + 1);
    });
    
    const topSymptom = Array.from(symptomCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (topSymptom) {
      // Count in previous week
      const prevWeekCount = previousWeekLogs.filter(
        log => (log.symptoms?.name || 'Unknown') === topSymptom[0]
      ).length;
      
      const comparisonInsight = generateComparisonInsight(
        topSymptom[0],
        topSymptom[1],
        prevWeekCount
      );
      
      if (comparisonInsight) {
        insights.push(comparisonInsight);
      }
    }
  }

  // 3. Consistency insight (always show)
  const uniqueDays = new Set(
    currentWeekLogs.map(log => {
      const date = new Date(log.logged_at);
      return date.toISOString().split('T')[0];
    })
  );
  const consistencyInsight = generateConsistencyInsight(uniqueDays.size);
  insights.push(consistencyInsight);

  // 4. Trigger pattern insights
  const triggerCounts = new Map<string, number>();
  currentWeekLogs.forEach(log => {
    if (log.triggers && Array.isArray(log.triggers)) {
      log.triggers.forEach(trigger => {
        triggerCounts.set(trigger, (triggerCounts.get(trigger) || 0) + 1);
      });
    }
  });
  
  // Show triggers that appear 3+ times
  Array.from(triggerCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2) // Max 2 trigger insights
    .forEach(([trigger, count]) => {
      const triggerInsight = generateTriggerPatternInsight(trigger, count);
      insights.push(triggerInsight);
    });

  // 5. Time pattern insight
  const timeCounts = new Map<string, number>();
  currentWeekLogs.forEach(log => {
    if (log.time_of_day) {
      timeCounts.set(log.time_of_day, (timeCounts.get(log.time_of_day) || 0) + 1);
    }
  });
  
  const topTime = Array.from(timeCounts.entries())
    .sort((a, b) => b[1] - a[1])[0];
  
  if (topTime && topTime[1] >= 4) {
    const timeInsight = generateTimePatternInsight(
      topTime[0] as 'morning' | 'afternoon' | 'evening' | 'night',
      topTime[1]
    );
    if (timeInsight) {
      insights.push(timeInsight);
    }
  }

  // 6. Good days insight
  const goodDaysCount = currentWeekLogs.filter(
    log => (log.symptoms?.name || '').toLowerCase() === 'good day'
  ).length;
  
  const goodDaysInsight = generateGoodDaysInsight(goodDaysCount);
  if (goodDaysInsight) {
    insights.push(goodDaysInsight);
  }

  // 7. Severity insight
  let mild = 0, moderate = 0, severe = 0;
  currentWeekLogs.forEach(log => {
    // Severity is 1-3 in our system (1=mild, 2=moderate, 3=severe)
    if (log.severity === 1) mild++;
    else if (log.severity === 2) moderate++;
    else if (log.severity === 3) severe++;
  });
  
  const severityInsight = generateSeverityInsight(mild, moderate, severe);
  if (severityInsight) {
    insights.push(severityInsight);
  }

  return insights;
}

/**
 * Get week boundaries (rolling 7 days: today - 6 days to today)
 * This matches the Journal view which shows the last 7 days
 */
export function getWeekBoundaries(date: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const d = new Date(date);
  
  // End of week is today (end of day)
  const weekEnd = new Date(d);
  weekEnd.setHours(23, 59, 59, 999);
  
  // Start of week is 6 days ago (start of day) - gives us 7 days total
  const weekStart = new Date(d);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  
  return { weekStart, weekEnd };
}

/**
 * Get previous week boundaries (7 days before current week)
 */
export function getPreviousWeekBoundaries(date: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const { weekStart: currentWeekStart } = getWeekBoundaries(date);
  
  // Previous week ends the day before current week starts
  const prevWeekEnd = new Date(currentWeekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
  prevWeekEnd.setHours(23, 59, 59, 999);
  
  // Previous week starts 6 days before that (7 days total)
  const prevWeekStart = new Date(prevWeekEnd);
  prevWeekStart.setDate(prevWeekStart.getDate() - 6);
  prevWeekStart.setHours(0, 0, 0, 0);
  
  return { weekStart: prevWeekStart, weekEnd: prevWeekEnd };
}
