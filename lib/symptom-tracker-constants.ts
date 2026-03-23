// Symptom Tracker Constants and Types
// Canonical symptom list + per-symptom triggers: see mobile app/symptoms.md

import { Smile, Meh, Frown } from "lucide-react";

/** Legacy global trigger chips (custom free-text still allowed in modals). Prefer SYMPTOM_TRIGGERS per symptom. */
export const TRIGGER_OPTIONS = [
  'Stress',
  'Poor sleep',
  'Alcohol',
  'Coffee',
  'Spicy food',
  'Skipped meal',
  'Exercise',
  'Hot weather',
  'Work',
  'Travel',
  'Hormonal',
  'Unknown'
] as const;

/**
 * Triggers shown when logging a symptom (empty array = no trigger step content / skip chips).
 * Aligned with mobile app/symptoms.md.
 */
export const SYMPTOM_TRIGGERS = {
  'Hot flashes': [
    'Alcohol',
    'Caffeine',
    'Spicy food',
    'Warm room / heavy bedding',
    'Stress',
    'Tight or synthetic clothing',
    'Smoking',
  ],
  'Night sweats': [
    'Alcohol',
    'Caffeine',
    'Spicy food',
    'Warm room / heavy bedding',
    'Stress',
    'Tight or synthetic clothing',
    'Smoking',
  ],
  Palpitations: [],
  'Sleep problems': [
    'Late exercise',
    'Heavy meal late at night',
    'High-carb dinner',
    'Skipping meals',
    'Screen time before bed',
    'Stress',
    'Alcohol',
    'Caffeine',
  ],
  'Mood swings': [
    'High caffeine',
    'Alcohol',
    'Poor sleep (night before)',
    'Skipped meals / blood sugar dip',
    'Stress event',
    'Lack of exercise',
    'PMS-like cycle patterns (perimenopause)',
  ],
  Irritability: [],
  Anxiety: [
    'High caffeine',
    'Alcohol',
    'Poor sleep (night before)',
    'Skipped meals / blood sugar dip',
    'Stress event',
    'Lack of exercise',
    'PMS-like cycle patterns (perimenopause)',
  ],
  'Brain fog': [
    'Poor sleep (night before)',
    'Alcohol',
    'Dehydration',
    'High sugar / processed food',
    'Stress',
    'Sedentary day',
  ],
  Fatigue: [],
  'Low libido': [
    'Vaginal discomfort',
    'Poor sleep',
    'Stress & mental overload',
    'Low energy / fatigue',
    'Relationship / emotional disconnect',
    'Mood changes',
    'Medications',
  ],
  'Vaginal discomfort': [],
  'Bladder problems': [],
  'Joint pain': [],
  'Weight gain': [],
} as const satisfies Record<string, readonly string[]>;

export function getSymptomTriggerList(symptomName: string): readonly string[] {
  if (symptomName === "Insomnia") {
    return SYMPTOM_TRIGGERS["Sleep problems"];
  }
  const list = SYMPTOM_TRIGGERS[symptomName as keyof typeof SYMPTOM_TRIGGERS];
  return list ?? [];
}

// Default symptom definitions (icon field stores Lucide icon name). New users only — see symptoms.md (no Period in tracker).
export const DEFAULT_SYMPTOMS = [
  { name: 'Hot flashes', icon: 'Flame' },
  { name: 'Night sweats', icon: 'Droplet' },
  { name: 'Palpitations', icon: 'HeartPulse' },
  { name: 'Sleep problems', icon: 'Moon' },
  { name: 'Mood swings', icon: 'Heart' },
  { name: 'Irritability', icon: 'Frown' },
  { name: 'Anxiety', icon: 'AlertCircle' },
  { name: 'Brain fog', icon: 'Brain' },
  { name: 'Fatigue', icon: 'Zap' },
  { name: 'Low libido', icon: 'HeartOff' },
  { name: 'Vaginal discomfort', icon: 'Shield' },
  { name: 'Bladder problems', icon: 'Droplets' },
  { name: 'Joint pain', icon: 'Activity' },
  { name: 'Weight gain', icon: 'TrendingUp' },
] as const;

// TypeScript Types
export type TriggerOption = typeof TRIGGER_OPTIONS[number];

export interface Symptom {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  is_default: boolean;
  created_at: string;
}

export interface SymptomLog {
  id: string;
  user_id: string;
  symptom_id: string;
  severity: number; // 1-3 (Mild=1, Moderate=2, Severe=3)
  triggers: string[]; // Array of trigger names
  notes: string | null;
  logged_at: string;
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  // Joined fields from symptoms table (Supabase returns as table name)
  symptoms?: {
    name: string;
    icon: string;
  };
}

// Severity levels
export const SEVERITY_LEVELS = {
  MILD: 1,
  MODERATE: 2,
  SEVERE: 3,
} as const;

export const SEVERITY_LABELS = {
  1: { icon: Smile, label: 'Mild', description: 'Noticeable but manageable' },
  2: { icon: Meh, label: 'Moderate', description: 'Affecting my day' },
  3: { icon: Frown, label: 'Severe', description: 'Hard to function' },
} as const;

export interface UserPreferences {
  id: string;
  user_id: string;
  favorite_symptoms: string[]; // Array of symptom IDs
  check_in_time: string; // TIME format
  created_at: string;
}

export interface LogSymptomData {
  symptomId: string;
  severity: number;
  triggers: string[];
  notes: string;
  logId?: string; // Optional: ID of log being edited
  loggedAt?: string; // Optional: ISO timestamp for when symptom occurred (defaults to now)
}

