// Symptom Tracker Constants and Types

import { Smile, Meh, Frown } from "lucide-react";
import { getSymptomIconName } from "./symptomIconMapping";

// Hardcoded trigger options (NOT stored in database)
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

// Default symptom definitions (icon field now stores Lucide icon name instead of emoji)
export const DEFAULT_SYMPTOMS = [
  { name: 'Hot flashes', icon: 'Flame' },
  { name: 'Night sweats', icon: 'Droplet' },
  { name: 'Fatigue', icon: 'Zap' },
  { name: 'Brain fog', icon: 'Brain' },
  { name: 'Mood swings', icon: 'Heart' },
  { name: 'Anxiety', icon: 'AlertCircle' },
  { name: 'Headaches', icon: 'AlertTriangle' },
  { name: 'Joint pain', icon: 'Activity' },
  { name: 'Bloating', icon: 'CircleDot' },
  { name: 'Insomnia', icon: 'Moon' },
  { name: 'Weight gain', icon: 'TrendingUp' },
  { name: 'Low libido', icon: 'HeartOff' },
  { name: 'Period', icon: 'Circle' }
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

