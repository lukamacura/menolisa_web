"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PLAN_PRICE } from "@/lib/pricing";

type AccountState = "active" | "canceling" | "past_due" | "ended" | "disputed";

type Client = {
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
  plan_amount: number | null;
  spend: number | null;
  purchases: number;
  planStatus: string | null;
};

type Bucket = { count: number; net: number };

type Stats = {
  revenue: {
    error: string | null;
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
    today: Bucket;
    last7: Bucket;
    last30: Bucket;
    monthly: { month: string; count: number; net: number }[];
    truncated: boolean;
  };
  llm: {
    available: boolean;
    generations: number;
    totalCost: number;
    avgCostPerGeneration: number;
    maxCostPerGeneration: number;
    last30Cost: number;
    last30Generations: number;
    avgPromptTokens: number;
    avgCompletionTokens: number;
    avgDurationMs: number;
    unpricedCalls: number;
    models: string[];
  };
  subscribers: {
    paying: number;
    byState: Record<AccountState, number>;
    mrr: number;
    unknownPlan: number;
    quizCompleted: number;
    accounts: number;
    everPaid: number;
    conversionPct: number;
    missingPlans: number;
    truncated: boolean;
  };
  clients: Client[];
};

const SESSION_KEY = "admin_panel_pw";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

/** Sub-cent figures — an LLM call costs a few hundredths of a cent. */
const cents = (n: number) =>
  n === 0 ? "$0" : n < 0.01 ? `${(n * 100).toFixed(3)}¢` : `$${n.toFixed(4)}`;

const date = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadStats = useCallback(async (pw: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setStats(null);
        setError("Wrong password.");
        return;
      }
      if (!res.ok) {
        setError("Failed to load stats. Try again.");
        return;
      }
      const data: Stats = await res.json();
      sessionStorage.setItem(SESSION_KEY, pw);
      setStats(data);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore session on mount so a refresh keeps you in.
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) loadStats(saved);
  }, [loadStats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) loadStats(password.trim());
  };

  const clients = useMemo(() => {
    if (!stats) return [];
    const q = query.trim().toLowerCase();
    if (!q) return stats.clients;
    return stats.clients.filter((c) =>
      [c.name, c.email, c.state, c.user_id].some((v) => v?.toLowerCase().includes(q))
    );
  }, [stats, query]);

  // ---- Password gate ----
  if (!stats) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-8 space-y-4"
        >
          <h1 className="text-xl font-bold text-slate-800">Admin access</h1>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    );
  }

  const { revenue, llm, subscribers } = stats;
  // What one sale is worth after Stripe's cut and the two OpenAI calls. The
  // plan is generated once per customer, so it is a one-off cost against the
  // first charge, not a per-renewal one.
  const feeRate = revenue.gross > 0 ? revenue.fees / revenue.gross : 0;
  const unitMargin = PLAN_PRICE - PLAN_PRICE * feeRate - llm.avgCostPerGeneration;

  return (
    <main className="min-h-dvh bg-slate-50 p-6 sm:p-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="flex items-center justify-between pt-20">
          <h1 className="text-2xl font-bold text-slate-800">MenoLisa Admin</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => loadStats(sessionStorage.getItem(SESSION_KEY) ?? "")}
              disabled={loading}
              className="text-sm text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY);
                setStats(null);
                setPassword("");
              }}
              className="text-sm text-slate-500 underline hover:text-slate-700"
            >
              Lock
            </button>
          </div>
        </div>

        {revenue.error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Revenue unavailable: {revenue.error}. Subscriber and cost figures below are unaffected.
          </p>
        )}
        {revenue.livemode === false && (
          <p className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-3 text-sm font-medium text-purple-900">
            Stripe test mode — every revenue figure below is fake money.
          </p>
        )}

        {/* ── Revenue ───────────────────────────────────────────────── */}
        <Section title="Revenue" note="Money actually collected, straight from Stripe charges.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Purchases"
              value={revenue.purchases.toString()}
              sub={`${revenue.firstPurchases} new · ${revenue.renewals} renewals`}
              accent="blue"
            />
            <StatCard
              label="Net revenue"
              value={money(revenue.net)}
              sub={
                revenue.refunded > 0
                  ? `${money(revenue.gross)} gross − ${money(revenue.refunded)} refunded`
                  : `${money(revenue.gross)} gross, no refunds`
              }
              accent="green"
            />
            <StatCard
              label="After Stripe fees"
              value={money(revenue.netAfterFees)}
              sub={`${money(revenue.fees)} in fees (${(feeRate * 100).toFixed(1)}%)`}
              accent="green"
            />
            <StatCard
              label="MRR"
              value={money(subscribers.mrr)}
              sub={`${subscribers.paying} paying · $${PLAN_PRICE}/8wk normalised`}
              accent="blue"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat label="Today" bucket={revenue.today} />
            <MiniStat label="Last 7 days" bucket={revenue.last7} />
            <MiniStat label="Last 30 days" bucket={revenue.last30} />
          </div>

          {revenue.monthly.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-slate-700">By month</h3>
              <ul className="mt-4 space-y-3">
                {revenue.monthly.map((m) => {
                  const max = Math.max(...revenue.monthly.map((x) => x.net), 1);
                  return (
                    <li key={m.month} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-slate-500">{m.month}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(2, (m.net / max) * 100)}%` }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs font-medium text-slate-700">
                        {money(m.net)} · {m.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {revenue.failedLast30 > 0 && <span>{revenue.failedLast30} failed charges in 30d</span>}
            {revenue.currencies.length > 1 && (
              <span className="text-amber-700">
                Mixed currencies ({revenue.currencies.join(", ")}) — totals add them as-is.
              </span>
            )}
            {revenue.truncated && <span>Showing the most recent 1000 charges only.</span>}
          </div>
        </Section>

        {/* ── Funnel + account health ───────────────────────────────── */}
        <Section title="Accounts" note="Where people are, and anything that needs a human.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <SmallCard label="Quiz finished" value={subscribers.quizCompleted} />
            <SmallCard
              label="Converted"
              value={`${subscribers.conversionPct}%`}
              hint={`${subscribers.everPaid} of ${subscribers.quizCompleted} ever paid`}
            />
            <SmallCard label="Active" value={subscribers.byState.active} />
            <SmallCard label="Canceling" value={subscribers.byState.canceling} />
            <SmallCard label="Past due" value={subscribers.byState.past_due} tone={subscribers.byState.past_due > 0 ? "warn" : undefined} />
            <SmallCard label="Ended" value={subscribers.byState.ended} />
          </div>
          {(subscribers.byState.disputed > 0 ||
            subscribers.missingPlans > 0 ||
            subscribers.unknownPlan > 0) && (
            <ul className="mt-4 space-y-2 text-sm">
              {subscribers.byState.disputed > 0 && (
                <Flag tone="bad">{subscribers.byState.disputed} disputed (chargeback) — locked out.</Flag>
              )}
              {subscribers.missingPlans > 0 && (
                <Flag tone="bad">
                  {subscribers.missingPlans} paying customer(s) with no generated plan — check the plan
                  row before they notice.
                </Flag>
              )}
              {subscribers.unknownPlan > 0 && (
                <Flag tone="warn">{subscribers.unknownPlan} paying row(s) with an unrecognised plan_type.</Flag>
              )}
            </ul>
          )}
        </Section>

        {/* ── LLM cost ──────────────────────────────────────────────── */}
        <Section
          title="AI cost"
          note="What generating one 8-week plan costs. A generation is two gpt-4o-mini calls."
        >
          {!llm.available ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              No usage table yet. Apply{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                scripts/sql/2026-08-11-llm-usage.sql
              </code>{" "}
              in the Supabase SQL editor, and figures appear from the next plan generated.
            </p>
          ) : llm.generations === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Table is ready but empty — no plan has been generated since metering went in.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Cost per plan"
                  value={cents(llm.avgCostPerGeneration)}
                  sub={`avg over ${llm.generations} generation${llm.generations === 1 ? "" : "s"} · worst ${cents(llm.maxCostPerGeneration)}`}
                  accent="yellow"
                />
                <StatCard
                  label="Total AI spend"
                  value={money(llm.totalCost)}
                  sub={`${money(llm.last30Cost)} in the last 30 days`}
                  accent="yellow"
                />
                <StatCard
                  label="Margin per sale"
                  value={money(unitMargin)}
                  sub={`$${PLAN_PRICE} − Stripe fee − AI`}
                  accent="green"
                />
                <StatCard
                  label="Tokens per plan"
                  value={`${llm.avgPromptTokens.toLocaleString()} in`}
                  sub={`${llm.avgCompletionTokens.toLocaleString()} out · ${(llm.avgDurationMs / 1000).toFixed(1)}s`}
                  accent="blue"
                />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Models: {llm.models.join(", ")}. Rates from{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5">lib/llmCost.ts</code>, frozen at the
                time of each call.
                {llm.unpricedCalls > 0 && (
                  <span className="text-amber-700">
                    {" "}
                    {llm.unpricedCalls} call(s) used a model with no rate listed — their cost is missing
                    from these totals.
                  </span>
                )}
              </p>
            </>
          )}
        </Section>

        {/* ── Clients ───────────────────────────────────────────────── */}
        <Section title={`Clients (${stats.clients.length})`} note="Every account with a billing row.">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or id…"
            className="mb-4 w-full max-w-sm rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Renews / ends</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      {query ? "No match." : "No clients yet."}
                    </td>
                  </tr>
                )}
                {clients.map((c) => (
                  <tr key={c.user_id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.name ?? "—"}</div>
                      <div className="text-xs text-slate-500">{c.email ?? "no email yet"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StateBadge state={c.state} />
                      {c.provider && c.provider !== "stripe" && (
                        <div className="mt-1 text-xs capitalize text-slate-500">{c.provider}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{date(c.created_at)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {date(c.subscription_ends_at)}
                      {c.subscription_canceled && (
                        <div className="text-xs text-amber-700">cancels</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {c.spend === null ? "—" : money(c.spend)}
                      {c.purchases > 1 && (
                        <div className="text-xs font-normal text-slate-500">{c.purchases}×</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge status={c.planStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {subscribers.truncated && (
            <p className="mt-2 text-xs text-slate-500">Showing the {stats.clients.length} newest accounts.</p>
          )}
        </Section>
      </div>
    </main>
  );
}

// ─── Presentational bits ────────────────────────────────────────────────────

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {note && <p className="mb-4 mt-0.5 text-sm text-slate-500">{note}</p>}
      {children}
    </section>
  );
}

const ACCENTS = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
  red: "border-red-200 bg-red-50 text-red-700",
} as const;

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${ACCENTS[accent]}`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-70">{sub}</p>
    </div>
  );
}

function MiniStat({ label, bucket }: { label: string; bucket: Bucket }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800">{money(bucket.net)}</p>
      <p className="text-xs text-slate-500">
        {bucket.count} purchase{bucket.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function SmallCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Flag({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <li
      className={`rounded-xl border px-4 py-2.5 ${
        tone === "bad"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-amber-200 bg-amber-50 text-amber-800"
      }`}
    >
      {children}
    </li>
  );
}

const STATE_STYLES: Record<AccountState, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  canceling: "bg-amber-50 text-amber-700 border-amber-200",
  past_due: "bg-orange-50 text-orange-700 border-orange-200",
  ended: "bg-slate-100 text-slate-500 border-slate-200",
  disputed: "bg-red-50 text-red-700 border-red-200",
};

const STATE_LABELS: Record<AccountState, string> = {
  active: "Active",
  canceling: "Canceling",
  past_due: "Past due",
  ended: "Ended",
  disputed: "Disputed",
};

function StateBadge({ state }: { state: AccountState }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATE_STYLES[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

function PlanBadge({ status }: { status: string | null }) {
  if (status === "ready") return <span className="text-xs text-slate-500">ready</span>;
  if (status === "generating")
    return <span className="text-xs text-amber-700">generating…</span>;
  return <span className="text-xs text-slate-400">none</span>;
}
