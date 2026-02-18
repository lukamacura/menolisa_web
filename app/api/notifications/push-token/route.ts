import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// PUT: Register or update Expo push token for the current user
export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid token" },
        { status: 400 }
      );
    }

    const platform =
      req.headers.get("X-Platform") === "android" ||
      req.headers.get("X-Platform") === "ios"
        ? req.headers.get("X-Platform")
        : null;

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("user_push_tokens")
      .upsert(
        {
          user_id: user.id,
          token: token.trim(),
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,token" }
      );

    if (error) {
      console.error("Push token upsert error:", error);
      return NextResponse.json(
        { error: "Failed to register push token" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/notifications/push-token error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
