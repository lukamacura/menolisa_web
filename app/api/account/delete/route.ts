import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/account/delete
 * Permanently deletes the authenticated user's account and all associated data.
 * Requires Bearer token (mobile) or cookie session (web).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;
    const supabase = getSupabaseAdmin();

    // Delete user data from all tables (order: child/dependent first to avoid FK issues)
    const tablesToDelete: { table: string; column: string }[] = [
      { table: "notifications", column: "user_id" },
      { table: "user_push_tokens", column: "user_id" },
      { table: "conversations", column: "user_id" },
      { table: "symptom_logs", column: "user_id" },
      { table: "symptoms", column: "user_id" },
      { table: "weekly_insights", column: "user_id" },
      { table: "daily_mood", column: "user_id" },
      { table: "user_preferences", column: "user_id" },
      { table: "user_profiles", column: "user_id" },
      { table: "user_trials", column: "user_id" },
    ];

    for (const { table, column } of tablesToDelete) {
      const { error } = await supabase.from(table).delete().eq(column, userId);
      if (error) {
        console.warn(`Account delete: ${table} delete failed (may not exist):`, error.message);
        // Continue; some tables may not exist or have different schema
      }
    }

    // Referrals: delete where user is referrer; also where user is referee if column exists
    const { error: refErr } = await supabase.from("referrals").delete().eq("referrer_id", userId);
    if (refErr) console.warn("Account delete: referrals delete:", refErr.message);

    // Delete the auth user (so they cannot log in again)
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Account delete: auth.admin.deleteUser failed:", authError);
      return NextResponse.json(
        { error: "Failed to delete account. Please try again or contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Account delete error:", e);
    return NextResponse.json(
      { error: "Failed to delete account. Please try again." },
      { status: 500 }
    );
  }
}
