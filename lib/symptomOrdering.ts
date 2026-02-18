import type { Symptom, SymptomLog } from "@/lib/symptom-tracker-constants";

interface SymptomWithScore extends Symptom {
  score: number;
}

/**
 * Smart symptom ordering algorithm
 * Priority:
 * 1. Symptoms logged in last 24 hours
 * 2. Symptoms frequently logged at current time of day
 * 3. Most frequently logged symptoms overall
 * 4. Default symptoms (in original order)
 */
export function orderSymptoms(
  symptoms: Symptom[],
  logs: SymptomLog[],
  limit: number = 6
): Symptom[] {
  if (symptoms.length === 0) return [];
  if (logs.length === 0) {
    // No logs yet - return default symptoms in order
    return symptoms.filter(s => s.is_default).slice(0, limit);
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentTimeOfDay = getTimeOfDay(currentHour);
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Count logs per symptom
  const symptomStats = new Map<string, {
    totalLogs: number;
    logsLast24h: number;
    logsAtThisTime: number;
    lastLogged: Date | null;
  }>();

  // Initialize stats
  symptoms.forEach(symptom => {
    symptomStats.set(symptom.id, {
      totalLogs: 0,
      logsLast24h: 0,
      logsAtThisTime: 0,
      lastLogged: null,
    });
  });

  // Calculate stats from logs
  logs.forEach(log => {
    const stats = symptomStats.get(log.symptom_id);
    if (!stats) return;

    stats.totalLogs++;
    
    const logDate = new Date(log.logged_at);
    if (logDate >= last24Hours) {
      stats.logsLast24h++;
    }

    const logHour = logDate.getHours();
    const logTimeOfDay = getTimeOfDay(logHour);
    if (logTimeOfDay === currentTimeOfDay) {
      stats.logsAtThisTime++;
    }

    if (!stats.lastLogged || logDate > stats.lastLogged) {
      stats.lastLogged = logDate;
    }
  });

  // Calculate scores for each symptom
  const symptomsWithScores: SymptomWithScore[] = symptoms.map(symptom => {
    const stats = symptomStats.get(symptom.id)!;
    
    // Scoring weights:
    // - Last 24h: 100 points per log
    // - At this time of day: 50 points per log (if > 0)
    // - Total frequency: 10 points per log
    // - Default symptoms: +5 bonus
    
    let score = 0;
    score += stats.logsLast24h * 100;
    if (stats.logsAtThisTime > 0) {
      score += stats.logsAtThisTime * 50;
    }
    score += stats.totalLogs * 10;
    if (symptom.is_default) {
      score += 5;
    }

    return {
      ...symptom,
      score,
    };
  });

  // Sort by score (descending), then by default status, then by name
  symptomsWithScores.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.1) {
      return b.score - a.score; // Higher score first
    }
    // If scores are similar, prefer defaults
    if (a.is_default !== b.is_default) {
      return a.is_default ? -1 : 1;
    }
    // Finally, alphabetical by name
    return a.name.localeCompare(b.name);
  });

  return symptomsWithScores.slice(0, limit).map(s => ({
    id: s.id,
    user_id: s.user_id,
    name: s.name,
    icon: s.icon,
    is_default: s.is_default,
    created_at: s.created_at,
  }));
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

