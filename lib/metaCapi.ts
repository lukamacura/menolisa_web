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

/**
 * Meta's normalization for `fn`/`ln`: lowercase, letters only.
 *
 * Both sides have to agree byte-for-byte or the hash matches nothing, so this
 * has to mirror what Meta's own SDK does rather than what looks tidy. Digits,
 * punctuation and whitespace go; accented letters stay (`\p{L}` plus combining
 * marks `\p{M}`, after NFKC), because "renée" is a name and "rene" is a
 * different one.
 *
 * Returns null for anything with no letters left in it - "..." or "123" is a
 * woman skipping past the question, and hashing the empty string would send a
 * constant that every such visitor shares. A parameter that matches everyone
 * matches no one.
 */
function normalizeName(value: string): string | null {
  const cleaned = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}]/gu, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** Two-letter ISO country, lowercase - Meta's `country` format. */
function normalizeCountry(value: string): string | null {
  const cleaned = value.trim().toLowerCase();
  return /^[a-z]{2}$/.test(cleaned) ? cleaned : null;
}

/**
 * Meta's normalization for `ph`: digits only, country code included, no `+`.
 *
 * Stripe hands back E.164 (`+15551234567`), so stripping non-digits is the whole
 * job. A number with no country code matches far worse than none at all - Meta
 * cannot tell `5551234567` in the US from the same digits in Germany - so
 * anything shorter than 8 digits is dropped rather than guessed at.
 */
function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** Meta's normalization for `ct`/`st`: lowercase, letters only, no spaces. */
function normalizeCityOrState(value: string): string | null {
  const cleaned = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}]/gu, "");
  return cleaned.length > 0 ? cleaned : null;
}

/** Meta's normalization for `zp`: lowercase, no spaces; US zips to 5 digits. */
function normalizeZip(value: string): string | null {
  const cleaned = value.trim().toLowerCase().replace(/\s/g, "");
  if (!cleaned) return null;
  return /^\d{5}-\d{4}$/.test(cleaned) ? cleaned.slice(0, 5) : cleaned;
}

/**
 * Split Stripe's single `name` field into `fn` / `ln`.
 *
 * Stripe collects one free-text field, so the last whitespace-separated token is
 * the best available guess at a surname. A single-token name sends `fn` only -
 * inventing an `ln` from the same token would hash a wrong value, which matches
 * nobody and is worse than the parameter being absent.
 */
function splitName(value: string): { first: string | null; last: string | null } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export type MetaMatchData = {
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  clientUa?: string;
};

/**
 * Unpack the browser snapshot `create-checkout` stashed on the Checkout Session.
 *
 * The webhook is server-to-server, so her cookies, IP, user-agent and the page
 * she was on are unreachable by the time it runs. This is the only place they
 * survive, and without them a Purchase matches on hashed email alone.
 */
export function metaContextFrom(
  metadata: Record<string, string> | null | undefined
): MetaMatchData & { eventSourceUrl?: string } {
  if (!metadata) return {};
  return {
    fbp: metadata.fbp || undefined,
    fbc: metadata.fbc || undefined,
    clientIp: metadata.fb_client_ip || undefined,
    clientUa: metadata.fb_client_ua || undefined,
    eventSourceUrl: metadata.fb_event_source_url || undefined,
  };
}

/**
 * True when this Checkout Session was started from the Expo app rather than the
 * web funnel. Those purchases are deliberately not reported - see the
 * `checkout_surface` comment in `create-checkout`.
 *
 * Absent metadata means a session created before this field existed, which can
 * only be a web checkout: the mobile app has always sent deep-link return URLs.
 */
export function isMobileCheckout(
  metadata: Record<string, string> | null | undefined
): boolean {
  return metadata?.checkout_surface === "mobile";
}

/** The person fields Meta hashes, as they arrive from a Stripe Checkout Session. */
export type MetaPersonData = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
};

/**
 * Unpack `session.customer_details` into the match parameters Meta scores.
 *
 * Stripe has already collected all of this on its own page - name and country
 * always, phone and address whenever the account or the card requires them - and
 * until now `Purchase` sent none of it. That is the event the whole campaign is
 * optimized against, so it was the one carrying the least identity: `em` plus
 * `external_id` and nothing else a person is actually findable by.
 *
 * Everything here is normalized and hashed downstream in `buildUserData`; a
 * field that normalizes to nothing is dropped rather than sent as the hash of an
 * empty string, which would be a constant every such customer shares.
 */
export function metaPersonFrom(
  details:
    | {
        name?: string | null;
        phone?: string | null;
        address?: {
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string | null;
        } | null;
      }
    | null
    | undefined
): MetaPersonData {
  if (!details) return {};
  const { first, last } = details.name
    ? splitName(details.name)
    : { first: null, last: null };
  return {
    firstName: first,
    lastName: last,
    phone: details.phone ?? null,
    city: details.address?.city ?? null,
    state: details.address?.state ?? null,
    zip: details.address?.postal_code ?? null,
    country: details.address?.country ?? null,
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
  params: MetaMatchData & {
    email?: string | null;
    userId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  }
): Record<string, unknown> {
  const {
    email,
    userId,
    firstName,
    lastName,
    phone,
    city,
    state,
    zip,
    country,
    fbp,
    fbc,
    clientIp,
    clientUa,
  } = params;
  const userData: Record<string, unknown> = {};
  if (email) userData.em = [hashEmail(email)];
  if (userId) userData.external_id = [hash(userId)];
  if (firstName) {
    const fn = normalizeName(firstName);
    if (fn) userData.fn = [hash(fn)];
  }
  if (lastName) {
    const ln = normalizeName(lastName);
    if (ln) userData.ln = [hash(ln)];
  }
  if (phone) {
    const ph = normalizePhone(phone);
    if (ph) userData.ph = [hash(ph)];
  }
  if (city) {
    const ct = normalizeCityOrState(city);
    if (ct) userData.ct = [hash(ct)];
  }
  if (state) {
    const st = normalizeCityOrState(state);
    if (st) userData.st = [hash(st)];
  }
  if (zip) {
    const zp = normalizeZip(zip);
    if (zp) userData.zp = [hash(zp)];
  }
  if (country) {
    const c = normalizeCountry(country);
    if (c) userData.country = [hash(c)];
  }
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

export type SendMetaPurchaseParams = MetaMatchData &
  MetaPersonData & {
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

export type SendMetaInitiateCheckoutParams = MetaMatchData & {
  /** Must equal the browser event's eventID - minted by `newInitiateCheckoutEventId`. */
  eventId: string;
  eventTimeSec: number;
  value: number;
  currency?: string;
  userId: string;
  /** Usually absent on the funnel - she has no email until Stripe collects one. */
  email?: string | null;
  /**
   * Her first name, off the quiz ("What should Lisa call you?"). Hashed as `fn`.
   *
   * The same parameter `Lead` sends, for the same reason: it is the only
   * *identity* signal the funnel has before Stripe collects an email, and
   * without it this event matches on cookies and IP alone. Read from
   * `user_profiles`, so it is correct across tabs and devices. First name only —
   * the quiz never asks for a surname, and a guessed `ln` hashes to a value that
   * matches nobody.
   */
  firstName?: string | null;
  /** Two-letter ISO country, from the edge's geo header. Hashed as `country`. */
  country?: string | null;
  planType?: string | null;
  eventSourceUrl?: string | null;
};

/**
 * Sends an InitiateCheckout to the Conversions API - from
 * `/api/stripe/create-checkout`, the request the browser makes at the moment she
 * taps the CTA.
 *
 * This is the last event before the money, and browser-only reporting loses a
 * large slice of it to ITP and ad blockers. It matters more than the usual
 * mid-funnel event does here: `Purchase` volume on a first campaign is too thin
 * to exit the learning phase, so `InitiateCheckout` is the closest-to-revenue
 * signal delivery can actually be optimized against, and an undercounted one
 * teaches the auction the wrong thing.
 *
 * The browser fires its copy with the same `event_id` in the same interaction,
 * so Meta keeps exactly one. See `postEvent` - never throws.
 */
export async function sendMetaInitiateCheckout(
  params: SendMetaInitiateCheckoutParams
): Promise<void> {
  const { eventId, eventTimeSec, value, currency = META_CURRENCY, planType, eventSourceUrl } =
    params;

  await postEvent(
    {
      event_name: "InitiateCheckout",
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
    `InitiateCheckout ${eventId} (${currency} ${value})`
  );
}

export type SendMetaViewContentParams = MetaMatchData & {
  /** Must equal the browser event's eventID - see `viewContentEventId()`. */
  eventId: string;
  eventTimeSec: number;
  value: number;
  currency?: string;
  userId: string;
  /** Absent on the funnel; present for a lapsed customer on `/paywall`. */
  email?: string | null;
  /**
   * Her first name, off the quiz ("What should Lisa call you?"). Hashed as `fn`.
   *
   * The same parameter `Lead` sends, for the same reason: it is the only
   * *identity* signal the funnel has before Stripe collects an email, and
   * without it this event matches on cookies and IP alone. Read from
   * `user_profiles`, so it is correct across tabs and devices. First name only —
   * the quiz never asks for a surname, and a guessed `ln` hashes to a value that
   * matches nobody.
   */
  firstName?: string | null;
  /** Two-letter ISO country, from the edge's geo header. Hashed as `country`. */
  country?: string | null;
  /** "register" | "dashboard" - which paywall she is looking at. */
  source?: string | null;
  eventSourceUrl?: string | null;
};

/**
 * Sends a ViewContent to the Conversions API - from `/api/paywall-view`, the
 * beacon `<PaywallView />` fires as it mounts.
 *
 * This one needed a request built for it, which is why it was browser-only until
 * now: every other server event rides an HTTP call that was happening anyway
 * (`save-quiz`, `create-checkout`, the Stripe webhook), and reaching the paywall
 * in the funnel is a `setPhase("paywall")` - pure client state, no round trip.
 *
 * It was worth building because of what the funnel looks like to a visitor with
 * an ad blocker or Safari ITP. Lead reached us (server), InitiateCheckout
 * reached us (server), Purchase reached us (server) - and ViewContent, alone,
 * vanished. The one step between "finished the quiz" and "tapped pay" was the
 * only one that went dark, for precisely the cohort the Conversions API exists
 * to recover, which made the paywall-to-checkout rate biased rather than merely
 * noisy. See `postEvent` - never throws.
 */
export async function sendMetaViewContent(
  params: SendMetaViewContentParams
): Promise<void> {
  const { eventId, eventTimeSec, value, currency = META_CURRENCY, source, eventSourceUrl } =
    params;

  await postEvent(
    {
      event_name: "ViewContent",
      event_time: eventTimeSec,
      event_id: eventId,
      action_source: "website",
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data: buildUserData(params),
      custom_data: {
        currency,
        value,
        content_name: "paywall",
        content_type: "product",
        ...(source ? { content_category: source } : {}),
      },
    },
    `ViewContent ${eventId} (${currency} ${value})`
  );
}

export type SendMetaLeadParams = MetaMatchData & {
  /** See `leadEventId()` - derived from the user id, so retries collapse. */
  eventId: string;
  eventTimeSec: number;
  userId: string;
  /** Usually absent — a funnel visitor has no email until Stripe collects one. */
  email?: string | null;
  /**
   * Her first name, off the quiz ("What should Lisa call you?"). Hashed as `fn`.
   *
   * This is the only *identity* parameter the funnel can offer Meta before
   * Stripe, and it is why Lead's match quality was the worst of the five events
   * (4.4/10 against 6.1) while the answer sat three lines away in the same
   * request. It is a first name only — the quiz never asks for a surname, so
   * `ln` is deliberately absent rather than guessed at.
   */
  firstName?: string | null;
  /** Two-letter ISO country, from the edge's geo header. Hashed as `country`. */
  country?: string | null;
  eventSourceUrl?: string | null;
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
 *
 * ## What it can match on, and what it deliberately won't
 *
 * `external_id` + `_fbp`/`_fbc`/IP/UA, plus `fn` and `country` (2026-08-19), plus
 * `em` on the rare caller who already has an account. Two more that Meta scores
 * and this funnel is often assumed to have:
 *
 * - **`db` is impossible, not missing.** Meta's date of birth is `YYYYMMDD`; the
 *   quiz asks for an age *band* (`under_40`, `40_45`, `46_50`, `51_plus`). There
 *   is no honest way to turn a bucket into a date, and inventing a midpoint
 *   sends a birthday that is wrong for all but a few days of the year.
 * - **`ge` is a choice, not an oversight.** The product is for women in
 *   menopause, so `"f"` would be right for nearly everyone — but the quiz never
 *   asks, gender is a single bit and therefore the weakest parameter Meta
 *   accepts, and trans and non-binary people go through menopause too. Asserting
 *   an identity we were never told, about a real person, for one bit of match
 *   value is a bad trade. If it is ever wanted, ask on the quiz and send the
 *   answer.
 *
 * ## No `custom_data`, and this event must never grow one
 *
 * Lead used to carry `symptom_count` (how many menopause symptoms she ticked)
 * and `goal` (what she wants fixed) as audience-splitting metadata. Both were
 * removed on 2026-08-30 and must not come back.
 *
 * They were health data about an identified person, sent to an advertising
 * platform, while our own Privacy Policy promised in bold that we do not use
 * health data for advertising. That specific contradiction — a health app
 * telling users one thing and telling Meta another — is the whole of the FTC's
 * GoodRx, BetterHelp and Cerebral actions, and Washington's My Health My Data
 * Act gives the user a private right of action over it. The parameters bought
 * nothing in return: `custom_data` on a Lead is reporting metadata, not an
 * optimization signal, so delivery is identical without them.
 *
 * The rule this leaves: **nothing derived from her symptoms, her quiz answers,
 * her health profile or her logs may be sent to Meta, in any parameter, on any
 * event.** Match parameters (`fn`, `country`, `external_id`, `_fbp`/`_fbc`) are
 * identity, not health, and are fine. `value`/`currency` on the money events is
 * the price of one product every buyer pays, and reveals nothing about her.
 * Anything else needs a lawyer, not a commit.
 */
export async function sendMetaLead(params: SendMetaLeadParams): Promise<void> {
  const { eventId, eventTimeSec, eventSourceUrl } = params;

  await postEvent(
    {
      event_name: "Lead",
      event_time: eventTimeSec,
      event_id: eventId,
      action_source: "website",
      ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
      user_data: buildUserData(params),
    },
    `Lead ${eventId}`
  );
}
