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
  HeartPulse,
  Frown,
  Shield,
  Droplets,
  Circle,
  type LucideIcon,
} from "lucide-react";

// Map symptom names to Lucide icon components (includes legacy DB names)
export const SYMPTOM_ICON_MAP: Record<string, LucideIcon> = {
  "Hot flashes": Flame,
  "Night sweats": Droplet,
  Palpitations: HeartPulse,
  "Sleep problems": Moon,
  "Mood swings": Heart,
  Irritability: Frown,
  Anxiety: AlertCircle,
  "Brain fog": Brain,
  Fatigue: Zap,
  "Low libido": HeartOff,
  "Vaginal discomfort": Shield,
  "Bladder problems": Droplets,
  "Joint pain": Activity,
  "Weight gain": TrendingUp,
  Headaches: AlertTriangle,
  Bloating: CircleDot,
  Insomnia: Moon,
  Period: Circle,
  "Good Day": Sun,
} as const;

// Get icon component for a symptom name
export function getSymptomIcon(symptomName: string): LucideIcon {
  return SYMPTOM_ICON_MAP[symptomName] || Activity;
}

/** Resolve icon for tracker UI: name map first, then stored Lucide name from DB. */
export function resolveSymptomLucideIcon(symptom: { name: string; icon: string }): LucideIcon {
  const mapped = SYMPTOM_ICON_MAP[symptom.name];
  if (mapped) return mapped;
  if (
    symptom.icon &&
    symptom.icon.length > 1 &&
    !symptom.icon.includes("🔥") &&
    !symptom.icon.includes("💧")
  ) {
    return getIconFromName(symptom.icon);
  }
  return Activity;
}

// Get icon name (string) for a symptom name (for database storage)
export function getSymptomIconName(symptomName: string): string {
  const iconMap: Record<string, string> = {
    "Hot flashes": "Flame",
    "Night sweats": "Droplet",
    Palpitations: "HeartPulse",
    "Sleep problems": "Moon",
    "Mood swings": "Heart",
    Irritability: "Frown",
    Anxiety: "AlertCircle",
    "Brain fog": "Brain",
    Fatigue: "Zap",
    "Low libido": "HeartOff",
    "Vaginal discomfort": "Shield",
    "Bladder problems": "Droplets",
    "Joint pain": "Activity",
    "Weight gain": "TrendingUp",
    Headaches: "AlertTriangle",
    Bloating: "CircleDot",
    Insomnia: "Moon",
    Period: "Circle",
    "Good Day": "Sun",
  };
  return iconMap[symptomName] || "Activity";
}

// Get icon component from icon name (for loading from database)
export function getIconFromName(iconName: string): LucideIcon {
  const nameToComponent: Record<string, LucideIcon> = {
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
    HeartPulse,
    Frown,
    Shield,
    Droplets,
    Circle,
  };
  return nameToComponent[iconName] || Activity;
}

