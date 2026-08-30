"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The sales desk.
 *
 * One question — **should I spend more on ads tomorrow?** — answered on the
 * first line, with the working underneath in the order you'd actually ask it:
 * what came in, what she cost against what she's worth, where they stop, who
 * bought, what's broken.
 *
 * ── Every number says where it came from ────────────────────────────────────
 *
 * Each block carries a source tag, because the split is load-bearing and easy
 * to forget:
 *
 *   **Stripe = money.** Every dollar. Charges are immutable and there is one
 *   per payment, forever, so it is the only ledger there is.
 *
 *   **Supabase = people.** Names, emails, quiz finishers, renewal dates, plan
 *   status, cancellations. Never money — `user_trials` holds one row per person
 *   and overwrites it on every renewal, so last month's revenue is simply not
 *   in there to read.
 *
 * ── What was removed on 2026-08-30, and why not to put it back ──────────────
 *
 *   * **"Profit"** — it was all-time revenue minus a hand-typed spend total,
 *     with no Stripe fees, no fixed costs and two windows that never lined up.
 *     Contribution replaced it: one stated window, every deduction named.
 *   * **The "Her plan" column** — an ops signal in a money table, already
 *     duplicated by the alert underneath it.
 *   * **Refund and declined-card banners** — figures, not emergencies. They sit
 *     in Cash now so the alert block stays alarming.
 *   * **"Collected today" as the headline** — at two sales a day it swings 100%
 *     on noise. Seven days leads; today is a cell.
 *   * **Ad spend in localStorage** — one browser, one number, no history, and
 *     therefore no windowed cost per sale. It lives in `ad_spend` now.
 */

type Bucket = { count: number; net: number; kept: number };

type Sale = {
  id: string;
  at: string;
  net: number;
  gross: number;
  refunded: boolean;
  kind: "new" | "renewal";
  name: string | null;
  email: string | null;
  renewsAt: string | null;
};

type Stats = {
  livemode: boolean | null;
  revenueError: string | null;
  spendWriteError: string | null;
  truncated: boolean;
  verdict: { tone: "good" | "warn" | "bad" | "idle"; word: string; text: string };
  money: { today: Bucket; last7: Bucket; last30: Bucket; allTime: Bucket };
  series: { revenue: number[]; spend: number[] };
  costs: {
    adSpend30: number;
    adSpend7: number;
    lastLoggedDay: string | null;
    missingDays: string[];
    todayIso: string;
    todaySpend: number | null;
    fixedMonthly: number;
    servingPerCustomer: number;
  };
  acq: { newCustomers30: number; cac: number | null; keptPerSale: number; feeRate: number };
  retention: {
    renewalRate: number | null;
    cohortSize: number;
    cohortRenewed: number;
    maturesAt: string | null;
    ltv: number | null;
    roas: number | null;
  };
  forward: {
    booked30: number;
    bookedCount: number;
    cancelsPending: number;
    cancelsAtRisk: number;
    guaranteeExposure: number;
    refunds30: { count: number; amount: number };
    declined30: number;
  };
  funnel: {
    quizFinished30: number;
    checkoutStarted30: number;
    paidNew30: number;
    sessionsError: string | null;
  };
  contribution30: number;
  sales: Sale[];
  salesTotal: number;
  alerts: { tone: "bad" | "warn" | "money"; label: string; text: string }[];
  refreshedAt: string;
};

const SESSION_KEY = "admin_panel_pw";

const money = (n: number, dp?: number) => {
  const neg = n < 0;
  const a = Math.abs(n);
  const s = a.toLocaleString("en-US", {
    minimumFractionDigits: dp ?? (a % 1 === 0 ? 0 : 2),
    maximumFractionDigits: dp ?? 2,
  });
  return `${neg ? "−" : ""}$${s}`;
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "12 min ago" / "2 hr ago" / "Yesterday" / "3 days ago" / "12 Jul". */
function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spendDay, setSpendDay] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [savingSpend, setSavingSpend] = useState(false);

  const load = useCallback(async (pw: string, spend?: { day: string; amount: number | null }) => {
    if (spend) setSavingSpend(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: pw,
          // So "Collected today" means your today, not UTC's.
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          ...(spend ? { spend } : {}),
        }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SESSION_KEY);
        setStats(null);
        setError("Wrong password.");
        return;
      }
      if (!res.ok) {
        setError("Couldn't load the numbers. Try again.");
        return;
      }
      const data: Stats = await res.json();
      sessionStorage.setItem(SESSION_KEY, pw);
      setStats(data);
      if (!spendDay) setSpendDay(data.costs.todayIso);
      if (spend) setSpendAmount("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
      setSavingSpend(false);
    }
  }, [spendDay]);

  // Restore session on mount so a refresh keeps you in.
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSpend = () => {
    const pw = sessionStorage.getItem(SESSION_KEY);
    if (!pw || !spendDay) return;
    const digits = spendAmount.replace(/[^0-9.]/g, "");
    const amount = digits === "" ? null : Math.round(parseFloat(digits) * 100) / 100;
    if (amount !== null && !Number.isFinite(amount)) return;
    load(pw, { day: spendDay, amount });
  };

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F7F3F5] p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.trim()) load(password.trim());
          }}
          className="w-full max-w-sm space-y-4 rounded border border-[#E6DCE2] bg-white p-8 shadow-sm"
        >
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[#1C181F]">MenoLisa</h1>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#948B9B]">Sales desk</p>
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border border-[#D6CBD2] px-4 py-3 text-[#1C181F] outline-none focus:border-[#A8336E] focus:ring-2 focus:ring-[#A8336E]/20"
          />
          {error && <p className="text-sm text-[#A02219]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-[#1C181F] py-3 font-medium text-white transition-colors hover:bg-[#A8336E] disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    );
  }

  const { money: m, costs, acq, retention, forward, funnel, verdict, sales, alerts } = stats;

  return (
    <main className="min-h-dvh bg-[#F7F3F5] px-5 pb-20 pt-10 text-[#1C181F] sm:px-8">
      <div className="mx-auto max-w-[1060px]">
        {/* ── Masthead ────────────────────────────────────────────────────── */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">MenoLisa</h1>
            <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#948B9B]">
              Sales desk
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#5F5566]">
            {stats.livemode === false && (
              <span className="rounded border border-[#8E5A0E]/35 bg-[#FAEEDA] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8E5A0E]">
                Stripe test mode
              </span>
            )}
            {stats.livemode === true && (
              <span className="rounded border border-[#146B4E]/30 bg-[#E1F0E9] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#146B4E]">
                Live
              </span>
            )}
            <button
              onClick={() => load(sessionStorage.getItem(SESSION_KEY) ?? "")}
              disabled={loading}
              className="underline underline-offset-4 hover:text-[#1C181F] disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY);
                setStats(null);
                setPassword("");
              }}
              className="underline underline-offset-4 hover:text-[#1C181F]"
            >
              Lock
            </button>
          </div>
        </header>

        {stats.revenueError && (
          <p className="mb-5 rounded border border-[#8E5A0E]/30 bg-[#FAEEDA] px-4 py-3 text-sm text-[#8E5A0E]">
            Stripe unavailable: {stats.revenueError}. Everything that comes from Supabase still
            reads correctly below.
          </p>
        )}

        {/* ── The verdict ─────────────────────────────────────────────────── */}
        <Verdict verdict={verdict} />

        {/* ── 1. Cash in ──────────────────────────────────────────────────── */}
        <SectionHead title="Cash in" source="Stripe" note="Charges, net of refunds" />
        <div className="overflow-hidden rounded border border-[#E6DCE2] bg-white shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1.35fr]">
            <div className="border-b border-[#E6DCE2] px-6 py-5 md:border-b-0 md:border-r">
              <Label>Collected, last 7 days</Label>
              <p
                className={`mt-2 font-serif text-5xl leading-none tracking-tight tabular-nums sm:text-6xl ${
                  m.last7.net > 0 ? "" : "text-[#948B9B]"
                }`}
              >
                {money(m.last7.net)}
              </p>
              <p className="mt-2 text-[13px] text-[#5F5566]">
                {m.last7.count > 0
                  ? `${plural(m.last7.count, "sale")} · ${money(m.last7.kept)} kept after Stripe's fee`
                  : "No sales in the last 7 days"}
              </p>
            </div>
            <div className="grid grid-cols-3">
              <Cell label="Today" bucket={m.today} />
              <Cell label="Last 30 days" bucket={m.last30} bordered />
              <Cell label="All time" bucket={m.allTime} bordered />
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-[#E6DCE2] bg-[#FBF8F9] px-6 py-3 text-[12.5px] text-[#5F5566]">
            <span>
              Already on the calendar, next 30 days{" "}
              <b className="font-semibold tabular-nums text-[#A8336E]">
                {money(forward.booked30)}
              </b>{" "}
              <span className="text-[#948B9B]">
                ({plural(forward.bookedCount, "renewal")} scheduled
                {forward.cancelsPending > 0 && `, ${forward.cancelsPending} already cancelled`})
              </span>
            </span>
            <span>
              Refunded, 30 days{" "}
              <b className="font-semibold tabular-nums text-[#1C181F]">
                {money(forward.refunds30.amount)}
              </b>
            </span>
            <span>
              Cards declined at checkout, 30 days{" "}
              <b className="font-semibold tabular-nums text-[#1C181F]">{forward.declined30}</b>
            </span>
          </div>
        </div>

        {/* ── 2. Unit economics ───────────────────────────────────────────── */}
        <SectionHead
          title="What she costs, what she's worth"
          source="Stripe + your ad spend"
          note="Last 30 days"
        />
        <div className="overflow-hidden rounded border border-[#E6DCE2] bg-white shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Costs */}
            <div className="px-6 py-4">
              <Label className="mb-2 block">Cost to get her</Label>
              <Row
                label="Meta ad spend, 30 days"
                hint={
                  costs.lastLoggedDay
                    ? `Last logged ${shortDate(costs.lastLoggedDay)}${
                        costs.missingDays.length
                          ? ` · ${costs.missingDays.length} of the last 7 days missing`
                          : ""
                      }`
                    : "Nothing logged yet"
                }
                value={costs.adSpend30 > 0 ? money(costs.adSpend30) : "—"}
                tone={costs.adSpend30 > 0 ? undefined : "mute"}
              />
              <Row
                label="New customers, 30 days"
                hint="Renewals excluded — ads don't buy those"
                value={String(acq.newCustomers30)}
              />
              <Row
                label="Cost per new customer"
                hint={
                  acq.cac === null
                    ? costs.adSpend30 > 0
                      ? "No new customers to divide by yet"
                      : "Log a day of ad spend to see it"
                    : acq.cac <= acq.keptPerSale
                      ? `Under the ${money(acq.keptPerSale)} you keep on the first sale`
                      : `Over the ${money(acq.keptPerSale)} you keep on the first sale`
                }
                value={acq.cac === null ? "—" : money(acq.cac)}
                tone={
                  acq.cac === null ? "mute" : acq.cac <= acq.keptPerSale ? "good" : "bad"
                }
                big
              />
              <Row
                label="Fixed costs, per month"
                hint={
                  costs.fixedMonthly > 0
                    ? "Hosting, database, email, domain"
                    : "Not set — add ADMIN_FIXED_MONTHLY_USD to the env"
                }
                value={costs.fixedMonthly > 0 ? money(costs.fixedMonthly) : "—"}
                tone={costs.fixedMonthly > 0 ? undefined : "mute"}
              />
              <Row
                label="Serving cost per customer"
                hint="Measured from every OpenAI call for plan generation. Lisa chat is not metered, so this is a floor."
                value={`$${costs.servingPerCustomer.toFixed(4)}`}
                tone="mute"
              />
            </div>

            {/* Value */}
            <div className="border-t border-[#E6DCE2] px-6 py-4 lg:border-l lg:border-t-0">
              <Label className="mb-2 block">What she returns</Label>
              <Row
                label="Kept per sale"
                hint={`$59 less Stripe's measured fee (${(acq.feeRate * 100).toFixed(2)}%)`}
                value={money(acq.keptPerSale)}
              />
              <Row
                label="Renewal rate"
                hint={
                  retention.renewalRate === null
                    ? retention.maturesAt
                      ? `No first period has closed yet — the earliest matures ${shortDate(retention.maturesAt)}`
                      : "Nobody has bought yet"
                    : `${retention.cohortRenewed} of the ${retention.cohortSize} whose first 8 weeks ended`
                }
                value={
                  retention.renewalRate === null ? "Not yet known" : `${retention.renewalRate}%`
                }
                tone={retention.renewalRate === null ? "mute" : undefined}
              />
              <Row
                label="Lifetime value, kept"
                hint={
                  retention.ltv === null
                    ? "Locked until the first 8-week period closes"
                    : "What one woman is worth across all the periods she stays"
                }
                value={retention.ltv === null ? "—" : money(retention.ltv)}
                tone={retention.ltv === null ? "mute" : undefined}
                big
              />
              <Row
                label="Payback"
                hint="How many 8-week periods to earn back what she cost"
                value={
                  acq.cac === null
                    ? "—"
                    : acq.cac <= acq.keptPerSale
                      ? "Immediate"
                      : `${Math.ceil(acq.cac / acq.keptPerSale)} periods`
                }
                tone={acq.cac === null ? "mute" : undefined}
              />
              <Row
                label="Return on every ad dollar"
                hint="Lifetime value ÷ cost per customer. Above 2× is room to scale."
                value={retention.roas === null ? "—" : `${retention.roas.toFixed(2)}×`}
                tone={
                  retention.roas === null ? "mute" : retention.roas >= 2 ? "good" : "bad"
                }
              />
            </div>
          </div>

          {/* Log ad spend */}
          <div className="flex flex-wrap items-end gap-3 border-t border-[#E6DCE2] bg-[#FBF8F9] px-6 py-4">
            <div>
              <Label className="mb-1 block">Log ad spend</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={spendDay}
                  max={costs.todayIso}
                  onChange={(e) => setSpendDay(e.target.value)}
                  className="rounded border border-[#D6CBD2] bg-white px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-[#A8336E]"
                />
                <div className="flex items-center rounded border border-[#D6CBD2] bg-white pl-2.5">
                  <span className="text-[13px] text-[#948B9B]">$</span>
                  <input
                    value={spendAmount}
                    onChange={(e) => setSpendAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSpend();
                    }}
                    inputMode="decimal"
                    placeholder={
                      spendDay === costs.todayIso && costs.todaySpend !== null
                        ? String(costs.todaySpend)
                        : "0.00"
                    }
                    aria-label="Ad spend for the selected day"
                    className="w-24 bg-transparent px-1.5 py-1.5 text-[13px] tabular-nums outline-none"
                  />
                </div>
                <button
                  onClick={saveSpend}
                  disabled={savingSpend || !spendDay}
                  className="rounded bg-[#1C181F] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#A8336E] disabled:opacity-50"
                >
                  {savingSpend ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <p className="max-w-[42ch] text-[12px] leading-snug text-[#948B9B]">
              One number per day, copied from Meta Ads Manager. Leave the amount blank and save to
              clear a day.
            </p>
            {stats.spendWriteError && (
              <p className="text-[12.5px] text-[#A02219]">{stats.spendWriteError}</p>
            )}
          </div>

          {/* Chart */}
          <div className="border-t border-[#E6DCE2] px-6 pb-3 pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Label>Running total, cash collected vs ad spend, 30 days</Label>
              <div className="flex gap-4 text-[12px] text-[#5F5566]">
                <span className="inline-flex items-center gap-1.5">
                  <i className="block h-[2.5px] w-3.5 rounded-sm bg-[#A8336E]" />
                  Collected
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <i className="block w-3.5 border-t-[2.5px] border-dashed border-[#948B9B]" />
                  Ad spend
                </span>
              </div>
            </div>
            <CashChart revenue={stats.series.revenue} spend={stats.series.spend} />
          </div>

          {/* Contribution */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-t border-[#E6DCE2] bg-[#FBF8F9] px-6 py-4">
            <p className="max-w-[62ch] text-[13px] text-[#5F5566]">
              <b className="font-semibold text-[#1C181F]">Contribution, last 30 days.</b>{" "}
              {money(m.last30.kept)} kept, less {money(costs.adSpend30)} ads,{" "}
              {money(costs.fixedMonthly)} fixed and{" "}
              {money(m.last30.count * costs.servingPerCustomer, 2)} serving cost.
            </p>
            <p
              className={`font-serif text-3xl tracking-tight tabular-nums ${
                stats.contribution30 >= 0 ? "text-[#146B4E]" : "text-[#A02219]"
              }`}
            >
              {money(stats.contribution30, 2)}
            </p>
          </div>
        </div>

        {/* ── 3. Funnel ───────────────────────────────────────────────────── */}
        <SectionHead
          title="Where they stop"
          source="Supabase + Stripe"
          note="Last 30 days"
        />
        <div className="overflow-hidden rounded border border-[#E6DCE2] bg-white shadow-sm">
          <div className="px-6 py-5">
            <Funnel
              quiz={funnel.quizFinished30}
              checkout={funnel.checkoutStarted30}
              paid={funnel.paidNew30}
              sessionsError={funnel.sessionsError}
            />
          </div>
          <div className="border-t border-[#E6DCE2] bg-[#FBF8F9] px-6 py-3 text-[12.5px] text-[#5F5566]">
            {funnel.quizFinished30 > 0 ? (
              <>
                Every 100 quiz finishers are worth{" "}
                <b className="font-semibold tabular-nums text-[#1C181F]">
                  {money((funnel.paidNew30 / funnel.quizFinished30) * 100 * acq.keptPerSale, 0)}
                </b>{" "}
                kept. That is what a click is allowed to cost.
              </>
            ) : (
              "Nobody has finished the quiz in the last 30 days."
            )}
          </div>
        </div>

        {/* ── 4. Latest sales ─────────────────────────────────────────────── */}
        <SectionHead
          title="Latest sales"
          source="Stripe + Supabase"
          note={
            sales.length === 0
              ? "Newest first"
              : sales.length < stats.salesTotal
                ? `Newest ${sales.length} of ${stats.salesTotal} charges`
                : `${plural(sales.length, "charge")} Stripe cleared`
          }
        />
        <div className="overflow-hidden rounded border border-[#E6DCE2] bg-white shadow-sm">
          {sales.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="text-base font-semibold">No sales yet</h3>
              <p className="mx-auto mt-1.5 max-w-[48ch] text-sm text-[#5F5566]">
                The first row lands here the moment Stripe clears a charge. Nothing is broken — this
                is what the screen looks like before anyone has paid.
              </p>
              <ul className="mx-auto mt-5 grid max-w-[48ch] gap-1.5 text-left text-[13px] text-[#5F5566]">
                <EmptyPoint>
                  {funnel.quizFinished30 > 0
                    ? `${plural(funnel.quizFinished30, "woman")} finished the quiz in 30 days, so traffic is arriving`
                    : "Nobody has finished the quiz — check the ads are actually delivering"}
                </EmptyPoint>
                {stats.livemode === false && (
                  <EmptyPoint>Stripe is in test mode — swap the key before you go live</EmptyPoint>
                )}
                <EmptyPoint>
                  A real checkout that never appears here is a webhook problem, not a sales problem
                </EmptyPoint>
              </ul>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E6DCE2] text-[10.5px] uppercase tracking-[0.11em] text-[#948B9B]">
                    <th className="px-5 py-3 font-semibold">When</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold" />
                    <th className="px-5 py-3 text-right font-semibold">Paid</th>
                    <th className="px-5 py-3 font-semibold">Renews</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[#F0E9ED] last:border-0 hover:bg-[#FBF8F9]"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-[13px]">
                        {relative(s.at)}
                        <span className="block text-[11.5px] text-[#948B9B]">{stamp(s.at)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold">{s.name ?? "—"}</span>
                        <span className="block text-[12.5px] text-[#5F5566]">
                          {s.email ?? "no email on the charge"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Tag kind={s.refunded ? "refunded" : s.kind} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">
                        {s.refunded ? (
                          <span className="text-[#A02219]">
                            {s.net > 0 ? money(s.net) : `−${money(s.gross)}`}
                          </span>
                        ) : (
                          money(s.net)
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] tabular-nums text-[#5F5566]">
                        {s.renewsAt ? shortDate(s.renewsAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 5. Needs a human ────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <>
            <SectionHead
              title="Needs a human"
              note="Only here when something is actually wrong"
            />
            <div className="grid gap-1.5">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded border px-4 py-2.5 text-[13.5px] ${
                    a.tone === "bad"
                      ? "border-[#A02219]/28 bg-[#FAE5E3] text-[#A02219]"
                      : a.tone === "warn"
                        ? "border-[#8E5A0E]/28 bg-[#FAEEDA] text-[#8E5A0E]"
                        : "border-[#A8336E]/28 bg-[#F7E7EF] text-[#A8336E]"
                  }`}
                >
                  <span className="min-w-[52px] shrink-0 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]">
                    {a.label}
                  </span>
                  <p>{a.text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <footer className="mt-8 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[#E6DCE2] pt-3.5 text-[11.5px] text-[#948B9B]">
          <span>Every dollar on this page comes from Stripe charges.</span>
          <span>Names, quiz finishers and renewal dates come from Supabase.</span>
          <span>Ad spend is what you typed in.</span>
          <span>Refreshed {stamp(stats.refreshedAt)}</span>
          {stats.truncated && <span>Showing the most recent slice only.</span>}
        </footer>
      </div>
    </main>
  );
}

// ─── Presentational bits ────────────────────────────────────────────────────

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[#948B9B] ${className}`}
    >
      {children}
    </span>
  );
}

function Verdict({ verdict }: { verdict: Stats["verdict"] }) {
  const tone = verdict.tone;
  const bar =
    tone === "good"
      ? "bg-[#146B4E]"
      : tone === "warn"
        ? "bg-[#8E5A0E]"
        : tone === "bad"
          ? "bg-[#A02219]"
          : "bg-[#948B9B]";
  const bg =
    tone === "good"
      ? "bg-[#F1F8F5]"
      : tone === "warn"
        ? "bg-[#FDF7EC]"
        : tone === "bad"
          ? "bg-[#FDF1F0]"
          : "bg-white";
  const word =
    tone === "good"
      ? "text-[#146B4E]"
      : tone === "warn"
        ? "text-[#8E5A0E]"
        : tone === "bad"
          ? "text-[#A02219]"
          : "text-[#5F5566]";
  return (
    <div
      className={`relative mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 overflow-hidden rounded border border-[#E6DCE2] px-6 py-4 shadow-sm ${bg}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${bar}`} aria-hidden />
      <span className={`font-serif text-2xl leading-none tracking-tight ${word}`}>
        {verdict.word}
      </span>
      <span className="max-w-[76ch] text-[14.5px] text-[#1C181F]">{verdict.text}</span>
    </div>
  );
}

function SectionHead({
  title,
  source,
  note,
}: {
  title: string;
  source?: string;
  note?: string;
}) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-3.5">
      <h2 className="whitespace-nowrap text-[13px] font-semibold">{title}</h2>
      {source && (
        <span className="whitespace-nowrap rounded border border-[#E6DCE2] bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#948B9B]">
          {source}
        </span>
      )}
      <span className="h-px flex-1 bg-[#E6DCE2]" />
      {note && <span className="hidden whitespace-nowrap text-[11.5px] text-[#948B9B] sm:inline">{note}</span>}
    </div>
  );
}

function Cell({ label, bucket, bordered }: { label: string; bucket: Bucket; bordered?: boolean }) {
  return (
    <div className={`px-5 py-4 ${bordered ? "border-l border-[#F0E9ED]" : ""}`}>
      <Label>{label}</Label>
      <p className="mt-1 font-serif text-2xl leading-tight tracking-tight tabular-nums">
        {money(bucket.net)}
      </p>
      <p className="text-[12px] text-[#948B9B]">{plural(bucket.count, "sale")}</p>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  tone,
  big,
}: {
  label: string;
  hint: string;
  value: string;
  tone?: "good" | "bad" | "mute";
  big?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-[#146B4E]"
      : tone === "bad"
        ? "text-[#A02219]"
        : tone === "mute"
          ? "font-normal text-[#948B9B]"
          : "";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-[#E6DCE2] py-2 last:border-0">
      <span className="text-[13px] text-[#5F5566]">
        {label}
        <small className="mt-0.5 block text-[11.5px] leading-snug text-[#948B9B]">{hint}</small>
      </span>
      <span
        className={`whitespace-nowrap font-semibold tabular-nums tracking-tight ${
          big ? "text-[19px]" : "text-[16px]"
        } ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-[#A8336E]">→</span>
      <span>{children}</span>
    </li>
  );
}

const TAG: Record<string, string> = {
  new: "border-[#146B4E]/30 bg-[#E1F0E9] text-[#146B4E]",
  renewal: "border-[#A8336E]/30 bg-[#F7E7EF] text-[#A8336E]",
  refunded: "border-[#A02219]/30 bg-[#FAE5E3] text-[#A02219]",
};

function Tag({ kind }: { kind: "new" | "renewal" | "refunded" }) {
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] ${TAG[kind]}`}
    >
      {kind}
    </span>
  );
}

/**
 * Cash collected against ad spend, both as running totals over 30 days.
 *
 * Running totals rather than daily bars because daily revenue on a $59 product
 * is lumpy — two sales one day and none the next says nothing. The crossing
 * point is the whole picture: the day the month's ads paid for themselves. The
 * band between the lines is the gap, tinted by which line is on top.
 */
function CashChart({ revenue, spend }: { revenue: number[]; spend: number[] }) {
  const n = Math.min(revenue.length, spend.length);
  if (n < 2) return null;

  const cumRev: number[] = [];
  const cumSpend: number[] = [];
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    a += revenue[i] ?? 0;
    b += spend[i] ?? 0;
    cumRev.push(a);
    cumSpend.push(b);
  }

  if (a === 0 && b === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-[#948B9B]">
        Nothing spent and nothing collected in 30 days. This is the chart to watch on day one — the
        two lines start together and you want the pink one on top.
      </p>
    );
  }

  const W = 960;
  const H = 168;
  const PADL = 4;
  const PADR = 64;
  const PADT = 12;
  const PADB = 22;
  const max = Math.max(a, b, 1) * 1.08;
  const x = (i: number) => PADL + ((W - PADL - PADR) * i) / (n - 1);
  const y = (v: number) => PADT + (H - PADT - PADB) * (1 - v / max);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  let crossAt: number | null = null;
  for (let i = 1; i < n; i++) {
    if (cumRev[i - 1] < cumSpend[i - 1] && cumRev[i] >= cumSpend[i]) {
      crossAt = i;
      break;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label={`Running total over 30 days: ${money(a)} collected against ${money(b)} of ad spend.`}
    >
      <line x1={PADL} y1={y(0)} x2={W - PADR} y2={y(0)} stroke="#E6DCE2" strokeWidth={1} />
      {Array.from({ length: n - 1 }, (_, i) => (
        <polygon
          key={i}
          points={`${x(i)},${y(cumRev[i])} ${x(i + 1)},${y(cumRev[i + 1])} ${x(i + 1)},${y(cumSpend[i + 1])} ${x(i)},${y(cumSpend[i])}`}
          fill={cumRev[i + 1] >= cumSpend[i + 1] ? "rgba(20,107,78,.13)" : "rgba(160,34,25,.13)"}
        />
      ))}
      {crossAt !== null && (
        <>
          <line
            x1={x(crossAt)}
            y1={PADT}
            x2={x(crossAt)}
            y2={H - PADB}
            stroke="#146B4E"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text x={x(crossAt) + 6} y={PADT + 11} fontSize={11} fill="#146B4E">
            paid for itself
          </text>
        </>
      )}
      <path
        d={path(cumSpend)}
        fill="none"
        stroke="#948B9B"
        strokeWidth={2}
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      <path
        d={path(cumRev)}
        fill="none"
        stroke="#A8336E"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(n - 1)} cy={y(b)} r={3.5} fill="#948B9B" stroke="#fff" strokeWidth={2} />
      <text
        x={x(n - 1) + 9}
        y={y(b) + 4}
        fontSize={11.5}
        fontWeight={600}
        fill="#948B9B"
        className="tabular-nums"
      >
        {money(b, 0)}
      </text>
      <circle cx={x(n - 1)} cy={y(a)} r={3.5} fill="#A8336E" stroke="#fff" strokeWidth={2} />
      <text
        x={x(n - 1) + 9}
        y={y(a) + 4}
        fontSize={11.5}
        fontWeight={600}
        fill="#A8336E"
        className="tabular-nums"
      >
        {money(a, 0)}
      </text>
      <text x={PADL} y={H - 6} fontSize={10.5} fill="#948B9B">
        30 days ago
      </text>
      <text x={W - PADR} y={H - 6} fontSize={10.5} fill="#948B9B" textAnchor="end">
        Today
      </text>
    </svg>
  );
}

/**
 * Three steps, all windowed to the same 30 days.
 *
 * The middle step is the one the old panel didn't have, and it is the one that
 * splits two problems with completely different fixes: women who never reach
 * the card form are an offer-screen problem, women who reach it and don't pay
 * are a checkout problem.
 */
function Funnel({
  quiz,
  checkout,
  paid,
  sessionsError,
}: {
  quiz: number;
  checkout: number;
  paid: number;
  sessionsError: string | null;
}) {
  // Clamped to 100: a later step can legitimately exceed the first when the
  // windows disagree (leftover test-mode checkout sessions against a handful of
  // real quiz rows), and an unclamped bar would render wider than its track.
  // The percentage underneath still prints the true figure.
  const w = (v: number) =>
    quiz > 0 ? Math.min(Math.max((v / quiz) * 100, v > 0 ? 1.5 : 0), 100) : 0;
  const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

  const steps = [
    { label: "Finished the quiz", value: quiz, width: quiz > 0 ? 100 : 0, fill: "bg-[#A8336E]/35" },
    {
      label: "Opened the card form",
      value: checkout,
      width: w(checkout),
      fill: "bg-[#A8336E]/65",
    },
    { label: "Paid", value: paid, width: w(paid), fill: "bg-[#A8336E]" },
  ];

  return (
    <div>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div className="grid grid-cols-[118px_1fr] items-center gap-3 py-1.5 sm:grid-cols-[140px_1fr]">
            <span className="text-[12.5px] leading-tight text-[#5F5566]">
              {s.label}
              <b className="block text-[19px] font-semibold tracking-tight tabular-nums text-[#1C181F]">
                {i === 1 && sessionsError ? "—" : s.value.toLocaleString("en-US")}
              </b>
            </span>
            <span
              className={`h-[26px] min-w-[2px] rounded-sm transition-[width] duration-500 ${s.fill}`}
              style={{ width: `${s.width}%` }}
            />
          </div>
          {i < 2 && (
            <p className="col-start-2 pb-1 pl-[130px] text-[11.5px] text-[#948B9B] sm:pl-[152px]">
              <b className="font-semibold text-[#5F5566] tabular-nums">
                {i === 0
                  ? sessionsError
                    ? "—"
                    : pct(checkout, quiz)
                  : sessionsError
                    ? "—"
                    : pct(paid, checkout)}
              </b>{" "}
              {i === 0 ? "reach the card form — that's the offer screen's job" : "of those pay — that's checkout abandonment"}
            </p>
          )}
        </div>
      ))}
      {sessionsError && (
        <p className="mt-2 text-[12px] text-[#8E5A0E]">
          {sessionsError}, so the middle step is blank. The two ends are still correct.
        </p>
      )}
    </div>
  );
}
