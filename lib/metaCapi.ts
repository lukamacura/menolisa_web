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

/**
 * fbp/fbc/IP/UA are sent raw - hashing them breaks matching. Only PII is hashed.
 *
 * `external_id` is the Supabase user id, and it is what makes a server-side
 * event matchable at all while the funnel has collected no email: Meta ties a
 * later Purchase carrying the same external_id back to this one.
 */
function buildUserData(
  params: MetaMatchData & { email?: string | null; userId?: string | null }
): Record<string, unknown> {
  const { email, userId, fbp, fbc, clientIp, clientUa } = params;
  const userData: Record<string, unknown> = {};
  if (email) userData.em = [hashEmail(email)];
  if (userId) userData.external_id = [hash(userId)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUa) userData.client_user_agent = clientUa;
  return userData;
}

/**
 * POSTs one event to the Graph API. Never throws and never rejects: a Meta
 * outage must not fail the caller. For the Stripe webhook that would mean
 * Stripe retrying the event and the customer receiving duplicate welcome
 * emails; for save-quiz it would mean a woman who just finished the quiz
 * being shown "we couldn't save your results" because an ad platform was down.
 */
async function postEvent(event: Record<string, unknown>, label: string): Promise<void> {
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    console.warn(`Meta CAPI: META_CAPI_ACCESS_TOKEN not set, skipping ${label}`);
    return;
  }

  const payload: Record<string, unknown> = { data: [event] };
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
      console.error(`Meta CAPI ${label} failed (${res.status}):`, body.slice(0, 500));
      return;
    }
    console.log(`Meta CAPI ${label} sent`);
  } catch (err) {
    console.error(`Meta CAPI ${label} request error:`, err);
  }
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

/** Sends a Purchase to the Conversions API. See `postEvent` - never throws. */
export async function sendMetaPurchase(params: SendMetaPurchaseParams): Promise<void> {
  const { eventId, eventTimeSec, value, currency = META_CURRENCY, planType, eventSourceUrl } =
    params;

  await postEvent(
    {
      event_name: "Purchase",
      event_time: eventTimeSec,
      event_id: eventId,
      action_source: "website",
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data: buildUserData(params),
      custom_data: {
        currency,
        value,
        content_type: "product",
        num_items: 1,
        ...(planType ? { content_name: planType } : {}),
      },
    },
    `Purchase ${eventId} (${currency} ${value})`
  );
}

export type SendMetaLeadParams = MetaMatchData & {
  /** See `leadEventId()` - derived from the user id, so retries collapse. */
  eventId: string;
  eventTimeSec: number;
  userId: string;
  /** Usually absent — a funnel visitor has no email until Stripe collects one. */
  email?: string | null;
  eventSourceUrl?: string | null;
  /** Segment carried on the event so a Lead audience can be split in Meta. */
  symptomCount?: number | null;
  goal?: string | null;
};

/**
 * Sends a Lead to the Conversions API - fired from `/api/auth/save-quiz`, and
 * **only when a `user_profiles` row is newly inserted**.
 *
 * This event is server-side rather than browser-side on purpose. The browser
 * copy deduped in sessionStorage, which means "once per tab": a woman returning
 * through a second ad in a fresh tab reported a second Lead. Repeat clickers
 * therefore inflated the Lead count, which understated cost-per-lead, which
 * taught Meta to buy more repeat clickers - a feedback loop paid for in ad
 * spend. Keyed off the insert instead, one human is one Lead forever, on every
 * device, with no browser storage involved.
 */
export async function sendMetaLead(params: SendMetaLeadParams): Promise<void> {
  const { eventId, eventTimeSec, eventSourceUrl, symptomCount, goal } = params;

  await postEvent(
    {
      event_name: "Lead",
      event_time: eventTimeSec,
      event_id: eventId,
      action_source: "website",
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data: buildUserData(params),
      custom_data: {
        ...(typeof symptomCount === "number" ? { symptom_count: symptomCount } : {}),
        ...(goal ? { goal } : {}),
      },
    },
    `Lead ${eventId}`
  );
}
