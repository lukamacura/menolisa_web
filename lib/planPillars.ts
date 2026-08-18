/**
 * The shape of the plan: the four things she does each day, and the arc those
 * days follow over the {@link PLAN_WEEKS} weeks.
 *
 * Shared by the /register start screen (which shows three pillars as the
 * promise) and <PlanStage />, which animates both of these *inside* the plan
 * scroll on the diagnosis screen. They used to be two static grids stacked
 * under the scroll; the data is the same, the staging isn't.
 */
import { CheckCircle2, Footprints, Salad, Wind, type LucideIcon } from "lucide-react";

export type PlanPillar = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Icon color. */
  tint: string;
  /** The tinted square the icon sits in - the same chip the tracker uses. */
  chip: string;
  /** A real task off a plan day. This is what the app actually asks of her,
      so it has to read like a to-do, not like a benefit. */
  task: string;
  /** The same task at start-screen width. The start screen shows these three
      abreast in ~84px columns, where `task` wraps to four lines and its
      precision ("25-30g") reads as a rule to obey rather than a thing anyone
      can do - the opposite of what that screen needs. <PlanStage /> keeps the
      exact version, because by then she has bought the specificity. */
  short: string;
};

export const PLAN_PILLARS: PlanPillar[] = [
  { key: "movement",   label: "Movement",    icon: Footprints,   tint: "text-sky-500",     chip: "bg-sky-100",     task: "10-min walk",                short: "A 10-min walk" },
  { key: "nutrition",  label: "Nutrition",   icon: Salad,        tint: "text-emerald-500", chip: "bg-emerald-100", task: "25-30g protein at breakfast", short: "Protein at breakfast" },
  { key: "relaxation", label: "Relaxation",  icon: Wind,         tint: "text-violet-500",  chip: "bg-violet-100",  task: "4-7-8 breathing",            short: "2 min of breathing" },
  { key: "habits",     label: "Your habits", icon: CheckCircle2, tint: "text-primary",     chip: "bg-primary/10",  task: "Lights out by 10:30",        short: "Lights out by 10:30" },
];

export type PlanPhase = {
  weeks: string;
  label: string;
  /** Inclusive week range this phase covers - drives the week-by-week fill. */
  from: number;
  to: number;
  /** The dot color the phase's days fill in with, warming toward the finish. */
  dot: string;
};

/** The 8-week arc, so the plan reads as a designed progression rather than a
    to-do list she has to keep up forever. */
export const PLAN_ARC: PlanPhase[] = [
  { weeks: "Week 1–2", label: "Steady the basics",   from: 1, to: 2, dot: "#FFB4D5" },
  { weeks: "Week 3–5", label: "Build on what works", from: 3, to: 5, dot: "#E2609C" },
  { weeks: "Week 6–8", label: "Lock it in",          from: 6, to: 8, dot: "#499F68" },
];

/** The phase a given week (1-based) belongs to. Clamps, so week 0 and week 99
    both resolve to a real phase rather than undefined. */
export function planPhaseForWeek(week: number): PlanPhase {
  return PLAN_ARC.find((p) => week >= p.from && week <= p.to) ?? PLAN_ARC[PLAN_ARC.length - 1];
}
