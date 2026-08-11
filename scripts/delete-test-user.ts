/**
 * Delete a single user and all their data, by email. For re-testing the
 * /register → checkout funnel with an email you've already used.
 *
 * Mirrors the table list cleared by public.purge_stale_anonymous_users()
 * (scripts/sql/2026-08-10-anonymous-funnel-accounts.sql), minus that
 * function's anonymous/unpaid-only restriction — this deletes whoever the
 * email belongs to, paid or not.
 *
 * Usage:
 *   npx tsx scripts/delete-test-user.ts someone@example.com
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { createClient } from "@supabase/supabase-js";

const USER_TABLES = [
  "conversations",
  "email_sequence_recipients",
  "notifications",
  "symptom_logs",
  "symptoms",
  "user_habits",
  "user_insights",
  "user_plan_logs",
  "user_plans",
  "user_preferences",
  "user_profiles",
  "user_push_tokens",
  "user_trials",
  "weekly_insights",
];

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/delete-test-user.ts <email>");
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

  const { data: userId, error: lookupError } = await supabase.rpc(
    "auth_user_id_by_email",
    { p_email: email }
  );

  if (lookupError) {
    console.error("Lookup failed:", lookupError.message);
    process.exit(1);
  }
  if (!userId) {
    console.log(`No user found for ${email}. Nothing to delete.`);
    return;
  }

  console.log(`Found user ${userId} for ${email}. Deleting...`);

  for (const table of USER_TABLES) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("user_id", userId);
    if (error) {
      console.error(`  ${table}: FAILED — ${error.message}`);
    } else {
      console.log(`  ${table}: ${count ?? 0} row(s) deleted`);
    }
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("auth.users deletion FAILED:", authError.message);
    process.exit(1);
  }

  console.log(`Done. ${email} (${userId}) fully deleted — safe to reuse in the funnel.`);
}

main();
