import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

/**
 * POST /api/symptom-logs/delete
 * Delete one symptom log by id. Body: { id: string } (uuid of the log).
 * Uses service role so RLS does not block. Scoped to authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Send { id: \"<log-uuid>\" }." },
        { status: 400 }
      );
    }

    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { error: "Log ID is required. Send { id: \"<log-uuid>\" } in body." },
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
      console.error("symptom-logs/delete Supabase error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete symptom log" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/symptom-logs/delete error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
