"use client";

import { useMemo, useEffect } from "react";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";
import { useSymptoms } from "@/hooks/useSymptoms";
import { useNotification } from "@/hooks/useNotification";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useRouter } from "next/navigation";

export default function EmptyState() {
  const { logs, loading } = useSymptomLogs(30); // Last 30 days for new user check
  const { loading: symptomsLoading } = useSymptoms();
  const { show } = useNotification();
  const { profile } = useUserProfile();
  const router = useRouter();

  const hasLogsToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return logs.some((log) => {
      const logDate = new Date(log.logged_at);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === today.getTime();
    });
  }, [logs]);

  const isNewUser = useMemo(() => {
    return logs.length === 0;
  }, [logs]);

  // Show welcome notification for new users
  useEffect(() => {
    if (loading || symptomsLoading || hasLogsToday) return;
    
    if (isNewUser) {
      // Delay notification slightly to let page settle
      const timer = setTimeout(() => {
        const firstName = profile?.name?.split(" ")[0] ?? null;
        const welcomeTitle = firstName ? `Hi, ${firstName}! I'm Lisa` : "Hi! I'm Lisa";
        show("welcome", welcomeTitle, {
          message: "Tap any symptom card to log how you're feeling — I'll start spotting your patterns right away.",
          showOnce: true,
          primaryAction: {
            label: "Let's start",
            action: () => {},
          },
        });
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [loading, symptomsLoading, hasLogsToday, isNewUser, show, profile]);

  // Component doesn't render anything - notifications handle the messaging
  return null;
}

