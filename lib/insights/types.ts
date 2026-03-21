// Types for AI-generated insights

export interface InsightDataPoints {
  symptomLogs: number;
  chatSessions: number;
  daysWindow: number; // always 14
}

export interface InsightResponse {
  patternHeadline: string;
  why: string;
  whatsWorking?: string | null;
  actionSteps: {
    easy: string;     // UI label: "STARTS HERE (when low on energy)"
    medium: string;   // UI label: "WHEN YOU HAVE A BIT MORE IN YOU"
    advanced: string; // UI label: "IF YOU WANT TO GO DEEPER"
  };
  doctorNote: string;
  trend: 'improving' | 'worsening' | 'stable';
  whyThisMatters?: string;
  // Metadata fields
  generatedAt: string;        // ISO 8601 timestamp — always set server-side
  dataPoints: InsightDataPoints;
}

export interface InsightApiResponse {
  insight: InsightResponse;
  cached: boolean;
  stale?: boolean; // true when returning old data while regenerating in background
}

// UI display labels for actionSteps keys
export const ACTION_LABELS = {
  easy:     'STARTS HERE (when low on energy)',
  medium:   'WHEN YOU HAVE A BIT MORE IN YOU',
  advanced: 'IF YOU WANT TO GO DEEPER',
} as const;
