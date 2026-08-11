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
 * Cardio is the one family measured in minutes rather than sets and reps —
 * "Zone 2 walk, 2 sets of 10" is not a thing. The `K` prefix is the marker, and
 * this is the only place that knowledge lives.
 */
export const isCardioId = (id: string) => id.startsWith("K");

// ─── Exercise video ─────────────────────────────────────────────────────────

/**
 * Clips are NOT bundled with the Expo app. 59 of them would add tens of MB to
 * every binary and force an App Store release to re-cut a single one. They live
 * in a public Supabase Storage bucket behind its CDN, named after the exercise
 * id, and the app caches each one on first play.
 *
 * Bucket layout (`exercise-clips`, public read):
 *   L01.mp4   H.264 / AAC-less, 6-10s silent loop, ≤720p, ≤400KB
 *   L01.webp  poster frame, ≤40KB
 *
 * Only the API builds these URLs. If the bucket ever moves to another CDN, this
 * constant is the only thing that changes — no client ships a hardcoded path.
 */
const MEDIA_BASE =
  process.env.EXERCISE_MEDIA_BASE ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/exercise-clips`;

/**
 * Which clips have actually been produced. Add ids here as they land — an id
 * that isn't listed returns no media and the app falls back to name + props,
 * so a half-finished shoot never shows her a broken player.
 */
const MEDIA_READY = new Set<string>([
  // e.g. "L01", "L02", …
]);

export type ExerciseMedia = { video: string; poster: string };

export function exerciseMedia(id: string): ExerciseMedia | undefined {
  if (!MEDIA_READY.has(id) || !MEDIA_BASE) return undefined;
  return { video: `${MEDIA_BASE}/${id}.mp4`, poster: `${MEDIA_BASE}/${id}.webp` };
}

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

// ─── Nutrition: the daily checklist ─────────────────────────────────────────

/**
 * The ten daily nutrition habits, in priority order. These ids and labels are
 * the contract with the /register funnel (NUTRITION_GROUPS) — see
 * docs/plan/pillars.md. Do not reword them here alone.
 *
 * Unlike movement and relaxation, these are NOT selected by the LLM. All ten
 * appear every single day, in this order and grouping, for every user — she
 * ticks what she actually did. The LLM only nominates which ones a given week
 * should push on (`nutritionFocus`).
 *
 * The list is the daily vitality log, minus everything that would have been a
 * text box. The paper version asks her to *write* the protein, the fat, the
 * fiber, the time she broke her fast and the time she started it; none of that
 * survives here. A habit only earns a row if ticking it is the whole
 * interaction — what she ate is a diary, and a diary is the thing women stop
 * filling in by day four.
 *
 * `target` is how many times a day the row can be ticked, which is what carries
 * the meal structure the paper log gets from having three identical blocks:
 * protein, fat, fiber and the post-meal walk are `3` (breakfast, lunch,
 * dinner), water is `6` of a possible `max` 8, everything else is a yes/no for
 * the day. She logs a count against one key rather than three per-meal keys, so
 * "protein" stays one habit with one streak.
 */
export type NutritionGroup = "Every meal" | "Timing & fasting" | "Hydration & supplements";

export type NutritionItem = {
  id: string;
  label: string;
  group: NutritionGroup;
  /** Ticks a full day needs. 1 = a plain yes/no. */
  target: number;
  /** Ticks the tracker offers, where going past target is allowed. Defaults to target. */
  max?: number;
  /**
   * What she reads when she opens the row — the reason it is on her list.
   *
   * This is the **fallback**, not the copy she normally sees. The plan
   * generator writes her own version of all ten (`Plan.nutritionWhy`), tied to
   * her symptoms. These are what she gets when that never happened: OpenAI was
   * down and she has the deterministic plan, the model skipped an id, or her
   * plan predates the field. A row with no explanation is worse than a generic
   * one, so every id keeps a written default here.
   *
   * Keep them mechanism-first and claim-free: what the habit does, not what it
   * cures. No dosages, no "this will fix your hot flashes".
   */
  why: string;
};

export const NUTRITION: NutritionItem[] = [
  {
    id: "protein_25_30g",
    label: "25-30g protein",
    group: "Every meal",
    target: 3,
    why: "Holding on to muscle takes more protein than it used to, and your body can only use so much at a sitting — three moderate hits do what one big dinner can't.",
  },
  {
    id: "healthy_fats",
    label: "A healthy fat",
    group: "Every meal",
    target: 3,
    why: "Fat is what your hormones are built from, and it's the part of a meal that actually holds you until the next one.",
  },
  {
    id: "high_fiber",
    label: "A high-fiber food",
    group: "Every meal",
    target: 3,
    why: "Fiber slows the sugar in a meal down, feeds your gut, and does most of the work of keeping you full without you noticing.",
  },
  {
    id: "low_gi_fruit",
    label: "Low-glycemic fruit only",
    group: "Every meal",
    target: 1,
    why: "Fruit is still sugar. Berries, apples and pears give you the sweetness without the rise-and-crash your afternoon doesn't need.",
  },
  // The paper log repeats this under all three meals, and it is the one line
  // that makes the meal structure work — the walk is what flattens the glucose
  // rise the meal just caused, so it lives with the meal, not with movement.
  {
    id: "post_meal_walk",
    label: "10-min walk after eating",
    group: "Every meal",
    target: 3,
    why: "Ten minutes of walking gives the meal you just ate somewhere to go, so the rise is a slope instead of a spike.",
  },
  {
    id: "fast_12h",
    label: "12-hour overnight fast",
    group: "Timing & fasting",
    target: 1,
    why: "Twelve hours without food gives your body a long quiet stretch to repair in, and you sleep through most of it.",
  },
  {
    id: "gap_5h",
    label: "5 hours between meals",
    group: "Timing & fasting",
    target: 1,
    why: "Insulin needs time to come back down between meals, and about five hours is how long that takes.",
  },
  {
    id: "no_snacking",
    label: "No snacking between meals",
    group: "Timing & fasting",
    target: 1,
    why: "Every snack restarts the clock on the gap you just earned. It's the spacing that matters here, not eating less.",
  },
  {
    id: "water_6",
    label: "Glasses of water",
    group: "Hydration & supplements",
    target: 6,
    max: 8,
    why: "Thirst gets quieter with age while flashes and night sweats take more water out of you — so this is one you count rather than feel.",
  },
  {
    id: "supplements",
    label: "Daily supplements taken",
    group: "Hydration & supplements",
    target: 1,
    why: "Omega-3, magnesium and vitamin D3 + K2 are the three most worth asking your doctor about for what you're going through.",
  },
];

/** Group headers in list order, without a second hand-maintained copy of them. */
export const NUTRITION_GROUP_ORDER: NutritionGroup[] = [
  ...new Set(NUTRITION.map((n) => n.group)),
];

/**
 * Revealed under the `supplements` row once it's ticked, exactly as in the
 * funnel. Never counted toward the ten — they name the three that matter.
 */
export const SUPPLEMENT_OPTIONS = [
  { id: "omega3", label: "Omega-3" },
  { id: "magnesium", label: "Magnesium" },
  { id: "d3k2", label: "Vitamin D3 + K2" },
];

/**
 * Nutrition log keys are deliberately NOT week-prefixed. "25-30g protein" is
 * the same habit in week 1 and week 8, so it keeps one key for the plan's whole
 * life and her streak runs unbroken across the week boundary. Nor are they
 * meal-prefixed: the count on the single key is the meal, which is why
 * switching to a per-meal log cost no keys and broke no streaks.
 */
export const nutritionKey = (id: string) => `nut_${id}`;

// ─── Relaxation: breathing and practices ────────────────────────────────────

/**
 * Breathing patterns, timed for menopause specifically. Three rules shape every
 * one of them:
 *
 *  1. **Exhale is always at least 1.5x the inhale.** The asymmetry is what
 *     shifts the nervous system — the absolute length barely matters.
 *  2. **No breath-hold in anything meant for a hot flash or a spike.** A hold
 *     amplifies the closed-throat, can't-get-air feeling that rides along with
 *     a flash, and turns a symptom into a panic. Holds only appear in `sleep`,
 *     where she is lying down and nothing is spiking.
 *  3. **Nothing over a 5-second inhale.** A big forced inhale flushes the face
 *     and can start the very thing she's trying to stop.
 *
 * Round counts are what the exercise is *worth doing for*, not a minimum —
 * `breath_paced_6` is the 15-minute clinical protocol (Freedman's paced
 * respiration at 6 breaths/min); the rest are 1-2 minute interventions.
 */
export type BreathPhaseKey = "in" | "hold" | "out" | "top_up";

export type BreathPhase = { key: BreathPhaseKey; label: string; seconds: number };

export type RelaxationItem = {
  id: string;
  label: string;
  /** One line on when to reach for it — shown under the title. */
  use: string;
  kind: "breathing" | "practice";
  /** Breathing only. One cycle, in order. */
  phases?: BreathPhase[];
  rounds?: number;
  /** Practice only, and the derived length for breathing. */
  minutes?: number;
};

const IN = (seconds: number): BreathPhase => ({ key: "in", label: "Breathe in", seconds });
const HOLD = (seconds: number): BreathPhase => ({ key: "hold", label: "Hold", seconds });
const OUT = (seconds: number): BreathPhase => ({ key: "out", label: "Breathe out", seconds });
const TOP_UP = (seconds: number): BreathPhase => ({ key: "top_up", label: "Short sip in", seconds });

export const RELAXATION: RelaxationItem[] = [
  {
    // The one she already did in the funnel — same pattern, so the app opens on
    // something she has personally felt work. 12s cycle = 5 breaths/min.
    id: "breath_426",
    label: "4-2-6 breathing",
    use: "Your daily anchor. Two minutes, any time.",
    kind: "breathing",
    phases: [IN(4), HOLD(2), OUT(6)],
    rounds: 10,
  },
  {
    // No hold, and the longest exhale of the set. Reach for it while the flash
    // is building, not after.
    id: "breath_hotflash",
    label: "Hot flash rescue breathing",
    use: "The moment you feel one starting.",
    kind: "breathing",
    phases: [IN(4), OUT(8)],
    rounds: 8,
  },
  {
    // The clinical protocol: 6 breaths/min, 15 minutes, twice daily. The only
    // one here with trial evidence behind the dose, so it gets the real dose.
    id: "breath_paced_6",
    label: "Paced respiration",
    use: "15 quiet minutes, morning and evening.",
    kind: "breathing",
    phases: [IN(5), OUT(5)],
    rounds: 90,
  },
  {
    // Lying down, nothing spiking — the one place a hold earns its keep.
    id: "breath_sleep",
    label: "Sleep wind-down breathing",
    use: "In bed, or when you wake at 3am.",
    kind: "breathing",
    phases: [IN(4), HOLD(4), OUT(8)],
    rounds: 8,
  },
  {
    // Double inhale then a long release — the fastest route down from a racing
    // heart, which in perimenopause is usually adrenaline, not the heart.
    id: "breath_sigh",
    label: "Double-breath reset",
    use: "Racing heart or sudden dread.",
    kind: "breathing",
    phases: [IN(4), TOP_UP(1), OUT(8)],
    rounds: 5,
  },
  {
    id: "slow_breath_meal",
    label: "Slow breathing before you eat",
    use: "Five rounds before the first bite.",
    kind: "breathing",
    phases: [IN(4), OUT(6)],
    rounds: 5,
  },
  {
    id: "winddown_10",
    label: "10-minute wind-down before bed",
    use: "Lights low, screens down, same time nightly.",
    kind: "practice",
    minutes: 10,
  },
  {
    id: "body_scan",
    label: "Evening body scan",
    use: "Head to feet, noticing without fixing.",
    kind: "practice",
    minutes: 8,
  },
  {
    id: "reset_pause",
    label: "A 5-minute reset between tasks",
    use: "Before the next thing, not after the day.",
    kind: "practice",
    minutes: 5,
  },
];

const cycleSeconds = (phases: BreathPhase[]) => phases.reduce((s, p) => s + p.seconds, 0);

/** Everything the app needs to run the item, with the maths already done. */
export function relaxationDetail(id: string) {
  const item = RELAXATION.find((r) => r.id === id);
  if (!item) return undefined;
  if (item.kind !== "breathing" || !item.phases || !item.rounds) {
    return { kind: item.kind, use: item.use, minutes: item.minutes };
  }
  const cycle = cycleSeconds(item.phases);
  return {
    kind: item.kind,
    use: item.use,
    phases: item.phases,
    rounds: item.rounds,
    cycleSeconds: cycle,
    totalSeconds: cycle * item.rounds,
    breathsPerMinute: Math.round((60 / cycle) * 10) / 10,
  };
}

const NUTRITION_IDS = new Set(NUTRITION.map((n) => n.id));
const RELAXATION_IDS = new Set(RELAXATION.map((r) => r.id));
export const isNutritionId = (id: string) => NUTRITION_IDS.has(id);
export const isRelaxationId = (id: string) => RELAXATION_IDS.has(id);
