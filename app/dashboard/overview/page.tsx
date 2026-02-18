"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import { Activity, ArrowRight, MessageSquare, Gift, Copy, Share2 } from "lucide-react";
import type { SymptomLog, Symptom } from "@/lib/symptom-tracker-constants";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";
import RecentLogs from "@/components/symptom-tracker/RecentLogs";
import { getTrialState, type TrialState } from "@/components/TrialCard";
import { Skeleton } from "@/components/ui/AnimatedComponents";
import { useTrialStatus } from "@/lib/useTrialStatus";
import LogSymptomModal from "@/components/symptom-tracker/LogSymptomModal";
import { useSymptoms } from "@/hooks/useSymptoms";
import type { LogSymptomData } from "@/lib/symptom-tracker-constants";

// Prevent static prerendering (safe)
export const dynamic = "force-dynamic";

// ---------------------------
// Small UI helpers
// ---------------------------
const MS = {
  SECOND: 1000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
};

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

// Optimized Animated Card Component (for overview cards and sections)
function AnimatedCard({
  children,
  index = 0,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
  delay?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
            // Remove will-change after animation completes
            setTimeout(() => {
              if (cardRef.current) {
                cardRef.current.style.willChange = "auto";
              }
            }, 600 + delay + index * 50);
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -30px 0px",
      }
    );

    const currentRef = cardRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [delay, index]);

  const totalDelay = delay + index * 50;

  return (
    <div
      ref={cardRef}
      className={classNames(
        "transition-all duration-600 ease-out",
        isVisible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-4 scale-98",
        className
      )}
      style={{
        transitionDelay: isVisible ? `${totalDelay}ms` : "0ms",
        willChange: isVisible ? "auto" : "transform, opacity",
        transform: isVisible 
          ? "translate3d(0, 0, 0) scale(1)" 
          : "translate3d(0, 16px, 0) scale(0.98)",
      }}
    >
      {children}
    </div>
  );
}


// ---------------------------
// Types
// ---------------------------

// ---------------------------
// Card Components
// ---------------------------

type InviteCopyState = "eligible" | "already_used" | "already_subscribed" | "no_referrals";

const REFERRAL_CARD_COPY: Record<
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

function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [inviteCopyState, setInviteCopyState] = useState<InviteCopyState>("no_referrals");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/referral/code", { credentials: "include" }).then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("Unauthorized"))
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

  const link = typeof window !== "undefined" && code
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
    const copy = REFERRAL_CARD_COPY[inviteCopyState];
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

  const copy = REFERRAL_CARD_COPY[inviteCopyState];

  return (
    <AnimatedCard index={2} delay={180}>
      <div className="relative overflow-hidden rounded-xl border-2 border-amber-200/80 bg-orange-200 p-5 shadow-xl dark:border-amber-800/40 dark:from-amber-950/30 dark:to-orange-950/20">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl shrink-0 bg-amber-100 dark:bg-amber-900/50">
            <Gift className="h-6 w-6 text-amber-700 dark:text-amber-300" />
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
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-amber-950/50 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/50 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copied!" : "Copy link"}
                </button>
                <button
                  type="button"
                  onClick={share}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-500 dark:bg-amber-600 text-white px-3 py-2 text-sm font-medium hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AnimatedCard>
  );
}

// Recent Symptoms Card - Uses shared RecentLogs component - Simplified
function RecentSymptomsCard({
  logs,
  isLoading,
  onLogClick,
  onDelete,
}: {
  logs: SymptomLog[];
  isLoading: boolean;
  onLogClick?: (log: SymptomLog) => void;
  onDelete?: (log: SymptomLog) => void;
}) {
  const recentLogs = logs.slice(0, 5);

  return (
    <AnimatedCard index={3} delay={200}>
      <div className="relative overflow-hidden rounded-xl border border-border/30 bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-foreground">Recent Symptoms</h3>
          <Link
            href="/dashboard/symptoms"
            className="text-sm text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <RecentLogs 
          logs={recentLogs} 
          loading={isLoading} 
          onLogClick={onLogClick}
          onDelete={onDelete}
        />
      </div>
    </AnimatedCard>
  );
}


// ---------------------------
// Page
// ---------------------------
export default function OverviewPage() {
  const router = useRouter();
  const trialStatus = useTrialStatus();

  const [user, setUser] = useState<User | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading] = useState(false); // Start as false - don't block rendering
  const [err, setErr] = useState<string | null>(null);
  const [, setNow] = useState<Date>(new Date());
  const lastNotifiedStateRef = useRef<TrialState | null>(null);
  const { logs: symptomLogs, loading: symptomLogsLoading, refetch: refetchSymptomLogs } = useSymptomLogs(30);
  const { symptoms, refetch: refetchSymptoms } = useSymptoms();

  // Refetch symptom logs when user becomes available or auth state changes
  useEffect(() => {
    if (user) {
      // Small delay to ensure session is fully established
      const timer = setTimeout(() => {
        refetchSymptomLogs();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, refetchSymptomLogs]);

  // Delete confirmation states
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    type: null;
    id: string | null;
    name: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    type: null,
    id: null,
    name: "",
    isLoading: false,
  });
  const [deleteLogDialog, setDeleteLogDialog] = useState<{
    isOpen: boolean;
    log: SymptomLog | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    log: null,
    isLoading: false,
  });
  
  // Modal states for editing symptoms
  const [selectedSymptom, setSelectedSymptom] = useState<Symptom | null>(null);
  const [editingLog, setEditingLog] = useState<SymptomLog | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // Ticker for live countdown
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), MS.SECOND);
    return () => clearInterval(id);
  }, []);

  // Keep session fresh and react to auth changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login?redirectedFrom=/dashboard");
      }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        const { data } = await supabase.auth.getUser();
        if (data.user) setUser(data.user);
      }
      if (event === "SIGNED_IN") {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setUser(data.user);
          router.refresh();
          window.dispatchEvent(new CustomEvent('auth-state-changed'));
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  // Verify session on mount and save quiz data if present
  useEffect(() => {
    let mounted = true;

    async function verifySessionAndSaveQuiz() {
      try {
        // Verify session exists
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Dashboard: Session error:", sessionError);
          if (mounted) {
            router.replace("/login?redirectedFrom=/dashboard");
          }
          return;
        }

        if (!sessionData?.session?.user) {
          console.warn("Dashboard: No session found");
          if (mounted) {
            router.replace("/login?redirectedFrom=/dashboard");
          }
          return;
        }
        
        console.log("Dashboard: Session verified - user:", sessionData.session.user.email);

        // Set user
        if (mounted) {
          setUser(sessionData.session.user);
          
          // Fetch user's name from profile
          try {
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("name")
              .eq("user_id", sessionData.session.user.id)
              .single();
            
            if (profile?.name && mounted) {
              // Extract first name from full name
              const firstName = profile.name.split(' ')[0];
              setUserName(firstName);
            }
          } catch (error) {
            console.error("Error fetching user name:", error);
          }
        }

        // Check for quiz data in sessionStorage and save immediately
        const pendingQuizData = sessionStorage.getItem("pending_quiz_answers");
        
        if (pendingQuizData) {
          try {
            const quizAnswers = JSON.parse(pendingQuizData);
            
            // Verify quiz data has required fields
            if (quizAnswers && (quizAnswers.top_problems || quizAnswers.name)) {
              console.log("Dashboard: Found quiz data in sessionStorage, saving to database...");
              
              const response = await fetch("/api/intake", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  user_id: sessionData.session.user.id,
                  name: quizAnswers.name || null,
                  top_problems: quizAnswers.top_problems || [],
                  severity: quizAnswers.severity || null,
                  timing: quizAnswers.timing || null,
                  tried_options: quizAnswers.tried_options || [],
                  doctor_status: quizAnswers.doctor_status || null,
                  goal: quizAnswers.goal || null,
                }),
              });

              if (response.ok) {
                const result = await response.json();
                console.log("Dashboard: Quiz data saved successfully:", result);
                // Clear sessionStorage after successful save
                sessionStorage.removeItem("pending_quiz_answers");
              } else {
                const errorData = await response.json();
                console.error("Dashboard: Failed to save quiz data:", errorData);
                // Don't clear on error - allow retry (though sessionStorage will clear on tab close)
              }
            } else {
              // Invalid quiz data - clear it
              sessionStorage.removeItem("pending_quiz_answers");
            }
          } catch (parseError) {
            console.error("Dashboard: Error parsing quiz data:", parseError);
            sessionStorage.removeItem("pending_quiz_answers");
          }
        }
      } catch (error) {
        console.error("Dashboard: Error in session verification:", error);
        if (mounted) {
          router.replace("/login?redirectedFrom=/dashboard");
        }
      }
    }

    verifySessionAndSaveQuiz();

    return () => {
      mounted = false;
    };
  }, [router]);


  // Initial load - don't block rendering, fetch in background
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Don't set loading to true - show UI immediately
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;

        const u = data.user;
        if (!u) {
          router.replace("/login?redirectedFrom=/dashboard");
          return;
        }

        if (mounted) {
          setUser(u);
          router.refresh();
        }
      } catch (e) {
        if (mounted) setErr(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  // Handle URL query params from auth redirect (clear cache)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
      window.history.replaceState({}, '', '/dashboard/overview');
      if (user) refetchSymptomLogs();
      router.refresh();
    }
  }, [user, refetchSymptomLogs, router]);

  // Ref to call trial refetch without depending on full trialStatus (avoids effect re-runs on every tick)
  const refetchTrialRef = useRef<(() => Promise<void>) | null>(null);
  refetchTrialRef.current = trialStatus.refetch;

  // Handle return from Stripe checkout: refresh subscription/trial state without full reload
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("checkout") !== "success") return;
    window.history.replaceState({}, "", "/dashboard/overview");
    router.refresh();
    refetchTrialRef.current?.();
  }, [router]);

  // Send trial phase notifications (uses trialStatus from useTrialStatus)
  useEffect(() => {
    if (!user || !trialStatus.end || trialStatus.expired === true) {
      lastNotifiedStateRef.current = null;
      return;
    }

    const currentState = getTrialState(!!trialStatus.expired, trialStatus.daysLeft, trialStatus.remaining);
    
    // Only send notifications for warning and urgent states
    if (currentState !== "warning" && currentState !== "urgent") {
      // Reset ref when not in notification states
      if (currentState === "calm") {
        lastNotifiedStateRef.current = null;
      }
      return;
    }

    // Don't send duplicate notification for the same state
    if (lastNotifiedStateRef.current === currentState) {
      return;
    }

    const sendNotification = async () => {
      try {
        let title: string;
        let message: string;
        let priority: "high" | "medium" = "medium";

        if (currentState === "warning") {
          title = "Trial Ending Soon";
          message = `Your trial ends in ${trialStatus.daysLeft} ${trialStatus.daysLeft === 1 ? "day" : "days"}. Manage your subscription at menolisa.com.`;
          priority = "medium";
        } else if (currentState === "urgent") {
          title = "Trial Ending Today";
          message = `Your trial ends in ${trialStatus.remaining.h}h ${trialStatus.remaining.m}m. Manage your subscription at menolisa.com.`;
          priority = "high";
        } else {
          return;
        }

        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "trial",
            title,
            message,
            priority,
            showOnce: true, // Prevent duplicate notifications
            metadata: {
              primaryAction: {
                label: "Manage subscription",
                route: "/dashboard/settings",
                actionType: "open_settings",
              },
            },
          }),
        });

        if (response.ok) {
          // Mark this state as notified
          lastNotifiedStateRef.current = currentState;
        } else {
          console.error("Failed to create trial notification");
        }
      } catch (error) {
        console.error("Error creating trial notification:", error);
      }
    };

    // Send notification when entering warning or urgent state
    sendNotification();
  }, [user, trialStatus.expired, trialStatus.daysLeft, trialStatus.remaining, trialStatus.end]);

  // ---------------------------
  // Event handlers
  // ---------------------------
  
  // Handle log click from RecentLogs - open modal for editing
  const handleLogClick = useCallback((log: SymptomLog) => {
    // Find the symptom definition for this log
    const symptom = symptoms.find((s) => s.id === log.symptom_id);
    if (symptom) {
      setSelectedSymptom(symptom);
      setEditingLog(log);
      setIsLogModalOpen(true);
    }
  }, [symptoms]);

  // Handle save symptom log (create or update)
  const handleSaveLog = useCallback(
    async (data: LogSymptomData) => {
      try {
        const isEditing = !!data.logId;
        const url = "/api/symptom-logs";
        const method = isEditing ? "PUT" : "POST";
        
        const body: {
          symptomId: string;
          severity: number;
          triggers: string[];
          notes: string;
          id?: string;
          loggedAt?: string;
        } = {
          symptomId: data.symptomId,
          severity: data.severity,
          triggers: data.triggers,
          notes: data.notes,
        };

        // Add log ID if editing
        if (isEditing && data.logId) {
          body.id = data.logId;
        }

        // Add loggedAt if provided
        if (data.loggedAt) {
          body.loggedAt = data.loggedAt;
        }

        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error || `Failed to ${isEditing ? "update" : "save"} symptom log`;
          throw new Error(errorMessage);
        }

        // Refetch logs and symptoms
        await Promise.all([refetchSymptomLogs(), refetchSymptoms()]);
        
        // Dispatch custom event to notify components to refresh
        window.dispatchEvent(new CustomEvent('symptom-log-updated'));
        
        // Close modal
        setIsLogModalOpen(false);
        setSelectedSymptom(null);
        setEditingLog(null);
      } catch (error) {
        throw error;
      }
    },
    [refetchSymptomLogs, refetchSymptoms]
  );

  // Handle symptom log delete click
  const handleSymptomLogDeleteClick = useCallback((log: SymptomLog) => {
    setDeleteLogDialog({
      isOpen: true,
      log,
      isLoading: false,
    });
  }, []);

  // Handle symptom log delete confirm
  const handleSymptomLogDeleteConfirm = useCallback(async () => {
    if (!deleteLogDialog.log) return;

    setDeleteLogDialog((prev) => ({ ...prev, isLoading: true }));
    try {
      const response = await fetch(`/api/symptom-logs?id=${deleteLogDialog.log.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete symptom log");
      }

      // Refetch symptom logs to update the list
      // Note: useSymptomLogs hook will automatically refetch when we refresh
      setDeleteLogDialog({ isOpen: false, log: null, isLoading: false });
      // Refresh the page to ensure all data is up to date
      router.refresh();
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('symptom-log-updated'));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete symptom log");
      setDeleteLogDialog((prev) => ({ ...prev, isLoading: false }));
    }
  }, [deleteLogDialog.log, router]);

  function handleLogout() {
    // Navigate immediately - no waiting
    window.location.href = "/login";
    // Sign out in background (don't await, don't block)
    supabase.auth.signOut().catch(() => {
      // Silently fail - we're already navigating away
    });
  }

  // ---------------------------
  // Render
  // ---------------------------
  if (loading) {
    return (
      <main className="mx-auto max-w-7xl p-6 sm:p-8">
        <div className="mb-6">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-3" />
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="mx-auto max-w-7xl p-6 sm:p-8">
        <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-4">
          <div className="font-semibold text-error text-lg">Error</div>
          <p className="mt-1 text-base text-error/90">{err}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => router.refresh()}
              className="inline-flex items-center rounded-lg bg-foreground/10 px-3 py-2 text-base hover:bg-foreground/15"
            >
              Try again
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center rounded-lg border border-foreground/15 px-3 py-2 text-base hover:bg-foreground/5"
            >
              Log out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 min-h-screen bg-background">
      {/* Header - More compact */}
      <header className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">
          {userName ? `Hi ${userName}!` : "Welcome!"}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          What would you like to do today?
        </p>
      </header>

      {/* Bento Grid - Simplified and more compact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Chat with Lisa Action Card - Simplified (Left side) */}
        <div className="md:col-span-1">
          <AnimatedCard index={1} delay={100} className="h-full">
            <Link
              href="/chat/lisa"
              className="group relative overflow-hidden flex flex-col h-full rounded-xl border-2 border-primary/20 bg-card p-6 shadow-2xl transition-all duration-200 hover:shadow-lg hover:border-primary/40"
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)' }}>
                  <MessageSquare className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <h3 className="text-lg font-bold text-foreground mb-1">Chat with Lisa</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Ask Lisa anything
                  </p>
                  <div className="h-[28px]"></div>
                </div>
                <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1 shrink-0 mt-1" />
              </div>
            </Link>
          </AnimatedCard>
        </div>

        {/* Track Symptoms Action Card - Simplified (Right side) */}
        <div className="md:col-span-1">
          <AnimatedCard index={2} delay={150} className="h-full">
            <Link
              href="/dashboard/symptoms"
              className="group relative overflow-hidden flex flex-col h-full shadow-2xl rounded-xl border-2 border-primary/20 bg-card p-6 transition-all duration-200 hover:shadow-lg hover:border-primary/40"
            >
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #d85a9a 100%)' }}>
                  <Activity className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <h3 className="text-lg font-bold text-foreground mb-1">Track Symptoms</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Log how you&apos;re feeling
                  </p>
                  {!trialStatus.expired && (
                    <div className="flex items-baseline gap-1.5 mt-auto">
                      <span className="text-2xl font-bold text-foreground">
                        {new Set(symptomLogs.map(log => log.symptom_id)).size}
                      </span>
                      <span className="text-xs text-foreground/60">
                        {new Set(symptomLogs.map(log => log.symptom_id)).size === 1 ? "symptom" : "symptoms"}
                      </span>
                    </div>
                  )}
                  {trialStatus.expired && (
                    <div className="h-[28px]"></div>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-primary transition-transform group-hover:translate-x-1 shrink-0 mt-1" />
              </div>
            </Link>
          </AnimatedCard>
        </div>

        {/* Referral Card - Full width, accent style */}
        <div className="md:col-span-2">
          <ReferralCard />
        </div>

        {/* Recent Symptoms Card - Only show if trial is active */}
        {!trialStatus.expired && !trialStatus.loading && (
          <div className="md:col-span-2">
            <RecentSymptomsCard 
              logs={symptomLogs} 
              isLoading={symptomLogsLoading}
              onLogClick={handleLogClick}
              onDelete={handleSymptomLogDeleteClick}
            />
          </div>
        )}
      </div>

      {/* Log Symptom Modal */}
      {selectedSymptom && (
        <LogSymptomModal
          symptom={selectedSymptom}
          isOpen={isLogModalOpen}
          onClose={() => {
            setIsLogModalOpen(false);
            setSelectedSymptom(null);
            setEditingLog(null);
          }}
          onSave={handleSaveLog}
          editingLog={editingLog}
          allLogs={symptomLogs}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, type: null, id: null, name: "", isLoading: false })}
        onConfirm={() => {
          // No nutrition or fitness handlers needed
        }}
        title="Delete Item?"
        message="Are you sure you want to delete this item? This action cannot be undone."
        itemName={deleteDialog.name}
        isLoading={deleteDialog.isLoading}
      />

      {/* Delete Symptom Log Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteLogDialog.isOpen}
        onClose={() => setDeleteLogDialog({ isOpen: false, log: null, isLoading: false })}
        onConfirm={handleSymptomLogDeleteConfirm}
        title="Delete Symptom Log?"
        message="Are you sure you want to delete this symptom log? This action cannot be undone."
        itemName={deleteLogDialog.log?.symptoms?.name}
        isLoading={deleteLogDialog.isLoading}
      />
    </main>
  );
}
