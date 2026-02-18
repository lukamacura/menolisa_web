import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Save quiz answers for a newly registered user
 * Called after password-based registration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, quizAnswers, referralCode } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (!quizAnswers) {
      return NextResponse.json({ error: "Quiz answers are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Prepare profile data
    const validGoals = [
      "sleep_through_night",
      "think_clearly",
      "feel_like_myself",
      "understand_patterns",
      "data_for_doctor",
      "get_body_back",
    ];

    let goalValue = null;
    if (quizAnswers.goal) {
      if (Array.isArray(quizAnswers.goal)) {
        const firstValidGoal = (quizAnswers.goal as string[]).find((g: string) =>
          validGoals.includes(g)
        );
        goalValue = firstValidGoal || null;
      } else if (
        typeof quizAnswers.goal === "string" &&
        validGoals.includes(quizAnswers.goal)
      ) {
        goalValue = quizAnswers.goal;
      }
    }

    const profileData = {
      user_id: userId,
      name: (quizAnswers.name as string) || null,
      top_problems: (quizAnswers.top_problems as string[]) || [],
      severity: (quizAnswers.severity as string) || null,
      timing: (quizAnswers.timing as string) || null,
      tried_options: (quizAnswers.tried_options as string[]) || [],
      doctor_status: (quizAnswers.doctor_status as string) || null,
      goal: goalValue,
    };

    // Check if profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile) {
      // Update existing profile
      const { error: updateError } = await supabaseAdmin
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return NextResponse.json(
          { error: "Failed to update profile" },
          { status: 500 }
        );
      }
    } else {
      // Insert new profile
      const { error: insertError } = await supabaseAdmin
        .from("user_profiles")
        .insert(profileData);

      if (insertError) {
        console.error("Error inserting profile:", insertError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }
    }

    // Create user_trials entry
    try {
      const nowIso = new Date().toISOString();
      const { error: trialError } = await supabaseAdmin.from("user_trials").insert({
        user_id: userId,
        trial_start: nowIso,
        trial_days: 3,
        account_status: "trial",
      });

      if (trialError) {
        // Trial may already exist, which is fine
        console.warn("Trial creation error (may already exist):", trialError);
      }
    } catch (e) {
      console.warn("Trial creation error:", e);
    }

    if (referralCode && typeof referralCode === "string" && referralCode.trim()) {
      try {
        const origin =
          request.nextUrl?.origin ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:3000";
        const applyRes = await fetch(`${origin}/api/referral/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referredUserId: userId,
            referralCode: referralCode.trim(),
          }),
        });
        if (!applyRes.ok) {
          console.warn("Referral apply failed:", await applyRes.text());
        }
      } catch (e) {
        console.warn("Referral apply error:", e);
      }
    }

    console.log("Quiz answers saved successfully for user:", userId);

    return NextResponse.json({
      success: true,
      message: "Quiz answers saved",
    });
  } catch (error) {
    console.error("Error in save-quiz:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
