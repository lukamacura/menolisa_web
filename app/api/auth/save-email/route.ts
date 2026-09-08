import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * POST /api/auth/save-email — the optional "Save your results and plan" field
 * on the results screen.
 *
 * Writes `user_profiles.email` and nothing else. It is deliberately **not**
 * her login address: `auth.users.email` is bound from what she types at
 * Stripe (`resolveCheckoutAccount`), where a collision with an existing
 * account is handled by merging. Binding an unverified address here would
 * pre-empt that — a typo would become the account she cannot log into before
 * she has paid a cent, and a returning customer's address would fail to bind
 * and leave her in a half-state. So this column is a contact detail for the
 * operator (and a future "email me my results" send), no more.
 *
 * Free feature: no payment check. The user id comes from the session, never
 * the body.
 */
const Body = z.object({
  email: z.string().trim().min(3).max(254).email(),
});

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update({ email: parsed.data.email.toLowerCase() })
    .eq("user_id", user.id);

  if (error) {
    console.error("save-email update failed:", error);
    return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
