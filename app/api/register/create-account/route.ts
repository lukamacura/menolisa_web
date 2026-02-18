// app/api/register/create-account/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Creates a user account immediately with quiz data saved
 * Then sends a magic link for email verification
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, quizAnswers } = body;

    if (!email || !quizAnswers) {
      return NextResponse.json(
        { error: "Email and quiz answers are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate quiz answers structure
    if (!quizAnswers.top_problems || !Array.isArray(quizAnswers.top_problems) || quizAnswers.top_problems.length === 0) {
      return NextResponse.json(
        { error: "Quiz answers must include top_problems array" },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = getSupabaseAdmin();
    } catch (adminError) {
      console.error("Failed to initialize Supabase admin client:", adminError);
      return NextResponse.json(
        { error: "Server configuration error", details: adminError instanceof Error ? adminError.message : String(adminError) },
        { status: 500 }
      );
    }

    console.log("=== CREATE ACCOUNT API ===");
    console.log("Email:", email);
    console.log("Quiz answers:", quizAnswers);

    // Check if user already exists by email
    // Note: Supabase admin API doesn't have getUserByEmail, so we need to list and filter
    // For better performance, we could add pagination, but for now we'll list all
    let existingUser = null;
    try {
      console.log("Checking if user exists...");
      const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) {
        console.error("Error listing users:", listError);
        return NextResponse.json(
          { error: "Failed to check existing users", details: listError.message || String(listError) },
          { status: 500 }
        );
      }

      existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (existingUser) {
        console.log("User already exists, using existing ID:", existingUser.id);
      } else {
        console.log("User does not exist, will create new account");
      }
    } catch (listErr) {
      console.error("Error in listUsers:", listErr);
      return NextResponse.json(
        { error: "Failed to check existing users", details: listErr instanceof Error ? listErr.message : String(listErr) },
        { status: 500 }
      );
    }

    let userId: string;

    if (existingUser) {
      // User already exists - use existing user ID
      console.log("User already exists, using existing ID:", existingUser.id);
      userId = existingUser.id;
    } else {
      // Create new user account immediately
      console.log("Creating new user account...");
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: false, // Will be confirmed via magic link
        user_metadata: {
          quiz_completed: true,
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return NextResponse.json(
          { error: "Failed to create account", details: createError.message },
          { status: 500 }
        );
      }

      if (!newUser.user) {
        return NextResponse.json(
          { error: "User creation failed - no user returned" },
          { status: 500 }
        );
      }

      userId = newUser.user.id;
      console.log("User created successfully:", userId);
    }

    // Prepare profile data from quiz answers
    const profileData: any = {
      user_id: userId,
      name: quizAnswers.name || null,
      top_problems: quizAnswers.top_problems || [],
      severity: quizAnswers.severity || null,
      timing: quizAnswers.timing || null,
      tried_options: quizAnswers.tried_options || [],
      doctor_status: quizAnswers.doctor_status || null,
    };

    // Handle goal field - constraint only allows specific string values or NULL
    // If it's an array, take the first valid goal; if it's a string, use it; otherwise NULL
    const validGoals = ['sleep_through_night', 'think_clearly', 'feel_like_myself', 'understand_patterns', 'data_for_doctor', 'get_body_back'];
    
    if (quizAnswers.goal) {
      if (Array.isArray(quizAnswers.goal)) {
        // Take the first valid goal from the array
        const firstValidGoal = (quizAnswers.goal as string[]).find((g: string) => validGoals.includes(g));
        profileData.goal = firstValidGoal || null;
      } else if (typeof quizAnswers.goal === "string" && validGoals.includes(quizAnswers.goal)) {
        // Single valid goal string
        profileData.goal = quizAnswers.goal;
      } else {
        profileData.goal = null;
      }
    } else {
      profileData.goal = null;
    }
    
    console.log("Goal field processed:", { original: quizAnswers.goal, stored: profileData.goal });

    // Save quiz data to user_profiles
    console.log("Saving quiz data to user_profiles...");
    console.log("Profile data to save:", JSON.stringify(profileData, null, 2));
    
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors when not found

    if (profileCheckError && profileCheckError.code !== "PGRST116") {
      // PGRST116 is "not found" which is expected for new users
      console.error("Error checking profile:", profileCheckError);
      return NextResponse.json(
        { error: "Failed to check user profile", details: profileCheckError.message || String(profileCheckError) },
        { status: 500 }
      );
    }

    if (existingProfile) {
      // Update existing profile
      console.log("Updating existing profile...");
      const { error: updateError } = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return NextResponse.json(
          { error: "Failed to save quiz data", details: updateError.message },
          { status: 500 }
        );
      }
      console.log("Profile updated successfully");
    } else {
      // Insert new profile
      console.log("Creating new profile...");
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert(profileData);

      if (insertError) {
        console.error("Error inserting profile:", insertError);
        return NextResponse.json(
          { error: "Failed to save quiz data", details: insertError.message },
          { status: 500 }
        );
      }
      console.log("Profile created successfully");
    }

    // Ensure user_trials entry exists (trigger should create it, but ensure it exists)
    const { data: existingTrial, error: trialCheckError } = await supabase
      .from("user_trials")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(); // Use maybeSingle instead of single

    if (trialCheckError && trialCheckError.code === "PGRST116") {
      // Trial doesn't exist - create it
      console.log("Creating user_trials entry...");
      const nowIso = new Date().toISOString();
      const { error: trialInsertError } = await supabase
        .from("user_trials")
        .insert({
          user_id: userId,
          trial_start: nowIso,
          trial_days: 3,
          account_status: "trial",
        });

      if (trialInsertError) {
        console.error("Error creating trial:", trialInsertError);
        // Don't fail the whole request if trial creation fails
        console.warn("Continuing despite trial creation error");
      } else {
        console.log("Trial created successfully");
      }
    } else if (trialCheckError) {
      console.error("Error checking trial:", trialCheckError);
      // Don't fail the whole request
    } else {
      console.log("Trial already exists");
    }

    // Magic link will be sent by the client using signInWithOtp
    // Account and quiz data are already saved
    console.log("=== ACCOUNT CREATION COMPLETE ===");
    return NextResponse.json({
      success: true,
      userId,
      message: "Account created and quiz data saved successfully",
    });
  } catch (error) {
    console.error("Unexpected error in create-account:", error);
    return NextResponse.json(
      {
        error: "Failed to create account",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

