import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { sendMetaViewContent } from "@/lib/metaCapi";
import { META_CURRENCY, PLAN_VALUE, viewContentEventId } from "@/lib/metaPixel";

export const runtime = "nodejs";

/** The only two paywalls that exist. Anything else is ignored, not reported. */
const SOURCES = new Set(["register", "dashboard"]);

/**
 * Server-side `ViewContent` - the Conversions API copy of the event
 * `<PaywallView />` fires from the browser as it mounts.
 *
 * ## Why this route exists at all
 *
 * It is the only Meta event in the app that needed a request invented for it.
 * `Lead` rides `save-quiz`, `InitiateCheckout` rides `create-checkout`,
 * `Purchase` rides the Stripe webhook; reaching the paywall in the funnel is
 * `setPhase("paywall")` on a click handler and talks to no server. So the one
 * mid-funnel step was browser-only, which meant it disappeared entirely for
 * ad-blocked and ITP-restricted visitors while the events either side of it
 * still arrived. See `sendMetaViewContent`.
 *
 * ## Why it takes no request body
 *
 * Every field of the event is derived here: the name is a literal, the value is
 * `PLAN_VALUE`, the `event_id` comes from her user id, and the match data comes
 * off the request's own cookies and headers. The one thing a caller may say is
 * *which* paywall, and that is checked against a two-item allowlist.
 *
 * That is deliberate. A beacon that accepted an event name, a value or an
 * event_id would be an open endpoint for writing arbitrary conversions into the
 * dataset - inflating a campaign is the cheap version, and poisoning the
 * optimization signal we buy media against is the expensive one. There is
 * nothing here to forge: the worst an authenticated caller can do is re-report
 * her own ViewContent, and every copy carries one id, so Meta keeps one.
 *
 * ## Match data
 *
 * `_fbp`/`_fbc`, IP and user-agent are readable because this runs inside her
 * browser's own request - the same reason `save-quiz` can send them and the
 * Stripe webhook cannot. On `/paywall` she is a lapsed customer with a real
 * email too, so that copy matches better than the browser's ever could.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mobile is excluded for the same reason it is excluded from `Lead` and
  // `Purchase`: a checkout begun in the Expo app is not a web ad conversion,
  // and reporting it as one teaches delivery to buy traffic it never sent.
  // Bearer auth is the clean signal - a funnel visitor authenticates by cookie.
  if (request.headers.get("authorization")?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: true, skipped: "mobile" });
  }

  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source");
  const source = sourceParam && SOURCES.has(sourceParam) ? sourceParam : null;

  // Awaited rather than deferred: this route has nothing else to do, the client
  // fires it with `keepalive` and ignores the response, and awaiting is the one
  // thing that guarantees the serverless invocation is not frozen mid-flight.
  // `sendMetaViewContent` never throws.
  await sendMetaViewContent({
    eventId: viewContentEventId(user.id),
    eventTimeSec: Math.floor(Date.now() / 1000),
    value: PLAN_VALUE,
    currency: META_CURRENCY,
    userId: user.id,
    email: user.email?.trim() ? user.email : null,
    source,
    fbp: request.cookies.get("_fbp")?.value,
    fbc: request.cookies.get("_fbc")?.value,
    clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    clientUa: request.headers.get("user-agent") ?? undefined,
    eventSourceUrl: request.headers.get("referer"),
  });

  return NextResponse.json({ ok: true });
}
