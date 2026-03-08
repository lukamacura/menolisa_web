/* eslint-disable react-hooks/set-state-in-effect */
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
  Eye,
  EyeOff,
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
} from "lucide-react";
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

/** Quiz symptom option id -> illustration filename (from public/symptoms/, same as mobile app assets). */
const SYMPTOM_IMAGE: Record<string, string> = {
  hot_flashes: "hot_flashes.png",
  sleep_issues: "insomnia.png",
  brain_fog: "brain_fog.png",
  mood_swings: "mood_swings.png",
  weight_changes: "weight_gain.png",
  low_energy: "fatigue.png",
  anxiety: "anxiety.png",
  joint_pain: "joint_pain.png",
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

type Phase = "quiz" | "gate" | "results" | "email";

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
  switch (severity) {
    case "severe":
      return `${symptomCount} symptoms controlling your life. You've probably tried to explain it to people who don't get it. You've probably wondered if this is just your new normal. It's not. And ${displayName}, you don't have to keep living like this.`;
    case "moderate":
      return `${symptomCount} symptoms. Affecting your work. Your mood. Your relationships. ${displayName}, you're spending so much energy just trying to function normally - energy you shouldn't have to spend.`;
    case "mild":
    default:
      return `${displayName}, these ${symptomCount} symptoms might feel manageable now. But without understanding what's causing them, they often get worse. Let's figure this out before they do.`;
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

  // Always start with quiz
  const [phase, setPhase] = useState<Phase>("quiz");
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

  // Email & Password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userExists, setUserExists] = useState(false);
  const [signedUpAtGate, setSignedUpAtGate] = useState(false);

  const derivedSeverity = deriveSeverity(topProblems.length, timing);

  // Results loading state
  const [isResultsLoading, setIsResultsLoading] = useState(true);
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

  // Handle results loading animation (message rotation, no progress bar)
  useEffect(() => {
    if (phase !== "results") return;
    setIsResultsLoading(true);
    setMessageIndex(0);
    setDisplayScore(0);

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 700);

    const loadingTimer = setTimeout(() => {
      setIsResultsLoading(false);
      clearInterval(messageInterval);
    }, 5000);

    return () => {
      clearInterval(messageInterval);
      clearTimeout(loadingTimer);
    };
  }, [phase, loadingMessages.length]);

  // Animate score counting up
  useEffect(() => {
    if (phase === "results" && !isResultsLoading) {
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
  }, [phase, isResultsLoading, topProblems, derivedSeverity, timing, triedOptions]);

  // Validation
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = password.length >= 8;
  const canSubmit = emailValid && passwordValid && !loading;
  const canSubmitGate = emailValid && !loading;

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
      // Quiz complete - move to gate (capture email before showing results)
      setPhase("gate");
      saveQuizAnswers();
    }
  }, [currentStep, stepIndex, stepIsAnswered, saveQuizAnswers]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  }, [stepIndex]);

  const generateTempPassword = (): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    const arr = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    }
    return Array.from(arr, (b) => chars[b % chars.length]).join("");
  };

  const handleGateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmitGate) return;

    setError(null);
    setUserExists(false);
    setLoading(true);

    try {
      const emailLower = email.toLowerCase().trim();
      const tempPassword = generateTempPassword();

      const quizAnswers = {
        top_problems: topProblems,
        severity: derivedSeverity,
        timing,
        tried_options: triedOptions,
        goal,
        name: firstName.trim() || null,
      };

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailLower,
        password: tempPassword,
        options: {
          data: {
            quiz_completed: true,
            temp_password: true,
          },
        },
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
          setUserExists(true);
          setLoading(false);
          return;
        }
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (authData.user) {
        try {
          await fetch("/api/auth/save-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: authData.user.id,
              quizAnswers,
              ...(ref ? { referralCode: ref } : {}),
            }),
          });
        } catch (quizError) {
          console.warn("Failed to save quiz answers:", quizError);
        }
        sessionStorage.removeItem("pending_quiz_answers");
        setSignedUpAtGate(true);
        setPhase("results");
      }
      setLoading(false);
    } catch (e) {
      console.error("Unexpected error during gate sign-up:", e);
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

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

  // Handle registration with password
  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setUserExists(false);
    setLoading(true);

    try {
      const emailLower = email.toLowerCase().trim();
      
      // Prepare quiz answers
      const quizAnswers = {
        top_problems: topProblems,
        severity: derivedSeverity,
        timing,
        tried_options: triedOptions,
        goal,
        name: firstName.trim() || null,
      };

      console.log("=== REGISTRATION START ===");
      console.log("Email:", emailLower);
      console.log("Quiz answers:", quizAnswers);

      // Create account with Supabase password auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: {
          data: {
            quiz_completed: true,
          },
        },
      });

      if (authError) {
        console.error("Registration error:", authError);
        
        // Handle specific Supabase error messages
        if (authError.message.includes("User already registered")) {
          setUserExists(true);
          setLoading(false);
          return;
        } else if (authError.message.includes("Password")) {
          setError("Password must be at least 8 characters long.");
        } else if (authError.message.includes("email")) {
          setError("Please enter a valid email address.");
        } else {
          setError(authError.message);
        }
        setLoading(false);
        return;
      }

      // If we have a user, save quiz answers
      if (authData.user) {
        try {
          // Save quiz answers via API
          await fetch("/api/auth/save-quiz", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: authData.user.id,
              quizAnswers,
              ...(ref ? { referralCode: ref } : {}),
            }),
          });
        } catch (quizError) {
          console.warn("Failed to save quiz answers:", quizError);
          // Continue anyway - user is registered
        }

        // Registration successful! Clear sessionStorage and redirect to dashboard
        console.log("=== REGISTRATION COMPLETE ===");
        console.log("User created:", authData.user.id);
        sessionStorage.removeItem("pending_quiz_answers");
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        router.push("/dashboard");
      }
      
      setLoading(false);
    } catch (e) {
      console.error("Unexpected error during registration:", e);
      
      // Check if it's a network error
      if (e instanceof TypeError && e.message.includes("fetch")) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(e instanceof Error ? e.message : "An error occurred. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!passwordValid || loading) return;
    setError(null);
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
        sessionStorage.removeItem("pending_quiz_answers");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setLoading(false);
  };

  // Check for authenticated session and redirect if profile exists.
  // Do not redirect when: results, gate, or email (set-password) so user can finish the flow.
  useEffect(() => {
    if (phase === "results" || phase === "gate") {
      return;
    }
    if (phase === "email" && signedUpAtGate) {
      return; // User must set password first; redirect only after handleSetPassword succeeds
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
        if (mounted && phase !== "results" && phase !== "email") {
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
  }, [router, phase, signedUpAtGate]);

  return (
    <main className="overflow-hidden relative mx-auto p-3 sm:p-4 h-screen flex flex-col pt-20 sm:pt-24 max-w-3xl min-h-0">

      {/* Gate Phase - capture email before showing results */}
      {phase === "gate" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0"
          >
            {/* Gate / email illustration */}
            <div className="flex justify-center mb-4 sm:mb-6">
              <Image
                src={`/quiz/${QUIZ_ILLUSTRATION.email}`}
                alt=""
                width={280}
                height={140}
                className="object-contain w-full max-h-[120px] sm:max-h-[140px]"
              />
            </div>
            {userExists ? (
              <div className="space-y-4 sm:space-y-6 text-center">
                <div className="rounded-full bg-primary/10 p-6 w-fit mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-2 sm:mb-3">
                    You already have an account
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] mb-2">
                    An account with <strong>{email}</strong> already exists. Log in to see your results.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                >
                  Go to Login
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <button
                  type="button"
                  onClick={() => { setUserExists(false); setEmail(""); }}
                  className="text-sm text-[#5A5A5A] hover:text-primary underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleGateSubmit} className="space-y-4 sm:space-y-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] text-center mb-2 sm:mb-3">
                    Your personalized Menopause Score is ready.
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] text-center">
                    Enter your email to see your results.
                  </p>
                </div>
                {firstName.trim() && (
                  <p className="text-center text-sm text-[#5A5A5A]">
                    We&apos;ll call you <strong>{firstName.trim()}</strong>.
                  </p>
                )}
                <div>
                  <label htmlFor="gate-email" className="mb-2 block text-sm font-medium text-[#3D3D3D]">
                    Email
                  </label>
                  <input
                    id="gate-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 sm:py-4 rounded-xl border border-[#E8DDD9] bg-white text-[#3D3D3D] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#ff74b1]/50 focus:border-[#ff74b1] text-base sm:text-lg"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canSubmitGate}
                  className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    <>
                      Show my results
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                {error && (
                  <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                    {error}
                  </div>
                )}
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* Results Phase */}
      {phase === "results" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
          <AnimatePresence mode="wait">
            {isResultsLoading ? (
              // Loading Screen - quiz loading illustration, smooth spin/scale, colored messages
              <motion.div
                key="loading"
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

                {/* Rotating message with crossfade and per-state color */}
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
            ) : (
              // Results Page - Scrollable content with Next button
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className="flex-1 min-h-0 overflow-y-auto pb-0">
                  <div className="max-w-md mx-auto w-full pt-4 sm:pt-22">
                    {/* Results illustration (from public/quiz/) */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex justify-center mb-4 sm:mb-6"
                    >
                      <Image
                        src={`/quiz/${QUIZ_ILLUSTRATION.results}`}
                        alt=""
                        width={320}
                        height={180}
                        className="object-contain w-full max-h-[160px] sm:max-h-[180px]"
                      />
                    </motion.div>

                    {/* Headline */}
                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-xl sm:text-2xl font-semibold text-[#3D3D3D] text-center mb-3 sm:mb-4"
                    >
                      {getSeverityHeadline(derivedSeverity, firstName || "you")}
                    </motion.h1>

                    {/* Pain Paragraph */}
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="text-sm sm:text-md text-[#5A5A5A] text-center leading-relaxed mb-4 sm:mb-6"
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
                      className="text-sm text-[#5A5A5A] text-center leading-relaxed mb-4 sm:mb-6 italic"
                    >
                      Lisa is the menopause companion who gets what you&apos;re going through-available 24/7, never dismisses you.
                    </motion.p>

                {/* Quality of Life Score */}
                {!isResultsLoading && (() => {
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
                      className="rounded-2xl bg-card border-2 p-4 sm:p-5 border-[#E8DDD9] mb-4 sm:mb-6 shadow-lg shadow-primary/5"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-2">
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
                      className="mb-0 text-center"
                    >
                      <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#5A5A5A]">
                        <Users className="w-3 h-3 sm:w-4 sm:h-4 text-info" />
                        <span>8,382 women joined this month</span>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Next Button - Fixed at bottom */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.4 }}
                  className="pt-3 pb-4 sm:pb-6 shrink-0"
                >
                  <div className="max-w-md mx-auto px-4">
                    <p className="text-xs sm:text-sm text-[#5A5A5A] text-center mb-2">
                      Lisa will use your answers to personalize your experience and start spotting patterns.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPhase("email")}
                      className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                    >
                      Set my password & continue
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Email Phase - full signup or set password (after gate) */}
      {phase === "email" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0"
          >
            {/* Email phase illustration */}
            <div className="flex justify-center mb-4 sm:mb-6">
              <Image
                src={`/quiz/${QUIZ_ILLUSTRATION.email}`}
                alt=""
                width={280}
                height={140}
                className="object-contain w-full max-h-[120px] sm:max-h-[140px]"
              />
            </div>
            {/* Set password only (came from gate → results → here) */}
            {signedUpAtGate ? (
              <motion.form
                onSubmit={handleSetPassword}
                className="space-y-4 sm:space-y-6"
              >
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] text-center mb-2 sm:mb-3">
                    Set your password
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] text-center mb-4 sm:mb-6">
                    Create a password so you can sign in and track your progress with Lisa.
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#3D3D3D]">Email</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full px-4 py-3 sm:py-4 rounded-xl border border-[#E8DDD9] bg-gray-100 text-[#5A5A5A] text-base sm:text-lg"
                  />
                </div>
                <div>
                  <label htmlFor="set-password" className="mb-2 block text-sm font-medium text-[#3D3D3D]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="set-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password (8+ characters)"
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-3 sm:py-4 pr-12 rounded-xl border border-[#E8DDD9] bg-white text-[#3D3D3D] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#ff74b1]/50 focus:border-[#ff74b1] text-base sm:text-lg"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9A9A] hover:text-[#5A5A5A] transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-[#9A9A9A] mt-1">Password must be at least 8 characters</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!passwordValid || loading}
                  className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      Continue to my account
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
                {error && (
                  <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                    {error}
                  </div>
                )}
              </motion.form>
            ) : userExists ? (
              <div className="space-y-4 sm:space-y-6 text-center">
                <div className="rounded-full bg-primary/10 p-6 w-fit mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-primary" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-2 sm:mb-3">
                    You already have an account!
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] mb-2">
                    An account with <strong>{email}</strong> already exists.
                  </p>
                  <p className="text-sm text-[#5A5A5A]">
                    Log in to continue your journey.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                >
                  Go to Login
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setUserExists(false);
                    setEmail("");
                  }}
                  className="text-sm text-[#5A5A5A] hover:text-primary underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              /* Account Creation Form with Email and Password */
              <motion.form
                onSubmit={handleEmailSubmit}
                className="space-y-4 sm:space-y-6"
              >
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] text-center mb-2 sm:mb-3">
                    Create your account
                  </h2>
                  <p className="text-sm sm:text-base text-[#5A5A5A] text-center mb-4 sm:mb-6">
                    Set up your login to start your free 3-day trial. No credit card required.
                  </p>
                </div>

                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#3D3D3D]">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 sm:py-4 rounded-xl border border-[#E8DDD9] bg-white text-[#3D3D3D] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#ff74b1]/50 focus:border-[#ff74b1] text-base sm:text-lg"
                    autoFocus
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#3D3D3D]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password (8+ characters)"
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-3 sm:py-4 pr-12 rounded-xl border border-[#E8DDD9] bg-white text-[#3D3D3D] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#ff74b1]/50 focus:border-[#ff74b1] text-base sm:text-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9A9A] hover:text-[#5A5A5A] transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-[#9A9A9A] mt-1">Password must be at least 8 characters</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)', boxShadow: '0 4px 15px rgba(255, 116, 177, 0.4)' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Start my free trial
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                {error && (
                  <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
                    {error}
                  </div>
                )}

                <p className="text-sm text-[#5A5A5A] text-center">
                  Already have an account?{" "}
                  <Link href="/login" className="text-primary font-semibold hover:underline">
                    Log in
                  </Link>
                </p>
              </motion.form>
            )}
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
          {/* Animated Step Indicators */}
          <div className="mb-2 sm:mb-3 shrink-0 pt-2 sm:pt-3">
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
                      duration: prefersReducedMotion ? 0 : 0.4 
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
                    className="object-contain w-full max-h-[140px] sm:max-h-[160px]"
                  />
                </div>
              )}
              {/* Q1: Age */}
              {currentStep === "q1_age" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      What&apos;s your age or life stage?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-1">
                    {AGE_OPTIONS.map((option) => {
                      const isSelected = ageBand === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setAgeBand(option.id)}
                          className={`py-2 px-2.5 sm:px-3 rounded-lg border-2 transition-all duration-200 text-left group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      I&apos;m here for…
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-1">
                    {HERE_FOR_OPTIONS.map((option) => {
                      const isSelected = hereFor === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setHereFor(option.id)}
                          className={`py-2 px-2.5 sm:px-3 rounded-lg border-2 transition-all duration-200 text-left group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      What would success look like for you?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Select all that apply</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-1">
                    {GOAL_OPTIONS.map((option) => {
                      const isSelected = goal.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleGoal(option.id)}
                          className={`py-2 px-2.5 sm:px-3 rounded-lg border-2 transition-all duration-200 text-left group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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

              {/* Q4: Symptoms */}
              {currentStep === "q4_symptoms" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      What&apos;s making life hardest right now?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Select all that apply</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-1">
                    {PROBLEM_OPTIONS.map((option) => {
                      const isSelected = topProblems.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleProblem(option.id)}
                          className={`py-2 px-2.5 sm:px-3 rounded-lg border-2 transition-all duration-200 text-left group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {SYMPTOM_IMAGE[option.id] ? (
                              <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-muted/50">
                                <Image
                                  src={`/symptoms/${SYMPTOM_IMAGE[option.id]}`}
                                  alt=""
                                  width={48}
                                  height={48}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className={`p-1 rounded-md transition-colors shrink-0 ${
                                isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                              }`}>
                                <OptionIcon
                                  icon={option.icon}
                                  className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                                />
                              </div>
                            )}
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary animate-in zoom-in duration-200 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {topProblems.length > 0 && (
                    <div className="flex items-center justify-center gap-1 text-xs shrink-0 pt-0.5">
                      <span className="text-muted-foreground font-medium">
                        {topProblems.length} {topProblems.length === 1 ? "symptom" : "symptoms"} selected
                      </span>
                    </div>
                  )}
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
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      What have you tried so far?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Select all that apply</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 gap-1">
                    {TRIED_OPTIONS.map((option) => {
                      const isSelected = triedOptions.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleTriedOption(option.id)}
                          className={`py-2 px-2.5 sm:px-3 rounded-lg border-2 transition-all duration-200 text-left group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      How long have symptoms been affecting you?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                    {TIMING_OPTIONS.map((option) => {
                      const isSelected = timing === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTiming(option.id)}
                          className={`w-full py-2 px-2.5 sm:px-3 rounded-lg border-2 text-left transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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
                <div className="flex-1 flex flex-col min-h-0 space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-0.5">
                      How ready are you to make a change?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">Choose one</p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
                    {QUALIFIER_OPTIONS.map((option) => {
                      const isSelected = qualifier === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setQualifier(option.id)}
                          className={`w-full py-2 px-2.5 sm:px-3 rounded-lg border-2 text-left transition-all duration-200 group cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50 hover:bg-foreground/5"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1 rounded-md transition-colors shrink-0 ${
                              isSelected ? "bg-primary/20" : "bg-foreground/5 group-hover:bg-primary/10"
                            }`}>
                              <OptionIcon
                                icon={option.icon}
                                className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                              />
                            </div>
                            <span className="font-medium flex-1 text-xs sm:text-sm">{option.label}</span>
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
                    <p className="text-xs sm:text-sm text-muted-foreground">
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

          {/* Navigation Buttons - Always visible at bottom */}
          <div className="flex items-center justify-between gap-2 shrink-0 py-2 px-2 border-t border-foreground/10 bg-background">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-foreground/15 hover:bg-foreground/5 hover:border-foreground/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent font-medium text-xs sm:text-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!stepIsAnswered(currentStep)}
              className="flex  items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none font-semibold text-xs sm:text-sm"
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
