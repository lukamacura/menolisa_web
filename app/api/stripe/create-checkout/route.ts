import { NextRequest, NextResponse, after } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  OFFER_VARIANT_PAID,
  OFFER_VARIANT_TRIAL,
  PLAN_ID,
  TRIAL_DAYS,
  isPlanId,
  type OfferVariant,
} from "@/lib/pricing";
import { sendMetaInitiateCheckout } from "@/lib/metaCapi";
import { GPC_METADATA_KEY, hasGpcOptOut } from "@/lib/privacySignals";
import { META_CURRENCY, PLAN_VALUE, isValidMetaEventId } from "@/lib/metaPixel";

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
    //
    // The same read decides the free trial. One free trial per person: an
    // account that has ever held a subscription (`stripe_subscription_id`,
    // `fulfilled_at`) buys at $59 from day one, and if it has a Stripe customer
    // we ask Stripe too, since a subscription cancelled before this code
    // existed may not have left a local trace. What this cannot see is the
    // returning customer on a *fresh* anonymous account — the funnel collects
    // no email before Stripe, so she is recognised only in the webhook, when
    // the address collides and the subscription is merged onto her old account
    // (`resolveCheckoutAccount`). That woman gets a second free trial. Accepted:
    // the alternative is asking for an email before the card, which is the
    // thing the funnel exists not to do.
    let trialEligible = true;
    {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: existing } = await supabaseAdmin
        .from("user_trials")
        .select(
          "provider, account_status, subscription_ends_at, stripe_subscription_id, stripe_customer_id, fulfilled_at"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (trialEligible && existing) {
        if (existing.stripe_subscription_id || existing.fulfilled_at) {
          trialEligible = false;
        } else if (existing.stripe_customer_id) {
          try {
            const prior = await stripe.subscriptions.list({
              customer: existing.stripe_customer_id,
              status: "all",
              limit: 1,
            });
            if (prior.data.length > 0) trialEligible = false;
          } catch (err) {
            // Fail towards charging: an unknown history is not a first visit.
            console.error("create-checkout: could not read prior subscriptions:", err);
            trialEligible = false;
          }
        }
      }

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
    //
    // One web destination, unconditionally. `/checkout/success` used to be the
    // non-funnel branch, but it sent her to the web dashboard to "open Lisa" -
    // a product surface deleted in 2026-08-14 - and no caller reached it: both
    // web callers pass `from_registration`, and the mobile app passes explicit
    // deep links that win above. It was deleted rather than left as a fallback
    // nothing exercised. `?phase=download` is the funnel's own post-purchase
    // screen and does the same two jobs (mounts MetaPurchaseTracker, calls
    // sync-session if the webhook is late) while pointing her at the app.
    // `offer` tells the landing whether money moved, which decides the copy
    // the download screen shows ("your free trial has started" vs "you're all
    // set"). Stamped from the same variable that sets `trial_period_days`
    // below, so the two cannot disagree.
    const offerVariant: OfferVariant = trialEligible ? OFFER_VARIANT_TRIAL : OFFER_VARIANT_PAID;
    const defaultSuccess = `${baseUrl}/register?phase=download&session_id={CHECKOUT_SESSION_ID}&plan=${plan}&offer=${offerVariant}`;
    // Backing out of Stripe returns her to `/paywall`, not into the funnel. She
    // is coming back from another origin with her React state gone, and
    // `/register` always restarts at question 1 — which would be a fresh quiz as
    // the price of a moment's hesitation. `/paywall` is the same PaywallView on
    // the account she already has, one tap from trying again.
    const defaultCancel = fromRegistration ? `${baseUrl}/paywall` : `${baseUrl}/dashboard`;

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
    // The page she tapped the CTA on. Meta uses event_source_url for domain
    // attribution, and the webhook has no other way to know it.
    const eventSourceUrl = req.headers.get("referer")?.slice(0, 500);
    // Read off the request here, not inside `after()` — the callback runs after
    // the response and must not depend on request-scoped state still being live.
    const clientCountry = req.headers.get("x-vercel-ip-country");
    if (fbp) metaMetadata.fbp = fbp;
    if (fbc) metaMetadata.fbc = fbc;
    if (clientIp) metaMetadata.fb_client_ip = clientIp;
    if (clientUa) metaMetadata.fb_client_ua = clientUa;
    if (eventSourceUrl) metaMetadata.fb_event_source_url = eventSourceUrl;

    // Global Privacy Control (/privacy §6.4). Read here, inside her own request,
    // and written onto the session because the webhook that fires `Purchase` is
    // server-to-server and will never see her headers — the same reason
    // `_fbp`/`_fbc` are stashed above. Without this the opt-out would silently
    // stop three of the four events and let the fourth, the one that matters
    // most, through.
    const gpcOptOut = hasGpcOptOut(req);
    if (gpcOptOut) metaMetadata[GPC_METADATA_KEY] = "1";

    // Which surface started this checkout, recorded for the webhook.
    //
    // A checkout begun in the Expo app is not a web ad conversion, and reporting
    // it as one inflates the campaign's Purchase count with sales no web ad
    // drove - the same feedback loop that moved `Lead` server-side. `save-quiz`
    // already excludes Bearer callers from `Lead`; this is the matching rule for
    // `Purchase`, which had no such guard. The mobile app is the only caller
    // that passes its own deep-link return URLs.
    const checkoutSurface = useMobileReturns ? "mobile" : "web";

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
      metadata: {
        user_id: user.id,
        plan,
        checkout_surface: checkoutSurface,
        offer_variant: offerVariant,
        ...(trialEligible && { trial_days: String(TRIAL_DAYS) }),
        ...metaMetadata,
      },
      subscription_data: {
        // The browser snapshot rides on the subscription too. The trial's
        // `Subscribe` fires off `invoice.payment_succeeded` a week after
        // checkout, and an invoice knows its subscription but not the Checkout
        // Session that started it — so the subscription is the only object
        // that event can reach which still carries her `_fbp`/`_fbc`, IP, UA,
        // GPC answer and surface.
        metadata: {
          user_id: user.id,
          checkout_surface: checkoutSurface,
          offer_variant: offerVariant,
          ...metaMetadata,
        },
        // The free trial. `payment_method_collection: "always"` above is what
        // makes the card mandatory on a $0 session — Stripe would otherwise
        // offer to skip it, and a trial with no card on file just expires.
        // `missing_payment_method: "cancel"` is the belt to that brace: if a
        // card somehow is not attached when the trial ends, the subscription
        // cancels rather than inventing an unpaid invoice.
        //
        // No `consent_collection.terms_of_service` here: Stripe rejects the
        // whole session unless a Terms URL is set in Dashboard → Settings →
        // Public details, and a checkout that 500s on a missing dashboard field
        // is a worse failure than a missing checkbox. Add it once that URL is
        // confirmed set in live mode.
        ...(trialEligible && {
          trial_period_days: TRIAL_DAYS,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        }),
      },
    };
    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session." },
        { status: 500 }
      );
    }

    // Server-side InitiateCheckout, deduped against the browser copy the paywall
    // fired a moment ago on the same event_id. Sent only once the checkout
    // actually exists, so the event means "entered Stripe" rather than "tapped a
    // button that then 500'd".
    //
    // `after()` so Meta never sits between her tap and the redirect - this route
    // is on the critical path to the card form. A missing or malformed id skips
    // the server copy rather than inventing one: an unpaired event_id would
    // double-count her against the browser pixel.
    const metaEventId = body?.meta_event_id;
    if (isValidMetaEventId(metaEventId) && !gpcOptOut) {
      const eventTimeSec = Math.floor(Date.now() / 1000);
      after(async () => {
        // Her first name, hashed as `fn` — the same identity parameter `Lead`
        // already sends, and the only one this funnel has before Stripe collects
        // an email. The lookup is inside `after()` on purpose: this route is on
        // the critical path to the card form, and a match parameter must never
        // add latency between her tap and the redirect. A miss just omits it.
        const { data: profile } = await getSupabaseAdmin()
          .from("user_profiles")
          .select("name")
          .eq("user_id", user.id)
          .maybeSingle();

        await sendMetaInitiateCheckout({
          eventId: metaEventId,
          // Stamped before the response, so the event time is when she actually
          // tapped rather than whenever the deferred work got scheduled.
          eventTimeSec,
          value: PLAN_VALUE,
          currency: META_CURRENCY,
          userId: user.id,
          email: user.email?.trim() ? user.email : null,
          firstName: profile?.name ?? null,
          // Vercel's edge geo header. Not new information next to the IP Meta
          // already has, but a parameter it scores, and it costs a header read.
          country: clientCountry,
          planType: plan,
          fbp,
          fbc,
          clientIp,
          clientUa,
          eventSourceUrl,
        });
      });
    }

    return NextResponse.json({ url: session.url, offer_variant: offerVariant });
  } catch (err) {
    console.error("Stripe create-checkout error:", err);
    return NextResponse.json(
      { error: "Failed to start checkout." },
      { status: 500 }
    );
  }
}
