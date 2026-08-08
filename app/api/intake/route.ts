// app/api/intake/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export async function POST(req: NextRequest) {
  try {
    // The profile written here is whoever is holding the session, never whoever
    // the body claims to be. This route writes user_profiles with the service
    // role, so trusting body.user_id let anyone overwrite any woman's quiz
    // answers — name, symptoms, goals — with nothing but her user id.
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = user.id;

    const supabase = getSupabaseAdmin();
    const body = await req.json();

    const {
      name,
      top_problems,
      timing,
      tried_options,
      doctor_status,
      goal,
    } = body;

    // Validate required fields for new question structure (only if provided)
    // Allow partial updates for webhook/trigger created profiles
    // Note: Quiz now allows any number of symptoms
    if (top_problems !== undefined) {
      if (!Array.isArray(top_problems) || top_problems.length === 0) {
        return NextResponse.json(
          { error: "Please select at least one problem." },
          { status: 400 }
        );
      }
    }

    if (timing !== undefined && timing !== null) {
      if (!["just_started", "been_while", "over_year", "several_years"].includes(timing)) {
        return NextResponse.json(
          { error: "Please select when symptoms started." },
          { status: 400 }
        );
      }
    }

    if (tried_options !== undefined && tried_options !== null) {
      // Accept empty arrays silently - they just won't update the field
      if (!Array.isArray(tried_options)) {
        return NextResponse.json(
          { error: "tried_options must be an array." },
          { status: 400 }
        );
      }
    }

    if (doctor_status !== undefined && doctor_status !== null) {
      if (!["yes_actively", "yes_not_helpful", "no_planning", "no_natural"].includes(doctor_status)) {
        return NextResponse.json(
          { error: "Please select your doctor status." },
          { status: 400 }
        );
      }
    }

    if (goal !== undefined && goal !== null) {
      // Handle both array and string for backward compatibility
      const validGoals = ["sleep_through_night", "think_clearly", "feel_like_myself", "understand_patterns", "data_for_doctor", "get_body_back"];
      if (Array.isArray(goal)) {
        // Empty arrays are fine - they just won't update the field
        // Only validate if array has items
        if (goal.length > 0 && !goal.every(g => validGoals.includes(g))) {
          return NextResponse.json(
            { error: "Please select valid goals." },
            { status: 400 }
          );
        }
      } else if (goal !== "" && !validGoals.includes(goal)) {
        return NextResponse.json(
          { error: "Please select a valid goal." },
          { status: 400 }
        );
      }
    }

    // No auth.users existence check needed — getAuthenticatedUser() already
    // validated the session against Supabase, so the row is known to exist.

    // Check if profile already exists (handle both found and not found cases)
    const { data: existingProfile, error: checkError } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", user_id)
      .maybeSingle();

    // If table doesn't exist, checkError will have code 42P01
    if (checkError && checkError.code === "42P01") {
      console.error("Table 'user_profiles' does not exist. Error:", checkError);
      return NextResponse.json(
        { 
          error: "Database table 'user_profiles' does not exist. Please run the migration SQL in Supabase.",
          details: process.env.NODE_ENV === "development" ? checkError.message : undefined
        },
        { status: 500 }
      );
    }

    // Log any check errors (but continue if it's just "not found")
    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing profile:", checkError);
    }

    // Prepare profile data with new question structure (only include provided fields)
    const profileData: {
      name?: string | null;
      top_problems?: string[];
      timing?: string | null;
      tried_options?: string[];
      doctor_status?: string | null;
      goal?: string | null;
    } = {};
    
    if (name !== undefined) {
      profileData.name = name || null;
    }
    if (top_problems !== undefined) {
      profileData.top_problems = top_problems;
    }
    if (timing !== undefined) {
      profileData.timing = timing || null;
    }
    if (tried_options !== undefined) {
      profileData.tried_options = tried_options;
    }
    if (doctor_status !== undefined) {
      profileData.doctor_status = doctor_status || null;
    }
    if (goal !== undefined) {
      // Handle both array and string for backward compatibility
      if (Array.isArray(goal)) {
        // Store as JSON string for multiple goals
        profileData.goal = JSON.stringify(goal);
      } else if (goal !== null && goal !== "") {
        // Single goal value - store as string
        profileData.goal = String(goal);
      } else {
        profileData.goal = null;
      }
    }

    if (existingProfile) {
      // Update existing profile instead of inserting
      const { error } = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", user_id);

      if (error) {
        console.error("Supabase update error:", error);
        return NextResponse.json(
          { 
            error: "Database error while updating profile.",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, updated: true });
    }

    // Insert new user profile
    const { error } = await supabase.from("user_profiles").insert([
      {
        user_id,
        ...profileData,
      },
    ]);

    if (error) {
      console.error("Supabase insert error:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      console.error("Error details:", error.details);
      console.error("Error hint:", error.hint);
      
      // Provide more helpful error messages
      let errorMessage = "Database error while saving profile.";
      if (error.code === "42P01") {
        errorMessage = "Database table 'user_profiles' does not exist. Please run the migration SQL in Supabase SQL Editor.";
      } else if (error.code === "23505") {
        errorMessage = "Profile already exists for this user.";
      } else if (error.code === "23503") {
        errorMessage = "Invalid user ID. The user account may not exist. Please try logging in again.";
      } else if (error.code === "42501") {
        errorMessage = "Permission denied. Check RLS policies on user_profiles table.";
      } else if (error.message) {
        // Always show detailed error in development, simplified in production
        if (process.env.NODE_ENV === "development") {
          errorMessage = `Database error: ${error.message}${error.hint ? ` (Hint: ${error.hint})` : ""}`;
        } else {
          errorMessage = "Database error while saving profile. Please contact support.";
        }
      }

      return NextResponse.json(
        { 
          error: errorMessage,
          details: process.env.NODE_ENV === "development" ? JSON.stringify({
            code: error.code,
            message: error.message,
            hint: error.hint,
            details: error.details
          }, null, 2) : undefined
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Unexpected error in intake route:", e);
    return NextResponse.json(
      { 
        error: "Unexpected error while saving profile.",
        details: process.env.NODE_ENV === "development" && e instanceof Error ? e.message : undefined
      },
      { status: 500 }
    );
  }
}
