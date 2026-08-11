import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { PLAN_WEEKS } from "@/lib/pricing";
import { getAccountState, type AccountState } from "@/lib/getAccountState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~6.52 billing periods a year for an 8-week plan. Used to normalize it to MRR. */
const PERIODS_PER_YEAR_8W = 365.25 / (PLAN_WEEKS * 7);

// Admin panel password. Set ADMIN_PANEL_PASSWORD in the env + Vercel.
// No fallback: a default committed to the repo is a published password, and
// this endpoint hands out revenue figures, customer emails and subscriber
// names. Unset means the panel is closed, which is the right failure mode for
// an admin surface.
const ADMIN_PASSWORD = process.env.ADMIN_PANEL_PASSWORD;

/**
 * How far back the Stripe walk goes. Every charge is one page-hundredth of a
 * round trip, and at current volume the whole history is a single page — but an
 * unbounded auto-page would eventually make this endpoint time out rather than
 * load slowly, so it stops and says so.
 */
const MAX_CHARGES = 1000;
/** Same idea for the account table and the usage log. */
const MAX_CLIENTS = 500;
const MAX_USAGE_ROWS = 5000;

const DAY_MS = 86_400_000;

type ClientRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  state: AccountState;
  account_status: string | null;
  plan_type: string | null;
  created_at: string | null;
  subscription_ends_at: string | null;
  subscription_canceled: boolean | null;
  provider: string | null;
  /** Stripe unit amount for the period, in cents — what a renewal will charge. */
  plan_amount: number | null;
  /** Lifetime money collected from this person, in dollars, net of refunds. */
  spend: number | null;
  purchases: number;
  /** No plan row generated yet — a paying customer with nothing to open. */
  planStatus: string | null;
};

// ─── Stripe: what was actually collected ────────────────────────────────────

type RevenueBucket = { count: number; net: number };

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
  purchases: number;
  firstPurchases: number;
  renewals: number;
  gross: number;
  refunded: number;
  net: number;
  fees: number;
  netAfterFees: number;
  failedLast30: number;
  today: RevenueBucket;
  last7: RevenueBucket;
  last30: RevenueBucket;
  /** Oldest → newest, last 6 calendar months (UTC). */
  monthly: { month: string; count: number; net: number }[];
  /** Hit MAX_CHARGES — the figures above are a recent slice, not all time. */
  truncated: boolean;
  /** Stripe customer id → net dollars, for the client table. */
  spendByCustomer: Record<string, { net: number; purchases: number }>;
};

function emptyRevenue(error: string | null): Revenue {
  return {
    error,
    livemode: null,
    currencies: [],
    purchases: 0,
    firstPurchases: 0,
    renewals: 0,
    gross: 0,
    refunded: 0,
    net: 0,
    fees: 0,
    netAfterFees: 0,
    failedLast30: 0,
    today: { count: 0, net: 0 },
    last7: { count: 0, net: 0 },
    last30: { count: 0, net: 0 },
    monthly: [],
    truncated: false,
    spendByCustomer: {},
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
async function loadRevenue(): Promise<Revenue> {
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
  const startOfTodayUtc = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate()
  );
  const monthly = new Map<string, RevenueBucket>();
  const currencies = new Set<string>();
  // Oldest succeeded charge per customer, to split new from renewal.
  const firstChargeAt = new Map<string, number>();

  for (const c of charges) {
    const at = c.created * 1000;
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;

    if (c.status === "failed") {
      if (at >= now - 30 * DAY_MS) rev.failedLast30 += 1;
      continue;
    }
    if (c.status !== "succeeded" || !c.paid) continue;

    currencies.add(c.currency);

    const grossCents = c.amount_captured || c.amount;
    const refundedCents = c.amount_refunded ?? 0;
    const netCents = grossCents - refundedCents;
    const bt = c.balance_transaction;
    const feeCents = bt && typeof bt !== "string" ? bt.fee : 0;

    rev.purchases += 1;
    rev.gross += grossCents / 100;
    rev.refunded += refundedCents / 100;
    rev.net += netCents / 100;
    rev.fees += feeCents / 100;

    if (at >= startOfTodayUtc) {
      rev.today.count += 1;
      rev.today.net += netCents / 100;
    }
    if (at >= now - 7 * DAY_MS) {
      rev.last7.count += 1;
      rev.last7.net += netCents / 100;
    }
    if (at >= now - 30 * DAY_MS) {
      rev.last30.count += 1;
      rev.last30.net += netCents / 100;
    }

    const d = new Date(at);
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = monthly.get(monthKey) ?? { count: 0, net: 0 };
    bucket.count += 1;
    bucket.net += netCents / 100;
    monthly.set(monthKey, bucket);

    if (customerId) {
      const prev = rev.spendByCustomer[customerId] ?? { net: 0, purchases: 0 };
      prev.net += netCents / 100;
      prev.purchases += 1;
      rev.spendByCustomer[customerId] = prev;
      const seen = firstChargeAt.get(customerId);
      if (seen === undefined || at < seen) firstChargeAt.set(customerId, at);
    }
  }

  // A charge with no customer can't be attributed, so it counts as a first
  // purchase — that is the conservative reading for a one-off payment.
  for (const c of charges) {
    if (c.status !== "succeeded" || !c.paid) continue;
    const customerId = typeof c.customer === "string" ? c.customer : c.customer?.id ?? null;
    const isFirst = !customerId || firstChargeAt.get(customerId) === c.created * 1000;
    if (isFirst) rev.firstPurchases += 1;
    else rev.renewals += 1;
  }

  rev.netAfterFees = rev.net - rev.fees;
  rev.currencies = [...currencies];
  rev.monthly = [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, b]) => ({ month, count: b.count, net: round2(b.net) }));

  // Round money once, at the edge, so the UI never shows 118.99999999999999.
  rev.gross = round2(rev.gross);
  rev.refunded = round2(rev.refunded);
  rev.net = round2(rev.net);
  rev.fees = round2(rev.fees);
  rev.netAfterFees = round2(rev.netAfterFees);
  rev.today.net = round2(rev.today.net);
  rev.last7.net = round2(rev.last7.net);
  rev.last30.net = round2(rev.last30.net);
  for (const k of Object.keys(rev.spendByCustomer)) {
    rev.spendByCustomer[k].net = round2(rev.spendByCustomer[k].net);
  }

  return rev;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── OpenAI: what a plan costs to make ──────────────────────────────────────

type UsageRow = {
  run_id: string;
  kind: string;
  model: string;
  prompt_tokens: number | null;
  cached_prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: string | number | null;
  duration_ms: number | null;
  created_at: string;
};

type LlmStats = {
  /** False until scripts/sql/2026-08-11-llm-usage.sql has been applied. */
  available: boolean;
  generations: number;
  totalCost: number;
  /** Per *generation* (both calls), not per call — see the migration's note. */
  avgCostPerGeneration: number;
  maxCostPerGeneration: number;
  last30Cost: number;
  last30Generations: number;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  avgDurationMs: number;
  /** Calls whose model isn't in lib/llmCost.ts, so their cost is unknown. */
  unpricedCalls: number;
  models: string[];
};

async function loadLlmStats(): Promise<LlmStats> {
  const empty: LlmStats = {
    available: false,
    generations: 0,
    totalCost: 0,
    avgCostPerGeneration: 0,
    maxCostPerGeneration: 0,
    last30Cost: 0,
    last30Generations: 0,
    avgPromptTokens: 0,
    avgCompletionTokens: 0,
    avgDurationMs: 0,
    unpricedCalls: 0,
    models: [],
  };

  const { data, error } = await getSupabaseAdmin()
    .from("llm_usage")
    .select("run_id, kind, model, prompt_tokens, cached_prompt_tokens, completion_tokens, cost_usd, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_USAGE_ROWS);

  // 42P01 = table not there yet. The migration is applied by hand, so the panel
  // has to render fine in the window between deploying this and running it.
  if (error) {
    if (error.code !== "42P01") console.error("Admin stats: llm_usage query failed:", error);
    return empty;
  }

  const rows = (data ?? []) as UsageRow[];
  const runs = new Map<
    string,
    { cost: number; prompt: number; completion: number; duration: number; at: number }
  >();
  const models = new Set<string>();
  let unpriced = 0;

  for (const r of rows) {
    models.add(r.model);
    // numeric comes back as a string over PostgREST.
    const cost = r.cost_usd === null ? null : Number(r.cost_usd);
    if (cost === null || Number.isNaN(cost)) unpriced += 1;
    const run = runs.get(r.run_id) ?? {
      cost: 0,
      prompt: 0,
      completion: 0,
      duration: 0,
      at: new Date(r.created_at).getTime(),
    };
    run.cost += cost ?? 0;
    run.prompt += r.prompt_tokens ?? 0;
    run.completion += r.completion_tokens ?? 0;
    // The two calls run in parallel, so the generation takes as long as the
    // slower one — summing them would overstate it by roughly double.
    run.duration = Math.max(run.duration, r.duration_ms ?? 0);
    run.at = Math.min(run.at, new Date(r.created_at).getTime());
    runs.set(r.run_id, run);
  }

  const all = [...runs.values()];
  if (all.length === 0) return { ...empty, available: true };

  const cutoff = Date.now() - 30 * DAY_MS;
  const recent = all.filter((r) => r.at >= cutoff);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  return {
    available: true,
    generations: all.length,
    totalCost: round4(sum(all.map((r) => r.cost))),
    avgCostPerGeneration: round4(sum(all.map((r) => r.cost)) / all.length),
    maxCostPerGeneration: round4(Math.max(...all.map((r) => r.cost))),
    last30Cost: round4(sum(recent.map((r) => r.cost))),
    last30Generations: recent.length,
    avgPromptTokens: Math.round(sum(all.map((r) => r.prompt)) / all.length),
    avgCompletionTokens: Math.round(sum(all.map((r) => r.completion)) / all.length),
    avgDurationMs: Math.round(sum(all.map((r) => r.duration)) / all.length),
    unpricedCalls: unpriced,
    models: [...models],
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

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

export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PANEL_PASSWORD is not set — admin stats endpoint disabled");
    return NextResponse.json({ error: "Admin panel is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body?.password !== "string" || body.password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const [trialsResult, profilesResult, plansResult, quizCountResult, revenue, llm, emails] =
    await Promise.all([
      supabaseAdmin
        .from("user_trials")
        .select(
          "user_id, created_at, account_status, plan_type, plan_amount, subscription_ends_at, subscription_canceled, payment_failed_at, dispute_flagged_at, stripe_customer_id, stripe_subscription_id, provider"
        )
        .order("created_at", { ascending: false })
        .limit(MAX_CLIENTS),
      supabaseAdmin.from("user_profiles").select("user_id, name"),
      supabaseAdmin.from("user_plans").select("user_id, status"),
      supabaseAdmin.from("user_profiles").select("user_id", { count: "exact", head: true }),
      loadRevenue(),
      loadLlmStats(),
      loadEmails(),
    ]);

  if (trialsResult.error) {
    console.error("Admin stats query failed:", trialsResult.error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }

  const nameMap = new Map((profilesResult.data ?? []).map((p) => [p.user_id, p.name as string | null]));
  const planMap = new Map((plansResult.data ?? []).map((p) => [p.user_id, p.status as string | null]));

  const now = new Date();
  const clients: ClientRow[] = (trialsResult.data ?? []).map((r) => {
    const customerId = r.stripe_customer_id as string | null;
    const spend = customerId ? revenue.spendByCustomer[customerId] : undefined;
    return {
      user_id: r.user_id,
      name: nameMap.get(r.user_id) ?? null,
      email: emails.get(r.user_id) ?? null,
      state: getAccountState(r, now).state,
      account_status: r.account_status,
      plan_type: r.plan_type,
      created_at: r.created_at,
      subscription_ends_at: r.subscription_ends_at,
      subscription_canceled: r.subscription_canceled,
      provider: r.provider,
      plan_amount: typeof r.plan_amount === "number" ? r.plan_amount : null,
      spend: spend ? spend.net : null,
      purchases: spend ? spend.purchases : 0,
      planStatus: planMap.get(r.user_id) ?? null,
    };
  });

  // MRR counts people who keep access and haven't cancelled — i.e. a renewal is
  // actually expected from them. `plan_amount` is the Stripe unit amount in
  // cents for the period, normalized here to a monthly figure.
  let mrrCents = 0;
  let unknownPlan = 0;
  const byState: Record<AccountState, number> = {
    active: 0,
    canceling: 0,
    past_due: 0,
    ended: 0,
    disputed: 0,
  };

  for (const c of clients) {
    byState[c.state] += 1;
    if (c.state !== "active" && c.state !== "past_due") continue;
    if (c.plan_type === "plan8w") {
      mrrCents += Math.round(((c.plan_amount ?? 0) * PERIODS_PER_YEAR_8W) / 12);
    } else {
      unknownPlan += 1;
    }
  }

  const paying = byState.active + byState.canceling + byState.past_due;
  const quizCompleted = quizCountResult.count ?? 0;

  // Conversion is deliberately *not* Stripe purchases over quiz finishers: the
  // charge list also holds renewals, mobile IAP has no Stripe charge at all,
  // and either mismatch pushes the percentage past 100. Both sides come from
  // Supabase instead — accounts that ever reached paid, over accounts that
  // finished the quiz.
  const everPaid = clients.filter(
    (c) => c.account_status === "paid" || c.state !== "ended" || c.purchases > 0
  ).length;

  return NextResponse.json({
    revenue,
    llm,
    subscribers: {
      paying,
      byState,
      mrr: mrrCents / 100,
      unknownPlan,
      /** Everyone who finished the quiz — the denominator for conversion. */
      quizCompleted,
      accounts: clients.length,
      everPaid,
      conversionPct: quizCompleted > 0 ? round2((everPaid / quizCompleted) * 100) : 0,
      /** Paying customers whose plan never generated — each one is a support case. */
      missingPlans: clients.filter(
        (c) => (c.state === "active" || c.state === "canceling") && c.planStatus !== "ready"
      ).length,
      truncated: clients.length >= MAX_CLIENTS,
    },
    clients,
  });
}
