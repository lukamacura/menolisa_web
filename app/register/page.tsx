 
"use client";

import React, { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import {
  Flame,
  Moon,
  Brain,
  Heart,
  Scale,
  Battery,
  AlertCircle,
  Bone,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Goal,
  AlertTriangle,
  UserCircle,
  Check,
  Users,
  Calendar,
  Pause,
  Flower2,
  HelpCircle,
  Clock,
  XCircle,
  UtensilsCrossed,
  Dumbbell,
  Pill,
  MessageCircle,
  Smartphone,
  Rocket,
  Compass,
  BookOpen,
  Ellipsis,
  Lock,
  ShieldCheck,
} from "lucide-react";
import OtpForm from "@/components/auth/OtpForm";
import {
  SYMPTOM_LABELS,
} from "@/lib/quiz-results-helpers";

/** Quiz step/phase -> illustration filename (from public/quiz/, same as mobile app assets/quiz/). */
const QUIZ_ILLUSTRATION: Record<string, string> = {
  q1_age: "illustration_q1_age.png",
  q2_here_for: "illustration_q2_here_for.png",
  q3_goals: "illustration_q3_goals.png",
  q4_symptoms: "illustration_q4_symptoms.png",
  breather: "illustration_breather.png",
  q5_what_tried: "illustration_q5_what_tried.png",
  q6_how_long: "illustration_q6_how_long.png",
  q7_qualifier: "illustration_q7_qualifier.png",
  q8_name: "illustration_q8_name.png",
  loading: "illustration_loading.png",
  results: "illustration_results.png",
  email: "illustration_email.png",
};

/** Renders option icon or Check if icon is undefined (avoids "Element type is invalid" crash). */
function OptionIcon({
  icon,
  className,
}: {
  icon: unknown;
  className: string;
}) {
  const ValidIcon = icon && (typeof icon === "function" || typeof icon === "object") ? (icon as React.ComponentType<{ className?: string }>) : Check;
  return <ValidIcon className={className} />;
}

type Step =
  | "q1_age"
  | "q2_here_for"
  | "q3_goals"
  | "q4_symptoms"
  | "breather"
  | "q5_what_tried"
  | "q6_how_long"
  | "q7_qualifier"
  | "q8_name";

const STEPS: Step[] = [
  "q1_age",
  "q2_here_for",
  "q3_goals",
  "q4_symptoms",
  "breather",
  "q5_what_tried",
  "q6_how_long",
  "q7_qualifier",
  "q8_name",
];

// Question options - same as mobile app
const AGE_OPTIONS = [
  { id: "under_40", label: "Under 40", icon: Calendar },
  { id: "40_45", label: "40-45", icon: Calendar },
  { id: "46_50", label: "46-50", icon: Calendar },
  { id: "51_plus", label: "51+", icon: Calendar },
  { id: "prefer_not", label: "Prefer not to say", icon: Ellipsis },
];

const HERE_FOR_OPTIONS = [
  { id: "perimenopause", label: "Perimenopause", icon: Pause },
  { id: "menopause", label: "Menopause", icon: Flower2 },
  { id: "supporting", label: "Supporting someone", icon: Users },
  { id: "curious", label: "Just curious", icon: HelpCircle },
];

const GOAL_OPTIONS = [
  { id: "sleep_through_night", label: "Sleep through the night", icon: Moon },
  { id: "think_clearly", label: "Think clearly again", icon: Brain },
  { id: "feel_like_myself", label: "Feel like myself", icon: Heart },
  { id: "understand_patterns", label: "See what Lisa notices", icon: Scale },
  { id: "data_for_doctor", label: "Have data for my doctor", icon: CheckCircle2 },
  { id: "get_body_back", label: "Get my body back", icon: Battery },
];

const PROBLEM_OPTIONS = [
  { id: "hot_flashes", label: "Hot flashes / Night sweats", icon: Flame },
  { id: "sleep_issues", label: "Can't sleep well", icon: Moon },
  { id: "brain_fog", label: "Brain fog / Memory issues", icon: Brain },
  { id: "mood_swings", label: "Mood swings / Irritability", icon: Heart },
  { id: "weight_changes", label: "Weight changes", icon: Scale },
  { id: "low_energy", label: "Low energy / Fatigue", icon: Battery },
  { id: "anxiety", label: "Anxiety", icon: AlertCircle },
  { id: "joint_pain", label: "Joint pain", icon: Bone },
];

const TIMING_OPTIONS = [
  { id: "just_started", label: "Just started (0-6 months)", icon: Clock },
  { id: "been_while", label: "Been a while (6-12 months)", icon: Calendar },
  { id: "over_year", label: "Over a year", icon: Calendar },
  { id: "several_years", label: "Several years", icon: Calendar },
];

const TRIED_OPTIONS = [
  { id: "nothing", label: "Nothing yet", icon: XCircle },
  { id: "supplements", label: "Supplements / Vitamins", icon: Pill },
  { id: "diet", label: "Diet changes", icon: UtensilsCrossed },
  { id: "exercise", label: "Exercise", icon: Dumbbell },
  { id: "hrt", label: "HRT / Medication", icon: Pill },
  { id: "doctor_talk", label: "Talked to doctor", icon: MessageCircle },
  { id: "apps", label: "Apps / Tracking", icon: Smartphone },
];

const QUALIFIER_OPTIONS = [
  { id: "ready_to_act", label: "Ready to take action", icon: Rocket },
  { id: "exploring", label: "Exploring options", icon: Compass },
  { id: "understand_first", label: "Want to understand first", icon: BookOpen },
];

/** Derive severity for results copy from symptoms count + duration (same as mobile). */
function deriveSeverity(
  symptomCount: number,
  howLong: string
): "mild" | "moderate" | "severe" {
  const longDuration = howLong === "over_year" || howLong === "several_years";
  if (symptomCount >= 4 && longDuration) return "severe";
  if (symptomCount >= 3 || longDuration) return "moderate";
  return "mild";
}

type Phase = "quiz" | "calculating" | "email" | "results" | "paywall" | "download";

const APP_STORE_URL = "https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share";

// Quality of Life Score calculation
const calculateQualityScore = (
  symptoms: string[],
  severity: string,
  timing: string,
  triedOptions: string[]
): number => {
  // Start at 100, subtract based on answers
  let score = 100;

  // Subtract for each symptom (5-8 points each)
  score -= symptoms.length * 7;

  // Subtract for severity
  const severityPenalty: Record<string, number> = {
    mild: 5,
    moderate: 15,
    severe: 25,
  };
  score -= severityPenalty[severity] || 10;

  // Subtract for duration (longer = worse)
  const durationPenalty: Record<string, number> = {
    just_started: 0, // 0-6 months
    been_while: 5, // 6-12 months
    over_year: 10, // over a year
    several_years: 15, // several years
  };
  score -= durationPenalty[timing] || 5;

  // Small bonus if they've tried things (shows effort)
  if (triedOptions.length > 0 && !triedOptions.includes("nothing")) {
    score += 3;
  }

  // Clamp between 31-52 (warning zone, not too comfortable, not hopeless)
  return Math.max(31, Math.min(52, Math.round(score)));
};

const getScoreColor = (score: number): string => {
  if (score < 40) return "text-red-500";
  return "text-orange-500";
};

const getScoreLabel = (score: number): string => {
  if (score < 40) return "Needs attention - symptoms are controlling your daily life";
  if (score < 50) return "Below average - symptoms are significantly impacting daily life";
  return "Room to improve - symptoms are affecting your quality of life";
};

const getSeverityHeadline = (severity: string, name: string): string => {
  const displayName = name || "you";
  switch (severity) {
    case "severe":
      return `${displayName}, this can't continue.`;
    case "moderate":
      return `${displayName}, I need to be honest with you.`;
    case "mild":
    default:
      return `${displayName}, let's talk about what's really going on.`;
  }
};

const getSeverityPainText = (
  severity: string,
  symptomCount: number,
  name: string
): string => {
  const displayName = name || "you";
  const symptomWord = symptomCount === 1 ? "symptom" : "symptoms";
  const theseThis = symptomCount === 1 ? "this" : "these";
  const themIt = symptomCount === 1 ? "it" : "them";
  const theyIt = symptomCount === 1 ? "it" : "they";
  switch (severity) {
    case "severe":
      return `${symptomCount} ${symptomWord} controlling your life. You've probably tried to explain it to people who don't get it. You've probably wondered if this is just your new normal. It's not. And ${displayName}, you don't have to keep living like this.`;
    case "moderate":
      return `${symptomCount} ${symptomWord}. Affecting your work. Your mood. Your relationships. ${displayName}, you're spending so much energy just trying to function normally - energy you shouldn't have to spend.`;
    case "mild":
    default:
      return `${displayName}, ${theseThis} ${symptomCount} ${symptomWord} might feel manageable now. But without understanding what's causing ${themIt}, ${theyIt} often get${symptomCount === 1 ? "s" : ""} worse. Let's figure this out before ${theyIt} ${symptomCount === 1 ? "does" : "do"}.`;
  }
};


const REFERRAL_STORAGE_KEY = "pending_referral_code";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("ref");
    if (fromUrl && fromUrl.trim()) {
      const code = fromUrl.trim();
      setRef(code);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(REFERRAL_STORAGE_KEY, code);
      }
      return;
    }
    if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
      if (stored) setRef(stored);
    }
  }, [searchParams]);

  // Always start with quiz; URL ?phase=download|paywall lets Stripe redirect skip back into the funnel.
  const [phase, setPhase] = useState<Phase>("quiz");

  useEffect(() => {
    const phaseParam = searchParams.get("phase");
    if (phaseParam === "download" || phaseParam === "paywall") {
      setPhase(phaseParam);
    }
    // Only on mount; subsequent param changes shouldn't override user navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];
  const [, setBrowserInfo] = useState<ReturnType<typeof detectBrowser> | null>(null);


  // Detect browser on mount
  useEffect(() => {
    const browser = detectBrowser();
    setBrowserInfo(browser);
    
    // Check if there's a browser mismatch issue
    if (hasBrowserMismatchIssue(browser)) {
      console.warn("Browser mismatch detected:", browser);
    }
  }, []);


  // Quiz answers - same structure as mobile
  const [ageBand, setAgeBand] = useState<string>("");
  const [hereFor, setHereFor] = useState<string>("");
  const [goal, setGoal] = useState<string[]>([]);
  const [topProblems, setTopProblems] = useState<string[]>([]);
  const [triedOptions, setTriedOptions] = useState<string[]>([]);
  const [timing, setTiming] = useState<string>("");
  const [qualifier, setQualifier] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");

  // Email state
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);

  const derivedSeverity = deriveSeverity(topProblems.length, timing);

  // Loading screen state (between quiz and email)
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);

  // Loading messages for results screen
  const loadingMessages = [
    "Taking it all in...",
    "Connecting the dots...",
    "Doing the math...",
    "Designing your plan...",
    "Getting ready to launch...",
    "Launching your plan...",
  ];

  // Distinct color per loading state (smooth, on-brand)
  const loadingMessageColors = [
    "#ff8da1", // primary
    "#e67a8f", // primaryDark
    "#65dbff", // blue
    "#F97316", // warning
    "#ffb8c9", // primaryLight
    "#1D3557", // navy
  ];

  // Calculating screen: ~3s loader between quiz and email phases
  useEffect(() => {
    if (phase !== "calculating") return;
    setMessageIndex(0);
    setDisplayScore(0);

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 600);

    const loadingTimer = setTimeout(() => {
      clearInterval(messageInterval);
      setPhase("email");
    }, 3000);

    return () => {
      clearInterval(messageInterval);
      clearTimeout(loadingTimer);
    };
  }, [phase, loadingMessages.length]);

  // Animate score counting up
  useEffect(() => {
    if (phase === "results") {
      const targetScore = calculateQualityScore(
        topProblems,
        derivedSeverity,
        timing,
        triedOptions
      );
      
      const duration = 1500; // 1.5 seconds
      const steps = 30;
      const increment = targetScore / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= targetScore) {
          setDisplayScore(targetScore);
          clearInterval(timer);
        } else {
          setDisplayScore(Math.round(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [phase, topProblems, derivedSeverity, timing, triedOptions]);

  // (validation handled inside OtpForm)

  // Check if current step is answered
  const stepIsAnswered = useCallback(
    (step: Step) => {
      switch (step) {
        case "q1_age":
          return ageBand !== "";
        case "q2_here_for":
          return hereFor !== "";
        case "q3_goals":
          return goal.length > 0;
        case "q4_symptoms":
          return topProblems.length > 0;
        case "breather":
          return true;
        case "q5_what_tried":
          return triedOptions.length > 0;
        case "q6_how_long":
          return timing !== "";
        case "q7_qualifier":
          return qualifier !== "";
        case "q8_name":
          return firstName.trim().length > 0;
        default:
          return false;
      }
    },
    [ageBand, hereFor, goal, topProblems, triedOptions, timing, qualifier, firstName]
  );

  // Save quiz answers to sessionStorage (cleared when tab closes)
  const saveQuizAnswers = useCallback(() => {
    const quizAnswers = {
      top_problems: topProblems,
      severity: derivedSeverity,
      timing,
      tried_options: triedOptions,
      goal,
      name: firstName.trim() || null,
    };
    sessionStorage.setItem("pending_quiz_answers", JSON.stringify(quizAnswers));
  }, [topProblems, derivedSeverity, timing, triedOptions, goal, firstName]);

  const goNext = useCallback(() => {
    if (!stepIsAnswered(currentStep)) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // Quiz complete - show calculating loader, then move to email (verify before showing results)
      saveQuizAnswers();
      setPhase("calculating");
    }
  }, [currentStep, stepIndex, stepIsAnswered, saveQuizAnswers]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  }, [stepIndex]);

  // Called by OtpForm after Supabase verifyOtp succeeds (session is live).
  const handleOtpSuccess = useCallback(async () => {
    setError(null);
    setSavingQuiz(true);
    try {
      const quizAnswers = {
        top_problems: topProblems,
        severity: derivedSeverity,
        timing,
        tried_options: triedOptions,
        goal,
        name: firstName.trim() || null,
      };

      const res = await fetch("/api/auth/save-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quizAnswers,
          ...(ref ? { referralCode: ref } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Couldn't save your answers. Please try again.");
        return;
      }

      sessionStorage.removeItem("pending_quiz_answers");
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setSavingQuiz(false);
    }
  }, [topProblems, derivedSeverity, timing, triedOptions, goal, firstName, ref]);

  const toggleProblem = (problemId: string) => {
    setTopProblems((prev) => {
      if (prev.includes(problemId)) {
        return prev.filter((id) => id !== problemId);
      }
      return [...prev, problemId];
    });
  };

  const toggleGoal = (goalId: string) => {
    setGoal((prev) => {
      if (prev.includes(goalId)) {
        return prev.filter((id) => id !== goalId);
      }
      return [...prev, goalId];
    });
  };

  const toggleTriedOption = (optionId: string) => {
    setTriedOptions((prev) => {
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      return [...prev, optionId];
    });
  };

  const [otpStep, setOtpStep] = useState<"email" | "code">("email");

  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">("annual");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleStartTrialCheckout = async (plan: "annual" | "monthly") => {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          from_registration: true,
          return_origin: origin || undefined,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Checkout could not be started. Please try again.");
      setCheckoutLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  };

  // Check for authenticated session and redirect if profile exists.
  // Do not redirect when in a registration phase that requires the user to keep going.
  useEffect(() => {
    if (
      phase === "calculating" ||
      phase === "email" ||
      phase === "results" ||
      phase === "paywall" ||
      phase === "download"
    ) {
      return;
    }

    let mounted = true;

    async function checkSessionAndRedirect() {
      if (!mounted) return;

      try {
        // Check for session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Session check error:", sessionError);
          return;
        }

        if (!sessionData?.session?.user) {
          // No session - user hasn't clicked magic link yet
          return;
        }

        const user = sessionData.session.user;

        // Check if profile already exists
        const { data: existingProfile, error: profileError } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Error checking profile:", profileError);
          return;
        }

        if (existingProfile) {
          // Profile already exists - redirect to dashboard
          if (mounted) {
            sessionStorage.removeItem("pending_quiz_answers");
            router.replace("/dashboard");
            router.refresh();
          }
          return;
        }

        // Profile doesn't exist - user might need to complete quiz
        // Only send back to quiz when not in the middle of registration (results -> email flow)
        if (mounted && phase !== "results" && phase !== "email" && phase !== "calculating") {
          // User has confirmed email but profile wasn't created
          setPhase("quiz");
          setStepIndex(0);
        }
      } catch (e) {
        if (!mounted) return;
        console.error("Error checking session:", e);
      }
    }

    // Check session on mount
    checkSessionAndRedirect();

    return () => {
      mounted = false;
    };
  }, [router, phase]);

  return (
    <main className="overflow-hidden relative mx-auto p-3 sm:p-4 h-screen flex flex-col pt-20 sm:pt-24 max-w-3xl min-h-0">

      {/* Calculating Phase - loader between quiz and email */}
      {phase === "calculating" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
          <motion.div
            key="calculating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.42, 0, 0.58, 1] }}
            className="flex-1 flex flex-col items-center justify-center px-4"
          >
            <motion.div
              className="relative mb-8"
              animate={{
                rotate: 360,
                scale: [0.9, 1, 0.9],
              }}
              transition={{
                rotate: { duration: 2.4, repeat: Infinity, ease: "linear" },
                scale: { duration: 2.4, repeat: Infinity, ease: [0.42, 0, 0.58, 1] },
              }}
            >
              <Image
                src={`/quiz/${QUIZ_ILLUSTRATION.loading}`}
                alt=""
                width={200}
                height={120}
                className="w-32 h-20 sm:w-40 sm:h-24 object-contain"
              />
            </motion.div>

            <h2 className="text-xl font-semibold text-[#3D3D3D] mb-3">
              Getting to know you better...
            </h2>

            <AnimatePresence mode="wait">
              <motion.p
                key={messageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.42, 0, 0.58, 1] }}
                className="h-6 font-medium min-w-48 text-center"
                style={{ color: loadingMessageColors[messageIndex] ?? "#6B7280" }}
              >
                {loadingMessages[messageIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      {/* Results Phase */}
      {phase === "results" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
          <AnimatePresence mode="wait">
            <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-y-hidden lg:flex lg:items-center lg:justify-center pb-0">
                  <div className="max-w-md lg:max-w-5xl mx-auto w-full pt-4 sm:pt-6 lg:py-4 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-center">
                    {/* Left column on lg: illustration + headline + paragraphs */}
                    <div className="lg:flex lg:flex-col">
                    {/* Results illustration (from public/quiz/) */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex justify-center mb-4 sm:mb-6 lg:mb-4"
                    >
                      <Image
                        src={`/quiz/${QUIZ_ILLUSTRATION.results}`}
                        alt=""
                        width={320}
                        height={180}
                        className="object-contain w-full max-h-40 sm:max-h-[180px] lg:max-h-40"
                      />
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-xl sm:text-2xl lg:text-3xl font-semibold text-[#3D3D3D] text-center lg:text-left mb-3 sm:mb-4"
                    >
                      {getSeverityHeadline(derivedSeverity, firstName || "you")}
                    </motion.h1>

                    {/* Pain Paragraph */}
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="text-sm sm:text-md lg:text-base text-[#5A5A5A] text-center lg:text-left leading-relaxed mb-4 sm:mb-6 lg:mb-3"
                    >
                      {getSeverityPainText(
                        derivedSeverity,
                        topProblems.length,
                        firstName || "you"
                      )}
                    </motion.p>

                    {/* Primary messaging: companion, not clinical */}
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                      className="text-sm lg:text-[15px] text-[#5A5A5A] text-center lg:text-left leading-relaxed mb-4 sm:mb-6 lg:mb-0 italic"
                    >
                      Lisa is the menopause companion who gets what you&apos;re going through-available 24/7, never dismisses you.
                    </motion.p>
                    </div>

                    {/* Right column on lg: score + pills + social */}
                    <div className="lg:flex lg:flex-col">
                {/* Quality of Life Score */}
                {(() => {
                  const score = calculateQualityScore(
                    topProblems,
                    derivedSeverity,
                    timing,
                    triedOptions
                  );

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      className="rounded-2xl bg-card border-2 p-4 sm:p-5 border-[#E8DDD9] mb-4 sm:mb-6 lg:mb-4 shadow-lg shadow-primary/5"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-2 w-full">
                          <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500" />
                          <span className="text-base sm:text-lg font-bold text-gray-900!">Your Menopause Score</span>
                        </div>
                      </div>

                      {/* Score Display */}
                      <div className="flex items-end gap-2 mb-2 sm:mb-3">
                        <span className={`text-4xl sm:text-5xl font-bold ${getScoreColor(score)}`}>
                          {displayScore}
                        </span>
                        <span className="text-xl sm:text-2xl text-gray-900! font-medium mb-1">/100</span>
                      </div>

                      {/* Score Label */}
                      <p className="text-xs sm:text-sm text-orange-600 mb-3 sm:mb-4">
                        {getScoreLabel(score)}
                      </p>

                      {/* Progress Bar */}
                      <div className="relative h-2 sm:h-6 border-2 border-foreground/10 bg-white/20 backdrop-blur-2xl rounded-full mb-3 sm:mb-4 overflow-hidden">
                        {/* Current score */}
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${score}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                          className="absolute left-0 top-0  h-full bg-linear-to-r from-red-400 via-orange-400 to-orange-300 rounded-full"
                        />
                        {/* Target marker at 80% */}
                        <div
                          className="absolute top-0 h-full w-1 bg-green-500 rounded-full"
                          style={{ left: "80%" }}
                        />
                      </div>

                      {/* Target Text */}
                      <div className="flex items-center gap-2 text-xs sm:text-sm">
                        <Goal className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                        <span className="text-[#5A5A5A] font-medium">
                          Your target: <span className="font-bold">80+</span> (reachable in 8 weeks)
                        </span>
                      </div>
                    </motion.div>
                  );
                })()}

                    {/* Symptom Pills - Smaller, muted, under score card */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.0 }}
                      className="mb-3 sm:mb-4"
                    >
                      <div className="flex flex-wrap gap-2 justify-center">
                        {topProblems.map((symptom, index) => (
                          <motion.span
                            key={symptom}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1.2 + index * 0.1 }}
                            className="px-2 py-1 bg-red-200 text-red-800 border border-red-800 font-bold text-xs sm:text-sm rounded-full"
                          >
                            {SYMPTOM_LABELS[symptom] || symptom}
                          </motion.span>
                        ))}
                      </div>
                    </motion.div>

                    {/* Social Proof */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.4 }}
                      className="mb-4 lg:mb-0 text-center"
                    >
                      <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#5A5A5A]">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 text-info" />
                        <span>8,382 women joined this month</span>
                      </div>
                    </motion.div>
                    </div>
                  </div>
                </div>

                {/* What happens next - fixed to bottom, always visible */}
                <motion.section
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.4 }}
                  className="shrink-0 border-t-2 border-[#E8DDD9]/70 bg-background pt-4 pb-6 sm:pb-8 px-4"
                  aria-labelledby="what-happens-next-heading"
                >
                  <h2 id="what-happens-next-heading" className="text-lg sm:text-xl font-bold text-[#3D3D3D] text-center mb-2">
                    What happens next
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] text-center mb-4">
                    Start your free 3-day trial to unlock Lisa.
                  </p>
                  <div className="max-w-md lg:max-w-xl mx-auto">
                    <button
                      type="button"
                      onClick={() => setPhase("paywall")}
                      className="w-full min-h-12 py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
                    >
                      Continue to my plan
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.section>
              </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Email Phase - OTP sign-in / sign-up */}
      {phase === "email" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0"
          >
            <div className="flex justify-center mb-4 sm:mb-6">
              <Image
                src={`/quiz/${QUIZ_ILLUSTRATION.email}`}
                alt=""
                width={120}
                height={120}
                className="object-contain w-full max-h-[120px] sm:max-h-[140px]"
              />
            </div>

            <div className="mb-4 sm:mb-6 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-2 sm:mb-3">
                Your personalized Menopause Score{" "}
                <span className="text-primary uppercase">is ready</span>
              </h2>
              {otpStep === "email" && (
                <>
                  <p className="text-sm sm:text-base text-[#5A5A5A]">
                    Enter your email and we&apos;ll send a 6-digit code to unlock your results. No password needed.
                  </p>
                  {firstName.trim() && (
                    <p className="text-sm text-[#5A5A5A] mt-2">
                      We&apos;ll call you <strong>{firstName.trim()}</strong>.
                    </p>
                  )}
                </>
              )}
            </div>

            <OtpForm
              mode="register"
              variant="gradient"
              initialEmail={email}
              submitLabel="Send my code"
              onStepChange={setOtpStep}
              onSuccess={async (user) => {
                setEmail(user.email ?? email);
                await handleOtpSuccess();
              }}
            />

            {savingQuiz && (
              <p className="mt-3 text-sm text-[#5A5A5A] text-center flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving your answers…
              </p>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                {error}
              </div>
            )}

            <p className="mt-4 text-sm text-[#5A5A5A] text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Log in
              </Link>
            </p>
          </motion.div>
        </div>
      )}

      {/* Paywall Phase - card required to start free trial via Stripe */}
      {phase === "paywall" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0"
          >
            {/* Hero image */}
            <div className="flex justify-center mb-4 sm:mb-5">
              <Image
                src="/paywall.png"
                alt=""
                width={280}
                height={160}
                className="object-contain w-full max-h-[130px] sm:max-h-40"
              />
            </div>

            {/* No-charge badge */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 border border-green-300 text-green-700 text-xs sm:text-sm font-semibold">
                <Check className="w-3.5 h-3.5" />
                $0 charged today &mdash; cancel anytime
              </span>
            </div>

            <div className="text-center mb-4 sm:mb-5">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-1.5">
                Try Lisa free for 3 days
              </h2>
              <p className="text-sm sm:text-base text-[#5A5A5A]">
                Your card is held securely by Stripe. <strong>We charge nothing until day 4</strong> - and you get a reminder before then.
              </p>
            </div>

            {/* Plan toggle */}
            <div
              className="flex rounded-xl p-1 border mb-4"
              style={{ backgroundColor: "#F5EFEC", borderColor: "#E8DDD9" }}
              role="tablist"
              aria-label="Billing period"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedPlan === "annual"}
                onClick={() => setSelectedPlan("annual")}
                className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: selectedPlan === "annual" ? "#FFFFFF" : "transparent",
                  color: "#3D3D3D",
                  boxShadow: selectedPlan === "annual" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                Annual
                <span className="block text-xs font-normal mt-0.5 text-[#5A5A5A]">
                  Save 45%
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedPlan === "monthly"}
                onClick={() => setSelectedPlan("monthly")}
                className="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: selectedPlan === "monthly" ? "#FFFFFF" : "transparent",
                  color: "#3D3D3D",
                  boxShadow: selectedPlan === "monthly" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                Monthly
                <span className="block text-xs font-normal mt-0.5 text-[#5A5A5A]">
                  Flexible
                </span>
              </button>
            </div>

            {/* Price summary */}
            <div className="rounded-xl border border-[#E8DDD9] bg-white p-4 mb-4">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-[#5A5A5A]">After your 3-day free trial</span>
              </div>
              {selectedPlan === "annual" ? (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#3D3D3D]">$6.58</span>
                  <span className="text-sm text-[#5A5A5A]">/ month</span>
                  <span className="ml-auto text-xs text-[#5A5A5A]">
                    Billed $79/year
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#3D3D3D]">$12</span>
                  <span className="text-sm text-[#5A5A5A]">/ month</span>
                  <span className="ml-auto text-xs text-[#5A5A5A]">
                    Billed monthly
                  </span>
                </div>
              )}
            </div>

            {/* Trust labels */}
            <ul className="space-y-2 mb-5 text-sm text-[#3D3D3D]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 shrink-0" />
                <span><strong>Nothing charged today</strong> &mdash; trial starts the moment you sign up</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 shrink-0" />
                <span>We&apos;ll <strong>email you 24h before</strong> the trial ends - no surprises</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600 shrink-0" />
                <span><strong>Cancel in 2 taps</strong> in Settings &rarr; Subscription - no hoops</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />
                <span>Stripe handles your card &mdash; <strong>we never see the number</strong></span>
              </li>
            </ul>

            <button
              type="button"
              disabled={checkoutLoading}
              onClick={() => handleStartTrialCheckout(selectedPlan)}
              className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg"
              style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
            >
              {checkoutLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Redirecting to checkout&hellip;
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Start my free 3-day trial
                </>
              )}
            </button>

            <p className="text-xs text-[#9A9A9A] text-center mt-3">
              <strong>$0 due now.</strong> After 3 days: {selectedPlan === "annual" ? "$79/year ($6.58/mo)" : "$12/month"}. Cancel before then and pay nothing.
            </p>

            {error && (
              <div className="mt-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                {error}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Download Phase - redirect users to mobile app */}
      {phase === "download" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0 text-center"
          >

            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-3">
              {firstName.trim() ? `${firstName.trim()}, you're all set!` : "You're all set!"}
            </h2>
            <p className="text-sm sm:text-base text-[#5A5A5A] mb-8 leading-relaxed">
              Download the Menolisa app to start tracking your symptoms and chatting with Lisa - your 24/7 menopause companion.
            </p>

            <div className="flex flex-col items-center gap-3 mb-6">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-[1.03]"
              >
                <Image
                  src="/app_store.png"
                  alt="Download on the App Store"
                  width={160}
                  height={53}
                  className="h-[53px] w-auto object-contain"
                />
              </a>

              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-[1.03]"
              >
                <Image
                  src="/play_store.png"
                  alt="Get it on Google Play"
                  width={160}
                  height={53}
                  className="h-[53px] w-auto object-contain"
                />
              </a>
            </div>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="text-sm text-[#9A9A9A] hover:text-[#5A5A5A] underline transition-colors"
            >
              Continue to web dashboard instead
            </button>
          </motion.div>
        </div>
      )}

      {/* Quiz Phase */}
      {phase === "quiz" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Quiz entry headline (step 0 only) - strategy: curiosity-driven, 2-min assessment */}
          {stepIndex === 0 && (
            <div className="shrink-0 text-center mb-2 sm:mb-3 px-2">
              <h1 className="text-lg sm:text-xl font-bold text-[#3D3D3D]">
                What&apos;s Your Menopause Score?
              </h1>
              <p className="text-xs sm:text-sm text-[#5A5A5A] mt-0.5">
                Take the free 2-minute quiz. No download required.
              </p>
            </div>
          )}
          {/* Progress: explicit "Question X of 9" above dots so users always see how much is left */}
          <div className="mb-2 sm:mb-3 shrink-0 pt-2 sm:pt-3 px-2">
            <p className="text-center text-base sm:text-lg font-semibold text-[#3D3D3D] mb-2 min-h-6" role="status" aria-live="polite">
              {currentStep === "breather"
                ? "Quick pause"
                : stepIndex >= STEPS.length - 2
                  ? "Almost there"
                  : `Question ${stepIndex + 1} of ${STEPS.length}`}
            </p>
            <div className="flex justify-center gap-2 sm:gap-3">
              {STEPS.map((_, index) => {
                const stepNumber = index + 1;
                const isActive = stepIndex === index;
                return (
                  <motion.div
                    key={stepNumber}
                    className={`h-2 rounded-full transition-colors duration-300 ${
                      isActive
                        ? "bg-linear-to-r from-primary to-primary/80"
                        : "bg-foreground/20"
                    }`}
                    animate={{ width: isActive ? 40 : 8 }}
                    transition={{
                      type: "spring",
                      damping: 30,
                      stiffness: 200,
                      duration: prefersReducedMotion ? 0 : 0.4,
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Question Content - Scrollable area */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden mb-1">
            <div className="rounded-xl sm:rounded-2xl border border-foreground/10 bg-card backdrop-blur-sm p-2.5 mx-2 my-2 sm:p-3 space-y-1.5 sm:space-y-2 flex-1 min-h-0 shadow-lg shadow-primary/5 overflow-y-auto flex flex-col">
              {/* Quiz step illustration (from public/quiz/, same as mobile assets/quiz/) */}
              {QUIZ_ILLUSTRATION[currentStep] && (
                <div className="shrink-0 flex justify-center mb-2 sm:mb-3">
                  <Image
                    src={`/quiz/${QUIZ_ILLUSTRATION[currentStep]}`}
                    alt=""
                    width={320}
                    height={currentStep === "breather" || currentStep === "q8_name" ? 140 : 160}
                    className="object-contain w-full max-h-[90px] sm:max-h-28"
                  />
                </div>
              )}
              {/* Q1: Age */}
              {currentStep === "q1_age" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What&apos;s your age or life stage?
                    </h2>
                    <p className="text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {AGE_OPTIONS.map((option) => {
                      const isSelected = ageBand === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setAgeBand(option.id)}
                          className={`h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q2: Here for */}
              {currentStep === "q2_here_for" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      I&apos;m here for…
                    </h2>
                    <p className="text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {HERE_FOR_OPTIONS.map((option) => {
                      const isSelected = hereFor === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setHereFor(option.id)}
                          className={`h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q3: Goals */}
              {currentStep === "q3_goals" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What would success look like for you?
                    </h2>
                    <p className="text-sm text-muted-foreground">Select all that apply</p>
                    {goal.length > 0 && (
                      <p className="text-sm text-primary font-medium mt-0.5">
                        {goal.length} selected
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {GOAL_OPTIONS.map((option) => {
                      const isSelected = goal.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleGoal(option.id)}
                          className={`h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q4: Symptoms - Lucide icons only (same pattern as Q3/Q5) for consistent alignment */}
              {currentStep === "q4_symptoms" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What&apos;s making life hardest right now?
                    </h2>
                    <p className="text-sm text-muted-foreground">Select all that apply</p>
                    {topProblems.length > 0 && (
                      <p className="text-sm text-primary font-medium mt-0.5">
                        {topProblems.length} selected
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {PROBLEM_OPTIONS.map((option) => {
                      const isSelected = topProblems.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleProblem(option.id)}
                          className={`h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Breather */}
              {currentStep === "breather" && (
                <div className="flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-center">
                    You&apos;re in good company
                  </h2>
                  <p className="text-sm sm:text-base text-muted-foreground text-center leading-relaxed">
                    You&apos;re not imagining this. Let&apos;s see what your experience tells us. Thousands of women use MenoLisa to track symptoms and get support from Lisa. Take a breath, then we&apos;ll ask a couple more quick questions.
                  </p>
                </div>
              )}

              {/* Q5: What tried */}
              {currentStep === "q5_what_tried" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What have you tried so far?
                    </h2>
                    <p className="text-sm text-muted-foreground">Select all that apply</p>
                    {triedOptions.length > 0 && (
                      <p className="text-sm text-primary font-medium mt-0.5">
                        {triedOptions.length} selected
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {TRIED_OPTIONS.map((option) => {
                      const isSelected = triedOptions.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleTriedOption(option.id)}
                          className={`h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q6: How long */}
              {currentStep === "q6_how_long" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How long have symptoms been affecting you?
                    </h2>
                    <p className="text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {TIMING_OPTIONS.map((option) => {
                      const isSelected = timing === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTiming(option.id)}
                          className={`w-full h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q7: Qualifier */}
              {currentStep === "q7_qualifier" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How ready are you to make a change?
                    </h2>
                    <p className="text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
                    {QUALIFIER_OPTIONS.map((option) => {
                      const isSelected = qualifier === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setQualifier(option.id)}
                          className={`w-full h-14 px-3 flex items-center text-left rounded-lg border-2 transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q8: Name */}
              {currentStep === "q8_name" && (
                <div className="flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">
                      What should Lisa call you?
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Lisa will use this to personalize your experience
                    </p>
                  </div>
                  <div className="relative">
                    <UserCircle className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                      autoFocus
                    />
                    {firstName.trim().length > 0 && (
                      <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-in zoom-in duration-200" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Buttons - min 48px height for easy tapping */}
          <div className="flex items-center justify-between gap-2 shrink-0 py-3 px-2 border-t border-foreground/10 bg-background">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="min-h-12 flex items-center gap-1.5 px-4 py-3 rounded-lg border-2 border-foreground/15 hover:bg-foreground/5 hover:border-foreground/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent font-medium text-sm sm:text-base"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!stepIsAnswered(currentStep)}
              className="min-h-12 flex items-center gap-1.5 px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none font-semibold text-sm sm:text-base"
            >
              {currentStep === "breather" || stepIndex === STEPS.length - 1 ? "Continue" : "Next"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="overflow-hidden relative mx-auto p-3 sm:p-4 h-screen flex flex-col pt-20 sm:pt-24 max-w-3xl min-h-0 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          <p className="text-sm text-muted-foreground mt-4">Loading...</p>
        </main>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
