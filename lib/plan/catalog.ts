/**
 * The approved content the 8-week plan is built from.
 *
 * The LLM never writes exercises, nutrition or relaxation copy — it picks ids
 * from these lists. That keeps the plan medically safe, guarantees every task
 * maps to content we actually have, and makes tasks comparable across users.
 */

export type Impact = "none" | "low" | "high";

export type Exercise = {
  id: string;
  name: string;
  props: string;
  /** 1 = anyone, 2 = some equipment/load, 3 = gym or high skill. */
  level: 1 | 2 | 3;
  impact: Impact;
  /** Short, no real setup — usable as a "movement snack". */
  snack: boolean;
};

// Source: docs/plan/exercises.md — all 59 exercises. X01 "Rest day" is an icon,
// not an exercise, so it is not selectable.
const E: [string, string, string, 1 | 2 | 3, Impact, boolean][] = [
  // Lower body — strength
  ["L01", "Box squat", "Sturdy chair", 1, "none", true],
  ["L02", "Bodyweight squat", "None", 1, "none", true],
  ["L03", "Goblet squat", "1 dumbbell", 2, "none", false],
  ["L04", "Barbell back squat", "Barbell, rack", 3, "none", false],
  ["L05", "Step-up", "Stair or low step", 1, "low", true],
  ["L06", "Step-up, loaded", "Stair, 2 dumbbells", 2, "low", false],
  ["L07", "Supported reverse lunge", "1 dumbbell, wall", 2, "none", false],
  ["L08", "Walking lunge, loaded", "2 dumbbells", 3, "none", false],
  // Posterior chain / hinge
  ["P01", "Glute bridge", "Mat", 1, "none", true],
  ["P02", "Glute bridge, weighted", "Mat, 1 dumbbell", 2, "none", false],
  ["P03", "Bent-over dumbbell row", "2 dumbbells", 2, "none", false],
  ["P04", "Romanian deadlift", "2 dumbbells", 2, "none", false],
  ["P05", "Hex bar deadlift", "Hex bar", 3, "none", false],
  // Upper body — push
  ["U01", "Wall push-up", "Wall", 1, "none", true],
  ["U02", "Counter push-up", "Kitchen counter", 1, "none", true],
  ["U03", "Bench / table push-up", "Low table or bench", 2, "none", true],
  ["U04", "Floor push-up", "Floor", 3, "none", false],
  ["U05", "Dumbbell floor press", "2 dumbbells, floor", 2, "none", false],
  ["U06", "Dumbbell bench press", "2 dumbbells, flat bench", 3, "none", false],
  // Upper body — press & pull
  ["U07", "Seated overhead press", "2 dumbbells, chair", 2, "none", false],
  ["U08", "Standing overhead press", "2 dumbbells", 2, "none", false],
  ["U09", "Band row", "Tube band, door anchor", 1, "none", true],
  ["U10", "Band pull-apart", "Flat loop band", 1, "none", true],
  ["U11", "Lat pulldown", "Cable machine", 3, "none", false],
  ["U12", "Weighted pull-up", "Bar, dip belt", 3, "none", false],
  ["U13", "Incline dumbbell row", "2 dumbbells, incline bench", 3, "none", false],
  // Core, stability & carries
  ["C01", "Wall sit", "Wall", 1, "none", true],
  ["C02", "Bird-dog", "Mat", 1, "none", true],
  ["C03", "Hanging knee raise", "Pull-up bar", 3, "none", false],
  ["C04", "Farmer's carry", "2 heavy dumbbells", 2, "none", false],
  ["C05", "Household heavy carry", "Detergent jug, hugged to chest", 1, "none", true],
  ["C06", "Farmer's carry, household", "Grocery bags or jugs", 1, "none", true],
  // Balance
  ["B01", "Single-leg balance, supported", "Counter", 1, "none", true],
  ["B02", "Single-leg balance, unstable", "Foam pad or cushion", 2, "none", true],
  ["B03", "Ball-toss balance", "Foam pad, tennis ball, wall", 3, "none", false],
  ["B04", "Toothbrush single-leg stand", "Sink, toothbrush", 1, "none", true],
  // Bone impact
  ["I01", "Stomping march", "None", 1, "low", true],
  ["I02", "Low hop", "None", 2, "high", true],
  ["I03", "Box drop landing", "8-inch box", 3, "high", false],
  ["I04", "Plyometric skip", "None", 3, "high", false],
  ["I05", "Heel drop", "None", 1, "low", true],
  // Cardio
  ["K01", "Zone 2 walk", "Outdoor path", 1, "low", false],
  ["K02", "Fast walk interval", "Outdoor path", 2, "low", false],
  ["K03", "Recovery stroll / hike", "Path or trail", 1, "low", false],
  ["K04", "Hill power walk", "Incline", 2, "low", false],
  ["K05", "Treadmill incline walk", "Treadmill", 2, "low", false],
  ["K06", "Cycling", "Upright bike", 2, "none", false],
  ["K07", "Assault / spin bike sprint", "Air bike", 3, "none", false],
  ["K08", "Elliptical", "Machine", 2, "none", false],
  ["K09", "Run / sprint", "Outdoor or track", 3, "high", false],
  ["K10", "Sled push", "Weighted sled", 3, "none", false],
  ["K11", "Stair climbing", "Flight of stairs", 2, "low", true],
  ["K12", "Jump rope", "Rope", 3, "high", false],
  ["K13", "Jumping jacks", "None", 2, "high", true],
  ["K14", "High knees in place", "None", 2, "high", true],
  // Mobility & flexibility
  ["M01", "Dynamic floor stretching", "Mat", 1, "none", false],
  ["M02", "Neck circles & shoulder rolls", "None", 1, "none", true],
  ["M03", "Torso twist with arm swings", "None", 1, "none", true],
  ["M04", "Hip circles", "None", 1, "none", true],
];

export const EXERCISES: Exercise[] = E.map(([id, name, props, level, impact, snack]) => ({
  id,
  name,
  props,
  level,
  impact,
  snack,
}));

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const getExercise = (id: string): Exercise | undefined => BY_ID.get(id);

/**
 * The exercises this user may be given.
 *
 * `movement_snacks` is a cadence, not a difficulty — it gets short, no-setup
 * moves she can do many times a day. Joint pain removes high-impact work; that
 * filter runs in code, never in the prompt, so a model can't opt out of it.
 */
export function allowedExercises(
  fitnessLevel: string | null,
  topProblems: string[]
): Exercise[] {
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;
  const snacksOnly = fitnessLevel === "movement_snacks";
  return EXERCISES.filter((e) => {
    if (snacksOnly ? !e.snack : e.level > maxLevel) return false;
    if (topProblems.includes("joint_pain") && e.impact === "high") return false;
    return true;
  });
}

/** Weekly movement volume by fitness level. `perDay` marks the snack cadence. */
export const MOVEMENT_VOLUME: Record<string, { sessions: number; minutes: number; perDay: boolean }> = {
  beginner: { sessions: 2, minutes: 18, perDay: false },
  medium: { sessions: 3, minutes: 28, perDay: false },
  advanced: { sessions: 4, minutes: 35, perDay: false },
  movement_snacks: { sessions: 4, minutes: 5, perDay: true },
};

/**
 * The nine daily nutrition habits, in priority order. These ids and labels are
 * the contract with the /register funnel (NUTRITION_GROUPS) — see
 * docs/plan/pillars.md. Do not reword them here alone.
 */
export const NUTRITION: { id: string; label: string }[] = [
  { id: "protein_25_30g", label: "25-30g protein per meal" },
  { id: "healthy_fats", label: "Healthy fats" },
  { id: "high_fiber", label: "Added high-fiber foods" },
  { id: "low_gi_fruit", label: "Low-glycemic fruits only" },
  { id: "gap_5h", label: "5 hours between meals" },
  { id: "fast_12h", label: "12-hour fasting window" },
  { id: "no_snacking", label: "No snacking between meals" },
  { id: "water_6", label: "Drink 6+ glasses of water" },
  { id: "supplements", label: "Daily supplements taken" },
];

/** Relaxation practices. The 4-2-6 breathing is the one she already did in the funnel. */
export const RELAXATION: { id: string; label: string }[] = [
  { id: "breath_426", label: "4-2-6 breathing" },
  { id: "winddown_10", label: "10-minute wind-down before bed" },
  { id: "body_scan", label: "Evening body scan" },
  { id: "reset_pause", label: "A 5-minute reset between tasks" },
  { id: "slow_breath_meal", label: "Slow breathing before you eat" },
];

const NUTRITION_IDS = new Set(NUTRITION.map((n) => n.id));
const RELAXATION_IDS = new Set(RELAXATION.map((r) => r.id));
export const isNutritionId = (id: string) => NUTRITION_IDS.has(id);
export const isRelaxationId = (id: string) => RELAXATION_IDS.has(id);
