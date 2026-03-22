"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
import { useTrialStatus } from "@/lib/useTrialStatus";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const trialStatus = useTrialStatus();
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

  if (trialStatus.loading) {
    return (
      <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-48 rounded-lg bg-muted" />
          <div className="h-24 rounded-2xl bg-muted" />
          <div className="h-64 rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 pb-12 sm:pb-16 md:pb-20 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Account
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          Your plan, trial, and subscription live here. Subscribe or change your billing whenever you need
          to — everything stays in one calm place.
        </p>
        <p className="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          Use the card below to choose a plan, open the billing portal, or see when your access renews.
          Your symptom history and preferences are not affected by opening these options.
        </p>
      </div>

      <section className="mb-8 sm:mb-10" aria-label="Plan and subscription">
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
          Return to your health overview and recent activity.
        </p>
      </div>
    </div>
  );
}
