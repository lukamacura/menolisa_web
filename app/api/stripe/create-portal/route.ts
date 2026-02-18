import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.NEXT_PUBLIC_APP_URL) origins.push(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
  if (process.env.NEXT_PUBLIC_SITE_URL) origins.push(process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""));
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  origins.push("https://menolisa.com", "https://www.menolisa.com");
  origins.push("https://womenreset.com", "https://www.womenreset.com");
  origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  return [...new Set(origins)];
}

function getBaseUrl(originFromRequest?: string | null): string {
  if (originFromRequest) {
    const allowed = getAllowedOrigins();
    const normalized = originFromRequest.replace(/\/$/, "");
    if (allowed.includes(normalized)) return normalized;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

const MOBILE_APP_SCHEME = "menolisa";

/** Allow mobile deep link for portal return (e.g. menolisa://settings). */
function validateReturnUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith(`${MOBILE_APP_SCHEME}://`)) return trimmed;
  try {
    const u = new URL(trimmed);
    const allowed = getAllowedOrigins();
    if (allowed.includes(u.origin)) return trimmed;
  } catch {
    // ignore
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const customReturnUrl = validateReturnUrl(body?.return_url);

    const returnOrigin = req.headers.get("origin") || req.headers.get("referer");
    const baseUrl = getBaseUrl(
      typeof returnOrigin === "string" && returnOrigin.startsWith("http")
        ? new URL(returnOrigin).origin
        : returnOrigin
    );

    const supabaseAdmin = getSupabaseAdmin();
    const { data: row, error: fetchError } = await supabaseAdmin
      .from("user_trials")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !row?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No subscription found. You can upgrade from the dashboard." },
        { status: 400 }
      );
    }

    const portalReturnUrl = customReturnUrl ?? `${baseUrl}/dashboard`;

    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: portalReturnUrl,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create portal session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe create-portal error:", err);
    return NextResponse.json(
      { error: "Failed to open subscription management." },
      { status: 500 }
    );
  }
}
