// Icon mapping utility for symptoms
// Maps symptom names to Lucide React icon names

import {
  Flame,
  Droplet,
  Zap,
  Brain,
  Heart,
  AlertCircle,
  AlertTriangle,
  Activity,
  CircleDot,
  Moon,
  TrendingUp,
  HeartOff,
  Sun,
  type LucideIcon,
} from "lucide-react";

// Map symptom names to Lucide icon components
export const SYMPTOM_ICON_MAP: Record<string, LucideIcon> = {
  'Hot flashes': Flame,
  'Night sweats': Droplet,
  'Fatigue': Zap,
  'Brain fog': Brain,
  'Mood swings': Heart,
  'Anxiety': AlertCircle,
  'Headaches': AlertTriangle,
  'Joint pain': Activity,
  'Bloating': CircleDot,
  'Insomnia': Moon,
  'Weight gain': TrendingUp,
  'Low libido': HeartOff,
  'Good Day': Sun,
} as const;

// Get icon component for a symptom name
export function getSymptomIcon(symptomName: string): LucideIcon {
  return SYMPTOM_ICON_MAP[symptomName] || Activity; // Default to Activity if not found
}

// Get icon name (string) for a symptom name (for database storage)
export function getSymptomIconName(symptomName: string): string {
  const iconMap: Record<string, string> = {
    'Hot flashes': 'Flame',
    'Night sweats': 'Droplet',
    'Fatigue': 'Zap',
    'Brain fog': 'Brain',
    'Mood swings': 'Heart',
    'Anxiety': 'AlertCircle',
    'Headaches': 'AlertTriangle',
    'Joint pain': 'Activity',
    'Bloating': 'CircleDot',
    'Insomnia': 'Moon',
    'Weight gain': 'TrendingUp',
    'Low libido': 'HeartOff',
    'Good Day': 'Sun',
  };
  return iconMap[symptomName] || 'Activity';
}

// Get icon component from icon name (for loading from database)
export function getIconFromName(iconName: string): LucideIcon {
  const nameToComponent: Record<string, LucideIcon> = {
    'Flame': Flame,
    'Droplet': Droplet,
    'Zap': Zap,
    'Brain': Brain,
    'Heart': Heart,
    'AlertCircle': AlertCircle,
    'AlertTriangle': AlertTriangle,
    'Activity': Activity,
    'CircleDot': CircleDot,
    'Moon': Moon,
    'TrendingUp': TrendingUp,
    'HeartOff': HeartOff,
    'Sun': Sun,
  };
  return nameToComponent[iconName] || Activity;
}

