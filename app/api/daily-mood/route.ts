/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import {
  addDaysToIsoDate,
  computeMoodStreakFromDates,
  normalizeMoodDate,
} from "@/lib/moodStreak";

export const runtime = "nodejs";

async function fetchMoodStreakForUser(
  userId: string,
  endDate: string,
): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const minDate = addDaysToIsoDate(normalizeMoodDate(endDate), -400);
  const { data, error } = await supabaseAdmin
    .from("daily_mood")
    .select("date")
    .eq("user_id", userId)
    .gte("date", minDate)
    .lte("date", normalizeMoodDate(endDate));

  if (error) {
    console.error("[daily-mood] streak query error:", error);
    return 0;
  }

  const dates = (data ?? []).map((r: { date: string }) =>
    normalizeMoodDate(String(r.date)),
  );
  return computeMoodStreakFromDates(dates, endDate);
}

// GET: Fetch mood for a specific date (defaults to today) or date range
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const supabaseAdmin = getSupabaseAdmin();

    // If date range is provided, fetch range
    if (startDate && endDate) {
      const { data, error: queryError } = await supabaseAdmin
        .from("daily_mood")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (queryError) {
        console.error("Supabase query error:", queryError);
        return NextResponse.json(
          { error: "Failed to fetch daily moods" },
          { status: 500 }
        );
      }

      return NextResponse.json({ data: data || [] });
    }

    // Otherwise, fetch single date (defaults to today)
    const targetDate = dateParam 
      ? new Date(dateParam).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { data, error: queryError } = await supabaseAdmin
      .from("daily_mood")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", targetDate)
      .single();

    if (queryError && queryError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error("Supabase query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch daily mood" },
        { status: 500 }
      );
    }

    const current_streak = await fetchMoodStreakForUser(user.id, targetDate);

    return NextResponse.json({
      data: data ? { ...data, current_streak } : null,
      current_streak,
    });
  } catch (e) {
    console.error("GET /api/daily-mood error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Set/update mood for a date (upsert)
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
    const { mood, date } = body;

    // Validation
    if (typeof mood !== "number" || mood < 1 || mood > 4 || !Number.isInteger(mood)) {
      return NextResponse.json(
        { error: "Mood must be an integer between 1 and 4" },
        { status: 400 }
      );
    }

    // Use provided date or default to today
    const targetDate = date 
      ? new Date(date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const supabaseAdmin = getSupabaseAdmin();
    
    // Upsert: insert or update
    const { data, error: upsertError } = await supabaseAdmin
      .from("daily_mood")
      .upsert(
        {
          user_id: user.id,
          date: targetDate,
          mood: mood,
        },
        {
          onConflict: "user_id,date",
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError);
      return NextResponse.json(
        { error: "Failed to save daily mood" },
        { status: 500 }
      );
    }

    const current_streak = await fetchMoodStreakForUser(user.id, targetDate);

    return NextResponse.json(
      { data: data ? { ...data, current_streak } : null, current_streak },
      { status: 201 },
    );
  } catch (e) {
    console.error("POST /api/daily-mood error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
