 
"use client";

import React, { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import {
  getAccountState,
  stateAllowsAccess,
  TRIAL_SELECT_COLS,
} from "@/lib/getAccountState";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import { cn } from "@/lib/utils";
import { APP_STORE_URL, PLAY_STORE_URL, WEB_APP_ENABLED } from "@/lib/constants";
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
  MessageCircleHeart,
  Activity,
  Footprints,
  Wind,
  PartyPopper,
  Lock,
  Salad,
  Beef,
  Nut,
  Wheat,
  Apple,
  Timer,
  Hourglass,
  Ban,
  Droplets,
  Pill,
} from "lucide-react";
import OtpForm from "@/components/auth/OtpForm";
import { PaywallView } from "@/components/PaywallView";
import MetaPurchaseTracker from "@/components/MetaPurchaseTracker";
import { META_FUNNEL_STEPS } from "@/lib/metaPixel";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_ID,
  PLAN_PRICE,
  PLAN_WEEKS,
  formatPrice,
} from "@/lib/pricing";
import { trackFunnelStep } from "@/lib/metaPixelClient";
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
  q8_name: "illustration_q8_name.webp",
  loading: "illustration_loading.webp",
};


type Step =
  | "q1_age"
  | "q_height"
  | "q_weight"
  | "q_fitness"
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
  "q_fitness",
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
  { id: "under_40", label: "Under 40", image: "/quiz/age/u40.webp" },
  { id: "40_45", label: "40–45", image: "/quiz/age/41-45.webp" },
  { id: "46_50", label: "46–50", image: "/quiz/age/46-50.webp" },
  { id: "51_plus", label: "50+", image: "/quiz/age/a50.webp" },
];

const HERE_FOR_OPTIONS = [
  { id: "pre_menopausal", label: "Pre-menopausal (not started)", image: "/quiz/status/pre.webp" },
  { id: "perimenopausal", label: "Perimenopausal", image: "/quiz/status/peri.webp" },
  { id: "post_menopausal", label: "Post-menopausal (periods stopped)", image: "/quiz/status/post.webp" },
  { id: "not_sure", label: "I'm not sure", image: "/quiz/status/notsure.webp" },
];

const GOAL_OPTIONS = [
  { id: "sleep_through_night", label: "Sleep through the night", image: "/quiz/goals/sleep.webp" },
  { id: "think_clearly", label: "Think clearly again", image: "/quiz/goals/thinkclearly.webp" },
  { id: "feel_like_myself", label: "Mental and emotional wellbeing", image: "/quiz/goals/feelmyself.webp" },
  { id: "data_for_doctor", label: "Have data for my doctor", image: "/quiz/goals/data.webp" },
  // id kept as `get_body_back` on purpose - existing user_profiles rows and the
  // mobile app still carry it; only the copy/image moved to weight loss.
  { id: "get_body_back", label: "Lose weight", image: "/quiz/goals/weight.webp" },
];

// Image-based symptom tiles (same style as Q1 age / Q2 status). 9 options, multi-select.
// IDs reuse the existing downstream keys (SYMPTOM_LABELS, pillars, comparison) so results keep working.
const PROBLEM_OPTIONS = [
  { id: "hot_flashes", label: "Hot flashes", image: "/symptoms/hot_flashes.webp" },
  { id: "sleep_issues", label: "Can't sleep", image: "/symptoms/insomnia.webp" },
  { id: "brain_fog", label: "Brain fog", image: "/symptoms/brain_fog.webp" },
  { id: "mood_swings", label: "Mood swings", image: "/symptoms/mood_swings.webp" },
  { id: "weight_changes", label: "Weight changes", image: "/symptoms/weight_gain.webp" },
  { id: "low_energy", label: "Fatigue", image: "/symptoms/fatigue.webp" },
  { id: "anxiety", label: "Anxiety", image: "/symptoms/anxiety.webp" },
  { id: "joint_pain", label: "Joint pain", image: "/symptoms/joint_pain.webp" },
  { id: "bloating", label: "Bloating", image: "/symptoms/bloating.webp" },
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
  { id: "just_started", label: "Under 6 months", image: "/quiz/how-long/u6m.webp" },
  { id: "been_while", label: "6–12 months", image: "/quiz/how-long/6to12m.webp" },
  { id: "over_year", label: "Over a year", image: "/quiz/how-long/o1y.webp" },
  { id: "several_years", label: "Several years", image: "/quiz/how-long/severaly.webp" },
];

const HRT_OPTIONS = [
  { id: "currently", label: "I am currently taking HRT", image: "/quiz/hrt/current.webp" },
  { id: "past", label: "I have taken HRT in the past", image: "/quiz/hrt/past.webp" },
  { id: "never", label: "I have never taken HRT", image: "/quiz/hrt/never.webp" },
];

// Asked right after height/weight so the whole body block sits together, and it
// feeds the movement side of her plan (plus the "Lose weight" goal).
const FITNESS_OPTIONS = [
  { id: "beginner", label: "Beginner", image: "/quiz/fitness/beginner.webp" },
  { id: "medium", label: "Medium", image: "/quiz/fitness/medium.webp" },
  { id: "advanced", label: "Advanced", image: "/quiz/fitness/advanced.webp" },
  { id: "movement_snacks", label: "Movement Snacks", image: "/quiz/fitness/movement-snacks.webp" },
];

const QUALIFIER_OPTIONS = [
  { id: "ready_to_act", label: "Ready to start", image: "/quiz/readiness/ready.webp" },
  { id: "exploring", label: "Still figuring it out", image: "/quiz/readiness/figuring.webp" },
  { id: "understand_first", label: "Just learning for now", image: "/quiz/readiness/learning.webp" },
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
  reward_symptoms: ["/quiz/rewards/reward1.webp"],
  reward_progress: ["/quiz/rewards/reward2.webp"],
  q_fitness: FITNESS_OPTIONS.map((o) => o.image),
  q5_hrt: HRT_OPTIONS.map((o) => o.image),
  q6_how_long: TIMING_OPTIONS.map((o) => o.image),
  q7_qualifier: QUALIFIER_OPTIONS.map((o) => o.image),
  q8_name: [`/quiz/${QUIZ_ILLUSTRATION.q8_name}`],
};

// Screenshots of the plan itself - the daily task list and one shot per pillar.
// These masters don't exist yet; flip PLAN_SHOTS_READY once they're in
// assets/diagnosys/ and `npm run optimize-images` has run. Until then the plan
// block renders complete without them rather than requesting broken images.
const PLAN_SHOTS_READY = false;
const PLAN_SHOTS = {
  day: "/diagnosys/plan_day.webp",
  movement: "/diagnosys/movement.webp",
  nutrition: "/diagnosys/nutrition.webp",
  relaxation: "/diagnosys/relaxation.webp",
};

// Real app screenshots used on the diagnosis step. Preloaded while she reads her
// results so the phone shots are already cached and don't pop in one by one.
const DIAGNOSIS_SHOTS = [
  "/diagnosys/8week.webp",
  ...(PLAN_SHOTS_READY ? Object.values(PLAN_SHOTS) : []),
  "/diagnosys/symptoms1.webp",
  "/diagnosys/insights.webp",
  "/diagnosys/chat.webp",
];

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

type Phase = "quiz" | "calculating" | "email" | "results" | "diagnosis" | "relief" | "nutrition" | "paywall" | "download";


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

// Bolded fragments carry the whole message when she skims: the count, the cost,
// and the turn. The connective tissue between them stays light on purpose.
const PainEmphasis = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-bold text-[#3D3D3D]">{children}</strong>
);

const getSeverityPainText = (
  severity: string,
  symptomCount: number,
  name: string
): React.ReactNode => {
  const displayName = name || "you";
  const symptomWord = symptomCount === 1 ? "symptom" : "symptoms";
  const theseThis = symptomCount === 1 ? "this" : "these";
  const themIt = symptomCount === 1 ? "it" : "them";
  const theyIt = symptomCount === 1 ? "it" : "they";
  const count = (
    <PainEmphasis>
      {symptomCount} {symptomWord}
    </PainEmphasis>
  );
  switch (severity) {
    case "severe":
      return (
        <>
          {count} <PainEmphasis>controlling your life</PainEmphasis>. You&apos;ve probably tried to
          explain it to people who don&apos;t get it. You&apos;ve probably wondered if this is just
          your new normal. <PainEmphasis>It&apos;s not.</PainEmphasis> And {displayName}, you
          don&apos;t have to keep living like this.
        </>
      );
    case "moderate":
      return (
        <>
          {count}. Affecting your <PainEmphasis>work</PainEmphasis>. Your{" "}
          <PainEmphasis>mood</PainEmphasis>. Your <PainEmphasis>relationships</PainEmphasis>.{" "}
          {displayName}, you&apos;re spending so much energy just trying to function normally -{" "}
          <PainEmphasis>energy you shouldn&apos;t have to spend</PainEmphasis>.
        </>
      );
    case "mild":
    default:
      return (
        <>
          {displayName}, {theseThis} {count} might feel manageable now. But without understanding
          what&apos;s causing {themIt}, {theyIt}{" "}
          <PainEmphasis>often get{symptomCount === 1 ? "s" : ""} worse</PainEmphasis>. Let&apos;s
          figure this out <PainEmphasis>before {theyIt} {symptomCount === 1 ? "does" : "do"}</PainEmphasis>.
        </>
      );
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

// Doorstep to the paywall, so the full risk reversal belongs HERE. There is no
// free trial to lean on now, so the guarantee carries it - stated with its
// adherence condition, since a one-line teaser that promises more than the
// guarantee card two screens later is how a refund argument starts.
function getCtaCopy(): { sub: string } {
  return {
    sub: `${formatPrice(PLAN_PRICE)} for ${PLAN_WEEKS} weeks · follow ${PLAN_ADHERENCE_PCT}% or get refunded · cancel anytime.`,
  };
}
// First-person CTA label driven by her #1 goal (multi-select; first = primary).
const GOAL_CTA_LABEL: Record<string, string> = {
  sleep_through_night: "I want to sleep again",
  think_clearly: "I want to think clearly again",
  feel_like_myself: "I want to feel steady again",
  understand_patterns: "I want to understand my body", // legacy: retired option
  data_for_doctor: "I want answers for my doctor",
  get_body_back: "I want to lose the weight",
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
  feel_like_myself: "Feel calm and steady again",
  understand_patterns: "Understand your body", // legacy: retired option
  data_for_doctor: "Walk into your doctor with real answers",
  get_body_back: "Lose the weight",
};
function getOfferPromise(goals: string[]): string {
  return GOAL_PROMISE[goals[0]] ?? "Feel like yourself again";
}

// ─── Relief exercise: paced breathing between diagnosis and paywall ─────────
// One thing that works, done by her, before she's ever asked for money. The
// exhale is longer than the inhale on purpose - that asymmetry is what shifts
// the nervous system, and it's the pattern clinicians hand out for hot flashes.
// A full cycle is 12s (in 4, hold 2, out 6) - hence the tool's name below.
//
// `ease` shapes each step so the circle moves like lungs, not like a slider:
//   in   - fills fast at first, then eases into the top as the chest resists
//   hold - drifts back a hair (1.35 -> 1.32); a real hold settles, it doesn't freeze
//   out  - hesitates, releases, then lands softly at rest
// `glow` is the halo's opacity for that step, so the blur breathes with her
// instead of pulsing on its own unrelated loop.
const BREATH_SEQUENCE = [
  { key: "in", label: "Breathe in", seconds: 4, scale: 1.35, glow: 0.72, ease: [0.22, 0.45, 0.32, 1] },
  { key: "hold", label: "Hold", seconds: 2, scale: 1.32, glow: 0.66, ease: [0.4, 0, 0.6, 1] },
  { key: "out", label: "Breathe out", seconds: 6, scale: 1, glow: 0.32, ease: [0.5, 0.03, 0.35, 1] },
] as const;
const BREATH_ROUNDS = 3;
const BREATH_CYCLE_SECONDS = BREATH_SEQUENCE.reduce((sum, b) => sum + b.seconds, 0); // 12
const BREATH_TOTAL_SECONDS = BREATH_CYCLE_SECONDS * BREATH_ROUNDS; // 36

// ─── The toolkit: one ordered list, unlocked one entry at a time ────────────
// Both app-taste steps render this same stack - breathing unlocks #1, the
// nutrition checklist unlocks #2 - so she watches the bar move 25% -> 50% and
// arrives at the paywall halfway through a set she started herself.
//
// Entries 1-3 are the three daily pillars of the habit tracker (relaxation,
// nutrition, movement); #4 is the layer around them. Every entry has to exist
// in the product - this is a preview, not a feature list.
const RELIEF_TOOLKIT_SIZE = 4;
// Also the caption under the breathing circle, so the tool is named the same
// before she uses it and after she keeps it.
const RELIEF_TOOL_NAME = "Breathing exercise";

type ReliefTool = { name: string; use: string };

function getToolkit(topProblems: string[]): ReliefTool[] {
  return [
    {
      name: RELIEF_TOOL_NAME,
      use: getUnlockedToolUse(topProblems),
    },
    {
      name: "Nutrition checklist",
      use: "The 9 daily habits that steady your hormones",
    },
    {
      name: `Exercises for ${getSymptomPhrase(topProblems)}`,
      use: "Targeted routines for what you picked",
    },
    {
      name: "Tracking & knowledge",
      use: "Log how you feel, understand why",
    },
  ];
}

// "For hot flashes - anywhere, no equipment". Her #1 symptom, so the tool she
// keeps is labelled with the thing she came here for.
function getUnlockedToolUse(topProblems: string[]): string {
  const first = topProblems[0];
  const label = first ? (SYMPTOM_LABELS[first] || first).toLowerCase() : "";
  return label ? `For ${label} - anywhere, no equipment` : "Anywhere, no equipment";
}

// Confetti for the finish moment. Precomputed (not random) so the burst is
// identical every time and never re-shuffles on a re-render.
const CONFETTI_BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const distance = 78 + (i % 3) * 22;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    color: ["#ff74b1", "#ffeb76", "#65dbff"][i % 3],
  };
});

// Her symptoms as a natural lowercase phrase: "hot flashes, sleep issues and brain fog".
// Capped at 3 so the sentence stays readable.
function getSymptomPhrase(topProblems: string[]): string {
  const names = topProblems.slice(0, 3).map((id) => (SYMPTOM_LABELS[id] || id).toLowerCase());
  if (names.length === 0) return "your symptoms";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Neither diagnosis nor relief is the doorstep to the paywall any more - the
// nutrition checklist is. Both of these steps get pure forward motion, and
// getCtaCopy()'s price + guarantee line lives on the nutrition CTA, where the
// commitment actually happens. Each promises the next step is short, because
// the only thing standing between her and the plan now is two small screens.
// She's read a long page and her guard is up: the next tap feels like the one
// that costs her something. So the line names what the next screen is NOT
// (a pitch, a form, a charge) before it names what it is.
function getDiagnosisForwardCopy(): { sub: React.ReactNode } {
  return { sub: "Not a pitch - 36 seconds of relief you can use tonight." };
}

// The relief screen ends on the toolkit at 1 of 4, with three still locked - so
// the next tap is named as the thing that moves that bar, not as a preview of
// something ("my day") the next screen never actually shows her.
function getReliefForwardCopy(): { sub: React.ReactNode } {
  return { sub: "9 quick taps about today - no wrong answers." };
}

// ─── Nutrition checklist: the second app taste ──────────────────────────────
// She ticks what she already did today. The breathing exercise gave her a win;
// this one shows her the standard, measures her against it, and then removes
// the shame - the gap is structural, not personal. Ticking it is also the
// fastest way to teach what a hormone-steady day looks like: a product demo
// wearing a question. Nothing here is persisted - it's a taste, not intake.
//
// Array order is priority order (highest-leverage habit first), because the
// reward screen reuses it to pick her "first 3 swaps" from what she left blank.
// IDs are the contract with the mobile habit tracker - see docs/plan/pillars.md.
type NutritionItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
type NutritionGroup = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NutritionItem[];
};

const NUTRITION_GROUPS: NutritionGroup[] = [
  {
    title: "Meals & nutrients",
    icon: Salad,
    items: [
      { id: "protein_25_30g", label: "25-30g protein per meal", icon: Beef },
      { id: "healthy_fats", label: "Healthy fats", icon: Nut },
      { id: "high_fiber", label: "Added high-fiber foods", icon: Wheat },
      { id: "low_gi_fruit", label: "Low-glycemic fruits only", icon: Apple },
    ],
  },
  {
    title: "Timing & fasting",
    icon: Timer,
    items: [
      { id: "gap_5h", label: "5 hours between meals", icon: Timer },
      { id: "fast_12h", label: "12-hour fasting window", icon: Hourglass },
      { id: "no_snacking", label: "No snacking between meals", icon: Ban },
    ],
  },
  {
    title: "Hydration & supplements",
    icon: Droplets,
    items: [
      { id: "water_6", label: "Drank 6+ glasses of water", icon: Droplets },
      { id: "supplements", label: "Daily supplements taken", icon: Pill },
    ],
  },
];

const NUTRITION_ITEMS: NutritionItem[] = NUTRITION_GROUPS.flatMap((g) => g.items);
const NUTRITION_TOTAL = NUTRITION_ITEMS.length; // 9

// Revealed under the supplements row once it's ticked. Deliberately excluded
// from the score - they're here to name the three that matter, not to inflate
// her count.
const SUPPLEMENT_OPTIONS = [
  { id: "omega3", label: "Omega-3" },
  { id: "magnesium", label: "Magnesium" },
  { id: "d3k2", label: "Vitamin D3 + K2" },
];

// Every tier has to land on "you need the plan" - but for opposite reasons, and
// none of them may shame her. Low scores get easy wins; high scores get the
// reframe that matters most, because a woman already doing 8 of 9 has concluded
// she's tried everything. Naming her own symptoms back to her turns her
// diligence into the argument: effort was never the missing piece.
function getNutritionVerdict(
  count: number,
  name: string,
  topProblems: string[]
): { headline: string; body: React.ReactNode } {
  const suffix = name ? `, ${name}` : "";
  const missing = NUTRITION_TOTAL - count;

  if (count === 0) {
    return {
      headline: `Clean slate${suffix}.`,
      body: (
        <>
          Nothing on this list yet - which means all {NUTRITION_TOTAL} of these are easy wins still
          sitting on the table. Most women start exactly here.
        </>
      ),
    };
  }
  if (count <= 3) {
    return {
      headline: `${count} of ${NUTRITION_TOTAL}${suffix}.`,
      body: (
        <>
          You&apos;re already doing {count} without anyone telling you to. The other {missing} are
          the ones that move insulin, estrogen and sleep - and they&apos;re what Lisa hands you, one
          day at a time.
        </>
      ),
    };
  }
  if (count <= 6) {
    return {
      headline: `${count} of ${NUTRITION_TOTAL} - over halfway.`,
      body: (
        <>
          You&apos;re not doing this wrong, and you&apos;re not lazy. You&apos;re missing{" "}
          <span className="font-bold text-[#3D3D3D]">structure, not effort</span>. That&apos;s the
          part we build for you.
        </>
      ),
    };
  }
  return {
    headline: `${count} of ${NUTRITION_TOTAL}. You're doing almost everything right.`,
    body: (
      <>
        And you still have{" "}
        <span className="font-bold text-[#3D3D3D]">{getSymptomPhrase(topProblems)}</span>. That&apos;s
        the proof this was never about willpower - your hormones changed the rules, so your plan has
        to change with them.
      </>
    ),
  };
}

const REFERRAL_STORAGE_KEY = "pending_referral_code";




// ─── Diagnosis: personalized before/after transformations ───────────────────
// Each image in /public/testimonials is one side-by-side shot: left = the hard
// "before", right = the calmer "after". Keyed by PROBLEM_OPTIONS ids so the cards
// shown match the symptoms she actually selected.
// The "after" side is deliberately a *feeling*, not a piece of knowledge. The
// guarantee she reads two blocks later promises she'll feel better, so an after
// column that only promises understanding undercuts the offer it sits above.
type SymptomTransform = { image: string; label: string; before: string; after: string };
const SYMPTOM_TRANSFORM: Record<string, SymptomTransform> = {
  hot_flashes:    { image: "/testimonials/hot_flashes.webp", label: "Hot flashes",    before: "Drenched, sleepless nights",        after: "Sleeping through, dry and cool" },
  sleep_issues:   { image: "/testimonials/sleep.webp",       label: "Sleep",          before: "Tossing and turning till 3am",      after: "Falling asleep and staying there" },
  brain_fog:      { image: "/testimonials/brain_fog.webp",   label: "Brain fog",      before: "Losing your train of thought",      after: "Words arriving when you need them" },
  mood_swings:    { image: "/testimonials/mood_swings.webp", label: "Mood swings",    before: "Snapping at the people you love",   after: "Feeling steady around the people you love" },
  weight_changes: { image: "/testimonials/weight_gain.webp", label: "Weight changes", before: "Nothing fitting like it used to",   after: "Your clothes fitting the way they should" },
  low_energy:     { image: "/testimonials/fatigue.webp",     label: "Fatigue",        before: "Running on empty by midday",        after: "Still having something left at 4pm" },
  anxiety:        { image: "/testimonials/anxiety.webp",     label: "Anxiety",        before: "A constant, low hum of worry",      after: "A quiet chest and a calmer day" },
  joint_pain:     { image: "/testimonials/joint_pain.webp",  label: "Joint pain",     before: "Stiff, aching mornings",            after: "Getting out of bed without bracing" },
  bloating:       { image: "/testimonials/bloating.webp",    label: "Bloating",       before: "Heavy and uncomfortable",           after: "Light and comfortable after meals" },
};

/** Her selected symptoms that have a before/after image (capped, original order). */
function getSymptomTransforms(topProblems: string[], n = 3): SymptomTransform[] {
  return topProblems
    .filter((id) => SYMPTOM_TRANSFORM[id])
    .slice(0, n)
    .map((id) => SYMPTOM_TRANSFORM[id]);
}

// ─── The plan: what she actually buys ───────────────────────────────────────
// The four daily task areas the mobile app builds her 8-week plan from. This is
// the offer's mechanism - "track your symptoms" never explained how anyone gets
// better, and the diagnosis screen is the Reason stage, so the plan has to be
// the thing the page is about.
const PLAN_PILLARS = [
  { key: "movement",   label: "Movement",    icon: Footprints,   tint: "text-sky-500",     blurb: "A routine that matches your level, not a gym program" },
  { key: "nutrition",  label: "Nutrition",   icon: Salad,        tint: "text-emerald-500", blurb: "The daily swaps that steady your hormones" },
  { key: "relaxation", label: "Relaxation",  icon: Wind,         tint: "text-violet-500",  blurb: "Breathing and wind-downs you can do anywhere" },
  { key: "habits",     label: "Your habits", icon: CheckCircle2, tint: "text-primary",     blurb: "The few small things that hold the rest together" },
] as const;

// The 8-week arc, so the plan reads as a designed progression rather than a
// to-do list she has to keep up forever.
const PLAN_ARC = [
  { weeks: "Week 1–2", label: "Steady the basics" },
  { weeks: "Week 3–5", label: "Build on what works" },
  { weeks: "Week 6–8", label: "Lock it in" },
] as const;

// What her plan actually does about each symptom she picked, one line per pillar.
// Nutrition and relaxation lines reuse the tracker's own vocabulary (see
// docs/plan/pillars.md) so the funnel doesn't teach her one set of
// words and the app greet her with another.
type SymptomPlan = { movement: string; nutrition: string; relaxation: string; habits: string };
const SYMPTOM_PLAN: Record<string, SymptomPlan> = {
  hot_flashes: {
    movement: "Low-impact strength, 3× a week",
    nutrition: "Cut the spikes — sugar, alcohol, late caffeine",
    relaxation: "4-2-6 breathing the moment one starts",
    habits: "Cool the room before bed",
  },
  sleep_issues: {
    movement: "Move in the morning, nothing hard after 7pm",
    nutrition: "Fat & protein at breakfast, 12-hour fasting window",
    relaxation: "A 10-minute wind-down before lights out",
    habits: "Same wake time, daylight within 30 minutes",
  },
  brain_fog: {
    movement: "A daily walk — blood flow before focus",
    nutrition: "Fat & protein at breakfast, no snacking",
    relaxation: "One reset between tasks, not after the crash",
    habits: "Hardest task in your clearest hour",
  },
  mood_swings: {
    movement: "Steady cardio on the days it builds",
    nutrition: "Fat & protein with every meal, 5 hours between",
    relaxation: "Paced breathing before you respond",
    habits: "Name the trigger before the day ends",
  },
  weight_changes: {
    movement: "Strength 3× a week — muscle is the lever now",
    nutrition: "Low-glycemic fruit only, 12-hour fasting window",
    relaxation: "An evening reset — cortisol drives the middle",
    habits: "Weigh weekly, not daily",
  },
  low_energy: {
    movement: "Short and early, never to exhaustion",
    nutrition: "Fat & protein at breakfast, 6+ glasses of water",
    relaxation: "A real 10-minute pause instead of a third coffee",
    habits: "One 20-minute break, actually booked",
  },
  anxiety: {
    movement: "20 minutes walking, outdoors",
    nutrition: "No blood-sugar crashes — fat & protein every meal",
    relaxation: "4-2-6 breathing twice a day, not only in the spike",
    habits: "Caffeine cut-off at noon",
  },
  joint_pain: {
    movement: "Mobility first, then light strength",
    nutrition: "Omega-3 daily, added high-fiber foods",
    relaxation: "An evening stretch and body scan",
    habits: "Move every hour you sit",
  },
  bloating: {
    movement: "A 10-minute walk after meals",
    nutrition: "Add high-fiber foods slowly, no snacking between meals",
    relaxation: "Slow breathing before you eat",
    habits: "Water first thing, 6+ by evening",
  },
};

/** Her worst symptoms first, capped, and only the ones the plan has copy for. */
function getPlannedSymptoms(
  topProblems: string[],
  symptomSeverity: Record<string, number>,
  n = 2
): { id: string; label: string; plan: SymptomPlan }[] {
  return [...topProblems]
    .filter((id) => SYMPTOM_PLAN[id])
    .sort((a, b) => (symptomSeverity[b] ?? 0) - (symptomSeverity[a] ?? 0))
    .slice(0, n)
    .map((id) => ({ id, label: SYMPTOM_LABELS[id] || id, plan: SYMPTOM_PLAN[id] }));
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

// Marker-pen sweep behind a word - the same highlight the diagnosis headline
// uses, reused wherever a line carries the offer. Pass `active` to drive it from
// a timer; leave it off and it sweeps when the line scrolls into view.
function HighlightSweep({
  children,
  active,
  variant = "primary",
}: {
  children: React.ReactNode;
  active?: boolean;
  variant?: "primary" | "green";
}) {
  const prefersReducedMotion = useReducedMotion();
  const controlled = active !== undefined;
  const on = !prefersReducedMotion && (controlled ? active : true);
  const sweep = {
    className: cn(
      "absolute inset-0 rounded-sm pointer-events-none px-0.5",
      variant === "green" ? "bg-green-500/20" : "bg-primary/20"
    ),
  };

  return (
    <span className="relative inline-block">
      <span className={cn("relative z-10", variant === "green" ? "text-green-700" : "text-primary")}>
        {children}
      </span>
      {controlled ? (
        <motion.span
          {...sweep}
          initial={{ scaleX: 0, transformOrigin: "left" }}
          animate={on ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ zIndex: 0, willChange: on ? "transform" : "auto" }}
        />
      ) : (
        <motion.span
          {...sweep}
          initial={{ scaleX: 0, transformOrigin: "left" }}
          whileInView={on ? { scaleX: 1 } : { scaleX: 0 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
          style={{ zIndex: 0 }}
        />
      )}
    </span>
  );
}

// The reward stack both app-taste steps end on: what she keeps, then what she
// doesn't have yet, then how far through the set she is. Felt first, read
// second. The bar animates *from* the previous state rather than from zero, so
// on the second step she sees it physically move 25% -> 50%.
function ToolkitStack({
  unlockedCount,
  topProblems,
}: {
  unlockedCount: number;
  topProblems: string[];
}) {
  const prefersReducedMotion = useReducedMotion();
  const toolkit = getToolkit(topProblems);
  const unlocked = toolkit.slice(0, unlockedCount);
  const locked = toolkit.slice(unlockedCount);

  return (
    <div className="w-full max-w-xs space-y-2">
      {unlocked.map((tool, i) => (
        <motion.div
          key={tool.name}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 260, damping: 16, delay: 0.55 + i * 0.09 }
          }
          className="flex items-start gap-3 rounded-2xl bg-primary/5 border-2 border-primary/30 px-4 py-3 text-left"
        >
          <div className="mt-0.5 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#3D3D3D] leading-tight">{tool.name}</p>
            <p className="text-xs text-[#5A5A5A] leading-snug">{tool.use}</p>
            <p className="text-[11px] font-semibold text-primary mt-0.5">Yours to keep</p>
          </div>
        </motion.div>
      ))}

      {/* Locked stack, fading out at the bottom so it reads as "there's more". */}
      <div className="relative space-y-2">
        {locked.map((tool, i) => (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.09, duration: 0.35 }}
            className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-2.5 text-left"
          >
            <div className="w-6 h-6 rounded-full bg-foreground/5 flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5 text-[#9A9A9A]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#8A8A8A] leading-tight truncate">
                {tool.name}
              </p>
              <p className="text-[11px] text-[#B0B0B0] leading-snug truncate">{tool.use}</p>
            </div>
          </motion.div>
        ))}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-linear-to-t from-background to-transparent"
        />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.4 }}
        className="pt-1 space-y-1.5"
      >
        <div className="flex items-baseline justify-between text-[11px]">
          <span className="font-semibold text-[#3D3D3D]">
            {unlockedCount} of {RELIEF_TOOLKIT_SIZE} unlocked
          </span>
          <span className="text-[#9A9A9A]">
            +{RELIEF_TOOLKIT_SIZE - unlockedCount} more in your plan
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-primary/15 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={{ width: `${((unlockedCount - 1) / RELIEF_TOOLKIT_SIZE) * 100}%` }}
            animate={{ width: `${(unlockedCount / RELIEF_TOOLKIT_SIZE) * 100}%` }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { delay: 1.05, duration: 0.7, ease: "easeOut" }
            }
          />
        </div>
      </motion.div>
    </div>
  );
}

// A real app screenshot shown as physical evidence: phone-framed, tilted a few
// degrees and cropped by its stage so it reads as a photo of the product rather
// than a flat asset. Always paired with <ShotStage />, which does the clipping.
function PhoneShot({
  src,
  alt,
  rotate = 0,
  delay = 0,
  className,
}: {
  src: string;
  alt: string;
  rotate?: number;
  delay?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={
        prefersReducedMotion
          ? { opacity: 1, y: 0, rotate }
          : { opacity: 0, y: 26, rotate: rotate * 0.25 }
      }
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "shrink-0 rounded-[1.4rem] bg-white p-[3px] ring-1 ring-black/5 shadow-[0_16px_36px_-10px_rgba(61,61,61,0.45)]",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={1080}
        height={2192}
        sizes="(max-width: 480px) 55vw, 260px"
        className="w-full h-auto rounded-[1.25rem]"
      />
    </motion.div>
  );
}

/** Tinted stage that crops the phones at the bottom, so they peek in rather than
    dominate the card. `fadeFrom` should match the surface underneath. */
function ShotStage({
  children,
  className,
  fadeFrom = "from-card",
}: {
  children: React.ReactNode;
  className?: string;
  fadeFrom?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-linear-to-br from-primary/12 via-[#ffeb76]/12 to-info/12",
        className
      )}
    >
      <div className="flex items-start justify-center gap-2 px-4 pt-5">{children}</div>
      <div
        className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent", fadeFrom)}
      />
    </div>
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
    // Dev-only: preview the diagnosis / relief / nutrition steps directly without finishing the quiz.
    if (
      (phaseParam === "diagnosis" || phaseParam === "relief" || phaseParam === "nutrition") &&
      process.env.NODE_ENV === "development"
    ) {
      return phaseParam;
    }
    return "quiz";
  });
  // Ad-funnel step 1: the quiz is actually in front of her. Guarded on the quiz
  // phase so Stripe's ?phase=paywall|download returns and middleware bounces
  // don't register as starts, leaving a true count of women who saw a first
  // question.
  useEffect(() => {
    if (phase !== "quiz") return;
    trackFunnelStep(META_FUNNEL_STEPS.quizStart);
  }, [phase]);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];

  // Relief exercise (phase === "relief"). Stays "done" once finished, so coming
  // back from the paywall doesn't make her breathe through it a second time.
  const [reliefStage, setReliefStage] = useState<"intro" | "running" | "done">("intro");
  // Single source of truth: seconds elapsed since she tapped start. Round, step and
  // the countdown are all *derived* from it, so the interval's updater stays pure
  // (StrictMode double-invokes updaters in dev - anything stateful in there advances twice).
  const [reliefElapsed, setReliefElapsed] = useState(0);

  useEffect(() => {
    if (reliefStage !== "running") return;
    const id = setInterval(() => setReliefElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [reliefStage]);

  // The circle's scale is animated by framer over each step's full duration, so the
  // breathing stays smooth even though the visible number only ticks once a second.
  const { breathStep, breathRound, secondsLeft } = useMemo(() => {
    // Clamp to the final second: on the tick that completes the exercise the raw
    // value would wrap back to "Breathe in", flashing one frame of the circle
    // re-expanding before the reward swaps in.
    const t = Math.min(reliefElapsed, BREATH_TOTAL_SECONDS - 1);
    const intoCycle = t % BREATH_CYCLE_SECONDS;
    let acc = 0;
    let step = BREATH_SEQUENCE.length - 1;
    for (let i = 0; i < BREATH_SEQUENCE.length; i++) {
      if (intoCycle < acc + BREATH_SEQUENCE[i].seconds) {
        step = i;
        break;
      }
      acc += BREATH_SEQUENCE[i].seconds;
    }
    return {
      breathStep: step,
      breathRound: Math.floor(t / BREATH_CYCLE_SECONDS),
      secondsLeft: acc + BREATH_SEQUENCE[step].seconds - intoCycle,
    };
  }, [reliefElapsed]);

  useEffect(() => {
    if (reliefStage === "running" && reliefElapsed >= BREATH_TOTAL_SECONDS) {
      setReliefStage("done");
    }
  }, [reliefStage, reliefElapsed]);

  const startRelief = useCallback(() => {
    setReliefElapsed(0);
    setReliefStage("running");
  }, []);

  // Lets her bail out of the timer without losing the reward - jumps straight
  // to the "done" state as if she'd finished, so the toolkit unlock still lands.
  const skipRelief = useCallback(() => {
    setReliefElapsed(BREATH_TOTAL_SECONDS);
    setReliefStage("done");
  }, []);

  // Nutrition checklist (phase === "nutrition"), the second app taste. Same rule
  // as the relief stage: once she's seen the verdict, coming back from the
  // paywall returns her to it rather than making her tick the list again.
  const [nutritionStage, setNutritionStage] = useState<"checklist" | "done">("checklist");
  const [nutritionDone, setNutritionDone] = useState<string[]>([]);
  // Sub-selection under the supplements row. Never counted - see SUPPLEMENT_OPTIONS.
  const [supplementsTaken, setSupplementsTaken] = useState<string[]>([]);

  const toggleNutritionItem = useCallback((id: string) => {
    setNutritionDone((prev) => {
      const on = prev.includes(id);
      // Un-ticking supplements drops the chips with it, so hidden state can't
      // linger behind a row she's since cleared.
      if (on && id === "supplements") setSupplementsTaken([]);
      return on ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }, []);

  const toggleSupplement = useCallback((id: string) => {
    setSupplementsTaken((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

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

  // Warm the diagnosis screenshots while she's still on results.
  useEffect(() => {
    if (typeof window === "undefined" || phase !== "results") return;
    const imgs = DIAGNOSIS_SHOTS.map((src) => {
      const img = new window.Image();
      img.src = optimizedImageUrl(src, 640);
      return img;
    });
    return () => {
      imgs.forEach((img) => {
        img.src = "";
      });
    };
  }, [phase]);
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
  const [fitnessLevel, setFitnessLevel] = useState<string>("");
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
        case "q_fitness":
          return fitnessLevel !== "";
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
    [ageBand, bodyMetrics, fitnessLevel, hereFor, goal, topProblems, hrtStatus, timing, qualifier, firstName]
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
      fitness_level: fitnessLevel || null,
    };
    sessionStorage.setItem("pending_quiz_answers", JSON.stringify(quizAnswers));
  }, [ageBand, topProblems, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics, fitnessLevel]);

  const goNext = useCallback(() => {
    if (!stepIsAnswered(currentStep)) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // Quiz complete - show calculating loader, then move to email (verify before showing results)
      saveQuizAnswers();
      // Ad-funnel step 2, and the one that ranks angles: cheap clicks that never
      // reach here mean the ad pulled the wrong woman. Her symptom count and
      // primary goal ride along so a segment can be read off the event itself.
      trackFunnelStep(META_FUNNEL_STEPS.quizComplete, {
        symptom_count: topProblems.length,
        goal: goal[0] ?? null,
      });
      setPhase("calculating");
    }
  }, [currentStep, stepIndex, stepIsAnswered, saveQuizAnswers, topProblems, goal]);

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
          .select(TRIAL_SELECT_COLS)
          .eq("user_id", sessionUserId)
          .maybeSingle();
        if (trialRow && stateAllowsAccess(getAccountState(trialRow).state)) {
          sessionStorage.removeItem("pending_quiz_answers");
          router.replace("/dashboard");
          router.refresh();
          return;
        }
      }

      const quizAnswers: Record<string, unknown> = {
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
        fitness_level: fitnessLevel || null,
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

      // Ad-funnel step 3: email verified and her profile is saved. Deliberately a
      // Meta *standard* event - it can be an optimization objective and an
      // audience with no Custom Conversion setup, which is what makes it the
      // fallback objective while Purchase volume is still below learning-phase
      // exit. Fires after save-quiz succeeds, so an already-active account taking
      // the early return above is never counted as a new lead.
      trackFunnelStep(META_FUNNEL_STEPS.lead);

      sessionStorage.removeItem("pending_quiz_answers");
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(REFERRAL_STORAGE_KEY);
      setPhase("results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    } finally {
      setSavingQuiz(false);
    }
  }, [ageBand, topProblems, timing, triedOptions, hrtStatus, goal, qualifier, hereFor, firstName, bodyMetrics, fitnessLevel, ref, router]);

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

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState(false);

  const handleStartCheckout = async () => {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: PLAN_ID,
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
      phase === "relief" ||
      phase === "nutrition" ||
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
              className="mb-4 mx-auto w-full sm:w-5/6 md:w-2/3"
            >
              <Image
                src="/results.webp"
                alt="Your menopause results"
                width={500}
                height={300}
                className="w-full object-contain"
                priority
              />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl sm:text-4xl font-normal text-[#3D3D3D] text-center leading-tight mb-2"
            >
              <span className="font-bold">{firstName.trim() || "You"}</span>
              {getSeverityHeadline(derivedSeverity)}
            </motion.h1>

            {/* Pain paragraph */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-sm text-[#5A5A5A] text-center leading-relaxed mb-4"
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
                      <span className="text-sm font-bold text-gray-900!">Your Results</span>
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
                <HighlightSweep active={diagnosisHighlight}>8 weeks</HighlightSweep>.
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
              // Up to 3 of her symptoms, so the before/after proof covers what
              // she actually picked rather than just her #1.
              const transforms = getSymptomTransforms(topProblems, 3);
              if (transforms.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5"
                >
                  <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight mb-3">
                    {firstName.trim() ? `${firstName.trim()}, what ` : "What "}
                    <HighlightSweep>taking control</HighlightSweep> can look like
                  </h2>

                  <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {transforms.map((t, i) => (
                      <motion.div
                        key={t.image}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.08 }}
                        className="rounded-2xl bg-card border-2 border-[#E8DDD9] overflow-hidden shadow-sm shrink-0 snap-center w-[82%]"
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

            

            {/* ── Block 3: The plan. This is the product - an 8-week plan built
                from her answers that hands her four things to do each day. The
                app blocks below are how it reaches her, not what she's buying,
                so the plan gets the page's biggest, most personal asset. ───── */}
            {(() => {
              // Just her #1 symptom: the generic pillar list right above already
              // walks all four pillars once, so a second full-pillar card here
              // was repeating the same shape twice in a row for no extra payoff.
              const planned = getPlannedSymptoms(topProblems, symptomSeverity, 1);
              const goalLabel = (GOAL_PROMISE[goal[0]] ?? "feel like yourself again").toLowerCase();
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-5"
                >
                  <div className="px-1 mb-3">
                    <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                      {firstName.trim() ? `${firstName.trim()}, here's your ` : "Here's your "}
                      <HighlightSweep>8-week plan</HighlightSweep>
                    </h2>
                    <p className="text-xs text-[#5A5A5A] mt-1.5">
                      Built from your 11 answers. About 15 minutes a day.
                    </p>
                  </div>

                  <div className="rounded-2xl overflow-hidden border-2 border-[#E8DDD9] bg-card shadow-md shadow-primary/5">
                    {/* Her name written onto the plan, letter by letter in script -
                        the made-for-you moment, and the reason this reads as her
                        plan rather than a program she has to fit into. */}
                    <div className="relative w-full">
                      <Image
                        src="/quiz/offer.webp"
                        alt={firstName.trim() ? `${firstName.trim()}'s personalized 8-week plan` : "Your personalized 8-week plan"}
                        width={1024}
                        height={1536}
                        className="w-full h-auto"
                        priority
                      />
                      {(() => {
                        const ink = "#5c4327";
                        const fade = {
                          hidden: { opacity: 0, y: 8 },
                          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
                        };
                        return (
                          <motion.div
                            initial={prefersReducedMotion ? "show" : "hidden"}
                            animate="show"
                            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.22, delayChildren: 0.45 } } }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-center px-[16%] py-[15%]"
                            style={{ color: ink }}
                          >
                            {/* A wax seal, not the reward illustration - this scroll
                                carries her name, so the crest has to read as her
                                plan being sealed, and it has to survive at 80px. */}
                            <motion.div variants={fade} className="mb-2">
                              <Image
                                src="/personalized_plan.webp"
                                alt=""
                                width={500}
                                height={500}
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

                    {/* The arc. Eight weeks has to read as a designed progression
                        she finishes, not a routine she keeps up forever. */}
                    <div className="px-4 pt-3.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {PLAN_ARC.map((a) => (
                          <div key={a.weeks} className="rounded-xl border border-[#E8DDD9] bg-background px-2 py-2 text-center">
                            <p className="text-[10px] font-bold text-primary">{a.weeks}</p>
                            <p className="text-[10px] text-[#5A5A5A] leading-snug mt-0.5">{a.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* The daily shape of the plan - four tasks, named the same way
                        the tracker names them (docs/plan/pillars.md). */}
                    <div className="px-4 pt-4 pb-3.5">
                      <p className="text-sm font-bold text-[#3D3D3D] mb-2.5">Every day, four things:</p>
                      <div className="space-y-2">
                        {PLAN_PILLARS.map((p) => (
                          <div key={p.key} className="flex items-start gap-2.5">
                            <p.icon className={cn("w-4 h-4 shrink-0 mt-0.5", p.tint)} />
                            <p className="text-xs text-[#5A5A5A] leading-snug">
                              <span className="font-bold text-[#3D3D3D]">{p.label}</span> — {p.blurb}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Today's list front and centre, the three pillar screens
                        fanned behind it - the four tasks above, as they actually
                        look. Gated until the masters land in assets/diagnosys/. */}
                    {PLAN_SHOTS_READY && (
                      <ShotStage className="h-44">
                        <PhoneShot src={PLAN_SHOTS.movement} alt="A movement task in the MenoLisa app" rotate={-9} className="w-[27%] -mr-4 mt-3" />
                        <PhoneShot src={PLAN_SHOTS.day} alt="Today's plan tasks in the MenoLisa app" rotate={0} delay={0.1} className="w-[31%] z-10" />
                        <PhoneShot src={PLAN_SHOTS.nutrition} alt="A nutrition task in the MenoLisa app" rotate={7} delay={0.18} className="w-[27%] -ml-4 mt-3" />
                        <PhoneShot src={PLAN_SHOTS.relaxation} alt="A relaxation task in the MenoLisa app" rotate={13} delay={0.26} className="w-[27%] -ml-6 mt-6" />
                      </ShotStage>
                    )}

                    {/* The plan as it actually arrives. An unretouched inbox shot is
                        what turns the illustrated scroll above into a real thing. */}
                    <ShotStage className="h-40" fadeFrom="from-card">
                      <PhoneShot
                        src="/diagnosys/8week.webp"
                        alt="The personalized 8-week plan email from Lisa"
                        rotate={-3}
                        className="w-[52%]"
                      />
                    </ShotStage>
                  </div>

                  {/* ── What the plan does about HER symptoms. The four pillars above
                      are the shape; this is the proof it was built for her. ───── */}
                  {planned.length > 0 && (
                    <div className="mt-5">
                      <div className="px-1 mb-3">
                        <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                          {firstName.trim() ? `${firstName.trim()}, here's how we'll tackle ` : "Here's how we'll tackle "}
                          <HighlightSweep>your {getSymptomPhrase(planned.map((s) => s.id))}</HighlightSweep>
                        </h2>
                        <p className="text-xs text-[#5A5A5A] mt-1.5">
                          Every day, you&apos;ll have a few simple tasks to do - each one moving you toward feeling better.
                        </p>
                      </div>
                      <div className="space-y-3">
                        {planned.map((s, i) => (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ delay: i * 0.08 }}
                            className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-3.5 shadow-sm"
                          >
                            <p className="text-sm font-bold text-[#3D3D3D] mb-2.5">{s.label}</p>
                            <div className="space-y-2">
                              {PLAN_PILLARS.map((p) => (
                                <div key={p.key} className="flex items-start gap-2.5">
                                  <p.icon className={cn("w-4 h-4 shrink-0 mt-0.5", p.tint)} />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-[#9A9A9A] uppercase tracking-wide leading-none">{p.label}</p>
                                    <p className="text-xs text-[#3D3D3D] leading-snug mt-0.5">{s.plan[p.key]}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#9A9A9A] mt-2 px-1 leading-snug">
                        Illustrative - your plan is written from your own answers when you start.
                      </p>
                    </div>
                  )}
                </motion.div>
              );
            })()}

            {/* ── Block 4: The app. Deliberately after the plan and deliberately
                small - these are the tools she runs the plan with, not the offer.
                Selling them first was selling a tracker to someone who came here
                to stop feeling this way. ──────────────────────────────────────── */}
            {(() => {
              const topSymptom = [...topProblems]
                .sort((a, b) => (symptomSeverity[b] ?? 0) - (symptomSeverity[a] ?? 0))[0];
              // No article - the sentence below supplies "your", so the fallback
              // must not repeat it.
              const topLabel = topSymptom
                ? (SYMPTOM_LABELS[topSymptom] || topSymptom).toLowerCase()
                : "symptoms";
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="mb-5"
                >
                  <div className="px-1 mb-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight">
                      And the app that <HighlightSweep>runs it</HighlightSweep>
                    </h2>
                    <p className="text-xs text-[#5A5A5A] mt-1.5">
                      Your plan lives here, alongside everything that keeps it honest.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-card border-2 border-[#E8DDD9] overflow-hidden shadow-md shadow-primary/5">
                    <div className="px-4 pt-3.5 pb-3 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <Activity className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-[#5A5A5A] leading-snug">
                          <span className="font-bold text-[#3D3D3D]">Track</span> — tap what you felt today. Two minutes, done.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-[#5A5A5A] leading-snug">
                          <span className="font-bold text-[#3D3D3D]">Understand</span> — Lisa reads your logs and adjusts what your plan asks of you next, around your {topLabel}.
                        </p>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <MessageCircleHeart className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-[#5A5A5A] leading-snug">
                          <span className="font-bold text-[#3D3D3D]">Ask Lisa anything</span> — wide awake at 2am? Straight answers, no waiting room.
                        </p>
                      </div>
                    </div>

                    <ShotStage className="h-44">
                      <PhoneShot src="/diagnosys/symptoms1.webp" alt="Tracking symptoms in the MenoLisa app" rotate={-7} className="w-[34%] -mr-3 mt-2" />
                      <PhoneShot src="/diagnosys/insights.webp" alt="A personalized insight from Lisa in the MenoLisa app" rotate={0} delay={0.1} className="w-[34%] z-10" />
                      <PhoneShot src="/diagnosys/chat.webp" alt="Chatting with Lisa in the MenoLisa app" rotate={7} delay={0.2} className="w-[34%] -ml-3 mt-2" />
                    </ShotStage>
                  </div>
                </motion.div>
              );
            })()}

            {/* ── The 8-Week Guarantee. Risk reversal with exactly one condition:
                she has to actually follow the plan. Stated as the reason the
                promise can exist rather than as fine print, because "it works if
                you do it" is a confident claim, not a catch - and it's the only
                version that survives contact with people who never open the app.
                Adherence comes from her own tick-offs, so there is nothing for
                her to submit and nothing for us to adjudicate. ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="relative rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-5 overflow-hidden"
              style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
            >
              <div className="flex flex-col items-center text-center">
                <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
                <h2 className="text-base font-bold text-green-800 mb-2">
                  The {PLAN_WEEKS}-Week Guarantee
                </h2>
                <p className="text-sm text-[#3D3D3D] leading-relaxed">
                  {firstName.trim() ? `${firstName.trim()}, follow` : "Follow"}{" "}
                  <b>{PLAN_ADHERENCE_PCT}% of your plan</b> for <b>{PLAN_WEEKS} weeks</b>. If you
                  still don&apos;t feel better, we&apos;ll{" "}
                  <HighlightSweep variant="green">
                    <b>refund you</b>
                  </HighlightSweep>{" "}
                  in full.
                </p>
                <div className="w-16 h-px bg-green-300 my-3" />
                <p className="text-xs text-[#5A5A5A] leading-snug">
                  Your plan counts itself as you tick off each day &mdash; nothing to submit,
                  nothing to prove. Do the work and the risk is ours.
                </p>
              </div>
            </motion.div>

            {/* ── Trust strip ───────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mb-4"
            >
              <p className="text-center text-xs font-semibold text-[#3D3D3D] mb-2">
                Every plan step is built with menopause clinicians and grounded in
                published research - and Lisa always shows you why she suggested it.
              </p>
              {/* Pricing reassurance ("no charge today", "cancel anytime") lives on
                  the paywall, not here - this page's job is belief, and naming the
                  charge two screens early just raises her guard. */}
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-[#9A9A9A]">
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Built around your 11 answers</span>
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Works alongside HRT</span>
                <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-green-600" /> Your data stays private</span>
              </div>
            </motion.div>

          </motion.div>

          {/* Fixed bottom CTA -> relief exercise */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
              {(() => {
                const cta = getDiagnosisForwardCopy();
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setPhase("relief")}
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

      {/* Relief Phase - one paced-breathing exercise she completes herself, so she
          arrives at the paywall having already been given something that worked. */}
      {phase === "relief" && (
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2",
            // The reward stack is taller than the exercise, so it gets to scroll
            // on short screens; the exercise itself must never move under her.
            reliefStage === "done" &&
              "overflow-y-auto pb-[calc(132px+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col min-h-0">
            {/* Back to diagnosis */}
            <button
              type="button"
              onClick={() => setPhase("diagnosis")}
              className="flex items-center gap-1 self-start shrink-0 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <AnimatePresence mode="wait">
              {/* ── Intro + running share one persistent circle, so starting the
                  exercise never re-mounts (and never re-animates) it. ───────── */}
              {reliefStage !== "done" ? (
                <motion.div
                  key="relief-exercise"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35 }}
                  className="flex-1 flex flex-col justify-center items-center text-center gap-5"
                >
                  {/* Fixed-height copy slot: the two states swap inside it without
                      shifting the circle below. */}
                  <div className="min-h-[128px] sm:min-h-[136px] flex flex-col justify-end w-full">
                    <AnimatePresence mode="wait">
                      {reliefStage === "intro" ? (
                        <motion.div
                          key="relief-copy-intro"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-2.5"
                        >
                          <h1 className="text-3xl sm:text-4xl font-normal text-[#3D3D3D] leading-tight">
                            {firstName.trim() ? (
                              <>
                                <span className="font-bold">{firstName.trim()}</span>, let&apos;s do
                                one relief exercise.
                              </>
                            ) : (
                              <>Let&apos;s do one relief exercise.</>
                            )}
                          </h1>
                          <p className="text-xs text-[#5A5A5A] leading-relaxed max-w-xs mx-auto">
                            When{" "}
                            <span className="font-semibold text-[#3D3D3D]">
                              {getSymptomPhrase(topProblems)}
                            </span>{" "}
                            hit, your body is already in alarm. This is the fastest way out.
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="relief-copy-running"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-3"
                        >
                          <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                            Round {breathRound + 1} of {BREATH_ROUNDS}
                          </p>
                          {/* Round dots - she can always see exactly how much is left. */}
                          <div className="flex justify-center gap-2">
                            {Array.from({ length: BREATH_ROUNDS }).map((_, i) => (
                              <motion.div
                                key={i}
                                animate={{ width: i === breathRound ? 32 : 8 }}
                                transition={{
                                  type: "spring",
                                  damping: 30,
                                  stiffness: 200,
                                  duration: prefersReducedMotion ? 0 : 0.4,
                                }}
                                className={cn(
                                  "h-2 rounded-full",
                                  i <= breathRound ? "bg-primary" : "bg-primary/20"
                                )}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Breathing circle. The box is sized for the largest scale so
                      expanding never nudges the layout. */}
                  <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center shrink-0">
                    {!prefersReducedMotion && (
                      <motion.div
                        aria-hidden
                        className="absolute w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-primary/30 blur-2xl"
                        animate={
                          reliefStage === "running"
                            ? {
                                scale: BREATH_SEQUENCE[breathStep].scale * 1.06,
                                opacity: BREATH_SEQUENCE[breathStep].glow,
                              }
                            : { scale: [0.9, 1.15, 0.9], opacity: [0.4, 0.7, 0.4] }
                        }
                        transition={
                          reliefStage === "running"
                            ? {
                                duration: BREATH_SEQUENCE[breathStep].seconds,
                                ease: [...BREATH_SEQUENCE[breathStep].ease],
                              }
                            : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                        }
                      />
                    )}
                    <motion.button
                      type="button"
                      onClick={startRelief}
                      disabled={reliefStage === "running"}
                      aria-label={
                        reliefStage === "intro" ? "Start the breathing exercise" : undefined
                      }
                      animate={{
                        scale:
                          reliefStage === "running" ? BREATH_SEQUENCE[breathStep].scale : 1,
                      }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : reliefStage === "running"
                            ? {
                                duration: BREATH_SEQUENCE[breathStep].seconds,
                                ease: [...BREATH_SEQUENCE[breathStep].ease],
                              }
                            : { duration: 0.4, ease: "easeOut" }
                      }
                      className="relative w-36 h-36 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center gap-1 disabled:cursor-default"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,116,177,0.22) 0%, rgba(255,235,118,0.22) 50%, rgba(101,219,255,0.22) 100%)",
                        border: "2px solid rgba(255,116,177,0.35)",
                        willChange: reliefStage === "running" ? "transform" : "auto",
                      }}
                    >
                      <AnimatePresence mode="wait">
                        {reliefStage === "intro" ? (
                          <motion.span
                            key="relief-circle-intro"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center gap-1.5"
                          >
                            <Wind className="w-7 h-7 text-primary" />
                            <span className="text-sm font-semibold text-[#3D3D3D]">
                              Tap to begin
                            </span>
                          </motion.span>
                        ) : (
                          <motion.span
                            key={`relief-circle-${breathStep}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col items-center"
                          >
                            <span
                              role="status"
                              aria-live="polite"
                              className="text-sm font-semibold text-[#3D3D3D]"
                            >
                              {BREATH_SEQUENCE[breathStep].label}
                            </span>
                            <span className="text-3xl font-black text-primary leading-tight tabular-nums">
                              {secondsLeft}
                            </span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>

                  <p className="text-[11px] text-[#9A9A9A] shrink-0">
                    {reliefStage === "intro"
                      ? `${RELIEF_TOOL_NAME} · ${BREATH_TOTAL_SECONDS} seconds`
                      : "Let the exhale be longer than the breath in."}
                  </p>

                  {reliefStage === "running" && (
                    <button
                      type="button"
                      onClick={skipRelief}
                      className="text-[11px] text-[#9A9A9A] hover:text-[#5A5A5A] underline underline-offset-2 transition-colors shrink-0"
                    >
                      Skip
                    </button>
                  )}
                </motion.div>
              ) : (
                /* ── Done: the reward. She keeps the tool she just used, and sees
                    the three she doesn't have yet - felt first, read second. ── */
                <motion.div
                  key="relief-done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  className="flex-1 flex flex-col justify-center items-center text-center gap-4"
                >
                  <motion.div
                    className="relative flex items-center justify-center"
                    initial={{ scale: 0, rotate: -18, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 240, damping: 11, delay: 0.05 }
                    }
                  >
                    {!prefersReducedMotion && (
                      <>
                        <motion.div
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
                          animate={{ scale: [0.9, 1.2, 0.9], opacity: [0.4, 0.75, 0.4] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                        />
                        {/* Confetti burst - fires once, right as the icon pops. */}
                        {CONFETTI_BURST.map((c, i) => (
                          <motion.span
                            key={i}
                            aria-hidden
                            className="absolute w-1.5 h-1.5 rounded-full"
                            style={{ background: c.color }}
                            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                            animate={{ x: c.x, y: c.y, scale: [0, 1, 0.6], opacity: [1, 1, 0] }}
                            transition={{ duration: 1.1, delay: 0.15, ease: "easeOut" }}
                          />
                        ))}
                      </>
                    )}
                    <div
                      className="relative w-20 h-20 rounded-full flex items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255,116,177,0.25) 0%, rgba(255,235,118,0.25) 50%, rgba(101,219,255,0.25) 100%)",
                        border: "2px solid rgba(255,116,177,0.4)",
                      }}
                    >
                      <PartyPopper className="w-9 h-9 text-primary" strokeWidth={2} />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="space-y-2"
                  >
                    <h1 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                      Hooray{firstName.trim() ? `, ${firstName.trim()}` : ""}!
                    </h1>
                    <p className="text-xs text-[#5A5A5A] leading-relaxed max-w-xs mx-auto">
                      You calmed your body in{" "}
                      <span className="font-bold text-[#3D3D3D]">
                        {BREATH_TOTAL_SECONDS} seconds
                      </span>{" "}
                      - and unlocked your first tool.
                    </p>
                  </motion.div>

                  {/* Tool 1 of 4: what she keeps, then what she doesn't have yet. */}
                  <ToolkitStack unlockedCount={1} topProblems={topProblems} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fixed bottom CTA -> nutrition checklist. Only exists once she's
              finished, so the next ask lands after the reward, never during the
              exercise. */}
          {reliefStage === "done" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
            >
              <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
                {(() => {
                  const cta = getReliefForwardCopy();
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setPhase("nutrition")}
                        className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                        style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
                      >
                        Unlock my next tool
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <p className="text-[11px] text-[#9A9A9A] text-center mt-1.5">{cta.sub}</p>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Nutrition Phase - the second app taste. She audits her own day against
          the nine habits, then gets told the gap is structural, not personal.
          This is the paywall's doorstep, so it carries the price + guarantee. */}
      {phase === "nutrition" && (
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2",
            // The reward stack is taller than the checklist (which scrolls its
            // own list instead), so only the reward gets to scroll the page.
            // Both reserve room for the fixed CTA - the reward's is taller
            // because it carries the trial line under the button.
            nutritionStage === "done"
              ? "overflow-y-auto pb-[calc(132px+env(safe-area-inset-bottom))]"
              : "pb-[calc(84px+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col min-h-0">
            {/* Back to the relief reward - reliefStage stays "done", so she
                never has to breathe through the exercise a second time. */}
            <button
              type="button"
              onClick={() => setPhase("relief")}
              className="flex items-center gap-1 self-start shrink-0 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <AnimatePresence mode="wait">
              {nutritionStage === "checklist" ? (
                <motion.div
                  key="nutrition-checklist"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35 }}
                  className="flex-1 flex flex-col min-h-0 gap-3"
                >
                  <div className="shrink-0 text-center space-y-1.5">
                    <h1 className="text-2xl sm:text-3xl font-normal text-[#3D3D3D] leading-tight">
                      {firstName.trim() ? (
                        <>
                          <span className="font-bold">{firstName.trim()}</span>, one last thing.
                        </>
                      ) : (
                        <>One last thing.</>
                      )}
                    </h1>
                    <p className="text-sm text-[#5A5A5A] leading-relaxed max-w-xs mx-auto">
                      Which of these did you already do today?
                    </p>
                    {/* "Nobody's grading you" is load-bearing: it kills the urge
                        to over-report, and the verdict only lands if she was honest. */}
                    <p className="text-[11px] text-[#9A9A9A]">
                      <span className="font-semibold text-primary tabular-nums">
                        {nutritionDone.length} of {NUTRITION_TOTAL} selected
                      </span>{" "}
                      · Tap everything that applies - be honest, nobody&apos;s grading you.
                    </p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1 pb-1 [scrollbar-width:thin] space-y-3">
                    {NUTRITION_GROUPS.map((group) => {
                      const GroupIcon = group.icon;
                      return (
                        <div key={group.title} className="space-y-2">
                          <div className="flex items-center gap-1.5 px-1">
                            <GroupIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                              {group.title}
                            </span>
                          </div>
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            const isOn = nutritionDone.includes(item.id);
                            return (
                              <div key={item.id} className="space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleNutritionItem(item.id)}
                                  aria-pressed={isOn}
                                  // border-2 in BOTH states - going 1px -> 2px on
                                  // tap shifts the row by a pixel under her finger.
                                  className={cn(
                                    "w-full flex items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left transition-colors duration-200",
                                    isOn
                                      ? "bg-primary/5 border-primary/30"
                                      : "border-foreground/10 bg-foreground/[0.03] hover:bg-foreground/[0.06]"
                                  )}
                                >
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                      isOn ? "bg-primary/15" : "bg-foreground/5"
                                    )}
                                  >
                                    <ItemIcon
                                      className={cn(
                                        "w-4 h-4",
                                        isOn ? "text-primary" : "text-[#9A9A9A]"
                                      )}
                                    />
                                  </div>
                                  <span
                                    className={cn(
                                      "flex-1 min-w-0 text-sm leading-tight",
                                      isOn
                                        ? "font-bold text-[#3D3D3D]"
                                        : "font-medium text-[#5A5A5A]"
                                    )}
                                  >
                                    {item.label}
                                  </span>
                                  <div
                                    className={cn(
                                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                                      isOn ? "bg-primary" : "border border-foreground/15"
                                    )}
                                  >
                                    {isOn && (
                                      <Check
                                        className="w-3 h-3 text-primary-foreground animate-in zoom-in duration-200"
                                        strokeWidth={3}
                                      />
                                    )}
                                  </div>
                                </button>

                                {/* Supplement chips: they name the three that
                                    matter, so even skipping them teaches her
                                    something. Never counted toward the score. */}
                                {item.id === "supplements" && isOn && (
                                  <div className="flex flex-wrap gap-1.5 pl-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {SUPPLEMENT_OPTIONS.map((s) => {
                                      const chipOn = supplementsTaken.includes(s.id);
                                      return (
                                        <button
                                          key={s.id}
                                          type="button"
                                          onClick={() => toggleSupplement(s.id)}
                                          aria-pressed={chipOn}
                                          className={cn(
                                            "px-3 py-1.5 rounded-full text-[11px] font-semibold border-2 transition-colors",
                                            chipOn
                                              ? "bg-primary/10 border-primary/30 text-[#3D3D3D]"
                                              : "border-foreground/10 bg-foreground/[0.03] text-[#8A8A8A] hover:bg-foreground/[0.06]"
                                          )}
                                        >
                                          {s.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                /* ── Done: her day, read back to her. Whatever she ticked, the
                    verdict lands on "the gap is structural" - then the swaps
                    give tomorrow a shape, and the toolkit moves to 2 of 4. ── */
                <motion.div
                  key="nutrition-done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  className="flex-1 flex flex-col justify-center items-center text-center gap-4"
                >
                  {(() => {
                    const verdict = getNutritionVerdict(
                      nutritionDone.length,
                      firstName.trim(),
                      topProblems
                    );
                    const swaps = NUTRITION_ITEMS.filter(
                      (i) => !nutritionDone.includes(i.id)
                    ).slice(0, 3);
                    return (
                      <>
                        <motion.div
                          className="relative flex items-center justify-center"
                          initial={{ scale: 0, rotate: -18, opacity: 0 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          transition={
                            prefersReducedMotion
                              ? { duration: 0 }
                              : { type: "spring", stiffness: 240, damping: 11, delay: 0.05 }
                          }
                        >
                          {!prefersReducedMotion && (
                            <>
                              <motion.div
                                aria-hidden
                                className="absolute inset-0 rounded-full bg-primary/30 blur-2xl"
                                animate={{ scale: [0.9, 1.2, 0.9], opacity: [0.4, 0.75, 0.4] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                              />
                              {CONFETTI_BURST.map((c, i) => (
                                <motion.span
                                  key={i}
                                  aria-hidden
                                  className="absolute w-1.5 h-1.5 rounded-full"
                                  style={{ background: c.color }}
                                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                                  animate={{
                                    x: c.x,
                                    y: c.y,
                                    scale: [0, 1, 0.6],
                                    opacity: [1, 1, 0],
                                  }}
                                  transition={{ duration: 1.1, delay: 0.15, ease: "easeOut" }}
                                />
                              ))}
                            </>
                          )}
                          {/* Salad, not the party popper - two different wins
                              should not look like the same screen twice. */}
                          <div
                            className="relative w-20 h-20 rounded-full flex items-center justify-center"
                            style={{
                              background:
                                "linear-gradient(135deg, rgba(255,116,177,0.25) 0%, rgba(255,235,118,0.25) 50%, rgba(101,219,255,0.25) 100%)",
                              border: "2px solid rgba(255,116,177,0.4)",
                            }}
                          >
                            <Salad className="w-9 h-9 text-primary" strokeWidth={2} />
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, duration: 0.4 }}
                          className="space-y-2"
                        >
                          <h1 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight">
                            {verdict.headline}
                          </h1>
                          <p className="text-sm sm:text-base text-[#5A5A5A] leading-snug max-w-xs mx-auto">
                            {verdict.body}
                          </p>
                        </motion.div>

                        {/* Tomorrow, made concrete. Derived from what she left
                            blank, in priority order - the highest-leverage habit
                            she isn't doing yet comes first. */}
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.45, duration: 0.35 }}
                          className="w-full max-w-xs rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 text-left"
                        >
                          {swaps.length > 0 ? (
                            <>
                              <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                                Your first {swaps.length === 1 ? "swap" : `${swaps.length} swaps`} for
                                tomorrow
                              </p>
                              <div className="space-y-1.5">
                                {swaps.map((s) => {
                                  const SwapIcon = s.icon;
                                  return (
                                    <div key={s.id} className="flex items-center gap-2.5">
                                      <SwapIcon className="w-4 h-4 text-primary shrink-0" />
                                      <span className="text-sm font-semibold text-[#3D3D3D] leading-tight">
                                        {s.label}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          ) : (
                            <p className="text-sm font-semibold text-[#3D3D3D] leading-snug">
                              You&apos;ve got the basics covered. Your plan starts where the basics
                              stop.
                            </p>
                          )}
                        </motion.div>

                        <ToolkitStack unlockedCount={2} topProblems={topProblems} />
                      </>
                    );
                  })()}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fixed bottom CTA. During the checklist it's never disabled - zero
              ticks is an honest answer and gets its own label. After the
              verdict it becomes the paywall doorstep and carries the trial. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: nutritionStage === "done" ? 0.9 : 0.2 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
          >
            <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
              <button
                type="button"
                onClick={() =>
                  nutritionStage === "checklist" ? setNutritionStage("done") : setPhase("paywall")
                }
                className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)", boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)" }}
              >
                {nutritionStage === "checklist"
                  ? nutritionDone.length > 0
                    ? "See what this means"
                    : "I'm starting from scratch"
                  : getGoalCtaLabel(goal)}
                <ArrowRight className="w-4 h-4" />
              </button>
              {nutritionStage === "done" && (
                <p className="text-[11px] text-[#9A9A9A] text-center mt-1.5">{getCtaCopy().sub}</p>
              )}
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
                  src="/quiz/results_blur.webp"
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
                Your personalized Menopause Plan{" "}
                <span className="text-primary uppercase">is ready</span>
              </h2>
              {otpStep === "email" && (
                <>
                  <p className="text-sm sm:text-base text-[#5A5A5A]">
                    Enter your email so we can save your score and free plan - so you don&apos;t
                    lose it. We&apos;ll send a 6-digit code, no password.
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

      {/* Paywall Phase - charged in full at Stripe checkout, no trial */}
      {phase === "paywall" && (
        <PaywallView
          onCheckout={handleStartCheckout}
          checkoutLoading={checkoutLoading}
          error={error}
          onBack={() => setPhase("nutrition")}
          trackingSource="register"
        />
      )}

      {/* Download Phase - redirect users to mobile app */}
      {phase === "download" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 sm:py-6">
          <MetaPurchaseTracker />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center min-h-0 text-center"
          >

            {/* The app itself, not the Lisa portrait from the paywall - this is
                the "go install it" screen, so the image has to be the product. */}
            <div className="flex justify-center mb-4">
              <Image src="/mockup.webp" alt="" width={240} height={240} priority />
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
              {syncingPayment
                ? "Loading…"
                : WEB_APP_ENABLED
                  ? "Continue to web dashboard instead"
                  : "Manage my subscription"}
            </button>
          </motion.div>
        </div>
      )}

      {/* Quiz Phase */}
      {phase === "quiz" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden pb-[calc(72px+env(safe-area-inset-bottom))]">
          {/* Back to previous question - small, top-left, matches results/diagnosis back link */}
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1 self-start shrink-0 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] px-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
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
                Take the Menopause Quiz
              </h1>
              <p className="text-xs sm:text-sm text-[#5A5A5A] mt-0.5">
                Just 2 minutes, free. No download required.
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

              {/* Fitness level (image grid, same style as Q5 HRT) */}
              {currentStep === "q_fitness" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How would you describe your fitness level?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      There&apos;s no wrong answer — it just sets your starting point
                    </p>
                  </div>
                  <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
                    {FITNESS_OPTIONS.map((option) => {
                      const isSelected = fitnessLevel === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setFitnessLevel(option.id)}
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
                        src="/quiz/rewards/reward1.webp"
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
                        src="/quiz/rewards/reward2.webp"
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
            <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3">
              <button
                type="button"
                onClick={goNext}
                disabled={!stepIsAnswered(currentStep)}
                className="min-h-12 w-full flex items-center justify-center gap-1.5 px-5 sm:px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:shadow-none font-semibold text-sm sm:text-base"
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
