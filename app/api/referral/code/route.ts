import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { randomInt } from "crypto";

export const runtime = "nodejs";

/** Uppercase alphanumeric (no 0/O, 1/I/L) for readable codes */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  }
  return code;
}

/**
 * GET /api/referral/code
 * Returns the current user's referral code, creating one if missing.
 * Auth: cookie (web) or Bearer (mobile).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from("user_profiles")
      .select("referral_code")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError) {
      console.error("Referral code fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      );
    }

    let code = profile?.referral_code ?? null;

    if (!code) {
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        code = generateReferralCode();
        const { error: upsertError } = await supabaseAdmin
          .from("user_profiles")
          .upsert(
            { user_id: user.id, referral_code: code, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );

        if (!upsertError) break;
        if (upsertError.code === "23505") {
          attempts++;
          continue;
        }
        console.error("Referral code upsert error:", upsertError);
        return NextResponse.json(
          { error: "Failed to create referral code" },
          { status: 500 }
        );
      }

      if (attempts >= maxAttempts) {
        return NextResponse.json(
          { error: "Could not generate unique code" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ code: code! });
  } catch (e) {
    console.error("GET /api/referral/code error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
