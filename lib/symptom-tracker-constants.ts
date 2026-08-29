// Symptom Tracker Constants and Types
// Canonical symptom list: see mobile app/symptoms.md

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

