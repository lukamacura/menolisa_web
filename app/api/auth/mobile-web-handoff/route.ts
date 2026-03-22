import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { signMobileWebHandoffPayload } from "@/lib/mobileWebHandoffJwt";

const bodySchema = z.object({
  refresh_token: z.string().min(1),
});

/**
 * Mobile-only: exchange a valid Bearer session + refresh_token for a short-lived handoff JWT.
 * The app opens /auth/mobile-bridge#<token>; the browser completes sign-in via POST .../complete.
 *
 * Requires env MOBILE_WEB_HANDOFF_SECRET (strong random string, server-only).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MOBILE_WEB_HANDOFF_SECRET;
  if (!secret || secret.length < 16) {
    console.error("mobile-web-handoff: MOBILE_WEB_HANDOFF_SECRET missing or too short");
    return NextResponse.json({ error: "Handoff not configured" }, { status: 503 });
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "refresh_token is required" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabaseAnon = createClient(url, anonKey);

  const { data: refreshed, error: refreshError } = await supabaseAnon.auth.refreshSession({
    refresh_token: body.refresh_token,
  });

  if (refreshError || !refreshed.user || refreshed.user.id !== user.id) {
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 180;
  const token = signMobileWebHandoffPayload(
    { uid: user.id, rt: body.refresh_token, exp, iat: now },
    secret
  );

  return NextResponse.json({ token });
}
