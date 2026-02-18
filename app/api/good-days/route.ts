import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// POST: Log a good day
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if trial is expired
    const isExpired = await checkTrialExpired(user.id);
    if (isExpired) {
      return NextResponse.json(
        { error: "Trial expired. Please upgrade to continue using the tracker." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { rating } = body; // 1=Good, 2=Great, 3=Amazing

    if (typeof rating !== "number" || rating < 1 || rating > 3 || !Number.isInteger(rating)) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 3" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Find or create "Good Day" symptom for this user
    let goodDaySymptom;
    const { data: existingSymptom, error: findError } = await supabaseAdmin
      .from("symptoms")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", "Good Day")
      .single();

    if (findError || !existingSymptom) {
      // Create the "Good Day" symptom
      const { data: newSymptom, error: createError } = await supabaseAdmin
        .from("symptoms")
        .insert([
          {
            user_id: user.id,
            name: "Good Day",
            icon: "Sun",
            is_default: false,
          },
        ])
        .select()
        .single();

      if (createError || !newSymptom) {
        console.error("Failed to create Good Day symptom:", createError);
        return NextResponse.json(
          { error: "Failed to create good day symptom" },
          { status: 500 }
        );
      }

      goodDaySymptom = newSymptom;
    } else {
      goodDaySymptom = existingSymptom;
    }

    // Create symptom log entry for good day
    const { data, error: insertError } = await supabaseAdmin
      .from("symptom_logs")
      .insert([
        {
          user_id: user.id,
          symptom_id: goodDaySymptom.id,
          severity: rating, // 1=Good, 2=Great, 3=Amazing
          triggers: [],
          notes: null,
        },
      ])
      .select(`
        *,
        symptoms (name, icon)
      `)
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to log good day" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("POST /api/good-days error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

