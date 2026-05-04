"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings, ArrowRight } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
import { InviteReferralSection } from "@/components/InviteReferralSection";
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

      <InviteReferralSection className="mb-6 sm:mb-8" />

      <Link
        href="/dashboard/settings"
        className="group relative overflow-hidden block rounded-xl sm:rounded-2xl border border-border/30 bg-card backdrop-blur-lg p-4 sm:p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div
              className="shrink-0 p-2.5 sm:p-3 rounded-xl shadow-md"
              style={{ background: "linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)" }}
            >
              <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0.5 sm:mb-1 truncate">
                Settings
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                Notification preferences and privacy controls
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>
    </div>
  );
}
