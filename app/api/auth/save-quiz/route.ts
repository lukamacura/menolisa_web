import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { sendMetaLead } from "@/lib/metaCapi";
import { leadEventId } from "@/lib/metaPixel";

export const runtime = "nodejs";

const VALID_GOALS = [
  "sleep_through_night",
  "think_clearly",
  "feel_like_myself",
  "understand_patterns",
  "data_for_doctor",
  "get_body_back",
] as const;

// Multi-select on the quiz's safety screen. Enumerated rather than free strings
// because these gate what the 8-week plan may suggest — an unrecognised value
// would be silently ignored by the generator's safety rule.
//
// The web funnel stopped asking for these on 2026-08-16 (the screen became
// `q_limitations`), so web signups now send an empty array. Kept because the
// Expo app still asks and every profile written before that date carries values
// the plan generator reads.
const SAFETY_FLAGS = [
  "breast_cancer",
  "clots_stroke",
  "liver_disease",
  "none",
  "prefer_not",
] as const;

// Multi-select on the quiz's `q_limitations` screen — what hurts when she moves.
// Enumerated for the same reason as SAFETY_FLAGS, and more strictly: these ids
// drive a code-level filter on the exercise pool (`LIMITATION_EXCLUDES` in
// `lib/plan/catalog.ts`), so a value that doesn't match one there is a knee that
// silently gets lunges.
const PHYSICAL_LIMITS = [
  "back",
  "knee",
  "hip",
  "shoulder",
  "pelvic_floor",
  "balance",
  "none",
] as const;

const QuizSchema = z.object({
  name: z.string().min(1).max(100).nullable().optional(),
  age_band: z.string().max(50).nullable().optional(),
  top_problems: z.array(z.string().max(50)).max(20).optional(),
  // How hard her worst symptom hits. Replaces the duration question the web quiz
  // no longer asks; `timing` stays accepted for mobile and legacy callers.
  symptom_impact: z.enum(["mild", "moderate", "severe"]).nullable().optional(),
  timing: z.string().max(50).nullable().optional(),
  here_for: z.string().max(50).nullable().optional(),
  menopause_type: z.enum(["natural", "surgical", "medical", "not_sure"]).nullable().optional(),
  nutrition_style: z
    .enum(["skipping", "convenience", "inconsistent", "intentional"])
    .nullable()
    .optional(),
  relaxation_style: z.enum(["none", "occasional", "routine", "want_to"]).nullable().optional(),
  safety_flags: z.array(z.enum(SAFETY_FLAGS)).max(SAFETY_FLAGS.length).optional(),
  physical_limits: z.array(z.enum(PHYSICAL_LIMITS)).max(PHYSICAL_LIMITS.length).optional(),
  tried_options: z.array(z.string().max(50)).max(20).optional(),
  hrt_status: z.string().max(50).nullable().optional(),
  doctor_status: z.string().max(50).nullable().optional(),
  goal: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  goals: z.array(z.string().max(50)).max(20).optional(),
  qualifier: z.string().max(50).nullable().optional(),
  height_cm: z.number().int().min(50).max(300).nullable().optional(),
  weight_kg: z.number().int().min(20).max(500).nullable().optional(),
  height_unit: z.enum(["cm", "ft"]).nullable().optional(),
  weight_unit: z.enum(["kg", "lb"]).nullable().optional(),
  fitness_level: z.enum(["beginner", "medium", "advanced", "movement_snacks"]).nullable().optional(),
});

const BodySchema = z.object({
  quizAnswers: QuizSchema,
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

    const { quizAnswers } = parsed.data;
    const userId = user.id;
    const supabaseAdmin = getSupabaseAdmin();

    // Full multi-select list (validated), preferring the new `goals[]` and falling
    // back to a `goal` that may arrive as a single string or a legacy array.
    const goalsRaw = quizAnswers.goals ?? (Array.isArray(quizAnswers.goal) ? quizAnswers.goal : quizAnswers.goal ? [quizAnswers.goal] : []);
    const goalsValue = goalsRaw.filter((g) => (VALID_GOALS as readonly string[]).includes(g));
    // Singular column keeps holding the primary goal for backward compatibility.
    const goalValue = goalsValue[0] ?? null;

    const profileData = {
      user_id: userId,
      name: quizAnswers.name ?? null,
      age_band: quizAnswers.age_band ?? null,
      top_problems: quizAnswers.top_problems ?? [],
      symptom_impact: quizAnswers.symptom_impact ?? null,
      timing: quizAnswers.timing ?? null,
      here_for: quizAnswers.here_for ?? null,
      menopause_type: quizAnswers.menopause_type ?? null,
      nutrition_style: quizAnswers.nutrition_style ?? null,
      relaxation_style: quizAnswers.relaxation_style ?? null,
      safety_flags: quizAnswers.safety_flags ?? [],
      physical_limits: quizAnswers.physical_limits ?? [],
      tried_options: quizAnswers.tried_options ?? [],
      hrt_status: quizAnswers.hrt_status ?? null,
      doctor_status: quizAnswers.doctor_status ?? null,
      goal: goalValue,
      goals: goalsValue,
      qualifier: quizAnswers.qualifier ?? null,
      height_cm: quizAnswers.height_cm ?? null,
      weight_kg: quizAnswers.weight_kg ?? null,
      height_unit: quizAnswers.height_unit ?? null,
      weight_unit: quizAnswers.weight_unit ?? null,
      fitness_level: quizAnswers.fitness_level ?? null,
    };

    const { data: existingProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Captured before the write decides which branch it takes: this is the Lead
    // signal. "A profile row did not exist for this account until now" is the
    // only definition of a new lead that survives a woman clicking a second ad
    // in a fresh tab, on a new phone, three weeks later. See the CAPI send at
    // the end of this handler.
    const isNewProfile = !existingProfile;

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
    //
    // This row is the only record that she reached the paywall, so a failure here
    // costs no access (checkTrialExpired fails closed either way) but silently
    // deletes her from every funnel number and from the p-1…p-6 winback, which
    // selects on account_status = 'pending_payment'. It went unnoticed for exactly
    // that reason once already — a check constraint predating the pending_payment
    // status rejected every insert while this branch only console.error'd it
    // (fixed in scripts/sql/2026-08-12-fix-account-status-check.sql).
    //
    // So: never fail her checkout over bookkeeping, but never lose the failure
    // either. It is logged under a greppable tag and reported in the response.
    let trialRowReady = true;
    {
      const { data: existingTrial } = await supabaseAdmin
        .from("user_trials")
        .select("account_status")
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingTrial) {
        const { error: trialError } = await supabaseAdmin.from("user_trials").insert({
          user_id: userId,
          account_status: "pending_payment",
        });
        if (trialError) {
          trialRowReady = false;
          console.error(
            "[save-quiz] FUNNEL-BLIND: user_trials insert failed, this signup is untracked",
            { userId, code: trialError.code, message: trialError.message }
          );
        }
      }
      // If a row already exists (mobile IAP, prior attempt), leave it untouched —
      // the Stripe webhook will flip it to "paid" on checkout completion.
    }

    // Meta `Lead`, server-side, once per human.
    //
    // It used to fire from the browser in `completeRegistration()`, deduped in
    // sessionStorage — i.e. once per *tab*. Ads send the same woman back
    // repeatedly, and every return in a fresh tab reported another Lead, so the
    // count drifted above the number of real people. Lead is the fallback
    // optimization objective while Purchase volume is thin, so that inflation
    // is not a reporting nuisance: it understates cost-per-lead and steers
    // delivery toward women who click ads again without buying.
    //
    // Gated on `isNewProfile`, the answer comes from the database instead of
    // the browser and is therefore correct across tabs, devices and months.
    //
    // Mobile is excluded: the Expo app calls this endpoint too, and a phone
    // signup is not a web ad conversion. Bearer auth is the clean signal — a
    // funnel visitor authenticates by cookie.
    const isMobileCaller = request.headers
      .get("authorization")
      ?.startsWith("Bearer ");

    if (isNewProfile && !isMobileCaller) {
      // fbp/fbc/IP/UA are the only things tying this server event back to the ad
      // click; they exist here because save-quiz runs inside her browser's own
      // request. Awaited rather than fired-and-forgotten so the serverless
      // invocation can't be frozen mid-flight, and `sendMetaLead` never throws.
      await sendMetaLead({
        eventId: leadEventId(userId),
        eventTimeSec: Math.floor(Date.now() / 1000),
        userId,
        email: user.email?.trim() ? user.email : null,
        fbp: request.cookies.get("_fbp")?.value,
        fbc: request.cookies.get("_fbc")?.value,
        clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        clientUa: request.headers.get("user-agent") ?? undefined,
        eventSourceUrl: request.headers.get("referer"),
        symptomCount: quizAnswers.top_problems?.length ?? null,
        goal: goalValue,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Quiz answers saved",
      trialRowReady,
    });
  } catch (error) {
    console.error("Error in save-quiz:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
