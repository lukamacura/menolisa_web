/**
 * Parks an existing account at a chosen day of its plan, so the cycle rollover
 * can be watched happen in the real app.
 *
 *   npx tsx --env-file=.env.local scripts/plan-cycle-demo.ts <email> rollover
 *   npx tsx --env-file=.env.local scripts/plan-cycle-demo.ts <email> restore
 *
 * Unlike `seed-renewal-test.ts`, which builds a throwaway account from nothing,
 * this only ever touches `user_plans` and `user_plan_logs`. Profile, chats,
 * notifications and subscription are left exactly alone — it is meant to be
 * pointed at an account someone actually uses.
 *
 * `rollover` writes a backup first. `restore` puts it back.
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { NUTRITION, nutritionKey } from "@/lib/plan/catalog";
import { PLAN_DAYS, addDays } from "@/lib/plan/cycles";
import type { Plan } from "@/lib/plan/generate";

const MOVEMENT_RATE = 0.74;
const RELAXATION_RATE = 0.68;
const NUTRITION_RATE = 0.62;

type LogRow = { task_key: string; date: string; count: number };
type Backup = { userId: string; startedAt: string | null; logs: LogRow[]; savedAt: string };

const backupPath = (email: string) =>
  `/private/tmp/claude-501/-Users-lukamacura-Documents-web-development-menolisa-mobile/6797001f-6ffd-4a5e-aeae-1d77eafdbf26/scratchpad/plan-backup-${email.replace(/[^a-z0-9]/gi, "_")}.json`;

const today = () => new Date().toISOString().slice(0, 10);

/** Deterministic 0-1 per (key, day) so a re-run reproduces the same history. */
function roll(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function must(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function userIdFor(email: string): Promise<string> {
  const { data } = await getSupabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`no auth user for ${email}`);
  return user.id;
}

async function main() {
  const email = process.argv[2];
  const mode = process.argv[3] ?? "rollover";
  if (!email) throw new Error("usage: plan-cycle-demo.ts <email> [rollover|restore]");

  const db = getSupabaseAdmin();
  const userId = await userIdFor(email);
  const file = backupPath(email);

  if (mode === "restore") {
    if (!existsSync(file)) throw new Error(`no backup at ${file}`);
    const backup = JSON.parse(readFileSync(file, "utf8")) as Backup;

    await db.from("user_plans").delete().eq("user_id", userId).gt("cycle", 1);
    must(
      "restore started_at",
      (
        await db
          .from("user_plans")
          .update({ started_at: backup.startedAt })
          .eq("user_id", userId)
          .eq("cycle", 1)
      ).error
    );
    await db.from("user_plan_logs").delete().eq("user_id", userId);
    if (backup.logs.length) {
      must(
        "restore logs",
        (await db.from("user_plan_logs").insert(backup.logs.map((l) => ({ user_id: userId, ...l }))))
          .error
      );
    }
    console.log(`restored ${email}: started_at ${backup.startedAt}, ${backup.logs.length} logs`);
    return;
  }

  // ── Back up before touching anything ──────────────────────────────────────
  const { data: planRow } = await db
    .from("user_plans")
    .select("plan, started_at, status")
    .eq("user_id", userId)
    .eq("cycle", 1)
    .maybeSingle();
  if (!planRow?.plan) throw new Error("that account has no ready cycle-1 plan");

  const { data: existingLogs } = await db
    .from("user_plan_logs")
    .select("task_key, date, count")
    .eq("user_id", userId);

  const backup: Backup = {
    userId,
    startedAt: planRow.started_at,
    logs: (existingLogs ?? []) as LogRow[],
    savedAt: new Date().toISOString(),
  };
  writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`· backed up started_at=${backup.startedAt} and ${backup.logs.length} logs`);
  console.log(`  ${file}`);

  // ── Park it one day past the end of the cycle ─────────────────────────────
  // Cycles above 1 go too, so the rollover can be replayed.
  await db.from("user_plans").delete().eq("user_id", userId).gt("cycle", 1);

  const startedAt = addDays(today(), -PLAN_DAYS);
  must(
    "started_at",
    (
      await db
        .from("user_plans")
        .update({ started_at: startedAt })
        .eq("user_id", userId)
        .eq("cycle", 1)
    ).error
  );

  // ── A full eight weeks of history, so the recap has something real to show ─
  await db.from("user_plan_logs").delete().eq("user_id", userId);

  const plan = planRow.plan as Plan;
  const rows: { user_id: string; task_key: string; date: string; count: number }[] = [];

  for (let offset = 0; offset < PLAN_DAYS; offset++) {
    const date = addDays(startedAt, offset);
    const week = Math.floor(offset / 7) + 1;
    for (const task of plan.weeks.find((w) => w.number === week)?.tasks ?? []) {
      if (task.pillar === "habit") continue;
      const rate = task.pillar === "movement" ? MOVEMENT_RATE : RELAXATION_RATE;
      if (task.cadence === "weekly") {
        if (![1, 3, 5].slice(0, Math.max(1, task.target)).includes(offset % 7)) continue;
        if (roll(`${task.key}:${date}`) > rate) continue;
        rows.push({ user_id: userId, task_key: task.key, date, count: 1 });
      } else {
        if (roll(`${task.key}:${date}`) > rate) continue;
        rows.push({ user_id: userId, task_key: task.key, date, count: Math.max(1, task.target) });
      }
    }
    for (const item of NUTRITION) {
      const key = nutritionKey(item.id);
      if (roll(`${key}:${date}`) > NUTRITION_RATE) continue;
      rows.push({ user_id: userId, task_key: key, date, count: item.target });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    must("logs", (await db.from("user_plan_logs").upsert(rows.slice(i, i + 500))).error);
  }

  console.log("");
  console.log(`${email} is now on day ${PLAN_DAYS + 1} of ${PLAN_DAYS} — the rollover is due.`);
  console.log(`started_at     ${startedAt}`);
  console.log(`logs written   ${rows.length} rows across 8 weeks`);
  console.log("");
  console.log("Open the app: GET /api/plan rolls it over and returns {generating, cycle: 2}.");
  console.log(`Put it back:  npx tsx --env-file=.env.local scripts/plan-cycle-demo.ts ${email} restore`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
