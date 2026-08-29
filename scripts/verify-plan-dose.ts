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
  DEFAULT_COOLDOWN,
  DEFAULT_WARMUP,
  EXERCISES,
  INTERVALS_ID,
  MOVEMENT_VOLUME,
  ZONE2_ID,
  allowedExercises,
  allowedPower,
  buildPowerBlock,
  cardioForWeek,
  defaultDoseForWeek,
  getExercise,
  hydrateDose,
  isCardioId,
  listSeconds,
  powerMinutes,
} from "../lib/plan/catalog";
import { buildPrompt, type Profile } from "../lib/plan/generate";

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
    const total = c.zone2.sessions + (c.intervals ? 1 : 0);
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
    shown.push(`${c.zone2.sessions}x${c.zone2.minutes}${c.intervals ? "+I" : ""}`);
  }
  check(cardioForWeek(level, 8).zone2.minutes > cardioForWeek(level, 1).zone2.minutes, `${level}: cardio does not progress`);
  if (vol.intervalsFromWeek !== undefined) {
    check(cardioForWeek(level, vol.intervalsFromWeek - 1).intervals === false, `${level}: intervals start early`);
    check(cardioForWeek(level, vol.intervalsFromWeek).intervals === true, `${level}: intervals never start`);
  }
  console.log(`  ${level.padEnd(16)} ${shown.join("  ")}`);
}

// ─── Result ──────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`\nFAIL (${problems.length})\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log("\nOK — dose rules, safe bands, the ladder, the power block and the cardio schedule agree.");
