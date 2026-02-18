import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Server-side magic link generation
 * 
 * Flow:
 * 1. For registration: Create user account and save quiz data first
 * 2. Call signInWithOtp to trigger Supabase email
 * 3. Email template uses: {{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=magiclink
 * 4. User clicks → goes directly to our /auth/verify endpoint
 * 5. /auth/verify calls verifyOtp({ token_hash }) - NO PKCE REQUIRED!
 * 
 * This works across all browsers because token_hash verification doesn't need PKCE.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, isRegistration, quizAnswers } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailLower)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Check if user exists
    const { data: existingUsers, error: lookupError } = await supabaseAdmin.auth.admin.listUsers();

    if (lookupError) {
      console.error("User lookup error:", lookupError);
      return NextResponse.json(
        { error: "Failed to verify account. Please try again." },
        { status: 500 }
      );
    }

    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === emailLower
    );

    // For login: user must exist
    if (!isRegistration && !existingUser) {
      return NextResponse.json(
        { error: "No account found with this email. Please register first." },
        { status: 404 }
      );
    }

    // For registration: if user exists, redirect to login
    if (isRegistration && existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead.", userExists: true },
        { status: 409 }
      );
    }

    // For registration: create user account and save quiz data BEFORE sending email
    if (isRegistration && !existingUser) {
      console.log("Creating new user account for registration...");
      
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: emailLower,
        email_confirm: false, // Will be confirmed when they click the link
        user_metadata: {
          quiz_completed: !!quizAnswers,
        },
      });

      if (createError) {
        console.error("User creation error:", createError);
        return NextResponse.json(
          { error: "Failed to create account. Please try again." },
          { status: 500 }
        );
      }

      if (newUserData.user && quizAnswers) {
        console.log("Saving quiz answers...");
        await saveQuizAnswers(supabaseAdmin, newUserData.user.id, quizAnswers);
      }

      // Create user_trials entry
      if (newUserData.user) {
        try {
          const nowIso = new Date().toISOString();
          const { error: trialError } = await supabaseAdmin.from("user_trials").insert({
            user_id: newUserData.user.id,
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
      }

      console.log("User account created:", newUserData.user?.id);
    }

    console.log("Sending magic link email:", {
      email: emailLower,
      isRegistration,
    });

    // Create a server-side Supabase client to trigger OTP email
    // The email template will use {{ .TokenHash }} to create a direct link
    // to our /auth/verify endpoint
    const supabaseServer = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Send the magic link email
    // Note: The email template should use:
    // {{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=magiclink
    // 
    // shouldCreateUser is false because:
    // - For login: user already exists
    // - For registration: we already created the user above
    const { error: otpError } = await supabaseServer.auth.signInWithOtp({
      email: emailLower,
      options: {
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      console.error("Error sending OTP email:", otpError);

      // Check for rate limiting from Supabase
      if (
        otpError.message?.includes("security purposes") ||
        otpError.message?.includes("rate") ||
        otpError.message?.includes("For security purposes") ||
        otpError.status === 429
      ) {
        return NextResponse.json(
          { error: otpError.message || "Too many requests. Please wait before trying again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Failed to send magic link email. Please try again." },
        { status: 500 }
      );
    }

    console.log("Magic link email sent successfully");

    return NextResponse.json({
      success: true,
      message: "Magic link sent",
    });
  } catch (error) {
    console.error("Error in send-magic-link:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * Helper function to save quiz answers to user profile
 */
async function saveQuizAnswers(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  quizAnswers: Record<string, unknown>
) {
  try {
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
        const firstValidGoal = (quizAnswers.goal as string[]).find((g) =>
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
      }
    } else {
      // Insert new profile
      const { error: insertError } = await supabaseAdmin
        .from("user_profiles")
        .insert(profileData);

      if (insertError) {
        console.error("Error inserting profile:", insertError);
      }
    }
  } catch (error) {
    console.error("Error saving quiz answers:", error);
  }
}
