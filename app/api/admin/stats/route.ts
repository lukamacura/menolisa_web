import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_PRICE } from "@/lib/pricing";
import { getAccountState, type AccountState, TRIAL_SELECT_COLS } from "@/lib/getAccountState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The admin panel answers one question — is the campaign making money? — so
 * this endpoint returns money collected, who paid, and anything that needs a
 * human. Nothing else.
 *
 * What it deliberately does NOT return: AI cost per plan, token counts, MRR,
 * the account-state grid, the by-month chart, or the full list of every
 * account with a billing row. `llm_usage` is still written on every OpenAI
 * call and is still the place to answer a cost question — it is just not a
 * number anyone acts on daily, so it is not on the daily screen. Query the
 * table directly if it is ever needed again.
 */

// Admin panel password. Set ADMIN_PANEL_PASSWORD in the env + Vercel.
// No fallback: a default committed to the repo is a published password, and
// this endpoint hands out revenue figures and customer emails. Unset means the
// panel is closed, which is the right failure mode for an admin surface.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD;

/**
 * How far back the Stripe walk goes. At current volume the whole history is a
 * single page — but an unbounded auto-page would eventually make this endpoint
 * time out rather than load slowly, so it stops and says so.
 */
const MAX_CHARGES = 1000;
/** Same idea for the account table. */
const MAX_CLIENTS = 500;
/** How many charges the sales list shows. Totals still cover the whole walk. */
const MAX_SALES_SHOWN = 60;

const DAY_MS = 86_400_000;

/** Stripe's standard US card rate, used only until a real charge exists to measure. */
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Stripe: what was actually collected ────────────────────────────────────

type Bucket = { count: number; net: number };

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
  refunds7: { count: number; amount: number };
  failedLast30: number;
  /** Measured from real charges; falls back to Stripe's published rate at zero volume. */
  feeRate: number;
  /** Hit MAX_CHARGES — the figures above are a recent slice, not all time. */
  truncated: boolean;
  sales: RawSale[];
};

function emptyRevenue(error: string | null): Revenue {
  return {
    error,
    livemode: null,
    currencies: [],
    today: { count: 0, net: 0 },
    last7: { count: 0, net: 0 },
    last30: { count: 0, net: 0 },
    allTime: { count: 0, net: 0 },
    refunds7: { count: 0, amount: 0 },
    failedLast30: 0,
    feeRate: STRIPE_PCT + STRIPE_FIXED / PLAN_PRICE,
    truncated: false,
    sales: [],
  };
}

/**
 * Revenue comes from Stripe, not from `user_trials`.
 *
 * The table holds the *current* state of a subscription — one row per person,
 * overwritten on every renewal — so it can say who is paying but never how many
 * times they have paid or how much came in last month. Charges are the ledger.
 *
 * Renewals are identified without a second API call: charges arrive newest
 * first, so the oldest successful charge per customer is her first purchase and
 * everything after it is a renewal.
 */
async function loadRevenue(tzOffsetMinutes: number): Promise<Revenue> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return emptyRevenue("STRIPE_SECRET_KEY is not set");
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let charges: Stripe.Charge[];
  try {
    charges = await stripe.charges
      .list({ limit: 100, expand: ["data.balance_transaction"] })
      .autoPagingToArray({ limit: MAX_CHARGES });
  } catch (err) {
    console.error("Admin stats: Stripe charge list failed:", err);
    return emptyRevenue("Could not reach Stripe");
  }

  const rev = emptyRevenue(null);
  rev.truncated = charges.length >= MAX_CHARGES;
  rev.livemode = charges[0]?.livemode ?? null;

  const now = Date.now();
  // "Today" is the operator's day, not UTC's. She checks this figure over
  // coffee; on a UTC boundary the headline number would still be showing
  // yesterday's sales for the first hours of her morning, which is the one
  // number on the screen that has to be right.
  const shiftedNow = now - tzOffsetMinutes * 60_000;
  const startOfToday =
    Math.floor(shiftedNow / DAY_MS) * DAY_MS + tzOffsetMinutes * 60_000;
  const currencies = new Set<string>();
  // Oldest succeeded charge per customer, to split new from renewal.
  const firstChargeAt = new Map<string, number>();
  let gross = 0;
  let fees = 0;

  const succeeded = charges.filter((c) => {
    if (c.status === "failed") {
      if (c.created * 1000 >= now - 30 * DAY_MS) rev.failedLast30 += 1;
      return false;
    }
    return c.status === "succeeded" && c.paid;
  });

  for (const c of succeeded) {
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
    if (!customerId) continue;
    const at = c.created * 1000;
    const seen = firstChargeAt.get(customerId);
    if (seen === undefined || at < seen) firstChargeAt.set(customerId, at);
  }

  for (const c of succeeded) {
    const at = c.created * 1000;
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;

    currencies.add(c.currency);

    const grossCents = c.amount_captured || c.amount;
    const refundedCents = c.amount_refunded ?? 0;
    const netCents = grossCents - refundedCents;
    const bt = c.balance_transaction;
    const feeCents = bt && typeof bt !== "string" ? bt.fee : 0;

    gross += grossCents / 100;
    fees += feeCents / 100;

    rev.allTime.count += 1;
    rev.allTime.net += netCents / 100;
    if (at >= startOfToday) {
      rev.today.count += 1;
      rev.today.net += netCents / 100;
    }
    if (at >= now - 7 * DAY_MS) {
      rev.last7.count += 1;
      rev.last7.net += netCents / 100;
      if (refundedCents > 0) {
        rev.refunds7.count += 1;
        rev.refunds7.amount += refundedCents / 100;
      }
    }
    if (at >= now - 30 * DAY_MS) {
      rev.last30.count += 1;
      rev.last30.net += netCents / 100;
    }

    // A charge with no customer can't be attributed, so it counts as a first
    // purchase — that is the conservative reading for a one-off payment.
    const isFirst = !customerId || firstChargeAt.get(customerId) === at;

    if (rev.sales.length < MAX_SALES_SHOWN) {
      rev.sales.push({
        id: c.id,
        at: new Date(at).toISOString(),
        customerId,
        gross: round2(grossCents / 100),
        net: round2(netCents / 100),
        refunded: round2(refundedCents / 100),
        kind: isFirst ? "new" : "renewal",
        chargeName: c.billing_details?.name ?? null,
        chargeEmail: c.billing_details?.email ?? c.receipt_email ?? null,
      });
    }
  }

  if (gross > 0) rev.feeRate = fees / gross;
  rev.currencies = [...currencies];

  // Round money once, at the edge, so the UI never shows 118.99999999999999.
  for (const b of [rev.today, rev.last7, rev.last30, rev.allTime]) b.net = round2(b.net);
  rev.refunds7.amount = round2(rev.refunds7.amount);

  return rev;
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

type Alert = { tone: "bad" | "warn"; text: string };

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

  const [trialsResult, profilesResult, plansResult, quizCountResult, revenue, emails] =
    await Promise.all([
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
      supabaseAdmin.from("user_profiles").select("user_id", { count: "exact", head: true }),
      loadRevenue(tzOffsetMinutes),
      loadEmails(),
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

  const now = new Date();
  const rows = trialsResult.data ?? [];

  /** Stripe customer id → the account it belongs to, for the sales list. */
  const byCustomer = new Map<string, string>();
  for (const r of rows) {
    const cid = r.stripe_customer_id as string | null;
    if (cid) byCustomer.set(cid, r.user_id);
  }

  const state = new Map<string, AccountState>();
  for (const r of rows) state.set(r.user_id, getAccountState(r, now).state);

  const sales = revenue.sales.map((s) => {
    const userId = s.customerId ? byCustomer.get(s.customerId) ?? null : null;
    return {
      id: s.id,
      at: s.at,
      net: s.net,
      gross: s.gross,
      refunded: s.refunded > 0,
      kind: s.kind,
      name: (userId ? nameMap.get(userId) : null) ?? s.chargeName ?? null,
      email: (userId ? emails.get(userId) : null) ?? s.chargeEmail ?? null,
      /** "ready" | "generating" | null — null is a paying customer with nothing to open. */
      planStatus: userId ? planMap.get(userId) ?? null : null,
      known: userId !== null,
    };
  });

  // ─── Anything that needs a human ──────────────────────────────────────────

  const alerts: Alert[] = [];

  const stranded = rows.filter((r) => {
    const s = state.get(r.user_id);
    return (s === "active" || s === "canceling") && planMap.get(r.user_id) !== "ready";
  });
  if (stranded.length > 0) {
    const who = stranded
      .slice(0, 3)
      .map((r) => nameMap.get(r.user_id) || emails.get(r.user_id) || r.user_id.slice(0, 8))
      .join(", ");
    const more = stranded.length > 3 ? ` and ${stranded.length - 3} more` : "";
    alerts.push({
      tone: "bad",
      text: `${who}${more} paid and ${stranded.length === 1 ? "has" : "have"} no plan to open. Resend checkout.session.completed from Stripe.`,
    });
  }

  const disputed = rows.filter((r) => state.get(r.user_id) === "disputed").length;
  if (disputed > 0) {
    alerts.push({
      tone: "bad",
      text: `${disputed} chargeback${disputed === 1 ? "" : "s"} — ${disputed === 1 ? "that account is" : "those accounts are"} locked out. Answer it in Stripe before the evidence window closes.`,
    });
  }

  const pastDue = rows.filter((r) => state.get(r.user_id) === "past_due").length;
  if (pastDue > 0) {
    alerts.push({
      tone: "warn",
      text: `${pastDue} card${pastDue === 1 ? "" : "s"} failed at renewal. Stripe is retrying; ${pastDue === 1 ? "she keeps" : "they keep"} access meanwhile.`,
    });
  }

  if (revenue.refunds7.count > 0) {
    alerts.push({
      tone: "warn",
      text: `${revenue.refunds7.count} refund${revenue.refunds7.count === 1 ? "" : "s"} in the last 7 days — $${revenue.refunds7.amount.toFixed(2)} back out.`,
    });
  }

  if (revenue.failedLast30 > 0) {
    alerts.push({
      tone: "warn",
      text: `${revenue.failedLast30} charge${revenue.failedLast30 === 1 ? "" : "s"} failed at checkout in 30 days — money that reached the card form and bounced.`,
    });
  }

  if (revenue.currencies.length > 1) {
    alerts.push({
      tone: "warn",
      text: `Charges in ${revenue.currencies.join(", ")}. Totals add them as-is, so they are not comparable.`,
    });
  }

  // ─── Funnel ───────────────────────────────────────────────────────────────

  // Conversion is deliberately *not* Stripe purchases over quiz finishers: the
  // charge list also holds renewals, mobile IAP has no Stripe charge at all,
  // and either mismatch pushes the percentage past 100. Both sides come from
  // Supabase instead — accounts that ever reached paid, over accounts that
  // finished the quiz.
  const quizFinished = quizCountResult.count ?? 0;
  const everPaid = rows.filter(
    (r) => r.account_status === "paid" || state.get(r.user_id) !== "ended"
  ).length;

  /** What one $59 sale is worth after Stripe takes its cut. The break-even unit. */
  const keptPerSale = round2(PLAN_PRICE - PLAN_PRICE * revenue.feeRate);

  return NextResponse.json({
    livemode: revenue.livemode,
    revenueError: revenue.error,
    truncated: revenue.truncated || rows.length >= MAX_CLIENTS,
    money: {
      today: revenue.today,
      last7: revenue.last7,
      last30: revenue.last30,
      allTime: revenue.allTime,
    },
    unit: { price: PLAN_PRICE, feeRate: round2(revenue.feeRate * 10000) / 10000, keptPerSale },
    funnel: {
      quizFinished,
      paid: everPaid,
      conversionPct: quizFinished > 0 ? round2((everPaid / quizFinished) * 100) : 0,
    },
    sales,
    /** Total succeeded charges walked, so the list can say "newest 60 of 112". */
    salesTotal: revenue.allTime.count,
    alerts,
    refreshedAt: new Date().toISOString(),
  });
}
