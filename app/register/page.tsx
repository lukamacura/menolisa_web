 
"use client";

import React, { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { getAccountState, stateAllowsAccess } from "@/lib/getAccountState";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Goal,
  AlertTriangle,
  UserCircle,
  Check,
  TrendingUp,
  Ruler,
  Weight,
} from "lucide-react";
import OtpForm from "@/components/auth/OtpForm";
import { PaywallView } from "@/components/PaywallView";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import {
  SYMPTOM_LABELS,
  AGE_BAND_LABELS,
  TYPICAL_SYMPTOM_SEVERITY,
  getScoreBenchmark,
  getScoreVerdict,
  calculateWellbeingScore,
} from "@/lib/quiz-results-helpers";

/** Quiz step/phase -> illustration filename (from public/quiz/, same as mobile app assets/quiz/). */
const QUIZ_ILLUSTRATION: Record<string, string> = {
  q8_name: "illustration_q8_name.png",
  loading: "illustration_loading.png",
};


type Step =
  | "q1_age"
  | "q_height"
  | "q_weight"
  | "q2_here_for"
  | "q3_goals"
  | "q4_symptoms"
  | "breather"
  | "q5_hrt"
  | "q6_how_long"
  | "q7_qualifier"
  | "q8_name";

const STEPS: Step[] = [
  "q1_age",
  "q2_here_for",
  "q4_symptoms",
  "q3_goals",
  "breather",
  "q_height",
  "q_weight",
  "q5_hrt",
  "q6_how_long",
  "q7_qualifier",
  "q8_name",
];

// Numbered progress excludes the breather (it's a pause, not a question).
const QUESTION_STEPS: Step[] = STEPS.filter((s) => s !== "breather");

// Question options - same as mobile app
const AGE_OPTIONS = [
  { id: "under_40", label: "Under 40", image: "/quiz/age/u40.png" },
  { id: "40_45", label: "40–45", image: "/quiz/age/41-45.png" },
  { id: "46_50", label: "46–50", image: "/quiz/age/46-50.png" },
  { id: "51_plus", label: "50+", image: "/quiz/age/a50.png" },
];

const HERE_FOR_OPTIONS = [
  { id: "pre_menopausal", label: "Pre-menopausal (not started)", image: "/quiz/status/pre.png" },
  { id: "perimenopausal", label: "Perimenopausal (irregular periods)", image: "/quiz/status/peri.png" },
  { id: "post_menopausal", label: "Post-menopausal (periods stopped)", image: "/quiz/status/post.png" },
  { id: "not_sure", label: "I'm not sure", image: "/quiz/status/notsure.png" },
];

const GOAL_OPTIONS = [
  { id: "sleep_through_night", label: "Sleep through the night", image: "/quiz/goals/sleep.png" },
  { id: "think_clearly", label: "Think clearly again", image: "/quiz/goals/thinkclearly.png" },
  { id: "feel_like_myself", label: "Feel like myself", image: "/quiz/goals/feelmyself.png" },
  { id: "understand_patterns", label: "Understand my patterns", image: "/quiz/goals/patterns.png" },
  { id: "data_for_doctor", label: "Have data for my doctor", image: "/quiz/goals/data.png" },
  { id: "get_body_back", label: "Get my body back", image: "/quiz/goals/body.png" },
];

// Image-based symptom tiles (same style as Q1 age / Q2 status). 9 options, multi-select.
// IDs reuse the existing downstream keys (SYMPTOM_LABELS, pillars, comparison) so results keep working.
const PROBLEM_OPTIONS = [
  { id: "hot_flashes", label: "Hot flashes", image: "/symptoms/hot_flashes.png" },
  { id: "sleep_issues", label: "Can't sleep", image: "/symptoms/insomnia.png" },
  { id: "brain_fog", label: "Brain fog", image: "/symptoms/brain_fog.png" },
  { id: "mood_swings", label: "Mood swings", image: "/symptoms/mood_swings.png" },
  { id: "weight_changes", label: "Weight changes", image: "/symptoms/weight_gain.png" },
  { id: "low_energy", label: "Fatigue", image: "/symptoms/fatigue.png" },
  { id: "anxiety", label: "Anxiety", image: "/symptoms/anxiety.png" },
  { id: "joint_pain", label: "Joint pain", image: "/symptoms/joint_pain.png" },
  { id: "bloating", label: "Bloating", image: "/symptoms/bloating.png" },
];

// Weight applied to each selected symptom (pure select, no per-symptom rating).
// 2.5 keeps the Menopause Score spread and "you vs typical" comparison reading as before.
const SELECTED_SEVERITY = 2.5;

const TIMING_OPTIONS = [
  { id: "just_started", label: "Under 6 months", image: "/quiz/how-long/u6m.png" },
  { id: "been_while", label: "6–12 months", image: "/quiz/how-long/6to12m.png" },
  { id: "over_year", label: "Over a year", image: "/quiz/how-long/o1y.png" },
  { id: "several_years", label: "Several years", image: "/quiz/how-long/severaly.png" },
];

const HRT_OPTIONS = [
  { id: "currently", label: "I am currently taking HRT", image: "/quiz/hrt/current.png" },
  { id: "past", label: "I have taken HRT in the past", image: "/quiz/hrt/past.png" },
  { id: "never", label: "I have never taken HRT", image: "/quiz/hrt/never.png" },
];

const QUALIFIER_OPTIONS = [
  { id: "ready_to_act", label: "Ready to start", image: "/quiz/readiness/ready.png" },
  { id: "exploring", label: "Still figuring it out", image: "/quiz/readiness/figuring.png" },
  { id: "understand_first", label: "Just learning for now", image: "/quiz/readiness/learning.png" },
];

/** Derive severity for results copy from symptoms count + duration (same as mobile). */
function deriveSeverity(
  totalBurden: number,
  howLong: string
): "mild" | "moderate" | "severe" {
  const longDuration = howLong === "over_year" || howLong === "several_years";
  if (totalBurden >= 10 && longDuration) return "severe";
  if (totalBurden >= 6 || longDuration) return "moderate";
  return "mild";
}

type Phase = "quiz" | "calculating" | "email" | "results" | "paywall" | "download";

const APP_STORE_URL = "https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share";

const getScoreColor = (score: number): string => {
  if (score < 40) return "text-red-500";
  return "text-orange-500";
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


type Pillar = { id: string; title: string; preview: string; symptoms: string[] };

const PILLAR_WEEKS = ["Week 1–2", "Week 3–5", "Week 6–8"];

const PILLAR_BLUEPRINTS: Pillar[] = [
  { id: "sleep", title: "Sleep & cooling protocol", preview: "Track sleep patterns and pinpoint what's triggering night sweats.", symptoms: ["sleep_issues", "hot_flashes"] },
  { id: "energy", title: "Energy & mental clarity", preview: "Rebuild focus with targeted nutrition and recovery windows.", symptoms: ["brain_fog", "low_energy"] },
  { id: "mood", title: "Mood regulation", preview: "Spot the patterns behind your mood shifts before they escalate.", symptoms: ["mood_swings", "anxiety"] },
  { id: "body", title: "Body composition reset", preview: "Adjust intake and movement for your changing metabolism.", symptoms: ["weight_changes", "bloating"] },
  { id: "joints", title: "Joint & inflammation care", preview: "Reduce stiffness with daily anti-inflammatory routines.", symptoms: ["joint_pain"] },
];

function buildPillars(topProblems: string[]): Pillar[] {
  const matched = PILLAR_BLUEPRINTS.filter((p) => p.symptoms.some((s) => topProblems.includes(s)));
  if (matched.length >= 3) return matched.slice(0, 3);
  const fillers = PILLAR_BLUEPRINTS.filter((p) => !matched.includes(p));
  return [...matched, ...fillers].slice(0, 3);
}

function getCtaCopy(qualifier: string): { label: string; sub: string } {
  switch (qualifier) {
    case "ready_to_act":
      return { label: "Start my plan - free for 3 days", sub: "Cancel anytime. No charge if you cancel before day 3." };
    case "exploring":
      return { label: "Try Lisa free for 3 days", sub: "Browse without commitment. Most members keep going." };
    case "understand_first":
    default:
      return { label: "See my full plan - free for 3 days", sub: "Understand what's happening, then decide." };
  }
}

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
  // Initialize synchronously from URL so the auth-redirect effect below sees the correct phase on first render
  // (otherwise authenticated users sent here by middleware bounce back to /dashboard → infinite loop).
  const [phase, setPhase] = useState<Phase>(() => {
    const phaseParam = searchParams.get("phase");
    if (phaseParam === "download" || phaseParam === "paywall") return phaseParam;
    return "quiz";
  });
  // /quiz1 traffic skips the register quiz entirely and jumps straight to email + paywall.
  const [fromQuiz1, setFromQuiz1] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("quiz1_completed") === "true") {
      setFromQuiz1(true);
      setPhase("email");
    }
    // Only on mount; subsequent param changes shouldn't override user navigation.
     
  }, []);
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];
  // Question position for the progress label/dots (breather excluded; during the
  // breather we keep the last answered question's dot lit).
  const activeQuestionIndex =
    currentStep === "breather"
      ? STEPS.slice(0, stepIndex).filter((s) => s !== "breather").length - 1
      : QUESTION_STEPS.indexOf(currentStep);
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
  // Height: stored per-unit as raw strings; normalized to cm on save.
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
  const [heightCm, setHeightCm] = useState<string>("");
  const [heightFt, setHeightFt] = useState<string>("");
  const [heightIn, setHeightIn] = useState<string>("");
  // Weight: stored per-unit as raw strings; normalized to kg on save.
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [weightKg, setWeightKg] = useState<string>("");
  const [weightLb, setWeightLb] = useState<string>("");
  const [hereFor, setHereFor] = useState<string>("");
  const [goal, setGoal] = useState<string[]>([]);
  // id -> severity (1=A little, 2=Quite a bit, 3=Extremely). Absent = "Not at all".
  const [symptomSeverity, setSymptomSeverity] = useState<Record<string, number>>({});
  // "What have you tried" step removed; kept empty so the score calc + save-quiz payload stay intact.
  const [triedOptions] = useState<string[]>([]);
  const [hrtStatus, setHrtStatus] = useState<string>("");
  const [timing, setTiming] = useState<string>("");
  const [qualifier, setQualifier] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");

  // Derived for funnel compatibility: save-quiz / user_profiles still consume top_problems[].
  const topProblems = useMemo(
    () => Object.keys(symptomSeverity).filter((id) => symptomSeverity[id] > 0),
    [symptomSeverity]
  );
  const totalBurden = useMemo(
    () => Object.values(symptomSeverity).reduce((a, b) => a + b, 0),
    [symptomSeverity]
  );

  // Normalized body metrics (canonical cm/kg) derived from the per-unit inputs.
  const bodyMetrics = useMemo(() => {
    let height_cm: number | null = null;
    if (heightUnit === "cm") {
      const v = parseFloat(heightCm);
      if (Number.isFinite(v) && v > 0) height_cm = Math.round(v);
    } else {
      const ft = parseFloat(heightFt);
      const inch = parseFloat(heightIn) || 0;
      if (Number.isFinite(ft) && ft > 0) height_cm = Math.round((ft * 12 + inch) * 2.54);
    }

    let weight_kg: number | null = null;
    if (weightUnit === "kg") {
      const v = parseFloat(weightKg);
      if (Number.isFinite(v) && v > 0) weight_kg = Math.round(v);
    } else {
      const v = parseFloat(weightLb);
      if (Number.isFinite(v) && v > 0) weight_kg = Math.round(v * 0.453592);
    }

    return {
      height_cm,
      weight_kg,
      height_unit: heightUnit,
      weight_unit: weightUnit,
    };
  }, [heightUnit, heightCm, heightFt, heightIn, weightUnit, weightKg, weightLb]);

  // Email state
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savingQuiz, setSavingQuiz] = useState(false);

  const derivedSeverity = deriveSeverity(totalBurden, timing);

  // Menopause Wellbeing Score (0–100, higher = better) — reacts to every answer:
  // symptoms, duration, stage, HRT, BMI (height+weight) and age.
  const scoreBreakdown = useMemo(
    () =>
      calculateWellbeingScore({
        symptomSeverity,
        timing,
        hereFor,
        hrtStatus,
        ageBand,
        heightCm: bodyMetrics.height_cm,
        weightKg: bodyMetrics.weight_kg,
      }),
    [symptomSeverity, timing, hereFor, hrtStatus, ageBand, bodyMetrics]
  );
  const score = scoreBreakdown.score;

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
      const targetScore = score;

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
  }, [phase, score]);

  // (validation handled inside OtpForm)

  // Check if current step is answered
  const stepIsAnswered = useCallback(
    (step: Step) => {
      switch (step) {
        case "q1_age":
          return ageBand !== "";
        case "q_height":
          return bodyMetrics.height_cm !== null;
        case "q_weight":
          return bodyMetrics.weight_kg !== null;
        case "q2_here_for":
          return hereFor !== "";
        case "q3_goals":
          return goal.length > 0;
        case "q4_symptoms":
          return topProblems.length > 0;
        case "breather":
          return true;
        case "q5_hrt":
          return hrtStatus !== "";
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
    [ageBand, bodyMetrics, hereFor, goal, topProblems, triedOptions, hrtStatus, timing, qualifier, firstName]
  );

  // Save quiz answers to sessionStorage (cleared when tab closes)
  const saveQuizAnswers = useCallback(() => {
    const quizAnswers = {
      age_band: ageBand || null,
      top_problems: topProblems,
      timing,
      tried_options: triedOptions,
      hrt_status: hrtStatus || null,
      goal,
      goals: goal,
      qualifier: qualifier || null,
      here_for: hereFor || null,
      name: firstName.trim() || null,
      height_cm: bodyMetrics.height_cm,
      weight_kg: bodyMetrics.weight_kg,
      height_unit: bodyMetrics.height_unit,
      weight_unit: bodyMetrics.weight_unit,
    };
    sessionStorage.setItem("pending_quiz_answers", JSON.stringify(quizAnswers));
  }, [ageBand, topProblems, derivedSeverity, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics]);

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
      // Safety net: someone with an already-active account (e.g. existing paid
      // customer) who slipped past the email check shouldn't be re-onboarded or
      // shown the paywall — send them straight to the dashboard without touching
      // their saved quiz/profile.
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUserId = sessionData?.session?.user?.id;
      if (sessionUserId) {
        const { data: trialRow } = await supabase
          .from("user_trials")
          .select(
            "trial_start, trial_end, trial_days, account_status, subscription_ends_at, subscription_canceled, payment_failed_at, dispute_flagged_at, stripe_subscription_id, provider"
          )
          .eq("user_id", sessionUserId)
          .maybeSingle();
        if (trialRow && stateAllowsAccess(getAccountState(trialRow).state)) {
          sessionStorage.removeItem("pending_quiz_answers");
          router.replace("/dashboard");
          router.refresh();
          return;
        }
      }

      let quizAnswers: Record<string, unknown> = {
        age_band: ageBand || null,
        top_problems: topProblems,
        timing,
        tried_options: triedOptions,
        hrt_status: hrtStatus || null,
        goal,
        goals: goal,
        qualifier: qualifier || null,
        here_for: hereFor || null,
        name: firstName.trim() || null,
        height_cm: bodyMetrics.height_cm,
        weight_kg: bodyMetrics.weight_kg,
        height_unit: bodyMetrics.height_unit,
        weight_unit: bodyMetrics.weight_unit,
      };

      // /quiz1 hand-off: prefer the quiz1-derived profile when present.
      if (fromQuiz1 && typeof sessionStorage !== "undefined") {
        const raw = sessionStorage.getItem("quiz1_profile");
        if (raw) {
          try {
            quizAnswers = JSON.parse(raw);
          } catch {
            // fall through to register-quiz payload
          }
        }
      }

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
      if (fromQuiz1) {
        // Quiz1 already showed her the result - skip /register results and head to paywall.
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem("quiz1_completed");
          sessionStorage.removeItem("quiz1_profile");
          sessionStorage.removeItem("quiz1_state");
        }
        setPhase("paywall");
      } else {
        setPhase("results");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setSavingQuiz(false);
    }
  }, [ageBand, topProblems, derivedSeverity, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics, ref, fromQuiz1, router]);

  const toggleProblem = (problemId: string) => {
    setSymptomSeverity((prev) => {
      if (prev[problemId]) {
        const next = { ...prev };
        delete next[problemId];
        return next;
      }
      return { ...prev, [problemId]: SELECTED_SEVERITY };
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

  const [otpStep, setOtpStep] = useState<"email" | "code">("email");

  const [selectedPlan, setSelectedPlan] = useState<"annual" | "monthly">("annual");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState(false);

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
          // Profile already exists. If middleware sent us here (?phase=quiz|paywall), the user already
          // failed the trial/paywall gate - sending them to /dashboard would just bounce back here (infinite loop).
          // Show the paywall instead.
          if (mounted) {
            sessionStorage.removeItem("pending_quiz_answers");
            const phaseParam = searchParams.get("phase");
            if (phaseParam === "quiz" || phaseParam === "paywall") {
              setPhase("paywall");
            } else {
              router.replace("/dashboard");
              router.refresh();
            }
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
  }, [router, phase, searchParams]);

  return (
    <main className="overflow-hidden relative mx-auto p-3 sm:p-4 h-dvh flex flex-col pt-20 sm:pt-24 max-w-3xl min-h-0">

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
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-[calc(120px+env(safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:rgba(255,141,161,0.35)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 hover:[&::-webkit-scrollbar-thumb]:bg-primary/50">
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-md mx-auto w-full pt-2"
          >
            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl sm:text-2xl font-semibold text-[#3D3D3D] text-center mb-2"
            >
              {getSeverityHeadline(derivedSeverity, firstName || "you")}
            </motion.h1>

            {/* Pain paragraph */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xs text-[#5A5A5A] text-center leading-relaxed mb-4"
            >
              {getSeverityPainText(derivedSeverity, topProblems.length, firstName || "you")}
            </motion.p>

            {/* Compact score card */}
            {(() => {
              const benchmark = getScoreBenchmark(ageBand);
              const verdict = getScoreVerdict(score, benchmark);
              const cohortLabel = AGE_BAND_LABELS[ageBand] ?? "women your age";
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-4 shadow-md shadow-primary/5"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      <span className="text-sm font-bold text-gray-900!">Your Menopause Score</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{displayScore}</span>
                      <span className="text-sm text-gray-500">/100</span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-foreground/10 rounded-full mb-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${score}%` }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className="absolute left-0 top-0 h-full bg-linear-to-r from-red-400 via-orange-400 to-orange-300 rounded-full"
                    />
                    <div className="absolute top-0 h-full w-0.5 bg-foreground/50" style={{ left: `${benchmark}%` }} />
                    <div className="absolute top-0 h-full w-1 bg-green-500 rounded-full" style={{ left: "80%" }} />
                  </div>
                  <p className="text-xs text-[#5A5A5A] mb-1.5">
                    That&apos;s <span className="font-bold">{verdict}</span> for {cohortLabel}.
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-[#5A5A5A]">
                    <Goal className="w-4 h-4 text-green-600 shrink-0" />
                    <span>Target: <span className="font-bold">80+</span> in 8 weeks</span>
                  </div>
                </motion.div>
              );
            })()}

            {/* Symptom pills */}
            {topProblems.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap gap-1.5 justify-center mb-6"
              >
                {topProblems.map((s) => (
                  <span key={s} className="px-2 py-1 bg-red-100 text-red-800 border border-red-300 font-medium text-xs rounded-full">
                    {SYMPTOM_LABELS[s] || s}
                  </span>
                ))}
              </motion.div>
            )}

            {/* You're not alone - top-3 symptom comparison vs typical cohort */}
            {topProblems.length > 0 && (() => {
              const cohortLabel = AGE_BAND_LABELS[ageBand] ?? "women your age";
              const top3 = [...topProblems]
                .sort((a, b) => (symptomSeverity[b] ?? 0) - (symptomSeverity[a] ?? 0))
                .slice(0, 3);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-5 shadow-md shadow-primary/5"
                >
                  <h2 className="text-base font-bold text-[#3D3D3D] mb-0.5">You&apos;re not alone</h2>
                  <p className="text-xs text-[#5A5A5A] mb-3">
                    How your top symptoms compare to {cohortLabel}.
                  </p>
                  <div className="flex items-center gap-3 mb-2.5 text-[11px] text-[#5A5A5A]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" /> You
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" /> Typical
                    </span>
                  </div>
                  <div className="space-y-3">
                    {top3.map((id) => {
                      const you = Math.round(((symptomSeverity[id] ?? 0) / 3) * 100);
                      const avg = Math.round(((TYPICAL_SYMPTOM_SEVERITY[id] ?? 1.5) / 3) * 100);
                      return (
                        <div key={id}>
                          <div className="text-xs font-medium text-[#3D3D3D] mb-1">{SYMPTOM_LABELS[id] || id}</div>
                          <div className="space-y-1">
                            <div className="h-2.5 bg-foreground/10 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${you}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-[#2563EB] rounded-full"
                              />
                            </div>
                            <div className="h-2.5 bg-foreground/10 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${avg}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full bg-[#16A34A] rounded-full"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-[#9A9A9A] mt-3">
                    Compared to typical symptom patterns for your age.
                  </p>
                  <p className="text-xs text-[#5A5A5A] mt-2 text-center">
                    Join <AnimatedCounter target={1728} className="font-semibold text-[#3D3D3D]" /> women tracking with Lisa
                  </p>
                </motion.div>
              );
            })()}

            {/* Personalized plan */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-5"
            >
              <h2 className="text-base font-bold text-[#3D3D3D] mb-1">
                What Lisa will focus on with you
              </h2>
              <p className="text-xs text-[#5A5A5A] mb-3">
                Based on your answers - 3 areas, across 8 weeks.
              </p>
              <div className="space-y-2">
                {buildPillars(topProblems).map((pillar, i) => (
                  <div
                    key={pillar.id}
                    className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 flex items-start gap-3"
                  >
                    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-primary text-primary-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#3D3D3D]">{pillar.title}</h3>
                        <span className="text-[10px] font-medium shrink-0 text-primary">{PILLAR_WEEKS[i]}</span>
                      </div>
                      <p className="text-xs mt-0.5 leading-snug text-[#5A5A5A]">{pillar.preview}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Outcome stat */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-center gap-2 text-xs text-[#5A5A5A] mb-5 px-2 text-center"
            >
              <TrendingUp className="w-4 h-4 text-info shrink-0" />
              <span><strong className="text-[#3D3D3D]">73%</strong> of women with your pattern report better sleep within 14 days</span>
            </motion.div>

          </motion.div>

          {/* Fixed bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
              {(() => {
                const cta = getCtaCopy(qualifier);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhase("paywall")}
                      className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
                    >
                      {cta.label}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <p className="text-[11px] text-[#9A9A9A] text-center mt-1.5">{cta.sub}</p>
                  </>
                );
              })()}
            </div>
          </motion.div>
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
            {/* Blurred preview of the results she's about to unlock */}
            <div aria-hidden className="flex justify-center mb-4 sm:mb-6 pointer-events-none">
              <div className="w-full sm:w-78 max-h-[200px] sm:max-h-[200px] overflow-hidden rounded-xl">
                <Image
                  src="/quiz/results_blur.png"
                  alt=""
                  width={437}
                  height={951}
                  priority={false}
                  className="w-full object-cover object-top opacity-90 blur-[2px] select-none"
                />
              </div>
            </div>

            <div className="mb-4 sm:mb-6 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-2 sm:mb-3">
                {fromQuiz1 ? (
                  <>
                    Last step -{" "}
                    <span className="text-primary uppercase">save your plan</span>
                  </>
                ) : (
                  <>
                    Your personalized Menopause Score{" "}
                    <span className="text-primary uppercase">is ready</span>
                  </>
                )}
              </h2>
              {otpStep === "email" && (
                <>
                  <p className="text-sm sm:text-base text-[#5A5A5A]">
                    {fromQuiz1
                      ? "Enter your email for a 6-digit code. No password. Your focus pillars are saved."
                      : "Enter your email and we'll send a 6-digit code to unlock your results. No password needed."}
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
              onExistingAccount={(existingEmail) => {
                const msg = "You already have an account. Log in to pick up where you left off.";
                router.push(
                  `/login?email=${encodeURIComponent(existingEmail)}&message=${encodeURIComponent(msg)}`
                );
              }}
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
        <PaywallView
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          onCheckout={handleStartTrialCheckout}
          checkoutLoading={checkoutLoading}
          error={error}
        />
      )}

      {/* Download Phase - redirect users to mobile app */}
      {phase === "download" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0 text-center"
          >

            <div className="flex justify-center mb-4">
              <Image src="/paywall.png" alt="" width={220} height={220} priority />
            </div>
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
              disabled={syncingPayment}
              onClick={async () => {
                const sessionId = searchParams.get("session_id");
                if (sessionId) {
                  setSyncingPayment(true);
                  try {
                    await fetch("/api/stripe/sync-session", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ session_id: sessionId }),
                    });
                  } catch {
                    // ignore - middleware will handle gracefully if webhook already ran
                  } finally {
                    setSyncingPayment(false);
                  }
                }
                router.push("/dashboard");
              }}
              className="text-sm text-[#9A9A9A] hover:text-[#5A5A5A] underline transition-colors disabled:opacity-50"
            >
              {syncingPayment ? "Loading…" : "Continue to web dashboard instead"}
            </button>
          </motion.div>
        </div>
      )}

      {/* Quiz Phase */}
      {phase === "quiz" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden pb-[calc(72px+env(safe-area-inset-bottom))]">
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
                : activeQuestionIndex >= QUESTION_STEPS.length - 2
                  ? "Almost there"
                  : `Question ${activeQuestionIndex + 1} of ${QUESTION_STEPS.length}`}
            </p>
            <div className="flex justify-center gap-2 sm:gap-3">
              {QUESTION_STEPS.map((step, index) => {
                const isActive = activeQuestionIndex === index;
                return (
                  <motion.div
                    key={step}
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
            <div className="rounded-xl sm:rounded-2xl border border-foreground/10 bg-card backdrop-blur-sm p-2.5 mx-2 my-2 sm:p-3 space-y-1.5 sm:space-y-2 flex-1 min-h-0 shadow-lg shadow-primary/5 overflow-hidden flex flex-col">
              {/* Quiz step illustration (from public/quiz/, same as mobile assets/quiz/) */}
              {QUIZ_ILLUSTRATION[currentStep] && (
                <div className="shrink-0 flex justify-center mb-2 sm:mb-3">
                  <Image
                    src={`/quiz/${QUIZ_ILLUSTRATION[currentStep]}`}
                    alt=""
                    width={320}
                    height={currentStep === "breather" || currentStep === "q8_name" ? 140 : 160}
                    className="object-contain w-full max-h-[120px] sm:max-h-40"
                    style={{ height: 'auto' }}
                  />
                </div>
              )}
              {/* Q1: Age */}
              {currentStep === "q1_age" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">What&apos;s your age?</h2>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {AGE_OPTIONS.map((option) => {
                      const isSelected = ageBand === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setAgeBand(option.id)}
                          className={`flex flex-col min-h-0 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "ring-2 ring-primary shadow-lg shadow-primary/30"
                              : "hover:opacity-90"
                          }`}
                        >
                          <div className="relative flex-1 min-h-0">
                            <Image
                              src={option.image}
                              alt={option.label}
                              fill
                              sizes="50vw"
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`shrink-0 flex items-center justify-between px-2.5 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className="font-semibold text-xs text-white">{option.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q height */}
              {currentStep === "q_height" && (
                <div className="flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">
                      How tall are you?
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Lisa uses this to personalize your plan
                    </p>
                  </div>

                  {/* Unit toggle */}
                  <div className="flex gap-1.5 p-1 rounded-lg bg-foreground/5 w-fit">
                    {(["cm", "ft"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setHeightUnit(u)}
                        className={`min-h-9 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer ${
                          heightUnit === u
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {u === "cm" ? "cm" : "ft / in"}
                      </button>
                    ))}
                  </div>

                  {heightUnit === "cm" ? (
                    <div className="relative">
                      <Ruler className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                      <input
                        type="number"
                        inputMode="numeric"
                        value={heightCm}
                        onChange={(e) => setHeightCm(e.target.value)}
                        placeholder="Height in cm"
                        min={100}
                        max={250}
                        className="w-full pl-10 sm:pl-12 pr-14 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                        autoFocus
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">cm</span>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={heightFt}
                          onChange={(e) => setHeightFt(e.target.value)}
                          placeholder="Feet"
                          min={3}
                          max={8}
                          className="w-full pl-4 pr-10 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                          autoFocus
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">ft</span>
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={heightIn}
                          onChange={(e) => setHeightIn(e.target.value)}
                          placeholder="Inches"
                          min={0}
                          max={11}
                          className="w-full pl-4 pr-10 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">in</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Q weight */}
              {currentStep === "q_weight" && (
                <div className="flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">
                      What&apos;s your weight?
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      This helps Lisa tailor nutrition and movement guidance
                    </p>
                  </div>

                  {/* Unit toggle */}
                  <div className="flex gap-1.5 p-1 rounded-lg bg-foreground/5 w-fit">
                    {(["kg", "lb"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setWeightUnit(u)}
                        className={`min-h-9 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer ${
                          weightUnit === u
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Weight className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={weightUnit === "kg" ? weightKg : weightLb}
                      onChange={(e) =>
                        weightUnit === "kg"
                          ? setWeightKg(e.target.value)
                          : setWeightLb(e.target.value)
                      }
                      placeholder={weightUnit === "kg" ? "Weight in kg" : "Weight in lb"}
                      min={30}
                      max={400}
                      className="w-full pl-10 sm:pl-12 pr-14 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                      autoFocus
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {weightUnit}
                    </span>
                  </div>
                </div>
              )}

              {/* Q2: Menopausal status (image grid, same style as Q1 age) */}
              {currentStep === "q2_here_for" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What&apos;s your menopausal status?
                    </h2>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {HERE_FOR_OPTIONS.map((option) => {
                      const isSelected = hereFor === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setHereFor(option.id)}
                          className={`flex flex-col min-h-0 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "ring-2 ring-primary shadow-lg shadow-primary/30"
                              : "hover:opacity-90"
                          }`}
                        >
                          <div className="relative flex-1 min-h-0">
                            <Image
                              src={option.image}
                              alt={option.label}
                              fill
                              sizes="50vw"
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`shrink-0 px-2.5 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-xs text-white leading-tight">{option.label}</span>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
                            </div>

                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q3: Goals */}
              {currentStep === "q3_goals" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What do you want back?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {goal.length > 0
                        ? `${goal.length} selected`
                        : "Tap all that apply"}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1 pb-1 [scrollbar-width:thin]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {GOAL_OPTIONS.map((option) => {
                        const isSelected = goal.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleGoal(option.id)}
                            className={`flex flex-col rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer outline-none focus:outline-none ${
                              isSelected
                                ? "ring-2 ring-inset ring-primary shadow-lg shadow-primary/30"
                                : "hover:opacity-90"
                            }`}
                          >
                            <div className="relative aspect-square">
                              <Image
                                src={option.image}
                                alt={option.label}
                                fill
                                sizes="(min-width: 640px) 33vw, 50vw"
                                className="object-cover"
                              />
                              {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <div className={`shrink-0 px-2 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                              <span className="font-semibold text-xs text-white leading-tight">{option.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Q4: Symptoms - image tiles (same style as Q1 age / Q2 status), multi-select up to 9 */}
              {currentStep === "q4_symptoms" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      What&apos;s making life hardest right now?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {topProblems.length > 0
                        ? `${topProblems.length} selected`
                        : "Tap all that apply"}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1 pb-1 [scrollbar-width:thin]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {PROBLEM_OPTIONS.map((option) => {
                        const isSelected = (symptomSeverity[option.id] ?? 0) > 0;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleProblem(option.id)}
                            className={`flex flex-col rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer outline-none focus:outline-none ${
                              isSelected
                                ? "ring-2 ring-inset ring-primary shadow-lg shadow-primary/30"
                                : "hover:opacity-90"
                            }`}
                          >
                            <div className="relative aspect-square">
                              <Image
                                src={option.image}
                                alt={option.label}
                                fill
                                sizes="(min-width: 640px) 33vw, 50vw"
                                className="object-cover"
                              />
                              {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                              {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <div className={`shrink-0 px-2 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                              <span className="font-semibold text-xs text-white leading-tight">{option.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Breather */}
              {currentStep === "breather" && (
                <div className="flex-1 flex flex-col justify-center space-y-3 sm:space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-center">
                    <Image
                      src="/quiz/illustration_social_proof.png"
                      alt=""
                      width={320}
                      height={140}
                      className="object-contain w-full max-h-40 sm:max-h-40"
                    />
                  </div>
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-center">
                    You&apos;re in good company
                  </h2>
                  <p className="text-sm sm:text-base text-muted-foreground text-center leading-relaxed">
                    You&apos;re not imagining this. Let&apos;s see what your experience tells us. Thousands of women use MenoLisa to track symptoms and get support from Lisa. Take a breath, then we&apos;ll ask a couple more quick questions.
                  </p>
                </div>
              )}

              {/* Q5b: HRT history (image grid, same style as Q1 age / Q2 status) */}
              {currentStep === "q5_hrt" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      Have you ever taken any form of menopausal hormonal treatment (HRT)?
                    </h2>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {HRT_OPTIONS.map((option) => {
                      const isSelected = hrtStatus === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setHrtStatus(option.id)}
                          className={`flex flex-col min-h-0 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "ring-2 ring-primary shadow-lg shadow-primary/30"
                              : "hover:opacity-90"
                          }`}
                        >
                          <div className="relative flex-1 min-h-0">
                            <Image
                              src={option.image}
                              alt={option.label}
                              fill
                              sizes="50vw"
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`shrink-0 flex items-center justify-between px-2.5 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className="font-semibold text-xs text-white leading-tight">{option.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q6: How long */}
              {currentStep === "q6_how_long" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How long have symptoms been affecting you?
                    </h2>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {TIMING_OPTIONS.map((option) => {
                      const isSelected = timing === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setTiming(option.id)}
                          className={`flex flex-col min-h-0 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "ring-2 ring-primary shadow-lg shadow-primary/30"
                              : "hover:opacity-90"
                          }`}
                        >
                          <div className="relative flex-1 min-h-0">
                            <Image
                              src={option.image}
                              alt={option.label}
                              fill
                              sizes="50vw"
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`shrink-0 flex items-center justify-between px-2.5 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className="font-semibold text-xs text-white">{option.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Q7: Qualifier */}
              {currentStep === "q7_qualifier" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      Where are you right now?
                    </h2>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {QUALIFIER_OPTIONS.map((option) => {
                      const isSelected = qualifier === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setQualifier(option.id)}
                          className={`flex flex-col min-h-0 rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "ring-2 ring-primary shadow-lg shadow-primary/30"
                              : "hover:opacity-90"
                          }`}
                        >
                          <div className="relative flex-1 min-h-0">
                            <Image
                              src={option.image}
                              alt={option.label}
                              fill
                              sizes="50vw"
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`shrink-0 flex items-center justify-between px-2.5 py-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className="font-semibold text-xs text-white leading-tight">{option.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
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

          {/* Navigation Buttons - fixed to bottom of viewport, safe-area aware */}
          <div className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto max-w-3xl flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
              <button
                type="button"
                onClick={goBack}
                disabled={stepIndex === 0}
                className="min-h-12 flex items-center justify-center gap-1.5 px-4 sm:px-5 py-3 rounded-lg border-2 border-foreground/15 hover:bg-foreground/5 hover:border-foreground/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent font-medium text-sm sm:text-base"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!stepIsAnswered(currentStep)}
                className="min-h-12 flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 sm:px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none font-semibold text-sm sm:text-base"
              >
                {currentStep === "breather" || stepIndex === STEPS.length - 1 ? "Continue" : "Next"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
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
