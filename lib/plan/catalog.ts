/**
 * The approved content the 8-week plan is built from.
 *
 * The LLM never writes exercises, nutrition or relaxation copy — it picks ids
 * from these lists. That keeps the plan medically safe, guarantees every task
 * maps to content we actually have, and makes tasks comparable across users.
 */

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
  /**
   * One or two plain sentences telling her why THIS movement is on her list.
   *
   * Absent means nobody has written it yet — the app draws the name, the props
   * and no reason, exactly as it degrades with a missing `clip`. Every
   * prescribable row has one and `npm run verify-plan-dose` proves it; the
   * field stays optional so a row added without copy fails a check rather than
   * shipping an empty paragraph. See `WHY` for the voice and the rules.
   */
  why?: string;
};

// 79 rows in five roles, all told apart by id prefix: the strength work the
// model picks from (`L`/`U`/`C`/`P`), the bone-loading block code appends to a
// session (`I`), the cardio sessions code schedules beside it (`K`), and the two
// bookend families — 15 warm-ups (`W`) and 11 stretches (`S`). Everything is an
// ordinary row so `getExercise()` resolves it; the prefix is what decides which
// pool it is drawn from, and `allowedExercises()` is the one place that rule is
// applied.
//
// **This table is a superset of the bucket.** It was rebuilt on 2026-08-27
// against a shoot that replaced the library wholesale, and topped up on
// 2026-08-29 with four clips that close the gaps the rebuild left (`L17`, `I09`,
// `U13`, `C09` — see each row) — every clip in `exercise-clips` has a row here,
// and `npm run clips audit` proves it in both directions. The converse stopped
// holding on 2026-08-28: the two `K` cardio rows carry no `clip`, deliberately
// and permanently, because a walk does not need a video. `audit` lists them as
// "catalog ids with no clip" and passes.
//
// Anything you remember from the previous catalog is gone; git history is the
// record, not a commented-out block.
//
// The shoot is organized in seven series and the code sees five filmed prefixes
// (plus `K`, which was never shot). The mapping is deliberate and this is the
// only place it is written down:
//
//   | Shoot series                          | Prefix    | n  |
//   |---------------------------------------|-----------|----|
//   | Lower Body Strength                   | `L01-L17` | 17 |
//   | Plyometrics & Force Absorption        | `I01-I09` |  9 |
//   | Upper Body Strength                   | `U01-U13` | 13 |
//   | Core & Posterior Stability            | `C01-C09` + `P01-P03` | 12 |
//   | Warm-up & Mobility                    | `W01-W15` | 15 |
//   | Post-Lower Body Routine               | `S01-S06` |  6 |
//   | Post-Upper Body Routine               | `S07-S11` |  5 |
//   | *(not filmed)* Cardio                 | `K01-K02` |  2 |
//
// Two of those renamings are load-bearing, not cosmetic:
//
// - **PLYO -> `I`.** `isPowerId()` is `startsWith("I")`, and `P` is already
//   spoken for by the posterior chain — under any prefix rule `PLYO01` and `P01`
//   are the same family. `I` for impact keeps the predicate working untouched.
// - **Rl/Ru -> one `S` series.** `isStretchId` is `startsWith("S")`, so folding
//   both post-workout routines into one cool-down pool keeps
//   `allowedCooldowns()` working. The lower/upper split survives as the S01-S06
//   / S07-S11 block boundary below rather than as a prefix; if the app should
//   ever pick the post-upper routine after a pressing session specifically,
//   that is a second predicate here, not a rename.
//
// Core & Posterior Stability is one series and two prefixes: `C` is the trunk
// work and `P` the hinge — two movement patterns, so the top-up that fills a
// session "from the first exercise's family" can tell them apart.
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
const E: [string, string, string, 1 | 2 | 3, boolean, string?][] = [
  // ─── Lower Body Strength (17) ─────────────────────────────────────────────
  //
  // Seventeen clips, but around eight distinct movement patterns: the shoot
  // filmed loaded and bodyweight versions of the same lift as separate clips.
  // That is right for her — the bodyweight version is the regression she needs
  // in week 1 and the loaded one is week 6 — but it means the pool is shallower
  // than 17 suggests, and the prompt's "use at least N different ids" rule can
  // be satisfied with four squats. Worth remembering when reading a generated
  // plan.
  ["L01", "Chair squat", "Sturdy chair", 1, true, "L01 - Chair Squat.mp4"],
  ["L02", "Bodyweight squat", "None", 1, true, "L02 - Bodyweight Squat.mp4"],
  ["L03", "Goblet squat", "1 dumbbell", 2, false, "L03 - Goblet Squat.mp4"],
  ["L04", "Step-up", "Stair or sturdy chair", 1, true, "L04 - Bodyweight Step Up.mp4"],
  ["L05", "Step-up, loaded", "Stair, 2 dumbbells", 2, false, "L05 - Loaded Step Up.mp4"],
  ["L06", "Walking lunge", "None", 3, false, "L06 - Walking Lunge.mp4"],
  ["L07", "Bulgarian split squat, loaded", "Chair or couch, 2 dumbbells", 3, false, "L07 - Loaded Bulgarian Split Squat.mp4"],
  ["L08", "Bulgarian split squat", "Chair or couch", 2, false, "L08 - Bodyweight Bulgarian Split Squat.mp4"],
  ["L09", "Split squat, loaded", "2 dumbbells", 2, false, "L09 - Loaded Split Squat.mp4"],
  ["L10", "Split squat", "None", 2, true, "L10 - Bodyweight Split Squat.mp4"],
  ["L11", "Prisoner squat", "None", 1, true, "L11 - Prisoner Squat.mp4"],
  // L02 and L12 are near neighbours — the shoot filmed a bodyweight squat twice,
  // once with the arms forward and once without. Both are kept because the model
  // gets more to rotate through and she cannot tell them apart badly; do not
  // read "two ids" as "two exercises" when counting the beginner pool.
  ["L12", "Air squat", "None", 1, true, "L12 - Squat.mp4"],
  // The only hinge in the catalog until the C/P series is filmed. Losing it to a
  // limitation leaves her with no posterior-chain work at all.
  ["L13", "Dumbbell sumo deadlift", "1 dumbbell", 2, false, "L13 - Dumbbell Sumo Deadlift.mp4"],
  ["L14", "Calf raise, loaded", "2 dumbbells", 2, false, "L14 - Loaded Calf Raise.mp4"],
  ["L15", "Calf raise", "None", 1, true, "L15 - Calf Raise Short.mp4"],
  ["L16", "Supported reverse lunge", "Wall or counter", 2, false, "L16 - Supported Reverse Lunge.mp4"],
  // The frontal-plane lunge, and the only one in the catalog — every other
  // split position here travels forward or back. Supported for the same reason
  // L16 is.
  ["L17", "Supported lateral lunge", "Wall or counter", 2, false, "L17 - Supported Lateral Lunge.mp4"],

  // ─── Plyometrics & Force Absorption (9) ───────────────────────────────────
  //
  // The bone-loading family, reserved for the power block `buildPowerBlock()`
  // appends to every strength session — see `allowedPower()`. Only her fitness
  // level filters it: level 1 is the two floor-contact movements (`I01`, `I09`),
  // level 2 adds the pogo family, level 3 the drops and skips.
  ["I01", "Stomping march", "None", 1, true, "Plyo01 - Stomping March.mp4"],
  ["I02", "Box drop deceleration", "Low box or bottom stair", 3, false, "Plyo02 - Box Drop Deceleration.mp4"],
  ["I03", "Pogo jump, vertical", "None", 2, true, "Plyo03 - Vertical Pogo Jumps.mp4"],
  ["I04", "Pogo jump, lateral", "None", 2, true, "Plyo04 - Lateral Pogo Jumps.mp4"],
  ["I05", "Pogo jump, linear", "None", 2, true, "Plyo05 - Linear Pogo Jumps.mp4"],
  ["I06", "Pogo jump, multi-directional", "None", 3, false, "Plyo06 - Multi Directional Pogo Jumps.mp4"],
  ["I07", "Lateral step and stick", "None", 2, false, "Plyo07 - Lateral Step And Stick.mp4"],
  ["I08", "Plyometric skip", "None", 3, false, "Plyo08 - Plyometric Skips.mp4"],
  // Level 1 and `snack: true`, which no other `I` row is — this is the one piece
  // of bone loading that fits in a five-minute burst beside a counter. Its clip
  // keeps the shoot's `Plyo` prefix while the id takes `I`; that mismatch is
  // what the `clip` field exists for, so do not rename the file to match.
  ["I09", "Supported heel drop", "Wall or counter", 1, true, "Plyo09 - Supported Heel Drop.mp4"],

  // ─── Upper Body Strength (13) ─────────────────────────────────────────────
  //
  // U01-U03 are the graded push-up ramp — wall, then table, then bench.
  ["U01", "Wall push-up", "Wall", 1, true, "U01 - Wall Push Up.mp4"],
  ["U02", "Table push-up", "Kitchen counter or table", 1, true, "U02 - Table Push Up.mp4"],
  ["U03", "Bench push-up", "Sturdy bench or chair", 2, true, "U03 - Bench Push Up.mp4"],
  ["U04", "Dumbbell floor press", "2 dumbbells, floor", 2, false, "U04 - Dumbbell Floor Press.mp4"],
  ["U05", "Seated overhead press", "2 dumbbells, chair", 2, false, "U05 - Seated Overhead Press.mp4"],
  ["U06", "Standing overhead press", "2 dumbbells", 2, false, "U06 - Standing Overhead Press.mp4"],
  ["U07", "Bent-over dumbbell row", "2 dumbbells", 2, false, "U07 - Bent Over Dumbbell Row.mp4"],
  ["U08", "Single-arm dumbbell row", "1 dumbbell, chair or bench", 2, false, "U08 - Single Arm Dumbbell Row.mp4"],
  ["U09", "Rear-delt fly", "2 dumbbells", 2, false, "U09 - Rear Delt Fly.mp4"],
  // The scapular work.
  ["U10", "Y-T-W shoulder raise", "Mat", 1, false, "U10 - Ytw Shoulder Protocol.mp4"],
  ["U11", "Dumbbell lateral raise", "2 dumbbells", 2, false, "U11 - Dumbbell Lateral Raise.mp4"],
  ["U12", "Seated overhead triceps extension", "1 dumbbell, chair", 2, false, "U12 - Seated Overhead Tricep Extension.mp4"],
  // It holds `U13` because the band pull-apart that was drafted into this slot
  // was not shot, and an unfilmed strength row is not the same thing as an
  // unfilmed `K` row: "walk where you could talk but not sing" is a complete
  // instruction, "band pull-apart" in front of a woman who has never held a band
  // is not. So it was deleted rather than left clipless, and the id it was
  // holding went to the movement that does have a clip. Do not restore it from
  // this comment — shoot it first, then add the row.
  ["U13", "Standing dumbbell biceps curl", "2 dumbbells", 2, false, "U13 - Standing Dumbbell Biceps Curl.mp4"],

  // ─── Core & Posterior Stability (12) ──────────────────────────────────────
  //
  // The trunk work and the hinge. `C01`, `C04` and `C05` are isometrics and
  // `C03` is a loaded carry, so this series is the only reason the `hold` and
  // `carry` dose units have prescribable members at all — see `DOSE`.
  ["C01", "Wall sit", "Wall", 1, true, "C01 - Wall Sit.mp4"],
  ["C02", "Bird-dog", "Mat", 1, true, "C02 - Bird Dog.mp4"],
  ["C03", "Farmer's carry", "2 heavy dumbbells", 2, false, "C03 - Farmers Carry.mp4"],
  ["C04", "Forearm plank", "Mat", 1, true, "C04 - Forearm Plank.mp4"],
  ["C05", "Side plank", "Mat", 2, false, "C05 - Side Plank.mp4"],
  ["C06", "Dead bug", "Mat", 1, true, "C06 - Dead Bug.mp4"],
  // A fast alternating drill from a plank — the one `C` row that is conditioning
  // rather than a hold.
  ["C07", "Mountain climber", "Mat", 2, true, "C07 - Mountain Climber.mp4"],
  ["C08", "Oblique twist", "Mat", 2, true, "C08 - Oblique Twist.mp4"],
  // The catalog's only balance row. A `hold`, per side.
  ["C09", "Supported single-leg stand", "Wall or counter", 1, true, "C09 - Supported Single Leg Stand.mp4"],
  ["P01", "Glute bridge", "Mat", 1, true, "P01 - Bodyweight Glute Bridge.mp4"],
  ["P02", "Glute bridge, weighted", "Mat, 1 dumbbell", 2, false, "P02 - Weighted Glute Bridge.mp4"],
  ["P03", "Romanian deadlift", "2 dumbbells", 2, false, "P03 - Romanian Deadlift Pattern.mp4"],

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
  ["W01", "Lateral leg swings", "Wall or counter", 1, false, "W01 - Lateral Leg Swings.mp4"],
  ["W02", "Dynamic movement prep", "None", 1, false, "W02 - Dynamic Movement Prep.mp4"],
  ["W03", "PVC around the world", "Broomstick or PVC pipe", 1, false, "W03 - Pvc Around The World.mp4"],
  ["W04", "Shoulder mobility", "None", 1, false, "W04 - Shoulder Mobility Protocol.mp4"],
  ["W05", "Open book cross", "Mat", 1, false, "W05 - Open Book Cross.mp4"],
  ["W06", "Hip circles", "None", 1, false, "W06 - Hip Circles.mp4"],
  ["W07", "Cobra spinal extension", "Mat", 1, false, "W07 - Cobra Spinal Extension Stretch.mp4"],
  ["W08", "World's greatest stretch", "Mat", 1, false, "W08 - Worlds Greatest Stretch Flow.mp4"],
  ["W09", "Deep squat with thoracic reach", "None", 1, false, "W09 - Deep Squat With Thoracic Reach.mp4"],
  ["W10", "Hamstring rocker", "Mat", 1, false, "W10 - Hamstring Rocker Dissociation.mp4"],
  ["W11", "Thread the needle", "Mat", 1, false, "W11 - Thread The Needle.mp4"],
  ["W12", "Full warm-up sequence", "None", 1, false, "W12 - Comprehensive Warmup Sequence.mp4"],
  ["W13", "Integrated mobility flow", "Mat", 1, false, "W13 - Integrated Mobility Flow.mp4"],
  ["W14", "Inchworm to plank reach", "Mat", 1, false, "W14 - Inchworm To Plank Reach.mp4"],
  ["W15", "Linear leg swings", "Wall or counter", 1, false, "W15 - Linear Leg Swings.mp4"],

  // ─── Post-Lower Body Routine (6) ──────────────────────────────────────────
  //
  // Static holds, the cool-down after a leg session. Bookends like the `W` rows
  // above, not main work: `allowedExercises()` drops them by prefix, so the
  // generator can never spend a strength slot on a child's pose. The difference
  // from `W` is *which* end they belong on — a dynamic leg swing warms a joint
  // up, a 40-second butterfly hold does the opposite — so `S` is the cool-down
  // pool and `W` is the warm-up pool. See `allowedCooldowns()`.
  ["S01", "Toe and heel calf stretch", "Wall or step", 1, true, "Rl01 - Toe And Heel Calf Stretch.mp4"],
  ["S02", "Kneeling hip flexor stretch", "Mat", 1, true, "Rl02 - Kneeling Low Lunge Hip Flexor Stretch.mp4"],
  ["S03", "Kneeling hamstring stretch", "Mat", 1, true, "Rl03 - Kneeling Hamstring Stretch.mp4"],
  ["S04", "Child's pose", "Mat", 1, true, "Rl04 - Childs Pose.mp4"],
  ["S05", "Butterfly stretch", "Mat", 1, true, "Rl05 - Butterfly Pose.mp4"],
  ["S06", "Supine figure-4 stretch", "Mat", 1, true, "Rl06 - Supine Figure-4 Stretch.mp4"],

  // ─── Post-Upper Body Routine (5) ──────────────────────────────────────────
  //
  // The same pool, filmed for the other end of the body. They are prescribable
  // today even though there is no upper-body work to follow — which is fine, and
  // in fact useful: a woman who spends her day at a desk wants the chest and
  // thoracic work whether or not she just pressed anything. When the `U` series
  // lands, this block is the natural argument for splitting `allowedCooldowns()`
  // in two.
  ["S07", "Cross-arm shoulder stretch", "None", 1, true, "Ru01 - Cross Arm Abduction Stretch.mp4"],
  ["S08", "Seated side bend", "Mat", 1, true, "Ru02 - Seated Side Bend.mp4"],
  ["S09", "Seated spinal twist", "Mat", 1, true, "Ru03 - Seated Spinal Twist.mp4"],
  ["S10", "Chest and shoulder stretch", "Wall or doorway", 1, true, "Ru04 - Chest And Shoulder Stretch.mp4"],
  ["S11", "Standing shoulder stretch", "None", 1, true, "Ru05 - Standing Combination Shoulder Stretch.mp4"],

  // ─── Cardio (2) ──────────────────────────────────────────────────────────
  //
  // The aerobic pillar. **Scheduled by code, never picked by the model** — see
  // `CARDIO_VOLUME` and `cardioForWeek()`. Every week of every plan carries a
  // Zone 2 task built from `K01`, and from a set week one of those easy sessions
  // becomes the `K02` interval protocol. `allowedExercises()` keeps both out of
  // the pool the model chooses strength work from, for the same reason the `I`
  // family is kept out: a session-sized block competing for an exercise slot
  // was arriving as a fifteen-minute walk wedged between two sets of squats,
  // and the code that clamped, capped and trimmed it around the strength work
  // was most of the complexity in the session builder. It is its own session
  // now, and none of that code exists.
  //
  // **Both carry no clip on purpose.** `clip` is optional, `exerciseMedia()`
  // returns undefined without one, and the app draws name + props and no
  // player — which for "walk at a pace where you could talk but not sing" is
  // the correct presentation, not a degraded one. Do not shoot these to make the
  // library look uniform. `npm run clips audit` lists them under "catalog ids
  // with no clip" and passes.
  //
  // **Modality is hers.** `K01` is a dose, not a movement — minutes at a pace
  // where she could talk but not sing, on whatever she has: walking, swimming,
  // the elliptical, a bike, the rower. Naming one in the row would read as a
  // rule to a woman who owns a bike and hates walking.
  //
  // `K02` is the hard day, and the only protocol row. Five minutes easy on
  // whatever she is using, then **30 seconds all-out** — not 90%, everything she
  // has — then **two minutes of complete rest**: standing, sitting, coasting,
  // genuinely nothing. Three to four rounds, then five minutes easy to bring the
  // heart rate down on the same activity. About nineteen minutes, fixed.
  //
  // The two halves of that are what make it work and are the two a plan quietly
  // erodes: the effort has to be maximal, which it can only be if the recovery
  // is passive and long enough to buy it. A "hard" interval with 45 seconds of
  // jogging between rounds is a tempo session with a different name — it costs
  // her more and gives her less. Its props lead with the low-impact modalities
  // on purpose: prescribing running sprints to a 52-year-old is the failure mode
  // this row is one bad word away from. Beginners and snack users never get it
  // (`CARDIO_VOLUME`).
  ["K01", "Zone 2 cardio", "Any activity — walk, bike, swim, row, elliptical", 1, false],
  ["K02", "Sprint intervals", "Bike, elliptical, rower, or brisk incline walk", 2, false],
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
 */

/**
 * Every exercise whose dose is NOT a plain both-sides timed set.
 *
 * Listed as exceptions rather than as a seventh column on `E` so the table above
 * stays readable — anything absent from here is `["timed", false]`, which is the
 * honest default for the squat/press/row/hinge families that make up most of the
 * catalog.
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
  L17: ["timed", true],
  // The one plyometric worked a side at a time — she steps out, lands, and
  // stabilises on that leg before coming back.
  I07: ["timed", true],
  // Isometrics — the hold IS the exercise. A plank opens shorter than a wall sit
  // because it is the whole trunk holding a line, not a leg holding a chair.
  C01: ["hold", false, 30],
  C04: ["hold", false, 20],
  C05: ["hold", true, 15],
  // Balance is held, not repeated, and one leg at a time — so it is the one
  // `hold` in the catalog that is also per-side.
  C09: ["hold", true, 30],
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
  //
  // **Uniform means uniform in what it COSTS, which is why the per-side rows sit
  // at 20 and not 40.** They all read 40 until 2026-08-28, and a per-side set
  // runs twice — so every one of these eight was quietly costing eighty seconds
  // while the four below it cost forty, and the comment above was false for two
  // thirds of the family. Forty seconds of hip circles a side is not a warm-up,
  // it is a workout in front of the workout: the generic pair measured 200s +
  // 160s = SIX MINUTES flat on every session, which is a third of a beginner's
  // eighteen. Twenty a side is a real warm-up dose and makes every ordinary
  // warm-up movement cost the same forty seconds, whichever column it is in.
  W01: ["timed", true, 20],
  W05: ["timed", true, 20],
  W06: ["timed", true, 20],
  W08: ["timed", true, 20],
  W09: ["timed", true, 20],
  W10: ["timed", true, 20],
  W11: ["timed", true, 20],
  W15: ["timed", true, 20],
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
  // that she stays for it; the per-side ones run twice, so those sit at 30.
  //
  // These are deliberately NOT the halved numbers the warm-ups took on
  // 2026-08-28. A leg swing at 40s a side was a warm-up doing a workout's job;
  // a stretch at 30s a side is a stretch at the shortest dose that still works
  // on tissue. The cool-down got shorter by holding one fewer position — see
  // DEFAULT_COOLDOWN.
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
  // Cardio. `K01`'s seconds are a floor only — `cardioForWeek()` writes the real
  // minutes into the task. `K02` is a fixed protocol: 5 min easy warm-up + 3-4 x
  // (30s all-out + 2 min complete rest) + 5 min easy cool-down. That is 17.5
  // minutes at three rounds and 20 at four, so the stored dose is the 19 in the
  // middle: the clock is the session, and how many rounds fit inside it on the
  // day is hers.
  K01: ["duration", false, 15 * 60],
  K02: ["duration", false, 19 * 60],
};


/**
 * Why she is being asked to do this specific movement, in her words.
 *
 * **Written here, once, and never by the model.** The task `why` above it is
 * hers — it ties the week's session to the symptoms she reported, and it is the
 * one line in a plan that changes from woman to woman. This one is a fact about
 * the movement, identical for everyone doing it, so asking gpt-4o-mini for 79 of
 * them per plan would buy variance, latency and cost against zero
 * personalisation — and the deterministic fallback plan, which runs when OpenAI
 * is down, would have none at all.
 *
 * Listed as a separate record rather than a seventh column on `E` for the same
 * reason `DOSE` is: the table above stays a readable index of what exists, and
 * this stays a block of copy that can be edited as copy. Unlike `DOSE` there is
 * no sensible default, so **every prescribable row needs a line** —
 * `npm run verify-plan-dose` fails if one is missing, too short, or written in
 * the stock-health-copy voice the plan prompt already bans.
 *
 * The voice, which is the whole point of the feature:
 *
 * - **Name the mechanism, never the benefit.** "Strengthens your legs" tells her
 *   nothing she did not already assume. "Every stair you climb is one leg at a
 *   time" tells her what the movement IS, and that is what makes her do it.
 * - **Land it in her day.** Off the sofa, out of the bath, the shopping, the top
 *   shelf, the grandchild. A woman of 52 does not train for a number.
 * - **Menopause where it is honest, and only there.** Bone, muscle, blood sugar
 *   and balance are the real reasons this catalog is shaped the way it is. Do
 *   not bolt a hormone sentence onto a calf stretch to make it sound clinical.
 * - **No hedging and no claims.** Same gate as everything else she reads: no
 *   "helps with", no "supports", no dosages, no promises about symptoms.
 */
const WHY: Record<string, string> = {
  // ─── Lower body ───────────────────────────────────────────────────────────
  L01: "Standing up out of a chair is the move you make most and think about least. Train it now and it stays easy — off the sofa, out of the car, up from the floor.",
  L02: "Your thighs and glutes are the biggest muscles you own and the hungriest for sugar. Keeping them is a large part of why weight sits differently after 45.",
  L03: "Holding the weight at your chest lets your legs work harder while your back stays upright. This is where legs start to feel solid under you again.",
  L04: "Stairs are one leg at a time, so train them one leg at a time. This is the move that stops your thighs burning halfway up.",
  L05: "Weight in your hands turns a step into real life: the shopping, the suitcase, the stairs at home. Your body relearns how to carry things.",
  L06: "Long steps on a body that has to stay steady while it moves. This is the one that takes the wobble out of uneven ground and kerbs.",
  L07: "One leg takes nearly all of it, so each side has to get strong on its own instead of your good side quietly doing the work.",
  L08: "Your back foot is only there for balance — the front leg does the job. It shows you quickly which side has been coasting.",
  L09: "A short stance, one leg loaded, nothing to hide behind. Strength here is what makes getting up off the floor stop being a project.",
  L10: "Standing on one leg with weight through it is how your hips and knees stay steady. Every step you take is a smaller version of this.",
  L11: "Hands behind your head keeps your chest open, so your legs work while your upper back learns to stop rounding. Two things at once.",
  L12: "The plainest strength move there is, and the one your legs answer to fastest. No equipment, nowhere you cannot do it, twenty seconds at a time.",
  L13: "Picking something heavy off the floor with your legs instead of your lower back. Do it here on purpose and your body does it that way in the kitchen.",
  L14: "Your calves are the brakes and the springs of every step. Loaded, they hold your ankle steady on the pavement you did not see.",
  L15: "Ankles that give way are behind a lot of stumbles later on. Two sets at the kitchen counter is the cheapest work in this plan.",
  L16: "Stepping backwards with a hand on the counter is the gentlest way into split-leg work. Your balance catches up before the load does.",
  L17: "Almost nothing you do trains sideways, and sideways is how you step out of the bath or catch yourself off a kerb. This is the one that does.",

  // ─── Bone loading ─────────────────────────────────────────────────────────
  I01: "Each stomp sends a small jolt up through your leg bones, and bone only rebuilds when something jolts it. Nothing you do sitting down asks it to.",
  I02: "Landing loads bone harder than lifting does, and falling estrogen takes bone density with it. Ten seconds of controlled landings goes a long way.",
  I03: "Quick, springy little hops. Your bones read the impact as a reason to rebuild, and your tendons get their bounce back.",
  I04: "Side-to-side hops load your hips from an angle nothing else in the plan reaches — and the hip is where a break at 70 costs the most.",
  I05: "Small hops forward and back, landing soft. The impact is the point: it is the signal your skeleton needs to stay dense.",
  I06: "Hopping in every direction, so your bones and your balance are loaded from every angle instead of only straight down.",
  I07: "Step out, land, and freeze. Catching yourself on one leg is exactly what you would need to do on ice — practised here, on your terms.",
  I08: "Skipping like a child, because your bones cannot tell the difference and it loads them beautifully. It also makes you laugh, which is not nothing.",
  I09: "Rise onto your toes, then let your heels drop to the floor. A hand on the counter, nothing leaves the ground, and your leg bones still get the message.",

  // ─── Upper body ───────────────────────────────────────────────────────────
  U01: "Pushing against a wall is a push-up your shoulders can do today. Everything above it starts here, including the floor one day.",
  U02: "One step steeper than the wall. Chest, shoulders and arms all work, and your kitchen counter is the only equipment you need.",
  U03: "The angle is low enough now to feel like the real thing. Pushing strength is what puts a stuck window or a jar lid back within reach.",
  U04: "Pressing from the floor keeps your shoulders in a range they like while your chest and arms do real work. Kind to shoulders that ache in the morning.",
  U05: "Reaching the top shelf is a strength move, and this is it. Sitting down takes your lower back out of the equation entirely.",
  U06: "Pressing weight overhead with your whole body braced underneath. Top shelves, a bag into the locker, a grandchild in the air.",
  U07: "The muscles across your upper back are the ones that pull your shoulders out of the rounded shape a desk puts them in.",
  U08: "One arm at a time, so your stronger side cannot cover for the other. Your back gets even, and your posture follows it.",
  U09: "The small muscles behind your shoulders hold them open. They fade first at a laptop and they answer quickest once you use them.",
  U10: "Three positions, no weight, all of them waking the muscles between your shoulder blades. This is what stops your upper back rounding over.",
  U11: "Raising your arms out to the side is the shoulder work you see in the mirror, and the strength that makes a bag in each hand feel light.",
  U12: "The back of your arm is what pushes you up out of a bath or a low chair. It is also the part that changes fastest once you load it.",
  U13: "Every bag, box and grandchild you lift is a curl. Train it and your elbows and forearms stop being the weak link in the chain.",

  // ─── Trunk and hinge ──────────────────────────────────────────────────────
  C01: "Sitting against a wall with no chair under you. Your thighs burn quickly, and that burn is the muscle you will want on the stairs at 75.",
  C02: "Opposite arm and leg out, back perfectly still. Your deep trunk muscles learn to hold your spine steady while your limbs move — which is what walking is.",
  C03: "Walking with something heavy in each hand. It is the shopping, and it builds grip, trunk and shoulders at once — grip strength tracks how well you age.",
  C04: "Holding one straight line from head to heels. Your deep abdominals learn to brace, which is what saves your lower back when you lift something awkward.",
  C05: "The side of your trunk is what stops you listing sideways when you carry a bag on one arm. Nothing else in this plan trains it.",
  C06: "Slow and controlled, on your back — the gentlest way there is to make your deep abdominals work. Good on days your back feels fragile.",
  C07: "Fast knees under a plank. Your heart rate climbs while your trunk has to hold on, so you get conditioning and core in the same twenty seconds.",
  C08: "Turning through your middle is how you reach into the back seat or look behind you. Train it and turning stops catching.",
  C09: "Balance fades quietly from your fifties, and faster if you never stand on one leg. A hand on the counter, thirty seconds — that is the whole intervention.",
  P01: "Sitting all day switches your glutes off. This turns them back on, and strong glutes take the load your lower back has been carrying for them.",
  P02: "The same movement with real load. This is where your glutes start holding your hips steady while you walk, instead of your back doing it.",
  P03: "Hinging at the hips with a flat back is the safe way to reach the floor. Your hamstrings and glutes take over the bending your spine has been doing.",

  // ─── Warm-ups ─────────────────────────────────────────────────────────────
  W01: "Swinging your leg across your body opens your hips before you load them. Warm hips squat deeper and complain less the next day.",
  W02: "A short sequence that wakes up everything you are about to use. Two minutes here is why the session feels good instead of stiff.",
  W03: "Taking a broomstick around your shoulders finds the range you will need overhead — before there is any weight in your hands.",
  W04: "Shoulders stiffen from sitting, not from age. A minute of this gives you back the range that pressing and reaching ask for.",
  W05: "Opening your chest and turning through your upper back. This is the direct antidote to a day spent facing a screen.",
  W06: "Big slow circles move warm fluid through the hip joint. It is the difference between a squat that glides and one that grinds.",
  W07: "Gently arching backwards after hours of curling forward. Your lower back finds its natural curve again before you ask it to work.",
  W08: "One position that opens hips, groin and upper back at the same time. That is how it got the name.",
  W09: "Sitting into a deep squat and reaching up teaches your ankles, hips and upper back to work together before any load arrives.",
  W10: "Rocking back over a straight leg wakes your hamstrings gradually, instead of surprising them under a weight.",
  W11: "A rotation through your upper back that undoes hours of driving and typing. Your shoulders move better for the rest of the session.",
  W12: "The whole body, top to bottom, in one run-through. When there is time for only one thing before a session, this is the one.",
  W13: "Moving through joint after joint without stopping. Your body gets warm and your head arrives in the session at the same time.",
  W14: "Walking your hands out to a plank and back lengthens the whole back of you and switches your trunk on. Two jobs, one movement.",
  W15: "Swinging your leg forward and back opens your hips and hamstrings in the direction you actually walk.",

  // ─── Cool-down ────────────────────────────────────────────────────────────
  S01: "Calves shorten from years in shoes with a heel. Thirty seconds a side is what keeps your ankles moving freely.",
  S02: "The front of your hip shortens from sitting, and a short hip flexor tugs on your lower back all day. This is where you give that back.",
  S03: "Long hamstrings are why bending to the floor stays comfortable. Hold it long enough for the tissue to give.",
  S04: "Your back lengthens, your breathing slows, and the session ends with your nervous system on the way down instead of up.",
  S05: "Opening the inside of your thighs and hips, sitting still. It is the one that feels good exactly where you have been tight for years.",
  S06: "Deep into the back of the hip, which is where sitting locks up hardest. Lie down for it and let the hold do the work.",
  S07: "The back of your shoulder, after pressing or carrying. Thirty seconds a side is what keeps the joint moving freely tomorrow.",
  S08: "Reaching over to one side lengthens everything down your ribs and waist — the part nothing else you do stretches.",
  S09: "Turning through your spine gives back the rotation that a day in a chair quietly takes away.",
  S10: "Your chest tightens from rounding forward. Open it against a doorway and your shoulders sit back where they belong.",
  S11: "A last pass through your shoulders and arms while you are still warm. Standing, no mat, thirty seconds.",

  // ─── Cardio ───────────────────────────────────────────────────────────────
  K01: "Easy, steady minutes at a pace where you could talk but not sing. Your heart adapts to this pace more than to hard days, and you can do it most days without needing to recover from it.",
  K02: "Thirty seconds of everything you have, then two whole minutes of doing nothing at all, three or four times through. The rest is what makes the hard part possible — and then you are done.",
};

export const EXERCISES: Exercise[] = E.map(([id, name, props, level, snack, clip]) => {
  const [dose, perSide, seconds] = DOSE[id] ?? ["timed", false, undefined];
  return { id, name, props, level, snack, dose, perSide, seconds, clip, why: WHY[id] };
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

/**
 * Bone loading — the plyometric and force-absorption family.
 *
 * `I` for impact. These ids are **reserved for the power block** and kept out
 * of the pool the model picks its main work from. See `allowedPower()`.
 */
export const isPowerId = (id: string) => id.startsWith("I");

// ─── Warm-up and cool-down ──────────────────────────────────────────────────

/** An exercise reference exactly as a plan stores one. */
export type StoredExercise = {
  id: string;
  sets?: number;
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
 *
 * **No `seconds` here, on purpose — the dose comes off the catalog.** Both
 * defaults used to restate `seconds: 40`, which is a second copy of a number
 * that already lives in `DOSE`, and on 2026-08-28 it did exactly what a second
 * copy does: the per-side warm-ups were cut from 40 to 20 there and these three
 * kept running at 40 a side, so the generic warm-up alone stayed at 200 seconds
 * while every model-written one halved. `hydrateDose()` falls back to the
 * catalog when `seconds` is absent, which is the same path `bookendFrom()`
 * takes, so the generic pair and a written pair are now dosed by one rule.
 * Do not put the numbers back.
 */
export const DEFAULT_WARMUP: readonly StoredExercise[] = [
  { id: "W04", sets: 1 },
  { id: "W06", sets: 1 },
  { id: "W09", sets: 1 },
];

/**
 * The matching cool-down. The glutes, then the spine.
 *
 * Two static holds off the floor, in the order a session tends to have
 * tightened them: the glutes take the squatting, and child's pose is the one
 * that ends it lying down. 100 seconds all in.
 *
 * **Two, not three, and the stretches themselves were NOT shortened.** Thirty
 * seconds a side is the floor for tissue to actually give, so trimming the hold
 * would have bought two minutes of session back by making the cool-down stop
 * working. Dropping a movement costs one stretch and leaves the other two doing
 * exactly what they did. The kneeling hip-flexor hold (`S02`) is the one that
 * went: it is the only one of the three a knee rules out, and the hip flexors
 * are the least of what a session of squatting tightens.
 *
 * It used to be a yoga flow and a shoulder mobility drill — both warm-up
 * movements, reused at a slower dose because the catalog held no static
 * stretches at all. It does now (`S`), so the cool-down is finally cooling down.
 */
export const DEFAULT_COOLDOWN: readonly StoredExercise[] = [
  { id: "S06", sets: 1 },
  { id: "S04", sets: 1 },
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
  if (isBookendId(exercise.id)) return 15;
  return REST_BY_UNIT[exercise.dose][exercise.level - 1];
}

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
 */
export function hydrateDose(exercise: Exercise, stored: Omit<StoredExercise, "id">): HydratedDose {
  const rest = restSeconds(exercise);
  const sides = exercise.perSide ? 2 : 1;

  if (exercise.dose === "duration") {
    const seconds = stored.minutes
      ? clamp(stored.minutes, 1, 90) * 60
      : exercise.seconds ?? 15 * 60;
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
  const seconds = stored.seconds
    ? clamp(stored.seconds, range.min, range.max)
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
 * The progression ladder, as rungs ordered by what ONE exercise costs.
 *
 * This is the single source for both places a dose is decided: the three bands
 * the prompt hands the model (`doseLadder()` in generate.ts) and the dose the
 * code writes when it fills a session itself (`defaultDoseForWeek()` below).
 *
 * **They used to be two different tables and that was a live bug.** The prompt
 * sized its bands to her actual session — 3 sets of 30s in week 1 for a medium
 * user — while this file held a flat `[25, 40, 55]` regardless of session
 * length. The model reliably writes three exercises and our top-up adds the
 * rest, so a real week-1 session came out as three exercises at the prompt's
 * dose and three at a much smaller one, and landed at **16:35 against the 30
 * minutes she was sold**. The docstring here even claimed the two ladders
 * matched. Two numbers that have to agree are one number.
 */
const DOSE_RUNGS: readonly (readonly [number, number])[] = [
  [2, 20], [2, 25], [2, 30], [2, 40], [3, 30], [3, 40], [3, 50], [3, 60],
];

/** Average rest between sets, for sizing the ladder. Real rest comes from `restSeconds()`. */
const LADDER_REST = 50;

const rungCost = ([sets, secs]: readonly [number, number]) =>
  sets * secs + (sets - 1) * LADDER_REST;

/**
 * The three progression bands for a session of `workMinutes`, as
 * `[weeks 1-2, weeks 3-5, weeks 6-8]`.
 *
 * Weeks 6-8 land on the hardest rung one exercise's share of the session can
 * afford; the two earlier bands step back one and three rungs from it. The
 * steps used to be two and four, which put week 1 at 61-70% of the minutes she
 * was sold. The clock is the promise and the dose is the progression: week 1
 * should be the length she chose at a shorter set, not a shorter session.
 */
export function doseBands(
  workMinutes: number,
  exerciseCount: number
): [readonly [number, number], readonly [number, number], readonly [number, number]] {
  const share = (workMinutes * 60) / Math.max(1, exerciseCount);
  let top = 0;
  for (let i = DOSE_RUNGS.length - 1; i >= 0; i--) {
    if (rungCost(DOSE_RUNGS[i]) <= share) { top = i; break; }
  }
  return [
    DOSE_RUNGS[Math.max(0, top - 3)],
    DOSE_RUNGS[Math.max(0, top - 1)],
    DOSE_RUNGS[top],
  ];
}

/** Which band a week falls in. 0 = weeks 1-2, 1 = weeks 3-5, 2 = weeks 6-8. */
export const bandForWeek = (week: number) => (week <= 2 ? 0 : week <= 5 ? 1 : 2);

/**
 * The dose an exercise gets in a given week when the model did not supply one.
 *
 * Used by the deterministic fallback plan and by the top-up that fills a session
 * the model under-delivered. It reads the same bands the prompt asked the model
 * for, so a topped-up exercise sits at the intensity of the ones beside it
 * rather than dragging the session's total down — see `DOSE_RUNGS`.
 *
 * `workMinutes` is the time left for the WORK, bookends already taken off. The
 * caller knows whether this session has any (a snack does not), so it does that
 * subtraction rather than this function guessing at it.
 */
export function defaultDoseForWeek(
  exercise: Exercise,
  week: number,
  workMinutes: number,
  exerciseCount: number
): { sets?: number; seconds?: number; minutes?: number } {
  const band = bandForWeek(week);

  // Cardio is never in a strength session — `cardioForWeek()` doses it — so this
  // only has to be total, not clever: a continuous row gets its catalog length.
  if (exercise.dose === "duration") {
    return { minutes: Math.round((exercise.seconds ?? 15 * 60) / 60) };
  }

  const [sets, secs] = doseBands(workMinutes, exerciseCount)[band];
  const range = SECONDS_RANGE[exercise.dose];
  // A per-side set runs its seconds twice, so the full number would be twice the
  // work — and a session of them would quietly run double the minutes promised.
  const perSideSeconds = exercise.perSide ? Math.round(secs * 0.6) : secs;
  return { sets, seconds: clamp(perSideSeconds, range.min, range.max) };
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

// ─── Cardio ─────────────────────────────────────────────────────────────────

/**
 * Weekly aerobic volume by fitness level — the sessions the plan schedules
 * BESIDE her strength sessions, written by code into every week of every plan.
 *
 * Cardio used to be a `K` id the model could put inside a strength session,
 * which made it optional (it forgot), wrong-sized (it handed a walk the whole
 * half hour), and expensive to police (a cap, a clamp, a trimmer step and a
 * dedupe existed only to keep one walk from eating the squats). Every one of
 * those was a symptom of the same mistake the power block fixed for bone
 * loading: a pillar competing for a slot instead of having one. So cardio is a
 * task of its own now — `cardioForWeek()` says what it holds — and the model is
 * told it exists and told not to write it.
 *
 * `minutes` is one session in weeks 1-2, 3-5 and 6-8, so the walk grows on the
 * same ladder as the sets do. `intervals` is read on those same three bands and
 * says how many of that week's sessions are the `K02` protocol instead —
 * REPLACING Zone 2 sessions, never adding to the count, because the number of
 * times a week she laces up is the promise and the hard day is a change of what
 * one of them is.
 *
 * The shape as of 2026-08-29: **cardio is nearly every day, and the hard days
 * come out of that total rather than on top of it.**
 *
 * | Level | Weeks 1-2 | Weeks 3-8 |
 * |---|---|---|
 * | beginner | 7 x Zone 2 | 7 x Zone 2 |
 * | medium | 6 x Zone 2 + 1 x SIIT | 5 x Zone 2 + 2 x SIIT |
 * | advanced | 4 x Zone 2 + 2 x SIIT | 4 x Zone 2 + 2 x SIIT |
 * | movement snacks | 7 x 20-min walk | 7 x 20-min walk |
 *
 * Beginners and snack users still never get `K02`: a 30-second all-out effort
 * is not a first fortnight of training, and their whole cardio prescription is
 * the daily walk. Medium starts on one hard day and steps to two once the two
 * easy weeks are behind her; advanced carries two from week 1 and takes its
 * rest day out of the easy sessions instead — six days, not seven, because two
 * genuinely maximal days a week need one day that asks for nothing.
 *
 * These sit on top of `MOVEMENT_VOLUME`, and the funnel says so — the
 * `reward_plan_shape` screen reads both tables. Change a number here and
 * check that screen still tells the truth.
 */
export const CARDIO_VOLUME: Record<
  string,
  {
    /** Cardio sessions a week, easy and hard together. Never changes mid-plan. */
    sessions: number;
    minutes: readonly [number, number, number];
    /**
     * How many of those sessions are `K02` instead of `K01`, on the same three
     * bands as `minutes` (weeks 1-2, 3-5, 6-8). Absent means none, ever.
     */
    intervals?: readonly [number, number, number];
    /**
     * Every session is its own day and the task is written `cadence: "daily"`
     * — so `sessions` must be 7 and there can be no `intervals`, because a
     * daily task carries one exercise. Minutes may still climb across the
     * bands; the snack level's are flat because a habit does not get longer
     * every fortnight.
     */
    daily?: boolean;
  }
> = {
  // Seven easy days, no hard one. Her cardio is the thing she can do every day
  // without needing to recover from it, and at level 1 that is the whole
  // prescription — the intensity in her week comes from the strength sessions.
  beginner: { sessions: 7, minutes: [15, 20, 25], daily: true },
  medium: { sessions: 7, minutes: [20, 25, 30], intervals: [1, 2, 2] },
  advanced: { sessions: 6, minutes: [25, 30, 35], intervals: [2, 2, 2] },
  // A 20-minute walk every day (2026-08-29). She chose "a few minutes, spread
  // out" for her strength work; the walk is the one steady thing in a week of
  // five-minute bursts, and it is the same length on day 56 as on day 1.
  movement_snacks: { sessions: 7, minutes: [20, 20, 20], daily: true },
};

/**
 * Moves allowed as the LAST burst of a snack day (2026-08-29). The third burst
 * is the evening one, and it should settle her rather than spike her: no
 * impact, no conditioning, nothing that sends the heart rate and cortisol up
 * — so no `I` row, no mountain climber, no squat variant. Core holds, the
 * bird-dog and dead bug, the bridge, the balance stand and the calf raise are
 * the rows that load something and still read as winding down. Eight rows for
 * seven days, so a week never repeats one. Add a row here only if it can
 * honestly be done at 9pm without being awake at 11.
 */
export const CALM_SNACK_IDS: ReadonlySet<string> = new Set([
  "C01", // Wall sit
  "C02", // Bird-dog
  "C04", // Forearm plank
  "C06", // Dead bug
  "C08", // Oblique twist
  "C09", // Supported single-leg stand
  "P01", // Glute bridge
  "L15", // Calf raise
]);
export const isCalmSnackId = (id: string) => CALM_SNACK_IDS.has(id);

/** The two cardio rows, by role. The ids are the contract with the app. */
export const ZONE2_ID = "K01";
export const INTERVALS_ID = "K02";

export type CardioWeek = {
  /** Easy sessions this week, and how long each one runs. */
  zone2: { sessions: number; minutes: number };
  /**
   * How many of this week's sessions are the `K02` protocol instead — 0, 1 or
   * 2. A count rather than a flag since 2026-08-29: advanced carries two hard
   * days from week 1 and medium steps from one to two, and "is there a hard
   * day" cannot say either.
   */
  intervals: number;
  /** One walk every day — the task is written `cadence: "daily"`, not weekly x7. */
  daily: boolean;
};

/** What cardio a given week of her plan holds. Total sessions never change mid-plan. */
export function cardioForWeek(fitnessLevel: string | null, week: number): CardioWeek {
  const vol = CARDIO_VOLUME[fitnessLevel ?? "beginner"] ?? CARDIO_VOLUME.beginner;
  const band = bandForWeek(week);
  const intervals = vol.intervals?.[band] ?? 0;
  return {
    zone2: { sessions: vol.sessions - intervals, minutes: vol.minutes[band] },
    intervals,
    daily: vol.daily === true,
  };
}

/** Minutes the interval protocol runs, off its catalog row. */
export const intervalsMinutes = () =>
  Math.round((getExercise(INTERVALS_ID)?.seconds ?? 19 * 60) / 60);

// ─── The power block ────────────────────────────────────────────────────────

/**
 * How many of the week's sessions carry the power block.
 *
 * Two, and two is a prescription rather than a preference: bone responds to
 * loading that is frequent enough to keep signalling and spaced enough to let
 * the tissue answer, and two hard impact days a week is the dose that shows up
 * in the osteogenic literature. It is also the most a beginner has — she trains
 * twice — so for her "2x a week" and "every session" are the same sentence.
 *
 * **The app enforces this, not the plan.** A movement task holds ONE session
 * that she ticks `target` times a week, so "plyo on 2 of your 3 days" is not
 * something the stored plan can say — every session in a week is the same
 * session. What we send instead is the block plus this number, and the app
 * shows the power section on the first two completions of the week.
 */
export const POWER_SESSIONS_PER_WEEK = 2;

/**
 * How many different movements a power block may hold.
 *
 * Three. Bone loading is about how hard the floor is hit, not how many ways —
 * a fourth movement buys variety at the price of the sets that actually load,
 * inside a budget that is ten minutes at its largest.
 */
const POWER_MAX_EXERCISES = 3;

/** Below two sets a movement is a demonstration, not a dose. */
const POWER_MIN_SETS = 2;

/**
 * The power block's own budget, in minutes — the whole of the gap between the
 * ordinary session and the long one.
 *
 * Derived from `MOVEMENT_VOLUME` rather than stated, for the same reason
 * `BOOKEND_MINUTES` is derived: two numbers that have to agree are one number.
 * Ten minutes at medium and advanced, five at beginner — and five is not a
 * compromise, it is what her pool and her session can carry. A twenty-minute
 * beginner session with ten minutes of plyo in it has six minutes left for
 * strength, which is not a strength session, and her pool is two movements.
 */
export function powerMinutes(vol: (typeof MOVEMENT_VOLUME)[string]): number {
  return Math.max(0, vol.maxMinutes - vol.minutes);
}

/**
 * The power block's dose for a given week.
 *
 * Short work, long rest — that is what separates a plyometric set from
 * conditioning. The rest comes from `restSeconds()` like everything else, so a
 * level-3 drop lands with ninety seconds behind it and the level-1 stomping
 * march with forty-five.
 *
 * Sets and seconds are laddered here rather than filled to the budget, because
 * a block that fills ten minutes in week 1 has nowhere to go in week 8. It
 * climbs from roughly five minutes to the full ten across the eight weeks by
 * moving one number at a time, which is the same rule the main work follows.
 */
function powerDoseForWeek(week: number): { sets: number; seconds: number } {
  if (week <= 2) return { sets: 2, seconds: 20 };
  if (week <= 5) return { sets: 3, seconds: 25 };
  return { sets: 3, seconds: 30 };
}

/**
 * Builds the bone-loading block that runs after the main work and before the
 * cool-down.
 *
 * Written by CODE, never by the model, and that is the entire point. The prompt
 * used to ask for bone loading in as many words and, measured over four
 * generations, the model wrote plans with none at all in two of them. The block
 * is its own segment, on its own budget, in every session, and the `I` family
 * is out of the pool the model picks from (see `allowedPower()`), so there is
 * nothing left for it to forget.
 *
 * Fills to the budget and never past it. Each movement takes the week's dose if
 * it fits, one fewer set if it doesn't, and is skipped if even that overflows —
 * so a thin pool produces a short block rather than a long session, and the
 * band in `MOVEMENT_VOLUME` stays true.
 *
 * Returns `undefined` on an empty pool. An empty array would be a section
 * heading with nothing under it — see `orAbsent()` in generate.ts.
 */
export function buildPowerBlock(
  pool: readonly Exercise[],
  week: number,
  budgetMinutes: number
): StoredExercise[] | undefined {
  if (!pool.length || budgetMinutes <= 0) return undefined;

  const budget = budgetMinutes * 60;
  const { sets: topSets, seconds } = powerDoseForWeek(week);
  // Rotate by the week so the eight blocks are not the same three movements,
  // and so a two-id pool at least alternates which one leads.
  const offset = week % pool.length;
  const movements = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, POWER_MAX_EXERCISES);

  const out: StoredExercise[] = [];
  let spent = 0;

  for (const ex of movements) {
    const sides = ex.perSide ? 2 : 1;
    const rest = restSeconds(ex);
    for (let sets = topSets; sets >= POWER_MIN_SETS; sets--) {
      const cost = sets * seconds * sides + (sets - 1) * rest;
      if (spent + cost > budget) continue;
      out.push({ id: ex.id, sets, seconds });
      spent += cost;
      break;
    }
  }

  return out.length ? out : undefined;
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
/**
 * **Read at call time, not at module load**, and the env var is checked before
 * the template rather than inside it.
 *
 * This was `process.env.EXERCISE_MEDIA_BASE ?? \`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/...\``,
 * evaluated once at import, and it has the same two faults `meditationMedia()`
 * documents at length — the note there was written about this constant and then
 * not applied to it:
 *
 * - **An empty `NEXT_PUBLIC_SUPABASE_URL` interpolates to `""` and the string
 *   still concatenates**, producing `/storage/v1/object/public/exercise-clips`.
 *   That is truthy, so the `!MEDIA_BASE` guard below never fires, and every
 *   clip URL in the response becomes a RELATIVE path — which a phone has no
 *   origin to resolve. A blank env var on Vercel would have shipped a video
 *   player with nothing behind it to every session, with nothing failing in the
 *   build and nothing in the logs. Same trap as the blank pixel id, and as
 *   `customer_email: ""` in create-checkout.
 * - **Module-load evaluation loses to dotenv.** `import` is hoisted above any
 *   `config()` call, so any script that loads `.env.local` in its body sees an
 *   already-frozen empty base. That is how this was found.
 */
function mediaBase(): string | undefined {
  const override = process.env.EXERCISE_MEDIA_BASE;
  if (override) return override;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase) return undefined;
  return `${supabase}/storage/v1/object/public/exercise-clips`;
}

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
  if (!clip) return undefined;
  const base = mediaBase();
  if (!base) return undefined;
  return { video: `${base}/${encodeURIComponent(clip)}` };
}

/**
 * The strength exercises this user may be given — the pool the model picks a
 * session's main work from.
 *
 * **Her fitness level is the only filter.** There is no body-signal filter left:
 * the physical-limitations screen went on 2026-08-29 (a woman who tells us
 * something hurts needs a clinician, not an unsupervised plan, so she is out of
 * scope rather than accommodated), and the `joint_pain` impact rule that
 * survived it was removed the same day — it was the last reader of an `impact`
 * grade on every row, and a grade nothing reads is a claim nobody maintains.
 * Bringing a filter back means bringing back the grade with it, in the same
 * commit, and deciding what the funnel promises her about it.
 *
 * `movement_snacks` is a cadence, not a difficulty — it gets short, no-setup
 * moves she can do many times a day.
 *
 * Three families are drawable but never in this pool, each because it has a
 * segment of its own: bookends (`W`/`S`, see `allowedWarmups()`), bone loading
 * (`I`, see `allowedPower()`), and cardio (`K`, see `cardioForWeek()`). The one
 * exception is the snack cadence, which has no power block, so for it the `I`
 * rows stay ordinary main work — the only reason a snack user has any bone
 * loading in her bursts at all.
 *
 * Measured by `scripts/verify-plan-dose.ts` against this catalog:
 *
 *   | Level            | main | power |
 *   |------------------|------|-------|
 *   | beginner         |   16 |     2 |
 *   | medium           |   42 |     6 |
 *   | advanced         |   44 |     9 |
 *   | movement_snacks  |   23 |     0 |
 */
export function allowedExercises(fitnessLevel: string | null): Exercise[] {
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;
  const snacksOnly = fitnessLevel === "movement_snacks";

  return EXERCISES.filter((e) => {
    if (isBookendId(e.id) || isCardioId(e.id)) return false;
    if (isPowerId(e.id) && !snacksOnly) return false;
    return snacksOnly ? e.snack : e.level <= maxLevel;
  });
}

/**
 * The bone-loading movements this user may be given, for the power block —
 * her level over the `I` family alone. Empty for the snack cadence, which has
 * no power block and keeps its `I` rows in the main pool instead.
 *
 * Empty is a real answer and `buildPowerBlock()` handles it by returning
 * nothing: a session with no power block, never a session with a movement she
 * was excluded from.
 */
export function allowedPower(fitnessLevel: string | null): Exercise[] {
  if (fitnessLevel === "movement_snacks") return [];
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;
  return EXERCISES.filter((e) => isPowerId(e.id) && e.level <= maxLevel);
}

/**
 * The bookend movements this user may be given, one end of the session at a time.
 *
 * Neither end applies fitness level or the snack rule — a bookend is level 1 by
 * construction, and two minutes of hip circles is not something an advanced user
 * graduates past. Both pools are simply the whole family: 15 warm-ups and 11
 * stretches, the same for everyone.
 */

/** Dynamic prep, for the front of a session. */
export function allowedWarmups(): Exercise[] {
  return EXERCISES.filter((e) => isWarmupId(e.id));
}

/** Static holds, for the end of one. */
export function allowedCooldowns(): Exercise[] {
  return EXERCISES.filter((e) => isStretchId(e.id));
}

/**
 * Weekly STRENGTH volume by fitness level — the sessions the model builds.
 * `perDay` marks the snack cadence. Cardio is scheduled separately and on top;
 * see `CARDIO_VOLUME`.
 *
 * **These numbers are the sentence she read on the quiz screen before she
 * paid**, not an internal target — `FITNESS_OPTIONS` in `app/register/page.tsx`
 * labels each option with its entry here ("20-25 min, 2 days a week"), and
 * `fitSessionToMinutes()` enforces it. Change a number here and change the
 * label there in the same commit, in both directions.
 *
 * **It is a band, not a point (2026-08-29).** `minutes` is the ordinary
 * session — the strength and core work, bookends included — and `maxMinutes` is
 * what a session may reach on the days that also carry the power block (see
 * `powerMinutes()`). The gap between them IS the power block's budget, so the
 * block is purely additive: adding bone loading never shortens the work she was
 * already sold.
 *
 * Two label bugs died here, and they are the same bug twice:
 *
 * - `beginner` read 18 until 2026-08-28 while its label read "About 20 min".
 * - `medium` read 28 until 2026-08-29 while its label read "About 30 min".
 *
 * Both times the label was the promise and the code was what she got, so the
 * code moved to meet the label rather than the other way round.
 *
 * And `advanced` was labelled "35+ min" against a hard ceiling of exactly 35 —
 * a "+" the trimmer made structurally impossible to deliver. The band fixes
 * that honestly: 35 is now the ordinary session and 45 the power day, so the
 * label is a real range rather than an open-ended promise pointing at a wall.
 */
export const MOVEMENT_VOLUME: Record<
  string,
  { sessions: number; minutes: number; maxMinutes: number; perDay: boolean }
> = {
  beginner: { sessions: 2, minutes: 20, maxMinutes: 25, perDay: false },
  medium: { sessions: 3, minutes: 30, maxMinutes: 40, perDay: false },
  advanced: { sessions: 4, minutes: 35, maxMinutes: 45, perDay: false },
  // Snacks read differently (2026-08-29): `sessions` is BURSTS A DAY, and a
  // burst is ONE exercise — so it is also the number of exercises in a day's
  // list. `minutes` is all of a day's bursts together, not one of them; the
  // three moves are fitted to it as one list. No bookends, no power block, so
  // the band is a point.
  movement_snacks: { sessions: 3, minutes: 5, maxMinutes: 5, perDay: true },
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

// ─── Relaxation: the guided meditation ──────────────────────────────────────

/**
 * The guided meditation, offered beside every relaxation task.
 *
 * **It is deliberately not a `RELAXATION` row, and that is the whole design.**
 * Every id in that array is in the plan prompt's enum, so anything added there
 * becomes something the model *schedules* — and the day it schedules the
 * meditation as her relaxation task, the choice this exists to offer collapses
 * into meditation versus meditation. It is an alternative, not an assignment.
 *
 * Keeping it out of the plan buys two more things:
 *
 *  - **Every existing plan gets it immediately.** A plan is written once and
 *    stored; a new catalog row would only reach women whose next eight weeks
 *    are generated after it shipped, which for someone on day 3 is seven weeks
 *    away. This rides on the response instead of the plan, so it is there for
 *    everyone on the next refresh.
 *  - **The adherence maths does not move.** Her relaxation task is still one
 *    task with one target. She completes it by breathing or by lying still with
 *    this playing — the plan cannot tell, and should not care, which.
 *
 * There is exactly one, so it takes no id in a URL and no lookup. When there is
 * a second, this becomes an array and the API sends a list; nothing about the
 * app's contract has to change for that, because it already reads a title and a
 * length off the response rather than knowing them.
 */
export type Meditation = {
  id: string;
  /** Shown on the choice control and above the player. */
  title: string;
  /** One line on when to reach for it, same job as `RelaxationItem.use`. */
  use: string;
  /**
   * The exact filename in the `relaxation-audio` bucket — case and spaces as
   * uploaded, which for the first one means a capital `.MP3`.
   *
   * Same rule as the exercise clips: the name lives on the row, never derived
   * from the id. Two lists that have to agree eventually disagree, and the way
   * that fails is a 404 inside her player with nothing broken in any build.
   */
  file: string;
  /**
   * Real runtime, to the second — 10:57.
   *
   * Sent so the app can show the length before it has fetched a byte. The
   * player reads the true duration off the file once it loads and prefers that;
   * this is what the card says while she is deciding whether she has time.
   */
  seconds: number;
};

const MEDITATION: Meditation = {
  id: "meditation_settle",
  title: "Guided meditation",
  use: "Lie down, eyes closed, and let the voice do the work.",
  file: "meditation.MP3",
  seconds: 657,
};

/**
 * Public read, one flat namespace, exactly like `exercise-clips` — see the note
 * on `MEDIA_BASE` above, all of which applies here. The one difference worth
 * stating: an audio file is played *whole*, so the thing that matters is not
 * start-up latency but that it is only ever fetched once. The app downloads it
 * to disk on first play and streams nothing afterwards.
 *
 * Only the API builds this URL. Nothing in the mobile app knows the bucket.
 */
function meditationBase(): string | undefined {
  const override = process.env.RELAXATION_MEDIA_BASE;
  if (override) return override;
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabase) return undefined;
  return `${supabase}/storage/v1/object/public/relaxation-audio`;
}

export type MeditationMedia = Omit<Meditation, "file"> & { audio: string };

/**
 * The meditation, ready to play. `undefined` when no base URL is configured,
 * which the app reads as "no meditation" and renders by simply not offering the
 * choice — never as an error, and never as a player with nothing behind it.
 *
 * **Read at call time, not at module load.** A `const` initialised from
 * `process.env` at import is evaluated before anything a script does to load
 * `.env.local`, and the failure it produces is the nastiest kind: an empty
 * `NEXT_PUBLIC_SUPABASE_URL` interpolates to `""` and the whole thing still
 * concatenates, yielding `/storage/v1/object/public/...` — a truthy string, so
 * no guard fires, and a relative path is sent to a mobile app that has no origin
 * to resolve it against. Missing configuration has to come back as `undefined`,
 * which is why the base is built here and the env var is checked before the
 * template, not inside it.
 */
export function meditationMedia(): MeditationMedia | undefined {
  const base = meditationBase();
  if (!base) return undefined;
  const { file, ...rest } = MEDITATION;
  return { ...rest, audio: `${base}/${encodeURIComponent(file)}` };
}

const NUTRITION_IDS = new Set(NUTRITION.map((n) => n.id));
const RELAXATION_IDS = new Set(RELAXATION.map((r) => r.id));
export const isNutritionId = (id: string) => NUTRITION_IDS.has(id);
export const isRelaxationId = (id: string) => RELAXATION_IDS.has(id);
