/**
 * Seeds a throwaway account parked at a specific point in its subscription, so
 * the renewal moments can be looked at in the real app instead of imagined.
 *
 *   npx tsx --env-file=.env.local scripts/seed-renewal-test.ts pre-renewal
 *   npx tsx --env-file=.env.local scripts/seed-renewal-test.ts rollover
 *   npx tsx --env-file=.env.local scripts/seed-renewal-test.ts fresh
 *
 * - `pre-renewal` — day 54 of 56, card charged in 2 days. The PlanContinue
 *   screen is owed on the next open.
 * - `rollover`    — day 57. The eight weeks are up, so the first GET /api/plan
 *   scores them, writes cycle 2, and the recap is owed.
 * - `fresh`       — day 3, renewal far away. Neither screen fires; use it to
 *   put the account back to boring.
 *
 * Everything is idempotent: re-running rebuilds the logs and resets the cycles,
 * so the same account can be walked through all three states in any order.
 *
 * The plan itself is always built by the real `generatePlan()` — never
 * hand-written JSON — because `sanitize()` owns the task keys and the dose
 * clamping, and logs written against invented keys would score as zero.
 */

import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generatePlan, type Plan } from "@/lib/plan/generate";
import { NUTRITION, nutritionKey } from "@/lib/plan/catalog";
import { PLAN_DAYS, addDays, daysBetween } from "@/lib/plan/cycles";

const EMAIL = "luka.xzy+renewal@gmail.com";

/** Roughly how engaged the seeded woman is, per pillar. Not 100 — that reads fake. */
const MOVEMENT_RATE = 0.74;
const RELAXATION_RATE = 0.68;
const NUTRITION_RATE = 0.62;

type Mode = "pre-renewal" | "rollover" | "fresh";

/** Day of the plan she is standing on, and how far off the charge is. */
const MODES: Record<Mode, { dayOfPlan: number; renewalInDays: number }> = {
  "pre-renewal": { dayOfPlan: 54, renewalInDays: 2 },
  rollover: { dayOfPlan: 57, renewalInDays: 2 },
  fresh: { dayOfPlan: 3, renewalInDays: 53 },
};

/**
 * A realistic quiz result.
 *
 * Most of these columns carry a CHECK constraint — `goal`, `timing`,
 * `symptom_impact`, `menopause_type`, `nutrition_style`, `relaxation_style`,
 * `safety_flags`, `physical_limits`. A value outside the allowed set fails the
 * whole row, and a missing profile silently produces a generic plan built from
 * defaults, which is not what anyone is trying to look at. `top_problems` is
 * unconstrained but must use the catalog's symptom ids (see
 * `RELAXATION_FOR_SYMPTOM`) or the relaxation picks land on a fallback.
 */
const PROFILE = {
  name: "Ana",
  age_band: "46-50",
  here_for: "myself",
  menopause_type: "natural",
  timing: "over_year",
  hrt_status: "no",
  top_problems: ["hot_flashes", "sleep_issues", "brain_fog"],
  symptom_impact: "severe",
  goals: ["sleep_through_night", "think_clearly", "feel_like_myself"],
  goal: "sleep_through_night",
  fitness_level: "medium",
  nutrition_style: "convenience",
  relaxation_style: "want_to",
  safety_flags: [] as string[],
  physical_limits: [] as string[],
  qualifier: "perimenopausal",
};

/** Throws on a failed write. A seed script that swallows errors seeds nothing. */
function must(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

const today = () => new Date().toISOString().slice(0, 10);

async function findOrCreateUser(): Promise<string> {
  const admin = getSupabaseAdmin();

  // listUsers is paged; the test project is small enough that one page finds it.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === EMAIL);
  if (existing) {
    console.log(`· reusing auth user ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("could not create the auth user");
  console.log(`· created auth user ${data.user.id}`);
  return data.user.id;
}

/** A deterministic 0-1 per (key, day), so a re-run reproduces the same history. */
function roll(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

async function main() {
  const mode = (process.argv[2] ?? "pre-renewal") as Mode;
  const regenerate = process.argv.includes("--regen");
  if (!MODES[mode]) {
    console.error(`unknown mode "${mode}" — use pre-renewal | rollover | fresh`);
    process.exit(1);
  }
  const { dayOfPlan, renewalInDays } = MODES[mode];

  const db = getSupabaseAdmin();
  const userId = await findOrCreateUser();

  // ── Profile ───────────────────────────────────────────────────────────────
  must(
    "user_profiles",
    (await db.from("user_profiles").upsert({ user_id: userId, ...PROFILE }, { onConflict: "user_id" })).error
  );

  // ── Subscription ──────────────────────────────────────────────────────────
  // A paying, non-cancelled Stripe subscriber. `renewal_notice_sent_for` is
  // cleared so the cron would still consider her due, and the app's own marker
  // is keyed off `subscription_ends_at` — moving that date re-arms the screen
  // on the device without anyone having to clear app storage.
  const renewsAt = new Date(Date.now() + renewalInDays * 86_400_000).toISOString();
  must("user_trials", (await db.from("user_trials").upsert(
    {
      user_id: userId,
      account_status: "paid",
      subscription_ends_at: renewsAt,
      subscription_canceled: false,
      payment_failed_at: null,
      dispute_flagged_at: null,
      provider: "stripe",
      plan_type: "plan8w",
      plan_amount: 5900,
      stripe_customer_id: `cus_seed_${userId.slice(0, 8)}`,
      stripe_subscription_id: `sub_seed_${userId.slice(0, 8)}`,
      fulfilled_at: new Date().toISOString(),
      renewal_notice_sent_for: null,
    },
    { onConflict: "user_id" }
  )).error);

  // ── Plan ──────────────────────────────────────────────────────────────────
  // Cycles above 1 go, so `rollover` can be replayed. Cycle 1 is kept and only
  // regenerated when it is missing — a good plan costs two OpenAI calls.
  await db.from("user_plans").delete().eq("user_id", userId).gt("cycle", 1);

  const { data: existing } = await db
    .from("user_plans")
    .select("status, plan")
    .eq("user_id", userId)
    .eq("cycle", 1)
    .maybeSingle();

  if (regenerate || existing?.status !== "ready" || !existing.plan) {
    console.log("· generating a real 8-week plan (two OpenAI calls, ~20s)…");
    await db.from("user_plans").upsert(
      { user_id: userId, cycle: 1, status: "generating", plan: null },
      { onConflict: "user_id,cycle" }
    );
    await generatePlan(userId, { cycle: 1 });
  } else {
    console.log("· cycle 1 plan already present, keeping it");
  }

  const { data: row } = await db
    .from("user_plans")
    .select("plan, started_at")
    .eq("user_id", userId)
    .eq("cycle", 1)
    .maybeSingle();
  if (!row?.plan) throw new Error("plan generation did not produce a plan");

  // Day 1 of the plan, worked back from where she is meant to be standing.
  const startedAt = addDays(today(), -(dayOfPlan - 1));
  must(
    "user_plans.started_at",
    (
      await db
        .from("user_plans")
        .update({ started_at: startedAt, generated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("cycle", 1)
    ).error
  );

  // ── Logs ──────────────────────────────────────────────────────────────────
  // Rebuilt from scratch so re-running never doubles a day's count.
  await db.from("user_plan_logs").delete().eq("user_id", userId);

  const plan = row.plan as Plan;
  const elapsed = Math.min(dayOfPlan, PLAN_DAYS);
  const rows: { user_id: string; task_key: string; date: string; count: number }[] = [];

  for (let offset = 0; offset < elapsed; offset++) {
    const date = addDays(startedAt, offset);
    const week = Math.floor(offset / 7) + 1;
    const tasks = plan.weeks.find((w) => w.number === week)?.tasks ?? [];

    for (const task of tasks) {
      const rate = task.pillar === "movement" ? MOVEMENT_RATE : RELAXATION_RATE;
      if (task.pillar === "habit") continue;

      if (task.cadence === "weekly") {
        // Spread the week's sessions over fixed days rather than at random, so
        // rest days land where a real week would put them.
        const dayInWeek = offset % 7;
        const sessionDays = [1, 3, 5].slice(0, Math.max(1, task.target));
        if (!sessionDays.includes(dayInWeek)) continue;
        if (roll(`${task.key}:${date}`) > rate) continue;
        rows.push({ user_id: userId, task_key: task.key, date, count: 1 });
      } else {
        const target = Math.max(1, task.target);
        if (roll(`${task.key}:${date}`) > rate) continue;
        rows.push({ user_id: userId, task_key: task.key, date, count: target });
      }
    }

    for (const item of NUTRITION) {
      const key = nutritionKey(item.id);
      if (roll(`${key}:${date}`) > NUTRITION_RATE) continue;
      rows.push({ user_id: userId, task_key: key, date, count: item.target });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("user_plan_logs").upsert(rows.slice(i, i + 500));
    if (error) throw error;
  }

  // ── A couple of notifications, so the Alerts tab is not empty ─────────────
  await db.from("notifications").delete().eq("user_id", userId);
  must("notifications", (await db.from("notifications").insert({
    id: randomUUID(),
    user_id: userId,
    type: "trial",
    title: `${PROFILE.name}, your 8 weeks are nearly up`,
    message: "Your plan renews soon and carries straight on. This is not the week to stop.",
    metadata: { alert_kind: "renewal", screen: "PlanContinue" },
    seen: false,
  })).error);

  console.log("");
  console.log(`mode           ${mode}`);
  console.log(`email          ${EMAIL}`);
  console.log(`user_id        ${userId}`);
  console.log(`plan day       ${dayOfPlan} of ${PLAN_DAYS}  (started_at ${startedAt})`);
  console.log(`renews         ${renewsAt.slice(0, 10)}  (in ${renewalInDays} days)`);
  console.log(`logs written   ${rows.length} rows over ${elapsed} days`);
  console.log(`days elapsed   ${daysBetween(startedAt, today()) + 1}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
