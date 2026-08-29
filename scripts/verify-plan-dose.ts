/**
 * Checks the movement contract without spending a model call.
 *
 * Four things have to stay lined up or a session runs wrong: the dose rules in
 * the prompt, the safe bands `hydrateDose()` clamps to, the progression ladder
 * the fallback and top-up use, and the two code-written segments (the power
 * block and the cardio schedule). They live in two files and drift silently —
 * the numbers are all plausible-looking either way.
 *
 *   npm run verify-plan-dose
 */

import {
  CARDIO_VOLUME,
  EXERCISES as ALL_EXERCISES,
  MAX_PER_PATTERN,
  PATTERN_PRIORITY,
  POWER_RAMP_WEEKS,
  patternOf,
  DEFAULT_COOLDOWN,
  DEFAULT_WARMUP,
  EXERCISES,
  INTERVALS_ID,
  MOVEMENT_VOLUME,
  ZONE2_ID,
  allowedExercises,
  allowedPower,
  buildPowerBlock,
  bandForWeek,
  cardioForWeek,
  defaultDoseForWeek,
  getExercise,
  hydrateDose,
  isCalmSnackId,
  isCardioId,
  listSeconds,
  powerMinutes,
} from "../lib/plan/catalog";
import { STOCK_PHRASES, buildPrompt, deterministicPlan, isCardioTask, type Profile } from "../lib/plan/generate";

const LEVELS = ["beginner", "medium", "advanced", "movement_snacks"];

const problems: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) problems.push(msg);
};

// ─── 1. Every exercise has a runnable dose in every week ─────────────────────

console.log("=== every catalog id yields a runnable dose ===");
for (const ex of EXERCISES) {
  for (const week of [1, 4, 8]) {
    const stored = defaultDoseForWeek(ex, week, 28, 4);
    const dose = hydrateDose(ex, stored);
    check(dose.sets >= 1, `${ex.id} week ${week}: no sets`);
    // Every unit is time — a dose with no seconds is a step the player cannot
    // run, which is the one failure the whole contract exists to prevent.
    check(dose.seconds > 0, `${ex.id} week ${week}: no seconds on the clock`);
    check(dose.estimatedSeconds > 0, `${ex.id} week ${week}: zero-length exercise`);
  }
}
console.log(`  ${EXERCISES.length} exercises x 3 weeks checked`);

// ─── 1b. Every exercise explains itself ──────────────────────────────────────
//
// `why` is what she reads before she does the movement, and it is the only
// field in the catalog with no default — a missing one is a blank space on the
// session screen, and there is nothing at runtime that can notice. So it is
// checked here: present on every row, long enough to carry a mechanism, short
// enough to read on a phone, and written in the same voice the plan prompt
// already enforces on everything else she reads.

console.log("\n=== every catalog id explains why she is doing it ===");
const WHY_MIN = 60;
const WHY_MAX = 230;
for (const ex of EXERCISES) {
  const why = ex.why;
  if (!why) {
    problems.push(`${ex.id} (${ex.name}): no why`);
    continue;
  }
  check(why.length >= WHY_MIN, `${ex.id}: why is ${why.length} chars, under ${WHY_MIN}`);
  check(why.length <= WHY_MAX, `${ex.id}: why is ${why.length} chars, over ${WHY_MAX}`);
  // The same gate the model's own copy has to pass. A stock phrase here is
  // worse than one in a generated line: this one ships to every user forever.
  check(!STOCK_PHRASES.test(why), `${ex.id}: why uses stock health copy — "${why}"`);
}
const whyLengths = EXERCISES.flatMap((e) => (e.why ? [e.why.length] : []));
console.log(
  `  ${whyLengths.length}/${EXERCISES.length} written, ` +
    `${Math.min(...whyLengths)}-${Math.max(...whyLengths)} chars`
);

// ─── 2. The ladder actually goes up ──────────────────────────────────────────

console.log("\n=== progression, weeks 1 -> 8 (28-min session, 4 exercises) ===");
const magnitude = (d: ReturnType<typeof defaultDoseForWeek>) =>
  (d.minutes ?? 0) * 60 + (d.sets ?? 1) * (d.seconds ?? 0);

// One id per strength dose unit: timed, hold, carry. Cardio has its own ladder
// (section 6).
for (const id of ["L01", "C01", "C03"]) {
  const ex = getExercise(id)!;
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => defaultDoseForWeek(ex, w, 28, 4));
  const shown = weeks.map((d) => `${d.sets}x${d.seconds}s`);
  console.log(`  ${id} ${ex.name.padEnd(22)} ${shown.join("  ")}`);

  check(magnitude(weeks[7]) > magnitude(weeks[0]), `${id}: week 8 is not harder than week 1`);
  for (let i = 1; i < weeks.length; i++) {
    check(magnitude(weeks[i]) >= magnitude(weeks[i - 1]), `${id}: week ${i + 1} goes backwards`);
  }
}

// ─── 3. The model's numbers are honoured, and bounded ────────────────────────

console.log("\n=== a model-written dose is respected inside the safe band ===");
const held = getExercise("C01")!;
const respected = hydrateDose(held, { sets: 3, seconds: 55 });
check(respected.seconds === 55, "C01: a valid 55s hold was not respected");
console.log(`  55s hold  -> ${respected.sets} x ${respected.seconds}s`);

const clamped = hydrateDose(held, { sets: 3, seconds: 600 });
check(clamped.seconds === 90, `C01: a 600s hold clamped to ${clamped.seconds}s, expected 90`);
console.log(`  600s hold -> ${clamped.sets} x ${clamped.seconds}s  (clamped)`);

// ─── 4. The pools, and what the prompt offers from them ──────────────────────

console.log("\n=== pools, and what the prompt offers the model ===");

for (const level of LEVELS) {
  const profile = { fitness_level: level, top_problems: [] } as unknown as Profile;
  const pool = allowedExercises(level);
  const power = allowedPower(level);
  const prompt = buildPrompt(profile, pool);

  // A per-side id that never gets named falls into the prompt's "everything
  // else" bucket and is dosed as a both-sides move.
  for (const ex of pool.filter((e) => e.perSide)) {
    check(prompt.includes(ex.id), `${level}: prompt never names per-side id ${ex.id}`);
  }
  check(prompt.includes("PROGRESSION"), `${level}: prompt lost its progression block`);
  check(prompt.includes('"seconds"'), `${level}: prompt never mentions the seconds field`);
  // There is no reps field left to fill in. Naming one — even in an example —
  // is how a rep count sneaks back into a dose the timer then cannot run.
  check(!prompt.includes('"reps"'), `${level}: prompt still names a "reps" field`);
  // Cardio and bone loading are code-written segments. A pool that still holds
  // one is a pool inviting the model to spend a strength slot on it.
  check(!pool.some((e) => isCardioId(e.id)), `${level}: cardio id in the strength pool`);
  check(pool.length > 0, `${level}: empty strength pool`);
  if (level !== "movement_snacks") {
    for (const ex of power) {
      check(!prompt.includes(`${ex.id} `), `${level}: prompt offers reserved power id ${ex.id}`);
    }
  }
  console.log(
    `  ${level.padEnd(16)} ${String(pool.length).padStart(2)} in pool · ${power.length} power ids · prompt ${prompt.length} chars`
  );
}

// ─── 5. The power block fits its budget and grows across the eight weeks ─────

console.log("\n=== power block: budget, progression, coverage ===");

const BOOKEND_SECONDS = listSeconds(DEFAULT_WARMUP) + listSeconds(DEFAULT_COOLDOWN);

for (const level of LEVELS) {
  const vol = MOVEMENT_VOLUME[level];
  const budget = powerMinutes(vol);
  const pool = allowedPower(level);

  if (vol.perDay) {
    check(pool.length === 0, `${level}: snacks must have no power pool`);
    check(budget === 0, `${level}: snacks must have no power budget`);
    continue;
  }

  check(pool.length > 0, `${level}: no bone loading available at all`);

  const lengths: number[] = [];
  for (let week = 1; week <= 8; week++) {
    const block = buildPowerBlock(pool, week, budget);
    check(Boolean(block?.length), `${level} week ${week}: no power block`);
    if (!block) continue;

    const seconds = listSeconds(block);
    lengths.push(seconds);
    // The band is the promise. A block over its budget is a session over the
    // longer number on the quiz label, which is the failure the band exists
    // to prevent.
    check(seconds <= budget * 60, `${level} week ${week}: block runs ${seconds}s against a ${budget * 60}s budget`);
    const session = vol.minutes * 60 + seconds;
    check(
      session <= vol.maxMinutes * 60,
      `${level} week ${week}: session runs ${Math.round(session / 60)}m against a ${vol.maxMinutes}m ceiling`
    );
    check(block.every((e) => e.id.startsWith("I")), `${level} week ${week}: non-power id in the block`);
  }

  // Week 8 has to be harder than week 1 or it is not an eight-week plan.
  check(lengths[7] > lengths[0], `${level}: the power block does not progress`);
  const shown = lengths.map((n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`);
  console.log(`  ${level.padEnd(16)} budget ${String(budget).padStart(2)}m · ${shown.join(" ")}`);
}

console.log(`  generic bookends ${BOOKEND_SECONDS}s on every session above`);

// ─── 6. Cardio: every week, growing, and the session count never moves ───────

console.log("\n=== movement snacks: seven bursts a week, three moves each, inside five minutes ===");

{
  const level = "movement_snacks";
  const vol = MOVEMENT_VOLUME[level];
  const plan = deterministicPlan({ fitness_level: level } as Profile);
  for (const week of plan.weeks) {
    const task = week.tasks.find((t) => t.pillar === "movement" && !isCardioTask(t));
    check(Boolean(task?.days), `${level} week ${week.number}: snack task has no days`);
    if (!task?.days) continue;
    check(task.days.length === 7, `${level} week ${week.number}: ${task.days.length} days, not 7`);
    check(
      JSON.stringify(task.days[0]) === JSON.stringify(task.exercises),
      `${level} week ${week.number}: exercises is not days[0]`
    );
    const strengthSeen = new Set<string>();
    const shapes: string[] = [];
    let lastBone = "";
    task.days.forEach((burst, d) => {
      check(burst.length === 3, `${level} week ${week.number} day ${d}: ${burst.length} moves, not 3`);
      const ids = burst.map((e) => e.id);
      check(new Set(ids).size === ids.length, `${level} week ${week.number} day ${d}: repeated id in one burst`);
      const bones = ids.filter((id) => id.startsWith("I"));
      check(bones.length === 1, `${level} week ${week.number} day ${d}: ${bones.length} bone-loading moves, not 1`);
      // The order of her day: impact first, strength, then a calm move last.
      check(ids[0]?.startsWith("I") === true, `${level} week ${week.number} day ${d}: first burst ${ids[0]} is not the bone move`);
      check(isCalmSnackId(ids[2] ?? ""), `${level} week ${week.number} day ${d}: last burst ${ids[2]} is not a calm move`);
      check(bones[0] !== lastBone, `${level} week ${week.number} day ${d}: same bone move as the day before`);
      lastBone = bones[0] ?? "";
      for (const id of ids.filter((x) => !x.startsWith("I"))) {
        check(!strengthSeen.has(id), `${level} week ${week.number} day ${d}: ${id} already used this week`);
        strengthSeen.add(id);
      }
      // Calm rows are the evening slot; they never appear as the strength burst.
      check(!isCalmSnackId(ids[1] ?? ""), `${level} week ${week.number} day ${d}: calm move ${ids[1]} in the strength slot`);
      const secs = listSeconds(burst);
      check(secs <= vol.minutes * 60, `${level} week ${week.number} day ${d}: ${secs}s against ${vol.minutes} min`);
      shapes.push(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`);
    });
    const distinct = new Set(task.days.map((b) => b.map((e) => e.id).join("+"))).size;
    check(distinct === 7, `${level} week ${week.number}: only ${distinct} distinct bursts across 7 days`);
    console.log(`  week ${week.number}  ${shapes.join(" ")}`);
  }
}

console.log("\n=== cardio: every week, progressing, constant session count ===");

check(Boolean(getExercise(ZONE2_ID)), `no catalog row for ${ZONE2_ID}`);
check(Boolean(getExercise(INTERVALS_ID)), `no catalog row for ${INTERVALS_ID}`);

for (const level of LEVELS) {
  const vol = CARDIO_VOLUME[level];
  check(Boolean(vol), `${level}: no CARDIO_VOLUME entry`);
  if (!vol) continue;

  const shown: string[] = [];
  let minutesLast = 0;
  for (let week = 1; week <= 8; week++) {
    const c = cardioForWeek(level, week);
    const total = c.zone2.sessions + c.intervals;
    // The number of times a week she laces up is the promise; the hard day is
    // a change of what one of them is, never an extra one.
    check(total === vol.sessions, `${level} week ${week}: ${total} cardio sessions against ${vol.sessions} promised`);
    check(c.zone2.sessions >= 1, `${level} week ${week}: no easy session left`);
    check(c.zone2.minutes >= minutesLast, `${level} week ${week}: zone 2 minutes went backwards`);
    minutesLast = c.zone2.minutes;
    // What the app will actually put on the clock, through the same hydration
    // the route uses.
    const dose = hydrateDose(getExercise(ZONE2_ID)!, { minutes: c.zone2.minutes });
    check(dose.seconds === c.zone2.minutes * 60, `${level} week ${week}: zone 2 minutes do not hydrate`);
    shown.push(`${c.zone2.sessions}x${c.zone2.minutes}${c.intervals ? `+${c.intervals}I` : ""}`);
  }
  // A daily task carries one exercise, so a level cannot be both daily and
  // handed a hard day out of the same seven.
  if (vol.daily) {
    check(vol.sessions === 7, `${level}: daily cardio must be 7 sessions, got ${vol.sessions}`);
    check(vol.intervals === undefined, `${level}: daily cardio cannot also schedule intervals`);
  }
  // Flat minutes are a deliberate choice (the snack walk); anything that is not
  // flat has to actually climb.
  if (vol.minutes[0] !== vol.minutes[2]) {
    check(cardioForWeek(level, 8).zone2.minutes > cardioForWeek(level, 1).zone2.minutes, `${level}: cardio does not progress`);
  }
  if (vol.intervals) {
    for (let week = 1; week <= 8; week++) {
      const want = vol.intervals[bandForWeek(week)];
      check(cardioForWeek(level, week).intervals === want, `${level} week ${week}: ${cardioForWeek(level, week).intervals} interval sessions against ${want} scheduled`);
    }
    check(vol.intervals[2] >= vol.intervals[0], `${level}: interval sessions go backwards`);
  }
  console.log(`  ${level.padEnd(16)} ${shown.join("  ")}`);
}

// ─── Movement patterns ───────────────────────────────────────────────────────
//
// The rules that make a session whole-body rather than six names for a squat.
// They are checked here because nothing at runtime can notice: a plan of four
// squat variants is structurally perfect — valid ids, correct dose, inside the
// minute band — and only reads wrong to the woman doing it.

console.log("\n=== movement patterns: every prescribable id is classified ===");
{
  const prescribable = ALL_EXERCISES.filter(
    (e) => !isCardioId(e.id) && !/^[WSI]/.test(e.id)
  );
  for (const ex of prescribable) {
    check(Boolean(patternOf(ex.id)), `${ex.id} (${ex.name}): no movement pattern`);
  }
  const used = new Set(prescribable.map((e) => patternOf(e.id)).filter(Boolean));
  for (const p of PATTERN_PRIORITY) {
    check(used.has(p), `pattern "${p}" is in PATTERN_PRIORITY but no exercise has it`);
  }
  console.log(`  ${prescribable.length} prescribable ids across ${used.size} patterns`);
}

console.log("\n=== movement patterns: no session repeats one more than twice ===");
for (const level of LEVELS) {
  if (level === "movement_snacks") continue;
  const plan = deterministicPlan({ fitness_level: level } as Profile);
  const widths: number[] = [];
  for (const week of plan.weeks) {
    const task = week.tasks.find(
      (t) => t.pillar === "movement" && !isCardioTask(t) && t.exercises?.length
    );
    if (!task?.exercises) {
      problems.push(`${level} week ${week.number}: no strength session`);
      continue;
    }
    const counts = new Map<string, number>();
    for (const e of task.exercises) {
      const key = patternOf(e.id) ?? e.id[0];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [p, n] of counts) {
      check(
        n <= MAX_PER_PATTERN,
        `${level} week ${week.number}: ${n} "${p}" movements in one session (max ${MAX_PER_PATTERN})`
      );
    }
    // Half a plan is squats and core. The pool always has something to press.
    check(
      task.exercises.some((e) => e.id.startsWith("U")),
      `${level} week ${week.number}: no upper-body movement in the session`
    );
    widths.push(counts.size);
  }
  // Week 1 is the one she judges the plan on, so it is the widest — or tied,
  // which a small pool can force and is not a failure.
  check(
    widths[0] === Math.max(...widths),
    `${level}: week 1 covers ${widths[0]} patterns, less than week ${widths.indexOf(Math.max(...widths)) + 1}'s ${Math.max(...widths)}`
  );
  console.log(`  ${level.padEnd(16)} patterns per week: ${widths.join(" ")}`);
}

console.log("\n=== power block: nothing leaves the ground in weeks 1-2 ===");
{
  const AIRBORNE = /jump|skip|hop|box drop/i;
  for (const level of LEVELS) {
    const pool = allowedPower(level);
    if (!pool.length) {
      console.log(`  ${level.padEnd(16)} no power block`);
      continue;
    }
    const vol = MOVEMENT_VOLUME[level];
    const shown: string[] = [];
    for (let week = 1; week <= 8; week++) {
      const block = buildPowerBlock(pool, week, powerMinutes(vol)) ?? [];
      check(block.length > 0, `${level} week ${week}: empty power block`);
      const names = block.map((e) => getExercise(e.id)?.name ?? e.id);
      if (week <= POWER_RAMP_WEEKS) {
        for (const n of names) {
          check(!AIRBORNE.test(n), `${level} week ${week}: "${n}" leaves the ground inside the ramp`);
        }
      }
      shown.push(String(block.length));
    }
    // The ramp is a floor on impact, not a cap on it — the jumps still arrive.
    const later = (buildPowerBlock(pool, 8, powerMinutes(vol)) ?? []).map(
      (e) => getExercise(e.id)?.name ?? e.id
    );
    if (pool.some((e) => AIRBORNE.test(e.name))) {
      check(
        later.some((n) => AIRBORNE.test(n)),
        `${level}: no jumping anywhere in the plan, so the ramp never ends`
      );
    }
    console.log(`  ${level.padEnd(16)} movements per week: ${shown.join(" ")}`);
  }
}

// ─── Result ──────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`\nFAIL (${problems.length})\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log("\nOK — dose rules, safe bands, the ladder, the power block, the cardio schedule and the movement patterns agree.");
