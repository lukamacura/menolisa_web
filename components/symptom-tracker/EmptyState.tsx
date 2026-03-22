"use client";

import { useMemo } from "react";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";
import { useSymptoms } from "@/hooks/useSymptoms";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Sparkles } from "lucide-react";

export default function EmptyState() {
  const { logs, loading } = useSymptomLogs(30);
  const { loading: symptomsLoading } = useSymptoms();
  const { profile } = useUserProfile();

  const hasLogsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return logs.some((log) => {
      const logDate = new Date(log.logged_at);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === today.getTime();
    });
  }, [logs]);

  const isNewUser = useMemo(() => logs.length === 0, [logs]);

  if (loading || symptomsLoading || hasLogsToday) {
    return null;
  }

  if (!isNewUser) {
    return null;
  }

  const firstName = profile?.name?.split(" ")[0] ?? null;
  const welcomeTitle = firstName ? `Hi, ${firstName}! I'm Lisa` : "Hi! I'm Lisa";

  return (
    <div
      className="rounded-2xl border border-pink-200/80 bg-linear-to-br from-pink-50/90 via-white to-purple-50/80 p-4 sm:p-5 shadow-sm"
      role="status"
    >
      <div className="flex gap-3 sm:gap-4">
        <div
          className="shrink-0 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-linear-to-br from-pink-400 to-purple-400 text-white shadow-md"
          aria-hidden
        >
          <Sparkles className="h-5 w-5 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-bold text-foreground tracking-tight">{welcomeTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            Tap any symptom card to log how you&apos;re feeling — I&apos;ll start spotting your patterns right away.
          </p>
        </div>
      </div>
    </div>
  );
}
