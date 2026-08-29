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

// 53 prescribable exercises (`L`/`I`/`U`/`C`/`P`/`K`), plus 26 bookend
// movements: 15 warm-ups (`W`) and 11 stretches (`S`). Both bookend families are
// ordinary rows here so `getExercise()` resolves them; the prefix is what keeps
// them out of the main work.
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
  // ─── Lower Body Strength (17) ─────────────────────────────────────────────
  //
  // Seventeen clips, but around eight distinct movement patterns: the shoot
  // filmed loaded and bodyweight versions of the same lift as separate clips.
  // That is right for her — the bodyweight version is the regression she needs
  // in week 1 and the loaded one is week 6 — but it means the pool is shallower
  // than 17 suggests, and the prompt's "use at least N different ids" rule can
  // be satisfied with four squats. Worth remembering when reading a generated
  // plan.
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
  // The frontal-plane lunge, and the only one in the catalog — every other
  // split position here travels forward or back. Supported for the same reason
  // L16 is, and excluded by the same two limitations: a hand on the counter
  // answers the balance rule, it does not answer a knee bending deep under load
  // or a hip taken to end-range abduction.
  ["L17", "Supported lateral lunge", "Wall or counter", 2, "none", false, "L17 - Supported Lateral Lunge.mp4"],

  // ─── Plyometrics & Force Absorption (9) ───────────────────────────────────
  //
  // The bone-loading family. `Impact` has no middle value, so everything that
  // involves leaving the ground or catching a landing is graded "high" and is
  // dropped wholesale by `joint_pain` and by every limitation except a sore
  // shoulder. Grading a pogo jump "low" to keep it in the pool would put it in
  // front of a woman who has just told us her knee hurts.
  //
  // That left **I01 as the only bone work a limited user could be given** after
  // the 2026-08-27 shoot, so `ensureBoneLoading()` covered four of her eight
  // weeks with one movement. `I09` closes it: a supported heel drop is graded
  // "low" on the same reasoning as the stomping march — the heel meets the floor
  // under control with a hand on the counter, nothing leaves the ground — so it
  // survives `joint_pain` and all six limitations. A limited user now has two
  // bone-loading ids to rotate across, which is the whole of what that gap
  // needed. It was a content fix, exactly as this note predicted; no code
  // changed.
  ["I01", "Stomping march", "None", 1, "low", true, "Plyo01 - Stomping March.mp4"],
  ["I02", "Box drop deceleration", "Low box or bottom stair", 3, "high", false, "Plyo02 - Box Drop Deceleration.mp4"],
  ["I03", "Pogo jump, vertical", "None", 2, "high", true, "Plyo03 - Vertical Pogo Jumps.mp4"],
  ["I04", "Pogo jump, lateral", "None", 2, "high", true, "Plyo04 - Lateral Pogo Jumps.mp4"],
  ["I05", "Pogo jump, linear", "None", 2, "high", true, "Plyo05 - Linear Pogo Jumps.mp4"],
  ["I06", "Pogo jump, multi-directional", "None", 3, "high", false, "Plyo06 - Multi Directional Pogo Jumps.mp4"],
  ["I07", "Lateral step and stick", "None", 2, "high", false, "Plyo07 - Lateral Step And Stick.mp4"],
  ["I08", "Plyometric skip", "None", 3, "high", false, "Plyo08 - Plyometric Skips.mp4"],
  // Level 1 and `snack: true`, which no other `I` row is — this is the one piece
  // of bone loading that fits in a five-minute burst beside a counter. Its clip
  // keeps the shoot's `Plyo` prefix while the id takes `I`; that mismatch is
  // what the `clip` field exists for, so do not rename the file to match.
  ["I09", "Supported heel drop", "Wall or counter", 1, "low", true, "Plyo09 - Supported Heel Drop.mp4"],

  // ─── Upper Body Strength (13) ─────────────────────────────────────────────
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
  // Elbow flexion only, so neither the shoulder rule (nothing overhead, nothing
  // abducted) nor the back rule (she stays upright) touches it.
  //
  // It holds `U13` because the band pull-apart that was drafted into this slot
  // was not shot, and an unfilmed strength row is not the same thing as an
  // unfilmed `K` row: "walk where you could talk but not sing" is a complete
  // instruction, "band pull-apart" in front of a woman who has never held a band
  // is not. So it was deleted rather than left clipless, and the id it was
  // holding went to the movement that does have a clip. Do not restore it from
  // this comment — shoot it first, then add the row.
  ["U13", "Standing dumbbell biceps curl", "2 dumbbells", 2, "none", false, "U13 - Standing Dumbbell Biceps Curl.mp4"],

  // ─── Core & Posterior Stability (12) ──────────────────────────────────────
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
  // The catalog's only balance row, and deliberately NOT excluded by the
  // `balance` limitation — same call as L16 and L17. A hand on the counter is the
  // training for a poor single-leg stand, not a risk of it, and dropping it for
  // the woman who ticked that box would remove the one thing in here that
  // addresses what she told us. A `hold`, per side.
  ["C09", "Supported single-leg stand", "Wall or counter", 1, "none", true, "C09 - Supported Single Leg Stand.mp4"],
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

  // ─── Cardio (2) ───────────────────────────────────────────────────────────
  //
  // The `K` prefix, which was wired and empty from the day the plan was written
  // until 2026-08-28: `isCardioId()`, `cardioMinutes()`, the `duration` dose
  // unit and `buildPrompt()`'s continuous-block rule all existed with nothing to
  // apply to, so an eight-week menopause plan contained no aerobic work at all.
  // That is a missing pillar rather than a missing exercise — estrogen falls and
  // cardiovascular risk climbs, and nothing else in the catalog touches it. The
  // ten-minute post-meal walk is in `NUTRITION`, where it is a glucose habit and
  // is counted as one; it is not the cardio pillar and never was.
  //
  // **These two carry no clip on purpose, and that is the entire reason they
  // could ship without a shoot.** `clip` is optional, `exerciseMedia()` returns
  // undefined without one, and the app draws name + props and no player — which
  // for "walk at a pace where you could talk but not sing" is not a degraded
  // experience, it is the correct one. There is nothing a fifteen-second loop of
  // a woman walking teaches that the sentence does not. Do not shoot these to
  // make the library look uniform. `npm run clips audit` lists them under
  // "catalog ids with no clip" and passes.
  //
  // Both are `snack: false`. A movement snack is five minutes of something
  // she can do beside her desk without changing shoes; a continuous cardio block
  // is the opposite shape, and letting one into that pool would spend the whole
  // snack on it.
  //
  // Impact is `none` on both, and no limitation excludes either of them —
  // which is the point: the woman whose knees hurt, whose balance is poor and
  // who leaks is the one who most needs the pillar that is not jumping. Modality
  // is where she adapts, and modality is hers.
  // **Modality is hers, not ours.** `K01` is a dose, not a movement — 150
  // minutes a week at a pace where she could talk but not sing, on whatever she
  // has: walking, swimming, the elliptical, a bike, the rower. Naming a modality
  // in the row ("Zone 2 walk") would be a prescription we have no reason to make
  // and would read as a rule to a woman who owns a bike and hates walking.
  // Modality being hers is also why there is no separate indoor row: an
  // `Indoor zone 2` id was added and removed the same day, because "any
  // activity" already covers marching in the front room, and a second id that
  // means the same dose is a second thing to keep in step for nothing.
  //
  // `K02` is the one hard day, and it is the only row here that is a protocol
  // rather than a dose: 30 seconds at about 90% effort, two minutes easy, three
  // rounds, inside a 5-10 minute warm-up and a 5 minute cool-down on the same
  // activity. Level 2, so it is out of the beginner pool entirely — "start once
  // a week and build to two" is advice for a woman already training. Its props
  // lead with the low-impact modalities on purpose: prescribing running sprints
  // to a 52-year-old is the failure mode this row is one bad word away from.
  ["K01", "Zone 2 cardio", "Any activity — walk, bike, swim, row, elliptical", 1, "none", false],
  ["K02", "Sprint intervals", "Bike, elliptical, rower, or brisk incline walk", 2, "none", false],
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
 * Cardio used to be the standing example here — the `duration` dose unit,
 * `isCardioId()` (`K`) and `cardioMinutes()` were all wired with no members.
 * That was closed on 2026-08-28 by adding `K01`-`K02` above, which is exactly
 * what the note predicted it would take: rows, and nothing else. No code
 * changed. `buildPrompt()` prints its continuous-block rule on its own now that
 * the pool holds `duration` ids, and stops again if they ever leave.
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
  // The one cardio row that is not a plain block: 5-10 min warm-up + 3 x (30s
  // hard + 2 min easy) + 5 min cool-down is about nineteen minutes, and the
  // shape is fixed, so it does not take the generic 15-minute default.
  K02: ["duration", false, 1140],
  // Otherwise cardio needs no row here. `K` ids are resolved by prefix below —
  // `["duration", false, CARDIO_DEFAULT_SECONDS]` — so a new walk is one line in
  // `E` and nothing else. `duration` has had members since 2026-08-28; the
  // mobility flow that used to share the unit is still retired.
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

/**
 * Bone loading — the plyometric and force-absorption family.
 *
 * `I` for impact. The prefix has always been the marker (`ensureBoneLoading()`
 * and the prompt's bone-coverage rule both tested `startsWith("I")` by hand);
 * this is that test with a name, and it is now load-bearing in a second way:
 * since 2026-08-29 these ids are **reserved for the power block** and kept out
 * of the pool the model picks its main work from. See `allowedPower()`.
 */
export const isPowerId = (id: string) => id.startsWith("I");

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
    return { minutes: Math.max(CARDIO_MIN_MINUTES, Math.round(cap * [0.7, 0.85, 1][band])) };
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

  // 1a. Cardio minutes, before anything else. A continuous block is the single
  // biggest line in a session and the two levers below cannot reach it — it has
  // no seconds and its sets are always 1 — so a session carrying one was
  // effectively untrimmable, and step 3 would sooner drop a strength exercise
  // than shorten a walk. Minutes are the same category of cut as seconds: less
  // of the same session, nothing removed.
  for (let guard = 0; guard < 90 && over(); guard++) {
    const block = out
      .filter((e) => unitOf(e) === "duration" && (e.minutes ?? 0) > CARDIO_MIN_MINUTES)
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))[0];
    if (!block) break;
    block.minutes = Math.max(CARDIO_MIN_MINUTES, (block.minutes ?? CARDIO_MIN_MINUTES) - 1);
  }

  // 1b. Seconds, five at a time, off whichever set is currently longest.
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
 * The shortest a cardio block is worth prescribing. Below this it is a walk to
 * the kitchen, and `fitSessionToMinutes()` stops trimming it here.
 */
const CARDIO_MIN_MINUTES = 3;

/**
 * At most one continuous block per session.
 *
 * A `duration` id is not an exercise-sized thing — it is half the session on its
 * own — so two of them is not variety, it is the session twice. The rotation in
 * `fallbackPlan()` walked straight into it the day cardio got rows: week 6 drew
 * two cardio ids side by side, 10 minutes each, and landed at **26.2 minutes
 * against a 20-minute budget** with `fitSessionToMinutes()` unable to do
 * anything about it — it could not shorten a block it had no seconds lever on,
 * and could not pop one without going under the exercise floor.
 *
 * Applied where the list is assembled rather than inside the trimmer, because
 * this is a fact about what a session IS, not about whether it fits.
 */
export function capCardio(list: readonly StoredExercise[]): StoredExercise[] {
  let seen = false;
  return list.filter((e) => {
    if (!isCardioId(e.id)) return true;
    if (seen) return false;
    seen = true;
    return true;
  });
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
  return Math.max(CARDIO_MIN_MINUTES, Math.round(sessionMinutes * 0.5));
}

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
 * shows the power section on the first two completions of the week. When a week
 * eventually holds several DIFFERENT sessions (the change that also unblocks
 * cardio's weekly volume — see the `K` rows), this constant becomes a property
 * of which sessions get the block, and the app stops needing to count.
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
 * asked for bone loading in as many words and measured over four generations
 * the model wrote plans with none at all in two of them — so `ensureBoneLoading()`
 * went round afterwards swapping an `I` id into the last slot of the shortest
 * sessions, which covered four of eight weeks with one movement and cost a
 * strength exercise every time it fired. Both of those are gone: the block is
 * its own segment, on its own budget, in every session, and the `I` family is
 * out of the pool the model picks from (see `allowedPower()`), so there is
 * nothing left for it to forget or to duplicate.
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
 * Physical limitations are no longer collected or applied (2026-08-29).
 *
 * `LIMITATION_EXCLUDES` used to strip lunges, kneeling stretches, overhead
 * pressing and every high-impact row out of the pool for the six body parts the
 * quiz's `q_limitations` screen asked about. That screen is gone: a woman who
 * tells us something hurts needs a clinician, not an unsupervised eight-week
 * plan, and the product is not built to be the first. She is out of scope
 * rather than accommodated.
 *
 * What remains is `joint_pain` from `q4_symptoms`, which still drops every
 * high-impact exercise wholesale in `allowedExercises()` below. It is the only
 * body-signal filter left in the catalog.
 *
 * Bringing the exclusions back means bringing back all three ends at once — the
 * quiz screen (`LIMITATION_OPTIONS`), the accepted values (`PHYSICAL_LIMITS` in
 * `app/api/auth/save-quiz/route.ts`) and the rules here. `git log` has the
 * lists; do not restore one end without the other two, because an answer no
 * rule matches is silently ignored, which is a knee that gets lunges.
 */

/**
 * The exercises this user may be given.
 *
 * `movement_snacks` is a cadence, not a difficulty — it gets short, no-setup
 * moves she can do many times a day. Joint pain removes the work she shouldn't
 * be given; that filter runs in code, never in the prompt, so a model can't opt
 * out of it.
 *
 * **Power ids are not in here** (2026-08-29). The `I` family is reserved for the
 * power block that `buildPowerBlock()` appends to every session — bone loading
 * is now a structural segment of the workout rather than one movement the model
 * may or may not remember to include, which is what `ensureBoneLoading()`
 * existed to paper over. The one exception is the snack cadence: five-minute
 * bursts get no power block, so for them the `I` rows stay ordinary main work,
 * which is the only reason a snack user has any bone loading at all.
 *
 * The pool is never emptied by this. Measured by `scripts/verify-plan-dose.ts`
 * against this catalog:
 *
 *   | Level            | main | +joint_pain | power | +joint_pain |
 *   |------------------|------|-------------|-------|-------------|
 *   | beginner         |   16 |          16 |     2 |           2 |
 *   | medium           |   42 |          42 |     6 |           2 |
 *   | advanced         |   44 |          44 |     9 |           2 |
 *   | movement_snacks  |   23 |          20 |     0 |           0 |
 *
 * The main pool is now unmoved by joint pain at every level, because with the
 * `I` family reserved the only high-impact rows left in it were `I` rows. The
 * whole of that filter's remaining work has moved to the power pool, where it
 * bites hard: **every level collapses to `I01` and `I09`** — the stomping march
 * and the supported heel drop, the two low-impact rows that survive it. That is
 * the population most in need of bone loading getting the least variety of it,
 * and it is a content gap, not a code one. Keep any future `I` row at `low`
 * impact if it can honestly be graded there.
 */
export function allowedExercises(
  fitnessLevel: string | null,
  topProblems: string[]
): Exercise[] {
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;
  const snacksOnly = fitnessLevel === "movement_snacks";

  return EXERCISES.filter((e) => {
    // Bookends are drawable, never prescribable as the main work.
    if (isBookendId(e.id)) return false;
    // Bone loading has its own segment now — except on the cadence that has no
    // segment to put it in.
    if (isPowerId(e.id) && !snacksOnly) return false;
    if (snacksOnly ? !e.snack : e.level > maxLevel) return false;
    if (topProblems.includes("joint_pain") && e.impact === "high") return false;
    return true;
  });
}

/**
 * The bone-loading movements this user may be given, for the power block.
 *
 * The same two filters the main pool applies — her level, and joint pain
 * dropping every high-impact row — over the `I` family alone. Empty for the
 * snack cadence, which has no power block and keeps its `I` rows in the main
 * pool instead.
 *
 * Empty is a real answer and `buildPowerBlock()` handles it by returning
 * nothing: if a future filter ever strips the whole family, the correct
 * response is a session with no power block, not a session with a movement she
 * was excluded from.
 */
export function allowedPower(
  fitnessLevel: string | null,
  topProblems: string[]
): Exercise[] {
  if (fitnessLevel === "movement_snacks") return [];
  const maxLevel = fitnessLevel === "advanced" ? 3 : fitnessLevel === "medium" ? 2 : 1;

  return EXERCISES.filter((e) => {
    if (!isPowerId(e.id)) return false;
    if (e.level > maxLevel) return false;
    if (topProblems.includes("joint_pain") && e.impact === "high") return false;
    return true;
  });
}

/**
 * The bookend movements this user may be given, one end of the session at a time.
 *
 * Neither end applies fitness level or the snack rule — a bookend is level 1 by
 * construction, and two minutes of hip circles is not something an advanced user
 * graduates past. With the limitation filter gone, both pools are simply the
 * whole family: 15 warm-ups and 11 stretches, the same for everyone.
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
 * Weekly movement volume by fitness level. `perDay` marks the snack cadence.
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
  // A snack has no bookends and no power block, so its band is a point.
  movement_snacks: { sessions: 4, minutes: 5, maxMinutes: 5, perDay: true },
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
