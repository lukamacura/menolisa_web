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

/** Allowed app scheme for mobile deep links (must be exact). */
const MOBILE_APP_SCHEME = "menolisa";

/**
 * Validates that a URL is either (1) an allowed web origin path, or (2) the mobile app deep link.
 * Returns the URL if valid, otherwise null.
 */
function validateReturnUrl(url: unknown, kind: "success" | "cancel"): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const trimmed = url.trim();
  // Allow mobile deep link: menolisa://checkout/success or menolisa://checkout/cancel
  if (trimmed === `${MOBILE_APP_SCHEME}://checkout/${kind}`) return trimmed;
  if (trimmed.startsWith(`${MOBILE_APP_SCHEME}://checkout/${kind}?`)) return trimmed;
  // Allow same-origin web paths
  try {
    const u = new URL(trimmed);
    const allowed = getAllowedOrigins();
    if (allowed.includes(u.origin)) return trimmed;
  } catch {
    // not a valid URL
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const plan = body?.plan as string | undefined;
    const returnOrigin = (body?.return_origin as string | undefined) || req.headers.get("origin") || req.headers.get("referer");
    if (plan !== "monthly" && plan !== "annual") {
      return NextResponse.json(
        { error: "Invalid plan. Use 'monthly' or 'annual'." },
        { status: 400 }
      );
    }

    const priceId =
      plan === "annual"
        ? process.env.STRIPE_PRICE_ANNUAL
        : process.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      const missing = plan === "annual" ? "STRIPE_PRICE_ANNUAL" : "STRIPE_PRICE_MONTHLY";
      console.error(`Missing ${missing} env var`);
      return NextResponse.json(
        { error: "Checkout is not configured for this plan." },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl(
      typeof returnOrigin === "string" && returnOrigin.startsWith("http")
        ? new URL(returnOrigin).origin
        : returnOrigin
    );
    const customSuccess = validateReturnUrl(body?.success_url, "success");
    const customCancel = validateReturnUrl(body?.cancel_url, "cancel");
    const useMobileReturns =
      customSuccess && customCancel;

    let referralCouponId: string | null = null;
    const couponId = process.env.STRIPE_REFERRAL_COUPON_ID;
    if (couponId) {
      const supabaseAdmin = getSupabaseAdmin();
      const [refRes, trialRes] = await Promise.all([
        supabaseAdmin.from("referrals").select("id").eq("referrer_id", user.id).limit(1),
        supabaseAdmin
          .from("user_trials")
          .select("referral_discount_used_at, account_status")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      const hasReferred = (refRes.data?.length ?? 0) > 0;
      const discountNotUsed = trialRes.data?.referral_discount_used_at == null;
      const notPaid = trialRes.data?.account_status !== "paid";
      if (hasReferred && discountNotUsed && notPaid) {
        referralCouponId = couponId;
      }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: useMobileReturns ? customSuccess : `${baseUrl}/checkout/success`,
      cancel_url: useMobileReturns ? customCancel : `${baseUrl}/dashboard`,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      subscription_data: {
        metadata: { user_id: user.id },
      },
    };
    if (referralCouponId) {
      sessionParams.discounts = [{ coupon: referralCouponId }];
    }
    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe create-checkout error:", err);
    return NextResponse.json(
      { error: "Failed to start checkout." },
      { status: 500 }
    );
  }
}
