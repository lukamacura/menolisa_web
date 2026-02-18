import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// GET: Get notification preferences
// Returns only the two toggle settings (notification_enabled and weekly_insights_enabled)
// Note: reminder_time is ignored as notifications are sent at fixed times
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: queryError } = await supabaseAdmin
      .from("user_preferences")
      .select("notification_enabled, weekly_insights_enabled")
      .eq("user_id", user.id)
      .single();

    if (queryError) {
      // If no preferences exist, return defaults
      if (queryError.code === 'PGRST116') {
        return NextResponse.json({
          data: {
            notification_enabled: true,
            weekly_insights_enabled: true,
          }
        });
      }
      console.error("Supabase query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch notification preferences" },
        { status: 500 }
      );
    }

    // Return defaults if no data found
    if (!data) {
      return NextResponse.json({
        data: {
          notification_enabled: true,
          weekly_insights_enabled: true,
        }
      });
    }

    // Return only the two toggle settings
    return NextResponse.json({ 
      data: {
        notification_enabled: data.notification_enabled ?? true,
        weekly_insights_enabled: data.weekly_insights_enabled ?? true,
      }
    });
  } catch (e) {
    console.error("GET /api/notifications/preferences error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: Update notification preferences
// Updates only the two toggle settings (notification_enabled and weekly_insights_enabled)
// Note: reminder_time is ignored as notifications are sent at fixed times
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { notification_enabled, weekly_insights_enabled } = body;

    const supabaseAdmin = getSupabaseAdmin();
    const updateData: Record<string, boolean> = {};

    // Only update the two toggle settings
    if (notification_enabled !== undefined) {
      updateData.notification_enabled = notification_enabled;
    }
    if (weekly_insights_enabled !== undefined) {
      updateData.weekly_insights_enabled = weekly_insights_enabled;
    }

    // Validate that at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // Try to update existing preferences
    const { data, error: updateError } = await supabaseAdmin
      .from("user_preferences")
      .update(updateData)
      .eq("user_id", user.id)
      .select("notification_enabled, weekly_insights_enabled")
      .single();

    if (updateError) {
      console.error("Supabase update error:", updateError);
      
      // If no preferences exist (PGRST116), create them
      if (updateError.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabaseAdmin
          .from("user_preferences")
          .insert([{ 
            user_id: user.id, 
            notification_enabled: notification_enabled ?? true,
            weekly_insights_enabled: weekly_insights_enabled ?? true,
          }])
          .select("notification_enabled, weekly_insights_enabled")
          .single();

        if (insertError) {
          console.error("Supabase insert error:", insertError);
          return NextResponse.json(
            { error: "Failed to create notification preferences" },
            { status: 500 }
          );
        }

        return NextResponse.json({ data: newData });
      }

      return NextResponse.json(
        { error: "Failed to update notification preferences" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (e) {
    console.error("PUT /api/notifications/preferences error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

