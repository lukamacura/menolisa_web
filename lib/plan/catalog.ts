/**
 * The approved content the 8-week plan is built from.
 *
 * The LLM never writes exercises, nutrition or relaxation copy — it picks ids
 * from these lists. That keeps the plan medically safe, guarantees every task
 * maps to content we actually have, and makes tasks comparable across users.
 */

export type Impact = "none" | "low" | "high";

/**
 * What an exercise's dose is actually measured in.
 *
 * **Every dose is time.** Repetitions are gone from the plan entirely: a set is
 * a number of seconds of work, and the app counts them down. That is the whole
 * simplification — one thing on the screen, one thing to obey, and no set where
 * she has to keep a count in her head while the phone shows her something else.
 * `sets` survives, because how many times she comes back to a movement is a real
 * part of the prescription.
 *
 * - `timed`    — sets of work for time. Squats, presses, rows: she moves at her
 *                own tempo for the seconds prescribed.
 * - `hold`     — an isometric. Same shape, but she is holding one position.
 * - `carry`    — loaded carry. Time was always the honest measure for it.
 * - `duration` — one continuous block (all cardio, plus the mobility flow).
 */
export type DoseUnit = "timed" | "hold" | "carry" | "duration";

export type Exercise = {
  id: string;
  name: string;
  props: string;
  /** 1 = anyone, 2 = some equipment/load, 3 = gym or high skill. */
  level: 1 | 2 | 3;
  impact: Impact;
  /** Short, no real setup — usable as a "movement snack". */
  snack: boolean;
  /** What this exercise's dose is measured in. */
  dose: DoseUnit;
  /** True when the dose is per limb — the set runs twice, once per side. */
  perSide: boolean;
  /**
   * Starting seconds per set, or the block length for `duration`. A floor and a
   * fallback, not the dose — the plan prescribes how long a set actually runs in
   * a given week, and that grows across the eight.
   */
  seconds?: number;
};

// Source: docs/plan/exercises.md — 51 prescribable exercises, plus the 15
// warm-up movements (`W`) and 19 cool-down stretches (`S`) at the bottom.
//
// The list narrowed from 59 to 42 on 2026-08-24 — 41 since 2026-08-25, when U06
// turned out to be a mobility flow and moved to WARMUPS — and grew again on
// 2026-08-26 to cover the whole shoot list: ten movements that had no id at all
// (L14, U13, C08, C09, I08-I12, W16) and the `S` static-stretch family, which is
// the cool-down content `DEFAULT_COOLDOWN` had been standing in for.
//
// **The ids here are the contract with the clip bucket, and the shoot list uses
// a different, older numbering.** From L04 down it is offset by one, because the
// list reinstates the barbell back squat as L04: its L05 is this table's L04,
// its L14 is L13, its P04 is P03, its U09/U10 are U07/U08, its U19/U20 are
// U11/U12, its U07 is W15, its I06 is I05. Film to the id in THIS table — a clip
// uploaded as `L05.mp4` for a step-up overwrites the loaded step-up already in
// the bucket.
//
// The 2026-08-24 narrowing was not a subset:
// cardio (`K`), balance (`B`) and mobility (`M`) left the plan entirely, and a
// number of `L`/`U`/`C`/`I` ids were REUSED for different movements. Everything
// that went is preserved, commented out, in RETIRED below — nothing was deleted,
// so putting any of it back is a decision rather than a rediscovery.
//
// Names are house sentence case rather than the doc's title case: the ids are
// the contract, the strings are UI copy.
const E: [string, string, string, 1 | 2 | 3, Impact, boolean][] = [
  // Lower body — strength (14)
  ["L01", "Box squat", "Sturdy chair", 1, "none", true],
  ["L02", "Bodyweight squat", "None", 1, "none", true],
  ["L03", "Goblet squat", "1 dumbbell", 2, "none", false],
  ["L04", "Step-up", "Stair or sturdy chair", 1, "low", true],
  ["L05", "Step-up, loaded", "Stair, 2 dumbbells", 2, "low", false],
  ["L06", "Supported reverse lunge", "Wall or counter", 2, "none", false],
  ["L07", "Walking lunge, loaded", "2 dumbbells", 3, "none", false],
  ["L08", "Calf raise, loaded", "2 dumbbells, bottom stair", 2, "none", false],
  ["L09", "Bulgarian split squat", "Chair or couch, 2 dumbbells", 3, "none", false],
  ["L10", "Split squat", "None, or 2 dumbbells", 2, "none", false],
  ["L11", "Prisoner squat", "None", 1, "none", true],
  ["L12", "Air squat", "None", 1, "none", true],
  ["L13", "Dumbbell sumo deadlift", "1 dumbbell", 2, "none", false],
  // Restored from RETIRED on 2026-08-26, under a FREE id. The shoot list calls
  // it L04, which this table has meant "step-up" since 2026-08-24.
  ["L14", "Barbell back squat", "Barbell, rack", 3, "none", false],
  // Posterior chain / hinge (3)
  ["P01", "Glute bridge", "Mat", 1, "none", true],
  ["P02", "Glute bridge, weighted", "Mat, 1 dumbbell", 2, "none", false],
  ["P03", "Romanian deadlift", "2 dumbbells", 2, "none", false],
  // Upper body — push (5)
  ["U01", "Wall push-up", "Wall", 1, "none", true],
  ["U02", "Counter push-up", "Kitchen counter", 1, "none", true],
  ["U03", "Incline push-up", "Sturdy table or bench", 2, "none", true],
  ["U04", "Floor push-up", "Mat", 3, "none", false],
  ["U05", "Dumbbell floor press", "2 dumbbells, floor", 2, "none", false],
  // Upper body — press & pull (7)
  ["U07", "Seated overhead press", "2 dumbbells, chair", 2, "none", false],
  ["U08", "Standing overhead press", "2 dumbbells", 2, "none", false],
  ["U09", "Bent-over dumbbell row", "2 dumbbells", 2, "none", false],
  ["U10", "Rear-delt fly", "2 dumbbells", 2, "none", false],
  ["U11", "Prone Y-T-W raise", "Mat", 1, "none", false],
  ["U12", "Dumbbell lateral raise", "2 dumbbells", 2, "none", false],
  ["U13", "Single-arm dumbbell row", "1 dumbbell, chair or bench", 2, "none", false],
  // Core, stability & carries (9)
  ["C01", "Wall sit", "Wall", 1, "none", true],
  ["C02", "Bird-dog", "Mat", 1, "none", true],
  ["C03", "Farmer's carry", "2 heavy dumbbells", 2, "none", false],
  ["C04", "Plank", "Mat", 1, "none", true],
  ["C05", "Side plank", "Mat", 2, "none", false],
  ["C06", "Dead bug", "Mat", 1, "none", true],
  ["C07", "Pallof press", "Tube band, door anchor", 2, "none", false],
  // Both graded "none" for impact — they are floor work, so the `joint_pain`
  // rule leaves them in. What takes them out is the pelvic-floor list (each
  // spikes intra-abdominal pressure) and, for the mountain climber, the back and
  // shoulder lists: it is a plank with the wrists and shoulders holding the line
  // while the hips move.
  ["C08", "Mountain climber", "Mat", 2, "none", true],
  ["C09", "Oblique twist", "Mat", 2, "none", true],
  // Impact & bone loading (12)
  //
  // The doc grades I03-I07 "Moderate Impact"; `Impact` has no middle value, so
  // they map to "high" — the jarring, landing-on-your-joints kind that
  // `joint_pain` and every limitation rule but `shoulder` drops wholesale.
  // Grading them "low" to keep them in the pool would put a pogo jump in front
  // of a woman who has just told us her knee hurts.
  ["I01", "Stomping march", "None", 1, "low", true],
  ["I02", "Supported heel drop", "Wall or counter", 1, "low", true],
  ["I03", "Low hop", "None", 2, "high", true],
  ["I04", "Plyometric skip", "None", 3, "high", false],
  ["I05", "Pogo jump", "None", 2, "high", true],
  ["I06", "Forward fall landing", "None", 2, "high", true],
  ["I07", "Low step-off landing", "Bottom stair or low step", 3, "high", false],
  // The pogo variants, added 2026-08-26. Same grading argument as I03-I07: they
  // are landings, so they are "high" and every limitation but `shoulder` drops
  // them wholesale. I12 is the way INTO the family rather than a member of it —
  // the I02 heel drop onto something soft — so it is graded "low" and survives.
  ["I08", "Pogo jump, forward & back", "None", 2, "high", true],
  ["I09", "Pogo jump, lateral", "None", 2, "high", true],
  ["I10", "Pogo jump, multi-directional", "None", 3, "high", true],
  ["I11", "Single-leg pogo", "None", 3, "high", false],
  ["I12", "Soft-surface heel drop", "Cushion, folded towel or mat", 1, "low", true],
  // Warm-up (15)
  //
  // Ordinary catalog rows, so `getExercise()` resolves them and a bookend
  // hydrates into a name, a dose and a clip exactly like a squat does. What
  // keeps them out of the main work is the `W` prefix, which
  // `allowedExercises()` drops — see `isWarmupId`. That is the whole mechanism:
  // one table, one lookup, one prefix rule. `S` below works the same way.
  //
  // W11 is deliberately absent — the Y-T-W shoulder warm-up is U11, one clip
  // with one id rather than two files of the same footage that can drift apart.
  ["W01", "Leg swings, linear & lateral", "Wall or counter", 1, "none", false],
  ["W02", "Hip circles", "None", 1, "none", false],
  ["W03", "Spider-Man lunge with rotation", "Mat", 1, "none", false],
  ["W04", "Half-kneeling hip flexor rockback", "Mat", 1, "none", false],
  ["W05", "Deep squat with reach", "None", 1, "none", false],
  ["W06", "Open book cross", "Mat", 1, "none", false],
  ["W07", "Hamstring rocker", "Mat", 1, "none", false],
  ["W08", "Cross-arm abduction", "None", 1, "none", false],
  ["W09", "Shoulder mobility", "None", 1, "none", false],
  ["W10", "PVC around the world", "Broomstick or PVC pipe", 1, "none", false],
  ["W12", "World's greatest stretch", "Mat", 1, "none", false],
  ["W13", "Lateral hamstring rocker", "Mat", 1, "none", false],
  ["W14", "Calf raise", "None", 1, "none", false],
  // Filmed as a push-up variation ("U06") and re-filed here on 2026-08-25: she
  // flows through the positions and never presses, so it is mobility, not a
  // set. The clip in the bucket was renamed U06.mp4 -> W15.mp4 to match.
  ["W15", "Yoga flow", "Mat", 1, "none", false],
  ["W16", "Inchworm", "Mat", 1, "none", false],
  // Cool-down — static stretching (19)
  //
  // Added 2026-08-26. Until then the catalog had no static-stretch family at
  // all, which is what `DEFAULT_COOLDOWN` was apologising for: it sent two
  // warm-up movements at a longer dose because there was nothing gentler to
  // reach for.
  //
  // `S` is the prefix, and it does exactly the job `W` does — drawable,
  // bookend-selectable, and dropped by `allowedExercises()` so the generator
  // cannot spend a strength slot on a child's pose. Every one is a `hold` at
  // level 1, and unprogressed: a cool-down is the same thirty seconds in week 8
  // as in week 1.
  //
  // Order follows the shoot list — strap work, thoracic, seated upper body,
  // hips, then the floor poses.
  ["S01", "Chest & shoulder stretch with strap", "Strap or towel", 1, "none", false],
  ["S02", "Triceps stretch with strap", "Strap or towel", 1, "none", false],
  ["S03", "Trunk twist with strap", "Strap or towel", 1, "none", false],
  ["S04", "Extended puppy pose", "Mat", 1, "none", false],
  ["S05", "Thread the needle", "Mat", 1, "none", false],
  ["S06", "Kneeling chest expansion", "Mat", 1, "none", false],
  ["S07", "Seated side-body stretch", "Mat", 1, "none", false],
  ["S08", "Seated cross-body shoulder stretch", "None", 1, "none", false],
  ["S09", "Seated overhead triceps stretch", "None", 1, "none", false],
  ["S10", "Standing wall chest & biceps stretch", "Wall", 1, "none", false],
  ["S11", "Hip flexor & anterior hip capsule lunge", "Mat", 1, "none", false],
  ["S12", "Piriformis stretch, figure-four", "Mat", 1, "none", false],
  ["S13", "Kneeling low lunge, quad & hip flexor", "Mat", 1, "none", false],
  ["S14", "Kneeling half-splits, hamstring & calf", "Mat", 1, "none", false],
  ["S15", "Seated butterfly stretch", "Mat", 1, "none", false],
  ["S16", "Seated cow-face, outer hip", "Mat", 1, "none", false],
  ["S17", "Cobra pose", "Mat", 1, "none", false],
  ["S18", "Child's pose", "Mat", 1, "none", false],
  ["S19", "Seated spinal twist", "Mat", 1, "none", false],
];

/**
 * RETIRED 2026-08-24. Verbatim, so restoring one is moving a line back into `E`.
 *
 * Two things to know before doing that:
 *
 * - **The `L`/`P`/`U`/`C`/`I` ids below are taken.** The new list reused them for
 *   different movements — old `C04` was a farmer's carry, new `C04` is a plank.
 *   Restoring one of those means giving it an id nothing else uses (`L14`,
 *   `C08`, `U13`…), never pasting the line back as it stands.
 * - **`B`, `K` and `M` ids are still free, and their machinery is intact.** The
 *   `duration` dose unit, `isCardioId()`, `cardioMinutes()` and the prompt's
 *   continuous-block rule all still work — `duration` simply has no members
 *   right now, and `buildPrompt()` drops that rule on its own when the pool
 *   holds none. Uncommenting the `K` rows is genuinely all cardio needs.
 *
 * What their absence costs, so it stays a decision and not a drift: cardio was
 * half the beginner pool and the only unloaded aerobic work in the plan; `B` was
 * the fall-and-fracture training, which is why `LIMITATION_EXCLUDES.balance` has
 * nothing balance-specific left to remove; `M01` was the one mobility flow and
 * the only non-cardio `duration` id.
 */
// Lower body — strength
// ["L04", "Barbell back squat", "Barbell, rack", 3, "none", false],   // restored 2026-08-26 as L14
// Posterior chain / hinge
// ["P03", "Bent-over dumbbell row", "2 dumbbells", 2, "none", false],   // kept, now U09
// ["P05", "Hex bar deadlift", "Hex bar", 3, "none", false],
// Upper body — push
// ["U06", "Dumbbell bench press", "2 dumbbells, flat bench", 3, "none", false],
// Upper body — press & pull
// ["U09", "Band row", "Tube band, door anchor", 1, "none", true],
// ["U10", "Band pull-apart", "Flat loop band", 1, "none", true],
// ["U11", "Lat pulldown", "Cable machine", 3, "none", false],
// ["U12", "Weighted pull-up", "Bar, dip belt", 3, "none", false],
// ["U13", "Incline dumbbell row", "2 dumbbells, incline bench", 3, "none", false],
// Core, stability & carries
// ["C03", "Hanging knee raise", "Pull-up bar", 3, "none", false],
// ["C05", "Household heavy carry", "Detergent jug, hugged to chest", 1, "none", true],
// ["C06", "Farmer's carry, household", "Grocery bags or jugs", 1, "none", true],
// Balance — ids still free
// ["B01", "Single-leg balance, supported", "Counter", 1, "none", true],   // DOSE ["hold", true, 30]
// ["B02", "Single-leg balance, unstable", "Foam pad or cushion", 2, "none", true],  // ["hold", true, 30]
// ["B03", "Ball-toss balance", "Foam pad, tennis ball, wall", 3, "none", false],    // ["hold", true, 30]
// ["B04", "Toothbrush single-leg stand", "Sink, toothbrush", 1, "none", true],      // ["hold", true, 60]
// Bone impact
// ["I03", "Box drop landing", "8-inch box", 3, "high", false],
// Cardio — ids still free, the `duration` unit is still wired for them
// ["K01", "Zone 2 walk", "Outdoor path", 1, "low", false],
// ["K02", "Fast walk interval", "Outdoor path", 2, "low", false],
// ["K03", "Recovery stroll / hike", "Path or trail", 1, "low", false],
// ["K04", "Hill power walk", "Incline", 2, "low", false],
// ["K05", "Treadmill incline walk", "Treadmill", 2, "low", false],
// ["K06", "Cycling", "Upright bike", 2, "none", false],
// ["K07", "Assault / spin bike sprint", "Air bike", 3, "none", false],
// ["K08", "Elliptical", "Machine", 2, "none", false],
// ["K09", "Run / sprint", "Outdoor or track", 3, "high", false],
// ["K10", "Sled push", "Weighted sled", 3, "none", false],
// ["K11", "Stair climbing", "Flight of stairs", 2, "low", true],
// ["K12", "Jump rope", "Rope", 3, "high", false],
// ["K13", "Jumping jacks", "None", 2, "high", true],
// ["K14", "High knees in place", "None", 2, "high", true],
// Mobility & flexibility — ids still free
// ["M01", "Dynamic floor stretching", "Mat", 1, "none", false],   // DOSE ["duration", false, 300]
// ["M02", "Neck circles & shoulder rolls", "None", 1, "none", true],
// ["M03", "Torso twist with arm swings", "None", 1, "none", true],
// ["M04", "Hip circles", "None", 1, "none", true],

/**
 * Every exercise whose dose is NOT a plain both-sides timed set.
 *
 * Listed as exceptions rather than as a seventh column on `E` so the table above
 * stays readable — anything absent from here is `["timed", false]`, which is the
 * honest default for the squat/press/row/hinge families that make up most of the
 * catalog. Cardio is handled by prefix below and never needs a row here.
 *
 * The seconds are a starting dose for a woman new to loading, not a ceiling.
 * They are deliberately conservative; progression is a separate piece of work.
 */
const DOSE: Record<string, [DoseUnit, boolean, number?]> = {
  // Isometrics — the hold IS the exercise. A plank opens shorter than a wall sit
  // because it is the whole trunk holding a line, not a leg holding a chair.
  C01: ["hold", false, 30],
  C04: ["hold", false, 20],
  C05: ["hold", true, 15],
  // Carries — measured in time because the alternative is measuring hallways.
  C03: ["carry", false, 40],
  // Unilateral work — the seconds are per side, so the set runs twice. The
  // alternating floor work (bird-dog, dead bug) is prescribed a side at a time
  // rather than alternating within the set: one thing to obey per countdown.
  C02: ["timed", true],
  C06: ["timed", true],
  C07: ["timed", true],
  L04: ["timed", true],
  L05: ["timed", true],
  L06: ["timed", true],
  L07: ["timed", true],
  L09: ["timed", true],
  L10: ["timed", true],
  U13: ["timed", true],
  I11: ["timed", true],
  // Warm-ups. Uniform on purpose — a warm-up is not progressed across the eight
  // weeks; it is the same two minutes in week 8 as in week 1.
  W01: ["timed", true, 40],
  W03: ["timed", true, 40],
  W04: ["timed", true, 40],
  W06: ["timed", true, 40],
  W07: ["timed", true, 40],
  W12: ["timed", true, 40],
  W13: ["timed", true, 40],
  W02: ["timed", false, 40],
  W05: ["timed", false, 40],
  W08: ["timed", false, 40],
  W09: ["timed", false, 40],
  W10: ["timed", false, 40],
  W14: ["timed", false, 40],
  W15: ["timed", false, 90],
  W16: ["timed", false, 40],
  // Cool-down stretches. All `hold`, all 30s, and — like the warm-ups — the
  // same in week 8 as in week 1. A stretch that gets longer every week is a
  // flexibility program, which is a different product; this is the two minutes
  // that ends a session.
  //
  // Marked per side wherever the pose has a side. That doubles the block, which
  // is why the ones that do not (S04, S15, S17, S18) are the ones a generic
  // cool-down reaches for first.
  S01: ["hold", false, 30],
  S02: ["hold", true, 30],
  S03: ["hold", true, 30],
  S04: ["hold", false, 30],
  S05: ["hold", true, 30],
  S06: ["hold", false, 30],
  S07: ["hold", true, 30],
  S08: ["hold", true, 30],
  S09: ["hold", true, 30],
  S10: ["hold", true, 30],
  S11: ["hold", true, 30],
  S12: ["hold", true, 30],
  S13: ["hold", true, 30],
  S14: ["hold", true, 30],
  S15: ["hold", false, 30],
  S16: ["hold", true, 30],
  S17: ["hold", false, 30],
  S18: ["hold", false, 30],
  S19: ["hold", true, 30],
  // No `duration` id is currently in the catalog — cardio and the mobility flow
  // are both retired. The unit and everything that runs it stay wired; see the
  // RETIRED block above.
};

/** Cardio's default block length when nothing else says otherwise. */
const CARDIO_DEFAULT_SECONDS = 900;

export const EXERCISES: Exercise[] = E.map(([id, name, props, level, impact, snack]) => {
  const [dose, perSide, seconds] = DOSE[id] ?? (isCardioId(id) ? (["duration", false, CARDIO_DEFAULT_SECONDS] as const) : (["timed", false, undefined] as const));
  return { id, name, props, level, impact, snack, dose, perSide, seconds };
});

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
export const getExercise = (id: string): Exercise | undefined => BY_ID.get(id);

/**
 * Cardio is the one family measured in minutes rather than sets of seconds —
 * "Zone 2 walk, 3 sets of 40 seconds" is not a thing. The `K` prefix is the
 * marker, and this is the only place that knowledge lives.
 */
export function isCardioId(id: string) {
  return id.startsWith("K");
}

/** Mobility work. Short, unloaded, and it does not want a minute of rest after it. */
const isMobilityId = (id: string) => id.startsWith("M");

/**
 * Warm-up and cool-down movements.
 *
 * They are in the catalog so the app can draw them, and out of the prescribable
 * pool so the generator cannot spend a strength slot on a hip circle. `W` is the
 * marker, and `allowedExercises()` is the only place it gates anything.
 */
export const isWarmupId = (id: string) => id.startsWith("W");

/**
 * Cool-down stretches. Same mechanism as `isWarmupId`, different end of the
 * session — and kept a separate prefix rather than folded into `W` so the plan
 * prompt can be told "warm up from these, cool down from those". A hip circle
 * is a poor way to finish and a child's pose is a poor way to start.
 */
export const isCooldownId = (id: string) => id.startsWith("S");

/** Either bookend: drawable, never the main work. */
export const isBookendId = (id: string) => isWarmupId(id) || isCooldownId(id);

// ─── Warm-up and cool-down ──────────────────────────────────────────────────

/** An exercise reference exactly as a plan stores one. */
export type StoredExercise = {
  id: string;
  sets?: number;
  reps?: number;
  seconds?: number;
  minutes?: number;
};

/**
 * The warm-up every strength session gets when the plan did not write its own.
 *
 * Shoulders, then hips, then spine — the three joints about to be loaded, in
 * the order a session tends to reach for them. Every move here has props
 * `"None"` on purpose: a generic warm-up must never be the reason the gear list
 * on the setup screen grows, because that list is what she goes and fetches
 * before she starts, and a hip circle is not worth a trip to the cupboard.
 *
 * Deliberately not personalised. This is the floor, not the prescription: once
 * the plan-building model is taught to write bookends it will send its own and
 * these stop being read (see `sessionWarmup`).
 */
export const DEFAULT_WARMUP: readonly StoredExercise[] = [
  { id: "W02", sets: 1, seconds: 40 },
  { id: "W01", sets: 1, seconds: 40 },
  { id: "W06", sets: 1, seconds: 40 },
];

/**
 * The matching cool-down: hips, then spine, then shoulders — the warm-up's order
 * run backwards, which is roughly the order a session stops needing them.
 *
 * Three constraints picked these three out of the nineteen, and they are worth
 * keeping if it is ever rewritten:
 *
 * - **Nothing kneeling.** This default is NOT filtered by her limitations (it is
 *   the fallback for when the model wrote no bookend at all), so it has to be
 *   the version that is safe for the woman who told us her knee hurts. That
 *   rules out most of the family — S04, S06, S11, S13, S14, S16, S18 are all on
 *   the floor on a kneecap.
 * - **Nothing she has to fetch.** A mat at most, exactly as `DEFAULT_WARMUP`
 *   asks for nothing. The three strap stretches are content, not a default.
 * - **One per region.** Three stretches of the same hip is a cool-down that
 *   forgot the rest of her.
 *
 * Until 2026-08-26 this was two warm-up movements at a longer dose, because the
 * catalog had no stretches in it. It has nineteen now.
 */
export const DEFAULT_COOLDOWN: readonly StoredExercise[] = [
  { id: "S12", sets: 1, seconds: 30 },
  { id: "S19", sets: 1, seconds: 30 },
  { id: "S08", sets: 1, seconds: 30 },
];

// ─── Dose, rest and session length ──────────────────────────────────────────

/**
 * Rest between sets, in seconds, by dose unit and exercise level.
 *
 * Rest is a prescription, not a UI nicety — it is where the strength adaptation
 * actually happens — so it is derived in code and the model never gets a vote.
 * Loaded work at level 3 needs the full ninety; a neck circle needs almost none.
 */
const REST_BY_UNIT: Record<DoseUnit, [number, number, number]> = {
  timed: [45, 60, 90],
  hold: [45, 45, 60],
  carry: [60, 60, 75],
  duration: [0, 0, 0],
};

export function restSeconds(exercise: Exercise): number {
  if (isMobilityId(exercise.id) || isBookendId(exercise.id)) return 15;
  return REST_BY_UNIT[exercise.dose][exercise.level - 1];
}

/**
 * Roughly how long one controlled repetition takes at this population's tempo.
 *
 * Only used to read plans generated before the dose became time — those rows
 * stored `reps`, and a stored plan is never regenerated, so "3 × 10" has to keep
 * turning into something a timer can run for the rest of that plan's eight weeks.
 */
const LEGACY_SECONDS_PER_REP = 3;

/** Fallbacks for a stored row that carries nothing usable for its unit. */
const DEFAULT_SETS = 3;

/**
 * Safe bounds for a timed dose, by unit.
 *
 * The model writes the seconds so that a set can grow from 25 to 60 across the
 * eight weeks — that progression is the point of the plan and it cannot come
 * from a constant. What it does not get is an unbounded number: a two-minute
 * wall sit prescribed to a woman new to loading is an injury, not an ambitious
 * week, so its answer is clamped into a range a physio would sign off on.
 */
const SECONDS_RANGE: Record<"timed" | "hold" | "carry", { min: number; max: number }> = {
  timed: { min: 15, max: 90 },
  hold: { min: 10, max: 90 },
  carry: { min: 15, max: 120 },
};

/** What the app needs to run one exercise: the dose, the rest, and an honest length. */
export type HydratedDose = {
  unit: DoseUnit;
  perSide: boolean;
  /** Working sets. Always at least 1; `duration` is always exactly 1. */
  sets: number;
  /** Seconds per set (per side when `perSide`). `duration` — the whole block. */
  seconds: number;
  /** Seconds between sets. Zero for `duration`. */
  restSeconds: number;
  /** Estimated total seconds including rest between sets, for the session's time estimate. */
  estimatedSeconds: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/**
 * Turns what the plan stored into what the timer can run.
 *
 * The split of responsibility here is the whole design:
 *
 * - The **catalog** owns `unit` and `perSide`. Whether a wall sit is held still
 *   or worked through is a fact about the exercise, identical for every woman
 *   and every week. Asking a model to restate it eight times per user is eight
 *   chances to get it wrong for no benefit, and it got it wrong every time.
 * - The **catalog** owns `restSeconds`, derived from unit and level. Rest is
 *   safety-adjacent and the model has needed a guardrail on every other number.
 * - The **model** owns the dose values, because the dose is the plan: it is what
 *   makes week 8 harder than week 1, and a constant cannot do that.
 *
 * Everything the model writes is clamped into a safe band. A missing or absurd
 * value falls back rather than failing — a plan is never lost over a number.
 *
 * `stored.reps` only appears on plans generated before the dose became time. It
 * is converted at a controlled tempo rather than dropped, so those plans keep
 * running with numbers that still mean what they meant.
 */
export function hydrateDose(
  exercise: Exercise,
  stored: { sets?: number; reps?: number; seconds?: number; minutes?: number }
): HydratedDose {
  const rest = restSeconds(exercise);
  const sides = exercise.perSide ? 2 : 1;

  if (exercise.dose === "duration") {
    const seconds = stored.minutes
      ? clamp(stored.minutes, 1, 90) * 60
      : exercise.seconds ?? CARDIO_DEFAULT_SECONDS;
    return {
      unit: "duration",
      perSide: false,
      sets: 1,
      seconds,
      restSeconds: 0,
      estimatedSeconds: seconds,
    };
  }

  // timed | hold | carry — one shape: sets of seconds, run once per side.
  const sets = clamp(stored.sets ?? DEFAULT_SETS, 1, 6);
  const range = SECONDS_RANGE[exercise.dose];
  const written = stored.seconds ?? (stored.reps ? stored.reps * LEGACY_SECONDS_PER_REP : undefined);
  const seconds = written
    ? clamp(written, range.min, range.max)
    : exercise.seconds ?? range.min;

  return {
    unit: exercise.dose,
    perSide: exercise.perSide,
    sets,
    seconds,
    restSeconds: rest,
    estimatedSeconds: sets * seconds * sides + (sets - 1) * rest,
  };
}

/**
 * The dose an exercise gets in a given week when the model did not supply one.
 *
 * Used by the deterministic fallback plan and by the top-up that fills a session
 * the model under-delivered. The ladder matches the one the prompt asks for, so
 * a topped-up exercise sits at the same intensity as the ones around it rather
 * than reading as a week-1 dose dropped into week 7.
 *
 * Weeks 1-2 open conservatively, 3-5 build, 6-8 consolidate — one number moving
 * at a time, which is the only progression pattern that is safe to apply without
 * knowing how the last week actually went for her.
 */
export function defaultDoseForWeek(
  exercise: Exercise,
  week: number,
  sessionMinutes: number,
  exerciseCount: number
): { sets?: number; seconds?: number; minutes?: number } {
  const band = week <= 2 ? 0 : week <= 5 ? 1 : 2;

  if (exercise.dose === "duration") {
    const cap = cardioMinutes(sessionMinutes, exerciseCount);
    // Cardio climbs toward the cap rather than starting at it.
    return { minutes: Math.max(3, Math.round(cap * [0.7, 0.85, 1][band])) };
  }

  const sets = [2, week <= 4 ? 2 : 3, 3][band];
  const range = SECONDS_RANGE[exercise.dose];
  // A per-side set runs its seconds twice, so the same number would be twice the
  // work — and a session of them would quietly run double the minutes promised.
  const ladder = exercise.perSide ? [15, 25, 35] : [25, 40, 55];
  return { sets, seconds: clamp(ladder[band], range.min, range.max) };
}

/**
 * How many minutes a cardio block gets inside a session that also has other work.
 *
 * Both the fallback builder and the code top-up used to hand a cardio id
 * `MOVEMENT_VOLUME.minutes` — the ENTIRE session allowance — and then sit three
 * strength exercises next to it, so a "28 minute" session really ran 45+. That
 * was invisible while nothing displayed a total; the session player prints one.
 */
export function cardioMinutes(sessionMinutes: number, exerciseCount: number): number {
  if (exerciseCount <= 1) return sessionMinutes;
  return Math.max(3, Math.round(sessionMinutes * 0.5));
}

// ─── Exercise video ─────────────────────────────────────────────────────────

/**
 * Clips are NOT bundled with the Expo app. Fifty-odd of them would add tens of
 * MB to every binary and force an App Store release to re-cut a single one.
 * They live in a public Supabase Storage bucket behind its CDN, named after the
 * id, and the app caches each one on first play.
 *
 * Bucket layout (`exercise-clips`, public read) — one flat namespace, so a
 * warm-up clip is uploaded exactly like an exercise one:
 *   L01.mp4   H.264 High, no audio track, 6-10s silent loop, 9:16 1080×1920,
 *             30fps, faststart, ≤1600 kbps
 *   W01.mp4   same spec, warm-up
 *
 * **The budget is a bitrate, not a byte count.** Clips run 1.2s to 16s, so a
 * flat cap calls a long clip bloated and passes a short overcooked one. The
 * 2026-08-26 re-export landed at a 3276 kbps median — film-grade for a static
 * camera on a plain background, and about 2.5x more than a 6-inch screen can
 * resolve. Above roughly 1200 kbps the extra bits buy grain nobody sees and go
 * straight onto her cellular bill.
 *
 * **Upload with `npm run clips upload <dir>`, never through the Supabase
 * dashboard.** The script parses each file and refuses anything off-spec, and
 * it sets a one-year `cacheControl` — the dashboard uploader stamps
 * `max-age=3600`, which is why the first batch revalidated against origin on
 * essentially every play. `npm run clips audit` compares the live bucket to
 * `MEDIA_READY` and is the only thing that catches an id served with no file
 * behind it.
 *
 * **`faststart` is not optional and is invisible if you skip it.** The `moov`
 * index has to sit before `mdat`, or the player reads the head, finds no index,
 * range-requests the tail and only then starts decoding — three sequential
 * round trips before the first frame, on a CDN that already has the bytes. Every
 * clip in the 2026-08-25 batch shipped with `moov` last (HandBrake's "Web
 * Optimized" box unchecked) and that, not file size, was why they loaded slowly:
 * the whole 40-clip library is 3.2MB. In ffmpeg it is `-movflags +faststart`.
 *
 * **There are no poster images.** The shoot produced video only, so the app
 * shows the clip's own first frame rather than a separate `.webp` — a poster
 * that 404s is a broken image box where the movement should be, which is worse
 * than the quarter-second of blank the first frame costs. If posters are ever
 * cut, they come back as a field on `ExerciseMedia` and a second gate; do not
 * assume `<id>.webp` exists because `<id>.mp4` does.
 *
 * **9:16, and frame the movement inside the central 76% of width.** The mobile
 * session runner is a full-bleed stage — the clip is the whole screen — so it
 * covers the display rather than fitting inside a box. On a 19.5:9 phone that
 * drops roughly the outer 100px on each side of a 1080-wide frame; on a 16:9
 * device nothing is cropped at all, so the framing has to survive both. Keep
 * the body inside 820px at the widest point of the movement (arms overhead,
 * full lunge stride) and 5% clear top and bottom.
 *
 * It was 4:5 until 2026-08-23. A 4:5 clip covering a modern phone loses 42% of
 * its width — on a lateral raise that is both arms. The 2026-08-25 batch was
 * correctly 9:16 but exported at **607×1080**, not 1080×1920: the aspect was
 * right and nothing was cropped, but a 607-wide frame is upscaled on every phone
 * it plays on. At 30-215KB against an 800KB budget the resolution had been given
 * away for nothing. Re-exported at full size on 2026-08-26; shoot the remaining
 * ids at 1080×1920 and let `npm run clips check` confirm it before upload.
 *
 * Encode line, if you are not using HandBrake — from the masters, never from an
 * already-compressed export:
 *
 *   ffmpeg -i master.mov -an -vf "scale=1080:1920:flags=lanczos" \
 *     -c:v libx264 -preset veryslow -crf 21 -profile:v high -level 4.1 \
 *     -pix_fmt yuv420p -movflags +faststart out.mp4
 *
 * Keep the codec uniformly H.264. HEVC would save a couple of hundred KB per
 * clip, which is worth nothing here, and mixing `hvc1` into the library risks
 * playback failures on older Android for no gain — `C01` was the one HEVC file
 * in the first batch and it is the kind of inconsistency that fails on one
 * customer's phone and nobody else's.
 *
 * Only the API builds these URLs. If the bucket ever moves to another CDN, this
 * constant is the only thing that changes — no client ships a hardcoded path.
 */
const MEDIA_BASE =
  process.env.EXERCISE_MEDIA_BASE ??
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/exercise-clips`;

/**
 * Which clips have actually been **uploaded to the bucket**, not which ones are
 * planned. An id lands here when its `.mp4` is actually in `exercise-clips`.
 *
 * The gate stays because the mobile app is live: an id listed here with nothing
 * behind it is a 404 in her player mid-session, while an id left out falls back
 * to name + props and looks deliberate.
 *
 * Holds both catalog ids and `W` warm-up ids — one bucket, one gate, so a
 * warm-up clip is added the same way an exercise one is.
 */
const MEDIA_READY = new Set<string>([
  // Exercises (28 of 51)
  "L01", "L02", "L03", "L05", "L07", "L08", "L09", "L11", "L12", "L13",
  "P01", "P02", "P03",
  "U01", "U03", "U05", "U07", "U08", "U09", "U10", "U11", "U12",
  "C01", "C02", "C03", "C06",
  "I01", "I05",
  // Warm-ups (12 of 15; U11 above serves both)
  //
  // Cool-down stretches: 0 of 19. The whole `S` family is unfilmed — see
  // docs/plan/recording-list.md.
  "W01", "W02", "W05", "W06", "W07", "W08", "W09", "W10", "W12", "W13", "W14",
  "W15",
]);

export type ExerciseMedia = { video: string };

/** The clip for any id in the bucket — catalog exercise or warm-up. */
export function exerciseMedia(id: string): ExerciseMedia | undefined {
  if (!MEDIA_READY.has(id) || !MEDIA_BASE) return undefined;
  return { video: `${MEDIA_BASE}/${id}.mp4` };
}

/**
 * What each answer to the quiz's `q_limitations` screen takes off the table.
 *
 * The ids are the contract with `LIMITATION_OPTIONS` in
 * `app/register/page.tsx` and `PHYSICAL_LIMITS` in
 * `app/api/auth/save-quiz/route.ts`. A stored value matching none of these keys
 * is silently ignored, which is exactly the failure this exists to prevent —
 * rename in all three places or nowhere.
 *
 * `impact` is the jarring, landing-on-your-joints kind of work, so every
 * limitation except a sore shoulder drops it wholesale. `ids` is then the
 * specific list for that body part, and the reasoning is deliberately
 * conservative: this is an unsupervised plan for a woman who has told us the
 * part already hurts, so a move stays out if it is a common aggravator, not
 * only if it is contraindicated.
 *
 * "none" is not a key — she is saying nothing applies, so nothing is removed.
 */
const LIMITATION_EXCLUDES: Record<string, { impact: boolean; ids: string[] }> = {
  // Loaded spinal flexion and hinging under load. The two hinges (P03, L13) and
  // the bent-over row go; the bridges stay, because they load the same chain
  // with her back on the floor.
  back: {
    impact: true,
    ids: [
      "L07", "L13", "L14", "P03", "U09", "C03", "C08", "C09",
      "W03", "W12", "W16",
      "S03", "S17",
    ],
  },
  // Lunges, split positions, step-ups and long loaded knee flexion. L01, L02,
  // L11 and L12 stay — sitting to a chair is the knee-friendly pattern and
  // dropping it would leave her no lower-body strength work at all.
  knee: {
    impact: true,
    ids: [
      "L04", "L05", "L06", "L07", "L09", "L10", "L14", "C01",
      "W03", "W05", "W12",
      // Every kneeling or deep-knee-flexion stretch. This is most of the
      // lower-body half of the `S` family, which is why the generic cool-down
      // deliberately contains none of them.
      "S04", "S06", "S11", "S13", "S14", "S16", "S18",
    ],
  },
  // Deep hip flexion under load and the wide-stance loaded hinge.
  hip: {
    impact: true,
    ids: [
      "L06", "L07", "L09", "L10", "L13", "L14",
      "W03", "W05", "W12",
      // End-range external rotation and hip-flexor lengthening. The figure-four
      // is routinely prescribed FOR a sore glute and is still out: it is also
      // the classic aggravator of an impinging hip, and this plan cannot tell
      // the two apart from a tick box.
      "S11", "S12", "S13", "S15", "S16",
    ],
  },
  // Overhead, abduction and pressing from the floor. No impact rule — a sore
  // shoulder is not a reason to drop bone loading. U01-U03 stay (that graded
  // wall → counter → table ramp IS the way back), as do the two scapular moves
  // U10 and U11, which are what a sore shoulder usually needs more of.
  shoulder: {
    impact: false,
    ids: [
      "U04", "U05", "U07", "U08", "U12", "C08",
      "W10", "W15", "W16",
      // Overhead and end-range extension. S05 thread-the-needle and S08
      // cross-body stay in for the same reason U10/U11 do — they are what a
      // sore shoulder usually needs more of, not less.
      "S01", "S02", "S06", "S09", "S10",
    ],
  },
  // Anything that spikes intra-abdominal pressure: the heavy carry, the front
  // plank, and the loaded hinges, alongside the jumping. C05 side plank, C06
  // dead bug and C07 pallof press stay in deliberately — they are the core work
  // that is routinely prescribed *for* this, at a fraction of the pressure.
  pelvic_floor: {
    impact: true,
    ids: ["C03", "C04", "C08", "C09", "L13", "L14", "P03", "W05", "W15", "W16"],
  },
  // Anything she could fall from or during — the single-leg stances. The
  // *supported* reverse lunge (L06) stays: a hand on the counter is the training
  // for this, not a risk of it.
  //
  // This rule used to name B02/B03 (the unstable balance holds) as its core.
  // With the `B` family retired there is no balance training left to grade, so
  // what remains is exclusion only — worth remembering if `B` ever comes back.
  balance: {
    impact: true,
    ids: ["L07", "L09", "L10", "L14", "W12"],
  },
};

/**
 * The exercises this user may be given.
 *
 * `movement_snacks` is a cadence, not a difficulty — it gets short, no-setup
 * moves she can do many times a day. Joint pain and the `q_limitations` answers
 * remove work she shouldn't be given; those filters run in code, never in the
 * prompt, so a model can't opt out of them.
 *
 * The pool is never emptied by this: a beginner ticking every limitation AND
 * reporting joint pain still keeps 13 exercises, with lower body, hinge, upper
 * body, core and low-impact bone loading all represented — enough for the 4-6
 * different ids a session needs. Adding a limitation means re-measuring that
 * (`scripts/verify-plan-dose.ts` prints every pool size): the exclusions are a
 * hard gate, and a gate that starves the generator produces a worse plan than
 * one that lets a step-up through.
 *
 * That floor was 20 before the 2026-08-24 catalog change and the headroom is
 * genuinely thinner now — cardio was carrying a lot of it, and every `K` id
 * survived every limitation. It came back to 13 on 2026-08-26 (I12, the
 * soft-surface heel drop, is the only addition that survives every rule).
 * Thirteen is workable across eight weeks; ten would not be.
 */
export function allowedExercises(
  fitnessLevel: string | null,
  topProblems: string[],
  physicalLimits: string[] = []
): Exercise[] {
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;
  const snacksOnly = fitnessLevel === "movement_snacks";
  const rules = physicalLimits.map((l) => LIMITATION_EXCLUDES[l]).filter(Boolean);
  const excludedIds = new Set(rules.flatMap((r) => r.ids));
  const noImpact = rules.some((r) => r.impact);

  return EXERCISES.filter((e) => {
    // Bookends are drawable, never prescribable as the main work.
    if (isBookendId(e.id)) return false;
    if (snacksOnly ? !e.snack : e.level > maxLevel) return false;
    if (topProblems.includes("joint_pain") && e.impact === "high") return false;
    if (noImpact && e.impact === "high") return false;
    if (excludedIds.has(e.id)) return false;
    return true;
  });
}

/**
 * The warm-up / cool-down movements this user may be given.
 *
 * The mirror of `allowedExercises()` and deliberately built from the same
 * `LIMITATION_EXCLUDES` lists: a knee that rules out a lunge in the session
 * rules out the lunge she does to warm up for it. What it does NOT apply is
 * fitness level or the snack rule — a bookend is level 1 by construction, and
 * two minutes of hip circles is not something an advanced user graduates past.
 *
 * A woman ticking all six limitations keeps 9 of the 15, with hips, spine,
 * shoulders and calves all still represented. Re-check that when adding a
 * limitation: a starved bookend pool sends the model back to the same three
 * moves every week, which is the generic warm-up it is replacing.
 */
export function allowedWarmups(physicalLimits: string[] = []): Exercise[] {
  const excluded = new Set(
    physicalLimits.flatMap((l) => LIMITATION_EXCLUDES[l]?.ids ?? [])
  );
  return EXERCISES.filter((e) => isWarmupId(e.id) && !excluded.has(e.id));
}

/**
 * The cool-down stretches this user may be given — `allowedWarmups()` on the
 * other prefix, and filtered by the same lists for the same reason.
 *
 * It is a separate pool rather than a flag on one function because the two
 * bookends are separately selectable: the plan prompt hands the model warm-ups
 * for "warmup" and stretches for "cooldown", so a session can no longer finish
 * on leg swings.
 *
 * The floor is thinner here than for the warm-ups and the reason is anatomical
 * rather than accidental: most static stretching for the lower body happens on a
 * kneecap or at end-range hip rotation, which is precisely what `knee` and `hip`
 * exclude. A woman ticking all six keeps **exactly 4** — S05, S07, S08, S19,
 * the seated and supine upper-body work — against a `BOOKEND_MAX` of 4. That is
 * the floor, not headroom: her eight cool-downs will all be the same four moves,
 * and one more exclusion here makes a full cool-down unrepresentable. Any new
 * `S` id should be one that survives `knee` and `hip`, and any new exclusion on
 * this family needs this number re-measured before it ships.
 */
export function allowedCooldowns(physicalLimits: string[] = []): Exercise[] {
  const excluded = new Set(
    physicalLimits.flatMap((l) => LIMITATION_EXCLUDES[l]?.ids ?? [])
  );
  return EXERCISES.filter((e) => isCooldownId(e.id) && !excluded.has(e.id));
}

/** Her limitations as a readable list, for the plan prompt. Null when none apply. */
export function limitationLine(physicalLimits: string[] | null): string | null {
  const named = (physicalLimits ?? [])
    .map((l) => LIMITATION_LABEL[l])
    .filter(Boolean);
  return named.length ? named.join(", ") : null;
}

const LIMITATION_LABEL: Record<string, string> = {
  back: "lower back pain",
  knee: "knee pain",
  hip: "hip pain",
  shoulder: "neck or shoulder pain",
  pelvic_floor: "pelvic floor problems / leaking",
  balance: "balance problems or dizziness",
};

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
 * the contract with the /register funnel (`NUTRITION_ITEMS` in
 * `app/register/page.tsx`) — see docs/plan/pillars.md. Do not reword them here
 * alone.
 *
 * The funnel shows **five of these ten**, and says so ("5 of the 10 daily habits
 * in your plan"). Ten rows on a sales page was the highest-friction unpaid
 * interaction in the funnel and it sat one screen before the price; all ten
 * still run in the app, which is why the copy says five *of* ten.
 *
 * That subset is chosen for leverage and carries its **own** order — see
 * `NUTRITION_ITEMS` in `app/register/page.tsx`. It is deliberately not "the
 * first five of this list": the funnel leads with protein, the post-meal walk
 * and the overnight fast, which sit 1st, 5th and 6th here. Two independent
 * orderings, and each is load-bearing where it lives (this one drives the app's
 * daily list, that one drives which "first swaps" she is shown before she buys),
 * so reordering either does not update the other.
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
    label: "Healthy fats",
    group: "Every meal",
    target: 3,
    why: "Fat is what your hormones are built from, and it's the part of a meal that actually holds you until the next one.",
  },
  {
    id: "high_fiber",
    label: "High-fiber food",
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
    label: "5-minute reset between tasks",
    use: "Before the next thing, not after the day.",
    kind: "practice",
    minutes: 5,
  },
];

/**
 * Which practice stands in when the model names one that isn't in this catalog.
 *
 * It reads "relaxation" and reaches for a stretch — `M03` "Torso twist with arm
 * swings" is a real id, just a *movement* one, and `isRelaxationId` rejects it.
 * Dropping that task is what makes the failure expensive: a week left with two
 * tasks fails the completeness check in buildPlan(), and the whole personalized
 * plan is thrown away for the deterministic one. So the task is repaired
 * instead, exactly as a habit that restates a nutrition row is swapped rather
 * than deleted.
 *
 * Keyed by the nine `PROBLEM_OPTIONS` ids from the register funnel and read in
 * her own priority order, so the substitute is still matched to her worst
 * symptom. This is the same mapping the plan prompt states in prose — the
 * difference is that the model can't opt out of this copy.
 */
const RELAXATION_FOR_SYMPTOM: Record<string, string> = {
  hot_flashes: "breath_hotflash",
  sleep_issues: "breath_sleep",
  anxiety: "breath_sigh",
  mood_swings: "breath_sigh",
  brain_fog: "breath_paced_6",
  low_energy: "breath_paced_6",
  weight_changes: "slow_breath_meal",
  bloating: "slow_breath_meal",
  joint_pain: "body_scan",
};

/**
 * Her best-matching practice, skipping any already used in the same week so a
 * repaired task never duplicates the one beside it. Always returns something —
 * a week with a relaxation task is the point.
 */
export function relaxationForSymptom(
  topProblems: string[],
  exclude: ReadonlySet<string> = new Set()
): RelaxationItem {
  for (const problem of topProblems) {
    const id = RELAXATION_FOR_SYMPTOM[problem];
    if (!id || exclude.has(id)) continue;
    const item = RELAXATION.find((r) => r.id === id);
    if (item) return item;
  }
  return RELAXATION.find((r) => !exclude.has(r.id)) ?? RELAXATION[0];
}

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
