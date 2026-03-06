/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { updateStreakOnNewLog } from "@/lib/streakCalculator";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// GET: Fetch symptom logs with symptom details
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = searchParams.get("days");
    const daysNum = days ? parseInt(days, 10) : 30;

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: queryError } = await supabaseAdmin
      .from("symptom_logs")
      .select(`
        *,
        symptoms (name, icon)
      `)
      .eq("user_id", user.id)
      .gte("logged_at", startDate.toISOString())
      .order("logged_at", { ascending: false });

    if (queryError) {
      console.error("Supabase query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch symptom logs" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: data || [] },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (e) {
    console.error("GET /api/symptom-logs error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create new symptom log entry
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
    const { symptomId, severity, triggers, notes, loggedAt } = body;

    // Validation
    if (!symptomId || typeof symptomId !== "string") {
      return NextResponse.json(
        { error: "Symptom ID is required" },
        { status: 400 }
      );
    }

    if (
      typeof severity !== "number" ||
      severity < 1 ||
      severity > 3 ||
      !Number.isInteger(severity)
    ) {
      return NextResponse.json(
        { error: "Severity must be an integer between 1 and 3" },
        { status: 400 }
      );
    }

    // Validate triggers array
    if (triggers !== undefined && !Array.isArray(triggers)) {
      return NextResponse.json(
        { error: "Triggers must be an array" },
        { status: 400 }
      );
    }

    // Insert symptom log
    const supabaseAdmin = getSupabaseAdmin();
    const insertData: any = {
      user_id: user.id,
      symptom_id: symptomId,
      severity,
      triggers: triggers || [],
      notes: notes?.trim() || null,
    };
    
    // If loggedAt is provided, use it; otherwise let database default to NOW()
    if (loggedAt) {
      insertData.logged_at = loggedAt;
    }
    
    const { data, error: insertError } = await supabaseAdmin
      .from("symptom_logs")
      .insert([insertData])
      .select(`
        *,
        symptoms (name, icon)
      `)
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save symptom log" },
        { status: 500 }
      );
    }

    // Update streak in user_preferences
    try {
      // Get current user preferences
      const { data: preferences, error: prefError } = await supabaseAdmin
        .from("user_preferences")
        .select("current_streak, longest_streak, last_log_date, total_logs")
        .eq("user_id", user.id)
        .single();

      if (!prefError && preferences) {
        const logDate = new Date(insertData.logged_at || new Date());
        const lastLogDate = preferences.last_log_date ? new Date(preferences.last_log_date) : null;

        const updatedStreak = updateStreakOnNewLog(
          {
            currentStreak: preferences.current_streak || 0,
            longestStreak: preferences.longest_streak || 0,
            lastLogDate: lastLogDate,
            totalLogs: preferences.total_logs || 0,
            totalGoodDays: 0, // Good days tracked separately
          },
          logDate
        );

        // Update user preferences with new streak data
        await supabaseAdmin
          .from("user_preferences")
          .update({
            current_streak: updatedStreak.currentStreak,
            longest_streak: updatedStreak.longestStreak,
            last_log_date: updatedStreak.lastLogDate?.toISOString().split('T')[0] || null,
            total_logs: updatedStreak.totalLogs,
          })
          .eq("user_id", user.id);
      } else {
        // Create user preferences if they don't exist
        const logDate = new Date(insertData.logged_at || new Date());
        await supabaseAdmin
          .from("user_preferences")
          .upsert({
            user_id: user.id,
            current_streak: 1,
            longest_streak: 1,
            last_log_date: logDate.toISOString().split('T')[0],
            total_logs: 1,
          });
      }
    } catch (streakError) {
      // Log error but don't fail the request
      console.error("Error updating streak:", streakError);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("POST /api/symptom-logs error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: Update existing symptom log
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, severity, triggers, notes, loggedAt } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Log ID is required" },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};
    if (severity !== undefined) {
      if (
        typeof severity !== "number" ||
        severity < 1 ||
        severity > 3 ||
        !Number.isInteger(severity)
      ) {
        return NextResponse.json(
          { error: "Severity must be an integer between 1 and 3" },
          { status: 400 }
        );
      }
      updateData.severity = severity;
    }
    if (triggers !== undefined) {
      if (!Array.isArray(triggers)) {
        return NextResponse.json(
          { error: "Triggers must be an array" },
          { status: 400 }
        );
      }
      updateData.triggers = triggers;
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }
    if (loggedAt !== undefined) {
      if (typeof loggedAt !== "string" || !loggedAt.trim()) {
        return NextResponse.json(
          { error: "loggedAt must be a non-empty ISO date string" },
          { status: 400 }
        );
      }
      const parsed = new Date(loggedAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid loggedAt date" },
          { status: 400 }
        );
      }
      updateData.logged_at = parsed.toISOString();
    }

    // Update symptom log
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: updateError } = await supabaseAdmin
      .from("symptom_logs")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(`
        *,
        symptoms (name, icon)
      `)
      .single();

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update symptom log" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Symptom log not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (e) {
    console.error("PUT /api/symptom-logs error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete one symptom log. Id must be in query: DELETE /api/symptom-logs?id=<uuid>
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        { error: "Log ID is required. Use ?id=<log-uuid>." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error: deleteError } = await supabaseAdmin
      .from("symptom_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Supabase delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete symptom log" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE /api/symptom-logs error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

