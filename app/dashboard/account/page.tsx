"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
import { useDashboardTrialStatus } from "@/lib/dashboardTrialContext";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const trialStatus = useDashboardTrialStatus();
  const { logs } = useSymptomLogs(30);
  const [patternCount, setPatternCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/tracker-insights?days=30", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;
        const { data } = await response.json();
        const patterns =
          data?.plainLanguageInsights?.filter(
            (insight: { type: string }) => insight.type === "pattern"
          ) || [];
        if (!cancelled) setPatternCount(patterns.length);
      } catch {
        if (!cancelled) setPatternCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 pb-24 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Account
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
          Plan, trial, and billing - update anytime below.
        </p>
      </div>

      <section className="mb-8 sm:mb-10" aria-label="Plan and subscription">
        {trialStatus.loading ? (
          <div className="animate-pulse space-y-3 rounded-2xl border border-border p-4 sm:p-6">
            <div className="h-6 w-40 rounded bg-muted" />
            <div className="h-32 rounded-xl bg-muted" />
            <div className="h-12 w-full rounded-xl bg-muted" />
          </div>
        ) : (
          <TrialCard
            trial={{
              expired: trialStatus.expired,
              start: trialStatus.start,
              end: trialStatus.end,
              daysLeft: trialStatus.daysLeft,
              elapsedDays: trialStatus.elapsedDays,
              progressPct: trialStatus.progressPct,
              remaining: trialStatus.remaining,
              trialDays: trialStatus.trialDays,
            }}
            accountStatus={trialStatus.accountStatus}
            subscriptionCanceled={trialStatus.subscriptionCanceled}
            symptomCount={logs.length}
            patternCount={patternCount}
          />
        )}
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Link
          href="/dashboard/overview"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white! shadow-md transition-all duration-200 hover:opacity-95 hover:shadow-lg hover:text-white! min-h-[44px] w-full sm:w-auto focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white/80"
          style={{
            background: "linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)",
            color: "#ffffff",
          }}
        >
          <LayoutDashboard className="h-5 w-5 shrink-0 text-current" aria-hidden />
          Go to my overview
        </Link>
        <p className="text-xs sm:text-sm text-muted-foreground sm:max-w-xs">
          Back to your dashboard.
        </p>
      </div>
    </div>
  );
}
