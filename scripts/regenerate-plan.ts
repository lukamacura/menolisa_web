/**
 * Re-runs the LLM plan generation for one account, in place.
 *
 * For picking up catalog changes (new exercises, changed doses) on a plan that
 * was generated before them. `generatePlan()` returns early on a row that is
 * already `ready`, so the status is knocked back to `generating` first — an
 * UPDATE rather than a DELETE, because `started_at` lives on that row and
 * dropping it would restart her eight weeks at day 1.
 *
 * Costs two gpt-4o-mini calls, metered into `llm_usage` like any other run.
 *
 * Usage:
 *   npx tsx scripts/regenerate-plan.ts someone@example.com [cycle]
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";
import { generatePlan } from "../lib/plan/generate";
import type { Adherence } from "../lib/plan/cycles";

async function main() {
  const email = process.argv[2];
  const cycleArg = process.argv[3] ? Number(process.argv[3]) : undefined;
  if (!email) {
    console.error("Usage: npx tsx scripts/regenerate-plan.ts <email> [cycle]");
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: userId, error: lookupError } = await supabase.rpc("auth_user_id_by_email", {
    p_email: email,
  });
  if (lookupError) {
    console.error("Lookup failed:", lookupError.message);
    process.exit(1);
  }
  if (!userId) {
    console.error(`No account for ${email}`);
    process.exit(1);
  }
  console.log(`User ${email} -> ${userId}`);

  // Newest cycle, unless one was named on the command line.
  const { data: rows, error: rowErr } = await supabase
    .from("user_plans")
    .select("cycle, status, started_at, prior_adherence, generated_at")
    .eq("user_id", userId)
    .order("cycle", { ascending: false });
  if (rowErr) {
    console.error("Could not read user_plans:", rowErr.message);
    process.exit(1);
  }

  const target = cycleArg
    ? rows?.find((r) => r.cycle === cycleArg)
    : rows?.[0];
  const cycle = target?.cycle ?? cycleArg ?? 1;
  const adherence = (target?.prior_adherence ?? null) as Adherence | null;

  if (target) {
    console.log(
      `Cycle ${cycle}: status=${target.status} started_at=${target.started_at ?? "-"} generated_at=${target.generated_at ?? "-"}`
    );
    const { error } = await supabase
      .from("user_plans")
      .update({ status: "generating" })
      .eq("user_id", userId)
      .eq("cycle", cycle);
    if (error) {
      console.error("Could not release the row:", error.message);
      process.exit(1);
    }
  } else {
    console.log(`No row for cycle ${cycle} — generating fresh.`);
  }

  console.log("Calling the model...");
  const started = Date.now();
  await generatePlan(userId as string, { cycle, adherence });
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s`);

  const { data: after } = await supabase
    .from("user_plans")
    .select("status, plan, generated_at, started_at")
    .eq("user_id", userId)
    .eq("cycle", cycle)
    .maybeSingle();

  if (after?.status !== "ready") {
    console.error(`Row is still "${after?.status}" — generation failed, see the log above.`);
    process.exit(1);
  }

  const plan = after.plan as { weeks?: { tasks?: { pillar: string; exercises?: { id: string }[] }[] }[] };
  const ids = new Set<string>();
  for (const w of plan.weeks ?? []) {
    for (const t of w.tasks ?? []) for (const e of t.exercises ?? []) ids.add(e.id);
  }
  console.log(`Saved. generated_at=${after.generated_at} started_at=${after.started_at ?? "-"}`);
  console.log(`Weeks: ${plan.weeks?.length ?? 0}   distinct exercises: ${ids.size}`);
  console.log(`  ${[...ids].sort().join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
