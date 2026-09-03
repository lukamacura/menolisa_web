import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_PRICE, PLAN_WEEKS } from "@/lib/pricing";
import { getAccountState, type AccountState, TRIAL_SELECT_COLS } from "@/lib/getAccountState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The sales desk.
 *
 * One question — **should I spend more on ads tomorrow?** — and every figure
 * here is either the answer or the working behind it.
 *
 * ── Where the numbers come from, and why it can never be the other way ──────
 *
 * **Money is Stripe. People are Supabase. Never mixed.**
 *
 * Stripe answers *how much*: every dollar on this screen comes from
 * `stripe.charges.list()`. A charge is immutable and there is one per payment,
 * forever, so it is the only ledger.
 *
 * Supabase answers *who and what*: names, emails, quiz finishers, renewal
 * dates, plan status, cancellations.
 *
 * `user_trials` must never be a revenue source. It holds **one row per person,
 * overwritten on every renewal** — it can say that someone is paying, but not
 * how many times she has paid or how much arrived last month, because that
 * history is destroyed on each update.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * AI cost per plan, token counts, generation duration, MRR, the account-state
 * grid, the by-month chart, and the table of every account with a billing row.
 * `llm_usage` is still written on every OpenAI call and `lib/llmCost.ts` still
 * prices it — a cost question is a query against that table, not a tile. The
 * one number that survived from it is the measured serving cost per customer,
 * which is an input to contribution.
 */

// Admin panel password. Set ADMIN_PANEL_PASSWORD in the env + Vercel.
// No fallback: a default committed to the repo is a published password, and
// this endpoint hands out revenue figures and customer emails. Unset means the
// panel is closed, which is the right failure mode for an admin surface.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD;

/**
 * Everything you pay monthly regardless of how many women buy — hosting,
 * database, email, domain. Set `ADMIN_FIXED_MONTHLY_USD` in the env.
 *
 * Unset reads as 0 and the panel says so rather than quietly reporting a
 * contribution figure that ignores your bills.
 */
const FIXED_MONTHLY_USD = Number(process.env.ADMIN_FIXED_MONTHLY_USD ?? 0) || 0;

/**
 * The day paid traffic started, as `YYYY-MM-DD`. Set `ADMIN_CAMPAIGN_START`.
 *
 * Everything before it is you: the checkouts you opened testing the paywall,
 * the quiz rows you filled in, the card you put through on your own support
 * address. Stripe Checkout Sessions are **immutable and cannot be deleted**, so
 * those taps sit in the 30-day window for a full 30 days and there is no way to
 * remove them at the source — on 2026-09-02 that was 4 live sessions against a
 * campaign one day old, i.e. a funnel reporting more checkouts than it had
 * visitors.
 *
 * Wiping the Supabase side does not help and makes it worse: it removes the
 * quiz finishers while leaving the Stripe sessions, so the middle step exceeds
 * the first. The only honest fix is to refuse to count either side before this
 * date.
 *
 * Unset means no floor, and every window behaves exactly as it did before. Once
 * the campaign is more than 30 days old the floor stops binding on its own and
 * can be deleted.
 */
const CAMPAIGN_START_DAY: { y: number; m: number; d: number } | null = (() => {
  const raw = process.env.ADMIN_CAMPAIGN_START?.trim();
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  // Validated by round-trip: "2026-02-31" passes the regex and would otherwise
  // roll silently into March.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
})();

/**
 * The campaign floor as a timestamp: **local midnight** on that day, using the
 * same `+ tzOffsetMinutes` convention as `isoDay` and `startOfToday`.
 *
 * The day boundary has to be the operator's, not UTC's. Anchoring at UTC midday
 * (the first version of this) throws away everything before noon on launch day —
 * a real quiz finisher at 01:44 on the first morning — and anchoring at UTC
 * midnight lets the last hours of the day *before* launch back in for anyone
 * east of Greenwich. Both are wrong in the direction that matters: this figure
 * exists to separate the campaign from what came before it.
 */
function campaignFloorMs(tzOffsetMinutes: number): number | null {
  if (!CAMPAIGN_START_DAY) return null;
  const { y, m, d } = CAMPAIGN_START_DAY;
  return Date.UTC(y, m - 1, d) + tzOffsetMinutes * 60_000;
}

/**
 * How far back the Stripe walks go. At current volume the whole history is a
 * single page — but an unbounded auto-page would eventually make this endpoint
 * time out rather than load slowly, so it stops and says so.
 */
const MAX_CHARGES = 1000;
/** Checkout sessions accumulate faster than charges — one per paywall tap. */
const MAX_SESSIONS = 1000;
/** Subscriptions to the MenoLisa price — roughly one per customer, ever. */
const MAX_SUBS = 1000;
/** Same idea for the account table. */
const MAX_CLIENTS = 500;
/** How many charges the sales list shows. Totals still cover the whole walk. */
const MAX_SALES_SHOWN = 40;

const DAY_MS = 86_400_000;

/** The billing period, in days. Also the length of the refund guarantee. */
const PERIOD_DAYS = PLAN_WEEKS * 7;
/**
 * Grace added to a period before a customer counts as "should have renewed by
 * now". Stripe dunning retries a failed renewal for several days; without the
 * grace those customers would be scored as churned on the day they went
 * past_due, which understates the renewal rate exactly when it matters.
 */
const RENEWAL_GRACE_DAYS = 3;

/** Stripe's standard US card rate, used only until a real charge exists to measure. */
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Stripe: what was actually collected ────────────────────────────────────

/**
 * `net` is what Stripe took in, less refunds. `kept` is that less Stripe's own
 * fee — the money that actually reaches you, and the only figure it is honest
 * to compare against ad spend.
 */
type Bucket = { count: number; net: number; kept: number };

/** A charge, before it knows whose it is. Identity is joined in the handler. */
type RawSale = {
  id: string;
  at: string;
  customerId: string | null;
  gross: number;
  net: number;
  refunded: number;
  kind: "new" | "renewal";
  chargeName: string | null;
  chargeEmail: string | null;
};

type Revenue = {
  /** Null when Stripe couldn't be reached; the rest of the panel still renders. */
  error: string | null;
  /**
   * Whether these are real charges. Read off the charges themselves rather than
   * sniffing the key prefix, and surfaced loudly: test-mode figures look
   * exactly like revenue, and a sandbox key in the env would otherwise show a
   * few thousand dollars of income that does not exist.
   */
  livemode: boolean | null;
  currencies: string[];
  today: Bucket;
  last7: Bucket;
  last30: Bucket;
  allTime: Bucket;
  /** Newest-last daily revenue, one entry per day for the last 30. */
  daily: number[];
  refunds30: { count: number; amount: number };
  failedLast30: number;
  /** Measured from real charges; falls back to Stripe's published rate at zero volume. */
  feeRate: number;
  /** Customers whose first-ever charge landed in the last 30 days. Ads buy these. */
  newCustomers30: number;
  /**
   * Every customer's first-ever charge, as ms. The funnel block counts new
   * customers over its own window — which is not `newCustomerSince` — and this
   * is what lets it do that without a second walk over Stripe.
   */
  firstChargeTimes: number[];
  /** Customers who have ever paid a first charge. */
  newCustomersAll: number;
  /** Renewal cohort: first charge is old enough that a renewal was due. */
  cohortSize: number;
  cohortRenewed: number;
  /** When the earliest unmatured customer's first period closes. */
  cohortMaturesAt: string | null;
  /**
   * First-period money still inside the 56-day refund guarantee. Not revenue
   * you can spend yet — it is the only contingent liability in the business.
   */
  guaranteeExposure: number;
  /** Hit MAX_CHARGES — the figures above are a recent slice, not all time. */
  truncated: boolean;
  sales: RawSale[];
};

function emptyBucket(): Bucket {
  return { count: 0, net: 0, kept: 0 };
}

function emptyRevenue(error: string | null): Revenue {
  return {
    error,
    livemode: null,
    currencies: [],
    today: emptyBucket(),
    last7: emptyBucket(),
    last30: emptyBucket(),
    allTime: emptyBucket(),
    daily: new Array(30).fill(0),
    refunds30: { count: 0, amount: 0 },
    failedLast30: 0,
    feeRate: STRIPE_PCT + STRIPE_FIXED / PLAN_PRICE,
    newCustomers30: 0,
    firstChargeTimes: [],
    newCustomersAll: 0,
    cohortSize: 0,
    cohortRenewed: 0,
    cohortMaturesAt: null,
    guaranteeExposure: 0,
    truncated: false,
    sales: [],
  };
}

/**
 * Revenue, renewals and acquisition, all from one charge list.
 *
 * **The Stripe account is shared with other products**, so `charges.list()`
 * returns every business's money and nothing on this screen may read it raw.
 * The MenoLisa price id is the product boundary: every MenoLisa payment is a
 * subscription to `STRIPE_PRICE_8WEEK`, so the customers holding such a
 * subscription — any status, canceled included — are exactly the customers
 * whose charges belong here. One subscriptions walk builds that set; every
 * other product's charges are dropped before they touch a bucket.
 *
 * Renewals are identified without a further API call: the oldest successful
 * charge per customer is her first purchase and everything after it is a
 * renewal. That same map gives the renewal rate (customers past their first
 * period who have a second charge), the new-customer count that cost-per-sale
 * divides by, and the refund-guarantee exposure.
 */
/**
 * `newCustomerSince` is the acquisition floor — 30 days, or the campaign start
 * if later. It gates `newCustomers30` only, because that is the denominator of
 * cost per customer: dividing this month's ad spend by a customer who bought
 * before you ever ran an ad reports a CAC the ads did not earn. Every other
 * figure here keeps its own window.
 */
async function loadRevenue(
  stripe: Stripe,
  startOfToday: number,
  newCustomerSince: number
): Promise<Revenue> {
  const priceId = process.env.STRIPE_PRICE_8WEEK;
  if (!priceId) {
    // Fail closed: without the price id there is no way to tell MenoLisa's
    // charges from the other products' on this account, and account-wide
    // figures presented as MenoLisa revenue are worse than no figures.
    return emptyRevenue("STRIPE_PRICE_8WEEK is not set, so MenoLisa's charges can't be told apart");
  }

  let charges: Stripe.Charge[];
  let subs: Stripe.Subscription[];
  try {
    [charges, subs] = await Promise.all([
      stripe.charges
        .list({ limit: 100, expand: ["data.balance_transaction"] })
        .autoPagingToArray({ limit: MAX_CHARGES }),
      stripe.subscriptions
        .list({ price: priceId, status: "all", limit: 100 })
        .autoPagingToArray({ limit: MAX_SUBS }),
    ]);
  } catch (err) {
    console.error("Admin stats: Stripe charge/subscription list failed:", err);
    // A bad STRIPE_PRICE_8WEEK ("No such price") is a config problem, not an
    // outage — say which it was, or the fix is a wild goose chase.
    const msg =
      err instanceof Stripe.errors.StripeInvalidRequestError
        ? `Stripe rejected the request — ${err.message}`
        : "Could not reach Stripe";
    return emptyRevenue(msg);
  }

  /** Customers who have ever held a MenoLisa subscription. */
  const ownCustomers = new Set<string>();
  for (const s of subs) {
    const cid = typeof s.customer === "string" ? s.customer : s.customer?.id;
    if (cid) ownCustomers.add(cid);
  }

  const rev = emptyRevenue(null);
  rev.truncated = charges.length >= MAX_CHARGES || subs.length >= MAX_SUBS;
  rev.livemode = charges[0]?.livemode ?? null;

  const now = Date.now();
  const currencies = new Set<string>();
  /** customer → every succeeded charge time, ascending. */
  const byCustomer = new Map<string, number[]>();
  /** customer → net amount of that customer's first charge, for guarantee exposure. */
  const firstChargeNet = new Map<string, number>();
  let gross = 0;
  let fees = 0;

  const succeeded = charges.filter((c) => {
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
    // Another product's charge, or a customerless one-off we can't attribute.
    // A card declined *inside* Checkout leaves a customer with no subscription,
    // so those declines are invisible here — declined30 is a floor.
    if (!customerId || !ownCustomers.has(customerId)) return false;
    if (c.status === "failed") {
      if (c.created * 1000 >= now - 30 * DAY_MS) rev.failedLast30 += 1;
      return false;
    }
    return c.status === "succeeded" && c.paid;
  });

  for (const c of succeeded) {
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
    if (!customerId) continue;
    const list = byCustomer.get(customerId);
    if (list) list.push(c.created * 1000);
    else byCustomer.set(customerId, [c.created * 1000]);
  }
  for (const list of byCustomer.values()) list.sort((a, b) => a - b);

  for (const c of succeeded) {
    const at = c.created * 1000;
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;

    currencies.add(c.currency);

    const grossCents = c.amount_captured || c.amount;
    const refundedCents = c.amount_refunded ?? 0;
    const netCents = grossCents - refundedCents;
    const bt = c.balance_transaction;
    const feeCents = bt && typeof bt !== "string" ? bt.fee : 0;

    const net = netCents / 100;
    const kept = (netCents - feeCents) / 100;

    gross += grossCents / 100;
    fees += feeCents / 100;

    const add = (b: Bucket) => {
      b.count += 1;
      b.net += net;
      b.kept += kept;
    };

    add(rev.allTime);
    if (at >= startOfToday) add(rev.today);
    if (at >= now - 7 * DAY_MS) add(rev.last7);
    if (at >= now - 30 * DAY_MS) {
      add(rev.last30);
      if (refundedCents > 0) {
        rev.refunds30.count += 1;
        rev.refunds30.amount += refundedCents / 100;
      }
      // Bucket into the 30-day daily series, newest last: index 29 is today,
      // 28 is yesterday. Measured forward from midnight rather than backward,
      // because `startOfToday - at` is negative for anything later than
      // midnight today and floors to -1, which silently dropped every charge
      // taken today and shifted yesterday's into today's slot.
      const dayIndex = 29 + Math.floor((at - startOfToday) / DAY_MS);
      if (dayIndex >= 0 && dayIndex < 30) rev.daily[dayIndex] += net;
    }

    // The filter above guarantees a customer id, so first-vs-renewal is just
    // "is this her oldest charge".
    const firstAt = customerId ? byCustomer.get(customerId)?.[0] : undefined;
    const isFirst = !customerId || firstAt === at;
    if (isFirst && customerId) firstChargeNet.set(customerId, net);

    if (rev.sales.length < MAX_SALES_SHOWN) {
      rev.sales.push({
        id: c.id,
        at: new Date(at).toISOString(),
        customerId,
        gross: round2(grossCents / 100),
        net: round2(net),
        refunded: round2(refundedCents / 100),
        kind: isFirst ? "new" : "renewal",
        chargeName: c.billing_details?.name ?? null,
        chargeEmail: c.billing_details?.email ?? c.receipt_email ?? null,
      });
    }
  }

  // ── Acquisition, retention and guarantee exposure, off the same map ───────
  const maturedBefore = now - (PERIOD_DAYS + RENEWAL_GRACE_DAYS) * DAY_MS;
  const guaranteeAfter = now - PERIOD_DAYS * DAY_MS;
  let earliestUnmatured: number | null = null;

  for (const [customerId, times] of byCustomer) {
    const first = times[0];
    rev.newCustomersAll += 1;
    if (first >= newCustomerSince) rev.newCustomers30 += 1;
    rev.firstChargeTimes.push(first);

    if (first <= maturedBefore) {
      rev.cohortSize += 1;
      if (times.length > 1) rev.cohortRenewed += 1;
    } else if (earliestUnmatured === null || first < earliestUnmatured) {
      earliestUnmatured = first;
    }

    // Still refundable: her first period has not closed yet.
    if (first >= guaranteeAfter) {
      rev.guaranteeExposure += firstChargeNet.get(customerId) ?? 0;
    }
  }
  if (earliestUnmatured !== null) {
    rev.cohortMaturesAt = new Date(
      earliestUnmatured + (PERIOD_DAYS + RENEWAL_GRACE_DAYS) * DAY_MS
    ).toISOString();
  }

  if (gross > 0) rev.feeRate = fees / gross;
  rev.currencies = [...currencies];

  // Round money once, at the edge, so the UI never shows 118.99999999999999.
  for (const b of [rev.today, rev.last7, rev.last30, rev.allTime]) {
    b.net = round2(b.net);
    b.kept = round2(b.kept);
  }
  rev.daily = rev.daily.map(round2);
  rev.refunds30.amount = round2(rev.refunds30.amount);
  rev.guaranteeExposure = round2(rev.guaranteeExposure);

  return rev;
}

/**
 * How many women reached the Stripe card form in the last 30 days.
 *
 * This is the funnel step that used to be invisible, and it is the one that
 * splits "the offer screen is weak" from "checkout is leaking" — two problems
 * with completely different fixes. A Checkout Session exists the moment
 * `create-checkout` runs, whether or not she ever types a card.
 *
 * Only sessions stamped `checkout_surface: "web"` count. `create-checkout`
 * stamps it on every MenoLisa session, so the check does two jobs at once: it
 * drops the Expo app's checkouts (a purchase begun in the app is not a step in
 * the web funnel) and it drops every session the *other products* on this
 * shared Stripe account create, which carry no such key.
 */
async function loadCheckoutStarts(
  stripe: Stripe,
  since: number
): Promise<{ started: number; error: string | null; truncated: boolean }> {
  try {
    const sessions = await stripe.checkout.sessions
      .list({ limit: 100, created: { gte: Math.floor(since / 1000) } })
      .autoPagingToArray({ limit: MAX_SESSIONS });
    const started = sessions.filter(
      (s) => s.metadata?.checkout_surface === "web"
    ).length;
    return { started, error: null, truncated: sessions.length >= MAX_SESSIONS };
  } catch (err) {
    console.error("Admin stats: Stripe session list failed:", err);
    return { started: 0, error: "Could not read checkout sessions", truncated: false };
  }
}

// ─── Supabase: who they are ─────────────────────────────────────────────────

/**
 * Emails live in `auth.users`, which PostgREST can't reach, so they come from
 * the admin API. There is no bulk get-by-ids, hence the paged walk; the funnel
 * mints an account per quiz finisher, so the cap matters.
 */
async function loadEmails(): Promise<Map<string, string | null>> {
  const supabaseAdmin = getSupabaseAdmin();
  const emails = new Map<string, string | null>();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("Admin stats: listUsers failed:", error);
      break;
    }
    for (const u of data.users) emails.set(u.id, u.email ?? null);
    if (data.users.length < 1000) break;
  }
  return emails;
}

/**
 * The operator's calendar date for an instant, as `2026-08-30`.
 *
 * The offset is not optional. `toISOString()` renders the *UTC* date, and local
 * midnight in any timezone ahead of UTC is the previous UTC day — so without
 * the shift this returns yesterday for anyone east of Greenwich, and the ad
 * spend you typed for today would be filed against yesterday.
 */
function isoDay(ms: number, tzOffsetMinutes: number): string {
  return new Date(ms - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

type Alert = { tone: "bad" | "warn" | "money"; label: string; text: string };

export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PANEL_PASSWORD is not set — admin stats endpoint disabled");
    return NextResponse.json({ error: "Admin panel is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.password !== "string" || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Minutes, as JS reports it: (UTC - local). Clamped to the real range so a
  // crafted value can't shift the day window somewhere meaningless.
  const rawOffset = Number(body?.tzOffsetMinutes);
  const tzOffsetMinutes =
    Number.isFinite(rawOffset) && Math.abs(rawOffset) <= 840 ? Math.trunc(rawOffset) : 0;

  const supabaseAdmin = getSupabaseAdmin();

  // "Today" is the operator's day, not UTC's. She checks this figure over
  // coffee; on a UTC boundary the headline number would still be showing
  // yesterday's sales for the first hours of her morning.
  const now = Date.now();
  const shiftedNow = now - tzOffsetMinutes * 60_000;
  const startOfToday =
    Math.floor(shiftedNow / DAY_MS) * DAY_MS + tzOffsetMinutes * 60_000;

  // ── Optional write: log a day of ad spend, then report on it in the same
  // round trip. One endpoint, one password check, and the numbers you get back
  // already include what you just typed.
  let spendWriteError: string | null = null;
  if (body?.spend && typeof body.spend === "object") {
    const day = body.spend.day;
    const raw = body.spend.amount;
    if (typeof day !== "string" || !DAY_RE.test(day) || Number.isNaN(Date.parse(day))) {
      spendWriteError = "That date wasn't a real day.";
    } else if (raw === null) {
      const { error } = await supabaseAdmin.from("ad_spend").delete().eq("day", day);
      if (error) {
        console.error("Admin stats: ad_spend delete failed:", error);
        spendWriteError = "Couldn't clear that day.";
      }
    } else {
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
        spendWriteError = "That amount didn't look like a number of dollars.";
      } else {
        const { error } = await supabaseAdmin
          .from("ad_spend")
          .upsert(
            { day, amount_usd: round2(amount), updated_at: new Date().toISOString() },
            { onConflict: "day" }
          );
        if (error) {
          console.error("Admin stats: ad_spend upsert failed:", error);
          spendWriteError = "Couldn't save that. Try again.";
        }
      }
    }
  }

  const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;
  const thirtyDaysAgo = startOfToday - 29 * DAY_MS;

  /**
   * The floor every funnel and acquisition figure is measured from: 30 days, or
   * the campaign start if that is more recent. See {@link CAMPAIGN_START_MS} —
   * without it the funnel counts your own pre-launch testing as customer
   * behaviour, and Stripe sessions cannot be deleted to fix it at the source.
   */
  const campaignFloor = campaignFloorMs(tzOffsetMinutes);
  const funnelSince = Math.max(now - 30 * DAY_MS, campaignFloor ?? Number.NEGATIVE_INFINITY);
  const funnelClamped = campaignFloor !== null && funnelSince > now - 30 * DAY_MS;
  const funnelDays = Math.max(1, Math.ceil((now - funnelSince) / DAY_MS));

  /**
   * **The funnel is one curve, so every row on it covers exactly the same
   * days.** That floor is the later of the acquisition window and the first
   * screen ping that ever happened.
   *
   * `funnel_events` only exists from 2026-09-02. Windowing the screen rows from
   * then while windowing the Stripe rows from the campaign start put two
   * different spans of time in one column: it showed 63 women finishing the
   * quiz above 54 reaching the screen they finish it on, which is not a rise in
   * the funnel, it is 43 extra hours. One window removes the artefact instead
   * of explaining it in a footnote.
   *
   * Read unwindowed, so it is a fixed instant rather than "the oldest ping in
   * the last 30 days" — the latter walks forward whenever traffic pauses, and
   * would silently narrow the whole block on a quiet weekend. Once the rolling
   * 30 days clears 2026-09-02 this stops binding and `funnelSince` takes over.
   */
  const trackingStartResult = await supabaseAdmin
    .from("funnel_events")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  const trackingStart = trackingStartResult.data?.[0]?.created_at
    ? new Date(trackingStartResult.data[0].created_at as string).getTime()
    : null;
  const curveSince = Math.max(funnelSince, trackingStart ?? funnelSince);
  const curveDays = Math.max(1, Math.ceil((now - curveSince) / DAY_MS));
  /** True while the screen data, not the campaign floor, is what bounds the block. */
  const curveBoundedByTracking = trackingStart !== null && trackingStart > funnelSince;

  const [
    trialsResult,
    profilesResult,
    plansResult,
    quizCountResult,
    spendResult,
    llmResult,
    revenue,
    checkout,
    emails,
    dropoffResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("user_trials")
      // Built from TRIAL_SELECT_COLS, never hand-listed: a missing column
      // comes back undefined, which getAccountState reads as "no dispute,
      // not canceled, no failed payment".
      .select(`user_id, created_at, stripe_customer_id, ${TRIAL_SELECT_COLS}`)
      .order("created_at", { ascending: false })
      .limit(MAX_CLIENTS),
    supabaseAdmin.from("user_profiles").select("user_id, name"),
    // One row per cycle; `planMap` keeps the last, so ascending order shows
    // the newest cycle's status rather than an arbitrary one.
    supabaseAdmin.from("user_plans").select("user_id, status").order("cycle", { ascending: true }),
    supabaseAdmin
      .from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .gte("created_at", new Date(funnelSince).toISOString()),
    supabaseAdmin
      .from("ad_spend")
      .select("day, amount_usd")
      .gte("day", isoDay(thirtyDaysAgo, tzOffsetMinutes))
      .order("day", { ascending: true }),
    // Serving cost per customer, measured rather than assumed. Only plan
    // generation is metered — Lisa chat on the phone is not — so this is a
    // floor, and the UI says so.
    supabaseAdmin.from("llm_usage").select("user_id, cost_usd"),
    stripe
      ? loadRevenue(stripe, startOfToday, funnelSince)
      : Promise.resolve(emptyRevenue("STRIPE_SECRET_KEY is not set")),
    stripe
      ? loadCheckoutStarts(stripe, curveSince)
      : Promise.resolve({ started: 0, error: null, truncated: false }),
    loadEmails(),
    // Screen-by-screen drop-off inside the funnel — the seventeen quiz steps
    // plus the six phases after them. This is the only block on the panel that
    // can see *inside* the quiz: every other funnel figure here starts at the
    // profile insert, which happens on step 17 of 17, so before 2026-09-02 a
    // woman who left on question 4 was indistinguishable from one who never
    // clicked the ad.
    //
    // `curveSince`, the same window every other row of the curve uses — see the
    // note where it is computed. Aggregated in Postgres (see the migration)
    // rather than by pulling
    // rows: PostgREST cannot express count-distinct-group-by, and the fallback
    // would ship the whole table to a serverless function for twenty numbers.
    supabaseAdmin.rpc("funnel_dropoff", {
      since: new Date(curveSince).toISOString(),
    }),
  ]);

  if (trialsResult.error) {
    console.error("Admin stats query failed:", trialsResult.error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  const nameMap = new Map(
    (profilesResult.data ?? []).map((p) => [p.user_id, p.name as string | null])
  );
  const planMap = new Map(
    (plansResult.data ?? []).map((p) => [p.user_id, p.status as string | null])
  );

  const nowDate = new Date();
  const rows = trialsResult.data ?? [];

  /** Stripe customer id → the account it belongs to, for the sales list. */
  const accountByCustomer = new Map<string, string>();
  for (const r of rows) {
    const cid = r.stripe_customer_id as string | null;
    if (cid) accountByCustomer.set(cid, r.user_id);
  }

  const state = new Map<string, AccountState>();
  const endsAt = new Map<string, Date | null>();
  for (const r of rows) {
    const s = getAccountState(r, nowDate);
    state.set(r.user_id, s.state);
    endsAt.set(r.user_id, s.endsAt);
  }

  const sales = revenue.sales.map((s) => {
    const userId = s.customerId ? accountByCustomer.get(s.customerId) ?? null : null;
    const renews = userId ? endsAt.get(userId) ?? null : null;
    const canceled = userId
      ? state.get(userId) === "canceling" || state.get(userId) === "disputed"
      : false;
    return {
      id: s.id,
      at: s.at,
      net: s.net,
      gross: s.gross,
      refunded: s.refunded > 0,
      kind: s.kind,
      name: (userId ? nameMap.get(userId) : null) ?? s.chargeName ?? null,
      email: (userId ? emails.get(userId) : null) ?? s.chargeEmail ?? null,
      /** Her next renewal date, or null when there isn't one. */
      renewsAt: s.refunded > 0 || canceled ? null : renews?.toISOString() ?? null,
    };
  });

  // ─── Ad spend ─────────────────────────────────────────────────────────────

  const spendByDay = new Map<string, number>();
  for (const r of spendResult.data ?? []) {
    spendByDay.set(String(r.day), Number(r.amount_usd) || 0);
  }
  /** Newest last, aligned index-for-index with `revenue.daily`. */
  const spendDaily: number[] = [];
  for (let i = 29; i >= 0; i--) {
    spendDaily.push(spendByDay.get(isoDay(startOfToday - i * DAY_MS, tzOffsetMinutes)) ?? 0);
  }
  const adSpend30 = round2(spendDaily.reduce((a, b) => a + b, 0));
  const adSpend7 = round2(spendDaily.slice(-7).reduce((a, b) => a + b, 0));

  // Yesterday backwards: days with no row at all. Today is excluded — you type
  // it in at the end of the day, so an empty today is normal, not a gap.
  const missingDays: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = isoDay(startOfToday - i * DAY_MS, tzOffsetMinutes);
    if (!spendByDay.has(d)) missingDays.push(d);
  }
  const lastLoggedDay =
    [...spendByDay.keys()].sort().pop() ?? null;

  /** Every day logged in the 30-day window, newest first — the per-day editor. */
  const loggedDays = [...spendByDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, amount]) => ({ day, amount }));

  // ─── Serving cost, measured ───────────────────────────────────────────────

  const llmRows = llmResult.data ?? [];
  const llmUsers = new Set(llmRows.map((r) => r.user_id).filter(Boolean));
  const llmTotal = llmRows.reduce((a, r) => a + (Number(r.cost_usd) || 0), 0);
  const servingPerCustomer = llmUsers.size > 0 ? llmTotal / llmUsers.size : 0;

  // ─── Unit economics ───────────────────────────────────────────────────────

  /** What one $59 sale is worth after Stripe takes its cut. The break-even unit. */
  const keptPerSale = round2(PLAN_PRICE - PLAN_PRICE * revenue.feeRate);

  const cac =
    revenue.newCustomers30 > 0 && adSpend30 > 0
      ? round2(adSpend30 / revenue.newCustomers30)
      : null;

  const renewalRate =
    revenue.cohortSize > 0 ? revenue.cohortRenewed / revenue.cohortSize : null;
  /**
   * Expected lifetime value, kept. A renewal rate of r means she buys 1/(1-r)
   * periods on average. Capped: a tiny cohort that all renewed would divide by
   * zero and print an infinite customer.
   */
  const ltv =
    renewalRate === null
      ? null
      : round2(keptPerSale * Math.min(1 / Math.max(1 - renewalRate, 0.05), 20));

  const contribution30 = round2(
    revenue.last30.kept -
      adSpend30 -
      FIXED_MONTHLY_USD -
      revenue.last30.count * servingPerCustomer
  );

  // ─── Forward view: money already on the calendar ──────────────────────────

  let bookedCount = 0;
  let cancelsPending = 0;
  for (const r of rows) {
    const s = state.get(r.user_id);
    if (s !== "active" && s !== "canceling" && s !== "past_due") continue;
    const ends = endsAt.get(r.user_id);
    if (!ends) continue;
    const withinMonth = ends.getTime() <= now + 30 * DAY_MS;
    if (s === "canceling") {
      cancelsPending += 1;
    } else if (withinMonth) {
      bookedCount += 1;
    }
  }
  const booked30 = round2(bookedCount * PLAN_PRICE);
  const cancelsAtRisk = round2(cancelsPending * PLAN_PRICE);

  // ─── Funnel, last 30 days ─────────────────────────────────────────────────

  // Windowed to 30 days on every step so the three numbers describe the same
  // period and the same traffic. An all-time funnel blends dead creative with
  // live creative, and — until they age out — the pre-launch test accounts.
  //
  // Quiz finishers come from Supabase and paid customers from Stripe, which is
  // only sound because both are effectively web-only today: the Expo app is
  // downloaded *after* checkout, so a mobile-first quiz finisher is vanishingly
  // rare. If mobile signup ever becomes real traffic, this denominator needs
  // splitting before the percentage means anything.
  const quizFinished30 = quizCountResult.count ?? 0;

  /*
   * Screen-by-screen drop-off, and the single worst step.
   *
   * `lostPct` is the share of the women who reached a screen and never got to
   * the next one — a step-to-step loss, not a share of the first screen. A
   * cumulative curve falls monotonically and every late step looks terrible by
   * construction; the step-to-step loss is what says "this screen is where they
   * go", which is the only thing this block is for.
   *
   * `worst` is computed here rather than in the page for the same reason the
   * verdict sentence is: the panel and anything that ever alerts off this must
   * not be able to disagree about which screen is the problem. It ignores the
   * last row (there is no next screen to lose anyone to) and any step with a
   * trivial base, since 2 → 1 is a 50% "cliff" that means nothing at launch
   * volume.
   */
  /*
   * Two different guards, and they are not the same number.
   *
   * `MIN_CLIFF_BASE` (25) is per row: a step is only allowed to be *called* a
   * cliff if enough people stood on the step above it for the percentage to
   * mean anything. Without it `2 -> 1` renders as a 50% catastrophe, which is
   * how this first shipped and what the live panel showed on day one.
   *
   * `MIN_VERDICT_ENTRY` (50) gates the sentence that tells you what to do. It is
   * higher on purpose: a coloured bar is an observation and a reader can weigh
   * it, but "fix that screen before any other" is an instruction, and at n=10
   * it will send you to rewrite a screen on the strength of three people. The
   * panel says how far off it is instead of guessing, which is the same choice
   * the empty state makes.
   *
   * Both are exported in the payload so the page never re-derives them and the
   * two can never disagree — same reason the verdict sentence is computed here.
   */
  const MIN_CLIFF_BASE = 25;
  const MIN_VERDICT_ENTRY = 50;
  /**
   * The screens the curve is measured over — **the active funnel only**.
   *
   * `start` is excluded, and it is the one exclusion this needs. `/register`
   * has cold-started on question 1 since 2026-09-02, so that screen is no
   * longer in the path anyone walks: the only way to see it is to press Back
   * off question 1. It still pings, because it is still a real screen a real
   * woman reached, but it is a *backwards* step and it cannot be read as one
   * of these rows.
   *
   * Leaving it in is not cosmetic. It carries `step_index` 0, so it sorts to
   * the top and becomes `entrySessions` — the 100% base for every bar and
   * every percentage in the band — while counting a handful of people who
   * arrived there by going the wrong way. One woman backing up would make the
   * entry base 1 and print the rest of the funnel at several thousand percent.
   *
   * `STEP_LABELS` in `app/admin/page.tsx` drops `start` for the same reason.
   * Filter here rather than there: the page must never compute a figure the
   * route didn't, and every derived number below — `pctOfEntry`, `lostPct`,
   * `worstStep`, the visit count in the chain sentence — is built off this list.
   */
  const INACTIVE_STEPS = new Set([
    // Not in the funnel anyone walks: `/register` has cold-started on question 1
    // since 2026-09-02, so the start screen is reachable only by pressing Back.
    // It also carries step_index 0, so leaving it in would make it the entry row
    // and the 100% base — a handful of women who arrived there backwards
    // deciding the scale of every bar above them.
    "start",
    // Superseded by the `paid` row below. `download` is the post-checkout
    // landing screen, so it measures the same event Stripe measures — and
    // Stripe is the one that knows whether money moved. Two rows for one event
    // is the duplicate this curve exists to not have.
    "download",
  ]);
  const screenRows = ((dropoffResult.data ?? []) as {
    step_index: number;
    step: string;
    sessions: number;
  }[]).filter((r) => !INACTIVE_STEPS.has(r.step));

  /**
   * **One curve, top of the funnel to the money, no row measured twice.**
   *
   * This was two bands with two bases — screens counted in visits above,
   * Supabase + Stripe counted in women below — and the seam between them was
   * doing real damage:
   *
   *   - Its first row, "Finished the quiz", was the `calculating` row of the
   *     band above it. `save-quiz` writes `user_profiles` behind the
   *     calculating loader, so they are the same instant; one was Supabase
   *     counting women and the other `funnel_events` counting visits, over two
   *     different windows, printed as two rows of one funnel.
   *   - The bands overlapped rather than stacked. The top band runs to
   *     `paywall`, which is *below* where the bottom band restarts, so the
   *     curve appeared to climb at the seam.
   *   - The one number the split was supposed to protect — paywall to card
   *     form — could not be computed at all, because it spanned the seam.
   *
   * The unit objection that justified the split does not survive the data: over
   * the same window `calculating` is 54 visits and `user_profiles` is 54 women,
   * exactly. Visits and women diverge at the *top* of the funnel, where a woman
   * opens the ad twice — and the money rows are all at the bottom, where the
   * two have converged. So the rows are appended in funnel order and the source
   * is stated per row rather than per band.
   *
   * `group` is presentation only. It never changes a base: every percentage in
   * this block still divides by the row above it, and the bars by `entry`.
   */
  const POST_QUIZ = new Set([
    "calculating",
    "results",
    "diagnosis",
    // `relief` is the pre-2026-09-03 single row; the three that follow are the
    // screens it was hiding. All four are grouped "after" so a window spanning
    // the split still labels every one of them as post-quiz.
    "relief",
    "relief_intro",
    "relief_running",
    "relief_reward",
    "paywall",
  ]);
  const paidInCurve = revenue.firstChargeTimes.filter((t) => t >= curveSince).length;
  const curveRows: {
    step: string;
    sessions: number;
    group: "quiz" | "after" | "money";
    source: "screens" | "stripe";
  }[] = [
    ...screenRows.map((r) => ({
      step: r.step,
      sessions: r.sessions,
      group: (POST_QUIZ.has(r.step) ? "after" : "quiz") as "quiz" | "after",
      source: "screens" as const,
    })),
    // Both from Stripe, both below every screen we instrument. `checkout.error`
    // means Stripe would not answer; a row of zero would read as "nobody
    // opened the card form", which is a different and much worse claim.
    ...(checkout.error
      ? []
      : [
          {
            step: "stripe_checkout",
            sessions: checkout.started,
            group: "money" as const,
            source: "stripe" as const,
          },
        ]),
    {
      step: "stripe_paid",
      sessions: paidInCurve,
      group: "money" as const,
      source: "stripe" as const,
    },
  ];
  const dropoffRows = curveRows;
  const entrySessions = dropoffRows[0]?.sessions ?? 0;
  /*
   * **A loss belongs to the screen she was looking at when she left — which is
   * the row ABOVE the one where the count falls.**
   *
   * `pingFunnelStep` fires when a screen *renders*, so reaching `q_body` means
   * she had already tapped through the reward board before it. When 84 reach
   * that board and 70 reach `q_body`, the fourteen missing women abandoned on
   * the board; `q_body` never got its chance at them.
   *
   * This shipped the other way round on 2026-09-02 — the figure sat on the row
   * where the count dropped — and it produced exactly the wrong reading inside a
   * day: the first real analysis of this data blamed the symptoms question for a
   * loss that happened on the age question, and blamed the height/weight sliders
   * for a loss that happened on the reward board before them. Both fixes would
   * have been aimed one screen past the problem.
   *
   * So `lostPct` / `lostCount` are what THIS row lost to the next one, and the
   * significance base is this row's own count — the number of women who actually
   * stood on the screen being accused.
   */
  const dropoff = dropoffRows.map((row, i) => {
    const next = i === dropoffRows.length - 1 ? null : dropoffRows[i + 1].sessions;
    const lostCount = next === null ? null : Math.max(row.sessions - next, 0);
    return {
      index: i,
      step: row.step,
      group: row.group,
      source: row.source,
      sessions: row.sessions,
      // Share of everyone who reached the first measured screen. Whole numbers:
      // a tenth of a percent on a base of six is false precision.
      pctOfEntry: entrySessions ? Math.round((row.sessions / entrySessions) * 100) : 0,
      /** How many women on THIS screen never reached the next one. */
      lostCount,
      /** The same, as a share of the women who stood on this screen. */
      lostPct:
        lostCount !== null && row.sessions > 0
          ? Math.round((lostCount / row.sessions) * 100)
          : null,
      // Whether that loss sits on a base big enough to describe. The page
      // colours from this rather than from `lostPct` alone.
      significant: row.sessions >= MIN_CLIFF_BASE,
    };
  });
  const worstStep =
    entrySessions >= MIN_VERDICT_ENTRY
      ? (dropoff
          .filter((d) => d.significant && d.lostPct !== null)
          .sort((a, b) => (b.lostPct ?? 0) - (a.lostPct ?? 0))[0] ?? null)
      : null;

  // ─── Anything that needs a human ──────────────────────────────────────────

  const alerts: Alert[] = [];

  const stranded = rows.filter((r) => {
    const s = state.get(r.user_id);
    return (s === "active" || s === "canceling") && planMap.get(r.user_id) !== "ready";
  });
  if (stranded.length > 0) {
    const who = stranded
      .slice(0, 2)
      .map((r) => nameMap.get(r.user_id) || emails.get(r.user_id) || r.user_id.slice(0, 8))
      .join(", ");
    const more = stranded.length > 2 ? ` and ${stranded.length - 2} more` : "";
    alerts.push({
      tone: "bad",
      label: "Fix now",
      text: `${who}${more} paid and ${stranded.length === 1 ? "has" : "have"} no plan to open. Resend checkout.session.completed from Stripe.`,
    });
  }

  const disputed = rows.filter((r) => state.get(r.user_id) === "disputed").length;
  if (disputed > 0) {
    alerts.push({
      tone: "bad",
      label: "Dispute",
      text: `${disputed} chargeback${disputed === 1 ? "" : "s"} — ${disputed === 1 ? "that account is" : "those accounts are"} locked out. Answer it in Stripe before the evidence window closes.`,
    });
  }

  if (cancelsPending > 0) {
    alerts.push({
      tone: "warn",
      label: "Churn",
      text: `${cancelsPending} ${cancelsPending === 1 ? "woman has" : "women have"} cancelled before the next renewal — $${cancelsAtRisk.toFixed(2)} that will not arrive. They keep access until their period ends.`,
    });
  }

  const pastDue = rows.filter((r) => state.get(r.user_id) === "past_due").length;
  if (pastDue > 0) {
    alerts.push({
      tone: "warn",
      label: "Billing",
      text: `${pastDue} card${pastDue === 1 ? "" : "s"} failed at renewal. Stripe is retrying; ${pastDue === 1 ? "she keeps" : "they keep"} access meanwhile.`,
    });
  }

  if (revenue.livemode === false && revenue.allTime.count > 0) {
    alerts.push({
      tone: "warn",
      label: "Setup",
      text: "Stripe is on a test key, so every dollar on this page is fake. Swap in the live key before the first ad runs.",
    });
  }

  if (missingDays.length > 0 && revenue.livemode !== false) {
    alerts.push({
      tone: "money",
      label: "Spend",
      text: `No ad spend logged for ${missingDays.length} of the last 7 days. Cost per customer is understated until you fill them in.`,
    });
  }

  if (FIXED_MONTHLY_USD === 0) {
    alerts.push({
      tone: "money",
      label: "Setup",
      text: "Fixed monthly costs are not set, so contribution ignores your hosting and email bills. Set ADMIN_FIXED_MONTHLY_USD.",
    });
  }

  if (revenue.guaranteeExposure > 0) {
    alerts.push({
      tone: "money",
      label: "Owed",
      text: `$${revenue.guaranteeExposure.toFixed(2)} of first-period revenue is still inside the ${PERIOD_DAYS}-day refund guarantee. Treat it as borrowed.`,
    });
  }

  if (revenue.currencies.length > 1) {
    alerts.push({
      tone: "warn",
      label: "Currency",
      text: `Charges in ${revenue.currencies.join(", ")}. Totals add them as-is, so they are not comparable.`,
    });
  }

  // ─── The verdict ──────────────────────────────────────────────────────────

  // One sentence, computed here rather than in the browser so the panel and any
  // future alert can never disagree about what the numbers mean.
  const verdict = (() => {
    if (revenue.error) {
      return {
        tone: "idle" as const,
        word: "No data",
        text: "Stripe could not be reached, so there is nothing to judge. The Supabase figures below are still current.",
      };
    }
    if (revenue.livemode === false) {
      return {
        tone: "idle" as const,
        word: "Not live",
        text: "Stripe is on a test key, so none of this money is real. Swap in the live key, then this line starts answering whether the ads pay for themselves.",
      };
    }
    if (cac === null) {
      return {
        tone: "idle" as const,
        word: adSpend30 > 0 ? "Waiting" : "No spend",
        text:
          adSpend30 > 0
            ? `$${adSpend30.toFixed(2)} spent and nobody new has paid yet. Cost per customer appears with the first sale.`
            : "Log a day of ad spend below and this line tells you whether to spend more tomorrow.",
      };
    }
    const gap = round2(cac - keptPerSale);
    if (ltv === null) {
      return {
        tone: "warn" as const,
        word: "Hold",
        text:
          `You pay $${cac.toFixed(2)} for a woman who returns $${keptPerSale.toFixed(2)} on her first payment — ` +
          `${gap > 0 ? `$${gap.toFixed(2)} short` : `$${Math.abs(gap).toFixed(2)} ahead`}. ` +
          `Whether that is a loss or a bargain depends entirely on renewals, and no first period has closed yet. Keep the budget flat until it does.`,
      };
    }
    const ratio = ltv / cac;
    if (ratio >= 2) {
      return {
        tone: "good" as const,
        word: "Scale",
        text: `$${cac.toFixed(2)} to acquire her, $${ltv.toFixed(2)} back over her lifetime — ${ratio.toFixed(2)}×. ${gap <= 0 ? "She pays for herself on the first charge, so raising the daily budget costs you nothing but patience." : `You are ${gap.toFixed(2)} down on the first charge and ahead by the second, so raising the budget needs cash to bridge the gap.`}`,
      };
    }
    if (ratio >= 1) {
      return {
        tone: "warn" as const,
        word: "Hold",
        text: `$${cac.toFixed(2)} to acquire her, $${ltv.toFixed(2)} back — ${ratio.toFixed(2)}×. That is profit, but too thin to absorb a bad week. Hold the budget and work the offer screen before you scale.`,
      };
    }
    return {
      tone: "bad" as const,
      word: "Fix",
      text: `You pay $${cac.toFixed(2)} for $${ltv.toFixed(2)} back — you lose money on every woman the ads bring. Cut the budget and fix the funnel before spending another day.`,
    };
  })();

  return NextResponse.json({
    livemode: revenue.livemode,
    revenueError: revenue.error,
    spendWriteError,
    truncated: revenue.truncated || rows.length >= MAX_CLIENTS || checkout.truncated,
    verdict,
    money: {
      today: revenue.today,
      last7: revenue.last7,
      last30: revenue.last30,
      allTime: revenue.allTime,
    },
    /** 30 days, newest last, index-aligned. Both from their own source. */
    series: { revenue: revenue.daily, spend: spendDaily },
    costs: {
      adSpend30,
      adSpend7,
      lastLoggedDay,
      loggedDays,
      missingDays,
      todayIso: isoDay(startOfToday, tzOffsetMinutes),
      todaySpend: spendByDay.get(isoDay(startOfToday, tzOffsetMinutes)) ?? null,
      fixedMonthly: round2(FIXED_MONTHLY_USD),
      servingPerCustomer: Math.round(servingPerCustomer * 10000) / 10000,
    },
    acq: {
      newCustomers30: revenue.newCustomers30,
      cac,
      keptPerSale,
      feeRate: Math.round(revenue.feeRate * 10000) / 10000,
    },
    retention: {
      renewalRate: renewalRate === null ? null : Math.round(renewalRate * 1000) / 10,
      cohortSize: revenue.cohortSize,
      cohortRenewed: revenue.cohortRenewed,
      maturesAt: revenue.cohortMaturesAt,
      ltv,
      roas: ltv !== null && cac ? Math.round((ltv / cac) * 100) / 100 : null,
    },
    forward: {
      booked30,
      bookedCount,
      cancelsPending,
      cancelsAtRisk,
      guaranteeExposure: revenue.guaranteeExposure,
      refunds30: revenue.refunds30,
      declined30: revenue.failedLast30,
    },
    funnel: {
      /** Quiz finishers over the acquisition window. Not a row on the curve —
       *  `calculating` is the same instant — it only backs the empty state. */
      quizFinished30,
      sessionsError: checkout.error,
      /** The one window every row of the curve is measured over. */
      since: new Date(curveSince).toISOString(),
      days: curveDays,
      clamped: funnelClamped,
      /** The acquisition window, which the CAC tile still uses and which is not
       *  necessarily the curve's. */
      acqSince: new Date(funnelSince).toISOString(),
      acqDays: funnelDays,
      /** True when it is the age of the screen data, not the campaign floor,
       *  that bounds the curve — the panel labels the window from this. */
      boundedByTracking: curveBoundedByTracking,
      // The whole funnel, one row per step, top to money. Empty until the
      // instrumented build has been live for a while — the panel says so rather
      // than drawing an empty chart.
      dropoff,
      worstStep,
      /** Visits that reached the first measured screen — the base every
       *  percentage in the block divides by, and what the verdict is gated on. */
      entrySessions,
      /** How many the verdict needs before it will name a screen. */
      minVerdictEntry: MIN_VERDICT_ENTRY,
      dropoffError: dropoffResult.error ? "Could not read funnel steps" : null,
    },
    contribution30,
    sales,
    /** Total succeeded charges walked, so the list can say "newest 40 of 112". */
    salesTotal: revenue.allTime.count,
    alerts,
    refreshedAt: new Date().toISOString(),
  });
}
