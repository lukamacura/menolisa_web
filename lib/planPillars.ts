/**
 * The shape of the plan: the four things she does each day, and the arc those
 * days follow over the {@link PLAN_WEEKS} weeks.
 *
 * Shared by the /register diagnosis screen (the four-icon row on the
 * plan-is-ready card) and <PlanStage />, which animates both of these *inside*
 * the plan scroll on the same screen. They used to be two static grids stacked
 * under the scroll; the data is the same, the staging isn't.
 *
 * The start screen used to render the first three as its promise, via a `short`
 * field written for its ~84px columns. That row was cut on 2026-08-20 - naming
 * the mechanism before she has decided she wants the outcome is the diagnosis
 * screen's job - and `short` went with it rather than sitting here as a field
 * nothing reads.
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
  /**
   * A real task off a plan day, and the **fallback** - what a surface shows
   * when it has none of her answers to build a real row from.
   *
   * Every one of these four has to exist in `lib/plan/catalog.ts`, because the
   * app is what she opens tomorrow. All four failed that test until
   * 2026-09-08: "10-min walk" is shorter than the shortest walk any level is
   * prescribed (`CARDIO_VOLUME.beginner` opens at 15), "25-30g protein at
   * breakfast" is one third of a row whose `target` is 3, "4-7-8 breathing" is
   * in no `RELAXATION` row at all, and "Lights out by 10:30" is in no
   * `FALLBACK_HABITS` entry. They are now, in order, the medium walk, the
   * protein row as written, `breath_426` (the anchor practice) and
   * `FALLBACK_HABITS[0]`.
   *
   * Where her answers ARE known, do not print these - call
   * {@link buildWeekOneRows} and print what her plan actually opens with.
   */
  task: string;
};

export const PLAN_PILLARS: PlanPillar[] = [
  { key: "movement",   label: "Movement",    icon: Footprints,   tint: "text-sky-500",     chip: "bg-sky-100",     task: "20-min walk" },
  { key: "nutrition",  label: "Nutrition",   icon: Salad,        tint: "text-emerald-500", chip: "bg-emerald-100", task: "25-30g protein, every meal" },
  { key: "relaxation", label: "Relaxation",  icon: Wind,         tint: "text-violet-500",  chip: "bg-violet-100",  task: "4-2-6 breathing" },
  { key: "habits",     label: "Your habits", icon: CheckCircle2, tint: "text-primary",     chip: "bg-primary/10",  task: "Same wake time every day" },
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

// ─── Week 1, as it actually opens for her ────────────────────────────────────

/**
 * Where her plan opens on each pillar, keyed off the answer she just gave.
 * Directional descriptions of what the plan does, not claims about her.
 *
 * These lived in `app/register/page.tsx` until 2026-09-08, where only
 * <TrainingWeekBoard /> could reach them. The paywall needs the same two
 * strings - it is the same week, four screens later - and a second copy of
 * them is a second thing to forget to update.
 */
export const NUTRITION_START: Record<string, string> = {
  skipping: "One real meal, anchored first",
  convenience: "Swaps, not a new diet",
  inconsistent: "Your good days, made repeatable",
  intentional: "Fine-tuned, not rebuilt",
};

export const RELAXATION_START: Record<string, string> = {
  none: "Built from scratch, 3 min",
  occasional: "Turned into a daily one",
  routine: "Kept, aimed at your symptoms",
  want_to: "Started this week, no experience",
};

export type WeekOneRow = {
  /** A {@link PLAN_PILLARS} key - the icon, the chip and the label come from there. */
  key: string;
  /** The line she reads. Hers, and true of the plan she is about to buy. */
  task: string;
  /** The quieter line under it: why that one, or what else the week carries. */
  note?: string;
};

/**
 * Her week 1, one row per pillar, built from her answers and the catalog and
 * **nothing else** - no model call, no copy written for the sales page.
 *
 * This exists because the paywall was printing {@link PLAN_PILLARS}'s four
 * fallback tasks as "Your first week" under a headline saying the card was
 * built around her worst symptom. Four identical rows for every woman, two
 * screens after <TrainingWeekBoard /> had shown her a real week with real
 * numbers on it, and the numbers disagreed: the board said a 15-minute walk
 * every day and two 20-25 minute strength sessions, the paywall said "10-min
 * walk". A card that contradicts the screen before it does not just fail to
 * persuade - it withdraws the personalisation the whole funnel was selling, on
 * the one screen with a price on it.
 *
 * The rule is the reward boards' rule: **a row is either hers or it is not
 * rendered.** Every string below is one of her taps read back
 * ({@link NUTRITION_START}) or a value the generator itself reads
 * (`MOVEMENT_VOLUME`, `cardioForWeek`, `relaxationForSymptom`, `NUTRITION`),
 * so the preview and the plan cannot drift. A pillar with nothing to say is
 * dropped rather than filled in.
 *
 * Habits is the one that can never be hers here: the week's habit is written
 * with the plan, after she pays. So it states the *structure* - one habit,
 * ticked daily, a new one each week - which is true of every plan and invents
 * nothing. It is also the last row, and it only renders if something above it
 * did.
 *
 * `catalog` is passed in rather than imported: this module is in the paywall's
 * and the plan stage's chunks, and `lib/plan/catalog.ts` is the whole exercise,
 * nutrition and relaxation dataset. The import here is `import type`, which is
 * erased, so the cost stays with the caller that already loaded it.
 */
export function buildWeekOneRows(
  catalog: typeof import("@/lib/plan/catalog"),
  answers: {
    fitnessLevel?: string;
    nutritionStyle?: string;
    relaxationStyle?: string;
    topProblems?: string[];
  }
): WeekOneRow[] {
  const rows: WeekOneRow[] = [];
  const { fitnessLevel, nutritionStyle, relaxationStyle } = answers;

  // Movement - the same two tables <TrainingWeekBoard /> drew her seven days
  // from, at their week-1 shape, so the two screens can never disagree.
  const volume = fitnessLevel ? catalog.MOVEMENT_VOLUME[fitnessLevel] : undefined;
  if (volume) {
    const week1 = catalog.cardioForWeek(fitnessLevel ?? null, 1);
    const span =
      volume.maxMinutes > volume.minutes
        ? `${volume.minutes}-${volume.maxMinutes}`
        : `${volume.minutes}`;
    const walk =
      week1.zone2.sessions >= 7
        ? `${week1.zone2.minutes}-min walk every day`
        : `${week1.zone2.minutes}-min walk on ${week1.zone2.sessions} days`;
    rows.push({
      key: "movement",
      task: volume.perDay
        ? `${volume.sessions} one-move bursts a day, ${volume.minutes} min all in`
        : `${volume.sessions} strength sessions, ${span} min each`,
      note: week1.intervals
        ? `plus a ${walk}, and ${week1.intervals} short interval session${week1.intervals > 1 ? "s" : ""}`
        : `plus a ${walk}`,
    });
  }

  // Nutrition - her own answer to "how would you describe your eating right
  // now?", then the row her daily list opens on. `NUTRITION[0]` rather than a
  // retyped "protein at breakfast": that row's `target` is 3, and printing one
  // meal understates the ask by two of them.
  const food = nutritionStyle ? NUTRITION_START[nutritionStyle] : undefined;
  if (food) {
    rows.push({
      key: "nutrition",
      task: food,
      note: `starting with ${catalog.NUTRITION[0].label.toLowerCase()}, every meal`,
    });
  }

  // Relaxation - the practice her worst symptom maps to, through the same
  // function the generator calls when it repairs a week. Her unwind answer is
  // the fallback, not the lead: "hot flash rescue breathing, the moment you
  // feel one starting" is the plan reacting to her, which is what she is
  // buying.
  const problems = (answers.topProblems ?? []).filter(Boolean);
  const unwind = relaxationStyle ? RELAXATION_START[relaxationStyle] : undefined;
  if (problems.length) {
    const item = catalog.relaxationForSymptom(problems);
    rows.push({ key: "relaxation", task: item.label, note: item.use });
  } else if (unwind) {
    rows.push({ key: "relaxation", task: unwind });
  }

  // Habits - structure, never an invented task. See the note above.
  if (rows.length) {
    rows.push({
      key: "habits",
      task: "One habit, ticked daily",
      note: "a new one each week, built on the last",
    });
  }

  return rows;
}

/** The pillar a {@link WeekOneRow} belongs to, for its icon and label. */
export function pillarFor(key: string): PlanPillar | undefined {
  return PLAN_PILLARS.find((p) => p.key === key);
}
