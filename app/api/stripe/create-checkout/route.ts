import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_ID, isPlanId } from "@/lib/pricing";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.NEXT_PUBLIC_SITE_URL) origins.push(process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""));
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  origins.push("https://menolisa.com", "https://www.menolisa.com");
  origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  return [...new Set(origins)];
}

function getBaseUrl(originFromRequest?: string | null): string {
  if (originFromRequest) {
    const allowed = getAllowedOrigins();
    const normalized = originFromRequest.replace(/\/$/, "");
    if (allowed.includes(normalized)) return normalized;
  }
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
    const fromRegistration = body?.from_registration === true;
    const returnOrigin = (body?.return_origin as string | undefined) || req.headers.get("origin") || req.headers.get("referer");
    // One plan, one price. The retired `monthly`/`annual` values are rejected
    // rather than aliased, so a stale client fails loudly instead of quietly
    // buying something at a price its own UI never showed.
    if (!isPlanId(plan)) {
      return NextResponse.json(
        { error: `Invalid plan. Use '${PLAN_ID}'.` },
        { status: 400 }
      );
    }

    const priceId = process.env.STRIPE_PRICE_8WEEK;
    if (!priceId) {
      console.error("Missing STRIPE_PRICE_8WEEK env var");
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

    // Block double-subscribe.
    //
    // Two shapes of the same mistake, and the funnel makes both reachable: it
    // asks for no email, so nothing before the card recognises a returning
    // customer, and a retargeting ad puts her back at the paywall as readily as
    // it puts a stranger there.
    {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: existing } = await supabaseAdmin
        .from("user_trials")
        .select("provider, account_status, subscription_ends_at")
        .eq("user_id", user.id)
        .maybeSingle();

      // (1) This account is already paid up with Stripe. Previously only a
      // *foreign* provider was blocked, so a customer who clicked a retargeting
      // ad in the browser she bought in walked back through the funnel and was
      // sold a second $59 subscription against the same account. Refusing here
      // costs nothing — she has access; the client sends her to the dashboard.
      const endsMs = existing?.subscription_ends_at
        ? new Date(existing.subscription_ends_at).getTime()
        : 0;
      if (
        existing?.account_status === "paid" &&
        endsMs > Date.now() &&
        (!existing.provider || existing.provider === "stripe")
      ) {
        return NextResponse.json(
          {
            error: "already_subscribed",
            provider: "stripe",
            message: "You already have an active subscription.",
          },
          { status: 409 }
        );
      }

      // (2) An active subscription managed by someone else (Apple IAP).
      if (existing?.provider && existing.provider !== "stripe") {
        // A missing period end counts as active here, unlike in (1): an IAP row
        // we can't date is still someone else's live subscription, and selling
        // a second one on top is worse than making her tap through to Apple.
        const stillActive =
          existing.account_status === "paid" && (!endsMs || endsMs > Date.now());
        if (stillActive) {
          const manageUrl =
            existing.provider === "apple"
              ? "https://apps.apple.com/account/subscriptions"
              : null;
          return NextResponse.json(
            {
              error: "already_subscribed",
              provider: existing.provider,
              ...(manageUrl && { manageUrl }),
              message:
                existing.provider === "apple"
                  ? "You already have an active subscription managed by Apple. Manage it in your Apple ID settings."
                  : "You already have an active subscription.",
            },
            { status: 409 }
          );
        }
      }
    }

    // session_id + plan let the success page fire the browser-side Meta Purchase
    // with the right value and the event_id that dedupes it against the
    // Conversions API copy sent from the Stripe webhook.
    const defaultSuccess = fromRegistration
      ? `${baseUrl}/register?phase=download&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`
      : `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`;
    const defaultCancel = fromRegistration
      ? `${baseUrl}/register?phase=paywall`
      : `${baseUrl}/dashboard`;

    // The Stripe webhook is server-to-server, so the user's Meta cookies, IP and
    // user-agent are unreachable there. Snapshot them here - the last moment her
    // browser talks to us - so the Conversions API can match the conversion back
    // to the ad click. Absent for mobile-app checkouts; CAPI still matches on
    // hashed email + external_id.
    const metaMetadata: Record<string, string> = {};
    const fbp = req.cookies.get("_fbp")?.value;
    const fbc = req.cookies.get("_fbc")?.value;
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    // Stripe caps metadata values at 500 chars.
    const clientUa = req.headers.get("user-agent")?.slice(0, 500);
    if (fbp) metaMetadata.fbp = fbp;
    if (fbc) metaMetadata.fbc = fbc;
    if (clientIp) metaMetadata.fb_client_ip = clientIp;
    if (clientUa) metaMetadata.fb_client_ua = clientUa;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      payment_method_collection: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: useMobileReturns ? customSuccess : defaultSuccess,
      cancel_url: useMobileReturns ? customCancel : defaultCancel,
      client_reference_id: user.id,
      // Omitted for a /register visitor: she is signed in anonymously and has no
      // email yet, so Stripe collects one on its own page — and the webhook
      // stamps it onto this user id. Prefilled for everyone else (mobile app,
      // lapsed dashboard user) so they don't retype what we already know.
      //
      // An anonymous user's email is the empty STRING, not null, so `?? undefined`
      // is not enough — Stripe rejects `customer_email: ""` outright with
      // "Invalid email address" and the whole checkout 500s.
      customer_email: user.email?.trim() ? user.email : undefined,
      metadata: { user_id: user.id, plan, ...metaMetadata },
      // No trial: the card is charged the full price at checkout and the
      // subscription renews every 8 weeks off the price's own interval.
      subscription_data: {
        metadata: { user_id: user.id },
      },
    };
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
