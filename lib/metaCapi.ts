import crypto from "crypto";
import { META_PIXEL_ID, META_CURRENCY } from "@/lib/metaPixel";

/**
 * Meta Conversions API - server-side conversion reporting.
 *
 * Runs alongside the browser pixel, not instead of it: Safari ITP, ad blockers
 * and users closing the tab before the success redirect cost a large share of
 * browser-only Purchase events, while the Stripe webhook always fires. Both
 * copies carry the same `event_id`, so Meta keeps one.
 */

const GRAPH_VERSION = "v21.0";

/** Meta requires SHA-256 hex of the normalized value for PII fields. */
function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashEmail(email: string): string {
  return hash(email.trim().toLowerCase());
}

export type MetaMatchData = {
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  clientUa?: string;
};

/** Pull the match data stashed on the Checkout Session by create-checkout. */
export function metaMatchDataFrom(
  metadata: Record<string, string> | null | undefined
): MetaMatchData {
  if (!metadata) return {};
  return {
    fbp: metadata.fbp || undefined,
    fbc: metadata.fbc || undefined,
    clientIp: metadata.fb_client_ip || undefined,
    clientUa: metadata.fb_client_ua || undefined,
  };
}

export type SendMetaPurchaseParams = MetaMatchData & {
  /** Must equal the browser event's eventID - see purchaseEventId(). */
  eventId: string;
  eventTimeSec: number;
  value: number;
  currency?: string;
  email?: string | null;
  userId?: string | null;
  planType?: string | null;
  eventSourceUrl?: string | null;
};

/**
 * Sends a Purchase to the Conversions API. Never throws and never rejects: a
 * Meta outage must not fail the Stripe webhook, or Stripe retries the event and
 * the user receives duplicate welcome emails.
 */
export async function sendMetaPurchase(params: SendMetaPurchaseParams): Promise<void> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn("Meta CAPI: META_CAPI_ACCESS_TOKEN not set, skipping Purchase");
    return;
  }

  const {
    eventId,
    eventTimeSec,
    value,
    currency = META_CURRENCY,
    email,
    userId,
    planType,
    eventSourceUrl,
    fbp,
    fbc,
    clientIp,
    clientUa,
  } = params;

  // fbp/fbc/IP/UA are sent raw - hashing them breaks matching. Only PII is hashed.
  const userData: Record<string, unknown> = {};
  if (email) userData.em = [hashEmail(email)];
  if (userId) userData.external_id = [hash(userId)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUa) userData.client_user_agent = clientUa;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTimeSec,
        event_id: eventId,
        action_source: "website",
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data: userData,
        custom_data: {
          currency,
          value,
          content_type: "product",
          num_items: 1,
          ...(planType ? { content_name: planType } : {}),
        },
      },
    ],
  };
  if (process.env.META_CAPI_TEST_EVENT_CODE) {
    payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Meta CAPI Purchase failed (${res.status}):`, body.slice(0, 500));
      return;
    }
    console.log(`Meta CAPI Purchase sent: ${eventId} (${currency} ${value})`);
  } catch (err) {
    console.error("Meta CAPI Purchase request error:", err);
  }
}
