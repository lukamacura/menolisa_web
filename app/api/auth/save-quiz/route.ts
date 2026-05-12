import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

const VALID_GOALS = [
  "sleep_through_night",
  "think_clearly",
  "feel_like_myself",
  "understand_patterns",
  "data_for_doctor",
  "get_body_back",
] as const;

const QuizSchema = z.object({
  name: z.string().min(1).max(100).nullable().optional(),
  top_problems: z.array(z.string().max(50)).max(20).optional(),
  severity: z.string().max(50).nullable().optional(),
  timing: z.string().max(50).nullable().optional(),
  tried_options: z.array(z.string().max(50)).max(20).optional(),
  doctor_status: z.string().max(50).nullable().optional(),
  goal: z.union([z.string(), z.array(z.string())]).nullable().optional(),
});

const BodySchema = z.object({
  quizAnswers: QuizSchema,
  referralCode: z.string().max(64).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid quiz payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { quizAnswers, referralCode } = parsed.data;
    const userId = user.id;
    const supabaseAdmin = getSupabaseAdmin();

    let goalValue: string | null = null;
    if (quizAnswers.goal) {
      if (Array.isArray(quizAnswers.goal)) {
        goalValue =
          quizAnswers.goal.find((g) => (VALID_GOALS as readonly string[]).includes(g)) ??
          null;
      } else if ((VALID_GOALS as readonly string[]).includes(quizAnswers.goal)) {
        goalValue = quizAnswers.goal;
      }
    }

    const profileData = {
      user_id: userId,
      name: quizAnswers.name ?? null,
      top_problems: quizAnswers.top_problems ?? [],
      severity: quizAnswers.severity ?? null,
      timing: quizAnswers.timing ?? null,
      tried_options: quizAnswers.tried_options ?? [],
      doctor_status: quizAnswers.doctor_status ?? null,
      goal: goalValue,
    };

    const { data: existingProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile) {
      const { error: updateError } = await supabaseAdmin
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("user_profiles")
        .insert(profileData);

      if (insertError) {
        console.error("Error inserting profile:", insertError);
        return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      }
    }

    // Ensure a user_trials row exists in pending_payment state.
    // Upsert so re-registrations (e.g. mobile → web) don't silently fail on duplicate user_id.
    // The webhook flips account_status to "paid" once Stripe checkout completes.
    {
      const nowIso = new Date().toISOString();
      const { data: existingTrial } = await supabaseAdmin
        .from("user_trials")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingTrial) {
        const { error: trialError } = await supabaseAdmin.from("user_trials").insert({
          user_id: userId,
          trial_start: nowIso,
          trial_days: 3,
          account_status: "pending_payment",
        });
        if (trialError) {
          console.error("Trial row creation failed:", trialError);
        }
      }
      // If a row already exists (mobile IAP, prior attempt), leave it untouched —
      // the Stripe webhook will flip it to "paid" on checkout completion.
    }

    if (referralCode && referralCode.trim()) {
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

    return NextResponse.json({ success: true, message: "Quiz answers saved" });
  } catch (error) {
    console.error("Error in save-quiz:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
