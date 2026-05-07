import { Moon, Wind, Apple, Dumbbell, Pill, HeartPulse, LucideIcon } from "lucide-react";
import { Pillar } from "../data/questions";

export const PILLAR_ICONS: Record<Pillar, LucideIcon> = {
  sleep: Moon,
  stress: Wind,
  nutrition: Apple,
  movement: Dumbbell,
  supplements: Pill,
  hrt: HeartPulse,
};
