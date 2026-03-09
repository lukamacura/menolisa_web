import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/auth/notify-app-launch
 * Sets notify_on_app_launch = true for the authenticated user (quiz results gap strategy).
 * Used when the user clicks "Notify me when the app is ready" and we don't have app store links yet.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("user_profiles")
      .update({ notify_on_app_launch: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      console.error("notify-app-launch update error:", error);
      return NextResponse.json(
        { error: "Could not save your preference. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "We'll notify you when the app is ready.",
    });
  } catch (e) {
    console.error("notify-app-launch error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
