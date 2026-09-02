"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The sales desk.
 *
 * One question — **should I spend more on ads tomorrow?** — answered on the
 * first line, with the working underneath in the order you'd actually ask it:
 * what came in, what she cost against what she's worth, where they stop, who
 * bought, what's broken.
 *
 * ── Colour is a legend, not decoration ──────────────────────────────────────
 *
 * Five colours, one meaning each, defined once in {@link PALETTE} and used
 * nowhere else in the file as a raw hex. The key is printed in the footer, so
 * the screen explains itself:
 *
 *   **Green — money that arrived.** Collected, kept, lifetime value,
 *   contribution, a new sale, the last funnel step. If it is green, Stripe has
 *   it.
 *
 *   **Amber — money going out.** Ad spend, fixed costs, serving cost. Every
 *   amber figure is a deduction from a green one.
 *
 *   **Violet — money on the calendar.** Booked renewals, the renewal rate, the
 *   renewal tag, the refund guarantee still owed. Real, not yet collected.
 *
 *   **Rose — the women.** Quiz finishers, funnel steps, customer names. The
 *   brand colour, reserved for people rather than money, so a rose figure is
 *   never a dollar figure.
 *
 *   **Red — something is wrong.** Refunds, declined cards, disputes, a cost per
 *   customer above what she is worth.
 *
 * The rule that keeps it honest: a number is coloured by *what it is*, never by
 * which block it happens to sit in. Ad spend is amber in the cost column, in the
 * chart, and in its own entry strip.
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

/**
 * The only place a colour is written down. Set on the page root as custom
 * properties, so every class below reads `var(--cash)` and a palette change is
 * a one-line edit — including inside the SVG chart, which inherits them.
 */
const PALETTE = {
  "--ink": "#1C181F",
  "--ink-2": "#5F5566",
  "--ink-3": "#948B9B",
  "--line": "#E6DCE2",
  "--line-soft": "#F0E9ED",
  "--paper": "#F7F3F5",
  "--quiet": "#FBF8F9",

  // Money that arrived.
  "--cash": "#0E7A55",
  "--cash-deep": "#0A5A3F",
  "--cash-bg": "#E8F5EF",
  "--cash-line": "#B4E0CB",

  // Money going out.
  "--spend": "#B26A00",
  "--spend-deep": "#8A5200",
  "--spend-bg": "#FDF3E1",
  "--spend-line": "#EFD5A3",

  // Money on the calendar.
  "--ahead": "#5B4BC4",
  "--ahead-deep": "#453A9E",
  "--ahead-bg": "#EDEBFB",
  "--ahead-line": "#CAC3F0",

  // The women.
  "--her": "#A8336E",
  "--her-deep": "#872556",
  "--her-bg": "#FBEAF2",
  "--her-line": "#F0C6DC",

  // Something is wrong.
  "--stop": "#B02A20",
  "--stop-deep": "#8C1F18",
  "--stop-bg": "#FBE8E6",
  "--stop-line": "#F2C3BD",
} as unknown as React.CSSProperties;

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
    loggedDays: { day: string; amount: number }[];
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
    /** What the three figures above were measured over — see `clamped`. */
    since: string;
    days: number;
    /** True when ADMIN_CAMPAIGN_START cut the window short of 30 days. */
    clamped: boolean;
    /** One row per funnel screen reached, in order. Empty before the
     *  instrumented build has been live long enough to collect anything. */
    dropoff: {
      index: number;
      step: string;
      sessions: number;
      /** Share of everyone who reached the first measured screen. */
      pctOfEntry: number;
      /** Share lost since the *previous* screen — null on the first row. */
      dropPct: number | null;
      /** Whether that loss sits on a base big enough to describe. */
      significant: boolean;
    }[];
    /** The single worst step-to-step loss, computed server-side so the panel
     *  and any future alert can never disagree about which screen it is. Null
     *  until `entrySessions` clears `minVerdictEntry`. */
    worstStep: {
      index: number;
      step: string;
      sessions: number;
      pctOfEntry: number;
      dropPct: number | null;
      significant: boolean;
    } | null;
    /** Visits that reached the first measured screen. */
    entrySessions: number;
    /** What `entrySessions` has to clear before a screen is named. */
    minVerdictEntry: number;
    dropoffError: string | null;
    trackingSince: string | null;
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

/**
 * For date-only strings like "2026-08-30". `new Date("2026-08-30")` parses as
 * UTC midnight, so west of Greenwich `shortDate` would print the previous day;
 * noon is inside the same calendar day in every timezone.
 */
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const weekdayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last `n` days ending at `todayIso`, oldest first. */
function lastNDays(todayIso: string, n: number): string[] {
  const [y, m, d] = todayIso.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 12);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(base - (n - 1 - i) * DAY_MS);
    return dt.toISOString().slice(0, 10);
  });
}

const SPEND_STRIP_DAYS = 14;

/** What's already saved for `day`, so a redundant keystroke skips the round trip. */
function savedAmountFor(stats: Stats, day: string): number | null {
  if (day === stats.costs.todayIso) return stats.costs.todaySpend;
  return stats.costs.loggedDays.find((d) => d.day === day)?.amount ?? null;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ad spend: one draft string per day, auto-saved — see AdSpendStrip below.
  const [spendDrafts, setSpendDrafts] = useState<Record<string, string>>({});
  const [savingDays, setSavingDays] = useState<Record<string, boolean>>({});
  const [savedDays, setSavedDays] = useState<Record<string, boolean>>({});
  const [spendDayErrors, setSpendDayErrors] = useState<Record<string, string>>({});
  const touchedDays = useRef<Set<string>>(new Set());
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedFlashTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async (pw: string, spend?: { day: string; amount: number | null }) => {
    if (!spend) setLoading(true);
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
        return null;
      }
      if (!res.ok) {
        setError("Couldn't load the numbers. Try again.");
        return null;
      }
      const data: Stats = await res.json();
      sessionStorage.setItem(SESSION_KEY, pw);
      setStats(data);
      return data;
    } catch {
      setError("Network error. Try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore session on mount so a refresh keeps you in.
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) load(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed drafts for days the operator hasn't touched yet — a save triggered by
  // one day's debounce must never clobber what's mid-edit in another day's box.
  useEffect(() => {
    if (!stats) return;
    setSpendDrafts((prev) => {
      const next = { ...prev };
      for (const day of lastNDays(stats.costs.todayIso, SPEND_STRIP_DAYS)) {
        if (touchedDays.current.has(day)) continue;
        const amt = savedAmountFor(stats, day);
        next[day] = amt === null ? "" : String(amt);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.refreshedAt]);

  const commitSpend = useCallback(
    async (day: string, raw: string) => {
      const pw = sessionStorage.getItem(SESSION_KEY);
      if (!pw) return;
      const digits = raw.replace(/[^0-9.]/g, "");
      const amount = digits === "" ? null : Math.round(parseFloat(digits) * 100) / 100;
      if (amount !== null && !Number.isFinite(amount)) return;
      if (stats && savedAmountFor(stats, day) === amount) return; // nothing changed

      setSavingDays((p) => ({ ...p, [day]: true }));
      setSpendDayErrors((p) => {
        if (!(day in p)) return p;
        const next = { ...p };
        delete next[day];
        return next;
      });
      const data = await load(pw, { day, amount });
      setSavingDays((p) => {
        const next = { ...p };
        delete next[day];
        return next;
      });
      if (data?.spendWriteError) {
        setSpendDayErrors((p) => ({ ...p, [day]: data.spendWriteError as string }));
        return;
      }
      setSavedDays((p) => ({ ...p, [day]: true }));
      clearTimeout(savedFlashTimers.current[day]);
      savedFlashTimers.current[day] = setTimeout(() => {
        setSavedDays((p) => {
          const next = { ...p };
          delete next[day];
          return next;
        });
      }, 1600);
    },
    [load, stats]
  );

  const handleSpendChange = (day: string, value: string) => {
    setSpendDrafts((p) => ({ ...p, [day]: value }));
    touchedDays.current.add(day);
    clearTimeout(debounceTimers.current[day]);
    debounceTimers.current[day] = setTimeout(() => commitSpend(day, value), 700);
  };

  const handleSpendBlur = (day: string) => {
    clearTimeout(debounceTimers.current[day]);
    commitSpend(day, spendDrafts[day] ?? "");
  };

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <main
        style={PALETTE}
        className="flex min-h-dvh items-center justify-center bg-[var(--paper)] p-6"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.trim()) load(password.trim());
          }}
          className="w-full max-w-sm overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm"
        >
          <div
            className="h-[3px] w-full"
            style={{
              background:
                "linear-gradient(90deg, var(--cash), var(--spend), var(--ahead), var(--her), var(--stop))",
            }}
            aria-hidden
          />
          <div className="space-y-4 p-8">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">MenoLisa</h1>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                Sales desk
              </p>
            </div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-lg border border-[var(--line)] px-4 py-3 text-[var(--ink)] outline-none transition-colors focus:border-[var(--her)] focus:ring-2 focus:ring-[var(--her-line)]"
            />
            {error && <p className="text-sm text-[var(--stop)]">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--ink)] py-3 font-medium text-white transition-colors hover:bg-[var(--her)] disabled:opacity-50"
            >
              {loading ? "Checking…" : "Enter"}
            </button>
          </div>
        </form>
      </main>
    );
  }

  const { money: m, costs, acq, retention, forward, funnel, verdict, sales, alerts } = stats;

  return (
    <main
      style={PALETTE}
      className="min-h-dvh bg-[var(--paper)] px-5 pb-20 pt-10 text-[var(--ink)] sm:px-8"
    >
      <div className="mx-auto max-w-[1060px]">
        {/* ── Masthead ────────────────────────────────────────────────────── */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">MenoLisa</h1>
            <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-3)]">
              Sales desk
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-2)]">
            {stats.livemode === false && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--spend-line)] bg-[var(--spend-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--spend-deep)]">
                <i className="block size-1.5 rounded-full bg-[var(--spend)]" />
                Stripe test mode
              </span>
            )}
            {stats.livemode === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cash-line)] bg-[var(--cash-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cash-deep)]">
                <i className="block size-1.5 animate-pulse rounded-full bg-[var(--cash)]" />
                Live
              </span>
            )}
            <button
              onClick={() => load(sessionStorage.getItem(SESSION_KEY) ?? "")}
              disabled={loading}
              className="underline underline-offset-4 transition-colors hover:text-[var(--her)] disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem(SESSION_KEY);
                setStats(null);
                setPassword("");
              }}
              className="underline underline-offset-4 transition-colors hover:text-[var(--her)]"
            >
              Lock
            </button>
          </div>
        </header>

        {stats.revenueError && (
          <p className="mb-5 rounded-lg border border-[var(--spend-line)] bg-[var(--spend-bg)] px-4 py-3 text-sm text-[var(--spend-deep)]">
            Stripe unavailable: {stats.revenueError}. Everything that comes from Supabase still
            reads correctly below.
          </p>
        )}

        {/* ── The verdict ─────────────────────────────────────────────────── */}
        <Verdict verdict={verdict} />

        {/* ── 1. Cash in ──────────────────────────────────────────────────── */}
        <SectionHead title="Cash in" dot="var(--cash)" source="Stripe" note="Charges, net of refunds" />
        <Panel accent="var(--cash)">
          <div className="grid grid-cols-1 md:grid-cols-[1.05fr_1.35fr]">
            <div className="border-b border-[var(--line)] bg-[var(--cash-bg)]/50 px-6 py-5 md:border-b-0 md:border-r">
              <Label className="text-[var(--cash-deep)]">Collected, last 7 days</Label>
              <p
                className={`mt-2 font-serif text-5xl leading-none tracking-tight tabular-nums sm:text-6xl ${
                  m.last7.net > 0 ? "text-[var(--cash-deep)]" : "text-[var(--ink-3)]"
                }`}
              >
                {money(m.last7.net)}
              </p>
              <p className="mt-2 text-[13px] text-[var(--ink-2)]">
                {m.last7.count > 0 ? (
                  <>
                    {plural(m.last7.count, "sale")} ·{" "}
                    <b className="font-semibold text-[var(--cash-deep)] tabular-nums">
                      {money(m.last7.kept)}
                    </b>{" "}
                    kept after Stripe&rsquo;s fee
                  </>
                ) : (
                  "No sales in the last 7 days"
                )}
              </p>
            </div>
            <div className="grid grid-cols-3">
              <Cell label="Today" bucket={m.today} />
              <Cell label="Last 30 days" bucket={m.last30} bordered />
              <Cell label="All time" bucket={m.allTime} bordered />
            </div>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-t border-[var(--line)] bg-[var(--quiet)] px-6 py-3 text-[12.5px] text-[var(--ink-2)]">
            <Footnote dot="var(--ahead)">
              Already on the calendar, next 30 days{" "}
              <b className="font-semibold tabular-nums text-[var(--ahead-deep)]">
                {money(forward.booked30)}
              </b>{" "}
              <span className="text-[var(--ink-3)]">
                ({plural(forward.bookedCount, "renewal")} scheduled
                {forward.cancelsPending > 0 && `, ${forward.cancelsPending} already cancelled`})
              </span>
            </Footnote>
            <Footnote dot="var(--stop)">
              Refunded, 30 days{" "}
              <b
                className={`font-semibold tabular-nums ${
                  forward.refunds30.amount > 0 ? "text-[var(--stop)]" : "text-[var(--ink)]"
                }`}
              >
                {money(forward.refunds30.amount)}
              </b>
            </Footnote>
            <Footnote dot="var(--stop)">
              Cards declined at checkout, 30 days{" "}
              <b
                className={`font-semibold tabular-nums ${
                  forward.declined30 > 0 ? "text-[var(--stop)]" : "text-[var(--ink)]"
                }`}
              >
                {forward.declined30}
              </b>
            </Footnote>
          </div>
        </Panel>

        {/* ── 2. Unit economics ───────────────────────────────────────────── */}
        <SectionHead
          title="What she costs, what she's worth"
          dot="linear-gradient(90deg, var(--spend), var(--cash))"
          source="Stripe + your ad spend"
          note="Last 30 days"
        />
        <Panel accent="linear-gradient(90deg, var(--spend) 0%, var(--spend) 45%, var(--cash) 55%, var(--cash) 100%)">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Costs — everything here is amber, because everything here leaves. */}
            <div className="px-6 py-4">
              <ColumnHead color="var(--spend)">Cost to get her</ColumnHead>
              <Row
                label="Meta ad spend, 30 days"
                hint={
                  costs.lastLoggedDay
                    ? `Last logged ${dayLabel(costs.lastLoggedDay)}${
                        costs.missingDays.length
                          ? ` · ${costs.missingDays.length} of the last 7 days missing`
                          : ""
                      }`
                    : "Nothing logged yet"
                }
                value={costs.adSpend30 > 0 ? money(costs.adSpend30) : "—"}
                tone={costs.adSpend30 > 0 ? "spend" : "mute"}
              />
              <Row
                label={funnel.clamped ? `New customers, ${plural(funnel.days, "day")}` : "New customers, 30 days"}
                hint={
                  funnel.clamped
                    ? `Renewals excluded — ads don't buy those. Counted from ${shortDate(funnel.since)}, when paid traffic started.`
                    : "Renewals excluded — ads don't buy those"
                }
                value={String(acq.newCustomers30)}
                tone="her"
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
                tone={acq.cac === null ? "mute" : acq.cac <= acq.keptPerSale ? "good" : "bad"}
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
                tone={costs.fixedMonthly > 0 ? "spend" : "mute"}
              />
              <Row
                label="Serving cost per customer"
                hint="Measured from every OpenAI call for plan generation. Lisa chat is not metered, so this is a floor."
                value={`$${costs.servingPerCustomer.toFixed(4)}`}
                tone="mute"
              />
            </div>

            {/* Value — green for collected, violet for what renewal brings. */}
            <div className="border-t border-[var(--line)] px-6 py-4 lg:border-l lg:border-t-0">
              <ColumnHead color="var(--cash)">What she returns</ColumnHead>
              <Row
                label="Kept per sale"
                hint={`$59 less Stripe's measured fee (${(acq.feeRate * 100).toFixed(2)}%)`}
                value={money(acq.keptPerSale)}
                tone="cash"
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
                tone={retention.renewalRate === null ? "mute" : "ahead"}
              />
              <Row
                label="Lifetime value, kept"
                hint={
                  retention.ltv === null
                    ? "Locked until the first 8-week period closes"
                    : "What one woman is worth across all the periods she stays"
                }
                value={retention.ltv === null ? "—" : money(retention.ltv)}
                tone={retention.ltv === null ? "mute" : "cash"}
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
                tone={acq.cac === null ? "mute" : acq.cac <= acq.keptPerSale ? "good" : "ahead"}
              />
              <Row
                label="Return on every ad dollar"
                hint="Lifetime value ÷ cost per customer. Above 2× is room to scale."
                value={retention.roas === null ? "—" : `${retention.roas.toFixed(2)}×`}
                tone={retention.roas === null ? "mute" : retention.roas >= 2 ? "good" : "bad"}
              />
            </div>
          </div>

          {/* Log ad spend */}
          <AdSpendStrip
            stats={stats}
            drafts={spendDrafts}
            saving={savingDays}
            saved={savedDays}
            errors={spendDayErrors}
            onChange={handleSpendChange}
            onBlur={handleSpendBlur}
          />

          {/* Chart */}
          <div className="border-t border-[var(--line)] px-6 pb-3 pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Label>Running total, cash collected vs ad spend, 30 days</Label>
              <div className="flex gap-4 text-[12px]">
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--cash-deep)]">
                  <i className="block h-[3px] w-4 rounded-sm bg-[var(--cash)]" />
                  Collected
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--spend-deep)]">
                  <i className="block w-4 border-t-[3px] border-dashed border-[var(--spend)]" />
                  Ad spend
                </span>
              </div>
            </div>
            <CashChart revenue={stats.series.revenue} spend={stats.series.spend} />
          </div>

          {/* Contribution */}
          <div
            className={`flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-t px-6 py-4 ${
              stats.contribution30 >= 0
                ? "border-[var(--cash-line)] bg-[var(--cash-bg)]"
                : "border-[var(--stop-line)] bg-[var(--stop-bg)]"
            }`}
          >
            <p className="max-w-[62ch] text-[13px] text-[var(--ink-2)]">
              <b className="font-semibold text-[var(--ink)]">Contribution, last 30 days.</b>{" "}
              <b className="font-semibold text-[var(--cash-deep)] tabular-nums">
                {money(m.last30.kept)}
              </b>{" "}
              kept, less{" "}
              <b className="font-semibold text-[var(--spend-deep)] tabular-nums">
                {money(costs.adSpend30)}
              </b>{" "}
              ads,{" "}
              <b className="font-semibold text-[var(--spend-deep)] tabular-nums">
                {money(costs.fixedMonthly)}
              </b>{" "}
              fixed and{" "}
              <b className="font-semibold text-[var(--spend-deep)] tabular-nums">
                {money(m.last30.count * costs.servingPerCustomer, 2)}
              </b>{" "}
              serving cost.
            </p>
            <p
              className={`font-serif text-3xl tracking-tight tabular-nums ${
                stats.contribution30 >= 0 ? "text-[var(--cash-deep)]" : "text-[var(--stop-deep)]"
              }`}
            >
              {money(stats.contribution30, 2)}
            </p>
          </div>
        </Panel>

        {/* ── 3. The funnel, end to end ───────────────────────────────────
            One block, deliberately. This was two panels answering halves of the
            same question: the three money steps, and the screen-by-screen curve
            inside the first of them. The bands keep separate bases because they
            are measured differently (visits vs women, Supabase vs Stripe) — see
            WholeFunnel — but they are read as one falling line, which is how the
            question is actually asked. */}
        <SectionHead
          title="The funnel, top to bottom"
          dot="linear-gradient(90deg, var(--her), var(--cash))"
          source="Supabase + Stripe"
          // Never say "30 days" when the campaign floor cut it shorter — the
          // whole point of the floor is that the two are different.
          note={
            funnel.clamped
              ? `Since ${shortDate(funnel.since)} · ${plural(funnel.days, "day")}`
              : "Last 30 days"
          }
        />
        <Panel accent="linear-gradient(90deg, var(--her) 0%, var(--her) 55%, var(--cash) 90%)">
          <WholeFunnel
            rows={funnel.dropoff}
            worst={funnel.worstStep}
            entrySessions={funnel.entrySessions}
            minVerdictEntry={funnel.minVerdictEntry}
            trackingSince={funnel.trackingSince}
            error={funnel.dropoffError}
            quiz={funnel.quizFinished30}
            checkout={funnel.checkoutStarted30}
            paid={funnel.paidNew30}
            sessionsError={funnel.sessionsError}
            keptPerSale={acq.keptPerSale}
            since={funnel.since}
          />
        </Panel>

        {/* ── 4. Latest sales ─────────────────────────────────────────────── */}
        <SectionHead
          title="Latest sales"
          dot="var(--her)"
          source="Stripe + Supabase"
          note={
            sales.length === 0
              ? "Newest first"
              : sales.length < stats.salesTotal
                ? `Newest ${sales.length} of ${stats.salesTotal} charges`
                : `${plural(sales.length, "charge")} Stripe cleared`
          }
        />
        <Panel accent="var(--her)">
          {sales.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="text-base font-semibold">No sales yet</h3>
              <p className="mx-auto mt-1.5 max-w-[48ch] text-sm text-[var(--ink-2)]">
                The first row lands here the moment Stripe clears a charge. Nothing is broken — this
                is what the screen looks like before anyone has paid.
              </p>
              <ul className="mx-auto mt-5 grid max-w-[48ch] gap-1.5 text-left text-[13px] text-[var(--ink-2)]">
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
                  <tr className="border-b border-[var(--line)] text-[10.5px] uppercase tracking-[0.11em] text-[var(--ink-3)]">
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
                      className="border-b border-[var(--line-soft)] transition-colors last:border-0 hover:bg-[var(--her-bg)]/45"
                    >
                      <td className="whitespace-nowrap px-5 py-3 text-[13px]">
                        {relative(s.at)}
                        <span className="block text-[11.5px] text-[var(--ink-3)]">
                          {stamp(s.at)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-[var(--her-deep)]">
                          {s.name ?? "—"}
                        </span>
                        <span className="block text-[12.5px] text-[var(--ink-2)]">
                          {s.email ?? "no email on the charge"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Tag kind={s.refunded ? "refunded" : s.kind} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums">
                        {s.refunded ? (
                          <span className="text-[var(--stop)]">
                            {s.net > 0 ? money(s.net) : `−${money(s.gross)}`}
                          </span>
                        ) : (
                          <span className="text-[var(--cash-deep)]">{money(s.net)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-[13px] tabular-nums">
                        {s.renewsAt ? (
                          <span className="text-[var(--ahead-deep)]">{shortDate(s.renewsAt)}</span>
                        ) : (
                          <span className="text-[var(--ink-3)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ── 5. Needs a human ────────────────────────────────────────────── */}
        {alerts.length > 0 && (
          <>
            <SectionHead
              title="Needs a human"
              dot="var(--stop)"
              note="Only here when something is actually wrong"
            />
            <div className="grid gap-1.5">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 overflow-hidden rounded-lg border px-4 py-2.5 text-[13.5px] ${
                    a.tone === "bad"
                      ? "border-[var(--stop-line)] bg-[var(--stop-bg)] text-[var(--stop-deep)]"
                      : a.tone === "warn"
                        ? "border-[var(--spend-line)] bg-[var(--spend-bg)] text-[var(--spend-deep)]"
                        : "border-[var(--ahead-line)] bg-[var(--ahead-bg)] text-[var(--ahead-deep)]"
                  }`}
                >
                  <span className="min-w-[52px] shrink-0 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em]">
                    {a.label}
                  </span>
                  <p className="text-[var(--ink)]">{a.text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── The key ─────────────────────────────────────────────────────── */}
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-[11.5px] text-[var(--ink-2)]">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-3)]">
            Colour key
          </span>
          <KeyChip color="var(--cash)">Money in</KeyChip>
          <KeyChip color="var(--spend)">Money out</KeyChip>
          <KeyChip color="var(--ahead)">On the calendar</KeyChip>
          <KeyChip color="var(--her)">The women</KeyChip>
          <KeyChip color="var(--stop)">Needs you</KeyChip>
        </div>

        <footer className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[var(--line)] pt-3.5 text-[11.5px] text-[var(--ink-3)]">
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

/**
 * A block, with a coloured spine across the top naming what kind of numbers are
 * inside it. `accent` is any CSS background — a single var for one-subject
 * blocks, a gradient where the block runs from one subject to another (cost →
 * value, women → money).
 */
function Panel({
  accent,
  children,
  className = "",
}: {
  accent: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--line)] bg-white shadow-sm ${className}`}
    >
      <div className="h-[3px] w-full" style={{ background: accent }} aria-hidden />
      {children}
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[var(--ink-3)] ${className}`}
    >
      {children}
    </span>
  );
}

function ColumnHead({
  color,
  children,
  className = "mb-2",
}: {
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.13em] ${className}`}
    >

      <i className="block size-2 rounded-full" style={{ background: color }} aria-hidden />
      <span style={{ color }}>{children}</span>
    </span>
  );
}

function Footnote({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <i
        className="relative top-[-1px] block size-1.5 shrink-0 rounded-full"
        style={{ background: dot }}
        aria-hidden
      />
      <span>{children}</span>
    </span>
  );
}

function KeyChip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="block size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

function Verdict({ verdict }: { verdict: Stats["verdict"] }) {
  const tone = verdict.tone;
  const color =
    tone === "good"
      ? "var(--cash)"
      : tone === "warn"
        ? "var(--spend)"
        : tone === "bad"
          ? "var(--stop)"
          : "var(--ink-3)";
  const bg =
    tone === "good"
      ? "var(--cash-bg)"
      : tone === "warn"
        ? "var(--spend-bg)"
        : tone === "bad"
          ? "var(--stop-bg)"
          : "#FFFFFF";
  const line =
    tone === "good"
      ? "var(--cash-line)"
      : tone === "warn"
        ? "var(--spend-line)"
        : tone === "bad"
          ? "var(--stop-line)"
          : "var(--line)";
  const word =
    tone === "good"
      ? "var(--cash-deep)"
      : tone === "warn"
        ? "var(--spend-deep)"
        : tone === "bad"
          ? "var(--stop-deep)"
          : "var(--ink-2)";
  return (
    <div
      className="relative mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-1.5 overflow-hidden rounded-xl border py-4 pl-7 pr-6 shadow-sm"
      style={{ background: bg, borderColor: line }}
    >
      <span className="absolute inset-y-0 left-0 w-[4px]" style={{ background: color }} aria-hidden />
      <span
        className="font-serif text-2xl leading-none tracking-tight"
        style={{ color: word }}
      >
        {verdict.word}
      </span>
      <span className="max-w-[76ch] text-[14.5px] text-[var(--ink)]">{verdict.text}</span>
    </div>
  );
}

function SectionHead({
  title,
  dot,
  source,
  note,
}: {
  title: string;
  dot?: string;
  source?: string;
  note?: string;
}) {
  return (
    <div className="mb-2.5 mt-8 flex items-center gap-3">
      {dot && (
        <i
          className="block size-2.5 shrink-0 rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      <h2 className="whitespace-nowrap text-[13px] font-semibold">{title}</h2>
      {source && (
        <span className="whitespace-nowrap rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {source}
        </span>
      )}
      <span className="h-px flex-1 bg-[var(--line)]" />
      {note && (
        <span className="hidden whitespace-nowrap text-[11.5px] text-[var(--ink-3)] sm:inline">
          {note}
        </span>
      )}
    </div>
  );
}

function Cell({ label, bucket, bordered }: { label: string; bucket: Bucket; bordered?: boolean }) {
  return (
    <div className={`px-5 py-4 ${bordered ? "border-l border-[var(--line-soft)]" : ""}`}>
      <Label>{label}</Label>
      <p
        className={`mt-1 font-serif text-2xl leading-tight tracking-tight tabular-nums ${
          bucket.net > 0 ? "text-[var(--cash-deep)]" : "text-[var(--ink-3)]"
        }`}
      >
        {money(bucket.net)}
      </p>
      <p className="text-[12px] text-[var(--ink-3)]">{plural(bucket.count, "sale")}</p>
    </div>
  );
}

/**
 * `tone` says what the figure *is*, and the colour follows from that — cash in,
 * spend out, on the calendar, a woman, or a pass/fail judgement. Never pick one
 * for contrast.
 */
const ROW_TONE: Record<string, string> = {
  good: "text-[var(--cash-deep)]",
  bad: "text-[var(--stop)]",
  cash: "text-[var(--cash-deep)]",
  spend: "text-[var(--spend-deep)]",
  ahead: "text-[var(--ahead-deep)]",
  her: "text-[var(--her-deep)]",
  mute: "font-normal text-[var(--ink-3)]",
};

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
  tone?: "good" | "bad" | "mute" | "cash" | "spend" | "ahead" | "her";
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-[var(--line)] py-2 last:border-0">
      <span className="text-[13px] text-[var(--ink-2)]">
        {label}
        <small className="mt-0.5 block text-[11.5px] leading-snug text-[var(--ink-3)]">
          {hint}
        </small>
      </span>
      <span
        className={`whitespace-nowrap font-semibold tabular-nums tracking-tight ${
          big ? "text-[19px]" : "text-[16px]"
        } ${tone ? ROW_TONE[tone] : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

/** Saving / saved / failed, in the smallest space that reads. */
function SaveState({
  saving,
  saved,
  failed,
}: {
  saving: boolean;
  saved: boolean;
  failed: boolean;
}) {
  if (saving) return <span className="text-[var(--ink-3)]">saving…</span>;
  if (saved) return <span className="font-semibold text-[var(--cash)]">saved ✓</span>;
  if (failed) return <span className="font-semibold text-[var(--stop)]">failed</span>;
  return null;
}

/**
 * One amber underline you type a number into, and nothing else.
 *
 * No box, no ring, no outline on focus — the rule under the figure thickens
 * into {@link PALETTE} amber and that is the whole focus state.
 *
 * Three things have to be turned off for that, not one. `outline-none` kills
 * the browser default and `focus:ring-0` Tailwind's, but the pink one comes
 * from **`input:focus` in `app/globals.css`**, which paints a 2px
 * `var(--ring)` box-shadow on every input in the app. An element selector
 * loses to a class, so `focus:[box-shadow:none]` overrides it here without
 * touching the funnel and login fields that rule was written for.
 */
function SpendInput({
  day,
  value,
  onChange,
  onBlur,
  className = "w-24",
  size = "text-[15px]",
}: {
  day: string;
  value: string;
  onChange: (day: string, value: string) => void;
  onBlur: (day: string) => void;
  className?: string;
  size?: string;
}) {
  return (
    <label className={`group inline-flex items-baseline gap-1 ${className}`}>
      <span className={`${size} font-medium text-[var(--spend)]/70`}>$</span>
      <input
        value={value}
        onChange={(e) => onChange(day, e.target.value)}
        onBlur={() => onBlur(day)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        inputMode="decimal"
        placeholder="0"
        aria-label={`Ad spend for ${dayLabel(day)}`}
        className={`w-full min-w-0 border-0 border-b border-[var(--spend-line)] bg-transparent py-0.5 font-semibold tabular-nums text-[var(--spend-deep)] shadow-none outline-none transition-colors placeholder:font-normal placeholder:text-[var(--ink-3)] hover:border-[var(--spend)]/60 focus:border-b-2 focus:border-[var(--spend)] focus:outline-none focus:ring-0 focus:[box-shadow:none] ${size}`}
      />
    </label>
  );
}

/**
 * Ad spend, auto-saved — no calendar picker, no Save button, and no wall of
 * boxes.
 *
 * **Today is the only field on screen.** It is the only one you type on a
 * normal day: you read the number off Meta Ads Manager at the end of the day
 * and enter it once. The other {@link SPEND_STRIP_DAYS} days are a backfill
 * job, so they live behind the `⋯` and open as a plain list. If any of the last
 * 7 days is still empty the toggle says so in amber, because that is the one
 * state where opening it actually matters — cost per customer is understated
 * until those are filled in.
 *
 * Typing debounces a save 700ms after the last keystroke; tabbing or clicking
 * away saves immediately. Clearing a field removes that day.
 */
function AdSpendStrip({
  stats,
  drafts,
  saving,
  saved,
  errors,
  onChange,
  onBlur,
}: {
  stats: Stats;
  drafts: Record<string, string>;
  saving: Record<string, boolean>;
  saved: Record<string, boolean>;
  errors: Record<string, string>;
  onChange: (day: string, value: string) => void;
  onBlur: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = stats.costs.todayIso;
  const earlier = lastNDays(today, SPEND_STRIP_DAYS)
    .filter((d) => d !== today)
    .reverse(); // newest first — yesterday is the one you actually reach for
  const missing = stats.costs.missingDays.filter((d) => d !== today).length;
  const firstError = Object.entries(errors)[0];

  return (
    <div className="border-t border-[var(--line)] bg-[var(--spend-bg)] px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-4">
          <ColumnHead color="var(--spend)" className="">
            Ad spend
          </ColumnHead>
          <span className="flex items-baseline gap-2">
            <SpendInput
              day={today}
              value={drafts[today] ?? ""}
              onChange={onChange}
              onBlur={onBlur}
              className="w-28"
              size="text-[17px]"
            />
            <span className="text-[11.5px] text-[var(--spend-deep)]/70">today</span>
          </span>
          <span className="text-[10px] leading-none">
            <SaveState
              saving={!!saving[today]}
              saved={!!saved[today]}
              failed={!!errors[today]}
            />
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11.5px] text-[var(--spend-deep)]/70">
            Copied from Meta Ads Manager · saves as you type
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors ${
              missing > 0 && !open
                ? "border-[var(--spend)] bg-white text-[var(--spend-deep)] hover:bg-[var(--spend-bg)]"
                : "border-[var(--spend-line)] bg-white text-[var(--spend-deep)]/80 hover:border-[var(--spend)]"
            }`}
          >
            {open ? "Hide earlier days" : missing > 0 ? `⋯ ${missing} day${missing === 1 ? "" : "s"} missing` : "⋯ Earlier days"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-x-8 gap-y-0 border-t border-[var(--spend-line)] pt-2 sm:grid-cols-2 lg:grid-cols-3">
          {earlier.map((day) => {
            const isMissing = stats.costs.missingDays.includes(day);
            return (
              <div
                key={day}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--spend-line)] py-1.5"
              >
                <span className="flex items-baseline gap-2 text-[12.5px] text-[var(--ink-2)]">
                  <span className="w-8 font-semibold text-[var(--spend-deep)]">
                    {weekdayLabel(day)}
                  </span>
                  <span className="tabular-nums text-[var(--ink-3)]">{dayLabel(day)}</span>
                  {isMissing && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--spend)]">
                      missing
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-[9.5px] leading-none">
                    <SaveState
                      saving={!!saving[day]}
                      saved={!!saved[day]}
                      failed={!!errors[day]}
                    />
                  </span>
                  <SpendInput
                    day={day}
                    value={drafts[day] ?? ""}
                    onChange={onChange}
                    onBlur={onBlur}
                    className="w-20"
                    size="text-[13.5px]"
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {firstError && (
        <p className="mt-2 text-[12px] text-[var(--stop)]">
          {dayLabel(firstError[0])}: {firstError[1]}
        </p>
      )}
    </div>
  );
}

function EmptyPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-[var(--her)]">→</span>
      <span>{children}</span>
    </li>
  );
}

/** New = money arrived. Renewal = the calendar paying out. Refunded = wrong. */
const TAG: Record<string, string> = {
  new: "border-[var(--cash-line)] bg-[var(--cash-bg)] text-[var(--cash-deep)]",
  renewal: "border-[var(--ahead-line)] bg-[var(--ahead-bg)] text-[var(--ahead-deep)]",
  refunded: "border-[var(--stop-line)] bg-[var(--stop-bg)] text-[var(--stop-deep)]",
};

function Tag({ kind }: { kind: "new" | "renewal" | "refunded" }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] ${TAG[kind]}`}
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
 * band between the lines is the gap, green while collected is ahead of spend
 * and red while it is behind. Green line = money in, amber dashed = money out,
 * the same two colours they carry everywhere else on the page.
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
      <p className="py-8 text-center text-[13px] text-[var(--ink-3)]">
        Nothing spent and nothing collected in 30 days. This is the chart to watch on day one — the
        two lines start together and you want the{" "}
        <b className="font-semibold text-[var(--cash-deep)]">green</b> one on top.
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

  /*
   * The band, as one polygon per contiguous ahead/behind run rather than one
   * per day. Abutting polygons antialias into a hairline seam along every
   * shared edge, so 29 of them drew 28 faint vertical stripes across the fill —
   * reading as structure in data that has none. The sign only changes at a
   * crossing, so in practice this is one or two shapes.
   */
  const bands: { ahead: boolean; from: number; to: number }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const ahead = cumRev[i + 1] >= cumSpend[i + 1];
    const last = bands[bands.length - 1];
    if (last && last.ahead === ahead) last.to = i + 1;
    else bands.push({ ahead, from: i, to: i + 1 });
  }
  const bandPoints = ({ from, to }: { from: number; to: number }) => {
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = from; i <= to; i++) {
      top.push(`${x(i).toFixed(1)},${y(cumRev[i]).toFixed(1)}`);
      bottom.unshift(`${x(i).toFixed(1)},${y(cumSpend[i]).toFixed(1)}`);
    }
    return [...top, ...bottom].join(" ");
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label={`Running total over 30 days: ${money(a)} collected against ${money(b)} of ad spend.`}
    >
      {/*
       * `gradientUnits="userSpaceOnUse"` is not optional here. The band is 29
       * separate polygons, and under the default objectBoundingBox each one
       * rescales the ramp to its own height — so a tall segment and a short one
       * shade completely differently and the fill comes out as vertical stripes
       * that look like erratic data. In user space every segment samples the
       * same ramp, top of plot to baseline, and the band reads as one wash.
       */}
      <defs>
        <linearGradient
          id="cashAhead"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={PADT}
          x2={0}
          y2={H - PADB}
        >
          <stop offset="0%" stopColor="var(--cash)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--cash)" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient
          id="cashBehind"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={PADT}
          x2={0}
          y2={H - PADB}
        >
          <stop offset="0%" stopColor="var(--stop)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--stop)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <line x1={PADL} y1={y(0)} x2={W - PADR} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
      {bands.map((b) => (
        <polygon
          key={b.from}
          points={bandPoints(b)}
          fill={b.ahead ? "url(#cashAhead)" : "url(#cashBehind)"}
        />
      ))}
      {crossAt !== null && (
        <>
          <line
            x1={x(crossAt)}
            y1={PADT}
            x2={x(crossAt)}
            y2={H - PADB}
            stroke="var(--cash)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text x={x(crossAt) + 6} y={PADT + 11} fontSize={11} fontWeight={600} fill="var(--cash)">
            paid for itself
          </text>
        </>
      )}
      <path
        d={path(cumSpend)}
        fill="none"
        stroke="var(--spend)"
        strokeWidth={2}
        strokeDasharray="5 4"
        strokeLinecap="round"
      />
      <path
        d={path(cumRev)}
        fill="none"
        stroke="var(--cash)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(n - 1)} cy={y(b)} r={3.5} fill="var(--spend)" stroke="#fff" strokeWidth={2} />
      <text
        x={x(n - 1) + 9}
        y={y(b) + 4}
        fontSize={11.5}
        fontWeight={600}
        fill="var(--spend-deep)"
        className="tabular-nums"
      >
        {money(b, 0)}
      </text>
      <circle cx={x(n - 1)} cy={y(a)} r={3.5} fill="var(--cash)" stroke="#fff" strokeWidth={2} />
      <text
        x={x(n - 1) + 9}
        y={y(a) + 4}
        fontSize={11.5}
        fontWeight={600}
        fill="var(--cash-deep)"
        className="tabular-nums"
      >
        {money(a, 0)}
      </text>
      <text x={PADL} y={H - 6} fontSize={10.5} fill="var(--ink-3)">
        30 days ago
      </text>
      <text x={W - PADR} y={H - 6} fontSize={10.5} fill="var(--ink-3)" textAnchor="end">
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
 * Stripe Checkout are an offer-screen problem, women who reach it and don't pay
 * are a checkout problem.
 *
 * The bars run rose → green: they arrive as women and leave as money, so the
 * last step is the only one wearing the colour Stripe figures wear.
 */
/**
 * Screen names as they read to a person, not as they read in the code.
 *
 * Deliberately a lookup with a fallback rather than an exhaustive map: the step
 * list lives in `app/register/page.tsx` and this panel must never be the reason
 * a step cannot be added there. An unknown key prints its raw name, which is
 * ugly and correct — better than a step silently missing from the curve.
 */
const STEP_LABELS: Record<string, string> = {
  start: "Start screen",
  q1_age: "Q1 · Age",
  q4_symptoms: "Q2 · Symptoms",
  q_symptom_impact: "Q3 · How hard it hits",
  q2_here_for: "Q4 · Her stage",
  q_menopause_type: "Q5 · How it began",
  q3_goals: "Q6 · Goal",
  reward_symptoms: "🎁 Starting point",
  q_body: "Q7 · Height + weight",
  q_fitness: "Q8 · Time for exercise",
  q_training_time: "Q9 · Time of day",
  reward_social_proof: "🎁 Someone like her",
  q_nutrition: "Q10 · Eating",
  q_relaxation: "Q11 · Unwinding",
  reward_plan_shape: "🎁 Her week, sized",
  q5_hrt: "Q12 · HRT",
  reward_progress: "🎁 Plan rules",
  q8_name: "Q13 · Name",
  calculating: "Building her plan",
  results: "Results + score",
  diagnosis: "The plan",
  relief: "Breathing exercise",
  paywall: "Paywall",
  download: "Paid · download",
};

/**
 * The whole funnel in one block: the landing screen down to the charge.
 *
 * This was two panels — "Where they stop" (quiz finished -> checkout -> paid)
 * and "Which screen loses them" (the screen-by-screen curve) — stacked one above
 * the other, answering halves of the same question. Reading them meant holding
 * the last bar of one against the first bar of the other, which is work the
 * panel should be doing.
 *
 * They are merged, but deliberately **not flattened onto one base**, because the
 * two halves are not measured the same way and pretending otherwise is the only
 * real mistake available here:
 *
 *   - **Inside the quiz** is `funnel_events`, counted by *visit*. One woman
 *     across two tabs is two. It exists at all only because the funnel mints her
 *     account on step 17 of 17, so nothing before that has a person attached.
 *   - **After the quiz** is Supabase profiles and Stripe charges, counted by
 *     *woman*, and it is the only half where money appears.
 *
 * So each band carries its own unit, its own source and its own 100%, and the
 * seam between them is drawn rather than hidden. The line at the bottom reads
 * the chain out in plain English, which is the sentence the panel exists to
 * produce.
 *
 * Two presentation rules that are really measurement rules, both carried over
 * from the block this replaces:
 *
 *   - **The bar is share of that band's first row; the coloured figure is the
 *     loss against the row directly above.** They answer different questions and
 *     the second is the reason this exists: a cumulative curve falls
 *     monotonically, so every late step looks bad by construction and none of
 *     them is accused of anything. The step-to-step loss is what names a screen.
 *   - **A loss is only coloured when it sits on a base worth dividing by.** The
 *     first live render of this painted `4 -> 2` and `2 -> 1` bright orange as
 *     50% cliffs, which is noise wearing the costume of a finding. Both
 *     thresholds come from the route so the bar, the figure and the verdict can
 *     never use different rules.
 */
const CLIFF_PCT = 25;

/** One row of either band. Identical geometry in both, so the eye reads the
 *  whole thing as a single falling curve even though the base changes once. */
function FunnelRow({
  label,
  count,
  width,
  drop,
  cliff,
  fill,
  strong = false,
  note,
}: {
  label: string;
  count: string;
  width: number;
  drop: number | null;
  cliff: boolean;
  fill: string;
  strong?: boolean;
  note?: string;
}) {
  return (
    <div className="grid grid-cols-[136px_1fr_40px_52px] items-center gap-x-3 sm:grid-cols-[172px_1fr_44px_56px]">
      <span
        className={`truncate leading-tight ${
          strong ? "text-[12.5px] font-medium text-[var(--ink)]" : "text-[12px] text-[var(--ink-2)]"
        }`}
        title={note}
      >
        {label}
      </span>
      <span className={`flex items-center ${strong ? "h-[22px]" : "h-[18px]"}`}>
        <span
          className={`min-w-[2px] rounded transition-[width] duration-500 ${
            strong ? "h-[18px]" : "h-[14px]"
          }`}
          style={{ width: `${width}%`, background: fill }}
        />
      </span>
      {/* Count and delta are separate fixed columns so both scan straight down
          the page. Sharing one cell made the counts jump left and right
          depending on whether a step had lost anyone. */}
      <b
        className={`text-right font-semibold tabular-nums text-[var(--ink)] ${
          strong ? "text-[13px]" : "text-[12px]"
        }`}
      >
        {count}
      </b>
      <span
        className={`text-right text-[12px] tabular-nums ${
          cliff ? "text-[#C2410C]" : "text-[var(--ink-3)]"
        }`}
      >
        {drop !== null && drop > 0 ? `−${drop}%` : ""}
      </span>
    </div>
  );
}

/** The label above each band. It names the unit, because the unit changes. */
function BandHead({ title, unit }: { title: string; unit: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[var(--ink-3)]">
        {title}
      </span>
      <span className="text-[10.5px] text-[var(--ink-3)]">{unit}</span>
    </div>
  );
}

function WholeFunnel({
  rows,
  worst,
  entrySessions,
  minVerdictEntry,
  trackingSince,
  error,
  quiz,
  checkout,
  paid,
  sessionsError,
  keptPerSale,
  since,
}: {
  rows: Stats["funnel"]["dropoff"];
  worst: Stats["funnel"]["worstStep"];
  entrySessions: number;
  minVerdictEntry: number;
  trackingSince: string | null;
  error: string | null;
  quiz: number;
  checkout: number;
  paid: number;
  sessionsError: string | null;
  keptPerSale: number;
  since: string;
}) {
  const entry = rows[0]?.sessions ?? 0;
  const confident = entrySessions >= minVerdictEntry;
  const hasVerdict = confident && worst && worst.dropPct !== null && worst.dropPct >= CLIFF_PCT;

  // Screen tracking is younger than the window for as long as the campaign
  // floor predates 2026-09-02. Without saying so, "2 reached the paywall" sitting
  // above "10 finished the quiz" reads as a broken funnel rather than a young one.
  const lagged =
    trackingSince !== null &&
    new Date(trackingSince).getTime() - new Date(since).getTime() > 12 * 60 * 60 * 1000;

  // Band B bars share band B's own 100% (quiz finishers). Clamped, because a
  // later step can legitimately exceed the first when leftover test-mode
  // checkout sessions meet a handful of real quiz rows.
  const wMoney = (v: number) =>
    quiz > 0 ? Math.min(Math.max((v / quiz) * 100, v > 0 ? 1.5 : 0), 100) : 0;
  const dropOf = (prev: number, now: number) =>
    prev > 0 ? Math.round(((prev - now) / prev) * 100) : null;
  const rate = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");
  // A later money step outrunning an earlier one is not impossible, it is a
  // window artefact: a Checkout Session cannot be deleted, so test-mode taps sit
  // in the window for a full 30 days. The bars clamp; the percentage prints the
  // true figure and would otherwise read as "138% of those pay", which looks
  // like a broken panel rather than an uncleared window.
  const inverted = !sessionsError && (checkout > quiz || paid > checkout);

  const HER = "linear-gradient(90deg, color-mix(in srgb, var(--her) 34%, white), var(--her))";
  const CLIFF = "linear-gradient(90deg, #FDBA74, #FB923C)";
  const CASH = "linear-gradient(90deg, var(--cash), var(--cash-deep))";

  return (
    <div className="px-6 py-5">
      {/* The instruction, or an honest account of why there isn't one yet.
          Never both, and never the instruction on a base this small. */}
      {error ? (
        <p className="mb-4 text-[13px] text-[var(--ink-2)]">{error}</p>
      ) : hasVerdict ? (
        <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--quiet)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
          Biggest single drop:{" "}
          <b className="font-semibold text-[var(--ink)]">
            {STEP_LABELS[worst!.step] ?? worst!.step}
          </b>{" "}
          loses{" "}
          <b className="font-semibold tabular-nums text-[#C2410C]">{worst!.dropPct}%</b> of everyone
          who reached the screen before it. Fix that screen before any other.
        </p>
      ) : (
        <p className="mb-4 rounded-lg border border-dashed border-[var(--line)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          <b className="font-semibold tabular-nums text-[var(--ink-2)]">
            {entrySessions.toLocaleString("en-US")}
          </b>{" "}
          {entrySessions === 1 ? "visit" : "visits"} so far — too few to name a screen. The shape
          below is real; the percentages are not yet worth acting on. This turns into a verdict at{" "}
          <b className="font-semibold tabular-nums text-[var(--ink-2)]">{minVerdictEntry}</b>.
        </p>
      )}

      {/* ── Band A · inside the quiz ─────────────────────────────────────── */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--line)] px-3.5 py-4 text-center text-[12.5px] text-[var(--ink-3)]">
          No screens recorded yet. This fills in once someone opens{" "}
          <code className="rounded bg-[var(--quiet)] px-1 py-0.5 text-[12px]">/register</code> on the
          instrumented build — nothing is broken.
        </p>
      ) : (
        <>
          <BandHead title="Inside the quiz" unit="visits · Supabase" />
          <div className="space-y-0.5">
            {rows.map((r) => {
              // Both halves matter: a big percentage on a base of two is not a
              // cliff, it is two people.
              const cliff = r.significant && r.dropPct !== null && r.dropPct >= CLIFF_PCT;
              const width = entry > 0 ? Math.min((r.sessions / entry) * 100, 100) : 0;
              return (
                <FunnelRow
                  key={r.index}
                  label={STEP_LABELS[r.step] ?? r.step}
                  count={r.sessions.toLocaleString("en-US")}
                  width={Math.max(width, r.sessions > 0 ? 1.5 : 0)}
                  drop={r.dropPct}
                  cliff={cliff}
                  fill={cliff ? CLIFF : HER}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── The seam ─────────────────────────────────────────────────────── */}
      <div className="my-4 border-t border-dashed border-[var(--line)]" />

      {/* ── Band B · after the quiz ──────────────────────────────────────── */}
      <BandHead title="After the quiz" unit="women · Supabase + Stripe" />
      <div className="space-y-1">
        <FunnelRow
          label="Finished the quiz"
          count={quiz.toLocaleString("en-US")}
          width={quiz > 0 ? 100 : 0}
          drop={null}
          cliff={false}
          fill={HER}
          strong
        />
        <FunnelRow
          label="Opened the card form"
          count={sessionsError ? "—" : checkout.toLocaleString("en-US")}
          width={sessionsError ? 0 : wMoney(checkout)}
          drop={sessionsError ? null : dropOf(quiz, checkout)}
          // Never coloured. Losing most of the room between the quiz and the
          // card form is what this step does on a healthy funnel, so a
          // threshold here would sit orange permanently and teach the eye to
          // ignore the colour that names a screen above.
          cliff={false}
          fill={HER}
          strong
        />
        <FunnelRow
          label="Paid"
          count={paid.toLocaleString("en-US")}
          width={wMoney(paid)}
          drop={sessionsError ? null : dropOf(checkout, paid)}
          cliff={false}
          fill={CASH}
          strong
        />
      </div>

      {/* The two rates this band exists to separate: a weak offer screen and a
          leaking checkout are different problems with different fixes. */}
      {!sessionsError && quiz > 0 && (
        <p className="mt-2 pl-[148px] text-[11.5px] leading-relaxed text-[var(--ink-3)] sm:pl-[184px]">
          <b className="font-semibold tabular-nums text-[var(--her-deep)]">
            {rate(checkout, quiz)}
          </b>{" "}
          of finishers reach the card form — that is the offer screen&rsquo;s job.{" "}
          <b className="font-semibold tabular-nums text-[var(--her-deep)]">
            {rate(paid, checkout)}
          </b>{" "}
          of those pay — that is checkout abandonment.
        </p>
      )}

      {/* ── The chain, in one sentence ───────────────────────────────────── */}
      <p className="mt-4 border-t border-[var(--line)] pt-3 text-[12.5px] leading-relaxed text-[var(--ink-2)]">
        {entrySessions > 0 && !lagged && (
          <>
            <b className="font-semibold tabular-nums text-[var(--ink)]">{entrySessions}</b>{" "}
            {entrySessions === 1 ? "visit" : "visits"} →{" "}
          </>
        )}
        <b className="font-semibold tabular-nums text-[var(--ink)]">{quiz}</b> finished the quiz →{" "}
        <b className="font-semibold tabular-nums text-[var(--ink)]">
          {sessionsError ? "—" : checkout}
        </b>{" "}
        opened the card form →{" "}
        <b className="font-semibold tabular-nums text-[var(--cash-deep)]">{paid}</b>{" "}
        {paid === 1 ? "paid" : "paid"}.
        {quiz > 0 && (
          <>
            {" "}
            Every 100 quiz finishers are worth{" "}
            <b className="font-semibold tabular-nums text-[var(--cash-deep)]">
              {money((paid / quiz) * 100 * keptPerSale, 0)}
            </b>{" "}
            kept — that is what a click is allowed to cost.
          </>
        )}
      </p>

      {sessionsError && (
        <p className="mt-2 text-[12px] text-[var(--spend-deep)]">
          {sessionsError}, so the middle step is blank. The two ends are still correct.
        </p>
      )}

      {inverted && (
        <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">
          A later step is bigger than the one above it, so a rate here reads over 100%. Stripe
          Checkout Sessions cannot be deleted, so your own test taps stay in the window for 30 days
          — set{" "}
          <code className="rounded bg-[var(--quiet)] px-1 py-0.5 text-[11px]">
            ADMIN_CAMPAIGN_START
          </code>{" "}
          to floor it at the day the campaign began.
        </p>
      )}

      {lagged && (
        <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">
          Screen tracking started {shortDate(trackingSince!)}, after this window opened — so the top
          band covers fewer days than the bottom one, and the two counts are not yet comparable.
        </p>
      )}

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--ink-3)]">
        Each band is measured against its own first row, because the units differ: the top counts
        visits (one woman in two tabs is two) and the bottom counts women. The figure on the right is
        what that one step lost against the step above it — the number that names a screen — and it
        is only coloured when enough people stood on the step above for the percentage to mean
        anything.
      </p>
    </div>
  );
}
