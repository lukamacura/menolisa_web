/**
 * Checks the movement dose contract without spending a model call.
 *
 * Three things have to stay lined up or a session runs wrong: the dose rules in
 * the prompt, the safe bands `hydrateDose()` clamps to, and the progression
 * ladder the fallback and top-up use. They live in two files and drift silently
 * — the numbers are all plausible-looking either way.
 *
 *   npx tsx scripts/verify-plan-dose.ts
 */

import {
  EXERCISES,
  allowedExercises,
  defaultDoseForWeek,
  getExercise,
  hydrateDose,
} from "../lib/plan/catalog";
import { buildPrompt, type Profile } from "../lib/plan/generate";

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
    // Every unit is time now — a dose with no seconds is a step the player
    // cannot run, which is the one failure the whole contract exists to prevent.
    check(dose.seconds > 0, `${ex.id} week ${week}: no seconds on the clock`);
    check(dose.estimatedSeconds > 0, `${ex.id} week ${week}: zero-length exercise`);
  }
}
console.log(`  ${EXERCISES.length} exercises x 3 weeks checked`);

// ─── 2. The ladder actually goes up ──────────────────────────────────────────

console.log("\n=== progression, weeks 1 -> 8 (28-min session, 4 exercises) ===");
const magnitude = (d: ReturnType<typeof defaultDoseForWeek>) =>
  (d.minutes ?? 0) * 60 + (d.sets ?? 1) * (d.seconds ?? 0);

for (const id of ["L01", "C01", "C04", "K01"]) {
  const ex = getExercise(id)!;
  const weeks = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => defaultDoseForWeek(ex, w, 28, 4));
  const shown = weeks.map((d) => (d.minutes ? `${d.minutes}m` : `${d.sets}x${d.seconds}s`));
  console.log(`  ${id} ${ex.name.padEnd(22)} ${shown.join("  ")}`);

  check(
    magnitude(weeks[7]) > magnitude(weeks[0]),
    `${id}: week 8 is not harder than week 1`
  );
  for (let i = 1; i < weeks.length; i++) {
    check(magnitude(weeks[i]) >= magnitude(weeks[i - 1]), `${id}: week ${i + 1} goes backwards`);
  }
}

// ─── 3. The model's numbers are honoured, and bounded ────────────────────────

console.log("\n=== a model-written dose is respected inside the safe band ===");
const wallSit = getExercise("C01")!;
const respected = hydrateDose(wallSit, { sets: 3, seconds: 55 });
check(respected.seconds === 55, "C01: a valid 55s hold was not respected");
console.log(`  55s hold  -> ${respected.sets} x ${respected.seconds}s`);

const clamped = hydrateDose(wallSit, { sets: 3, seconds: 600 });
check(clamped.seconds === 90, `C01: a 600s hold clamped to ${clamped.seconds}s, expected 90`);
console.log(`  600s hold -> ${clamped.sets} x ${clamped.seconds}s  (clamped)`);

// Plans stored before the dose became time carry reps. They are never
// regenerated, so they have to keep hydrating into something runnable.
const legacy = hydrateDose(getExercise("L01")!, { sets: 3, reps: 10 });
check(legacy.unit === "timed" && legacy.seconds > 0, "L01: a stored rep dose was not converted");
console.log(`  3 x 10 reps -> ${legacy.sets} x ${legacy.seconds}s  (legacy plan)`);

// ─── 4. The prompt asks for time, and only time ──────────────────────────────

console.log("\n=== prompt assigns every id in every pool to a dose shape ===");

// A continuous id that never gets named falls into the prompt's "everything
// else" bucket and is asked for sets — which is exactly the bug this contract
// exists to prevent. Checked across every level, because the pool is per-user.
for (const level of ["beginner", "medium", "advanced", "movement_snacks"]) {
  const profile = { fitness_level: level, top_problems: [] } as unknown as Profile;
  const pool = allowedExercises(level, []);
  const prompt = buildPrompt(profile, pool);

  const named = pool.filter((e) => e.dose === "duration" || e.perSide);
  for (const ex of named) {
    check(prompt.includes(ex.id), `${level}: prompt never names ${ex.id} (dose "${ex.dose}")`);
  }
  check(prompt.includes("PROGRESSION"), `${level}: prompt lost its progression block`);
  check(prompt.includes('"seconds"'), `${level}: prompt never mentions the seconds field`);
  // There is no reps field left to fill in. Naming one — even in an example —
  // is how a rep count sneaks back into a dose the timer then cannot run.
  check(!prompt.includes('"reps"'), `${level}: prompt still names a "reps" field`);
  console.log(`  ${level.padEnd(16)} ${pool.length} in pool · ${named.length} special ids named`);
}

// ─── Result ──────────────────────────────────────────────────────────────────

if (problems.length) {
  console.error(`\nFAIL (${problems.length})\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log("\nOK — dose rules, safe bands and the progression ladder agree.");
