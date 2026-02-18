// app/api/intake/route.ts
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    // Get admin client (bypasses RLS)
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    
    console.log("=== INTAKE API CALLED ===");
    console.log("User ID:", body.user_id);
    console.log("Name:", body.name);
    console.log("Top Problems:", body.top_problems);
    console.log("Severity:", body.severity);

    const {
      user_id,
      name,
      top_problems,
      severity,
      timing,
      tried_options,
      doctor_status,
      goal,
    } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: "Missing required field: user_id." },
        { status: 400 }
      );
    }

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

    if (severity !== undefined && severity !== null) {
      if (!["mild", "moderate", "severe"].includes(severity)) {
        return NextResponse.json(
          { error: "Please select a valid severity level." },
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

    // Verify user exists in auth.users first (using admin API)
    try {
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user_id);
      if (authError || !authUser) {
        console.error("User not found in auth.users:", authError);
        return NextResponse.json(
          { 
            error: "User account not found. Please try registering again.",
            details: process.env.NODE_ENV === "development" ? authError?.message : undefined
          },
          { status: 400 }
        );
      }
    } catch (authCheckError) {
      // If admin API fails, log but continue (user might still exist)
      console.warn("Could not verify user via admin API:", authCheckError);
    }

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

    console.log("Intake API: Profile check result:", {
      hasProfile: !!existingProfile,
      userId: user_id,
      hasQuizData: !!(top_problems || name || severity || timing)
    });

    // Prepare profile data with new question structure (only include provided fields)
    const profileData: {
      name?: string | null;
      top_problems?: string[];
      severity?: string | null;
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
    if (severity !== undefined) {
      profileData.severity = severity || null;
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
