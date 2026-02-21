"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
import { InviteReferralSection } from "@/components/InviteReferralSection";
import { useTrialStatus } from "@/lib/useTrialStatus";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";

export default function SettingsPage() {
  const trialStatus = useTrialStatus();
  const { logs: symptomLogs } = useSymptomLogs(30);
  const [patternCount, setPatternCount] = useState(0);

  const fetchPatternCount = useCallback(async () => {
    try {
      const response = await fetch("/api/tracker-insights?days=30", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) return;
      const { data } = await response.json();
      const patterns = data?.plainLanguageInsights?.filter(
        (insight: { type: string }) => insight.type === "pattern"
      ) || [];
      setPatternCount(patterns.length);
    } catch {
      setPatternCount(0);
    }
  }, []);

  useEffect(() => {
    // Using an async function inside the effect to avoid calling setState synchronously
    const loadPatternCount = async () => {
      await fetchPatternCount();
    };
    loadPatternCount();
    // Only fetchPatternCount is a dependency as before
  }, [fetchPatternCount]);

  const settingsSections = [
    {
      title: "Notifications",
      description: "Manage when and how you receive reminders",
      href: "/dashboard/settings/notifications",
      icon: Bell,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Settings
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground">
          Manage your account preferences and notifications
        </p>
      </div>

      {/* Trial / subscription card */}
      <div className="mb-8">
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
          symptomCount={symptomLogs.length}
          patternCount={patternCount}
        />
      </div>

      {/* Invite friends / referral */}
      <InviteReferralSection className="mb-8" />

      <div className="space-y-4">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group relative overflow-hidden block rounded-2xl border border-border/30 bg-card backdrop-blur-lg p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.01]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl shadow-md" style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)' }}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-1">
                      {section.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
