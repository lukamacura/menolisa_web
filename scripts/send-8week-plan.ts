import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// Simulates the post-checkout 8-week plan email for a single user.
// Usage: npx tsx scripts/send-8week-plan.ts <email>
// Dynamic imports below: env must load before modules that read process.env at import time.
async function main() {
  const { getSupabaseAdmin } = await import("@/lib/supabaseAdmin");
  const { send8WeekPlanEmail } = await import("@/lib/eightWeekPlan");

  const email = process.argv[2] ?? "luka.xzy@gmail.com";
  const supabaseAdmin = getSupabaseAdmin();

  // Find the auth user by email (paginate through the admin list).
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) userId = match.id;
    if (data.users.length < 200) break;
  }

  if (!userId) {
    console.error(`No auth user found for ${email}`);
    process.exit(1);
  }

  console.log(`Sending 8-week plan to ${email} (user ${userId})...`);
  await send8WeekPlanEmail(email, userId);
  console.log("Done. Check the inbox (and Resend dashboard for delivery status).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
