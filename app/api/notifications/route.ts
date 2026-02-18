/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { sendPushNotification } from "@/lib/sendPushNotification";

export const runtime = "nodejs";

// GET: Fetch user's notifications
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;
    const unseenOnly = searchParams.get("unseen") === "true";
    const notDismissed = searchParams.get("not_dismissed") !== "false"; // Default true
    const includeDismissed = searchParams.get("include_dismissed") === "true";
    const includeRead = searchParams.get("include_read") !== "false"; // Default true

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (unseenOnly) {
      query = query.eq("seen", false);
    } else if (!includeRead) {
      query = query.eq("seen", false);
    }

    if (!includeDismissed && notDismissed) {
      query = query.eq("dismissed", false);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error: queryError } = await query;

    if (queryError) {
      console.error("Supabase query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error("GET /api/notifications error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create a new notification
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
    const {
      type,
      title,
      message,
      priority = "medium",
      autoDismiss = false,
      autoDismissSeconds,
      showOnce = false,
      showOnPages = [],
      metadata = {},
    } = body;

    // Extract action metadata (functions can't be stored, so we store metadata like route paths)
    const actionMetadata: any = {};
    if (metadata.primaryAction) {
      actionMetadata.primaryAction = {
        label: metadata.primaryAction.label,
        // Store route or action type instead of function
        route: metadata.primaryAction.route || null,
        actionType: metadata.primaryAction.actionType || null,
      };
    }
    if (metadata.secondaryAction) {
      actionMetadata.secondaryAction = {
        label: metadata.secondaryAction.label,
        route: metadata.secondaryAction.route || null,
        actionType: metadata.secondaryAction.actionType || null,
      };
    }
    if (metadata.icon) {
      actionMetadata.icon = metadata.icon;
    }

    // Validation - message is optional, will default to empty string
    if (!type || !title) {
      return NextResponse.json(
        { error: "Type and title are required" },
        { status: 400 }
      );
    }
    
    // Ensure message is a string (default to empty if not provided)
    const finalMessage = message || "";

    const validTypes = [
      "lisa_insight",
      "lisa_message",
      "achievement",
      "reminder",
      "trial",
      "welcome",
      "success",
      "error",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid notification type" },
        { status: 400 }
      );
    }

    const validPriorities = ["high", "medium", "low"];
    if (!validPriorities.includes(priority)) {
      return NextResponse.json(
        { error: "Invalid priority" },
        { status: 400 }
      );
    }

    // Check if show-once notification already exists
    if (showOnce) {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", type)
        .eq("title", title)
        .eq("show_once", true)
        .limit(1)
        .single();

      if (existing) {
        // Notification already exists, return existing ID
        return NextResponse.json({ data: existing }, { status: 200 });
      }
    }

    // Special handling for "Tough Day Support" - prevent duplicates for the same day
    if (type === "lisa_message" && title === "Tough Day Support") {
      const supabaseAdmin = getSupabaseAdmin();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", type)
        .eq("title", title)
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString())
        .eq("dismissed", false)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Notification already exists for today, return existing ID
        return NextResponse.json({ data: existing }, { status: 200 });
      }
    }

    // Daily symptom-logging reminder: only one "Time to check in" per user per day (avoids duplicate toasts/cron re-runs)
    if (type === "reminder" && title === "Time to check in") {
      const supabaseAdmin = getSupabaseAdmin();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data: existingReminder } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "reminder")
        .eq("title", "Time to check in")
        .gte("created_at", today.toISOString())
        .lt("created_at", tomorrow.toISOString())
        .limit(1)
        .maybeSingle();

      if (existingReminder) {
        return NextResponse.json({ data: existingReminder }, { status: 200 });
      }
    }

    // Insert notification
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: insertError } = await supabaseAdmin
      .from("notifications")
      .insert([
        {
          user_id: user.id,
          type,
          title,
          message: finalMessage,
          priority,
          auto_dismiss: autoDismiss,
          auto_dismiss_seconds: autoDismissSeconds,
          show_once: showOnce,
          show_on_pages: showOnPages,
          metadata: actionMetadata,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create notification" },
        { status: 500 }
      );
    }

    // Push: same title/body as in-app; trial/urgent bypass preference
    const isTrialOrUrgent = type === "trial" || priority === "high";
    sendPushNotification({
      userId: user.id,
      title,
      body: finalMessage,
      skipPreferenceCheck: isTrialOrUrgent,
      ...(type === "trial" ? { data: { action: "upgrade" } } : {}),
    }).catch(() => {});

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("POST /api/notifications error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT: Update notification (mark as seen, dismissed, etc.)
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id, seen, dismissed, markAllRead } = body;

    // Handle mark all as read
    if (markAllRead === true) {
      const supabaseAdmin = getSupabaseAdmin();
      const { error: updateError } = await supabaseAdmin
        .from("notifications")
        .update({ seen: true })
        .eq("user_id", user.id)
        .eq("seen", false)
        .eq("dismissed", false);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        return NextResponse.json(
          { error: "Failed to mark all as read" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (!id) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const updateData: any = {};

    if (seen !== undefined) {
      updateData.seen = seen;
    }

    if (dismissed !== undefined) {
      updateData.dismissed = dismissed;
      if (dismissed) {
        updateData.dismissed_at = new Date().toISOString();
      }
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("notifications")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update notification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (e) {
    console.error("PUT /api/notifications error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a notification
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Notification ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error: deleteError } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Supabase delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete notification" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/notifications error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

