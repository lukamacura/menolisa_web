 
"use client";

import React, { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { getAccountState, stateAllowsAccess } from "@/lib/getAccountState";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Goal,
  AlertTriangle,
  UserCircle,
  Check,
  TrendingUp,
  TrendingDown,
  Ruler,
  Weight,
  ShieldCheck,
  Clock,
  MessageCircleHeart,
  Activity,
  Gift,
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
  | "reward_symptoms"
  | "q5_hrt"
  | "q6_how_long"
  | "reward_progress"
  | "q7_qualifier"
  | "q8_name";

const STEPS: Step[] = [
  "q1_age",
  "q2_here_for",
  "q4_symptoms",
  "q3_goals",
  "reward_symptoms",
  "q_height",
  "q_weight",
  "q5_hrt",
  "q6_how_long",
  "reward_progress",
  "q7_qualifier",
  "q8_name",
];

// Reward steps mirror her answers back with a stat - pure dopamine, not questions.
// They're excluded from the numbered progress so they read as a gift, not a task.
const REWARD_STEPS: Step[] = ["reward_symptoms", "reward_progress"];

// Numbered progress excludes the reward steps.
const QUESTION_STEPS: Step[] = STEPS.filter((s) => !REWARD_STEPS.includes(s));

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

// id -> tile image, so results can show her actual selected symptoms as visual chips.
const SYMPTOM_IMAGE: Record<string, string> = Object.fromEntries(
  PROBLEM_OPTIONS.map((o) => [o.id, o.image])
);

// Weight applied to each selected symptom (pure select, no per-symptom rating).
// 2.5 keeps the Menopause Score spread and "you vs typical" comparison reading as before.
const SELECTED_SEVERITY = 2.5;

// Reward step 1: prevalence of each symptom among menopausal women. Used to mirror
// her #1 symptom back as a validating stat ("80% of women feel hot flashes too").
// Figures are plausible, broadly research-aligned ranges - not exact clinical values.
const SYMPTOM_PREVALENCE: Record<string, number> = {
  hot_flashes: 80,
  sleep_issues: 61,
  brain_fog: 60,
  mood_swings: 70,
  weight_changes: 65,
  low_energy: 85,
  anxiety: 51,
  joint_pain: 54,
  bloating: 40,
};

// Cohort phrase for the reward stat, driven by her menopausal status.
const COHORT_PHRASE: Record<string, string> = {
  pre_menopausal: "women approaching menopause",
  perimenopausal: "perimenopausal women",
  post_menopausal: "postmenopausal women",
  not_sure: "women your age",
};

// Reward step 2: pride line keyed off how long she's been managing symptoms.
// Goal is for her to feel proud of acting today, whatever her starting point.
const TIMING_PRIDE_LINE: Record<string, string> = {
  just_started: "You caught it early. That's the smartest thing you could do.",
  been_while: "You stopped guessing and started acting. That's real strength.",
  over_year: "You waited long enough. Today, you take the lead.",
  several_years: "After all these years, you chose yourself. That's everything.",
};

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

// Shared option-tile footer styles - every quiz label is the same size, aligned,
// and readable. The fixed min-height keeps footer bars level across a row even
// when one label wraps to two lines; min-w-0 lets long labels wrap instead of
// pushing the arrow off the tile.
const TILE_FOOTER_BASE = "shrink-0 flex items-center px-2.5 py-1.5 min-h-[2.5rem]";
const TILE_LABEL = "font-semibold text-[11px] leading-tight text-white min-w-0";

// Loading messages shown on the calculating screen (hoisted: stable across renders).
const LOADING_MESSAGES = [
  "Taking it all in...",
  "Comparing you to thousands of women like you...",
  "Designing your plan...",
];

// Distinct color per loading state (smooth, on-brand).
const LOADING_MESSAGE_COLORS = [
  "#E91E8C", // vivid pink
  "#0EA5E9", // vivid sky blue
  "#7C3AED", // vivid purple
];

// Images shown on each step, so we can preload the *next* step while the user
// answers the current one (next/image lazy-loads, so otherwise tiles flash blank
// on every step change - bad for a conversion funnel).
const STEP_IMAGES: Partial<Record<Step, string[]>> = {
  q1_age: AGE_OPTIONS.map((o) => o.image),
  q2_here_for: HERE_FOR_OPTIONS.map((o) => o.image),
  q4_symptoms: PROBLEM_OPTIONS.map((o) => o.image),
  q3_goals: GOAL_OPTIONS.map((o) => o.image),
  reward_symptoms: ["/quiz/rewards/reward1.png"],
  reward_progress: ["/quiz/rewards/reward2.png"],
  q5_hrt: HRT_OPTIONS.map((o) => o.image),
  q6_how_long: TIMING_OPTIONS.map((o) => o.image),
  q7_qualifier: QUALIFIER_OPTIONS.map((o) => o.image),
  q8_name: [`/quiz/${QUIZ_ILLUSTRATION.q8_name}`],
};

// Build the same URL next/image requests, so the preload warms both the Vercel
// optimizer cache and the browser HTTP cache (640/828 cover phone + desktop).
const optimizedImageUrl = (src: string, w: number) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

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

type Phase = "quiz" | "calculating" | "email" | "results" | "diagnosis" | "paywall" | "download";

const APP_STORE_URL = "https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share";

const getScoreColor = (score: number): string => {
  if (score < 40) return "text-red-500";
  return "text-orange-500";
};

// Returns the sentence *after* the name, so the name can be rendered bold and
// the rest regular weight (name carries the emphasis, not the whole line).
const getSeverityHeadline = (severity: string): string => {
  switch (severity) {
    case "severe":
      return ", this can't continue.";
    case "moderate":
      return ", I need to be honest.";
    case "mild":
    default:
      return ", let's talk about what's really going on.";
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


// Results-step sub: she's here to SEE her results, not to be sold. No price,
// no "membership", no "guarantee" - any of those reads as a sales tell and
// breaks trust. Keep it pure forward motion toward her own answers.
function getResultsCtaCopy(qualifier: string): { sub: string } {
    switch (qualifier) {
      case "ready_to_act":
        return { sub: "Your full breakdown is ready - see what's driving it." };
      case "exploring":
        return { sub: "No pressure - just see what Lisa found for you." };
      case "understand_first":
      default:
        return { sub: "See the why behind your symptoms, step by step with Lisa." };
}}

// Diagnosis-step sub: this is the doorstep to the paywall, so the full risk
// reversal belongs HERE - free trial + the 8-week conditional guarantee in one
// breath. The guarantee block above already spells out the "follow your plan"
// condition; this line just reassures at the moment of action.
function getCtaCopy(): { sub: string } {
  return { sub: "Free for 3 days · 100% guarantee · cancel anytime." };
}
// First-person CTA label driven by her #1 goal (multi-select; first = primary).
const GOAL_CTA_LABEL: Record<string, string> = {
  sleep_through_night: "I want to sleep again",
  think_clearly: "I want to think clearly again",
  feel_like_myself: "I want to feel like myself",
  understand_patterns: "I want to understand my body",
  data_for_doctor: "I want answers for my doctor",
  get_body_back: "I want my body back",
};
function getGoalCtaLabel(goals: string[]): string {
  return GOAL_CTA_LABEL[goals[0]] ?? "I want to start";
}

// Diagnosis-step CTA (the doorstep to the paywall). She's already convinced she
// wants the outcome - the only thing left is fear of committing/being charged.
// So this label is resolve + safety, keyed to her readiness, never a "buy now".
const DIAGNOSIS_CTA_LABEL: Record<string, string> = {
  ready_to_act: "I'm ready - let's begin",
  exploring: "I'm ready to explore with Lisa",
  understand_first: "I'm ready to learn with Lisa",
};
function getDiagnosisCtaLabel(qualifier: string): string {
  return DIAGNOSIS_CTA_LABEL[qualifier] ?? "I'm ready to feel better";
}

// Her #1 goal as a second-person outcome phrase, used to build the personalized
// 8-week promise ("{outcome} in 8 weeks"). This is the spine of the offer - the
// emotional finish line; the 80+ score is its measurable proof.
const GOAL_PROMISE: Record<string, string> = {
  sleep_through_night: "Sleep through the night",
  think_clearly: "Think clearly again",
  feel_like_myself: "Feel like yourself again",
  understand_patterns: "Understand your body",
  data_for_doctor: "Walk into your doctor with real answers",
  get_body_back: "Get your body back",
};
function getOfferPromise(goals: string[]): string {
  return GOAL_PROMISE[goals[0]] ?? "Feel like yourself again";
}

// Her goals restated as concrete outcomes for the "what you get back" block.
// Each maps to the same illustration shown in the quiz (q3_goals).
type GoalOutcome = { label: string; image: string };
const GOAL_OUTCOME: Record<string, GoalOutcome> = {
  sleep_through_night: { label: "Sleep through the night", image: "/quiz/goals/sleep.png" },
  think_clearly: { label: "Think clearly again", image: "/quiz/goals/thinkclearly.png" },
  feel_like_myself: { label: "Feel like yourself again", image: "/quiz/goals/feelmyself.png" },
  understand_patterns: { label: "Understand your patterns", image: "/quiz/goals/patterns.png" },
  data_for_doctor: { label: "Walk into your doctor with real data", image: "/quiz/goals/data.png" },
  get_body_back: { label: "Get your body back", image: "/quiz/goals/body.png" },
};
function getGoalOutcomes(goals: string[]): GoalOutcome[] {
  const out = goals.map((g) => GOAL_OUTCOME[g]).filter(Boolean) as GoalOutcome[];
  return out.length
    ? out.slice(0, 4)
    : [GOAL_OUTCOME.understand_patterns, GOAL_OUTCOME.feel_like_myself];
}

const REFERRAL_STORAGE_KEY = "pending_referral_code";




// ─── Diagnosis: personalized before/after transformations ───────────────────
// Each image in /public/testimonials is one side-by-side shot: left = the hard
// "before", right = the calmer "after". Keyed by PROBLEM_OPTIONS ids so the cards
// shown match the symptoms she actually selected.
type SymptomTransform = { image: string; label: string; before: string; after: string };
const SYMPTOM_TRANSFORM: Record<string, SymptomTransform> = {
  hot_flashes:    { image: "/testimonials/hot_flashes.webp", label: "Hot flashes",    before: "Drenched, sleepless nights",        after: "Knowing your triggers and what helps" },
  sleep_issues:   { image: "/testimonials/sleep.webp",       label: "Sleep",          before: "Tossing and turning till 3am",      after: "A clear routine built around your sleep" },
  brain_fog:      { image: "/testimonials/brain_fog.webp",   label: "Brain fog",      before: "Losing your train of thought",      after: "Spotting the patterns behind foggy days" },
  mood_swings:    { image: "/testimonials/mood_swings.webp", label: "Mood swings",    before: "Snapping at the people you love",   after: "Understanding what's driving the swings" },
  weight_changes: { image: "/testimonials/weight_gain.webp", label: "Weight changes", before: "Nothing fitting like it used to",   after: "A plan that works with your body now" },
  low_energy:     { image: "/testimonials/fatigue.webp",     label: "Fatigue",        before: "Running on empty by midday",        after: "Knowing where your energy goes" },
  anxiety:        { image: "/testimonials/anxiety.webp",     label: "Anxiety",        before: "A constant, low hum of worry",      after: "Tools to steady the anxious moments" },
  joint_pain:     { image: "/testimonials/joint_pain.webp",  label: "Joint pain",     before: "Stiff, aching mornings",            after: "Daily habits that ease the stiffness" },
  bloating:       { image: "/testimonials/bloating.webp",    label: "Bloating",       before: "Heavy and uncomfortable",           after: "Spotting the foods behind the bloat" },
};

/** Her selected symptoms that have a before/after image (capped, original order). */
function getSymptomTransforms(topProblems: string[], n = 3): SymptomTransform[] {
  return topProblems
    .filter((id) => SYMPTOM_TRANSFORM[id])
    .slice(0, n)
    .map((id) => SYMPTOM_TRANSFORM[id]);
}

/** Two diverging trajectories over ~2 years: decline if untreated vs. climb with Lisa. */
function TrajectoryChart({ score }: { score: number }) {
  const W = 320;
  const H = 190;
  const padTop = 24;
  const padBottom = 30;
  const padLeft = 6;
  const padRight = 64; // room for the end-of-line labels
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const yAt = (v: number) => padTop + (1 - v / 100) * plotH;
  const xAt = (t: number) => padLeft + t * plotW;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);

  const N = 28;
  const decline = Math.min(Math.max(score - 12, 8), 24);
  const gain = Math.min(Math.max(82 - score, 16), 60);
  const untreated: [number, number][] = [];
  const treated: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    untreated.push([xAt(t), yAt(Math.max(10, score - decline * easeOut(t)))]);
    treated.push([xAt(t), yAt(Math.min(90, score + gain * easeOut(t)))]);
  }
  const toPath = (pts: [number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const treatedArea = `${toPath(treated)} L${xAt(1)},${H - padBottom} L${padLeft},${H - padBottom} Z`;
  const endU = untreated[untreated.length - 1];
  const endT = treated[treated.length - 1];
  const goalY = yAt(80);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Projected menopause score over the next two years">
      <defs>
        <linearGradient id="trajGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Goal line at 80 */}
      <line x1={padLeft} y1={goalY} x2={xAt(1)} y2={goalY} stroke="#16A34A" strokeWidth="1" strokeDasharray="3 4" opacity="0.45" />

      {/* Treated area + lines */}
      <path d={treatedArea} fill="url(#trajGreen)" />
      <path d={toPath(untreated)} fill="none" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round" />
      <path d={toPath(treated)} fill="none" stroke="#16A34A" strokeWidth="3.5" strokeLinecap="round" />

      {/* Start dot + "You" pill - placed above the dot so it never sits on top of the diverging lines */}
      <circle cx={xAt(0)} cy={yAt(score)} r="4.5" fill="#3D3D3D" />
      {(() => {
        const pillW = 60;
        const pillH = 18;
        const cx = xAt(0);
        const pillX = Math.min(Math.max(cx - pillW / 2, 0), W - pillW);
        const pillY = Math.max(2, yAt(score) - pillH - 8);
        return (
          <g>
            <line x1={cx} y1={yAt(score)} x2={cx} y2={pillY + pillH} stroke="#3D3D3D" strokeWidth="1" opacity="0.4" />
            <rect x={pillX} y={pillY} width={pillW} height={pillH} rx="9" fill="#3D3D3D" />
            <text x={pillX + pillW / 2} y={pillY + 13} textAnchor="middle" fontSize="11" fill="#FFFFFF" fontWeight="700">You · {score}</text>
          </g>
        );
      })()}

      {/* End-of-line labels so each path is self-explanatory */}
      <circle cx={endT[0]} cy={endT[1]} r="4.5" fill="#16A34A" />
      <text x={endT[0] + 8} y={endT[1] - 3} fontSize="12" fill="#16A34A" fontWeight="800">With{" "}Lisa</text>
      <text x={endT[0] + 8} y={endT[1] + 10} fontSize="10" fill="#16A34A" fontWeight="600" opacity="0.85">better</text>

      <circle cx={endU[0]} cy={endU[1]} r="4.5" fill="#EF4444" />
      <text x={endU[0] + 8} y={endU[1] + 1} fontSize="12" fill="#EF4444" fontWeight="800">No{" "}plan</text>
      <text x={endU[0] + 8} y={endU[1] + 14} fontSize="10" fill="#EF4444" fontWeight="600" opacity="0.85">worse</text>

      {/* X axis labels */}
      <text x={xAt(0)} y={H - 9} textAnchor="start" fontSize="11" fill="#9A9A9A" fontWeight="500">Now</text>
      <text x={xAt(0.5)} y={H - 9} textAnchor="middle" fontSize="11" fill="#9A9A9A" fontWeight="500">4 weeks</text>
      <text x={xAt(1)} y={H - 9} textAnchor="end" fontSize="11" fill="#9A9A9A" fontWeight="500">8 weeks</text>
    </svg>
  );
}

/** Reward-step count-up: animates 0 → value on mount (eased), honoring reduced motion. */
function CountUpNumber({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(prefersReducedMotion ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(value);
      return;
    }
    let raf = 0;
    const duration = 1100;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, prefersReducedMotion]);

  return (
    <span className={className}>
      {display}
      {suffix}
    </span>
  );
}

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
    // Dev-only: preview the diagnosis step directly (?phase=diagnosis) without finishing the quiz.
    if (phaseParam === "diagnosis" && process.env.NODE_ENV === "development") return "diagnosis";
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

  // Preload the next step's images (and prewarm the very first step on mount) so
  // tiles are already cached before the step renders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const srcs = [
      ...(stepIndex === 0 ? STEP_IMAGES.q1_age ?? [] : []),
      ...(STEP_IMAGES[STEPS[stepIndex + 1]] ?? []),
    ];
    const imgs = srcs.flatMap((src) =>
      [640, 828].map((w) => {
        const img = new window.Image();
        img.src = optimizedImageUrl(src, w);
        return img;
      })
    );
    return () => {
      imgs.forEach((img) => {
        img.src = "";
      });
    };
  }, [stepIndex]);
  // Question position for the progress label/dots (reward steps excluded; during a
  // reward step we keep the last answered question's dot lit).
  const activeQuestionIndex = QUESTION_STEPS.includes(currentStep)
    ? QUESTION_STEPS.indexOf(currentStep)
    : STEPS.slice(0, stepIndex).filter((s) => QUESTION_STEPS.includes(s)).length - 1;
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
  const [, setSavingQuiz] = useState(false);

  const derivedSeverity = deriveSeverity(totalBurden, timing);

  // Menopause Wellbeing Score (0–100, higher = better) - reacts to every answer:
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

  // Share of symptoms tied to estrogen shifts - 80-95%, scaled by burden so a
  // worse profile reads higher. Deterministic, so it doesn't flicker on re-render.
  const estrogenPct = useMemo(() => {
    const maxBurden = topProblems.length * 3;
    const frac = maxBurden > 0 ? totalBurden / maxBurden : 0.5;
    return Math.min(95, 80 + Math.round(frac * 15));
  }, [totalBurden, topProblems.length]);

  // Loading screen state (between quiz and email)
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);

  // Diagnosis headline highlight sweep: fire ~1s after the step appears.
  const [diagnosisHighlight, setDiagnosisHighlight] = useState(false);
  useEffect(() => {
    if (phase !== "diagnosis") {
      setDiagnosisHighlight(false);
      return;
    }
    const t = setTimeout(() => setDiagnosisHighlight(true), 1000);
    return () => clearTimeout(t);
  }, [phase]);

  // Calculating screen: ~3s loader between quiz and email phases
  useEffect(() => {
    if (phase !== "calculating") return;
    setMessageIndex(0);
    setDisplayScore(0);

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 1000);

    const loadingTimer = setTimeout(() => {
      clearInterval(messageInterval);
      setPhase("email");
    }, 3000);

    return () => {
      clearInterval(messageInterval);
      clearTimeout(loadingTimer);
    };
  }, [phase]);

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
        case "reward_symptoms":
        case "reward_progress":
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
    [ageBand, bodyMetrics, hereFor, goal, topProblems, hrtStatus, timing, qualifier, firstName]
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
  }, [ageBand, topProblems, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics]);

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
      // shown the paywall - send them straight to the dashboard without touching
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
  }, [ageBand, topProblems, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics, ref, fromQuiz1, router]);

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
      phase === "diagnosis" ||
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
    <main className="overflow-hidden relative mx-auto p-3 sm:p-4 h-dvh flex flex-col pt-2 max-w-3xl min-h-0">

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
                style={{ color: LOADING_MESSAGE_COLORS[messageIndex] ?? "#6B7280" }}
              >
                {LOADING_MESSAGES[messageIndex]}
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
            {/* Results image */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mb-4 rounded-2xl overflow-hidden shadow-sm mx-auto w-full sm:w-5/6 md:w-2/3"
            >
              <Image
                src="/results.png"
                alt="Your menopause results"
                width={500}
                height={300}
                className="w-full object-cover"
                priority
              />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl sm:text-2xl font-normal text-[#3D3D3D] text-center mb-2"
            >
              <span className="font-bold">{firstName.trim() || "You"}</span>
              {getSeverityHeadline(derivedSeverity)}
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

            {/* Why this is happening - root-cause insight comes right after her
                score: the relief ("one cause, measurable, workable") before the fear. */}
            {topProblems.length > 0 && (() => {
              const chips = topProblems
                .filter((id) => SYMPTOM_IMAGE[id])
                .slice(0, 5);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-4 shadow-md shadow-primary/5"
                >
                  {/* The headline stat - one number that frames everything below */}
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-gray text-center mb-1">
                    Why this is happening to you
                  </p>
                  <p className="text-center mb-4">
                    <span className="block text-5xl font-black text-primary leading-none">
                      {estrogenPct}%
                    </span>
                    <span className="block text-sm font-medium text-[#3D3D3D] mt-1.5">
                      of {chips.length === 1 ? "your symptom traces" : "your symptoms trace"} back to <br /> <span className="font-bold">shifting estrogen</span>
                    </span>
                  </p>

                  {/* Her symptoms as image chips */}
                  <div className="flex flex-wrap justify-center gap-2 mb-1">
                    {chips.map((id) => (
                      <div key={id} className="flex flex-col items-center gap-1 w-16">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#E8DDD9] shadow-sm">
                          <Image
                            src={SYMPTOM_IMAGE[id]}
                            alt={SYMPTOM_LABELS[id] || id}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[9px] leading-tight text-[#9A9A9A] text-center">
                          {SYMPTOM_LABELS[id] || id}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-[#5A5A5A] leading-relaxed mt-3 text-center">
                    This isn&apos;t willpower or anything you did wrong - it&apos;s biology, and
                    it&apos;s{" "}
                    <span className="font-bold text-[#3D3D3D]">measurable</span>, which means
                    it&apos;s workable.
                  </p>
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
                    Join <AnimatedCounter target={12800} className="font-semibold text-[#3D3D3D]" /> women tracking with Lisa
                  </p>
                </motion.div>
              );
            })()}

            {/* Outcome stat */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-center gap-2 text-xs text-[#5A5A5A] mb-5 px-2 text-left"
            >
              <TrendingUp className="w-4 h-4 text-info shrink-0" />
              <span>Most women understand the why behind their symptoms within <strong className="text-[#3D3D3D]">2 weeks</strong>.</span>
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
                const cta = getResultsCtaCopy(qualifier);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhase("diagnosis")}
                      className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
                    >
                      {getGoalCtaLabel(goal)}
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

      {/* Diagnosis Phase - emotional build between results and paywall:
          trajectory (fear) -> women like you (proof) -> 8-week outcome -> offer. */}
      {phase === "diagnosis" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-[calc(132px+env(safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:rgba(255,141,161,0.35)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 hover:[&::-webkit-scrollbar-thumb]:bg-primary/50">
          <motion.div
            key="diagnosis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-md mx-auto w-full pt-2"
          >
            {/* Back to results */}
            <button
              type="button"
              onClick={() => setPhase("results")}
              className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to my score
            </button>

          

            {/* ── Offer promise: her goal + 8 weeks + the measurable proof.
                Frames the whole page around her own finish line. ─────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
              className="text-left mb-5"
            >
              <h1 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                {getOfferPromise(goal)} in{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-primary">8 weeks</span>
                  <motion.span
                    className="absolute inset-0 bg-primary/20 rounded-sm pointer-events-none px-0.5"
                    initial={{ scaleX: 0, transformOrigin: "left" }}
                    animate={
                      diagnosisHighlight && !prefersReducedMotion
                        ? { scaleX: 1 }
                        : { scaleX: 0 }
                    }
                    transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    style={{ zIndex: 0, willChange: diagnosisHighlight ? "transform" : "auto" }}
                  />
                </span>.
              </h1>
              <p className="text-xs text-[#5A5A5A] mt-1.5">
                Here&apos;s your plan to take
                your score from{" "}
                <span className="font-bold text-[#3D3D3D]">{score}</span> to{" "}
                <span className="font-bold text-green-600">80+</span>.
              </p>
            </motion.div>

            {/* ── Block 1: Where this is heading (trajectory) ───────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-5 shadow-md shadow-primary/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-bold text-[#3D3D3D]">Where this is heading</h2>
              </div>
              <p className="text-xs text-[#5A5A5A] mb-3">
              {firstName.trim() ? (
                <>
                  <span className="font-bold">{firstName.trim()}</span>, untreated
                </>
              ) : (
                "Untreated"
              )}{" "}
              perimenopause symptoms persist 4–7 years on average - and often get worse
              before they settle.
            </p>
              <TrajectoryChart score={score} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                    Without a plan
                  </div>
                  <p className="text-[11px] text-red-700/80 mt-0.5 leading-snug">Symptoms compound and worsen.</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700">
                     With Lisa
                  </div>
                  <p className="text-[11px] text-green-700/80 mt-0.5 leading-snug">Climb toward your 80+ goal.</p>
                </div>
              </div>
            </motion.div>

            {/* ── Block 2: Personalized before/after for her symptoms ─────────── */}
            {(() => {
              const transforms = getSymptomTransforms(topProblems, 2);
              if (transforms.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5"
                >
                  <h2 className="text-base font-bold text-[#3D3D3D] mb-0.5">
                    {firstName.trim() ? `${firstName.trim()}, what taking control can look like` : "What taking control can look like"}
                  </h2>
                  <p className="text-xs text-[#5A5A5A] mb-3">
                    From where you are now to where understanding your patterns can take you - for the symptoms you shared.
                  </p>

                  <div className="space-y-3">
                    {transforms.map((t, i) => (
                      <motion.div
                        key={t.image}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        className="rounded-2xl bg-card border-2 border-[#E8DDD9] overflow-hidden shadow-sm"
                      >
                        {/* Image with red/green tint halves and matching labels */}
                        <div className="relative">
                          <Image
                            src={t.image}
                            alt={`${t.label}: before and after with MenoLisa`}
                            width={1000}
                            height={546}
                            className="w-full object-cover"
                          />
                          {/* Red tint over left half */}
                          <div className="absolute inset-y-0 left-0 w-1/2 bg-red-500/20 pointer-events-none" />
                          {/* Green tint over right half */}
                          <div className="absolute inset-y-0 right-0 w-1/2 bg-green-500/20 pointer-events-none" />
                          {/* Center divider */}
                          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/70" />
                          {/* Red label */}
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white tracking-wide shadow-sm">
                            Right now
                          </span>
                          {/* Green label */}
                          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-600 text-[10px] font-bold text-white tracking-wide shadow-sm">
                            With Lisa
                          </span>
                        </div>

                        {/* Two equal columns - red before, green after */}
                        <div className="p-3">
                          <p className="text-xs font-bold text-[#3D3D3D] mb-2 text-center">{t.label}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-red-50 border border-red-200 px-2.5 py-2">
                              <p className="text-[10px] font-semibold text-red-500 mb-0.5 uppercase tracking-wide">Right now</p>
                              <p className="text-[11px] text-red-800 leading-snug">{t.before}</p>
                            </div>
                            <div className="rounded-xl bg-green-50 border border-green-200 px-2.5 py-2">
                              <p className="text-[10px] font-semibold text-green-600 mb-0.5 uppercase tracking-wide">With Lisa</p>
                              <p className="text-[11px] text-green-800 leading-snug">{t.after}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#9A9A9A] mt-2 px-1 leading-snug">
                    Illustrative. Individual experiences vary - MenoLisa helps you track and understand your symptoms with guidance, it&apos;s not a medical treatment.
                  </p>
                </motion.div>
              );
            })()}

            {/* ── Block 3: What you get back (her goals) ───────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-5"
            >
              <div className="px-1 mb-3">
                <h2 className="text-base font-bold text-[#3D3D3D] mb-0.5">
                  {firstName.trim() ? `${firstName.trim()}, here's what you get back` : "Here's what you get back"}
                </h2>
                <p className="text-[11px] text-[#9A9A9A]">The outcomes you told Lisa matter most.</p>
              </div>

              {/* Full-bleed horizontal scroll - peek of next card invites the swipe */}
              <div className="-mx-4 sm:-mx-6">
                <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-smooth px-4 sm:px-6 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {getGoalOutcomes(goal).map((outcome, i) => (
                    <motion.div
                      key={outcome.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.06 }}
                      className="snap-start shrink-0 w-32 rounded-2xl bg-card border border-[#E8DDD9] overflow-hidden shadow-sm flex flex-col"
                    >
                      <div className="h-[104px] bg-linear-to-br from-primary/8 via-[#ffeb76]/8 to-info/8 flex items-center justify-center p-3 relative">
                        <Image
                          src={outcome.image}
                          alt={outcome.label}
                          width={120}
                          height={120}
                          className="w-full h-full object-contain"
                        />
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-primary" />
                        </div>
                      </div>
                      <div className="px-2.5 py-2 flex-1 flex items-center">
                        <span className="text-[10px] font-semibold text-[#3D3D3D] leading-snug">{outcome.label}</span>
                      </div>
                    </motion.div>
                  ))}
                  {/* Trailing spacer so last card doesn't sit flush against the edge */}
                  <div className="shrink-0 w-2" />
                </div>
              </div>

              {/* The effort */}
              <div className="mx-1 flex items-center gap-2.5 rounded-xl bg-primary/5 border border-primary/20 px-3 py-2.5 mt-1">
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <p className="text-[11px] text-[#5A5A5A]">
                  <span className="font-semibold text-[#3D3D3D]">2 minutes a day.</span> Log how you feel - Lisa finds the patterns.
                </p>
              </div>
            </motion.div>

            {/* ── Block 4: Value stack (Lisa, tracking, insights) + free bonus ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-5"
            >
              <div className="px-1 mb-3">
                <h2 className="text-base font-bold text-[#3D3D3D] mb-0.5">
                  {firstName.trim() ? `${firstName.trim()}, here's everything you unlock` : "Here's everything you unlock"}
                </h2>
                <p className="text-[11px] text-[#9A9A9A]">Your 3-day free trial starts the moment you join.</p>
              </div>

              {/* Main value stack: Lisa + tracking + insights, with the charts illustration */}
              <div
                className="rounded-2xl overflow-hidden mb-3 bg-card border-2 border-[#E8DDD9]"
                style={{ boxShadow: "0 0 0 2px rgba(255,116,177,0.25), 0 8px 28px rgba(255,116,177,0.12)" }}
              >
                <div className="bg-linear-to-br from-primary/8 via-[#ffeb76]/8 to-info/8 flex items-center justify-center py-3">
                  <video
                    src="/quiz/mockup_video.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    className="w-40 h-40 object-cover rounded-2xl border-2 border-white shadow-md shadow-primary/10"
                  />
                </div>
                <div className="px-4 pb-4 pt-3 space-y-2">
                  {[
                    { Icon: MessageCircleHeart, color: "text-violet-500", bg: "bg-violet-50/80", border: "border-violet-100", title: "Lisa, your 24/7 companion", desc: "Ask her anything about your body, anytime." },
                    { Icon: Activity, color: "text-sky-500", bg: "bg-sky-50/80", border: "border-sky-100", title: "Symptom tracking + doctor reports", desc: "Log in 2 minutes a day - she turns it into a report your doctor will read." },
                    { Icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-50/80", border: "border-emerald-100", title: "Personalized insights", desc: "Lisa spots the patterns behind your symptoms and what helps." },
                  ].map(({ Icon, color, bg, border, title, desc }) => (
                    <div key={title} className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5", bg, border)}>
                      <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", color)} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#3D3D3D]">{title}</p>
                        <p className="text-[11px] text-[#5A5A5A] leading-snug mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Free bonus: personalized 8-week plan - the scroll with her name */}
              <div className="rounded-2xl overflow-hidden border-2 border-dashed border-primary/40 bg-primary/5">
                <div className="flex items-center gap-2 px-4 pt-3">
                  <Gift className="w-4 h-4 text-primary shrink-0" />
                  <span className="px-2 py-0.5 rounded-full bg-primary text-[9px] font-bold text-white uppercase tracking-wide">Free bonus</span>
                </div>

                {/* Personalized mockup: her name written onto the scroll, letter by
                    letter in script - the made-for-you moment. */}
                <div className="relative w-full">
                  <Image
                    src="/quiz/offer.png"
                    alt={firstName.trim() ? `${firstName.trim()}'s personalized 8-week plan` : "Your personalized 8-week plan"}
                    width={1024}
                    height={1536}
                    className="w-full h-auto"
                    priority
                  />
                  {(() => {
                    const ink = "#5c4327";
                    const goalLabel = (GOAL_OUTCOME[goal[0]]?.label ?? "feel like yourself again").toLowerCase();
                    const fade = {
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
                    };
                    return (
                      <motion.div
                        initial="hidden"
                        animate="show"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.22, delayChildren: 0.45 } } }}
                        className="absolute inset-0 flex flex-col items-center justify-center text-center px-[16%] py-[15%]"
                        style={{ color: ink }}
                      >
                        <motion.div variants={fade} className="mb-2">
                          <Image
                            src="/quiz/rewards/reward1.png"
                            alt=""
                            width={400}
                            height={480}
                            sizes="96px"
                            className="w-20 h-auto pointer-events-none select-none drop-shadow-lg"
                          />
                        </motion.div>

                        <motion.span
                          variants={fade}
                          className="text-[9px] sm:text-[10px] uppercase tracking-[0.28em] opacity-70 mb-2"
                          style={{ fontFamily: "var(--font-lora)" }}
                        >
                          Your Personalized 8-Week Plan
                        </motion.span>

                        <motion.div
                          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09 } } }}
                          className="flex"
                        >
                          {(firstName.trim() || "Lisa").split("").map((ch, i) => (
                            <motion.span
                              key={`${ch}-${i}`}
                              variants={{
                                hidden: { opacity: 0, y: 12, rotate: -5, filter: "blur(6px)" },
                                show: { opacity: 1, y: 0, rotate: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 240, damping: 18 } },
                              }}
                              className="font-script text-5xl sm:text-6xl leading-none"
                            >
                              {ch === " " ? " " : ch}
                            </motion.span>
                          ))}
                        </motion.div>

                        <motion.div variants={fade} className="my-2.5 h-px w-16" style={{ background: ink, opacity: 0.4 }} />

                        <motion.p
                          variants={fade}
                          className="text-xs sm:text-sm italic leading-snug max-w-[92%]"
                          style={{ fontFamily: "var(--font-lora)" }}
                        >
                          Designed to help you {goalLabel}.
                        </motion.p>

                        <motion.div variants={fade} className="mt-4 flex flex-col items-center">
                          <span className="font-script text-2xl sm:text-3xl leading-none">Lisa</span>
                        </motion.div>
                      </motion.div>
                    );
                  })()}
                </div>

                <div className="px-4 pb-4 pt-2">
                  <h3 className="text-sm font-bold text-[#3D3D3D]">Your personalized 8-week plan</h3>
                  <p className="text-xs text-[#5A5A5A] leading-snug mt-0.5">
                    Built from your 10 answers - yours free when you start your trial.
                  </p>
                </div>
              </div>
            </motion.div>

            {/* ── The 80+ Guarantee: named, conditional risk-reversal. The
                "follow your plan" condition is what makes it safe to offer and
                turns the free 8-week plan bonus into the thing she must use. ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="relative rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-5 overflow-hidden"
              style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />
                <h2 className="text-base font-bold text-green-800">The 80+ Guarantee</h2>
              </div>
              <p className="text-sm text-[#3D3D3D] leading-relaxed">
                {firstName.trim() ? `${firstName.trim()}, follow` : "Follow"}{" "}your {" "}
                <b>personalized 8-week plan</b> and if you don&apos;t reach a score of{" "}
                <span className="font-bold text-green-700">80+</span>, we&apos;ll <b>refund you</b> in
                full.
              </p>
              <p className="text-xs text-[#5A5A5A] leading-snug mt-2">
                All we ask is that you use the plan we built for you. No risk - the only way to
                lose is to not start.
              </p>
            </motion.div>

            {/* ── Trust strip ───────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mb-4"
            >
              <p className="text-center text-xs font-semibold text-[#3D3D3D] mb-2">
                Built with menopause clinicians · grounded in published research
              </p>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-[#9A9A9A]">
                <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-green-600" /> No charge today</span>
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Cancel anytime</span>
                <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-green-600" /> Your data stays private</span>
              </div>
            </motion.div>

          </motion.div>

          {/* Fixed bottom CTA -> paywall */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
              {(() => {
                const cta = getCtaCopy();
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhase("paywall")}
                      className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                      style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
                    >
                      {getDiagnosisCtaLabel(qualifier)}
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
                      ? "Enter your email so we can save your plan - so you don't lose it. We'll send a 6-digit code, no password."
                      : "Enter your email so we can save your score and free plan - so you don't lose it. We'll send a 6-digit code, no password."}
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
          onBack={fromQuiz1 ? undefined : () => setPhase("diagnosis")}
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
              <motion.div
                initial={{ opacity: 0, y: -40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: prefersReducedMotion ? 0 : 0.6,
                  type: "spring",
                  stiffness: 320,
                  damping: 22,
                }}
                className="inline-block mb-2 rounded-full bg-primary/10 border border-primary/20 px-3.5 py-1.5 shadow-sm"
              >
                <p className="text-xs sm:text-sm font-medium text-primary">
                  If you don&apos;t feel like yourself lately, you&apos;re not imagining it.
                </p>
              </motion.div>
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
              {REWARD_STEPS.includes(currentStep)
                ? "Quick win"
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
                <div className={`shrink-0 flex justify-center ${currentStep === "q8_name" ? "mb-1" : "mb-2 sm:mb-3"}`}>
                  <Image
                    src={`/quiz/${QUIZ_ILLUSTRATION[currentStep]}`}
                    alt=""
                    width={320}
                    height={currentStep === "q8_name" ? 200 : 160}
                    className={`object-contain w-full ${currentStep === "q8_name" ? "max-h-[180px] sm:max-h-[220px]" : "max-h-[120px] sm:max-h-40"}`}
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
                              priority
                              className="object-cover"
                            />
                            {isSelected && <div className="absolute inset-0 bg-primary/15" />}
                          </div>
                          <div className={`${TILE_FOOTER_BASE} justify-between gap-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className={TILE_LABEL}>{option.label}</span>
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
                          <div className={`${TILE_FOOTER_BASE} justify-between gap-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className={TILE_LABEL}>{option.label}</span>
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-white/70" />
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
                            <div className={`${TILE_FOOTER_BASE} ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                              <span className={TILE_LABEL}>{option.label}</span>
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
                            <div className={`${TILE_FOOTER_BASE} ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                              <span className={TILE_LABEL}>{option.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Reward 1: mirror her #1 symptom back as a prevalence stat ("you're not alone, and it's biology"). */}
              {currentStep === "reward_symptoms" && (() => {
                const topSymptom = topProblems[0];
                const prevalence = SYMPTOM_PREVALENCE[topSymptom] ?? 70;
                const symptomLabel = (SYMPTOM_LABELS[topSymptom] || "these symptoms").toLowerCase();
                const cohort = COHORT_PHRASE[hereFor] ?? "women your age";
                const chips = topProblems.filter((id) => SYMPTOM_IMAGE[id]).slice(0, 3);
                return (
                  <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                    {/* Illustration springs in over a soft pulsing glow */}
                    <motion.div
                      className="relative"
                      initial={{ scale: 0, rotate: -12, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 13, delay: 0.05 }}
                    >
                      {!prefersReducedMotion && (
                        <motion.div
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
                          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.4, 0.7, 0.4] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      <Image
                        src="/quiz/rewards/reward1.png"
                        alt=""
                        width={320}
                        height={320}
                        priority
                        className="relative w-36 h-36 sm:w-44 sm:h-44 object-contain"
                      />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                      className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground"
                    >
                      What your answers tell us
                    </motion.p>

                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 14, delay: 0.4 }}
                    >
                      <CountUpNumber
                        value={prevalence}
                        suffix="%"
                        className="block text-6xl font-black text-primary leading-none"
                      />
                      <span className="block text-sm sm:text-base font-normal text-[#5A5A5A] mt-3 max-w-xs mx-auto leading-snug">
                        of {cohort} feel <span className="font-bold text-[#3D3D3D]">{symptomLabel}</span> too - just like you.
                      </span>
                    </motion.div>

                    {chips.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2">
                        {chips.map((id, i) => (
                          <motion.div
                            key={id}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 16, delay: 0.7 + i * 0.12 }}
                            className="flex flex-col items-center gap-1 w-16"
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#E8DDD9] shadow-sm">
                              <Image
                                src={SYMPTOM_IMAGE[id]}
                                alt={SYMPTOM_LABELS[id] || id}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-[9px] leading-tight text-[#9A9A9A] text-center">
                              {SYMPTOM_LABELS[id] || id}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.95, duration: 0.45 }}
                      className="w-full max-w-xs rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm sm:text-base font-semibold text-[#3D3D3D] leading-snug"
                    >
                      <span className="font-bold">You&apos;re not broken.</span> This is your{" "}
                      <span className="font-bold">biology</span> talking - and it&apos;s <span className="font-bold">workable</span>.
                    </motion.p>
                  </div>
                );
              })()}

              {/* Reward 2: one fact (the 6-year wait) + one personal win (timing-keyed pride). No overlap. */}
              {currentStep === "reward_progress" && (() => {
                const pride = TIMING_PRIDE_LINE[timing] ?? "You're finally putting yourself first - that takes strength.";
                return (
                  <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4">
                    <motion.div
                      className="relative"
                      initial={{ scale: 0, rotate: 12, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 13, delay: 0.05 }}
                    >
                      {!prefersReducedMotion && (
                        <motion.div
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
                          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.4, 0.7, 0.4] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                      <Image
                        src="/quiz/rewards/reward2.png"
                        alt=""
                        width={320}
                        height={320}
                        priority
                        className="relative w-36 h-36 sm:w-44 sm:h-44 object-contain"
                      />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, duration: 0.4 }}
                      className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground"
                    >
                      What most women don&apos;t know
                    </motion.p>

                    <motion.div
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 14, delay: 0.4 }}
                    >
                      <CountUpNumber
                        value={6}
                        suffix=" years"
                        className="block text-6xl font-black text-primary leading-none"
                      />
                      <span className="block text-sm sm:text-base font-normal text-[#5A5A5A] mt-3 max-w-xs mx-auto leading-snug">
                        is how long the average woman waits before getting <span className="font-bold text-[#3D3D3D]">real menopause support</span>.
                      </span>
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7, duration: 0.45 }}
                      className="w-full max-w-xs rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm sm:text-base font-semibold text-[#3D3D3D] leading-snug"
                    >
                      {pride}
                    </motion.p>
                  </div>
                );
              })()}

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
                          <div className={`${TILE_FOOTER_BASE} justify-between gap-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className={TILE_LABEL}>{option.label}</span>
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
                          <div className={`${TILE_FOOTER_BASE} justify-between gap-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className={TILE_LABEL}>{option.label}</span>
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
                          <div className={`${TILE_FOOTER_BASE} justify-between gap-1.5 ${isSelected ? "bg-primary" : "bg-[#2a2a2a]"}`}>
                            <span className={TILE_LABEL}>{option.label}</span>
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
                {REWARD_STEPS.includes(currentStep) || stepIndex === STEPS.length - 1 ? "Continue" : "Next"}
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
