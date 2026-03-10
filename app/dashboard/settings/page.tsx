"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, ArrowRight, Trash2 } from "lucide-react";
import { TrialCard } from "@/components/TrialCard";
import { InviteReferralSection } from "@/components/InviteReferralSection";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import { useTrialStatus } from "@/lib/useTrialStatus";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";
import { supabase } from "@/lib/supabaseClient";

export default function SettingsPage() {
  const trialStatus = useTrialStatus();
  const { logs: symptomLogs } = useSymptomLogs(30);
  const [patternCount, setPatternCount] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleDeleteAccount() {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data?.error ?? "Failed to delete account. Please try again.");
        return;
      }
      setDeleteDialogOpen(false);
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      setDeleteError("Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  const settingsSections = [
    {
      title: "Notifications",
      description: "Manage when and how you receive reminders",
      href: "/dashboard/settings/notifications",
      icon: Bell,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 pb-12 sm:pb-16 md:pb-20 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Settings
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-muted-foreground">
          Manage your account preferences and notifications
        </p>
      </div>

      {/* Trial / subscription card */}
      <div className="mb-6 sm:mb-8">
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
      <InviteReferralSection className="mb-6 sm:mb-8" />

      <div className="space-y-3 sm:space-y-4">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group relative overflow-hidden block rounded-xl sm:rounded-2xl border border-border/30 bg-card backdrop-blur-lg p-4 sm:p-6 shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="shrink-0 p-2.5 sm:p-3 rounded-xl shadow-md" style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)' }}>
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground mb-0.5 sm:mb-1 truncate">
                      {section.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {section.description}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-primary shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Delete account */}
      <div className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-border/50 pb-24">
        <div className="rounded-xl sm:rounded-2xl border bg-red-200 border-red-200/60  p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 sm:gap-4 sm:flex-1 min-w-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-1">Delete account</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Permanently delete your account and all associated data. This cannot be undone.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteDialogOpen(true);
              }}
              className="w-full flex items-center gap-2 sm:w-auto sm:shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-red-800  bg-red-300 hover:bg-red-400 transition-colors border border-red-200 dark:border-red-800/50 touch-manipulation"
            >
              <Trash2 className="h-5 w-5 text-red-800" />
              Delete account
            </button>
          </div>
        </div>
      </div>

      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        onConfirm={handleDeleteAccount}
        title="Delete account"
        message="This will permanently delete your account and all your data (symptoms, mood, conversations, profile, and preferences). This action cannot be undone."
        confirmLabel="Delete account"
        loadingLabel="Deleting account..."
        isLoading={isDeleting}
        error={deleteError}
      />
    </div>
  );
}
