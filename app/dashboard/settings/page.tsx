"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, ArrowRight, Gift, Copy, Share2 } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
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

type InviteCopyState = "eligible" | "already_used" | "already_subscribed" | "no_referrals";

const INVITE_COPY: Record<
  InviteCopyState,
  { title: string; subtitle: string; shareText: string }
> = {
  eligible: {
    title: "Give 3 days free. Get 50% off.",
    subtitle:
      "Invite friends to try MenoLisa. They get 3 days free; you get 50% off your first subscription when you upgrade.",
    shareText: "Give 3 days free. Get 50% off. Invite friends to try MenoLisa.",
  },
  already_used: {
    title: "Invite friends — they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  already_subscribed: {
    title: "Invite friends — they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
  no_referrals: {
    title: "Invite friends — they get 3 days free.",
    subtitle: "Your friends get 3 days free when they sign up with your link.",
    shareText: "Invite friends to try MenoLisa. They get 3 days free.",
  },
};

function InviteReferralSection({ className = "" }: { className?: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [inviteCopyState, setInviteCopyState] = useState<InviteCopyState>("no_referrals");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/referral/code", { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Failed to load"))
      ),
      fetch("/api/referral/discount-eligible", { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.resolve({ inviteCopyState: "no_referrals" as InviteCopyState })
      ),
    ])
      .then(([codeData, eligibleData]) => {
        if (mounted && codeData?.code) setCode(codeData.code);
        else if (mounted) setCode(null);
        if (mounted && eligibleData?.inviteCopyState) setInviteCopyState(eligibleData.inviteCopyState);
      })
      .catch(() => {
        if (mounted) setCode(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const link =
    typeof window !== "undefined" && code
      ? `${window.location.origin}/register?ref=${encodeURIComponent(code)}`
      : "";

  const copyLink = useCallback(() => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [link]);

  const share = useCallback(() => {
    if (!link) return;
    const copy = INVITE_COPY[inviteCopyState];
    if (navigator.share) {
      navigator.share({
        title: "Try MenoLisa",
        text: copy.shareText,
        url: link,
      }).catch(() => copyLink());
    } else {
      copyLink();
    }
  }, [link, copyLink, inviteCopyState]);

  const copy = INVITE_COPY[inviteCopyState];

  return (
    <div className={className}>
      <div className="rounded-2xl border-2 border-amber-200/80 dark:border-amber-800/40 bg-transparent dark:from-amber-950/40 dark:to-orange-950/30 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl shrink-0 bg-orange-200 w-14 h-14 flex items-center justify-center">
            <Gift className="h-7 w-7 text-orange-600 " />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground mb-1">
              {copy.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {copy.subtitle}
            </p>
            {loading ? (
              <div className="h-9 w-24 rounded-lg bg-amber-200/50 dark:bg-amber-800/30 animate-pulse" />
            ) : link ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-orange-200 text-orange-600! px-3 py-2 text-sm font-medium  dark:text-amber-200 hover:bg-orange-400  transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-2 rounded-lg border  bg-amber-600 text-white px-3 py-2 text-sm font-medium hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Could not load your referral link. Please try again.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
