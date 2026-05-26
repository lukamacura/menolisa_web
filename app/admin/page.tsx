"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  totalSubscribers: number;
  monthly: { count: number; mrr: number; percent: number };
  annual: { count: number; mrr: number; percent: number };
  unknownCount: number;
  totalMrr: number;
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
            sub="Active + in trial"
            accent="blue"
          />
          <StatCard
            label="Monthly plans"
            value={stats.monthly.count.toString()}
            sub={`${money(stats.monthly.mrr)} / mo`}
            accent="yellow"
          />
          <StatCard
            label="Annual plans"
            value={stats.annual.count.toString()}
            sub={`${money(stats.annual.mrr)} / mo (norm.)`}
            accent="green"
          />
        </div>

        {/* MRR + income split */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Monthly recurring revenue</h2>
            <span className="text-2xl font-bold text-emerald-600">{money(stats.totalMrr)}</span>
          </div>

          {/* Split bar */}
          <div>
            <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="bg-yellow-400"
                style={{ width: `${stats.monthly.percent}%` }}
                title={`Monthly ${stats.monthly.percent}%`}
              />
              <div
                className="bg-emerald-500"
                style={{ width: `${stats.annual.percent}%` }}
                title={`Annual ${stats.annual.percent}%`}
              />
            </div>
            <div className="mt-3 flex items-center gap-6 text-sm">
              <Legend color="bg-yellow-400" label="Monthly" pct={stats.monthly.percent} />
              <Legend color="bg-emerald-500" label="Annual" pct={stats.annual.percent} />
            </div>
          </div>
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

function Legend({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <span className="flex items-center gap-2 text-slate-600">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label} <span className="font-semibold text-slate-800">{pct}%</span>
    </span>
  );
}
