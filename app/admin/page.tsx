"use client";

import { useCallback, useEffect, useState } from "react";

type RecentSubscriber = {
  user_id: string;
  name: string | null;
  created_at: string | null;
  account_status: string | null;
  plan_type: string | null;
};

type Stats = {
  totalSubscribers: number;
  /** The only plan sold: $59 per 8 weeks. */
  plan8w: { count: number; mrr: number };
  /** Paid rows whose plan_type isn't recognised — should stay 0. */
  unknownCount: number;
  totalMrr: number;
  recentSubscribers: RecentSubscriber[];
};

const SESSION_KEY = "admin_panel_pw";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // ---- Dashboard ----
  return (
    <main className="min-h-dvh bg-slate-50 p-6  sm:p-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800 pt-22">MenoLisa Admin</h1>
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

        {/* Top stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Subscribers"
            value={stats.totalSubscribers.toString()}
            sub="Active + canceling"
            accent="blue"
          />
          <StatCard
            label="8-week plans"
            value={stats.plan8w.count.toString()}
            sub={`${money(stats.plan8w.mrr)} / mo (norm.)`}
            accent="green"
          />
          <StatCard
            label="Unrecognised plan"
            value={stats.unknownCount.toString()}
            sub={stats.unknownCount > 0 ? "Paid rows with no plan_type" : "None — as expected"}
            accent={stats.unknownCount > 0 ? "red" : "yellow"}
          />
        </div>

        {/* MRR */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Monthly recurring revenue</h2>
            <span className="text-2xl font-bold text-emerald-600">{money(stats.totalMrr)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            $59 per 8 weeks, normalised to a monthly figure.
          </p>
        </div>

        {/* Recent subscribers */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Recent subscribers</h2>
          <ul className="divide-y divide-slate-100">
            {stats.recentSubscribers.length === 0 && (
              <li className="py-3 text-sm text-slate-400">No subscribers yet.</li>
            )}
            {stats.recentSubscribers.map((s) => (
              <li key={s.user_id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {(s.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-800">{s.name ?? "Unknown"}</span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <StatusBadge status={s.account_status} planType={s.plan_type} />
                  <span className="text-xs text-slate-400 w-24">
                    {s.created_at
                      ? new Date(s.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </main>
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
      <p className="mt-1 text-sm opacity-70">{sub}</p>
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = {
  plan8w: "8-week",
};

function StatusBadge({ status, planType }: { status: string | null; planType: string | null }) {
  const planLabel = planType ? (PLAN_LABELS[planType] ?? planType) : null;
  const label = status === "paid" ? (planLabel ?? "paid") : (status ?? "—");
  const colors =
    status === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${colors}`}>
      {label}
    </span>
  );
}
