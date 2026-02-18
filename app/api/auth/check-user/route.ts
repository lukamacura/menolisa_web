import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * API endpoint to check if a user exists in Supabase auth
 * This prevents auto-creation of users during login flow
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Use admin client to check if user exists
    const supabase = getSupabaseAdmin();

    // List users and check if email exists
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("Error checking user existence:", error);
      // If we can't check, return null (allow the login attempt to proceed)
      // This is a fallback - better to allow than block
      return NextResponse.json({ exists: null, error: "Could not verify user existence" });
    }

    // Check if any user has this email
    const userExists = data.users.some((user) => 
      user.email?.toLowerCase() === email.toLowerCase()
    );

    return NextResponse.json({ exists: userExists });
  } catch (error) {
    console.error("Unexpected error in check-user:", error);
    // On error, return null to allow login attempt (fail open)
    return NextResponse.json({ exists: null, error: "Unexpected error" });
  }
}

