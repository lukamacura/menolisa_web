import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const REVIEWER_EMAILS = new Set<string>([
  "luka.xzy@gmail.com",
]);

export async function POST(req: NextRequest) {
  let email = "";
  try {
    const body = await req.json();
    email = (body?.email || "").toLowerCase().trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!email || !REVIEWER_EMAILS.has(email)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("reviewer-login generateLink error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate token" },
      { status: 500 }
    );
  }

  return NextResponse.json({ token_hash: tokenHash });
}
