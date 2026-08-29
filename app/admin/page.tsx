"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * The sales desk.
 *
 * One question — is the campaign making money? — answered top to bottom:
 * money collected, whether the ads are paying for themselves, where the
 * traffic stops, who bought, and what needs a human.
 *
 * AI cost, tokens, MRR, the account-state grid and the full client table were
 * removed on 2026-08-29. None of them changed a decision; all of them made the
 * screen slower to read on the one morning it matters. `llm_usage` is still
 * written on every OpenAI call — query the table if a cost question comes up.
 */

type Bucket = { count: number; net: number };

type Sale = {
  id: string;
  at: string;
  net: number;
  gross: number;
  refunded: boolean;
  kind: "new" | "renewal";
  name: string | null;
  email: string | null;
  planStatus: string | null;
  known: boolean;
};

type Stats = {
  livemode: boolean | null;
  revenueError: string | null;
  truncated: boolean;
  money: { today: Bucket; last7: Bucket; last30: Bucket; allTime: Bucket };
  unit: { price: number; feeRate: number; keptPerSale: number };
  funnel: { quizFinished: number; paid: number; conversionPct: number };
  sales: Sale[];
  /** Every succeeded charge; `sales` is capped at the newest slice of it. */
  salesTotal: number;
  alerts: { tone: "bad" | "warn"; text: string }[];
  refreshedAt: string;
};

const SESSION_KEY = "admin_panel_pw";

/**
 * Ad spend, kept in the browser.
 *
 * There is no Meta API in this codebase, so the figure is typed in by hand —
 * and nobody types one in every day. So it is stored with the date it was
 * entered and every number derived from it is stamped with that date; a spend
 * figure three days old makes cost-per-sale look better than it is, and the
 * panel says so rather than quietly flattering the campaign.
 *
 * Everything that does *not* need it — money collected, break-even spend, the
 * funnel, the sales list — works with the field left empty forever.
 */
const SPEND_KEY = "admin_ad_spend";
/** Past this many days, the entered spend is called out as stale. */
const SPEND_STALE_DAYS = 3;

type Spend = { amount: number; updatedAt: string };

function readSpend(): Spend | null {
  try {
    const raw = localStorage.getItem(SPEND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Spend>;
    if (typeof parsed.amount !== "number" || !Number.isFinite(parsed.amount)) return null;
    return { amount: parsed.amount, updatedAt: parsed.updatedAt ?? new Date().toISOString() };
  } catch {
    return null;
  }
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const DAY_MS = 86_400_000;

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

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

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spend, setSpend] = useState<Spend | null>(null);
  const [spendDraft, setSpendDraft] = useState("");

  const loadStats = useCallback(async (pw: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: pw,
          // So "Collected today" means her today, not UTC's.
          tzOffsetMinutes: new Date().getTimezoneOffset(),
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
    const s = readSpend();
    setSpend(s);
    setSpendDraft(s ? String(s.amount) : "");
  }, [loadStats]);

  const commitSpend = () => {
    const digits = spendDraft.replace(/[^0-9.]/g, "");
    if (digits === "") {
      localStorage.removeItem(SPEND_KEY);
      setSpend(null);
      setSpendDraft("");
      return;
    }
    const amount = Math.round(parseFloat(digits) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) {
      setSpendDraft(spend ? String(spend.amount) : "");
      return;
    }
    const next = { amount, updatedAt: new Date().toISOString() };
    localStorage.setItem(SPEND_KEY, JSON.stringify(next));
    setSpend(next);
    setSpendDraft(String(amount));
  };

  const economics = useMemo(() => {
    if (!stats) return null;
    const sales = stats.money.allTime.count;
    const kept = stats.unit.keptPerSale;
    const breakEven = Math.round(sales * kept * 100) / 100;
    if (!spend) return { sales, kept, breakEven, cac: null, profit: null, stale: false, age: 0 };
    const cac = sales > 0 ? Math.round((spend.amount / sales) * 100) / 100 : null;
    const profit = Math.round((breakEven - spend.amount) * 100) / 100;
    const age = daysAgo(spend.updatedAt);
    return { sales, kept, breakEven, cac, profit, stale: age >= SPEND_STALE_DAYS, age };
  }, [stats, spend]);

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#FAF7F8] p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.trim()) loadStats(password.trim());
          }}
          className="w-full max-w-sm space-y-4 rounded-2xl border border-[#E7DFE4] bg-white p-8 shadow-sm"
        >
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[#1C181F]">MenoLisa</h1>
            <p className="text-xs uppercase tracking-[0.14em] text-[#9B93A0]">Sales desk</p>
          </div>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-[#D6CBD2] px-4 py-3 text-[#1C181F] outline-none focus:border-[#A8336E] focus:ring-2 focus:ring-[#A8336E]/20"
          />
          {error && <p className="text-sm text-[#A8261F]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1C181F] py-3 font-medium text-white transition-colors hover:bg-[#A8336E] disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    );
  }

  const { money: m, unit, funnel, sales, alerts } = stats;
  const econ = economics!;

  return (
    <main className="min-h-dvh bg-[#FAF7F8] px-5 pb-20 pt-24 text-[#1C181F] sm:px-8">
      <div className="mx-auto max-w-[1020px]">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold tracking-tight">MenoLisa</h1>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#9B93A0]">
              Sales desk
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#6F6674]">
            {stats.livemode === false && (
              <span className="rounded-full border border-[#9C6212]/35 bg-[#FAEEDA] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#9C6212]">
                Stripe test mode
              </span>
            )}
            {stats.livemode === true && (
              <span className="rounded-full border border-[#17694E]/30 bg-[#E2F0EA] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-[#17694E]">
                Live
              </span>
            )}
            <button
              onClick={() => loadStats(sessionStorage.getItem(SESSION_KEY) ?? "")}
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
          <p className="mb-5 rounded-xl border border-[#9C6212]/30 bg-[#FAEEDA] px-4 py-3 text-sm text-[#9C6212]">
            Stripe unavailable: {stats.revenueError}. Everything below it still reads from Supabase.
          </p>
        )}

        {/* ── 1. The money line ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-[#E7DFE4] bg-white shadow-sm md:grid-cols-[1.15fr_1fr]">
          <div className="border-b border-[#E7DFE4] px-7 py-6 md:border-b-0 md:border-r">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#9B93A0]">
              Collected today
            </p>
            <p
              className={`mt-1.5 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl ${
                m.today.net > 0 ? "text-[#17694E]" : "text-[#9B93A0]"
              }`}
            >
              {money(m.today.net)}
            </p>
            <p className="mt-1.5 text-sm text-[#6F6674]">
              {m.today.count > 0
                ? `${m.today.count} ${m.today.count === 1 ? "sale" : "sales"} today`
                : "No sales yet today"}
            </p>
          </div>
          <div className="grid grid-cols-3">
            <LedgerCell label="Last 7 days" bucket={m.last7} />
            <LedgerCell label="Last 30 days" bucket={m.last30} bordered />
            <LedgerCell label="All time" bucket={m.allTime} bordered />
          </div>
        </div>

        {/* ── 2. Campaign economics ──────────────────────────────────────── */}
        <SectionHead
          title="Is the campaign paying for itself?"
          note="Break-even needs nothing from you. The rest wakes up when you drop in a spend figure."
        />
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-[#E7DFE4] bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="You can afford to have spent"
            value={money(econ.breakEven)}
            note={`${econ.sales} ${econ.sales === 1 ? "sale" : "sales"} × ${money(econ.kept)} kept`}
          />
          <Tile
            label="Ad spend"
            bordered
            value={
              <input
                value={spendDraft}
                onChange={(e) => setSpendDraft(e.target.value)}
                onBlur={commitSpend}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                inputMode="decimal"
                placeholder="—"
                aria-label="Total ad spend so far"
                className="w-full border-b-2 border-dashed border-[#D6CBD2] bg-transparent pb-0.5 text-2xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-[#9B93A0] focus:border-solid focus:border-[#A8336E]"
              />
            }
            note={
              spend ? (
                <span className={econ.stale ? "text-[#9C6212]" : undefined}>
                  As of {new Date(spend.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {econ.age === 0
                    ? " · today"
                    : econ.age === 1
                      ? " · 1 day old"
                      : ` · ${econ.age} days old`}
                </span>
              ) : (
                "Total to date, typed in — optional"
              )
            }
          />
          <Tile
            label="Cost per sale"
            bordered
            value={econ.cac === null ? "—" : money(econ.cac)}
            tone={econ.cac === null ? undefined : econ.cac <= econ.kept ? "good" : "bad"}
            note={
              econ.cac === null
                ? spend
                  ? "No sales to divide by yet"
                  : "Add ad spend to see it"
                : econ.cac <= econ.kept
                  ? `Under the ${money(econ.kept)} you keep`
                  : `Over the ${money(econ.kept)} you keep`
            }
          />
          <Tile
            label="Profit"
            bordered
            value={
              econ.profit === null
                ? "—"
                : `${econ.profit < 0 ? "−" : ""}${money(Math.abs(econ.profit))}`
            }
            tone={econ.profit === null ? undefined : econ.profit >= 0 ? "good" : "bad"}
            note={
              econ.profit === null
                ? "Add ad spend to see it"
                : econ.profit >= 0
                  ? "After ad spend and Stripe"
                  : `${Math.ceil(-econ.profit / econ.kept)} more ${
                      Math.ceil(-econ.profit / econ.kept) === 1 ? "sale" : "sales"
                    } to break even`
            }
          />
        </div>
        {spend && econ.stale && (
          <p className="mt-2 text-xs text-[#9C6212]">
            Ad spend was last updated {econ.age} days ago, so cost per sale is flattering. Paste the
            current total from Meta when you get a moment.
          </p>
        )}
        {!spend && (
          <p className="mt-2 text-xs text-[#9B93A0]">
            No spend entered. {money(econ.breakEven)} is what {econ.sales}{" "}
            {econ.sales === 1 ? "sale has" : "sales have"} earned you the room to spend — compare it
            against Meta whenever you next look.
          </p>
        )}

        {/* ── 3. Funnel ──────────────────────────────────────────────────── */}
        <SectionHead title="Where the traffic stops" note="Everyone who has ever finished the quiz." />
        <div className="rounded-2xl border border-[#E7DFE4] bg-white px-6 py-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[130px]">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#9B93A0]">
                Finished the quiz
              </p>
              <p className="text-2xl font-semibold tabular-nums">{funnel.quizFinished}</p>
            </div>
            <span className="text-xs text-[#9B93A0]">———→</span>
            <span className="rounded-full bg-[#F7E7EF] px-2.5 py-1 text-xs font-medium text-[#A8336E] tabular-nums">
              {funnel.quizFinished > 0 ? `${funnel.conversionPct}% pay` : "—"}
            </span>
            <span className="text-xs text-[#9B93A0]">———→</span>
            <div className="min-w-[100px]">
              <p className="text-[11px] uppercase tracking-[0.1em] text-[#9B93A0]">Paid</p>
              <p className="text-2xl font-semibold tabular-nums">{funnel.paid}</p>
            </div>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[#F4EFF2]" aria-hidden>
            <span
              className="block h-full bg-[#A8336E]"
              style={{ width: `${Math.min(100, funnel.conversionPct)}%` }}
            />
          </div>
          <p className="mt-3 text-[13px] text-[#9B93A0]">
            {funnel.quizFinished === 0
              ? "Nobody has finished the quiz yet."
              : funnel.paid === 0
                ? `${funnel.quizFinished} finished the quiz and none have paid. The ads are delivering — the offer screen is where they stop.`
                : `Every 100 quiz finishers are worth about ${money(
                    Math.round(funnel.conversionPct * unit.keptPerSale)
                  )}.`}
          </p>
        </div>

        {/* ── 4. Latest sales ────────────────────────────────────────────── */}
        <SectionHead
          title="Latest sales"
          note={
            sales.length === 0
              ? "Newest first · every charge Stripe cleared"
              : sales.length < stats.salesTotal
                ? `Newest ${sales.length} of ${stats.salesTotal} charges Stripe cleared`
                : `Newest first · ${sales.length} ${sales.length === 1 ? "charge" : "charges"} Stripe cleared`
          }
        />
        <div className="overflow-hidden rounded-2xl border border-[#E7DFE4] bg-white shadow-sm">
          {sales.length === 0 ? (
            <div className="px-7 py-12 text-center">
              <h3 className="text-base font-semibold">No sales yet</h3>
              <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-[#6F6674]">
                The first row lands here the moment Stripe clears a charge. Nothing is broken — this
                is what the screen looks like before anyone has paid.
              </p>
              <ul className="mx-auto mt-5 grid max-w-[46ch] gap-1.5 text-left text-[13px] text-[#6F6674]">
                <EmptyPoint>
                  {funnel.quizFinished > 0
                    ? `${funnel.quizFinished} ${funnel.quizFinished === 1 ? "woman has" : "women have"} finished the quiz, so traffic is arriving`
                    : "Nobody has finished the quiz yet — check the ads are actually delivering"}
                </EmptyPoint>
                {stats.livemode === false && (
                  <EmptyPoint>Stripe is in test mode — swap the key when you go live</EmptyPoint>
                )}
                <EmptyPoint>
                  A real checkout that never appears here is a webhook problem, not a sales problem
                </EmptyPoint>
              </ul>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E7DFE4] text-[11px] uppercase tracking-[0.1em] text-[#9B93A0]">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium" />
                    <th className="px-5 py-3 text-right font-medium">Paid</th>
                    <th className="px-5 py-3 font-medium">Her plan</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-[#E7DFE4] last:border-0 hover:bg-[#FAF7F8]">
                      <td className="whitespace-nowrap px-5 py-3.5 text-[13px]">
                        {relative(s.at)}
                        <span className="block text-[11px] text-[#9B93A0]">{stamp(s.at)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium">{s.name ?? "—"}</span>
                        <span className="block text-[13px] text-[#6F6674]">
                          {s.email ?? "no email on the charge"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <Chip kind={s.refunded ? "refunded" : s.kind} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums">
                        {s.refunded ? (
                          <span className="text-[#A8261F]">
                            {s.net > 0 ? money(s.net) : `−${money(s.gross)}`}
                          </span>
                        ) : (
                          money(s.net)
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <PlanCell status={s.planStatus} known={s.known} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 5. Needs a human ───────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <>
            <SectionHead title="Needs a human" note="Only here when something is actually wrong." />
            <div className="grid gap-2">
              {alerts.map((a, i) => (
                <p
                  key={i}
                  className={`rounded-xl border px-4 py-3 text-[13.5px] ${
                    a.tone === "bad"
                      ? "border-[#A8261F]/28 bg-[#FAE5E3] text-[#A8261F]"
                      : "border-[#9C6212]/28 bg-[#FAEEDA] text-[#9C6212]"
                  }`}
                >
                  {a.text}
                </p>
              ))}
            </div>
          </>
        )}

        <footer className="mt-8 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-[#E7DFE4] pt-3.5 text-[11.5px] text-[#9B93A0]">
          <span>Revenue read from Stripe charges, net of refunds.</span>
          <span>Quiz and customers read from Supabase.</span>
          <span>Refreshed {stamp(stats.refreshedAt)}</span>
          {stats.truncated && <span>Showing the most recent slice only.</span>}
        </footer>
      </div>
    </main>
  );
}

// ─── Presentational bits ────────────────────────────────────────────────────

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3 mt-9 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em]">{title}</h2>
      <p className="text-xs text-[#9B93A0]">{note}</p>
    </div>
  );
}

function LedgerCell({
  label,
  bucket,
  bordered,
}: {
  label: string;
  bucket: Bucket;
  bordered?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${bordered ? "border-l border-[#E7DFE4]" : ""}`}>
      <p className="text-[11px] uppercase tracking-[0.1em] text-[#9B93A0]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{money(bucket.net)}</p>
      <p className="text-[13px] text-[#6F6674]">
        {bucket.count} {bucket.count === 1 ? "sale" : "sales"}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  note,
  tone,
  bordered,
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  tone?: "good" | "bad";
  bordered?: boolean;
}) {
  const toneClass = tone === "good" ? "text-[#17694E]" : tone === "bad" ? "text-[#A8261F]" : "";
  return (
    <div
      className={`px-5 py-4 ${bordered ? "border-t border-[#E7DFE4] sm:border-t-0 sm:border-l" : ""}`}
    >
      <p className="text-[11px] uppercase tracking-[0.1em] text-[#9B93A0]">{label}</p>
      {typeof value === "string" ? (
        <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${toneClass}`}>
          {value}
        </p>
      ) : (
        <div className="mt-1">{value}</div>
      )}
      <p className="mt-1 text-[13px] text-[#6F6674]">{note}</p>
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

const CHIP: Record<string, string> = {
  new: "border-[#17694E]/30 bg-[#E2F0EA] text-[#17694E]",
  renewal: "border-[#A8336E]/30 bg-[#F7E7EF] text-[#A8336E]",
  refunded: "border-[#A8261F]/30 bg-[#FAE5E3] text-[#A8261F]",
};

function Chip({ kind }: { kind: "new" | "renewal" | "refunded" }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] ${CHIP[kind]}`}
    >
      {kind}
    </span>
  );
}

function PlanCell({ status, known }: { status: string | null; known: boolean }) {
  if (!known) return <span className="text-[13px] text-[#9B93A0]">not linked</span>;
  if (status === "ready") return <span className="text-[13px] text-[#6F6674]">ready</span>;
  if (status === "generating") return <span className="text-[13px] text-[#9C6212]">building…</span>;
  return <span className="text-[13px] font-medium text-[#A8261F]">none — fix</span>;
}
