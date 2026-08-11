/**
 * Checks the reward maths against real and synthetic history.
 *
 * Run with `npx tsx scripts/verify-rewards.ts`. Worth re-running after touching
 * any threshold in `lib/rewards/catalog.ts`: XP, streaks and every badge are
 * derived on read, so a bad edit here silently rewrites what users have already
 * earned rather than failing loudly.
 */
import { computeRewards, type PlanLogRow } from "../lib/rewards/compute";
import { DAILY_XP_GOAL, XP_PER_COMPLETION, XP_PER_LEVEL, levelForXp } from "../lib/rewards/catalog";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}${ok ? "" : ` want ${JSON.stringify(expected)}`}`);
}

// --- 1. the one real user's history, as it stands today -----------------------
const realLogs: PlanLogRow[] = [
  { task_key: "w1_breath_426", date: "2026-08-11", count: 1 },
  { task_key: "nut_protein_25_30g", date: "2026-08-11", count: 3 },
  { task_key: "nut_water_6", date: "2026-08-11", count: 3 },
  { task_key: "w1_breath_sleep", date: "2026-08-11", count: 1 },
  { task_key: "nut_supplements", date: "2026-08-11", count: 1 },
  { task_key: "w1_movement0", date: "2026-08-11", count: 1 },
  { task_key: "habit_a0b99e30-12fb-4b74-931b-a77940db2935", date: "2026-08-11", count: 1 },
];

// No stored plan on purpose — this is the fallback-pillar path.
const real = computeRewards({
  date: "2026-08-11",
  plan: null,
  startedAt: "2026-08-11",
  logs: realLogs,
  symptomTimestamps: [],
});

console.log("\n--- real history (no stored plan → key heuristic) ---");
// Six finished things: 2 relaxation, 1 movement, 1 habit, protein 3/3,
// supplements 1/1. Water at 3/6 is unfinished and pays nothing.
check("totalXp (6 completions × 10)", real.stats.totalXp, 60);
check("movementSessions", real.stats.movementSessions, 1);
check("relaxationSessions", real.stats.relaxationSessions, 2);
check("habitTicks", real.stats.habitTicks, 1);
check("nutritionRows (protein 3/3 + supplements 1/1; water 3/6 short)", real.stats.nutritionRows, 2);
check("proteinDays", real.stats.proteinDays, 1);
check("waterDays", real.stats.waterDays, 0);
check("totalTicks (raw taps, not completions)", real.stats.totalTicks, 11);
check("streak", real.streak.current, 1);
check("activeToday", real.streak.activeToday, true);
check("goalDays (60 >= 50)", real.stats.goalDays, 1);
check("bigDays (60 < 100)", real.stats.bigDays, 0);
check("perCompletion sent to client", real.xp.perCompletion, 10);
check("planWeek", real.stats.planWeek, 1);
check("wildfire still locked at 1 day", real.achievements.find((a) => a.id === "wildfire")!.tier, 0);
check("strong unlocked at 1 session", real.achievements.find((a) => a.id === "strong")!.tier, 1);

// The stored plan must win over the heuristic.
const withPlan = computeRewards({
  date: "2026-08-11",
  plan: { weeks: [{ number: 1, tasks: [{ key: "w1_movement0", pillar: "movement" }, { key: "w1_breath_426", pillar: "relaxation" }, { key: "w1_breath_sleep", pillar: "relaxation" }] }] },
  startedAt: "2026-08-11",
  logs: realLogs,
  symptomTimestamps: [],
});
check("stored plan agrees with heuristic", withPlan.stats.totalXp, real.stats.totalXp);

// --- 2. synthetic: streaks, comebacks, weeks ---------------------------------
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

const logs: PlanLogRow[] = [];
// Days 0-9 active (10 in a row), 10-14 missed, 15-17 active (3 in a row).
for (const n of [...Array(10).keys(), 15, 16, 17]) {
  logs.push({ task_key: "nut_water_6", date: day(n), count: 6 });
  logs.push({ task_key: "w1_movement0", date: day(n), count: 1 });
}

const synth = computeRewards({
  date: day(17),
  plan: null,
  startedAt: day(0),
  logs,
  symptomTimestamps: [`${day(21)}T08:00:00.000Z`],
});

console.log("\n--- synthetic: 10 on, 5 off, 3 on (+symptom day 21) ---");
check("activeDays", synth.stats.activeDays, 14);
check("current streak at day 17", synth.streak.current, 3);
check("bestStreak", synth.streak.best, 10);
check("comebacks (9→15 and 17→21 gaps)", synth.stats.comebacks, 2);
check("waterDays", synth.stats.waterDays, 13);
check("movementSessions", synth.stats.movementSessions, 13);
check("wildfire tier at best=10 (3,7 cleared; 14 not)", synth.achievements.find((a) => a.id === "wildfire")!.tier, 2);
// Days 0-6 = week 0, 7-13 = week 1, 14-20 = week 2, 21-27 = week 3.
check("strongWeeks (wk0=7d, wk1=3d, wk2=3d, wk3=1d)", synth.stats.strongWeeks, 1);
check("planWeek = furthest week logged (day 21 → week 4)", synth.stats.planWeek, 4);

// A day of pure symptom logging still holds the streak.
check("symptom logged", synth.stats.symptomLogs, 1);

// --- 3. level curve ----------------------------------------------------------
console.log("\n--- levels (flat 500 XP each) ---");
check("0 XP → level 1", levelForXp(0).level, 1);
check("499 XP → level 1", levelForXp(499).level, 1);
check("500 XP → level 2", levelForXp(500).level, 2);
check("4500 XP → level 10", levelForXp(4500).level, 10);
check("5000 XP → level 11", levelForXp(5000).level, 11);
check("level 11 keeps last name", levelForXp(5000).name, "Phoenix");
check("every level spans the same", levelForXp(120).levelSpan, XP_PER_LEVEL);
check("toNext at 120 XP", levelForXp(120).toNext, 380);
check("progress within level is 0-1", levelForXp(200).progress, 0.4);
check("daily goal is five completions", DAILY_XP_GOAL, 5 * XP_PER_COMPLETION);

// --- 4. empty history --------------------------------------------------------
const empty = computeRewards({ date: "2026-08-11", plan: null, startedAt: null, logs: [], symptomTimestamps: [] });
console.log("\n--- empty history ---");
check("no XP", empty.stats.totalXp, 0);
check("no streak", empty.streak.current, 0);
check("planWeek 0", empty.stats.planWeek, 0);
check("nothing earned", empty.earned.length, 0);
check("every family still rendered", empty.achievements.length, 17);
check("first target present", empty.achievements.find((a) => a.id === "wildfire")!.target, 3);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
