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
  /**
   * The clip's exact filename in the `exercise-clips` bucket, spaces and all.
   *
   * Absent means the movement has no clip yet — `exerciseMedia()` returns
   * undefined and the app shows name + props with no player, which reads as
   * deliberate. It is never a guessed filename: the previous design derived one
   * from the id, so a shoot that named its files anything else produced a
   * library of 404s that nothing but a mid-session player could detect.
   */
  clip?: string;
};

// 47 prescribable exercises (`L`/`I`/`U`/`C`/`P`), plus 26 bookend movements: 15
// warm-ups (`W`) and 11 stretches (`S`). Both bookend families are ordinary rows
// here so `getExercise()` resolves them; the prefix is what keeps them out of
// the main work.
//
// **This table is the bucket.** It was rebuilt on 2026-08-27 against a shoot
// that replaced the library wholesale — every clip in `exercise-clips` has a row
// here and every row has a clip, so there is nothing to keep in sync by hand
// and `npm run clips audit` proves it. Anything you remember from the previous
// catalog is gone; git history is the record, not a commented-out block.
//
// The shoot is organized in seven series and the code sees four prefixes. The
// mapping is deliberate and this is the only place it is written down:
//
//   | Shoot series                          | Prefix    | n  |
//   |---------------------------------------|-----------|----|
//   | Lower Body Strength                   | `L01-L16` | 16 |
//   | Plyometrics & Force Absorption        | `I01-I08` |  8 |
//   | Upper Body Strength                   | `U01-U12` | 12 |
//   | Core & Posterior Stability            | `C01-C08` + `P01-P03` | 11 |
//   | Warm-up & Mobility                    | `W01-W15` | 15 |
//   | Post-Lower Body Routine               | `S01-S06` |  6 |
//   | Post-Upper Body Routine               | `S07-S11` |  5 |
//
// Two of those renamings are load-bearing, not cosmetic:
//
// - **PLYO -> `I`.** `ensureBoneLoading()` and the prompt's bone-coverage rule
//   both test `startsWith("I")`, and `P` is already spoken for by the posterior
//   chain — under any prefix rule `PLYO01` and `P01` are the same family. `I`
//   for impact keeps every existing predicate working untouched.
// - **Rl/Ru -> one `S` series.** `isStretchId` is `startsWith("S")`, so folding
//   both post-workout routines into one cool-down pool keeps
//   `allowedCooldowns()` working. The lower/upper split survives as the S01-S06
//   / S07-S11 block boundary below rather than as a prefix; if the app should
//   ever pick the post-upper routine after a pressing session specifically,
//   that is a second predicate here, not a rename.
//
// Core & Posterior Stability is one series and two prefixes: `C` is the trunk
// work and `P` the hinge, kept apart because they are excluded by different
// limitations — a pelvic floor rule wants the plank gone and the bridge kept.
//
// The seventh tuple element is the clip's **exact filename in the bucket**,
// spaces and all. Ids are the contract with the app and the model; filenames
// are the contract with the bucket, and keeping them apart is what lets the
// shoot stay human-readable where it is managed by hand. A row with no filename
// is an exercise with no clip — she gets name and props, which looks
// deliberate. See `exerciseMedia()`.
//
// Names are house sentence case rather than the shoot's title case: the ids are
// the contract, the strings are UI copy.
const E: [string, string, string, 1 | 2 | 3, Impact, boolean, string?][] = [
  // ─── Lower Body Strength (16) ─────────────────────────────────────────────
  //
  // Sixteen clips, but around seven distinct movement patterns: the shoot filmed
  // loaded and bodyweight versions of the same lift as separate clips. That is
  // right for her — the bodyweight version is the regression she needs in week 1
  // and the loaded one is week 6 — but it means the pool is shallower than 16
  // suggests, and the prompt's "use at least N different ids" rule can be
  // satisfied with four squats. Worth remembering when reading a generated plan.
  ["L01", "Chair squat", "Sturdy chair", 1, "none", true, "L01 - Chair Squat.mp4"],
  ["L02", "Bodyweight squat", "None", 1, "none", true, "L02 - Bodyweight Squat.mp4"],
  ["L03", "Goblet squat", "1 dumbbell", 2, "none", false, "L03 - Goblet Squat.mp4"],
  ["L04", "Step-up", "Stair or sturdy chair", 1, "low", true, "L04 - Bodyweight Step Up.mp4"],
  ["L05", "Step-up, loaded", "Stair, 2 dumbbells", 2, "low", false, "L05 - Loaded Step Up.mp4"],
  ["L06", "Walking lunge", "None", 3, "none", false, "L06 - Walking Lunge.mp4"],
  ["L07", "Bulgarian split squat, loaded", "Chair or couch, 2 dumbbells", 3, "none", false, "L07 - Loaded Bulgarian Split Squat.mp4"],
  ["L08", "Bulgarian split squat", "Chair or couch", 2, "none", false, "L08 - Bodyweight Bulgarian Split Squat.mp4"],
  ["L09", "Split squat, loaded", "2 dumbbells", 2, "none", false, "L09 - Loaded Split Squat.mp4"],
  ["L10", "Split squat", "None", 2, "none", true, "L10 - Bodyweight Split Squat.mp4"],
  ["L11", "Prisoner squat", "None", 1, "none", true, "L11 - Prisoner Squat.mp4"],
  // L02 and L12 are near neighbours — the shoot filmed a bodyweight squat twice,
  // once with the arms forward and once without. Both are kept because the model
  // gets more to rotate through and she cannot tell them apart badly; do not
  // read "two ids" as "two exercises" when counting the beginner pool.
  ["L12", "Air squat", "None", 1, "none", true, "L12 - Squat.mp4"],
  // The only hinge in the catalog until the C/P series is filmed. Losing it to a
  // limitation leaves her with no posterior-chain work at all.
  ["L13", "Dumbbell sumo deadlift", "1 dumbbell", 2, "none", false, "L13 - Dumbbell Sumo Deadlift.mp4"],
  ["L14", "Calf raise, loaded", "2 dumbbells", 2, "none", false, "L14 - Loaded Calf Raise.mp4"],
  ["L15", "Calf raise", "None", 1, "none", true, "L15 - Calf Raise Short.mp4"],
  ["L16", "Supported reverse lunge", "Wall or counter", 2, "none", false, "L16 - Supported Reverse Lunge.mp4"],

  // ─── Plyometrics & Force Absorption (8) ───────────────────────────────────
  //
  // The bone-loading family. `Impact` has no middle value, so everything that
  // involves leaving the ground or catching a landing is graded "high" and is
  // dropped wholesale by `joint_pain` and by every limitation except a sore
  // shoulder. Grading a pogo jump "low" to keep it in the pool would put it in
  // front of a woman who has just told us her knee hurts.
  //
  // That leaves **I01 as the only bone work a limited user can be given**, where
  // the previous catalog had a low-impact pair. `ensureBoneLoading()` rotates
  // across whatever it is handed, so for those users four of the eight weeks
  // load bone with the same movement. It is still the right call — one real
  // stimulus beats none — but a second low-impact clip (a supported heel drop
  // was the old one) is the cheapest content fix left in this catalog, and the
  // only measured gap after the `U` and `C`/`P` series landed.
  ["I01", "Stomping march", "None", 1, "low", true, "Plyo01 - Stomping March.mp4"],
  ["I02", "Box drop deceleration", "Low box or bottom stair", 3, "high", false, "Plyo02 - Box Drop Deceleration.mp4"],
  ["I03", "Pogo jump, vertical", "None", 2, "high", true, "Plyo03 - Vertical Pogo Jumps.mp4"],
  ["I04", "Pogo jump, lateral", "None", 2, "high", true, "Plyo04 - Lateral Pogo Jumps.mp4"],
  ["I05", "Pogo jump, linear", "None", 2, "high", true, "Plyo05 - Linear Pogo Jumps.mp4"],
  ["I06", "Pogo jump, multi-directional", "None", 3, "high", false, "Plyo06 - Multi Directional Pogo Jumps.mp4"],
  ["I07", "Lateral step and stick", "None", 2, "high", false, "Plyo07 - Lateral Step And Stick.mp4"],
  ["I08", "Plyometric skip", "None", 3, "high", false, "Plyo08 - Plyometric Skips.mp4"],

  // ─── Upper Body Strength (12) ─────────────────────────────────────────────
  //
  // U01-U03 are the graded push-up ramp — wall, then table, then bench. That
  // ladder IS the way back for a sore shoulder, which is why the `shoulder`
  // limitation keeps all three and drops the overhead and floor work instead.
  ["U01", "Wall push-up", "Wall", 1, "none", true, "U01 - Wall Push Up.mp4"],
  ["U02", "Table push-up", "Kitchen counter or table", 1, "none", true, "U02 - Table Push Up.mp4"],
  ["U03", "Bench push-up", "Sturdy bench or chair", 2, "none", true, "U03 - Bench Push Up.mp4"],
  ["U04", "Dumbbell floor press", "2 dumbbells, floor", 2, "none", false, "U04 - Dumbbell Floor Press.mp4"],
  ["U05", "Seated overhead press", "2 dumbbells, chair", 2, "none", false, "U05 - Seated Overhead Press.mp4"],
  ["U06", "Standing overhead press", "2 dumbbells", 2, "none", false, "U06 - Standing Overhead Press.mp4"],
  ["U07", "Bent-over dumbbell row", "2 dumbbells", 2, "none", false, "U07 - Bent Over Dumbbell Row.mp4"],
  ["U08", "Single-arm dumbbell row", "1 dumbbell, chair or bench", 2, "none", false, "U08 - Single Arm Dumbbell Row.mp4"],
  ["U09", "Rear-delt fly", "2 dumbbells", 2, "none", false, "U09 - Rear Delt Fly.mp4"],
  // The scapular work. Kept in for a sore shoulder deliberately — Y-T-W and the
  // rear-delt fly are usually what an irritable shoulder needs more of, not less.
  ["U10", "Y-T-W shoulder raise", "Mat", 1, "none", false, "U10 - Ytw Shoulder Protocol.mp4"],
  ["U11", "Dumbbell lateral raise", "2 dumbbells", 2, "none", false, "U11 - Dumbbell Lateral Raise.mp4"],
  ["U12", "Seated overhead triceps extension", "1 dumbbell, chair", 2, "none", false, "U12 - Seated Overhead Tricep Extension.mp4"],

  // ─── Core & Posterior Stability (11) ──────────────────────────────────────
  //
  // The trunk work and the hinge. `C01`, `C04` and `C05` are isometrics and
  // `C03` is a loaded carry, so this series is the only reason the `hold` and
  // `carry` dose units have prescribable members at all — see `DOSE`.
  ["C01", "Wall sit", "Wall", 1, "none", true, "C01 - Wall Sit.mp4"],
  ["C02", "Bird-dog", "Mat", 1, "none", true, "C02 - Bird Dog.mp4"],
  ["C03", "Farmer's carry", "2 heavy dumbbells", 2, "none", false, "C03 - Farmers Carry.mp4"],
  ["C04", "Forearm plank", "Mat", 1, "none", true, "C04 - Forearm Plank.mp4"],
  ["C05", "Side plank", "Mat", 2, "none", false, "C05 - Side Plank.mp4"],
  ["C06", "Dead bug", "Mat", 1, "none", true, "C06 - Dead Bug.mp4"],
  // Mountain climbers are a fast alternating drill from a plank — graded "low"
  // rather than "high" because nothing leaves the ground, but it is still the
  // one `C` row a pelvic floor rule wants gone.
  ["C07", "Mountain climber", "Mat", 2, "low", true, "C07 - Mountain Climber.mp4"],
  ["C08", "Oblique twist", "Mat", 2, "none", true, "C08 - Oblique Twist.mp4"],
  ["P01", "Glute bridge", "Mat", 1, "none", true, "P01 - Bodyweight Glute Bridge.mp4"],
  ["P02", "Glute bridge, weighted", "Mat, 1 dumbbell", 2, "none", false, "P02 - Weighted Glute Bridge.mp4"],
  ["P03", "Romanian deadlift", "2 dumbbells", 2, "none", false, "P03 - Romanian Deadlift Pattern.mp4"],

  // ─── Warm-up & Mobility (15) ──────────────────────────────────────────────
  //
  // Ordinary catalog rows, so `getExercise()` resolves them and a bookend
  // hydrates into a name, a dose and a clip exactly like a squat does. What
  // keeps them out of the main work is the `W` prefix, which
  // `allowedExercises()` drops — see `isWarmupId`. That is the whole mechanism:
  // one table, one lookup, one prefix rule.
  //
  // W02, W12 and W13 are sequences rather than single movements, so they carry
  // longer doses in `DOSE` below and read as one block on the session screen.
  ["W01", "Lateral leg swings", "Wall or counter", 1, "none", false, "W01 - Lateral Leg Swings.mp4"],
  ["W02", "Dynamic movement prep", "None", 1, "none", false, "W02 - Dynamic Movement Prep.mp4"],
  ["W03", "PVC around the world", "Broomstick or PVC pipe", 1, "none", false, "W03 - Pvc Around The World.mp4"],
  ["W04", "Shoulder mobility", "None", 1, "none", false, "W04 - Shoulder Mobility Protocol.mp4"],
  ["W05", "Open book cross", "Mat", 1, "none", false, "W05 - Open Book Cross.mp4"],
  ["W06", "Hip circles", "None", 1, "none", false, "W06 - Hip Circles.mp4"],
  ["W07", "Cobra spinal extension", "Mat", 1, "none", false, "W07 - Cobra Spinal Extension Stretch.mp4"],
  ["W08", "World's greatest stretch", "Mat", 1, "none", false, "W08 - Worlds Greatest Stretch Flow.mp4"],
  ["W09", "Deep squat with thoracic reach", "None", 1, "none", false, "W09 - Deep Squat With Thoracic Reach.mp4"],
  ["W10", "Hamstring rocker", "Mat", 1, "none", false, "W10 - Hamstring Rocker Dissociation.mp4"],
  ["W11", "Thread the needle", "Mat", 1, "none", false, "W11 - Thread The Needle.mp4"],
  ["W12", "Full warm-up sequence", "None", 1, "none", false, "W12 - Comprehensive Warmup Sequence.mp4"],
  ["W13", "Integrated mobility flow", "Mat", 1, "none", false, "W13 - Integrated Mobility Flow.mp4"],
  ["W14", "Inchworm to plank reach", "Mat", 1, "none", false, "W14 - Inchworm To Plank Reach.mp4"],
  ["W15", "Linear leg swings", "Wall or counter", 1, "none", false, "W15 - Linear Leg Swings.mp4"],

  // ─── Post-Lower Body Routine (6) ──────────────────────────────────────────
  //
  // Static holds, the cool-down after a leg session. Bookends like the `W` rows
  // above, not main work: `allowedExercises()` drops them by prefix, so the
  // generator can never spend a strength slot on a child's pose. The difference
  // from `W` is *which* end they belong on — a dynamic leg swing warms a joint
  // up, a 40-second butterfly hold does the opposite — so `S` is the cool-down
  // pool and `W` is the warm-up pool. See `allowedCooldowns()`.
  ["S01", "Toe and heel calf stretch", "Wall or step", 1, "none", true, "Rl01 - Toe And Heel Calf Stretch.mp4"],
  ["S02", "Kneeling hip flexor stretch", "Mat", 1, "none", true, "Rl02 - Kneeling Low Lunge Hip Flexor Stretch.mp4"],
  ["S03", "Kneeling hamstring stretch", "Mat", 1, "none", true, "Rl03 - Kneeling Hamstring Stretch.mp4"],
  ["S04", "Child's pose", "Mat", 1, "none", true, "Rl04 - Childs Pose.mp4"],
  ["S05", "Butterfly stretch", "Mat", 1, "none", true, "Rl05 - Butterfly Pose.mp4"],
  ["S06", "Supine figure-4 stretch", "Mat", 1, "none", true, "Rl06 - Supine Figure-4 Stretch.mp4"],

  // ─── Post-Upper Body Routine (5) ──────────────────────────────────────────
  //
  // The same pool, filmed for the other end of the body. They are prescribable
  // today even though there is no upper-body work to follow — which is fine, and
  // in fact useful: a woman who spends her day at a desk wants the chest and
  // thoracic work whether or not she just pressed anything. When the `U` series
  // lands, this block is the natural argument for splitting `allowedCooldowns()`
  // in two.
  ["S07", "Cross-arm shoulder stretch", "None", 1, "none", true, "Ru01 - Cross Arm Abduction Stretch.mp4"],
  ["S08", "Seated side bend", "Mat", 1, "none", true, "Ru02 - Seated Side Bend.mp4"],
  ["S09", "Seated spinal twist", "Mat", 1, "none", true, "Ru03 - Seated Spinal Twist.mp4"],
  ["S10", "Chest and shoulder stretch", "Wall or doorway", 1, "none", true, "Ru04 - Chest And Shoulder Stretch.mp4"],
  ["S11", "Standing shoulder stretch", "None", 1, "none", true, "Ru05 - Standing Combination Shoulder Stretch.mp4"],
];

/*
 * There is no RETIRED block any more, and putting one back would be a trap.
 *
 * It used to hold the pre-2026-08-24 movements verbatim so restoring one was
 * moving a line. That worked while the ids still meant what they said. The
 * 2026-08-27 shoot replaced the library wholesale and reused every prefix, so a
 * commented-out `["L04", "Barbell back squat", ...]` sitting under a live
 * `["L04", "Step-up", ...]` is not a restorable line — it is two movements
 * claiming one id, waiting for someone to paste the wrong one back.
 *
 * `git log -- lib/plan/catalog.ts` is the record. Bringing a movement back means
 * filming it, giving it an id nothing else uses, and adding a row above.
 *
 * What is genuinely still wired and simply has no members: the `duration` dose
 * unit, `isCardioId()` (`K`) and `cardioMinutes()`. `buildPrompt()` drops its
 * continuous-block rule on its own when the pool holds no `duration` id, so
 * cardio needs rows and nothing else.
 */

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
  // Unilateral lower-body work — the seconds are per side, so the set runs
  // twice. Every step-up, lunge and split squat in the catalog is here; the
  // squats, the hinge and the calf raises are both-sides and need no row.
  L04: ["timed", true],
  L05: ["timed", true],
  L06: ["timed", true],
  L07: ["timed", true],
  L08: ["timed", true],
  L09: ["timed", true],
  L10: ["timed", true],
  L16: ["timed", true],
  // The one plyometric worked a side at a time — she steps out, lands, and
  // stabilises on that leg before coming back.
  I07: ["timed", true],
  // Isometrics — the hold IS the exercise. A plank opens shorter than a wall sit
  // because it is the whole trunk holding a line, not a leg holding a chair.
  C01: ["hold", false, 30],
  C04: ["hold", false, 20],
  C05: ["hold", true, 15],
  // Carries — measured in time because the alternative is measuring hallways.
  C03: ["carry", false, 40],
  // Unilateral trunk and upper-body work. The alternating floor work (bird-dog,
  // dead bug) is prescribed a side at a time rather than alternating within the
  // set: one thing to obey per countdown.
  C02: ["timed", true],
  C06: ["timed", true],
  C08: ["timed", true],
  U08: ["timed", true],
  // Warm-ups. Uniform on purpose — a warm-up is not progressed across the eight
  // weeks; it is the same two minutes in week 8 as in week 1.
  W01: ["timed", true, 40],
  W05: ["timed", true, 40],
  W06: ["timed", true, 40],
  W08: ["timed", true, 40],
  W09: ["timed", true, 40],
  W10: ["timed", true, 40],
  W11: ["timed", true, 40],
  W15: ["timed", true, 40],
  W03: ["timed", false, 40],
  W04: ["timed", false, 40],
  W07: ["timed", false, 40],
  W14: ["timed", false, 40],
  // The three sequences. They walk through several positions in one clip, so a
  // 40-second dose would cut the flow off partway; they get a block long enough
  // to finish once.
  W02: ["timed", false, 60],
  W12: ["timed", false, 90],
  W13: ["timed", false, 90],
  // Stretches. Every one is a `hold` — the hold IS the stretch — and uniform for
  // the same reason the warm-ups are: a cool-down is not progressed across the
  // eight weeks. 40 seconds is long enough for tissue to give and short enough
  // that she stays for it; the per-side ones run twice, so those sit at 30 to
  // keep the whole cool-down inside two minutes.
  S01: ["hold", true, 30],
  S02: ["hold", true, 30],
  S03: ["hold", true, 30],
  S06: ["hold", true, 30],
  S07: ["hold", true, 30],
  S08: ["hold", true, 30],
  S09: ["hold", true, 30],
  S10: ["hold", true, 30],
  S04: ["hold", false, 40],
  S05: ["hold", false, 40],
  S11: ["hold", false, 40],
  // `duration` is the one unit with no member: cardio and the mobility flow are
  // retired. It stays fully wired — `isCardioId()`, `cardioMinutes()` and the
  // prompt's continuous-block rule all still work, and `buildPrompt()` drops
  // that rule on its own while the pool holds none — so cardio needs rows and
  // nothing else.
};

/** Cardio's default block length when nothing else says otherwise. */
const CARDIO_DEFAULT_SECONDS = 900;

export const EXERCISES: Exercise[] = E.map(([id, name, props, level, impact, snack, clip]) => {
  const [dose, perSide, seconds] = DOSE[id] ?? (isCardioId(id) ? (["duration", false, CARDIO_DEFAULT_SECONDS] as const) : (["timed", false, undefined] as const));
  return { id, name, props, level, impact, snack, dose, perSide, seconds, clip };
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
 * Warm-up movements — dynamic, done before the work.
 *
 * They are in the catalog so the app can draw them, and out of the prescribable
 * pool so the generator cannot spend a strength slot on a hip circle. `W` is the
 * marker.
 */
export const isWarmupId = (id: string) => id.startsWith("W");

/**
 * Stretches — static, done after the work.
 *
 * Split from `W` rather than folded into it because the two are not
 * interchangeable: a leg swing prepares a joint for load and a 40-second
 * butterfly hold does the opposite of that. One prefix per end of the session
 * means the generator picks from the right pool without being asked to know the
 * difference, which is exactly the kind of fact it gets wrong.
 */
export const isStretchId = (id: string) => id.startsWith("S");

/**
 * Either bookend. This is the line `allowedExercises()` gates on — anything
 * drawable-but-not-prescribable goes here, and adding a third bookend family
 * means adding it to this one function.
 */
export const isBookendId = (id: string) => isWarmupId(id) || isStretchId(id);

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
  { id: "W04", sets: 1, seconds: 40 },
  { id: "W06", sets: 1, seconds: 40 },
  { id: "W09", sets: 1, seconds: 40 },
];

/**
 * The matching cool-down. Hips, then the front of the hip, then the spine.
 *
 * Three static holds off the floor, in the order a session tends to have
 * tightened them: the glutes take the squatting, the hip flexors take the
 * standing, and child's pose is the one that ends it lying down. About two
 * minutes all in.
 *
 * It used to be a yoga flow and a shoulder mobility drill — both warm-up
 * movements, reused at a slower dose because the catalog held no static
 * stretches at all. It does now (`S`), so the cool-down is finally cooling down.
 */
export const DEFAULT_COOLDOWN: readonly StoredExercise[] = [
  { id: "S06", sets: 1, seconds: 30 },
  { id: "S02", sets: 1, seconds: 30 },
  { id: "S04", sets: 1, seconds: 40 },
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

/** What one exercise's stored dose actually costs, in seconds, rest included. */
export function storedSeconds(stored: StoredExercise): number {
  const ex = getExercise(stored.id);
  return ex ? hydrateDose(ex, stored).estimatedSeconds : 0;
}

/** What a list of them costs. */
export const listSeconds = (list: readonly StoredExercise[] | undefined) =>
  (list ?? []).reduce((total, e) => total + storedSeconds(e), 0);

/**
 * Trims a session until it fits the time she was actually promised.
 *
 * The quiz screen that sets her fitness level states the deal in minutes —
 * "About 20 min, 2 days a week" — so `MOVEMENT_VOLUME.minutes` is not an
 * internal target, it is the sentence she read before she paid. Nothing used to
 * check it. The model wrote the sets and the seconds, `hydrateDose` clamped each
 * number into a safe band on its own, and nobody ever added them up: a
 * five-minute movement snack was reaching fourteen minutes by week 8, and an
 * eighteen-minute beginner session twenty-five.
 *
 * The order of the cuts is the whole design, because all three cost something
 * different and only the last one changes what the session *is*:
 *
 *  1. **Seconds first.** A shorter set is the same session, slightly easier. It
 *     stops at the unit's floor — below that the set is not worth standing up
 *     for.
 *  2. **Then a set.** Losing the third set costs some volume and no variety.
 *     Never below two: one set of anything is a rehearsal.
 *  3. **Then an exercise, last.** This is the only cut she would notice as a
 *     different workout, so it happens only when the first two have run out, and
 *     never below the floor the prompt asked for.
 *
 * Bookend seconds are passed in rather than trimmed: two minutes of warm-up is
 * the safety margin on everything above it, and taking that back to make room
 * for another set has the priority exactly backwards.
 */
export function fitSessionToMinutes(
  work: readonly StoredExercise[],
  bookendSeconds: number,
  budgetMinutes: number,
  floor: number
): StoredExercise[] {
  const out = work.map((e) => ({ ...e }));
  if (!out.length) return out;
  const budget = budgetMinutes * 60;
  const over = () => listSeconds(out) + bookendSeconds > budget;
  const unitOf = (e: StoredExercise) => getExercise(e.id)?.dose;

  // 1. Seconds, five at a time, off whichever set is currently longest.
  for (let guard = 0; guard < 200 && over(); guard++) {
    const trimmable = out
      .filter((e) => {
        const unit = unitOf(e);
        if (!unit || unit === "duration") return false;
        return (e.seconds ?? 0) > SECONDS_RANGE[unit].min;
      })
      .sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0))[0];
    if (!trimmable) break;
    const min = SECONDS_RANGE[unitOf(trimmable) as "timed" | "hold" | "carry"].min;
    trimmable.seconds = Math.max(min, (trimmable.seconds ?? min) - 5);
  }

  // 2. A set, off whichever exercise still has the most.
  for (let guard = 0; guard < 20 && over(); guard++) {
    const heaviest = out
      .filter((e) => (e.sets ?? DEFAULT_SETS) > 2)
      .sort((a, b) => (b.sets ?? DEFAULT_SETS) - (a.sets ?? DEFAULT_SETS))[0];
    if (!heaviest) break;
    heaviest.sets = (heaviest.sets ?? DEFAULT_SETS) - 1;
  }

  // 3. An exercise, from the end, never below the floor.
  while (over() && out.length > floor) out.pop();

  return out;
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
 * bookend clip is uploaded exactly like an exercise one:
 *   L01.mp4   H.264 High, no audio track, 6-10s silent loop, 9:16 1080×1920,
 *             30fps, faststart, ≤1600 kbps
 *   W01.mp4   same spec, warm-up
 *   S05.mp4   same spec, stretch
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
 * essentially every play. `npm run clips audit` compares the live bucket to the
 * `clip` filenames on the rows above, in both directions, and is the only thing
 * that catches an id served with no file behind it or a file nothing serves.
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

export type ExerciseMedia = { video: string };

/**
 * The clip for any id that has one — catalog exercise, warm-up or stretch.
 *
 * **The filename comes off the row, not from the id.** This used to be a
 * `MEDIA_READY` set of ids plus `${MEDIA_BASE}/${id}.mp4`, which quietly assumed
 * the shoot would name its files after our ids. The 2026-08-27 shoot named them
 * `L01 - Chair Squat.mp4`, and under the old rule every one of the fifty would
 * have resolved to a URL with nothing behind it — a 404 in her player mid-session,
 * invisible from the dashboard, invisible in a build. Two lists that had to agree
 * are now one field that cannot disagree with itself, and `npm run clips audit`
 * checks it against what is actually live.
 *
 * `encodeURIComponent` is not optional: the filenames carry spaces, and an
 * unencoded space is a malformed URL rather than a slow one. It encodes the
 * whole name as a single path segment, which is correct here — no clip lives in
 * a subfolder, and if one ever does, that is a `dir/` prefix on `MEDIA_BASE`,
 * never a slash smuggled through this call.
 */
export function exerciseMedia(id: string): ExerciseMedia | undefined {
  const clip = BY_ID.get(id)?.clip;
  if (!clip || !MEDIA_BASE) return undefined;
  return { video: `${MEDIA_BASE}/${encodeURIComponent(clip)}` };
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
  // Loaded hinging and loaded spinal flexion. The two hinges (P03, L13) and the
  // bent-over rows go; the bridges stay, because they load the same chain with
  // her back on the floor. W08 and W14 both take her through a deep toe-touch
  // under her own bodyweight, and S03 is a kneeling hamstring stretch, which is
  // the same lumbar position held. W07's cobra stays — extension is usually what
  // a sore back wants more of.
  back: {
    impact: true,
    ids: ["L06", "L13", "P03", "U07", "U08", "C03", "C07", "W08", "W14", "S03"],
  },
  // Lunges, split positions, step-ups and long or deep loaded knee flexion.
  // L01, L02, L11, L12 and the calf raises stay — sitting to a chair is the
  // knee-friendly pattern and dropping it would leave her no lower-body strength
  // work at all.
  knee: {
    impact: true,
    ids: [
      "L04", "L05", "L06", "L07", "L08", "L09", "L10", "L16", "C01", "W08",
      "W09",
      // Kneeling and deep knee flexion. The floor stretches that leave the knee
      // straight or loosely bent (S05, S06) stay — a sore knee usually wants
      // more of those, not less.
      "S02", "S04",
    ],
  },
  // Deep hip flexion under load, the split positions, and the wide-stance
  // loaded hinge.
  hip: {
    impact: true,
    ids: [
      "L06", "L07", "L08", "L09", "L10", "L13", "L16", "W08", "W09",
      // End-range hip abduction. S06's figure-4 stays: it is the gentle version
      // of the same stretch, done lying down with the leg supported.
      "S05",
    ],
  },
  // Overhead, end-range abduction, and pressing from the floor. No impact rule
  // — a sore shoulder is not a reason to drop bone loading. U01-U03 stay (that
  // graded wall → table → bench ramp IS the way back), as do the two scapular
  // moves U09 and U10, which are what a sore shoulder usually needs more of.
  shoulder: {
    impact: false,
    // U12 presses overhead too. W03 takes a stick through a full overhead arc,
    // C07 and W14 load the shoulder in a plank, and S10 pins the arm and rotates
    // away from it — the position an irritable shoulder is most often irritable
    // in. S07's cross-arm stretch stays, because it moves the shoulder blade
    // rather than the joint.
    ids: ["U04", "U05", "U06", "U11", "U12", "C07", "W03", "W14", "S10"],
  },
  // Anything that spikes intra-abdominal pressure: the heavy carry, the front
  // plank and its fast cousin, the deep loaded squat position, and the loaded
  // hinges, alongside the jumping. C05 side plank, C06 dead bug and C08 oblique
  // twist stay in deliberately — they are the core work routinely prescribed
  // *for* this, at a fraction of the pressure.
  pelvic_floor: {
    impact: true,
    ids: ["C03", "C04", "C07", "L13", "P03", "W09", "W14"],
  },
  // Anything she could fall from or during — the single-leg and travelling
  // positions. The *supported* reverse lunge (L16) stays: a hand on the counter
  // is the training for this, not a risk of it.
  balance: {
    impact: true,
    ids: ["L06", "L07", "L08", "L09", "L10", "W08"],
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
 * The pool is never emptied by this. Measured by `scripts/verify-plan-dose.ts`
 * against this catalog:
 *
 *   | Level            | clean | +joint_pain | + all six limitations |
 *   |------------------|-------|-------------|-----------------------|
 *   | beginner         |    15 |          15 |                    12 |
 *   | medium           |    42 |          38 |                    19 |
 *   | advanced         |    47 |          40 |                    19 |
 *   | movement_snacks  |    21 |          18 |                    13 |
 *
 * A beginner ticking every limitation AND reporting joint pain still keeps 12,
 * with lower body, hinge, upper body, core and low-impact bone loading all
 * represented — enough for the 4-6 different ids a session needs. Adding a
 * limitation means re-measuring that: the exclusions are a hard gate, and a gate
 * that starves the generator produces a worse plan than one that lets a step-up
 * through. Twelve is workable across eight weeks; ten would not be.
 *
 * Joint pain and the `q_limitations` answers remove work she shouldn't be given,
 * in code and never in the prompt, so a model can't opt out of them.
 *
 * One gap survives at the far end and it is content, not code: `I01` is the only
 * bone-loading id left in every worst-case pool, because everything else in the
 * plyometric series leaves the ground. See the `I` block in the table above.
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
 * The bookend movements this user may be given, one end of the session at a time.
 *
 * The mirror of `allowedExercises()` and deliberately built from the same
 * `LIMITATION_EXCLUDES` lists: a knee that rules out a lunge in the session
 * rules out the lunge she does to warm up for it, and the kneeling stretch she
 * would have done afterwards. What it does NOT apply is fitness level or the
 * snack rule — a bookend is level 1 by construction, and two minutes of hip
 * circles is not something an advanced user graduates past.
 *
 * A woman ticking all six limitations keeps 11 of the 15 warm-ups and 6 of the
 * 11 stretches (S01 calf, S06 glute, S07 shoulder, S08 side, S09 spine, S11
 * shoulder). Both ends got healthier with the 2026-08-27 shoot — the warm-up
 * floor was 9 and the cool-down floor 4.
 *
 * Re-check both numbers when adding a limitation. Below four the cool-down stops
 * being a choice at all.
 */
const bookendPool = (test: (id: string) => boolean, physicalLimits: string[]) => {
  const excluded = new Set(
    physicalLimits.flatMap((l) => LIMITATION_EXCLUDES[l]?.ids ?? [])
  );
  return EXERCISES.filter((e) => test(e.id) && !excluded.has(e.id));
};

/** Dynamic prep, for the front of a session. */
export function allowedWarmups(physicalLimits: string[] = []): Exercise[] {
  return bookendPool(isWarmupId, physicalLimits);
}

/** Static holds, for the end of one. */
export function allowedCooldowns(physicalLimits: string[] = []): Exercise[] {
  return bookendPool(isStretchId, physicalLimits);
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
