/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { DEFAULT_SYMPTOMS } from "@/lib/symptom-tracker-constants";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// GET: Fetch user's symptom definitions
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: queryError } = await supabaseAdmin
      .from("symptoms")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (queryError) {
      console.error("Supabase query error:", queryError);
      return NextResponse.json(
        { error: "Failed to fetch symptoms" },
        { status: 500 }
      );
    }

    // If user has no symptoms, seed default symptoms
    if (!data || data.length === 0) {
      const defaultSymptomsToInsert = DEFAULT_SYMPTOMS.map((symptom) => ({
        user_id: user.id,
        name: symptom.name,
        icon: symptom.icon,
        is_default: true,
      }));

      const { data: insertedData, error: insertError } = await supabaseAdmin
        .from("symptoms")
        .insert(defaultSymptomsToInsert)
        .select();

      if (insertError) {
        console.error("Failed to seed default symptoms:", insertError);
        // Return empty array instead of failing - user can still add custom symptoms
        return NextResponse.json(
          { data: [] },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            },
          }
        );
      }

      return NextResponse.json(
        { data: insertedData || [] },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
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
    console.error("GET /api/symptoms error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST: Create custom symptom (optional - users can add their own)
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
    const { name, icon } = body;

    // Validation
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Symptom name is required" },
        { status: 400 }
      );
    }

    // Insert custom symptom (not default)
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error: insertError } = await supabaseAdmin
      .from("symptoms")
      .insert([
        {
          user_id: user.id,
          name: name.trim(),
          icon: icon?.trim() || "🔴",
          is_default: false,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create symptom" },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    console.error("POST /api/symptoms error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a custom symptom (cannot delete default symptoms)
export async function DELETE(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Symptom ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    
    // First, check if the symptom exists and is not a default symptom
    const { data: symptom, error: fetchError } = await supabaseAdmin
      .from("symptoms")
      .select("id, is_default, user_id")
      .eq("id", id)
      .single();

    if (fetchError || !symptom) {
      return NextResponse.json(
        { error: "Symptom not found" },
        { status: 404 }
      );
    }

    // Verify the symptom belongs to the user
    if (symptom.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Prevent deletion of default symptoms
    if (symptom.is_default) {
      return NextResponse.json(
        { error: "Cannot delete default symptoms" },
        { status: 400 }
      );
    }

    // Delete the symptom
    const { error: deleteError } = await supabaseAdmin
      .from("symptoms")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Supabase delete error:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete symptom" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/symptoms error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}