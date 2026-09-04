 
"use client";

import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  motion,
  AnimatePresence,
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabase, hasAuthCookieHint } from "@/lib/supabaseClient";
import {
  getAccountState,
  stateAllowsAccess,
  TRIAL_SELECT_COLS,
} from "@/lib/getAccountState";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import { cn } from "@/lib/utils";
import { identifyMetaUser } from "@/lib/metaPixelClient";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/constants";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  UserCircle,
  Check,
  TrendingDown,
  Ruler,
  Weight,
  ShieldCheck,
  Wind,
  PartyPopper,
  Lock,
  Sparkles,
  ChevronRight,
  Flame,
  MoonStar,
  Brain,
  Waves,
  BatteryLow,
  Bone,
  Droplets,
  HeartPulse,
  Hourglass,
  Stethoscope,
  Ribbon,
  CircleQuestionMark,
  CloudSun,
  CloudRain,
  CloudLightning,
  Sunrise,
  Sun,
  Sunset,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { HighlightSweep } from "@/components/HighlightSweep";
import {
  FirstSessionBoard,
  StartingPointBoard,
  TrainingWeekBoard,
  type PlannerDay,
  type SessionRow,
} from "@/components/funnel/RewardBoards";
import { SHOT_W, SHOT_H } from "@/components/PhoneShots";

/*
 * Everything past the quiz is code-split.
 *
 * This page is the landing page for paid traffic, and until she taps through
 * question 12 none of the screens below can appear. Statically importing them
 * put the paywall, the plan stage, the finish board and the polaroid animation
 * into the chunk that has to parse before question 1 becomes tappable - a cost
 * paid by every ad click, including the majority that bounce on question 1.
 *
 * The loaders are named so they can be *called* as well as rendered. A phase
 * transition must never show a spinner - she is mid-funnel and a stall on the
 * paywall is a stall in front of the price - so `warmPhaseChunks()` below
 * fetches them well before the phase that needs them. `next/dynamic` dedupes,
 * so warming and rendering share one request.
 */
const loadPaywallView = () =>
  import("@/components/PaywallView").then((m) => ({ default: m.PaywallView }));
// The identical component used to be defined a second time in this file, with a
// narrower `variant` union that had already drifted from the shared one.
const loadPlanFinishBoard = () =>
  import("@/components/PlanFinishBoard").then((m) => ({ default: m.PlanFinishBoard }));
const loadPlanStage = () =>
  import("@/components/PlanStage").then((m) => ({ default: m.PlanStage }));
const loadHowLisaRuns = () =>
  import("@/components/HowLisaRuns").then((m) => ({ default: m.HowLisaRuns }));
const loadSocialProofPolaroid = () =>
  import("@/components/SocialProof").then((m) => ({ default: m.SocialProofPolaroid }));
const loadMetaPurchaseTracker = () => import("@/components/MetaPurchaseTracker");

const PaywallView = dynamic(loadPaywallView);
const PlanFinishBoard = dynamic(loadPlanFinishBoard);
const PlanStage = dynamic(loadPlanStage);
const HowLisaRuns = dynamic(loadHowLisaRuns);
const SocialProofPolaroid = dynamic(loadSocialProofPolaroid);
const MetaPurchaseTracker = dynamic(loadMetaPurchaseTracker);

/**
 * Pull the chunks for the screens that come after `phase`.
 *
 * Mirrors the image preloading either side of it: warm the next screen while
 * she is still reading this one. The calculating loader is 6.5s of dead time
 * and results is a long scroll, so by the time anything here renders its code
 * has been sitting in the module cache for a minute or more.
 */
/*
 * `stepIndex` gates the quiz branch, and it has to since 2026-09-02.
 *
 * The funnel now cold-starts on `phase === "quiz"` rather than on the start
 * screen, so warming "as soon as she is in the quiz" became "on the ad landing
 * page, during hydration" - three extra chunk fetches competing with the ~297KB
 * that has to parse before question 1 is tappable at all. That is the opposite
 * of what this function is for.
 *
 * Warming from step 1 restores the original timing: it begins the moment she has
 * answered something, which is where the old start-screen tap used to sit, and
 * she then has fifteen more screens before any of it is needed.
 */
function warmPhaseChunks(phase: Phase, stepIndex: number) {
  if ((phase === "quiz" && stepIndex >= 1) || phase === "calculating") {
    void loadSocialProofPolaroid();
    void loadPlanStage();
    void loadHowLisaRuns();
  }
  if (phase === "calculating" || phase === "results" || phase === "diagnosis") {
    void loadPaywallView();
    void loadPlanFinishBoard();
  }
  if (phase === "paywall") {
    void loadMetaPurchaseTracker();
  }
}
import { PLAN_PILLARS } from "@/lib/planPillars";
import {
  PLAN_ID,
  PLAN_PRICE,
  PLAN_WEEKS,
  TRIAL_DAYS,
  formatChargeDate,
  formatPrice,
  isTrialOffer,
  trialEndDate,
} from "@/lib/pricing";
import { getSymptomTransforms } from "@/lib/testimonials";
import { getOfferPromise } from "@/lib/planTimeline";
import {
  SYMPTOM_LABELS,
  SYMPTOM_MECHANISM,
  SYMPTOM_FIRST_MOVE,
  AGE_BAND_LABELS,
  SCORE_GOAL,
  getScoreBenchmark,
  getTopBurdenSymptoms,
  calculateWellbeingScore,
} from "@/lib/quiz-results-helpers";

/** Quiz step/phase -> illustration filename (from public/quiz/, same as mobile app assets/quiz/). */
const QUIZ_ILLUSTRATION: Record<string, string> = {
  q8_name: "name.webp",
};


type Step =
  | "q1_age"
  | "q2_here_for"
  | "q_menopause_type"
  | "q4_symptoms"
  | "q_symptom_impact"
  | "q3_goals"
  | "reward_symptoms"
  | "q_body"
  | "q_fitness"
  | "q_training_time"
  | "q_nutrition"
  | "q_relaxation"
  | "reward_plan_shape"
  | "q5_hrt"
  | "reward_progress"
  | "reward_social_proof"
  | "q8_name";

// The order is a message-match decision before it is a data-collection one.
//
// **Her symptoms are question 2 (2026-08-30).** They were question 4, behind
// age, menopausal status and how menopause began - three screens that
// categorise her and none of which is the thing the ad she just clicked was
// about. Every live creative is a symptom or a mechanism argument, and Ad 1
// ends on a literal instruction: *tap your symptom to begin the audit*. A woman
// who arrives on that promise and is asked her age, her stage and whether she
// had surgery has been handed a form instead of the audit, three screens before
// the funnel says anything she came for.
//
// So symptoms and their severity move up behind the age tile. Age stays first
// on purpose: it is one tap, it is genuinely used (the results benchmark is
// keyed off the band, `getScoreBenchmark`), and it is the warm-up that makes
// the second question feel like a conversation rather than an opening demand.
// Status and menopause type simply move back two slots - nothing downstream
// notices, because everything they feed is read after this point:
//
//   - `COHORT_PHRASE[hereFor]` on `reward_symptoms`, still four steps later
//   - `MENOPAUSE_TYPE`/`hrt` in save-quiz, read at the end
//   - `STAGE_PRIDE_LINE[hereFor]` on `reward_progress`, near the end
//
// If a question ever moves in front of `reward_symptoms` again, check those
// three: this reorder is only safe because every answer a reward board prints
// is still collected before the board renders.
const STEPS: Step[] = [
  // **Symptoms first, age second (2026-09-03).** This screen is the ad's landing
  // page — the start screen was bypassed on 2026-09-02 and deleted on
  // 2026-09-04 — and every live creative
  // ends on "tap your symptom". It opened on the age tiles instead, and the
  // telemetry priced that mismatch at 52 of 152 women leaving before one tap:
  // a third of everything paid traffic bought, lost on the promise, not the
  // product. Age still gates nothing before `reward_symptoms` (step 7), so the
  // swap is free downstream — every answer a reward board prints is collected
  // before the board renders, which is the rule that governs this order.
  "q4_symptoms",
  "q1_age",
  "q_symptom_impact",
  "q2_here_for",
  "q_menopause_type",
  "q3_goals",
  "reward_symptoms",
  "q_body",
  "q_fitness",
  "q_training_time",
  "reward_social_proof",
  "q_nutrition",
  "q_relaxation",
  "reward_plan_shape",
  "q5_hrt",
  "reward_progress",
  "q8_name",
];

// Single-choice steps advance on tap - the extra "Next" press on a question that
// can only hold one answer is pure friction, and it's the same press she already
// made. Multi-select, the two numeric inputs and the name step keep the button,
// because there the tap is a toggle and only she knows when she's done.
//
// q4_symptoms keeps its button: it's multi-select, so only she knows when the
// list is complete. The severity follow-up is its own single-choice step.
const AUTO_ADVANCE_STEPS: Step[] = [
  "q1_age",
  "q2_here_for",
  "q_menopause_type",
  "q_symptom_impact",
  "q_fitness",
  "q_training_time",
  "q_nutrition",
  "q_relaxation",
  "q5_hrt",
];

// Reward steps mirror her answers back with a stat - pure dopamine, not questions.
// They're excluded from the numbered progress so they read as a gift, not a task.
//
// Each one now opens with a short <ComputeMeter /> before its payoff - the same
// percentage instrument the post-quiz calculating screen uses, run at ~1.7s
// instead of 6.5s. The reason is the one the calculating screen's own comment
// makes: a reveal that arrives with no visible work in front of it reads as a
// poster, and the entire claim being sold here is that her answers are being
// computed on. Three cheap receipts across the quiz beat one expensive receipt
// at the end.
//
// They also break up the run of questions. `reward_plan_shape` exists for that
// as much as for its content: q_body -> q_fitness -> q_nutrition ->
// q_relaxation -> q5_hrt was five screens with no payoff, and it is the least
// engaging block in the funnel.
//
// `reward_social_proof` is the odd one out and is meant to be: the other three
// mirror *her* answers back, and this one is the only place in the quiz that
// says someone else already walked it. It sits between `q_training_time` and
// `q_nutrition` for two reasons.
//
// Content: she has just said how much time she will give this, and the question
// live at that exact moment is "will that little bit actually do anything". A
// woman who finished is the only honest answer to it, and it has to land before
// `reward_plan_shape` puts a number on her week - a minutes figure is an ask
// until someone has shown it was enough.
//
// Pacing: q_body -> q_fitness -> q_training_time -> q_nutrition -> q_relaxation
// was the longest unbroken run in the quiz and, per the note above, its least
// engaging block; this splits it 3/2. Every other slot either sits adjacent to
// an existing reward (two payoffs in a row read as filler) or lands before
// q4_symptoms, where there are no answers yet to have earned anything.
//
// It deliberately does not go last, before `q8_name`: the end of the quiz is
// already carrying `reward_progress`, and social proof placed immediately
// before the calculating screen would be the third human-interest beat in a row
// on the way into results.
const REWARD_STEPS: Step[] = [
  "reward_symptoms",
  "reward_social_proof",
  "reward_plan_shape",
  "reward_progress",
];

// Header label per reward, in place of the numbered "Question X of N". Each one
// names what she just got rather than repeating "Quick win" three times.
const REWARD_LABEL: Record<string, string> = {
  reward_symptoms: "Yours, free",
  reward_social_proof: "Someone like you",
  reward_plan_shape: "Your week, sized",
  reward_progress: "Your plan rules",
};

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

// Four goals, and every one of them is something the 8-week plan actually moves.
// "Have data for my doctor" was dropped here: it's an outcome of tracking rather
// than a symptom the plan targets, and it pulled the results copy toward a
// doctor's appointment instead of toward her own week. `data_for_doctor` stays
// valid in save-quiz and GOAL_CTA_LABEL for the rows that already carry it.
const GOAL_OPTIONS = [
  { id: "sleep_through_night", label: "Sleep through the night", image: "/quiz/goals/sleep.webp" },
  { id: "think_clearly", label: "Think clearly again", image: "/quiz/goals/thinkclearly.webp" },
  { id: "feel_like_myself", label: "Mental and emotional wellbeing", image: "/quiz/goals/feelmyself.webp" },
  // id kept as `get_body_back` on purpose - existing user_profiles rows and the
  // mobile app still carry it; only the copy/image moved to weight loss.
  { id: "get_body_back", label: "Lose weight", image: "/quiz/goals/weight.webp" },
];

// How menopause began. Surgical and medical menopause arrive overnight rather
// than over years, and both change what the plan may safely suggest - so this is
// asked immediately after her stage, while she's still thinking about it.
//
// No tiles here, deliberately. "After cancer treatment" and "After surgery" have
// no illustration that isn't either a stock smile that trivialises it or a
// clinical photo that alarms her, and a picture buys nothing on a question whose
// four answers are already unambiguous in words. A plain coloured list reads
// faster and stays respectful.
const MENOPAUSE_TYPE_OPTIONS = [
  { id: "natural", label: "Naturally, over time", hint: "Periods changed on their own" },
  { id: "surgical", label: "After surgery", hint: "Ovaries or uterus removed" },
  { id: "medical", label: "After cancer treatment", hint: "Chemo, radiation or hormone therapy" },
  { id: "not_sure", label: "I'm not sure", hint: "That's completely fine — we'll work with it" },
];

// ─── The imageless questions ────────────────────────────────────────────────
// Three of the twelve carry no tile art - how menopause began, how hard the
// symptoms hit, and when she trains - because none of the three has an honest
// illustration (see each list for the reasoning). Left plain they were three
// identical grey rows, which is the one shape in the quiz that reads as a form
// rather than a conversation, so each option gets its own accent and its own
// Lucide icon. That is decoration doing real work: the colour ramp on the
// severity list is legible as a *scale* before she has read a word, and the
// icon is what tells her at a glance that these four answers are different
// kinds of thing rather than four lines of text.
//
// Full class strings, never interpolated - Tailwind only ships classes it can
// find as literal text in the source. `chip` is the idle icon well; the
// selected state reuses `dot` so a row only ever carries one accent value.
type ChoiceTone = {
  idle: string;
  selected: string;
  dot: string;
  label: string;
  chip: string;
  Icon: LucideIcon;
};

// Natural is the calm green; surgical and medical are clinical blue and violet
// rather than a warning colour, because neither is a worse answer - and the
// icons stay at that distance too. Nothing here shows a scalpel.
const MENOPAUSE_TYPE_TONE: Record<string, ChoiceTone> = {
  natural: {
    idle: "border-[#2E9E6B]/30 hover:border-[#2E9E6B]/70 hover:bg-[#2E9E6B]/5",
    selected: "border-[#2E9E6B] bg-[#2E9E6B]/10 shadow-md shadow-[#2E9E6B]/20",
    dot: "bg-[#2E9E6B]",
    label: "text-[#1F7A50]",
    chip: "bg-[#2E9E6B]/10 text-[#2E9E6B]",
    Icon: Hourglass,
  },
  surgical: {
    idle: "border-[#3E8FD0]/30 hover:border-[#3E8FD0]/70 hover:bg-[#3E8FD0]/5",
    selected: "border-[#3E8FD0] bg-[#3E8FD0]/10 shadow-md shadow-[#3E8FD0]/20",
    dot: "bg-[#3E8FD0]",
    label: "text-[#2A6DA9]",
    chip: "bg-[#3E8FD0]/10 text-[#3E8FD0]",
    Icon: Stethoscope,
  },
  medical: {
    idle: "border-[#8B6BC7]/30 hover:border-[#8B6BC7]/70 hover:bg-[#8B6BC7]/5",
    selected: "border-[#8B6BC7] bg-[#8B6BC7]/10 shadow-md shadow-[#8B6BC7]/20",
    dot: "bg-[#8B6BC7]",
    label: "text-[#6A4BA3]",
    chip: "bg-[#8B6BC7]/10 text-[#8B6BC7]",
    Icon: Ribbon,
  },
  not_sure: {
    idle: "border-[#8A8A8A]/30 hover:border-[#8A8A8A]/70 hover:bg-[#8A8A8A]/5",
    selected: "border-[#8A8A8A] bg-[#8A8A8A]/10 shadow-md shadow-[#8A8A8A]/20",
    dot: "bg-[#8A8A8A]",
    label: "text-[#5F5F5F]",
    chip: "bg-[#8A8A8A]/10 text-[#8A8A8A]",
    Icon: CircleQuestionMark,
  },
};

// Image-based symptom tiles (same style as Q1 age / Q2 status). 9 options, multi-select.
// IDs reuse the existing downstream keys (SYMPTOM_LABELS, pillars, comparison) so results keep working.
const PROBLEM_OPTIONS = [
  { id: "hot_flashes", label: "Hot flashes", image: "/quiz/symptoms/hot_flashes.webp" },
  { id: "sleep_issues", label: "Can't sleep", image: "/quiz/symptoms/insomnia.webp" },
  { id: "brain_fog", label: "Brain fog", image: "/quiz/symptoms/brain_fog.webp" },
  { id: "mood_swings", label: "Mood swings", image: "/quiz/symptoms/mood_swings.webp" },
  { id: "weight_changes", label: "Weight changes", image: "/quiz/symptoms/weight_gain.webp" },
  { id: "low_energy", label: "Fatigue", image: "/quiz/symptoms/fatigue.webp" },
  { id: "anxiety", label: "Anxiety", image: "/quiz/symptoms/anxiety.webp" },
  { id: "joint_pain", label: "Joint pain", image: "/quiz/symptoms/joint_pain.webp" },
  { id: "bloating", label: "Bloating", image: "/quiz/symptoms/bloating.webp" },
];

// id -> icon, for the reward screens.
//
// The tiles above are the right thing on the *question* - she is choosing, and a
// photograph is what makes nine options scannable at a glance. On the rewards
// they were the wrong thing twice over: a 460x460 illustration cropped into a
// 48px circle is an unreadable smudge, and it makes the payoff screen look like
// a brochure. The app renders her symptoms as icons on a dark tile, so icons
// here mean the reward is a first look at the product rather than more funnel
// art. The reward boards draw the same icons - see components/funnel/RewardBoards.tsx.
const SYMPTOM_ICON: Record<string, LucideIcon> = {
  hot_flashes: Flame,
  sleep_issues: MoonStar,
  brain_fog: Brain,
  mood_swings: Waves,
  weight_changes: Weight,
  low_energy: BatteryLow,
  anxiety: HeartPulse,
  joint_pain: Bone,
  bloating: Droplets,
};

// Its own step, straight after q4_symptoms: one overall rating of how hard her
// symptoms are hitting, not a rating of any single one. Rating all nine is a
// chore nobody finishes, and rating only her first pick made the whole score
// hang on tile order - what she actually knows is how heavy the load is as a
// whole, so that is what we ask for.
//
// The ids stay mild/moderate/severe - IMPACT_VALUE, the score and the results
// copy all key off them - but she never sees those words. "Moderate" is what a
// doctor writes on a chart after deciding her symptoms don't warrant much; the
// label she taps should be a sentence she'd actually say, and the three of them
// escalate by how much of her day the symptoms have taken.
const SYMPTOM_IMPACT_OPTIONS = [
  { id: "mild", label: "I work around them", hint: "They're there, but the day still goes to plan" },
  { id: "moderate", label: "They get in the way", hint: "Most days I'm pushing through" },
  { id: "severe", label: "They run my life", hint: "I plan my days around them" },
];

// Green/amber/red so the three levels read as a scale before she reads a word,
// and a weather ramp on top of it - sun behind cloud, rain, storm. Weather is
// the one escalating metaphor here that describes the *day* rather than the
// woman: a storm is something that happens to you and passes, which is the
// whole claim the next eight weeks make. Faces or warning triangles would have
// graded her instead, on the screen where she has just admitted how bad it is.
const IMPACT_TONE: Record<string, ChoiceTone> = {
  mild: {
    idle: "border-[#2E9E6B]/30 hover:border-[#2E9E6B]/70 hover:bg-[#2E9E6B]/5",
    selected: "border-[#2E9E6B] bg-[#2E9E6B]/10 shadow-md shadow-[#2E9E6B]/20",
    dot: "bg-[#2E9E6B]",
    label: "text-[#1F7A50]",
    chip: "bg-[#2E9E6B]/10 text-[#2E9E6B]",
    Icon: CloudSun,
  },
  moderate: {
    idle: "border-[#E0A32E]/30 hover:border-[#E0A32E]/70 hover:bg-[#E0A32E]/5",
    selected: "border-[#E0A32E] bg-[#E0A32E]/10 shadow-md shadow-[#E0A32E]/20",
    dot: "bg-[#E0A32E]",
    label: "text-[#A9741A]",
    chip: "bg-[#E0A32E]/10 text-[#E0A32E]",
    Icon: CloudRain,
  },
  severe: {
    idle: "border-[#DB4F45]/30 hover:border-[#DB4F45]/70 hover:bg-[#DB4F45]/5",
    selected: "border-[#DB4F45] bg-[#DB4F45]/10 shadow-md shadow-[#DB4F45]/20",
    dot: "bg-[#DB4F45]",
    label: "text-[#B23A31]",
    chip: "bg-[#DB4F45]/10 text-[#DB4F45]",
    Icon: CloudLightning,
  },
};

// Her tapped level, on the same 0-3 intensity scale calculateWellbeingScore uses.
const IMPACT_VALUE: Record<string, number> = { mild: 1, moderate: 2, severe: 3 };

// Fallback intensity for a selected symptom before she has rated anything, and the
// value every symptom used to carry. 2.5 keeps the Menopause Score spread and the
// "you vs typical" comparison reading as they did.
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

// Reward step 2: pride line keyed off where she is in the journey. It used to key
// off "how long have symptoms been affecting you", which the quiz no longer asks -
// her stage is the closest honest proxy, and it lands the same way: proud of
// acting today, whatever her starting point.
const STAGE_PRIDE_LINE: Record<string, string> = {
  pre_menopausal: "You caught it early. That's the smartest thing you could do.",
  perimenopausal: "You stopped guessing and started acting. That's real strength.",
  post_menopausal: "You waited long enough. Today, you take the lead.",
  not_sure: "You didn't wait for a label to take yourself seriously. That's everything.",
};

const HRT_OPTIONS = [
  { id: "currently", label: "I am currently taking HRT", image: "/quiz/hrt/current.webp" },
  { id: "past", label: "I have taken HRT in the past", image: "/quiz/hrt/past.webp" },
  { id: "never", label: "I have never taken HRT", image: "/quiz/hrt/never.webp" },
];

// Asked right after height/weight so the whole body block sits together, and it
// feeds the movement side of her plan (plus the "Lose weight" goal).
//
// Asked as *time available*, not as a self-rated fitness rank. A 50-year-old
// grading herself "Beginner / Intermediate / Advanced" is being asked to file a
// verdict on her own body at the point in the funnel where she is already being
// told her symptoms are winning - and the answer she gives is a mood, not a
// fact. Time is a fact she knows, and it is the thing that actually decides
// whether she finishes eight weeks.
//
// The ids are unchanged and load-bearing (user_profiles, the mobile app,
// `allowedExercises()` and `MOVEMENT_VOLUME` in `lib/plan/catalog.ts`), so plan
// generation is untouched. The relabel is honest rather than cosmetic because
// each label states that id's real `MOVEMENT_VOLUME` entry:
//   movement_snacks 3 one-move bursts, ~5 min/day · beginner 2x20-25 · medium 3x30-40 · advanced 4x35-45.
// Change a number here only if you change it there too. The label names the
// strength sessions; the cardio the plan schedules on top (`CARDIO_VOLUME`) is
// spelled out on the `reward_plan_shape` screen a few taps later.
//
// **They became ranges on 2026-08-29**, because the session did: `minutes` is
// the ordinary session and `maxMinutes` the one that also carries the power
// block, so a single number could only ever have been true half the time. Two
// of the three were already wrong before that — medium read "About 30" against
// a 28-minute ceiling, and advanced read "35+" against a hard maximum of
// exactly 35, which is the one direction the trimmer can never deliver. A range
// is the only shape that is true on both kinds of day.
//
// Ordered by ascending time, so the four read as one ladder. `movement_snacks`
// leads because it is the smallest ask, and it is the honest home for the woman
// who would otherwise pick "Beginner" and get twice the sessions she has room
// for.
const FITNESS_OPTIONS = [
  { id: "movement_snacks", label: "A few minutes, spread out", image: "/quiz/fitness/movement-snacks.webp" },
  { id: "beginner", label: "20-25 min, 2 days a week", image: "/quiz/fitness/beginner.webp" },
  { id: "medium", label: "30-40 min, 3 days a week", image: "/quiz/fitness/medium.webp" },
  { id: "advanced", label: "35-45 min, 4 days a week", image: "/quiz/fitness/advanced.webp" },
];

// When she actually has room to move, which is a different question from how
// much room she has (FITNESS_OPTIONS above).
//
// One consumer: the app's movement reminder, which is a local notification on
// her phone and can therefore be given a time of day at all - see
// `src/lib/reminders` in the mobile repo and docs/mobile-app-changes.md §15.
// A reminder to train that arrives four hours after the only window she had is
// worse than no reminder, and the honest way to find that window is to ask.
//
// Deliberately not asked as a clock time. She is picking the shape of her day,
// not scheduling an appointment, and three named parts of a day are answerable
// in one tap by a woman who does not yet know what her plan asks of her. The
// exact minute each maps to lives in the app (`TRAINING_TIMES`), where it can be
// changed without another migration, and she can move it in Settings.
//
// The ids are load-bearing: `user_profiles.training_time` constrains them, and
// the app switches on them.
const TRAINING_TIME_OPTIONS = [
  { id: "morning", label: "Morning", hint: "Before the day gets hold of me" },
  { id: "midday", label: "Midday", hint: "Around lunch, or a break in the afternoon" },
  { id: "evening", label: "Evening", hint: "Once everything else is done" },
];

// Sunrise gold, midday blue, dusk violet - the light at that hour, so the three
// rows read as one day passing. She is picking the shape of her day (see the
// note above), and this is the fastest way to say so without a photograph.
const TRAINING_TIME_TONE: Record<string, ChoiceTone> = {
  morning: {
    idle: "border-[#E8A33D]/30 hover:border-[#E8A33D]/70 hover:bg-[#E8A33D]/5",
    selected: "border-[#E8A33D] bg-[#E8A33D]/10 shadow-md shadow-[#E8A33D]/20",
    dot: "bg-[#E8A33D]",
    label: "text-[#A9741A]",
    chip: "bg-[#E8A33D]/10 text-[#E8A33D]",
    Icon: Sunrise,
  },
  midday: {
    idle: "border-[#3E8FD0]/30 hover:border-[#3E8FD0]/70 hover:bg-[#3E8FD0]/5",
    selected: "border-[#3E8FD0] bg-[#3E8FD0]/10 shadow-md shadow-[#3E8FD0]/20",
    dot: "bg-[#3E8FD0]",
    label: "text-[#2A6DA9]",
    chip: "bg-[#3E8FD0]/10 text-[#3E8FD0]",
    Icon: Sun,
  },
  evening: {
    idle: "border-[#7B5FC7]/30 hover:border-[#7B5FC7]/70 hover:bg-[#7B5FC7]/5",
    selected: "border-[#7B5FC7] bg-[#7B5FC7]/10 shadow-md shadow-[#7B5FC7]/20",
    dot: "bg-[#7B5FC7]",
    label: "text-[#5C449F]",
    chip: "bg-[#7B5FC7]/10 text-[#7B5FC7]",
    Icon: Sunset,
  },
};

// Where her eating actually starts, so the plan's nutrition focus opens at her
// level instead of at week one of a textbook. Deliberately blame-free wording -
// "skipping meals" is a description, not a verdict.
const NUTRITION_STYLE_OPTIONS = [
  { id: "skipping", label: "Skipping meals / on the run", image: "/quiz/nutrition/skipping.webp" },
  { id: "convenience", label: "Mostly convenience food", image: "/quiz/nutrition/convenience.webp" },
  { id: "inconsistent", label: "Balanced, but inconsistent", image: "/quiz/nutrition/inconsistent.webp" },
  { id: "intentional", label: "Already intentional about it", image: "/quiz/nutrition/intentional.webp" },
];

// The relaxation pillar needs a starting point too. "I want to build one but
// don't know where to start" is the answer the plan was built for, so it's a real
// option rather than a polite version of "no".
const RELAXATION_STYLE_OPTIONS = [
  { id: "none", label: "I don't, really", image: "/quiz/relaxation/none.webp" },
  { id: "occasional", label: "Occasionally", image: "/quiz/relaxation/occasional.webp" },
  { id: "routine", label: "I have a routine", image: "/quiz/relaxation/routine.webp" },
  { id: "want_to", label: "I want to start", image: "/quiz/relaxation/wanttostart.webp" },
];

// `q_limitations` - "Does anything hurt or hold you back when you move?" - was
// removed from the funnel on 2026-08-29, along with the exercise-pool filter it
// fed (`LIMITATION_EXCLUDES` in `lib/plan/catalog.ts`).
//
// The reason is scope, not friction. A woman who tells us her knee hurts needs a
// clinician, and an unsupervised eight-week plan generated from six checkboxes
// is not one. Asking the question implies we can serve her safely; the product
// is not built to, so she is out of scope rather than accommodated.
//
// Restoring it is a three-ended change - the options here, `PHYSICAL_LIMITS` in
// `app/api/auth/save-quiz/route.ts` and the rules in the catalog - and all three
// have to come back together. `git log` has the lists.

// Shared option-tile footer styles - every quiz label is the same size, aligned,
// and readable. The fixed min-height keeps footer bars level across a row even
// when one label wraps to two lines; min-w-0 lets long labels wrap instead of
// pushing the arrow off the tile.
const TILE_FOOTER_BASE = "shrink-0 flex items-center px-2.5 py-1.5 min-h-[2.5rem]";
const TILE_LABEL = "font-semibold text-[11px] leading-tight text-white min-w-0";

// ─── The calculating screen ─────────────────────────────────────────────────
// This loader is not a spinner, it is the receipt for the price. She is about to
// be asked $59 for a plan whose entire claim is that it was built from her 13
// answers, and the only evidence she will ever get that any computation happened
// is the time this screen takes and what it says while it runs.
//
// It used to run 3 seconds across 3 messages on a 1s interval, which meant the
// one line that names the product - "Designing your plan..." - was on screen for
// a single second before a hard cut to results. Three seconds does not read as
// work; it reads as a transition. Now it runs 6.5s with a visible percentage, so
// the wait is legible as progress rather than as lag.
//
// Not longer than that: past ~8s a loader stops buying credibility and starts
// buying abandonment, and she has already spent two minutes on the quiz.
const CALCULATING_MS = 6500;

// Named steps, so the wait reads as a sequence of things being done to her
// answers rather than one indeterminate pause. The last two name the product.
const LOADING_MESSAGES = [
  "Reading your answers...",
  "Comparing you to thousands of women like you...",
  "Matching habits to your symptoms...",
  "Building your 8 weeks...",
  "Almost ready...",
];

// Distinct color per loading state (smooth, on-brand).
const LOADING_MESSAGE_COLORS = [
  "#E91E8C", // vivid pink
  "#0EA5E9", // vivid sky blue
  "#7C3AED", // vivid purple
  "#0EA5E9", // vivid sky blue
  "#E91E8C", // vivid pink
];

// The counter climbs to this and waits. It never shows 100: the screen advances
// the instant the save lands, so a visible 100 would either be a lie about work
// still in flight or a frame of dead air. Stalling at 99 is the honest version
// of both, and on a slow network it is also the only thing telling her the page
// has not frozen.
const CALCULATING_MAX_PCT = 99;

// ─── The mid-quiz loaders ───────────────────────────────────────────────────
// The same instrument as the screen above, run short. Three of them sit inside
// the quiz (see REWARD_STEPS), and the only thing separating them from theatre
// is that every number they print is either a count of her own answers or a
// value the plan generator actually uses. Nothing here invents a statistic
// about her - that is the line `estrogenPct` crossed and was removed for.
//
// 1.7s over three captions is ~570ms a line, which is the floor for a
// four-word phrase to be read rather than glimpsed. Shorter and the captions
// are a blur; longer and three of them start costing real completion.
// The scroll shell every reward payoff sits in, and the centring that goes on
// the payoff rather than on the shell.
//
// The shell used to carry `justify-center`, which centres a payoff taller than
// the viewport *and clips both ends of it* - the top of the board ends up above
// scrollTop 0, where no scroll can reach it. Measured on 375x557 (the small-phone
// in-app browser): board 1 overflowed by 33px and lost its header and its
// sign-off. `my-auto` on the child centres exactly the same way while there is
// free space and collapses to nothing when there is not, so a tall payoff simply
// scrolls from its own top.
//
// `overflow-x-clip`, and it is not cosmetic. The payoff bloom in <RewardPaper />
// is an absolutely positioned wash sitting a few px outside the card's box, and
// a box that overflows the *right* edge of a scroll container is scrollable
// overflow - so without this the reward screens would gain a horizontal scroll
// on every phone. `clip` rather than `hidden` on purpose: `hidden` on one axis
// forces the other to `auto`, `clip` leaves `overflow-y` exactly as written, so
// vertical scrolling (the thing this shell exists for) is untouched.
const REWARD_SCROLL_SHELL = "flex-1 min-h-0 overflow-y-auto overflow-x-clip flex flex-col";
const REWARD_PAYOFF_CENTER = "my-auto w-full shrink-0";

// 600ms, down from 1700 (2026-09-02). Four reward boards carry this meter, so
// the old value spent ~6.8s of the funnel showing a progress bar over work that
// does not exist - every figure on these boards is computed synchronously from
// answers already in state. The receipt is worth keeping (a reveal with no
// visible work in front of it reads as a poster, which is why the meter was
// added), but the receipt is the *animation*, not its length: 600ms still reads
// as "it computed something" and returns six seconds to a funnel that asks for
// 26 taps before it shows a price.
//
// The 6.5s `CALCULATING_MS` is deliberately NOT cut to match: that one has a
// real network round trip behind it (anonymous sign-in + save-quiz), and it is
// the only screen in the funnel where the wait is honest.
const QUIZ_LOADER_MS = 600;

// Unlike the calculating screen this one really does reach 100: there is no
// work in flight behind it, so stalling at 99 would be the dishonest option.
const QUIZ_LOADER_MAX_PCT = 100;

const QUIZ_LOADER_COLORS = ["#E91E8C", "#0EA5E9", "#7C3AED"];

// Where her plan opens on each pillar, keyed off the answer she just gave.
// Directional descriptions of what the plan does, not claims about her.
const NUTRITION_START: Record<string, string> = {
  skipping: "One real meal, anchored first",
  convenience: "Swaps, not a new diet",
  inconsistent: "Your good days, made repeatable",
  intentional: "Fine-tuned, not rebuilt",
};

const RELAXATION_START: Record<string, string> = {
  none: "Built from scratch, 3 min",
  occasional: "Turned into a daily one",
  routine: "Kept, aimed at your symptoms",
  want_to: "Started this week, no experience",
};

/**
 * `lib/plan/catalog.ts` on demand.
 *
 * Two of the three loaders print a number that only the catalog knows -
 * `MOVEMENT_VOLUME` and `CARDIO_VOLUME` for her weekly minutes,
 * `allowedExercises()` for the size of her pool. Importing it statically would put the whole exercise,
 * nutrition and relaxation dataset into the chunk that has to parse before
 * question 1 is tappable, which is the cost this page already goes out of its
 * way to avoid for the paywall and the plan stage.
 *
 * So it is a chunk, warmed from `q_body` - four steps before the first loader
 * that needs it. By the time a meter is running it has been in the module cache
 * for a minute; the `ready` gate below is for the case where it isn't.
 */
type PlanCatalog = typeof import("@/lib/plan/catalog");
const loadPlanCatalog = () => import("@/lib/plan/catalog");
let planCatalogCache: PlanCatalog | null = null;

function warmPlanCatalog() {
  if (planCatalogCache) return;
  void loadPlanCatalog().then((m) => {
    planCatalogCache = m;
  });
}

function usePlanCatalog(): PlanCatalog | null {
  const [catalog, setCatalog] = useState<PlanCatalog | null>(planCatalogCache);
  useEffect(() => {
    if (catalog) return;
    let alive = true;
    void loadPlanCatalog().then((m) => {
      planCatalogCache = m;
      if (alive) setCatalog(m);
    });
    return () => {
      alive = false;
    };
  }, [catalog]);
  return catalog;
}

// The "What have you tried" step was removed from the funnel. The field stays in
// the save-quiz payload (the Expo app still asks it, and every existing row
// carries a value), so web signups write an empty list. Frozen at module scope
// rather than held in a never-set `useState`: a stable identity keeps it out of
// the memo dependency lists that build the payload.
const TRIED_OPTIONS: string[] = [];

// Images shown on each step, so we can preload the *next* step while the user
// answers the current one (next/image lazy-loads, so otherwise tiles flash blank
// on every step change - bad for a conversion funnel).
const STEP_IMAGES: Partial<Record<Step, string[]>> = {
  q1_age: AGE_OPTIONS.map((o) => o.image),
  q2_here_for: HERE_FOR_OPTIONS.map((o) => o.image),
  q4_symptoms: PROBLEM_OPTIONS.map((o) => o.image),
  q3_goals: GOAL_OPTIONS.map((o) => o.image),
  // The three reward steps preload nothing: they render lucide icons now, which
  // ship in the JS chunk that is already parsed by the time she reaches them.
  q_fitness: FITNESS_OPTIONS.map((o) => o.image),
  q_nutrition: NUTRITION_STYLE_OPTIONS.map((o) => o.image),
  q_relaxation: RELAXATION_STYLE_OPTIONS.map((o) => o.image),
  q5_hrt: HRT_OPTIONS.map((o) => o.image),
  q8_name: [`/quiz/${QUIZ_ILLUSTRATION.q8_name}`],
};

// Screenshots of the plan itself. Every one of these has to be *read* rather
// than glanced at - they all run at hero size through one bezel, so none of them
// is decoration. `day` still leads: it carries "Day 1 · Week 1", the phase name,
// and all four pillars with real progress on them, which is the entire offer in
// one frame. The rest each answer one question that frame raises.
const PLAN_SHOTS = {
  day: "/screenshots/screen1.webp",
  movement: "/screenshots/movement.webp",
  nutrition: "/screenshots/screen2.webp",
  habits: "/screenshots/screen3.webp",
  progress: "/screenshots/progress.webp",
  rewards: "/screenshots/screen4.webp",
};

// Every master in /screenshots is used, here or by the paywall. Two rules worth
// keeping when the next batch of captures lands, both learned from the three
// that were deleted rather than wired in:
//
// - **Capture a day with work done on it.** Two of them were `day` and
//   `nutrition` caught with the tasks untouched (0/4, 0/10, 0/1). This carousel
//   is proof that the plan runs, and an empty checklist argues the opposite.
// - **A screen that restates a slide is not a slide.** The third was the
//   "Achievement unlocked" modal - the best-looking frame of the set, and the
//   same point `rewards` already makes with confetti over it. Each slide here
//   answers a different objection; a seventh costs three more seconds of a loop
//   she is unlikely to finish as it is.

// SHOT_W / SHOT_H (the intrinsic size of the /screenshots masters) live in
// components/PhoneShots.tsx alongside <PhoneShot /> and <ShotStage />, which the
// paywall still uses - this screen shows every shot at hero size now, so it no
// longer renders either.

// The hero's `sizes`, hoisted out of <PlanHeroCarousel /> because the preloader
// below has to pass the *identical* string. A preload that declares a different
// layout width than the <img> resolves to a different candidate in the srcset,
// which is a second full download of the same shot - and a cold one, at the
// moment she's looking at it.
const PLAN_HERO_SIZES = "(max-width: 480px) 56vw, 208px";

// The screens <PlanHeroCarousel /> walks through, in the order she needs them:
// the day she gets, then the surfaces that run it. All are shown at hero size
// inside one static bezel - see the component for why they are no longer a hero
// plus a tilted trio.
//
// Order is the argument, so it is worth stating. It runs outward from one day to
// eight weeks, and each slide answers the objection the one before it raises:
//
//   day       the whole offer in one frame - four pillars, real progress
//   movement  "what is a session, actually?" - three moves, about five minutes,
//             which is the answer to the fear that this needs a gym and an hour
//   nutrition "so what do I eat?" - a list, with a reason on every row
//   habits    "and the rest of my life?" - one small thing, her pick
//   progress  "where does this go?" - the eight weeks the headline promises,
//             drawn, with the three pillars tracked separately
//   rewards   "but will I keep doing it?" - the objection she only arrives at
//             once she has believed all of the above, which is why it is last
const PLAN_HERO_SLIDES: ReadonlyArray<{ src: string; caption: string; alt: string }> = [
  {
    src: PLAN_SHOTS.day,
    caption: "Day 1, already built",
    alt: `Day 1 of your personalized ${PLAN_WEEKS}-week plan in the MenoLisa app, showing movement, nutrition, relaxation and habit tasks`,
  },
  {
    src: PLAN_SHOTS.movement,
    caption: "Five minutes, not an hour",
    alt: "A movement session in the MenoLisa app: three exercises, about five minutes, with a start button",
  },
  {
    src: PLAN_SHOTS.nutrition,
    caption: "What to eat today, as a list",
    alt: "The nutrition list for today in the MenoLisa app, with each row explained",
  },
  {
    src: PLAN_SHOTS.habits,
    caption: "One small habit at a time",
    alt: "Your habits in the MenoLisa app, with suggestions you can add",
  },
  {
    src: PLAN_SHOTS.progress,
    caption: `All ${PLAN_WEEKS} weeks, tracked`,
    alt: `Progress across all ${PLAN_WEEKS} weeks in the MenoLisa app, with movement, nutrition and relaxation tracked separately`,
  },
  {
    src: PLAN_SHOTS.rewards,
    caption: "Streaks that keep you going",
    alt: "Streaks, levels and badges in the MenoLisa app",
  },
];

// Real app screenshots used on the plan step. Preloaded while she reads her
// results so the phone shots are already cached and don't pop in one by one.
// The hero is first: it is the one that must never be seen loading.
//
// Derived from the slide list rather than written out again, so a shot can never
// be preloaded at a `sizes` the <img> doesn't declare - that resolves a different
// candidate out of the srcset, i.e. a second cold download of the shot the
// preload existed to warm. Every slide is now hero-sized, so there is one string.
const DIAGNOSIS_SHOTS: ReadonlyArray<{ src: string; sizes: string }> = PLAN_HERO_SLIDES.map(
  ({ src }) => ({ src, sizes: PLAN_HERO_SIZES })
);

// Build the same URL next/image requests, so the preload warms both the Vercel
// optimizer cache and the browser HTTP cache (640/828 cover phone + desktop).
const optimizedImageUrl = (src: string, w: number) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

// Preload a responsive image the way the browser will actually request it.
//
// The old warm-up did `new Image(); img.src = optimizedImageUrl(src, 640)`, which
// guesses one candidate out of the srcset - and the guess is wrong on any phone
// dense enough to need another. The hero declares `56vw`, so next/image offers
// 384/640/750/828/1080/1200/1920w; a 390px viewport at 3x DPR needs 655px and the
// browser therefore picks 750w. The warm-up was fetching a URL nothing on the
// page ever asks for, and the one shot that must never be seen loading loaded
// cold every time.
//
// So don't guess. `getImageProps()` runs the same loader <Image> does, and
// `imagesrcset`/`imagesizes` hand the whole candidate list back to the browser to
// resolve - it makes the same choice twice by construction, and the URL stays
// right if the device sizes, the quality default or the loader ever change.
//
// Deliberately never removed or cancelled: the old cleanup set `img.src = ""` on
// phase change, and phase change is precisely when these stop being a preload and
// become the screen, so the abort landed on the fetch it was warming.
const preloadedResponsive = new Set<string>();

function preloadResponsiveImage(src: string, sizes: string) {
  if (typeof document === "undefined" || preloadedResponsive.has(src)) return;
  preloadedResponsive.add(src);
  // Both callers are /screenshots masters. width/height only steer the candidate
  // list when `sizes` carries no vw unit - these all do - but pass the real
  // intrinsic size anyway so this stays correct for a fixed-width caller.
  const { props } = getImageProps({ src, alt: "", width: SHOT_W, height: SHOT_H, sizes });
  if (!props.srcSet) return;
  const resolvedSizes = props.sizes ?? sizes;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.setAttribute("imagesrcset", props.srcSet);
  link.setAttribute("imagesizes", resolvedSizes);
  document.head.appendChild(link);

  // Fetching is only half of the work. These masters are 1320x2868, and a cache
  // hit that still has to be *decoded* paints a frame or two after the element
  // mounts - which on the hero is precisely the pop the preload exists to
  // prevent. So resolve the same candidate again into a detached <img> (sizes
  // before srcset, so the browser picks with the layout width already known) and
  // decode it now, while she is still on results with nothing else to do.
  //
  // The promise keeps the element alive until the decode lands; nothing cancels
  // it, for the same reason nothing cancels the link above.
  const img = new window.Image();
  img.sizes = resolvedSizes;
  img.srcset = props.srcSet;
  if (props.src) img.src = props.src;
  void img.decode().catch(() => {});
}

/** Fallback severity for the results copy, from total symptom burden alone.
 *  Only used when she skipped the impact tap - normally her own Mild/Moderate/
 *  Severe answer is what drives that copy. The duration input this used to take
 *  is gone with q6_how_long. */
function deriveSeverity(totalBurden: number): "mild" | "moderate" | "severe" {
  if (totalBurden >= 10) return "severe";
  if (totalBurden >= 6) return "moderate";
  return "mild";
}

// No email/OTP phase: the funnel never asks her to leave for an inbox. The
// account is created silently (Supabase anonymous sign-in) while the
// calculating loader runs, and Stripe Checkout collects the email at payment -
// the webhook then stamps it onto that same user id. See
// `completeRegistration()` below and `resolveCheckoutAccount()` in the Stripe
// webhook.
// There is no `nutrition` phase. It was its own phase between `relief` and
// `paywall`, then the second half of `relief`, and was removed outright on
// 2026-08-17 - see the ReliefStage note below.
type Phase =
  | "quiz"
  | "calculating"
  | "results"
  | "diagnosis"
  | "relief"
  | "paywall"
  | "download";

/**
 * The resume ticket - what brings her back to the paywall after Stripe, instead
 * of back to question 1.
 *
 * Tapping the card sends her to `checkout.stripe.com`, another origin. Pressing
 * Back there usually restores this page from bfcache with every bit of React
 * state intact, and nothing below runs. But bfcache is a courtesy, not a
 * guarantee - one `no-store` response, a memory-pressured phone, a browser that
 * declines - and when it misses, this page reloads. The answers live in React
 * state, so a reload is a wiped funnel: the woman who hesitated for four seconds
 * at a payment form came back to question 1 and a twelve-question quiz she had
 * just finished. She does not do it twice.
 *
 * So `handleStartCheckout` stamps a ticket the moment before it leaves for
 * Stripe, and a load that finds a fresh one reopens the paywall on the same
 * account with the same answers.
 *
 * Three properties keep this from reintroducing the cold-paywall bug that
 * removed `?phase=paywall` (see the phase initializer):
 *
 * - **It is written after she has an account, never before.** The only writer
 *   is the checkout handler, which runs downstream of `completeRegistration()`
 *   and re-verifies the session; the ticket carries that user id, and a ticket
 *   without one is discarded. So a restored paywall is always a paywall on an
 *   account whose `user_profiles` row is already saved - there is no path here
 *   to checking out on a blank account and being handed the generic plan.
 * - **It expires.** An hour, so a stale tab reused for a fresh ad click lands on
 *   question 1 like any other ad click, which is where a paid click belongs.
 * - **It is per-tab.** `sessionStorage`, so it dies with the tab and never
 *   follows her to tomorrow's visit.
 *
 * This is a copy of her answers in browser storage, which the funnel deliberately
 * had none of - the old `pending_quiz_answers` stash was removed in 2026-08-16
 * because all three of its call sites were `removeItem` and nothing ever read it
 * back. This one is read back, by `readFunnelResume()` below, and it is cleared
 * the moment it stops being useful: on the download screen (she has paid) and on
 * a quiz restart.
 */
const FUNNEL_RESUME_KEY = "menolisa:funnel-resume";
const FUNNEL_RESUME_MAX_AGE_MS = 60 * 60 * 1000;

type FunnelAnswers = {
  ageBand: string;
  heightUnit: "cm" | "ft";
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weightUnit: "kg" | "lb";
  weightKg: string;
  weightLb: string;
  fitnessLevel: string;
  trainingTime: string;
  hereFor: string;
  menopauseType: string;
  goal: string[];
  symptomSeverity: Record<string, number>;
  symptomImpact: string;
  hrtStatus: string;
  nutritionStyle: string;
  relaxationStyle: string;
  firstName: string;
};

type FunnelResume = { ts: number; userId: string; answers: FunnelAnswers };

const resumeStr = (v: unknown): string => (typeof v === "string" ? v : "");
const resumeStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Insertion order is the answer, not just the shape: `topProblems` is
 * `Object.keys(symptomSeverity)` and its first entry is the symptom she tapped
 * first, which is the one the follow-up severity question rated. JSON preserves
 * key order for non-integer keys and symptom ids are words, so a round trip
 * keeps it.
 */
const resumeSeverity = (v: unknown): Record<string, number> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [id, level] of Object.entries(v as Record<string, unknown>)) {
    if (typeof level === "number" && Number.isFinite(level)) out[id] = level;
  }
  return out;
};

/**
 * Read the ticket back, or null. Every field is re-validated rather than cast:
 * this is user-writable storage, and a hand-edited value that reaches the render
 * is a white screen on the one page that takes money.
 */
function readFunnelResume(): FunnelResume | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FUNNEL_RESUME_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { ts, userId, answers } = parsed as Record<string, unknown>;
    if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
    // A future timestamp is a clock change or a tampered value; treat both as no
    // ticket rather than as a ticket that never expires.
    const age = Date.now() - ts;
    if (age < 0 || age > FUNNEL_RESUME_MAX_AGE_MS) return null;
    if (typeof userId !== "string" || !userId) return null;
    if (!answers || typeof answers !== "object") return null;
    const a = answers as Record<string, unknown>;
    return {
      ts,
      userId,
      answers: {
        ageBand: resumeStr(a.ageBand),
        // Fallbacks match the imperial state seeds above, so a ticket missing
        // the field restores the same units she was shown.
        heightUnit: a.heightUnit === "cm" ? "cm" : "ft",
        heightCm: resumeStr(a.heightCm) || "165",
        heightFt: resumeStr(a.heightFt) || "5",
        heightIn: resumeStr(a.heightIn) || "5",
        weightUnit: a.weightUnit === "kg" ? "kg" : "lb",
        weightKg: resumeStr(a.weightKg) || "70",
        weightLb: resumeStr(a.weightLb) || "154",
        fitnessLevel: resumeStr(a.fitnessLevel),
        trainingTime: resumeStr(a.trainingTime),
        hereFor: resumeStr(a.hereFor),
        menopauseType: resumeStr(a.menopauseType),
        goal: resumeStrArray(a.goal),
        symptomSeverity: resumeSeverity(a.symptomSeverity),
        symptomImpact: resumeStr(a.symptomImpact),
        hrtStatus: resumeStr(a.hrtStatus),
        nutritionStyle: resumeStr(a.nutritionStyle),
        relaxationStyle: resumeStr(a.relaxationStyle),
        firstName: resumeStr(a.firstName),
      },
    };
  } catch {
    // Private mode, a full quota, malformed JSON. Losing the ticket costs her a
    // restart; throwing here would cost her the page.
    return null;
  }
}

function writeFunnelResume(userId: string, answers: FunnelAnswers) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      FUNNEL_RESUME_KEY,
      JSON.stringify({ ts: Date.now(), userId, answers } satisfies FunnelResume)
    );
  } catch {
    // Storage refused. She keeps the funnel she is standing in; only the Back
    // path degrades to what it did before this existed.
  }
}

function clearFunnelResume() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(FUNNEL_RESUME_KEY);
  } catch {
    // Nothing to do, and nothing depends on it having worked.
  }
}

/* ─── Funnel measurement ────────────────────────────────────────────────────
 *
 * One ping per screen reached, to `POST /api/funnel-step`. See that route for
 * the payload rules and why it is unauthenticated.
 *
 * This exists because the funnel had no measurement at all between the ad click
 * and the profile insert at step 17 of 17. The first campaign bought ~200
 * landing page views and produced 10 profiles, and nothing in the database could
 * say where the other 190 went — so every candidate (the length, the metric
 * units, the iOS viewport overshoot) was equally plausible and none of them was
 * testable.
 *
 * It is not a Meta event and must not become one: AEM caps the domain at 8
 * prioritized events, which is why the seven custom funnel events were deleted
 * on 2026-08-17. "Which screen leaks" is a product question, answered in our own
 * database.
 */
const FUNNEL_SESSION_KEY = "menolisa:funnel-session";

/**
 * A random id for this visit. Not an account and not a device id: it lives in
 * `sessionStorage`, so it dies with the tab and never links two visits.
 *
 * Returns null when storage or `randomUUID` is unavailable rather than falling
 * back to something weaker — a measurement that cannot identify a visit is not
 * worth a row, and in-app webviews are exactly where a half-working id would
 * quietly corrupt the drop-off curve this table exists to draw.
 */
function funnelSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(FUNNEL_SESSION_KEY);
    if (existing) return existing;
    if (typeof crypto?.randomUUID !== "function") return null;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(FUNNEL_SESSION_KEY, id);
    return id;
  } catch {
    // Private mode, storage disabled, quota. Losing the measurement costs a row;
    // throwing here would cost her the page.
    return null;
  }
}

const FUNNEL_QA_KEY = "menolisa:funnel-qa";

/**
 * True when this visit is a QA run, which must leave no trace in the curve.
 *
 * Set by `?qa=1` on any load of `/register`, then remembered for the rest of the
 * tab. Remembering is the whole point: the funnel is one page and the parameter
 * does not survive the phase machine, and the Stripe round-trip returns to
 * `?phase=download` — so re-reading the URL on every ping would stop skipping
 * halfway through the run and record the half that matters most.
 *
 * Scope is `funnel_events` only. Suppressing Meta is Global Privacy Control's
 * job (`lib/privacySignals.ts`), already wired to all five call sites; a second
 * mechanism aimed at the same events is how one of them ends up unguarded.
 */
function isQaSession(): boolean {
  if (typeof window === "undefined") return false;
  const fromUrl = new URLSearchParams(window.location.search).get("qa") === "1";
  try {
    if (fromUrl) {
      window.sessionStorage.setItem(FUNNEL_QA_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(FUNNEL_QA_KEY) === "1";
  } catch {
    // Private mode, storage disabled, quota. The URL alone still marks the run
    // for as long as the parameter is on screen.
    return fromUrl;
  }
}

/**
 * Fire and forget. `keepalive` so a ping started as she taps through survives
 * the render that follows it, and every failure is swallowed: this is
 * instrumentation, and instrumentation must never be visible to the woman being
 * instrumented.
 */
function pingFunnelStep(step: string, stepIndex: number) {
  if (isQaSession()) return;
  const sessionId = funnelSessionId();
  if (!sessionId) return;
  try {
    void fetch("/api/funnel-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, step, step_index: stepIndex }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignored, deliberately.
  }
}

/**
 * Where each screen sits in the funnel, as one monotonic sequence, so the
 * drop-off curve can be read without knowing the phase machine at query time.
 *
 *   0        unused - the deleted start screen. Historical `funnel_events` rows
 *            still carry it; `INACTIVE_STEPS` in /api/admin/stats drops them.
 *   1..17    the quiz steps, in STEPS order
 *   18..23   the post-quiz screens, in POST_QUIZ_FUNNEL_STEPS order
 *
 * Capped well under the route's `MAX_STEP_INDEX` of 40, which leaves room for
 * screens to be added without the two files having to move together.
 */
const POST_QUIZ_BASE = 18;

/**
 * The post-quiz curve as the drop-off chart reads it — one row per phase.
 *
 * `relief` was split into `relief_intro` / `relief_running` / `relief_reward`
 * on 2026-09-03 and put back on 2026-09-04. The split was sound in principle —
 * the phase really is three screens — but it stranded the row: every session
 * already in the 30-day window is filed under the single `relief` key, so the
 * chart printed three near-empty rows next to a historical one and the whole
 * breathing step became unreadable at exactly the volume it was added to
 * measure. One key, one row, continuous with the data we already have.
 *
 * If the three screens are worth separating again, do it as a second chart off
 * the same table rather than by re-keying the row the curve depends on.
 *
 * Indices stay monotonic and under the route's `MAX_STEP_INDEX` of 40.
 * `funnel_dropoff` orders by the position each screen was **last** seen at, so
 * a window containing both numberings sorts by the current one rather than
 * blending two screens into a bucket.
 */
const POST_QUIZ_FUNNEL_STEPS = [
  "calculating",
  "results",
  "diagnosis",
  "relief",
  "paywall",
  "download",
] as const;

/**
 * `useLayoutEffect` on the client, `useEffect` on the server - the standard dodge
 * for React's "useLayoutEffect does nothing on the server" warning.
 *
 * The resume restore has to be a *layout* effect. A passive effect runs after
 * the browser has painted, so she would see question 1 flash before the paywall
 * replaced it - Back from a payment form, landing on a one-frame glimpse of the
 * quiz she already finished, which is the exact thing this is meant to prevent.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * How many pixels of the bottom of the screen the software keyboard is covering.
 *
 * A `position: fixed` bar is positioned against the **layout** viewport, and the
 * layout viewport does not shrink when a phone opens its keyboard — only the
 * *visual* viewport does. So a bottom-fixed CTA sits underneath the keyboard on
 * iOS Safari and inside the Meta in-app webview: present, painted, and
 * unreachable. That is not a styling nit, it is the entire way forward from
 * `q8_name` disappearing the moment she taps the box, and it measured at a 22%
 * loss on the last screen of the quiz.
 *
 * `window.innerHeight - (visualViewport.height + visualViewport.offsetTop)` is
 * the overlap, in CSS pixels. It is `0` with no keyboard, `0` on desktop, and
 * `0` on any browser without `visualViewport` — so the bar keeps its existing
 * behaviour everywhere the problem does not exist.
 *
 * Small values are ignored: iOS reports a pixel or two of drift mid-scroll while
 * the URL bar collapses, and reacting to that would jitter the CTA on every
 * screen in the funnel.
 */
const KEYBOARD_INSET_THRESHOLD_PX = 80;

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;
    const read = () => {
      const overlap = window.innerHeight - (vv.height + vv.offsetTop);
      setInset(overlap > KEYBOARD_INSET_THRESHOLD_PX ? Math.round(overlap) : 0);
    };
    read();
    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);
  return inset;
}

/**
 * Tap anywhere that isn't a control, and the keyboard goes away.
 *
 * `q8_name` is the only text input in the funnel, so this is the only screen
 * where the keyboard can cover anything. `keyboardInset` already lifts the CTA
 * clear of it, but a woman who has finished typing still has no obvious way to
 * put it down: iOS shows no "done" key above a plain text keyboard, so half the
 * screen - the illustration and the line telling her no email is needed - stays
 * hidden until she happens to hit Continue.
 *
 * The blur is skipped when the tap lands on a control, and that exclusion is
 * load-bearing rather than tidy. Dismissing the keyboard resizes the visual
 * viewport, the CTA bar drops with it (see `keyboardInset`), and the `click`
 * that would have followed this `pointerdown` then lands on whatever slid under
 * her finger - so blurring on a tap *at* the button is how you break the button.
 */
function useDismissKeyboardOnTap() {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      if (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA") return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target === active) return;
      if (target.closest("input, textarea, select, button, a, label, [role='button']")) return;
      active.blur();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
}


// Returns the sentence *after* the name, so the name can be rendered bold and
// the rest regular weight (name carries the emphasis, not the whole line).
//
// The severe line used to read ", this can't continue." - a verdict on her life,
// issued by a website she met four minutes ago. Delivered to a woman who has
// spent years being told what she should and shouldn't put up with, it lands as
// one more person telling her how to feel. Stating the finding instead lets her
// draw the conclusion, which is both less presumptuous and more persuasive: she
// arrives at "this can't continue" herself, and then it's hers.
//
// Split into three parts rather than returned as one string so the finding
// itself can carry the marker sweep. This is the most loaded headline in the
// funnel - her name, then the verdict - and until 2026-08-17 it was the only
// headline in the funnel with no highlight on it at all, while the three on the
// plan screen one tap later all had one. The swept phrase is deliberately the
// finding and not the name: the name is already bold, and sweeping both would
// leave the line with no hierarchy again.
type SeverityHeadline = { pre: string; sweep: string; post: string };

const getSeverityHeadline = (severity: string): SeverityHeadline => {
  switch (severity) {
    // The terminal full stop rides *inside* the sweep. The sweep is an
    // inline-block, so a phrase that wraps fills the line and anything after it
    // starts a new one - which left the period alone on a line of its own,
    // centred, reading as a stray bullet under the headline.
    case "severe":
      return { pre: ", this is ", sweep: "worse than you've been told.", post: "" };
    case "moderate":
      return { pre: ", ", sweep: "I need to be honest", post: " with you." };
    case "mild":
    default:
      return { pre: ", let's talk about ", sweep: "what's really going on.", post: "" };
  }
};

// Bolded fragments carry the whole message when she skims: the count, the cost,
// and the turn. The connective tissue between them stays light on purpose.
const PainEmphasis = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-bold text-[#3D3D3D]">{children}</strong>
);

// One line, not four.
//
// This used to run to a short paragraph per severity - "you've probably tried
// to explain it to people who don't get it", "affecting your work, your mood,
// your relationships". All true, all well written, and all of it telling her
// what her own life is like at the exact moment she is scrolling to find out
// what we *found*. She lived it; she does not need it narrated back at
// four lines. What she needs from this slot is the turn: it's real, it has a
// cause, and it is fixable. Everything below the headline earns its place by
// being new information, and empathy copy is not information.
const getSeverityPainText = (
  severity: string,
  symptomCount: number,
  name: string
): React.ReactNode => {
  const displayName = name || "you";
  const symptomWord = symptomCount === 1 ? "symptom" : "symptoms";
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
          {count}, and {theyIt}&apos;re running your days. {displayName}, this isn&apos;t your new
          normal - <PainEmphasis>it&apos;s treatable</PainEmphasis>.
        </>
      );
    case "moderate":
      return (
        <>
          {count}, costing you energy every single day. {displayName}, that&apos;s{" "}
          <PainEmphasis>energy you can get back</PainEmphasis>.
        </>
      );
    case "mild":
    default:
      return (
        <>
          {count}, manageable today. Left alone {theyIt} usually{" "}
          <PainEmphasis>get{symptomCount === 1 ? "s" : ""} worse</PainEmphasis> - {displayName},
          this is the easiest it will ever be to turn around.
        </>
      );
  }
};


// Results-step sub: she's here to SEE her results, not to be sold. No price,
// no "membership", no "guarantee" - any of those reads as a sales tell and
// breaks trust. Keep it pure forward motion toward her own answers.
//
// It used to promise understanding: "See the why behind your symptoms." That is
// the wrong noun. She did not come here to understand hot flashes, she came to
// stop having them, and the thing we sell is a plan rather than an explanation.
// Naming the plan here also closes the loop the ad opened ("your personalized
// 8-week plan, built around your symptoms") - the promised object finally exists
// and the next tap opens it.
const RESULTS_CTA_SUB = "Look what Lisa prepared for you.";

// The funnel's one forward-tap look: gradient, dark ink, pink glow. It was
// pasted inline at five call sites (results, plan, relief, the quiz's Next bar,
// and the deleted start screen) and drifting apart by a hex digit was only a
// matter of time. Every button that moves her one screen closer to the plan wears this;
// nothing else does.
const CTA_GRADIENT_STYLE = {
  background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)",
  boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)",
} as const;

// The class half of the same button. Kept next to the style so the two can't be
// updated apart. Callers add their own width/height where it differs (the start
// screen's is min-h-13).
const CTA_GRADIENT_CLASS =
  "w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg";

// Doorstep to the paywall. This line used to lead with the price and the
// adherence threshold, which sells before she has agreed to look - and the
// paywall itself already states both, in full, one tap later. Her objection
// here isn't "is it worth $59", it's "is this tap the one that costs me
// something". So the line answers only that, and lets the paywall sell.
//
// "Free to look" was the wrong way to say it. One tap before a hard paywall,
// "free" is the word she carries onto the next screen, and it primes a free
// tier that does not exist - so the price reads as a bait rather than as the
// offer. Naming what the next screen actually contains (the plan *and* the
// price) sets her up to see exactly what she then sees.
//
// **It stopped being about the price on 2026-08-30.** "See your plan and the
// price. No card needed to look." was written to answer the fear of the tap,
// and by the time she reads it that fear is already gone: she has finished the
// quiz, read the diagnosis, breathed for thirty-six seconds and watched a
// toolkit open with one of four entries unlocked. What the line was doing
// instead was framing the next screen as a browse - and "just looking" is the
// lowest-commitment state you can walk someone into the one screen that needs
// the highest.
//
// The screen it sits on has just opened a loop (<ToolkitStack /> renders three
// locked rows), so the line closes it. That is the same forward motion in a
// state she is already in, rather than a reassurance about a risk she has
// stopped weighing. The paywall states the price in full, immediately, in its
// own headline and price card - nothing here is hidden by not naming it, and
// the "no card needed" promise is kept by the screen itself.
function getCtaCopy(): { sub: string } {
  return { sub: `${RELIEF_TOOLKIT_SIZE - 1} more tools waiting inside.` };
}
// First-person CTA label driven by her #1 goal (multi-select; first = primary).
// Used on the results screen, where the next tap is still about what she wants.
// Inside the relief sequence the sticky button stays progress-phrased instead
// ("View my 8-week plan"), so those screens read as one ladder rather than as
// several different voices.
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
// So this label is resolve + safety, never a "buy now".
const DIAGNOSIS_CTA_LABEL = "I'm ready to feel better";

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
// The breathing reward renders this stack with #1 unlocked, so she arrives at
// the paywall already holding one of a set she started herself. A second
// unlock step (the nutrition checklist) used to move the bar 25% -> 50%; it was
// removed on 2026-08-17 for being a second unpaid interaction at the point of
// maximum intent. The stack is unchanged - #2 is simply still locked.
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

// ─── The check-in: her own read on what just happened ───────────────────────
// See the `ReliefStage` note in the component for why this exists at all. The
// rules for the three options:
//
// - **Three, and they are a scale.** Two would be a yes/no, and "no" on a
//   yes/no reads as a verdict on the product thirty seconds before the price.
//   Three lets the middle answer be the honest one for most people, which is
//   also the one that is true: one round of paced breathing takes the edge off,
//   it does not fix an afternoon.
// - **None of them is wrong, and the copy must not treat one as the good
//   answer.** She is being asked to notice, not to grade us. "Not yet" gets the
//   warmest reply of the three.
// - **They describe her body, not her opinion.** "Calmer" is something she can
//   check; "It works!" is a review, and asking a stranger for a review before
//   she has paid is the tell that this is a sales screen.
// `skipped` is not one of the three check-in answers - it is what the reward
// screen is told when she never breathed at all, so its copy can stop claiming
// she did. See `getReliefRewardCopy`.
type ReliefFeedback = "calmer" | "little" | "not_yet" | "skipped";

const RELIEF_CHECKIN_OPTIONS: { id: ReliefFeedback; label: string }[] = [
  { id: "calmer", label: "Calmer" },
  { id: "little", label: "A little" },
  { id: "not_yet", label: "Not yet" },
];

/**
 * The reward line, answering whatever she just said.
 *
 * The heading stops being a celebration of *us* and becomes a reply to *her*,
 * which is the whole point of asking. And every branch lands on the same place
 * - one round is the sample, the eight weeks are the product - because that is
 * the true sentence in all three cases, not a recovery written for the bad one.
 *
 * `null` is the skip path and the resumed-from-Stripe path (`reliefStage` is
 * pinned to `reward` there, with no answer). It keeps the original line, which
 * is the one that never needed her to have said anything.
 */
function getReliefRewardCopy(
  answer: ReliefFeedback | null,
  name: string
): { heading: string; body: React.ReactNode } {
  const suffix = name ? `, ${name}` : "";
  switch (answer) {
    case "calmer":
      return {
        heading: `You did that${suffix}.`,
        body: (
          <>
            Not a pill, not a doctor&apos;s appointment -{" "}
            <span className="font-bold text-[#3D3D3D]">{BREATH_TOTAL_SECONDS} seconds</span> and
            your own breath. That was one tool, on one symptom.
          </>
        ),
      };
    case "little":
      return {
        heading: `That's a start${suffix}.`,
        body: (
          <>
            A little, from{" "}
            <span className="font-bold text-[#3D3D3D]">{BREATH_TOTAL_SECONDS} seconds</span> on
            your first go. It goes deeper with practice - and that was one tool, on one symptom.
          </>
        ),
      };
    case "not_yet":
      return {
        heading: `That's honest${suffix}.`,
        body: (
          <>
            One round rarely does it. Paced breathing works the way training works -{" "}
            <span className="font-bold text-[#3D3D3D]">a little, most days</span>. That is exactly
            what the next {PLAN_WEEKS} weeks are.
          </>
        ),
      };
    // She skipped from the intro, so she never took a breath. The old copy here
    // told her she had calmed her body in 36 seconds, which she would know to be
    // false - and a funnel caught inventing a result thirty seconds before the
    // price has spent the belief it needs. She keeps the tool either way; that
    // part is true.
    case "skipped":
      return {
        heading: `It's yours anyway${suffix}.`,
        body: (
          <>
            Keep it for the next time it hits -{" "}
            <span className="font-bold text-[#3D3D3D]">{BREATH_TOTAL_SECONDS} seconds</span>,
            anywhere, no equipment. That is one tool, on one symptom.
          </>
        ),
      };
    default:
      return {
        heading: `Hooray${suffix}!`,
        body: (
          <>
            You calmed your body in{" "}
            <span className="font-bold text-[#3D3D3D]">{BREATH_TOTAL_SECONDS} seconds</span> - and
            unlocked your first tool.
          </>
        ),
      };
  }
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

// Diagnosis is one screen short of the paywall: relief is the only thing left
// between them, and it costs nothing. So this step gets pure forward motion and
// getCtaCopy()'s no-charge reassurance lives on the relief CTA, where the
// commitment actually happens. It promises the next step is short, because the
// only thing standing between her and the plan now is one small screen. She's
// read a long page and her guard is up: the next tap feels like the one that
// costs her something. So the line names what the next screen is NOT (a pitch,
// a form, a charge) before it names what it is.
function getDiagnosisForwardCopy(): { sub: React.ReactNode } {
  return { sub: "One simple exercise to feel calm." };
}




// ─── Diagnosis: personalized before/after transformations ───────────────────
// SYMPTOM_TRANSFORM / getSymptomTransforms live in lib/testimonials.ts, shared
// with the paywall's SymptomOutcomeCards.
// The "after" side is deliberately a *feeling*, not a piece of knowledge. The
// offer she reads two blocks later is about feeling better, so an after column
// that only promises understanding undercuts the offer it sits above.

// ─── The plan: what she actually buys ───────────────────────────────────────
// The four daily task areas and the 8-week arc live in lib/planPillars.ts.
// They're the offer's mechanism - "track your symptoms" never explained how
// anyone gets better - so on the diagnosis screen they aren't a list any more:
// <PlanStage /> plays them inside the plan scroll.

const TRAJ_PLAN_SPLIT = 1 / 3;

/** Geometry only - pure, memoizable, and the same on the server as in the
    browser. Kept out of the component so the render is layout + variants. */
function buildTrajectory(score: number) {
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
  // Two years of no plan: a drift, not a collapse. Capped well under the old
  // 8-24 point drop because this now has to be believable over 24 months rather
  // than dramatic over 8 weeks.
  const decline = Math.min(Math.max(score - 12, 6), 16);
  // The climb is the offer: reach the goal line by week 8, then hold it.
  const target = Math.min(88, Math.max(SCORE_GOAL + 2, score + 18));
  const untreated: [number, number][] = [];
  const treated: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    untreated.push([xAt(t), yAt(Math.max(10, score - decline * easeOut(t)))]);
    // Everything after the split is a plateau - the plan ends at week 8 and we
    // promise maintenance, not perpetual improvement.
    const climb = Math.min(1, t / TRAJ_PLAN_SPLIT);
    treated.push([xAt(t), yAt(score + (target - score) * easeOut(climb))]);
  }
  const toPath = (pts: [number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  return {
    W,
    H,
    padLeft,
    padTop,
    padBottom,
    xAt,
    yAt,
    untreatedPath: toPath(untreated),
    treatedPath: toPath(treated),
    treatedArea: `${toPath(treated)} L${xAt(1)},${H - padBottom} L${padLeft},${H - padBottom} Z`,
    endU: untreated[untreated.length - 1],
    endT: treated[treated.length - 1],
    goalY: yAt(SCORE_GOAL),
  };
}

/**
 * Two diverging trajectories: slow decline with no plan vs. the climb her plan
 * is built to produce.
 *
 * ── The horizon ─────────────────────────────────────────────────────────────
 *
 * It used to contradict itself three ways. The sentence above the chart said
 * symptoms persist **4-7 years**; the x-axis was labelled **Now / 4 weeks /
 * 8 weeks**; and the code claimed **~2 years**. As rendered, the red line
 * therefore asserted she would measurably deteriorate within eight weeks -
 * which is not what the sentence above it says, is not defensible, and sat
 * directly above the block where she most needs to believe us.
 *
 * The window is now two years, stated on the axis, with one compressed segment:
 * the first third of the plot is her 8 weeks, the remaining two thirds are the
 * rest of the two years. That is a broken axis, and it is the honest way to draw
 * this - the alternative is her whole plan squeezed into 7% of the width, where
 * the line that matters is invisible. The ticks say exactly where the break is.
 *
 * The two lines make different claims on purpose:
 *   - green climbs to the goal *by week 8* and then holds, which is precisely
 *     what the offer promises and nothing more.
 *   - red drifts down slowly across two years, which is the "persist 4-7 years
 *     and often get worse before they settle" sentence, drawn.
 *
 * ── Why it draws itself, and in that order ──────────────────────────────────
 *
 * It arrived fully formed, as a finished picture the eye had to take apart:
 * two lines, four labels, a goal rule and a scale break, all at once, at the
 * one place on the page where she is being asked to accept a claim about her
 * own future. A chart that draws is a chart that is *making an argument*, and
 * the order is the argument - the axis first (this is the frame), then the red
 * line alone (this is what happens anyway), then the green one climbing away
 * from it (this is what changes), then each line saying its own name.
 *
 * It runs on scroll, not on mount. The card sits far enough down the plan
 * scroll that a mount animation has always finished playing to nobody, and
 * `once: true` means scrolling back past it never replays it - a chart that
 * re-animates every time it crosses the fold reads as a broken widget.
 * `amount: 0.4` waits until it is genuinely on screen rather than a sliver.
 * See the trigger itself for why it is a `useInView` boolean and not the
 * `whileInView` prop this obviously wants to be.
 *
 * Everything is `pathLength` or `opacity`: no layout, no filters, and one
 * animation per element. Under reduced motion every duration collapses to zero,
 * so the finished chart is simply there - the variant labels are unchanged,
 * which keeps the server and client markup identical (see the `useReducedMotion`
 * hydration note on `<PhoneShot />`).
 *
 * The dashed goal rule and the dashed scale break are deliberately faded rather
 * than drawn: framer owns `strokeDasharray` while it animates `pathLength`, so
 * animating those two would silently render them solid - which is the exact bug
 * that made `<EstrogenCurve />`'s reference line stop reading as a reference.
 */
function TrajectoryChart({ score, reduced }: { score: number; reduced?: boolean }) {
  const g = useMemo(() => buildTrajectory(score), [score]);
  const { W, H, padLeft, padTop, padBottom, xAt, yAt, endU, endT, goalY } = g;

  /* One boolean for the whole chart, and every part states both ends of its own
     animation off it.

     `initial="hidden" whileInView="show"` on the `<svg>` alone, with the parts
     inheriting the label, is the tidier spelling and it does not work here.
     Both failure modes were reproduced in a browser before this shape was
     settled on:

       - inherited label: framer emits no `initial` styles for it in the
         server-rendered markup, so the chart arrives fully drawn and then
         "animates" from finished to finished.
       - `initial="hidden"` added to the parts to fix that: a part that declares
         its own `initial` stops inheriting the parent's *gesture* variant, so
         nothing animates at all.

     Explicit `initial` + `animate` on each part is immune to both, and
     `once: true` on the observer means it draws once and stays drawn. */
  const ref = useRef<SVGSVGElement | null>(null);
  const shown = useInView(ref, { once: true, amount: 0.4 });

  // One knob for the whole timeline, so reduced motion is a single branch
  // rather than nine of them.
  const d = useCallback((v: number) => (reduced ? 0 : v), [reduced]);

  const variants = useMemo(() => {
    const draw = (delay: number): Variants => ({
      hidden: { pathLength: 0 },
      show: {
        pathLength: 1,
        transition: { duration: d(1.05), delay: d(delay), ease: [0.4, 0, 0.25, 1] },
      },
    });
    const fade = (delay: number, duration = 0.45): Variants => ({
      hidden: { opacity: 0 },
      show: { opacity: 1, transition: { duration: d(duration), delay: d(delay), ease: "easeOut" } },
    });
    const label = (delay: number): Variants => ({
      hidden: { opacity: 0, x: -6 },
      show: {
        opacity: 1,
        x: 0,
        transition: { duration: d(0.4), delay: d(delay), ease: [0.16, 1, 0.3, 1] },
      },
    });
    return {
      frame: fade(0),
      // Red first: the card is headed "And if you do nothing".
      decline: draw(0.2),
      declineLabel: label(1.15),
      climb: draw(0.65),
      // The fill trails its own line rather than leading it, so the green area
      // reads as the consequence of the climb and not as a block that appeared
      // under it.
      climbArea: fade(1.0, 0.7),
      climbLabel: label(1.6),
      you: {
        hidden: { opacity: 0, y: 5 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: d(0.45), delay: d(0.1), ease: [0.16, 1, 0.3, 1] },
        },
      } as Variants,
    };
  }, [d]);

  const pillW = 60;
  const pillH = 18;
  const youX = xAt(0);
  const pillX = Math.min(Math.max(youX - pillW / 2, 0), W - pillW);
  const pillY = Math.max(2, yAt(score) - pillH - 8);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={`Projected wellbeing score over two years: with the plan, climbing from ${score} to the goal of ${SCORE_GOAL} by week 8 and holding; with no plan, drifting slowly downward.`}
    >
      <defs>
        <linearGradient id="trajGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* The frame: the goal rule, the scale break and the axis. One group, one
          fade - it is context, not a beat. */}
      <motion.g initial="hidden" animate={shown ? "show" : "hidden"} variants={variants.frame}>
        <line
          x1={padLeft}
          y1={goalY}
          x2={xAt(1)}
          y2={goalY}
          stroke="#16A34A"
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.45"
        />

        {/* Where her 8 weeks end and the axis changes scale. Drawn, because a
            broken axis that isn't marked is a misleading axis. */}
        <line
          x1={xAt(TRAJ_PLAN_SPLIT)}
          y1={padTop - 6}
          x2={xAt(TRAJ_PLAN_SPLIT)}
          y2={H - padBottom}
          stroke="#9A9A9A"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.5"
        />

        {/* X axis labels. The middle tick sits on the scale break, so it is
            labelled with what it is - the end of her plan - rather than with a
            midpoint the axis does not actually have. */}
        <text x={xAt(0)} y={H - 9} textAnchor="start" fontSize="11" fill="#9A9A9A" fontWeight="500">Now</text>
        <text x={xAt(TRAJ_PLAN_SPLIT)} y={H - 9} textAnchor="middle" fontSize="11" fill="#3D3D3D" fontWeight="700">Week {PLAN_WEEKS}</text>
        <text x={xAt(1)} y={H - 9} textAnchor="end" fontSize="11" fill="#9A9A9A" fontWeight="500">2 years</text>
      </motion.g>

      <motion.path initial="hidden" animate={shown ? "show" : "hidden"} variants={variants.climbArea} d={g.treatedArea} fill="url(#trajGreen)" />

      <motion.path
        initial="hidden"
        animate={shown ? "show" : "hidden"}
        variants={variants.decline}
        d={g.untreatedPath}
        fill="none"
        stroke="#EF4444"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <motion.path
        initial="hidden"
        animate={shown ? "show" : "hidden"}
        variants={variants.climb}
        d={g.treatedPath}
        fill="none"
        stroke="#16A34A"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Start dot + "You" pill - placed above the dot so it never sits on top
          of the diverging lines. It leads, because it is where both lines start
          and she should be watching that point when they separate. */}
      <motion.g initial="hidden" animate={shown ? "show" : "hidden"} variants={variants.you}>
        <circle cx={youX} cy={yAt(score)} r="4.5" fill="#3D3D3D" />
        <line x1={youX} y1={yAt(score)} x2={youX} y2={pillY + pillH} stroke="#3D3D3D" strokeWidth="1" opacity="0.4" />
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx="9" fill="#3D3D3D" />
        <text x={pillX + pillW / 2} y={pillY + 13} textAnchor="middle" fontSize="11" fill="#FFFFFF" fontWeight="700">You · {score}</text>
      </motion.g>

      {/* End-of-line labels so each path is self-explanatory. Each arrives as
          its own line lands, which is what stops them reading as a legend. */}
      <motion.g initial="hidden" animate={shown ? "show" : "hidden"} variants={variants.climbLabel}>
        <circle cx={endT[0]} cy={endT[1]} r="4.5" fill="#16A34A" />
        <text x={endT[0] + 8} y={endT[1] - 3} fontSize="12" fill="#16A34A" fontWeight="800">With{" "}Lisa</text>
        <text x={endT[0] + 8} y={endT[1] + 10} fontSize="10" fill="#16A34A" fontWeight="600" opacity="0.85">better</text>
      </motion.g>

      <motion.g initial="hidden" animate={shown ? "show" : "hidden"} variants={variants.declineLabel}>
        <circle cx={endU[0]} cy={endU[1]} r="4.5" fill="#EF4444" />
        <text x={endU[0] + 8} y={endU[1] + 1} fontSize="12" fill="#EF4444" fontWeight="800">No{" "}plan</text>
        <text x={endU[0] + 8} y={endU[1] + 14} fontSize="10" fill="#EF4444" fontWeight="600" opacity="0.85">worse</text>
      </motion.g>
    </svg>
  );
}

/**
 * Estrogen, rising and falling - drawn, on a loop.
 *
 * The node under the rail asserts one cause, and until 2026-08-18 it asserted
 * it in words alone: "estrogen rising and falling", set in bold, sitting on a
 * pale rose card. The three mechanism lines above it have just done the work of
 * making that convergence feel earned, and then the conclusion of the argument
 * was the quietest element in the whole card.
 *
 * So the sentence now says what it is and the line under it *does* it. A curve
 * that never settles is the entire claim - it is why she has nine complaints at
 * once and why none of them respond to trying harder - and it is the one idea
 * on the results screen that a picture states faster than a sentence.
 *
 * ── Why it loops rather than draws once ──────────────────────────────────────
 *
 * A path that draws itself left-to-right and stops reads as a finished
 * measurement: this happened, it is over. The point of the block is the
 * opposite - it has not stopped, which is the reason the plan has to run for
 * eight weeks rather than fix one bad night. The wave therefore slides
 * continuously, so whenever her eye lands on it, it is moving.
 *
 * The pattern is exactly `W` wide and rendered twice, so translating by exactly
 * `W` returns to the starting picture: the loop is seamless with no crossfade
 * and no jump. Three sines whose periods all divide that width keep
 * it irregular - a clean metronome sine reads as a signal generator, and what
 * this is illustrating is anything but regular - while staying perfectly
 * periodic. Every term must complete a whole number of cycles across the width
 * (2, 3 and 5 here); change one to a fraction and the seam shows up as a kink
 * twice a loop.
 *
 * `prefers-reduced-motion` gets the same curve, held still. It is legible
 * static; the movement is emphasis, not information.
 *
 * ── What it deliberately is not ──────────────────────────────────────────────
 *
 * There are no axes, no units, no dates and no numbers, because it is not her
 * data - nothing in the funnel measures anyone's estrogen - and a y-axis would
 * be the funnel's second modelled-baseline problem (see the `TYPICAL_SCORE_BY_AGE`
 * note). The caption says so out loud rather than in a footnote: it is the
 * shape of the thing, and the shape is the whole point. An earlier version of
 * this screen carried a two-line "before / now" chart that did make a personal
 * claim; it was removed for exactly that reason and should not come back
 * without real data behind it.
 */
function EstrogenWave({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const W = 168; // one full period of the pattern
  const H = 46;
  const mid = H / 2;
  const amp = 16;

  const { d, area } = useMemo(() => {
    // Every term completes a whole number of cycles across t = 0..1 (2, 3 and
    // 5), so the pattern is exactly W-periodic and the loop seam is invisible.
    // Two full swings rather than one because the box is ~170 units wide and
    // renders at ~300px under preserveAspectRatio="none": a single stretched
    // cycle reads as a flat line with one dent in it rather than as something
    // that will not settle.
    const wave = (t: number) =>
      0.6 * Math.sin(4 * Math.PI * t) +
      0.28 * Math.sin(6 * Math.PI * t + 1.1) +
      0.15 * Math.sin(10 * Math.PI * t + 2.4);
    const N = 84;
    const ys: number[] = [];
    for (let i = 0; i <= N * 2; i++) ys.push(wave((i / N) % 1));
    // Normalised across its own min..max rather than by peak magnitude: three
    // offset sines are not symmetric about zero, and dividing by the largest
    // absolute value left a curve that dived a full amp down and rose a third
    // of that - all falling, barely any rising, which is the wrong half of the
    // sentence it sits under.
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const span = hi - lo || 1;
    const pts = ys.map((v, i) => {
      const x = ((i / N) * W).toFixed(1);
      const y = (mid - amp * ((2 * (v - lo)) / span - 1)).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    });
    const line = pts.join(" ");
    return { d: line, area: `${line} L${W * 2},${H} L0,${H} Z` };
  }, [W, H, mid, amp]);

  return (
    <div className={cn("overflow-hidden", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Estrogen swinging up and down without settling."
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="estroFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          {/* Both ends dissolve into the card instead of being cut off by it,
              so the curve reads as continuing rather than as ending here. */}
          <linearGradient id="estroFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" />
            <stop offset="9%" stopColor="#FFFFFF" />
            <stop offset="91%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#000000" />
          </linearGradient>
          <mask id="estroMask">
            <rect x="0" y="0" width={W} height={H} fill="url(#estroFade)" />
          </mask>
        </defs>

        <g mask="url(#estroMask)">
          <motion.g
            initial={{ x: 0 }}
            animate={{ x: reduceMotion ? 0 : -W }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 9, ease: "linear", repeat: Infinity, repeatType: "loop" }
            }
          >
            <path d={area} fill="url(#estroFill)" />
            <path
              d={d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Her symptoms, why each one happens, and the single cause underneath all of
 * them - as one card.
 *
 * ── Why this is one card and not two (2026-08-17) ────────────────────────────
 *
 * Results used to run two cards back to back that were halves of one sentence.
 * `<ScoreGapCard />` named the symptoms dragging her score ("Sleep issues,
 * fatigue and anxiety") and stopped. The card under it, "Why this is happening
 * to you", printed her symptom *count* at 5xl and said they "all trace back to
 * the same thing: estrogen rising and falling" - a claim about a list it did
 * not show, sitting 200px below the list it was about.
 *
 * So the screen said "here are your symptoms" and then, in a separate box,
 * "those symptoms have one cause", and the reader had to hold the first card in
 * her head to receive the second. Worse, the count was the third telling of the
 * same fact: she tapped the tiles, the letter reported the score they produced,
 * and then a number restated how many she had tapped. Three renderings of her
 * own input and, in all of it, **nothing she did not already know**.
 *
 * The merge fixes both by putting the mechanism *on the rows*: each symptom
 * carries the one line of physiology that explains it (SYMPTOM_MECHANISM), and
 * every one of those lines ends at estrogen. The convergence is then something
 * she watches happen rather than something we assert - three separate
 * complaints, three separate explanations, one word arriving in all of them -
 * and the estrogen node at the bottom of the rail is the conclusion of an
 * argument the card just made instead of a headline over a number.
 *
 * That is also the one honest way to make this screen *informative*. Everything
 * else on results is her own answers re-presented; these nine lines are the
 * only place the funnel teaches her something, and "why do I have all of these
 * at once" is the question she actually arrived with.
 *
 * ── What each band is for ────────────────────────────────────────────────────
 *
 *   1. **What is pulling her score down** - her heaviest symptoms
 *      (getTopBurdenSymptoms, off the same weights the score is built from),
 *      each with its mechanism. Recognition first, explanation second.
 *   2. **The convergence** - the node the rail runs into: one cause, named.
 *   3. **The benchmark.** A score out of 100 means nothing without a reference
 *      point. It is stated rather than drawn as a third marker, which is what
 *      the 2026-08-16 rebuild removed for crowding the track. Deliberately the
 *      quiet band: "typical" here is a modelled profile rather than a survey
 *      average, so it supports the finding and is never asked to be the finding.
 *
 * ── Five things that are deliberately not here ───────────────────────────────
 *
 * Mostly the same fault found repeatedly: the card is the *third* telling on a
 * screen that has already shown her a letter and a paragraph, so anything it
 * repeats is pure length. It ran ~100 words on 2026-08-17 and runs ~80 now,
 * with every one of the mechanism lines - the only new information in the whole
 * funnel - untouched. The remaining fat is in those lines (they are written at
 * 12-16 words and say the same thing at 9-11), and tightening them is a copy
 * pass on SYMPTOM_MECHANISM rather than a change here.
 *
 * **The gap as a number.** This card led on it until 2026-08-17: a 52px "34"
 * over "points to your goal". A point is not a unit of anything she has ever
 * felt - it is an internal quantity on a scale that exists nowhere outside this
 * funnel - and the letter one screen-height above already *draws* the gap. It
 * survives in the screen-reader summary.
 *
 * **Her symptom count**, which the node carried as a 40px numeral until later
 * the same day. The pain paragraph directly above the card opens on the same
 * bold figure - see the node.
 *
 * **A verdict placing her against the cohort** ("hitting you harder than most
 * women your age"). See band 3 and the note where getScoreVerdict used to live.
 *
 * **A handover line to the plan.** See band 4's headstone below.
 *
 * **Her score, painted as a verdict.** It used to render red under 40 and
 * orange above - never green, at any value - on a scale where higher is better,
 * so the number always appeared in alarm paint regardless of what it said.
 *
 * Colour follows the results-screen rule: rose = the load she carries now,
 * green = the gap and what closes it, pink = the CTA and nothing else.
 */
function ScoreCauseCard({
  score,
  benchmark,
  cohortLabel,
  drivers,
  symptomCount,
}: {
  score: number;
  benchmark: number;
  cohortLabel: string;
  /** Her heaviest symptoms, worst first - see getTopBurdenSymptoms. */
  drivers: string[];
  /** Every symptom she picked, not just the ones explained above. */
  symptomCount: number;
}) {
  // `gap` is always 12..68: calculateWellbeingScore compresses to a
  // SCORE_CEILING of 68 precisely so there is never a zero gap to render, which
  // is why there is no at-goal branch here. It is no longer printed as a
  // figure; it survives for the screen-reader summary and the handover line.
  const gap = Math.max(0, SCORE_GOAL - score);
  const rows = drivers
    .map((id) => ({
      id,
      label: SYMPTOM_LABELS[id] || id,
      // A symptom with no mechanism line still renders - it just arrives at the
      // estrogen node without explaining itself, which is the old behaviour.
      why: SYMPTOM_MECHANISM[id],
    }))
    .filter((r) => r.label);
  const hidden = Math.max(0, symptomCount - rows.length);

  return (
    <div className="rounded-2xl bg-card border-2 border-[#E8DDD9] mb-4 shadow-md shadow-primary/5 overflow-hidden">
      {/* Bands 1+2 - the rail. One vertical line runs from the first symptom
          down into the estrogen node, so the convergence is drawn rather than
          claimed: her complaints are tributaries and the node is where they
          meet. It fades rose -> deeper rose downward so the eye travels the
          direction the argument does.

          Skipped entirely if she somehow reached results with no symptoms
          selected - an empty rail is worse than no rail, and the benchmark
          below stands on its own. */}
      {rows.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-[#9A9A9A]">
            What&apos;s pulling your score down
          </p>

          <div className="mt-3 pl-6">
            {/* Rows + rail. The rail hangs off *this* wrapper rather than off
                the whole band, so the node below can be any height - it grew a
                chart on 2026-08-18 - without the rail running down beside it
                instead of into it. The node draws the last leg itself. */}
            <div className="relative">
              <span
                aria-hidden
                className="absolute -left-[18px] top-2 bottom-0 w-px bg-linear-to-b from-[#B23A31]/25 via-[#B23A31]/55 to-[#B23A31]"
              />

              {rows.map((row, i) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.05 + i * 0.12, duration: 0.35 }}
                  className={cn("relative", i > 0 && "mt-3")}
                >
                  <span
                    aria-hidden
                    className="absolute -left-6 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-card bg-[#B23A31] ring-1 ring-[#B23A31]/30"
                  />
                  <p className="text-[15px] font-bold leading-tight text-[#B23A31]">{row.label}</p>
                  {row.why && (
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[#6A6A6A]">{row.why}</p>
                  )}
                </motion.div>
              ))}

              {/* Honest about what the rail is not showing. Three rows is as
                  many mechanisms as anyone reads on a phone. */}
              {hidden > 0 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.05 + rows.length * 0.12 }}
                  className="relative mt-3 text-[12px] font-medium text-[#9A9A9A]"
                >
                  <span
                    aria-hidden
                    className="absolute -left-6 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-card bg-[#D8C3BE]"
                  />
                  + {hidden} more, same story
                </motion.p>
              )}
            </div>

            {/* The node. Everything above arrives here.

                Filled deep rose since 2026-08-18, where it was a pale tint on
                cream. It is the conclusion of the argument the rail just made,
                and it was rendering as the softest element in the card - the
                three symptom rows above it carried more colour than the answer
                they converge on. It is also the last thing read before "Not
                willpower. Biology": the sentence lands harder off a block that
                looks like a diagnosis than off a note. Rose rather than pink,
                per the screen's colour rule - this is the load she is carrying,
                not the CTA.

                The count used to sit in it, as a 40px numeral: "{n} symptoms,
                one cause". It was cut on 2026-08-17 because the pain paragraph
                ~100px above this card already opens on a bold "{n} symptoms"
                (getSeverityPainText), so the badge was the same figure told
                twice within one screen - the exact fault the card's own header
                note claims the merge fixed. The merge only removed the 5xl
                version; this was the survivor. The convergence never needed the
                number anyway: it is carried by the rail and by the word
                arriving at the end of every mechanism line.

                No `overflow-hidden` here: the rail's last leg is drawn outside
                the node's own box. <EstrogenWave /> clips itself. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.05 + (rows.length + (hidden > 0 ? 1 : 0)) * 0.12, duration: 0.4 }}
              className="relative mt-3 rounded-xl border border-[#8F2A22]/60 bg-linear-to-br from-[#C04035] via-[#B23A31] to-[#8F2A22] px-3.5 py-3 shadow-md shadow-[#B23A31]/25"
            >
              {/* The rail's last leg: down through the gap, then a right angle
                  into the sentence it has been heading for all along. Offsets
                  are keyed to the first text line, not to the node's centre,
                  because the node is now taller than one line. */}
              <span
                aria-hidden
                className="absolute -left-[18px] -top-3 h-[33px] w-px bg-[#B23A31]"
              />
              <span
                aria-hidden
                className="absolute -left-[18px] top-[21px] h-px w-3 bg-[#B23A31]"
              />
              <p className="text-[13.5px] leading-snug text-white/85">
                One cause:{" "}
                <span className="font-bold text-white">estrogen rising and falling</span>
              </p>
              <EstrogenWave className="mt-1.5" />

            </motion.div>
          </div>

          {/* The line that turns the cause into permission. It is not her
              fault, and - the half that matters commercially - it moves.

              **The first sentence was added on 2026-08-30, and it is the one
              rung this funnel never used.** The screens run guilt (the start
              screen's reframe) to fear (the score) to acceptance (this card) -
              and skip anger, which sits directly below the line and is the
              highest-energy state available in this market. Being told to wait
              it out, or that it's just her age, is close to universal for a
              woman of 45-60, and this is the exact instant it becomes visible
              to her: she has just learned there was one explanation the whole
              time.

              Two constraints on how it is written, and both are load-bearing:

              - **It names the silence, not a person.** "Nobody sat you down" is
                a fact about her experience. "Your doctor missed this" is a
                clinical claim about a consultation we know nothing about, it
                pushes a wellness product into second-guessing medical care that
                /terms disclaims, and it is the version that gets a health
                funnel reported. Anger at a gap converts; anger at her GP is a
                liability.
              - **It does not end on the grievance.** Per the emotional-ladder
                rule this funnel is built on, a negative state has to hand her
                the exit in the same breath or it collapses into "nothing works".
                So the sentence that follows it is unchanged and does the
                lifting, and the green card immediately below is the door. */}
          <p className="mt-3 text-[13px] leading-relaxed text-[#5A5A5A]">
            Nobody sat you down and explained this. That part isn&apos;t on you.{" "}
            <span className="font-bold text-[#3D3D3D]">This is biology and it responds.</span>
          </p>
        </div>
      )}

      {/* Band 3 - the benchmark, which is the only thing that makes a score out
          of 100 mean anything.

          It used to open with getScoreVerdict(): "Menopause is hitting you
          harder than most women your age." That sentence was the one comparative
          claim on the screen where belief is formed, and its own basis is a
          modelled profile rather than a survey average (see TYPICAL_SCORE_BY_AGE)
          - the known-open item in §7 of CLAUDE.md. Cut on 2026-08-17: the number
          is the useful half and it can be handed over without being ranked
          against her. The cohort is named on the number instead, which is where
          it belongs now that no verdict names it. */}
      <p
        className={cn(
          "px-4 pb-4 text-xs leading-relaxed text-[#5A5A5A]/30",
          rows.length > 0 ? "mt-3.5 border-t border-[#EFE6E2] pt-3.5" : "pt-4"
        )}
      >
        Typical for {cohortLabel}:{" "}
        <span className="font-bold text-[#3D3D3D]">{benchmark}</span> out of 100.
      </p>

      {/* Band 4 - the handover to the plan - was here until 2026-08-17:
          "Closing that gap is what your {PLAN_WEEKS}-week plan is built to do.",
          on green ground under a Goal icon. It was a duplicate at ~20px range.
          The green card immediately below this one (see the results phase) says
          "your {PLAN_WEEKS}-week plan is ready", names what it was built from,
          and then *draws* the eight weeks with <PlanFinishBoard />. Two handovers
          to the same object back to back, and the second one carries evidence.
          Removing it also stops this card from ending in the same green the card
          below opens in, which read as one long green block on a small screen. */}

      {/* The letter is decorative to a screen reader (it is an animation), so
          the numbers on it are announced here, once. The benchmark is *not*
          repeated here - band 3 above is real text and reads on its own. */}
      <p className="sr-only">
        Your Menopause Wellbeing Score is {score} out of 100, where higher is better. The goal is{" "}
        {SCORE_GOAL}, which is {gap} points away.
      </p>
    </div>
  );
}

// Results reveal: her letter rises out of an envelope.
//
// The whole thing is CSS boxes, one clip-path and one inline SVG - no new
// asset, no Lottie, no canvas - so it costs nothing to download and paints the
// same on a five-year-old Android as on an iPhone. The only property animated
// per frame is a transform (plus one opacity on entry), which is the pair the
// compositor handles without touching layout; there is no width, top or
// margin animation anywhere in here.
//
// Geometry is percentages of one 10:11 container, so it scales with the
// column instead of needing breakpoints. Read it bottom-up, in % from the
// container's bottom edge:
//
//     0-46%   envelope body, the front face she sees        (z-30)
//    16-46%   flap, closed - hinged along its top edge      (z-40)
//              ...rotateX(-180deg) lands it at 46-76%       (z-10)
//     9-94%   the letter, parked 64% of its own height low  (z-20)
//
// The frame is taller than it is wide because the envelope is the packaging,
// not the point: the shorter the pocket, the more sheet clears its mouth, and
// the illustration she is actually here to see gets that room.
//
// The envelope has to reach the container floor exactly. Float it even a few
// percent and the letter, parked below it, shows as a sliver under the
// envelope before it has any business being seen.
//
// The flap has to be *in front of* the body while it's shut and *behind* the
// letter once it's open, so its z-index is swapped once, in a zero-duration
// step partway through the fold. Nothing overlaps the flap at that instant -
// the letter is still parked inside the pocket - which is the only reason the
// swap is invisible. That is an invariant, not a coincidence: the swap must
// land before LETTER_DELAY, or she watches the sheet slide up *behind* the
// open flap. Everything else keeps a static z-index.
const ENVELOPE_EASE = [0.22, 1, 0.36, 1] as const;
const FLAP_DELAY = 0.2;
const FLAP_DURATION = 0.55;
const FLAP_ZSWAP = FLAP_DELAY + FLAP_DURATION / 2; // 0.475s
const LETTER_DELAY = 0.58;

function EnvelopeReveal({
  src,
  scoreMv,
  score,
  name,
}: {
  src: string;
  scoreMv: MotionValue<number>;
  score: number;
  name?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  // The count-up lives on the letter now - see the note on the sheet's face.
  const rounded = useTransform(scoreMv, (v) => Math.round(v));
  const fillWidth = useTransform(scoreMv, (v) => `${v}%`);
  const gap = Math.max(0, SCORE_GOAL - score);

  // Reduced motion gets the finished picture: envelope open, letter out, no
  // travel. `initial={false}` on each mover skips the animation entirely.
  const still = Boolean(prefersReducedMotion);

  return (
    <div
      className="relative mx-auto w-full max-w-[300px] sm:max-w-[320px]"
      style={{
        background:
          "radial-gradient(58% 46% at 50% 60%, rgba(255,141,161,0.20), rgba(255,141,161,0) 72%)",
      }}
    >
      {/* Decorative in full: the score card below carries the same heading and
          the same number, so announcing this would only make a screen reader
          read the payoff twice. */}
      <motion.div
        aria-hidden
        initial={still ? false : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: ENVELOPE_EASE }}
        // The letter is parked below the frame before it rises, so the frame
        // has to clip.
        className="relative w-full aspect-10/11 overflow-hidden"
      >
        {/* ── The letter ─────────────────────────────────────────────────
            Rides up with its face already printed, rather than fading its
            contents in on arrival - paper that arrives blank and then fills
            reads as a loading state, not as a letter. */}
        <motion.div
          initial={still ? false : { y: "64%", rotate: 0 }}
          animate={{ y: "0%", rotate: still ? 0 : [0, -1.2, 0] }}
          transition={{
            y: { duration: 0.8, delay: LETTER_DELAY, ease: ENVELOPE_EASE },
            rotate: { duration: 0.8, delay: LETTER_DELAY, times: [0, 0.5, 1], ease: "easeInOut" },
          }}
          className="absolute inset-x-[6%] top-[6%] bottom-[9%] z-20 rounded-xl border border-[#EFE2DE] bg-white shadow-[0_14px_26px_-16px_rgba(61,61,61,0.55)]"
        >
          {/* Everything printed on the sheet lives in its top 56% - the band
              that clears the envelope's mouth once the letter is out. The rest
              of the sheet is inside the pocket forever, so ink down there is
              ink she never sees.

              What is printed there is her score. It used to be a stock
              illustration: she sat through a loader promising "your results",
              watched a letter rise out of an envelope, and the letter contained
              art. The animation is the most expensive moment of craft in the
              funnel and it was delivering a non-answer - so the number moved
              onto the page, and the illustration stayed on as the backdrop it
              always was.

              The number *counts up here*, rather than sitting finished while a
              separate card below counts up to it. Until 2026-08-17 both
              happened: the sheet printed the final score at about 1s, and then
              the gauge below spent until 2.3s climbing to a number she had
              already read, under a second copy of the same "Your score … /100 …
              Higher is better" stack roughly 250px lower. The most expensive
              reveal in the funnel was paying off a duplicate.

              As of 2026-08-17 the sheet carries the *whole* result, not just
              the digits: the metric is named, the direction of the scale is
              stated, and the score sits on its own track against the goal. A
              bare "46/100" is not a result - it is a number she has to scroll
              to have explained, and the explanation was a second card
              restating the reveal. One number, one moment, one place it is
              read: the letter is the verdict, and the card below it is the
              *gap* and what closes it.

              Everything printed here has to survive at ~240px wide and ~155px
              tall, which is why the metric line is one 9px sentence and the
              track carries a single label. Her name is on the paper because
              that is the one thing a letter can say that a progress bar
              cannot. */}
          <div className="absolute inset-x-0 top-0 flex h-[56%] flex-col items-center justify-center px-[8%] pt-[3%]">
            {/* Illustration, demoted to a wash behind the number. */}
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 62vw, 280px"
              className="object-contain object-top opacity-15"
              priority
            />

            <div className="relative flex w-full flex-col items-center">
              <div className="flex w-full items-center justify-center gap-1.5">
                <Sparkles className="w-3 h-3 text-primary shrink-0" />
                <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9A9A9A]">
                  {name ? `${name}'s results` : "Your results"}
                </span>
              </div>

              <p className="mt-0.5 flex items-baseline gap-0.5 leading-none">
                <motion.span className="text-5xl font-black tracking-tight tabular-nums text-[#3D3D3D]">
                  {rounded}
                </motion.span>
                <span className="text-base font-semibold text-[#B0B0B0]">/100</span>
              </p>

              {/* The metric, named, with the direction of the scale on the same
                  line. Two lines here would cost the track its room, and the
                  direction is worthless without the name next to it. */}
              <p className="mt-1 text-center text-[9px] font-semibold leading-tight text-[#8A8A8A]">
                Menopause Wellbeing Score · higher is better
              </p>

              {/* The scale. Her fill is ink and grows with the count-up, so the
                  number and the bar land together; the gap to the goal is the
                  only coloured thing on it, because that gap is what the plan
                  sells. No "you" marker - the fill's own edge is her score and
                  it sits directly under the number, so a second label would
                  print the same figure twice within 40px. */}
              <div className="mt-2.5 w-full">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-[#EDE3DF]">
                  <div
                    className="absolute top-0 h-full bg-green-500/30"
                    style={{ left: `${score}%`, width: `${gap}%` }}
                  />
                  <motion.div
                    className="absolute left-0 top-0 h-full rounded-full bg-[#3D3D3D]"
                    style={{ width: fillWidth }}
                  />
                  <div
                    className="absolute top-0 h-full w-[3px] rounded-full bg-green-600"
                    style={{ left: `${SCORE_GOAL}%` }}
                  />
                </div>
                {/* Safe at any score: it is clamped to 12..68 and the goal is
                    80, so this label never travels and never collides. */}
                <div className="relative mt-1 h-3">
                  <span
                    className="absolute -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-green-700"
                    style={{ left: `${SCORE_GOAL}%` }}
                  >
                    Goal {SCORE_GOAL}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── The flap ───────────────────────────────────────────────────
            A rectangle cut to a downward triangle by clip-path, hinged along
            its top edge. clip-path is applied in the element's own coordinate
            space, so the shape folds with the element and the apex ends up
            pointing away from the envelope, as a real flap does. */}
        <motion.div
          initial={still ? false : { rotateX: 0, zIndex: 40 }}
          animate={{ rotateX: -180, zIndex: 10 }}
          transition={{
            rotateX: { duration: FLAP_DURATION, delay: FLAP_DELAY, ease: ENVELOPE_EASE },
            zIndex: { duration: 0, delay: FLAP_ZSWAP },
          }}
          style={{
            clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
            transformOrigin: "50% 0%",
            transformPerspective: 700,
            background: "linear-gradient(180deg,#F7E7E3 0%,#EAD1CB 100%)",
            zIndex: still ? 10 : undefined,
          }}
          className="absolute inset-x-0 bottom-[16%] h-[30%]"
        />

        {/* ── The envelope body ──────────────────────────────────────────
            Static. The seams are one preserveAspectRatio="none" SVG so they
            stay pinned to the corners at any width, with non-scaling strokes
            so the fold lines never thicken as the box grows.

            The shadow is thrown *upward* on purpose. A downward one would be
            clipped by the frame, and pointing it up costs nothing and buys the
            detail that sells the whole illusion: the envelope's mouth casting
            a shadow onto the sheet coming out of it. It lands because the body
            paints above the letter (z-30 over z-20). */}
        <div
          className="absolute inset-x-0 bottom-0 z-30 h-[46%] overflow-hidden rounded-b-2xl rounded-t-md border border-[#E3CFC9] shadow-[0_-10px_18px_-8px_rgba(61,61,61,0.4)]"
          style={{ background: "linear-gradient(180deg,#FBEFEC 0%,#F1DBD5 100%)" }}
        >
          <svg
            viewBox="0 0 100 60"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <path d="M0 0 L50 34 L100 0 Z" fill="rgba(0,0,0,0.035)" />
            <path d="M0 60 L50 26 L100 60 Z" fill="rgba(255,255,255,0.55)" />
            <path
              d="M0 60 L50 26 L100 60"
              fill="none"
              stroke="rgba(196,166,158,0.6)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </motion.div>
    </div>
  );
}

// The reward stack the breathing step ends on: what she keeps, then what she
// doesn't have yet, then how far through the set she is. Felt first, read
// second. `unlockedCount` stayed a prop after the second unlock step was cut -
// the stack is the only place the toolkit is drawn, and hardcoding 1 into it
// would bury the assumption in the component instead of at the call site.
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
            className="flex items-center gap-3 rounded-2xl border border-foreground/10 bg-foreground/3 px-4 py-2.5 text-left"
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

/** How long each hero screen holds before the next one slides in. Long enough to
 *  read a screen that is mostly layout, short enough that a second one arrives
 *  before she scrolls past. */
const HERO_SLIDE_MS = 3000;

/** Swipe threshold: horizontal travel that beats vertical travel by enough to be
 *  a deliberate sideways gesture rather than the start of a page scroll. */
const HERO_SWIPE_PX = 40;

/**
 * The hero: her actual app, at a size where it can be read, walking through the
 * screens that make up the plan.
 *
 * It used to be one still (`day`) with three more shots repeated 300px
 * below as a tilted, cropped, faded-out trio - the treatment that is right for
 * evidence which only has to prove the app exists. That split spent the screen's
 * best real estate on one frame and then showed the remaining three at ~30%
 * width behind a gradient, where the thing they each contain (a checklist with
 * reasons, a habit she picks, a streak she keeps) is unreadable. Same three
 * images, twice, and neither instance legible. They are one element now: one
 * phone, every screen.
 *
 * Design rules this has to keep, all of them earned:
 *
 * - **The bezel does not move.** Only the screen inside it changes, so it reads
 *   as a person swiping one phone rather than a slideshow of assets. It also
 *   means zero layout shift: the box is pinned to the masters' aspect ratio, so
 *   nothing below it reflows as slides swap.
 * - **No entrance of its own.** The first frame paints with the block wrapper
 *   (see the phase cross-fade note there); `AnimatePresence initial={false}`
 *   keeps the mount silent. A `whileInView` fade here would stack on top of two
 *   fades it is already inside, which is how this element once took ~1.2s to
 *   become legible. The bitmaps are fetched *and decoded* from the calculating
 *   loader onwards (see preloadResponsiveImage), so there is one ready.
 * - **It advances only while she can see it** (`useInView`), and stops for good
 *   the moment she touches it. An auto-advance that resumes under her thumb
 *   fights her for control of the one element she is trying to study.
 * - **Swipe never blocks the page scroll.** This is a tall screen inside a
 *   vertical scroller, so there is no framer `drag` here: a pointer gesture is
 *   measured on release and only acted on when the horizontal travel beats the
 *   vertical, and nothing ever calls preventDefault. Dragging the hero and
 *   finding the page won't scroll is a worse bug than not being able to swipe.
 * - **Reduced motion means it does not auto-play at all**, rather than playing
 *   instantly - the dots are real buttons, so the control is still there. Note
 *   that useReducedMotion only gates effects and durations here, never the
 *   initial rendered style; it reads false through hydration, and branching a
 *   style on it is a mismatch on every reduced-motion visitor.
 *
 * It is not full column width. The source is 1320x2868 - 2.17 times taller than
 * it is wide - so every pixel of width costs two of height: at the 268px it once
 * ran, the phone alone was ~580px, a whole viewport of scroll, and the headline
 * it belongs to had left the screen before the shot ended. At 208px it is ~450px
 * and the block reads as one unit: promise, proof, caption, pillars. Legibility
 * survives the trim because what has to be read here is layout - "Day 1 · Week
 * 1", four pillar rows, progress against them - not body copy.
 */
function PlanHeroCarousel({ slides }: { slides: ReadonlyArray<{ src: string; caption: string; alt: string }> }) {
  const prefersReducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(stageRef, { amount: 0.35 });
  const [index, setIndex] = useState(0);
  // Which way the next screen travels. Kept in state rather than derived so a
  // tap on dot 1 from dot 4 slides back the way she came.
  const [direction, setDirection] = useState(1);
  const [taken, setTaken] = useState(false);
  const count = slides.length;

  const go = useCallback(
    (next: number, dir: number) => {
      setDirection(dir);
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  // Hers from the first touch: any manual selection stops the clock permanently.
  const select = useCallback(
    (next: number) => {
      setTaken(true);
      go(next, next > index ? 1 : -1);
    },
    [go, index]
  );

  useEffect(() => {
    if (taken || !inView || prefersReducedMotion || count < 2) return;
    const id = window.setTimeout(() => go(index + 1, 1), HERO_SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [taken, inView, prefersReducedMotion, count, index, go]);

  // Pointer gesture, measured on release. See the swipe rule above for why this
  // is not framer's `drag`.
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    gesture.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = gesture.current;
      gesture.current = null;
      if (!start || count < 2) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < HERO_SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
      setTaken(true);
      go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    },
    [count, go, index]
  );

  const slide = slides[index];
  const travel = prefersReducedMotion ? 0 : 26;

  return (
    <div ref={stageRef}>
      <div className="relative mx-auto w-full max-w-52 rounded-[1.75rem] bg-[#1d1d1f] p-1.5 shadow-[0_24px_50px_-18px_rgba(61,61,61,0.6)]">
        <div
          className="relative overflow-hidden rounded-[1.45rem] bg-[#f5f5f7] touch-pan-y"
          style={{ aspectRatio: `${SHOT_W} / ${SHOT_H}` }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (gesture.current = null)}
        >
          {/* Variants rather than inline objects, and `custom` on both the
              presence and the child: an exiting element is no longer rendered,
              so an inline `exit={{ x: -direction * travel }}` freezes the
              direction the *previous* transition used - which is wrong on every
              backward move, i.e. the whole reason the dots exist. `custom` on
              AnimatePresence is the one channel that reaches an exiting child. */}
          <AnimatePresence initial={false} custom={direction}>
            <motion.div
              key={slide.src}
              custom={direction}
              variants={{
                enter: (dir: number) => ({ opacity: 0, x: dir * travel }),
                center: { opacity: 1, x: 0 },
                exit: (dir: number) => ({ opacity: 0, x: -dir * travel }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: prefersReducedMotion ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0"
            >
              <Image
                src={slide.src}
                alt={slide.alt}
                width={SHOT_W}
                height={SHOT_H}
                sizes={PLAN_HERO_SIZES}
                className="w-full h-auto"
                draggable={false}
                // Only the first screen is a page-load priority: the rest are
                // already warm from the loader's preload, and marking every tall
                // image high-priority just makes them compete.
                priority={index === 0}
                // Synchronous decode: the bitmap is already warm (preloaded and
                // decoded back on the calculating loader), so blocking the paint
                // on it costs nothing and removes the one-frame gap where the
                // bezel renders empty. `async` would let that frame through on
                // exactly the images that cannot be seen arriving.
                decoding="sync"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Caption, in a box of reserved height so a two-word line and a five-word
          line don't move the dots under her thumb. */}
      <div className="relative mt-2.5 h-4">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={slide.caption}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="absolute inset-x-0 text-center text-xs font-semibold text-[#3D3D3D]"
          >
            {slide.caption}
          </motion.p>
        </AnimatePresence>
      </div>

      <CarouselDots
        count={count}
        index={index}
        onSelect={select}
        label={(i) => `Show ${slides[i].caption}`}
      />
    </div>
  );
}

/**
 * Position indicator for the horizontal snap carousels.
 *
 * Both of them (the before/after cards here, and the paywall's outcome cards)
 * are 82%-wide snap scrollers with no affordance beyond an 18% sliver of the
 * next card. A carousel nobody knows is a carousel gets one card read, so the
 * second and third symptom she picked - the personalization we did all this work
 * for - were mostly never seen.
 */
function useCarouselIndex(count: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el || count < 2) return;
    const travel = el.scrollWidth - el.clientWidth;
    if (travel <= 0) return;
    const next = Math.round((el.scrollLeft / travel) * (count - 1));
    setIndex((prev) => (prev === next ? prev : Math.min(count - 1, Math.max(0, next))));
  }, [count]);

  return { ref, index, onScroll };
}

function CarouselDots({
  count,
  index,
  onSelect,
  label,
}: {
  count: number;
  index: number;
  /** Makes the dots real controls. Omit for the snap scrollers, where the dots
   *  only report where a scroll already is and the scroller itself is the
   *  control - a second way to move the same list is noise. */
  onSelect?: (i: number) => void;
  label?: (i: number) => string;
}) {
  if (count < 2) return null;

  const dot = (i: number) => (
    <motion.span
      animate={{ width: i === index ? 18 : 6, opacity: i === index ? 1 : 0.35 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="block h-1.5 rounded-full bg-primary"
    />
  );

  if (!onSelect) {
    return (
      <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <React.Fragment key={i}>{dot(i)}</React.Fragment>
        ))}
      </div>
    );
  }

  return (
    // Padding, not gap: a 6px dot is not a tap target, so each one carries a
    // ~28px invisible one and the negative margin keeps the row's own height.
    <div className="flex justify-center -my-2 mt-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={label?.(i) ?? `Show item ${i + 1} of ${count}`}
          aria-current={i === index ? "true" : undefined}
          className="px-1 py-2.5"
        >
          {dot(i)}
        </button>
      ))}
    </div>
  );
}

// CaptionArrow / SocialProofPolaroid now live in components/SocialProof.tsx,
// shared with the paywall.

type TileOption = { id: string; label: string; image: string };

/** The single-choice image grid behind seven of the twelve questions - age,
 *  status, how menopause began, fitness, nutrition, relaxation and HRT. Tap a
 *  tile to answer; the step advances itself (see AUTO_ADVANCE_STEPS).
 *  `priority` is for the first question only, which is above the fold on load. */
function ImageChoiceGrid({
  options,
  selected,
  onSelect,
  priority = false,
}: {
  options: readonly TileOption[];
  selected: string;
  onSelect: (id: string) => void;
  priority?: boolean;
}) {
  return (
    <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 min-h-0">
      {options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
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
                priority={priority}
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
  );
}

type ToneOption = { id: string; label: string; hint: string };

/** The single-choice list behind the three questions with no tile art - how
 *  menopause began, how hard the symptoms hit, and when she trains. Same
 *  contract as ImageChoiceGrid: tap a row to answer, the step advances itself
 *  (see AUTO_ADVANCE_STEPS).
 *
 *  Every visual comes out of the tone record whole (see ChoiceTone) rather than
 *  being assembled from an accent value here - Tailwind only ships classes it
 *  can find as literal text, so a colour built at runtime renders as nothing at
 *  all. Adding an option means adding its tone in the same commit; a missing
 *  entry is a blank row, not a fallback.
 */
function ToneChoiceList({
  options,
  tones,
  selected,
  onSelect,
}: {
  options: readonly ToneOption[];
  tones: Record<string, ChoiceTone>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
      {options.map((option) => {
        const isSelected = selected === option.id;
        const tone = tones[option.id];
        const Icon = tone.Icon;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className={`w-full shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
              isSelected ? tone.selected : tone.idle
            }`}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors duration-200 ${
                  isSelected ? `${tone.dot} text-white` : tone.chip
                }`}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span
                  className={`block font-semibold text-sm sm:text-base ${
                    isSelected ? tone.label : "text-[#3D3D3D]"
                  }`}
                >
                  {option.label}
                </span>
                <span className="block text-xs text-[#8A8A8A] leading-tight mt-0.5">
                  {option.hint}
                </span>
              </span>
            </span>
            {isSelected ? (
              <span
                className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center animate-in zoom-in duration-200 ${tone.dot}`}
              >
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </span>
            ) : (
              <span className="w-5 h-5 shrink-0 rounded-full border-2 border-foreground/20" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* A type-only import, so it is erased at build time and the auth stack stays in
   the lazy chunk `getSupabase()` puts it in. Never import a *value* from
   `@supabase/supabase-js` here. */

/**
 * The anonymous sign-in, retried - because it is the single point of failure in
 * the whole funnel.
 *
 * Everything downstream hangs off the id this call mints: the quiz answers, the
 * Stripe session, the subscription, her login. It is also one `fetch`, on a
 * phone, on whatever connection an ad click arrived over, and it used to get
 * exactly one attempt. A dropped request there ends a paid click on an error
 * screen.
 *
 * The 2026-08-21 report was this: no `/signup` request in Supabase's auth log
 * had failed in 24 hours - every one returned 200 - and yet the funnel showed
 * the failure sentence. The call never reached Supabase. `supabase-js` folds a
 * fetch failure into the `error` field instead of throwing (an
 * `AuthRetryableFetchError`), so a request the browser dropped is
 * indistinguishable, at this call site, from the server saying no - and it
 * leaves no server-side trace to find afterwards.
 *
 * ── What it will and will not retry ─────────────────────────────────────────
 *
 * Only failures that could plausibly succeed on the next attempt: a transport
 * error (no status), or a 5xx. A 4xx is Supabase answering, and answering the
 * same way every time - `422 anonymous_provider_disabled` means the provider is
 * off in the dashboard and no amount of asking will turn it on, and retrying a
 * `429` spends the rate limit it is complaining about. Both fail on the first
 * attempt, as they should.
 *
 * Three attempts, ~0.4s then ~1.2s apart. The worst case adds ~1.6s and she
 * waits none of it: `completeRegistration()` runs inside `CALCULATING_MS`
 * (6.5s) of loader that is held open anyway.
 *
 * The error is duck-typed rather than tested with `isAuthRetryableFetchError`
 * on purpose. Importing that helper statically pulls the auth stack into the
 * entry chunk and undoes the lazy `getSupabase()` split - see the warning at
 * the top of `lib/supabaseClient.ts`.
 */
const ANON_SIGNIN_BACKOFF_MS = [400, 1200];

type AnonSignInError = { status?: number; code?: string; message?: string } | null;

function isRetryableAuthError(err: AnonSignInError): boolean {
  if (!err) return true; // no user and no error: something odd, worth one more go
  const status = typeof err.status === "number" ? err.status : 0;
  // status 0 / absent is the transport failure - the case this exists for.
  return status === 0 || status >= 500;
}

async function signInAnonymouslyWithRetry(
  supabase: SupabaseClient
): Promise<{ user: User | null; error: AnonSignInError }> {
  let lastError: AnonSignInError = null;

  for (let attempt = 0; attempt <= ANON_SIGNIN_BACKOFF_MS.length; attempt++) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (data?.user) return { user: data.user, error: null };

    lastError = (error as AnonSignInError) ?? null;
    if (!isRetryableAuthError(lastError)) break;

    const wait = ANON_SIGNIN_BACKOFF_MS[attempt];
    if (wait === undefined) break;
    console.warn(`Anonymous sign-in attempt ${attempt + 1} failed, retrying:`, lastError);
    await new Promise((r) => setTimeout(r, wait));
  }

  return { user: null, error: lastError };
}

/**
 * One sentence per cause, because "we couldn't save your results" was the same
 * sentence for a dropped request, a disabled provider and a rate limit - which
 * left her retrying a thing that could not work, and left us unable to tell the
 * three apart from a bug report.
 *
 * None of them name Supabase or a status code at her: she is 90 seconds from a
 * price and the only thing she needs to know is whether tapping again is worth
 * it.
 */
function anonSignInMessage(err: AnonSignInError): string {
  const status = typeof err?.status === "number" ? err.status : 0;
  if (status === 429) {
    return "Too many attempts just now. Give it a minute, then tap Try again.";
  }
  if (status === 0) {
    return "We couldn't reach the server - check your connection and tap Try again.";
  }
  // 4xx that isn't a rate limit is a configuration problem on our side (the
  // provider being switched off is the one that has actually happened), and
  // there is nothing she can do about it. Say so rather than sending her round
  // the retry loop again.
  return "Something went wrong on our end saving your results. Please try again in a moment.";
}

/**
 * The 6.5 seconds between the last question and her results.
 *
 * ── Why it is a component and not four lines in the page ────────────────────
 *
 * The percentage and the message carousel are driven by one `requestAnimation-
 * Frame` clock, so they can never disagree about how far along she is. That
 * clock used to live in `RegisterPageContent` and write to state there, which
 * meant ~90 renders of the entire funnel - every quiz screen, every memo, the
 * whole 5,000-line tree - across the exact window in which the anonymous
 * sign-in and `save-quiz` are in flight. On a mid-range Android that is main
 * thread taken away from the two network calls this screen exists to hide.
 *
 * Owning the clock here bounds every one of those renders to this box.
 *
 * ── What it is not ──────────────────────────────────────────────────────────
 *
 * It is not a progress bar for the work behind it. `completeRegistration()`
 * advances the phase on its own, and deliberately outlasts the network call on
 * a fast connection - the clock here is presentation only. It stalls at
 * `CALCULATING_MAX_PCT`, never 100: see that constant.
 *
 * Saving her answers happens behind this loader, so a failure has to surface
 * *here* - silently spinning forever would strand her one tap short of her
 * results.
 */
/**
 * The percentage meter every "we are computing on your answers" moment shares.
 *
 * One instrument, two scales. The post-quiz calculating screen runs it for 6.5s
 * at full size; the three mid-quiz loaders run it `compact` for 1.7s. That they
 * are visibly the same thing is the point - the short ones are what makes the
 * long one legible as work rather than lag, and the long one is what makes the
 * short ones look like they belong to something.
 *
 * `hideCaption` is the error case: the caller replaces the rotating line with a
 * retry, and the meter keeps running behind it so the screen doesn't go dead.
 */
function ComputeMeter({
  durationMs,
  maxPct,
  messages,
  colors,
  compact = false,
  hideCaption = false,
  onDone,
}: {
  durationMs: number;
  maxPct: number;
  messages: readonly string[];
  colors: readonly string[];
  compact?: boolean;
  hideCaption?: boolean;
  onDone?: () => void;
}) {
  const [pct, setPct] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  // Held in a ref so an inline arrow at the call site doesn't restart the run
  // on every parent render - which on a 1.7s meter would mean it never lands.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const messageCount = messages.length;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setPct(Math.round(t * maxPct));
      setMessageIndex(Math.min(messageCount - 1, Math.floor(t * messageCount)));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        onDoneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, maxPct, messageCount]);

  return (
    <>
      {/* The percentage carries the "something is being built" job that a
          static header can't. There used to be a fixed h2 here reading
          "Getting to know you better..." *above* the three rotating
          messages - two headers on a three-second screen, one of which
          never changed. */}
      <p
        className={cn(
          "mb-1 font-black tabular-nums text-[#3D3D3D]",
          compact ? "text-3xl" : "text-4xl"
        )}
      >
        {pct}
        <span className={cn("font-bold text-[#B0B0B0]", compact ? "text-lg" : "text-xl")}>%</span>
      </p>
      <div
        className={cn(
          "h-1.5 overflow-hidden rounded-full bg-primary/15",
          compact ? "mb-3 w-32" : "mb-4 w-40"
        )}
      >
        {/* `scaleX`, not `width`. The bar is re-targeted ~90 times over the
            6.5s; a width animation relayouts and repaints the run on every
            one of them, a transform is handed straight to the compositor. */}
        <motion.div
          className="h-full w-full origin-left rounded-full bg-primary"
          initial={false}
          animate={{ scaleX: pct / 100 }}
          transition={{ ease: "linear", duration: 0.12 }}
        />
      </div>

      {!hideCaption && (
        <AnimatePresence mode="wait">
          <motion.p
            key={messageIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Compact runs ~570ms a caption, so the crossfade has to be well
            // inside that or every line is caught mid-fade and none is read.
            transition={{ duration: compact ? 0.15 : 0.28, ease: [0.42, 0, 0.58, 1] }}
            className={cn(
              "text-center font-medium",
              compact ? "h-5 min-w-44 px-4 text-sm" : "h-6 min-w-48"
            )}
            style={{ color: colors[messageIndex] ?? "#6B7280" }}
          >
            {messages[messageIndex]}
          </motion.p>
        </AnimatePresence>
      )}
    </>
  );
}

function CalculatingScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.42, 0, 0.58, 1] }}
        className="flex-1 flex flex-col items-center justify-center px-4"
      >
        <ComputeMeter
          durationMs={CALCULATING_MS}
          maxPct={CALCULATING_MAX_PCT}
          messages={LOADING_MESSAGES}
          colors={LOADING_MESSAGE_COLORS}
          hideCaption={!!error}
        />

        {error && (
          <div className="w-full max-w-sm text-center">
            <p className="text-sm text-error mb-3">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 px-6 py-2.5 font-bold text-foreground rounded-xl transition-all hover:scale-[1.02]"
              style={CTA_GRADIENT_STYLE}
            >
              Try again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * A reward step: short meter, then the payoff.
 *
 * `initialDone` is what stops the meter replaying on Back. Backing into a
 * reward and watching it recompute reads as the funnel having changed its mind
 * about her answers - the same reason the results score is guarded by
 * `scoreAnimated`. Once seen, the payoff is just there.
 *
 * `ready` gates the swap on data the payoff needs (the plan catalog chunk). The
 * meter is allowed to sit at 100 for the frames that takes, which is the honest
 * option: a payoff that renders without its number and then pops it in is worse
 * than a beat of stillness.
 */
function QuizReward({
  messages,
  initialDone,
  onDone,
  ready = true,
  children,
}: {
  messages: readonly string[];
  initialDone: boolean;
  onDone: () => void;
  ready?: boolean;
  children: React.ReactNode;
}) {
  const [timerDone, setTimerDone] = useState(initialDone);
  const done = timerDone && ready;

  // Fire once, on the transition. Both the ref and the guard are load-bearing:
  // callers pass an inline arrow, so a plain `[done, onDone]` effect re-runs on
  // every render for as long as she stands on the payoff.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current) return;
    reported.current = true;
    onDoneRef.current();
  }, [done]);

  if (!done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <ComputeMeter
          compact
          durationMs={QUIZ_LOADER_MS}
          maxPct={QUIZ_LOADER_MAX_PCT}
          messages={messages}
          colors={QUIZ_LOADER_COLORS}
          onDone={() => setTimerDone(true)}
        />
      </div>
    );
  }

  // Opacity only, and short. The payoff underneath has its own landing - the
  // paper springs in over-rotated behind a bloom (see <RewardPaper />) - and a
  // translate on the wrapper drags that spring along with it, which reads as
  // two things moving at once and turns a landing into a slide. The wrapper's
  // only job is to stop the meter and the payoff sharing a frame.
  return (
    <motion.div
      initial={initialDone ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="flex-1 flex flex-col min-h-0"
    >
      {children}
    </motion.div>
  );
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  /**
   * The funnel has one entrance: question 1. Every load starts there — the one
   * exception being a load that finds a fresh resume ticket, which reopens the
   * paywall she just left for Stripe (see `readFunnelResume` and the restore
   * effect; the ticket carries her answers and her account id, so it is not an
   * entrance in the sense this paragraph is about).
   *
   * The answers live in React state and nothing persists them, so any URL that
   * drops her *past* the quiz drops her into a funnel with no answers in it —
   * and the paywall is the one place that matters, because checkout would then
   * charge an account with no profile and `generatePlan()` would build the
   * generic plan. Rather than detect that case, we removed it: `?phase=paywall`
   * is gone, and everyone who already has an account goes to `/paywall`
   * instead (Stripe's cancel URL, `proxy.ts`, the dashboard layout).
   *
   * `?phase=download` is the single exception and has to be: it is Stripe's
   * success URL, she arrives on it from another origin, and by then she has
   * paid — there is nothing left to personalise or lose.
   */
  const [phase, setPhase] = useState<Phase>(() => {
    const phaseParam = searchParams.get("phase");
    if (phaseParam === "download") return phaseParam;
    // Dev-only: preview the results / plan / relief steps directly without
    // finishing the quiz.
    if (
      (phaseParam === "results" || phaseParam === "diagnosis" || phaseParam === "relief") &&
      process.env.NODE_ENV === "development"
    ) {
      return phaseParam;
    }
    /*
     * **Question 1 is the funnel. There is no start screen (2026-09-04).**
     *
     * The ad promises a quiz and the start screen was an interstitial between
     * that promise and the quiz: one image, one headline, one button whose only
     * job was `setPhase("quiz")`. It collected nothing, personalised nothing and
     * asked for a tap before the funnel had given her anything - the single
     * cheapest tap in the funnel to delete, on the screen that takes 100% of the
     * traffic. It was bypassed as the cold-start phase on 2026-09-02 and deleted
     * outright on 2026-09-04, once the two things that still depended on it had
     * moved: the Terms and Privacy links (now under the question 1 card, which
     * is where the obligation attaches - a screen nobody sees cannot be where
     * the legal links live) and Back off question 1, which no longer renders
     * because there is nothing behind the entrance.
     *
     * The `start` key still exists in `funnel_events` history and is dropped by
     * `INACTIVE_STEPS` in `/api/admin/stats`; nothing pings it any more.
     */
    return "quiz";
  });
  // No pixel events fire anywhere in the quiz or the post-quiz screens. The
  // seven custom ones that used to (`QuizStart`, `QuizStep`, `QuizComplete`,
  // `ResultsView`, `PlanView`, `PlanScrollDepth`, `ReliefDone`) were removed on
  // 2026-08-17 for the first campaign - see the event table in
  // `lib/metaPixel.ts`. `Lead` still marks the end of the quiz, sent server-side
  // from `/api/auth/save-quiz` on profile insert.

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = STEPS[stepIndex];
  const autoAdvances = AUTO_ADVANCE_STEPS.includes(currentStep);

  /**
   * The relief phase, the whole pre-paywall sequence:
   *
   *   intro → running → reward → (paywall)
   *
   * `reward` is the toolkit-unlock screen (1 of 4). Two further stages -
   * `checklist` (a five-row nutrition audit) and `done` (its verdict, unlocking
   * 2 of 4) - were removed on 2026-08-17: they were a second unpaid interaction
   * and two more taps in the stretch immediately after she taps "I'm ready to
   * feel better", which is the point of maximum intent and the worst place in
   * the funnel to ask her for anything else.
   *
   * It never rewinds past `reward` once reached, so coming back from the paywall
   * doesn't make her breathe through the exercise a second time.
   */
  /**
   * The check-in is the only place in the funnel where the claim is made by her
   * instead of by us.
   *
   * **It used to have a stage and a screen of its own** (`checkin`, between the
   * last exhale and the reward) and was folded into the reward on 2026-09-03.
   * `relief` was four screens between the diagnosis and the price, it loses 16%
   * of everyone who reaches it, and a whole screen carrying one optional
   * question was the cheapest of the four to stop charging her for. The
   * question is unchanged; it now swaps the copy she is already reading rather
   * than gating the screen that carries it.
   *
   * Everything else on the way to the paywall is an assertion we make and she
   * evaluates - the score, the mechanism, the plan, the testimonial. The
   * breathing exercise is the one moment the product does something to her body
   * in front of her, before any money, and until now the funnel spent it
   * telling her what had happened: "You calmed your body in 36 seconds." She
   * never got to say it. A benefit she states herself is worth more than the
   * same sentence in our voice, and once she has said it the eight weeks are
   * consistent with a position she already took rather than a promise she is
   * being asked to believe.
   *
   * There is no wrong answer and no answer that costs us the sale. "Not yet" is
   * the honest reply for plenty of first attempts at paced breathing, and it
   * hands us the better argument anyway: one round is not the intervention, the
   * eight weeks are.
   *
   * It is not stored. Nothing downstream reads it, `save-quiz` never sees it
   * and it is deliberately absent from the resume ticket - the answer's whole
   * job is the sentence she reads next. Adding it to `user_profiles` would make
   * a self-report taken thirty seconds after one breathing exercise look like a
   * clinical baseline.
   *
   * Skipping the timer skips the question too (see `skipRelief`, and the
   * `reliefElapsed > 0` guard at the render site): a woman who didn't do the
   * exercise has nothing to notice, and asking her anyway is the funnel putting
   * words in her mouth.
   */
  type ReliefStage = "intro" | "running" | "reward";
  const [reliefStage, setReliefStage] = useState<ReliefStage>("intro");
  const [reliefFeedback, setReliefFeedback] = useState<ReliefFeedback | null>(null);
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
      setReliefStage("reward");
    }
  }, [reliefStage, reliefElapsed]);

  const startRelief = useCallback(() => {
    setReliefElapsed(0);
    setReliefStage("running");
  }, []);

  // The check-in no longer has a screen of its own - it is a row on the reward,
  // so answering only swaps the copy above it. See the render site.
  const answerCheckin = useCallback((answer: ReliefFeedback) => {
    setReliefFeedback(answer);
  }, []);

  // Lets her bail out of the timer without losing the reward - jumps straight
  // to the reward as if she'd finished, so the toolkit unlock still lands.
  // Past the check-in too, and with no answer recorded: she didn't do the
  // exercise, so there is nothing for her to have noticed.
  //
  // `neverStarted` separates the two ways out. Skipping mid-exercise means she
  // breathed some of it, so the reward keeps its original wording; skipping from
  // the intro means she breathed none of it, and the reward has to say so rather
  // than congratulate her on 36 seconds she did not spend.
  const skipRelief = useCallback((neverStarted = false) => {
    setReliefElapsed(BREATH_TOTAL_SECONDS);
    setReliefFeedback(neverStarted ? "skipped" : null);
    setReliefStage("reward");
  }, []);

  // Preload the next step's images (and prewarm the very first step on mount) so
  // tiles are already cached before the step renders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const srcs = [
      // Index-driven, never the first step by name: the funnel's opening screen
      // has now changed twice, and a hardcoded key here warms the wrong tiles
      // silently — the screen still works, it just paints slower on the one
      // screen that takes 100% of paid traffic.
      ...(stepIndex === 0 ? STEP_IMAGES[STEPS[0]] ?? [] : []),
      ...(STEP_IMAGES[STEPS[stepIndex + 1]] ?? []),
    ];
    // No cleanup: it used to set `img.src = ""` on every step change, and a step
    // change is when the next step's images stop being a preload and start being
    // the screen - so the abort landed on exactly the fetch it was warming. The
    // Image objects are dropped, but the responses they pull stay in the HTTP
    // cache, which is the only thing the tiles need.
    srcs.forEach((src) => {
      for (const w of [640, 828]) {
        const img = new window.Image();
        img.src = optimizedImageUrl(src, w);
      }
    });
  }, [stepIndex]);

  // Pull the plan catalog from q_body onwards - four steps before the first
  // loader that prints a number out of it, and on a step with a Next button so
  // she is standing still while it lands.
  useEffect(() => {
    if (stepIndex >= STEPS.indexOf("q_body")) warmPlanCatalog();
  }, [stepIndex]);

  // Warm the diagnosis screenshots from the calculating loader onwards. That
  // loader is 6.5s with no images of its own, and results is a four-card scroll
  // after it, so the hero has the whole run to arrive and decode - as long as we
  // ask for the URL she will actually request and then leave the request alone
  // until she gets there. Starting at `results` left the hero racing anyone who
  // scrolls fast. Guarded by its own Set, so re-running here is a no-op.
  // See preloadResponsiveImage().
  useEffect(() => {
    if (phase !== "calculating" && phase !== "results") return;
    DIAGNOSIS_SHOTS.forEach(({ src, sizes }) => preloadResponsiveImage(src, sizes));
  }, [phase]);

  // Same idea, for JavaScript. See warmPhaseChunks().
  useEffect(() => {
    warmPhaseChunks(phase, stepIndex);
  }, [phase, stepIndex]);

  /**
   * Report the screen she is on. See `pingFunnelStep`.
   *
   * Deduped per visit by a ref, so backing up and coming forward again does not
   * re-send: the drop-off query counts distinct sessions per step, so a second
   * row changes nothing and costs a request from a phone mid-funnel. The ref is
   * the right scope — it dies with the mount, and a genuine reload is a new
   * measurement of a page she is genuinely seeing again.
   */
  // Lifts the quiz's fixed CTA bar clear of the software keyboard. See the hook.
  const keyboardInset = useKeyboardInset();
  useDismissKeyboardOnTap();

  const funnelStepsSent = useRef<Set<string>>(new Set());
  useEffect(() => {
    let step: string;
    let index: number;
    if (phase === "quiz") {
      step = STEPS[stepIndex] ?? "unknown";
      index = stepIndex + 1;
    } else {
      // One row per phase, `relief` included - see POST_QUIZ_FUNNEL_STEPS for
      // why its three screens are not pinged separately.
      const position = POST_QUIZ_FUNNEL_STEPS.indexOf(
        phase as (typeof POST_QUIZ_FUNNEL_STEPS)[number]
      );
      if (position < 0) return;
      step = phase;
      index = POST_QUIZ_BASE + position;
    }
    if (funnelStepsSent.current.has(step)) return;
    funnelStepsSent.current.add(step);
    pingFunnelStep(step, index);
  }, [phase, stepIndex]);
  // Question position for the progress label/dots (reward steps excluded; during a
  // reward step we keep the last answered question's dot lit).
  const activeQuestionIndex = QUESTION_STEPS.includes(currentStep)
    ? QUESTION_STEPS.indexOf(currentStep)
    : STEPS.slice(0, stepIndex).filter((s) => QUESTION_STEPS.includes(s)).length - 1;
  // A `browserInfo` state used to be set here on mount and read by nobody - a
  // second render of this whole component, on every ad click, to reach a
  // `console.warn`. The warning is kept; the state is not.
  useEffect(() => {
    const browser = detectBrowser();
    if (hasBrowserMismatchIssue(browser)) {
      console.warn("Browser mismatch detected:", browser);
    }
  }, []);


  // Quiz answers - same structure as mobile
  const [ageBand, setAgeBand] = useState<string>("");
  // Height: stored per-unit as raw strings; normalized to cm on save.
  // Sliders always carry a value, so seed sensible mid-range defaults.
  //
  // **Imperial is the default because the traffic is US (2026-09-02).** These
  // opened on cm/kg, so every woman the campaign buys landed on q_body - step 8
  // of 17, on a screen whose own subhead promises the plan is being sized to
  // her - and was shown her body as "165 cm" and "70 kg": two numbers she
  // cannot read, on the one question that asks her to confirm something
  // personal. The unit toggles are small, top-right, and easy to miss, so the
  // choice was between doing arithmetic and pulling two sliders that mean
  // nothing to her.
  //
  // The seeds are the same body either way (5'5" = 165 cm, 154 lb = 70 kg), so
  // nothing downstream moves: `bodyMetrics` still normalizes to cm/kg before
  // anything reads it. If the campaign ever runs outside the US, derive this
  // from `x-vercel-ip-country` rather than flipping it back - a UK visitor
  // wants stones, and a default that is wrong for everyone is worse than one
  // that is right for the majority.
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("ft");
  const [heightCm, setHeightCm] = useState<string>("165");
  const [heightFt, setHeightFt] = useState<string>("5");
  const [heightIn, setHeightIn] = useState<string>("5");
  // Weight: stored per-unit as raw strings; normalized to kg on save.
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("lb");
  const [weightKg, setWeightKg] = useState<string>("70");
  const [weightLb, setWeightLb] = useState<string>("154");
  const [fitnessLevel, setFitnessLevel] = useState<string>("");
  /** Which part of the day her movement reminder should land in. */
  const [trainingTime, setTrainingTime] = useState<string>("");
  const [hereFor, setHereFor] = useState<string>("");
  const [menopauseType, setMenopauseType] = useState<string>("");
  const [goal, setGoal] = useState<string[]>([]);
  // Selection set for the symptom tiles. Every entry carries SELECTED_SEVERITY -
  // the real intensity comes from `symptomImpact` below and is applied in
  // `scoredSeverity`, so insertion order (= the order she tapped) survives.
  const [symptomSeverity, setSymptomSeverity] = useState<Record<string, number>>({});
  // Her Mild/Moderate/Severe answer for the symptom she picked first.
  const [symptomImpact, setSymptomImpact] = useState<string>("");
  const [hrtStatus, setHrtStatus] = useState<string>("");
  const [nutritionStyle, setNutritionStyle] = useState<string>("");
  const [relaxationStyle, setRelaxationStyle] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");

  // Derived for funnel compatibility: save-quiz / user_profiles still consume top_problems[].
  const topProblems = useMemo(
    () => Object.keys(symptomSeverity).filter((id) => symptomSeverity[id] > 0),
    [symptomSeverity]
  );

  // The intensities everything downstream reads. She rates her symptoms as a
  // whole, so every one she picked carries that same level - no per-symptom
  // ranking is implied by tile order any more. Before she taps, every symptom
  // keeps the old flat weight so nothing renders empty.
  const scoredSeverity = useMemo(() => {
    const level = IMPACT_VALUE[symptomImpact] ?? SELECTED_SEVERITY;
    return Object.fromEntries(topProblems.map((id) => [id, level]));
  }, [topProblems, symptomImpact]);

  const totalBurden = useMemo(
    () => Object.values(scoredSeverity).reduce((a, b) => a + b, 0),
    [scoredSeverity]
  );

  // Up to 3 of her symptoms, so the before/after proof covers what she actually
  // picked rather than just her #1. Hoisted out of the JSX because the carousel
  // that renders them needs a hook, and a hook can't live inside a conditional.
  const diagnosisTransforms = useMemo(() => getSymptomTransforms(topProblems, 3), [topProblems]);
  const transformCarousel = useCarouselIndex(diagnosisTransforms.length);

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

  const [error, setError] = useState<string | null>(null);

  // Set the moment she has an account (the anonymous sign-in in
  // `completeRegistration`), which is four screens before the paywall needs it.
  // PaywallView keys its ViewContent off this - see the `userId` prop there.
  const [userId, setUserId] = useState<string | null>(null);

  // Her own answer outranks the fallback: she just told us how hard this hits.
  const derivedSeverity = (symptomImpact || deriveSeverity(totalBurden)) as
    | "mild"
    | "moderate"
    | "severe";

  // Menopause Wellbeing Score (0–100, higher = better) - reacts to every answer:
  // symptoms and their intensity, stage, HRT, BMI (height+weight) and age.
  const scoreBreakdown = useMemo(
    () =>
      calculateWellbeingScore({
        symptomSeverity: scoredSeverity,
        hereFor,
        hrtStatus,
        ageBand,
        heightCm: bodyMetrics.height_cm,
        weightKg: bodyMetrics.weight_kg,
      }),
    [scoredSeverity, hereFor, hrtStatus, ageBand, bodyMetrics]
  );
  const score = scoreBreakdown.score;

  // The symptoms behind that score, heaviest first. This is what the results
  // card leads on instead of the size of the gap - see <ScoreGapCard />.
  const scoreDrivers = useMemo(() => getTopBurdenSymptoms(scoredSeverity, 3), [scoredSeverity]);

  // ─── What the three mid-quiz loaders print ────────────────────────────────
  // Seen-once guard, so Back into a reward shows the payoff instead of
  // recomputing it in front of her. A ref rather than state: nothing renders
  // off it, it only decides <QuizReward />'s initial state at mount.
  const rewardSeen = useRef<Partial<Record<Step, boolean>>>({});
  // The same transition, in state. The ref alone was enough while nothing
  // rendered off it, but the fixed Next bar now has to disappear while a
  // reward's meter runs (see `onRewardMeter` below) and a ref does not
  // re-render. Both are kept: the ref is read during render on a Back
  // navigation, before this state has been set for that mount.
  const [rewardRevealed, setRewardRevealed] = useState<Partial<Record<Step, boolean>>>({});
  const markRewardSeen = useCallback((step: Step) => {
    rewardSeen.current[step] = true;
    setRewardRevealed((prev) => (prev[step] ? prev : { ...prev, [step]: true }));
  }, []);

  /**
   * True while a reward step is still showing its <ComputeMeter /> rather than
   * its payoff.
   *
   * The fixed Next/Continue bar is a sibling of the step content and knew
   * nothing about the meter, so all three reward steps rendered a live
   * "Continue" over a loader that was, by its own caption, still working. Three
   * problems, in rising order of cost: it contradicts the screen (a bar saying
   * the step is finished under a meter saying it is not); the reward screens
   * are the only place in the quiz that argues something is being computed on
   * her answers, and a button to leave before it lands is what makes that read
   * as theatre; and tapping it advances past a payoff that has not rendered, so
   * the screen the loader exists to set up is one she never sees.
   *
   * `rewardSeen.current` is consulted as well as the state so a Back into a
   * reward she has already watched shows the bar on the first render rather
   * than a frame later - <QuizReward /> remounts and re-fires `onDone` from an
   * effect, which is one paint too late to hide the flicker.
   *
   * The quiz wrapper's 76px bottom reservation deliberately does *not* follow
   * this. Releasing it would centre the loader 38px lower and then jump the
   * payoff upward the moment the button appeared; a button that fades in over
   * settled content is the cheaper of the two.
   */
  const onRewardMeter =
    REWARD_STEPS.includes(currentStep) &&
    !rewardRevealed[currentStep] &&
    !rewardSeen.current[currentStep];

  const planCatalog = usePlanCatalog();

  // Loader B: her week, straight off MOVEMENT_VOLUME and CARDIO_VOLUME - the
  // same two tables the generator uses, so what she is shown here is what the
  // plan actually gives her. `perDay` is the snack cadence, hence the x7.
  const weekShape = useMemo(() => {
    const volume = planCatalog?.MOVEMENT_VOLUME[fitnessLevel];
    const cardio = planCatalog?.CARDIO_VOLUME[fitnessLevel];
    if (!volume || !cardio) return null;
    // The band, wherever there is one. `minutes` alone would understate the
    // week by the whole power block and contradict the range on the label she
    // tapped one screen ago; `maxMinutes` alone would overstate every session
    // that does not carry it.
    const span =
      volume.maxMinutes > volume.minutes
        ? `${volume.minutes}-${volume.maxMinutes}`
        : `${volume.minutes}`;
    // Cardio is scheduled on top of the strength sessions, every week, so the
    // headline minutes include it - at its week-1 shape, which is the week she
    // is about to be asked for. Read through `cardioForWeek()` rather than off
    // `sessions x minutes`: from 2026-08-29 some of those sessions are the
    // 19-minute interval protocol, and counting a hard day as a 25-minute walk
    // overstates her week by the difference.
    const week1 = planCatalog.cardioForWeek(fitnessLevel || null, 1);
    const cardioMinutes =
      week1.zone2.sessions * week1.zone2.minutes + week1.intervals * planCatalog.intervalsMinutes();
    const easy = `${week1.zone2.sessions} x ${week1.zone2.minutes} min of easy cardio`;
    return {
      weeklyMinutes:
        // For snacks `minutes` is already the whole day (all bursts together).
        (volume.perDay ? volume.minutes * 7 : volume.sessions * volume.minutes) +
        cardioMinutes,
      cadence: volume.perDay
        ? `${volume.sessions} one-move bursts a day, about ${span} min all in, plus a ${cardio.minutes[0]} min walk every day`
        : `${volume.sessions} x ${span} min a week, plus ${easy}${week1.intervals ? ` and ${week1.intervals} short interval session${week1.intervals > 1 ? "s" : ""}` : ""}`,
      // Snacks happen every day; sessions land on N of the 7. Kept for the
      // sr-only summary; the visible week is drawn by `weekPlanner` below.
      activeDays: volume.perDay ? 7 : Math.min(7, volume.sessions + cardio.sessions),
    };
  }, [planCatalog, fitnessLevel]);

  // Loader C: the size of the exercise pool her movement answer just produced.
  // It is the one number in the quiz she can verify against the plan she buys -
  // `allowedExercises` really does filter on her fitness level before the model
  // sees the list.
  const exercisePool = useMemo(() => {
    if (!planCatalog) return null;
    // Both pools. Since 2026-08-29 the `I` family is reserved for the power
    // block and is no longer in `allowedExercises()`, so counting that alone
    // would drop the number she is shown by the very movements the plan then
    // puts in front of her twice a week.
    return {
      allowed:
        planCatalog.allowedExercises(fitnessLevel || null).length +
        planCatalog.allowedPower(fitnessLevel || null).length,
    };
  }, [planCatalog, fitnessLevel]);

  // Loader B, part two: the seven days themselves, for <TrainingWeekBoard />.
  //
  // `weekShape` gives the SIZE of her week; this gives its SHAPE, and the shape
  // is what answers "I don't have time" - a woman reading "Tue: walk 20 min,
  // Wed: rest" has been told something a minutes total cannot tell her. Both
  // read the same two tables, so the board and the headline figure can never
  // disagree.
  //
  // Strength is spread rather than stacked (Mon/Wed/Fri, not Mon/Tue/Wed), and
  // the interval days are placed onto her emptiest days first: a sprint
  // protocol the morning after a squat session is not how a week 1 opens.
  const weekPlanner = useMemo(() => {
    const volume = planCatalog?.MOVEMENT_VOLUME[fitnessLevel];
    if (!planCatalog || !volume) return null;
    const week1 = planCatalog.cardioForWeek(fitnessLevel || null, 1);
    const days: PlannerDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => ({
      label,
      chips: [],
    }));

    if (volume.perDay) {
      // Snacks are every day by definition - `sessions` is bursts a day.
      for (const day of days) {
        day.chips.push({
          text: `${volume.sessions} bursts · ${volume.minutes} min`,
          tone: "strength",
        });
      }
    } else {
      const n = Math.min(7, volume.sessions);
      // Spread across the seven days rather than between the first and last of
      // them: dividing by `n - 1` pins a session to Sunday, so a two-day week
      // came out Mon + Sun, which is the one pairing that is not spread at all
      // once the week loops. Dividing by `n` gives Mon/Fri, Mon/Wed/Sat,
      // Mon/Wed/Fri/Sat.
      const slots = new Set(Array.from({ length: n }, (_, i) => Math.round((i * 7) / n)));
      const span =
        volume.maxMinutes > volume.minutes
          ? `${volume.minutes}-${volume.maxMinutes}`
          : `${volume.minutes}`;
      for (const slot of slots) days[slot].chips.push({ text: `Strength ${span} min`, tone: "strength" });
    }

    // Emptiest day first, ties broken by day order, so the week fills evenly
    // and deterministically rather than front-loading Monday.
    const emptiestFirst = () =>
      days.map((_, i) => i).sort((a, b) => days[a].chips.length - days[b].chips.length || a - b);

    for (const d of emptiestFirst().slice(0, week1.intervals)) {
      days[d].chips.push({ text: `Intervals ${planCatalog.intervalsMinutes()} min`, tone: "power" });
    }
    for (const d of emptiestFirst().slice(0, Math.min(7, week1.zone2.sessions)).sort((a, b) => a - b)) {
      days[d].chips.push({ text: `Walk ${week1.zone2.minutes} min`, tone: "cardio" });
    }

    return days;
  }, [planCatalog, fitnessLevel]);

  // Loader C: her actual first session, for <FirstSessionBoard />.
  //
  // The screen used to print the size of her pool and assert "nothing generic",
  // which asks her to take our word for it one screen before the price. This
  // discharges the claim instead: every name and every dose below comes out of
  // the catalog through the same four functions the generator's own fallback
  // path calls for week 1 - `allowedExercises()`, `PATTERN_PRIORITY`,
  // `defaultDoseForWeek()` and `buildPowerBlock()`. She is looking at Monday.
  //
  // It is deliberately NOT a model call. A preview that disagreed with the plan
  // she then buys would be the single most expensive inconsistency in the
  // funnel, so the board only ever shows what the deterministic path guarantees.
  const sessionPreview = useMemo(() => {
    const c = planCatalog;
    const volume = c?.MOVEMENT_VOLUME[fitnessLevel];
    if (!c || !volume) return null;
    const pool = c.allowedExercises(fitnessLevel || null);
    if (!pool.length) return null;

    const snack = volume.perDay;
    // A snack day IS its burst count; a session shows four, which is
    // `PATTERN_ESSENTIALS` - squat, push, hinge, core - the shape that makes a
    // session whole-body.
    const want = snack ? volume.sessions : c.PATTERN_ESSENTIALS;

    const taken = new Set<string>();
    const picks: typeof pool = [];
    for (const pattern of c.PATTERN_PRIORITY) {
      if (picks.length >= want) break;
      // The HARDEST row she is cleared for in this pattern, not the first one
      // in the pool. The pool is in id order, which puts every level-1 row
      // ahead of every level-2 one - so `find` handed a medium and an advanced
      // user the beginner session (chair squat, wall push-up) on the one screen
      // that claims the movements are matched to her level. Measured: medium,
      // advanced and beginner produced an identical five rows.
      let hit: (typeof pool)[number] | undefined;
      for (const e of pool) {
        if (c.patternOf(e.id) !== pattern || taken.has(e.id)) continue;
        if (!hit || e.level > hit.level) hit = e;
      }
      if (hit) {
        picks.push(hit);
        taken.add(hit.id);
      }
    }
    // Only if her pool has fewer patterns than slots.
    for (const e of pool) {
      if (picks.length >= want) break;
      if (!taken.has(e.id)) {
        picks.push(e);
        taken.add(e.id);
      }
    }
    if (!picks.length) return null;

    const warmSecs = c.listSeconds(c.DEFAULT_WARMUP);
    const coolSecs = c.listSeconds(c.DEFAULT_COOLDOWN);
    const bookendMin = snack ? 0 : Math.round((warmSecs + coolSecs) / 60);
    const workMinutes = Math.max(5, volume.minutes - bookendMin);

    const rows: SessionRow[] = picks.map((ex) => {
      const d = c.defaultDoseForWeek(ex, 1, workMinutes, picks.length);
      return {
        name: ex.name,
        dose: d.minutes
          ? `${d.minutes} min`
          : `${d.sets ?? 3} x ${d.seconds ?? ex.seconds ?? 40}s${ex.perSide ? "/side" : ""}`,
      };
    });

    // Weeks 1-2 are held to the low-impact rows by POWER_RAMP_WEEKS, so the
    // movement named here is the one she is genuinely handed on day one.
    if (!snack) {
      const block = c.buildPowerBlock(
        c.allowedPower(fitnessLevel || null),
        1,
        c.powerMinutes(volume)
      );
      const first = block?.[0];
      const ex = first ? c.getExercise(first.id) : undefined;
      if (first && ex) {
        rows.push({ name: ex.name, dose: `${first.sets ?? 3} x ${first.seconds ?? 20}s`, power: true });
      }
    }

    const span =
      volume.maxMinutes > volume.minutes
        ? `${volume.minutes}-${volume.maxMinutes}`
        : `${volume.minutes}`;

    return {
      heading: snack ? "Day 1 · your bursts" : "Week 1 · Session 1",
      minutesLabel: `${span} min`,
      warmup: snack
        ? undefined
        : { count: c.DEFAULT_WARMUP.length, minutes: Math.max(1, Math.round(warmSecs / 60)) },
      cooldown: snack
        ? undefined
        : { count: c.DEFAULT_COOLDOWN.length, minutes: Math.max(1, Math.round(coolSecs / 60)) },
      rows,
      sessionsTotal: snack
        ? `${volume.sessions * 7 * PLAN_WEEKS} bursts`
        : `${volume.sessions * PLAN_WEEKS}`,
    };
  }, [planCatalog, fitnessLevel]);


  // There used to be an `estrogenPct` here: `80 + (burden/maxBurden) * 15`,
  // rendered at 5xl as "{n}% of your symptoms trace back to shifting estrogen".
  //
  // It was the highest-risk element on the page. A number computed from her quiz
  // answers, presented in the visual language of a measurement, making a
  // clinical claim about *her* - when nothing in the funnel measures anything of
  // the kind. It is also the one claim on the results screen a regulator or a
  // clinician would ask us to substantiate, and there is nothing to hand them.
  //
  // The card keeps its shape and its punch by counting the one thing we do
  // legitimately know - how many symptoms she selected - and stating the
  // estrogen link as what it is: a general fact about menopause, not a
  // personalized statistic. See the "Why this is happening" block below.

  // The calculating loader's clock lives in <CalculatingScreen /> - see the
  // component for why it is not held here.

  // Her score, as one animated value. The results card renders both the number
  // and the bar off this, so they cannot finish on different frames.
  const scoreMv = useMotionValue(0);

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

  // Results headline sweep. Timed to land *after* the letter finishes rising -
  // LETTER_DELAY (0.58s) plus its 0.8s travel - so the marker doesn't pull the
  // eye off the reveal it is supposed to follow. The headline itself is already
  // on screen by then (delay 0.75); the sweep is the second beat, not the first.
  const [resultsHighlight, setResultsHighlight] = useState(false);
  useEffect(() => {
    if (phase !== "results") {
      setResultsHighlight(false);
      return;
    }
    const t = setTimeout(() => setResultsHighlight(true), 1550);
    return () => clearTimeout(t);
  }, [phase]);

  // Count the score up once, the first time she reaches results. Guarded on a
  // ref rather than the phase alone: backing out of the plan screen and
  // returning used to replay the whole reveal from zero, which reads as the page
  // recalculating her result rather than as going back to it.
  const scoreAnimated = useRef(false);
  useEffect(() => {
    if (phase !== "results") return;
    if (scoreAnimated.current) {
      scoreMv.set(score);
      return;
    }
    scoreAnimated.current = true;
    scoreMv.set(0);
    // Retimed to the letter, which now carries the number: it starts rising at
    // LETTER_DELAY (0.58s) and lands 0.8s later, so the count starts just as the
    // sheet clears the envelope's mouth and settles a fraction after it stops.
    // It used to start at 0.9s and run to 2.3s, which was tuned for a card
    // roughly a screen below the reveal.
    const controls = animate(scoreMv, score, {
      duration: prefersReducedMotion ? 0 : 1.15,
      delay: prefersReducedMotion ? 0 : 0.75,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [phase, score, scoreMv, prefersReducedMotion]);

  // (validation handled inside OtpForm)

  // Check if current step is answered
  const stepIsAnswered = useCallback(
    (step: Step) => {
      switch (step) {
        case "q1_age":
          return ageBand !== "";
        case "q_body":
          return bodyMetrics.height_cm !== null && bodyMetrics.weight_kg !== null;
        case "q_fitness":
          return fitnessLevel !== "";
        case "q_training_time":
          return trainingTime !== "";
        case "q2_here_for":
          return hereFor !== "";
        case "q_menopause_type":
          return menopauseType !== "";
        case "q3_goals":
          return goal.length > 0;
        case "q4_symptoms":
          return topProblems.length > 0;
        case "q_symptom_impact":
          return symptomImpact !== "";
        case "reward_symptoms":
        case "reward_social_proof":
        case "reward_plan_shape":
        case "reward_progress":
          return true;
        case "q_nutrition":
          return nutritionStyle !== "";
        case "q_relaxation":
          return relaxationStyle !== "";
        case "q5_hrt":
          return hrtStatus !== "";
        case "q8_name":
          return firstName.trim().length > 0;
        default:
          return false;
      }
    },
    [ageBand, bodyMetrics, fitnessLevel, trainingTime, hereFor, menopauseType, goal, topProblems, symptomImpact, nutritionStyle, relaxationStyle, hrtStatus, firstName]
  );

  // One payload, two consumers: the sessionStorage stash below and the
  // save-quiz POST in completeRegistration. They used to be two hand-kept copies
  // of the same object literal, which is one place too many to forget a field.
  const quizPayload = useMemo(
    () => ({
      age_band: ageBand || null,
      top_problems: topProblems,
      symptom_impact: symptomImpact || null,
      tried_options: TRIED_OPTIONS,
      hrt_status: hrtStatus || null,
      goal,
      goals: goal,
      here_for: hereFor || null,
      menopause_type: menopauseType || null,
      nutrition_style: nutritionStyle || null,
      relaxation_style: relaxationStyle || null,
      name: firstName.trim() || null,
      height_cm: bodyMetrics.height_cm,
      weight_kg: bodyMetrics.weight_kg,
      height_unit: bodyMetrics.height_unit,
      weight_unit: bodyMetrics.weight_unit,
      fitness_level: fitnessLevel || null,
      training_time: trainingTime || null,
    }),
    [
      ageBand,
      topProblems,
      symptomImpact,
      hrtStatus,
      goal,
      hereFor,
      menopauseType,
      nutritionStyle,
      relaxationStyle,
      firstName,
      bodyMetrics,
      fitnessLevel,
      trainingTime,
    ]
  );

  /**
   * The same answers in the shape this component holds them, for the resume
   * ticket. `quizPayload` above is the server's shape - normalized cm/kg, nulls
   * for empties - and restoring the funnel from it would hand her back a
   * rounded-off version of what she typed and lose which unit she typed it in.
   *
   * Written to `sessionStorage` only by `handleStartCheckout`, read back only by
   * the restore effect below it. See the ticket's docstring at the top of this
   * file for why that single writer is what keeps a restored paywall from being
   * a cold one. (The funnel had no browser copy of the answers at all between
   * 2026-08-16 and now: the old `pending_quiz_answers` stash was removed because
   * all three of its call sites were `removeItem` and nothing ever read it.)
   */
  const funnelAnswers = useMemo(
    () => ({
      ageBand,
      heightUnit,
      heightCm,
      heightFt,
      heightIn,
      weightUnit,
      weightKg,
      weightLb,
      fitnessLevel,
      trainingTime,
      hereFor,
      menopauseType,
      goal,
      symptomSeverity,
      symptomImpact,
      hrtStatus,
      nutritionStyle,
      relaxationStyle,
      firstName,
    }),
    [
      ageBand,
      heightUnit,
      heightCm,
      heightFt,
      heightIn,
      weightUnit,
      weightKg,
      weightLb,
      fitnessLevel,
      trainingTime,
      hereFor,
      menopauseType,
      goal,
      symptomSeverity,
      symptomImpact,
      hrtStatus,
      nutritionStyle,
      relaxationStyle,
      firstName,
    ]
  );

  const goNext = useCallback(() => {
    if (!stepIsAnswered(currentStep)) return;
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // `QuizComplete` used to fire here, carrying symptom_count and goal. It
      // was a duplicate: `Lead` is sent one screen later from save-quiz with the
      // same two params, off the profile insert rather than sessionStorage, so
      // it counts women instead of tabs. One of the two had to go and it was the
      // weaker one.
      setPhase("calculating");
    }
  }, [currentStep, stepIndex, stepIsAnswered]);

  // Auto-advance for single-choice steps. The short delay is the point: she has
  // to see her own tile light up before the screen moves, or the quiz feels like
  // it answered for her. None of these steps is last in STEPS, so incrementing
  // is always safe.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);
  const selectAndAdvance = useCallback((apply: () => void) => {
    apply();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, 260);
  }, []);

  // Question 1 is the funnel's entrance, so there is nothing behind it: the Back
  // control is not rendered on step 0 (see the progress row) and this is a no-op
  // if it is ever reached there anyway.
  const goBack = useCallback(() => {
    // Cancel a pending auto-advance, or Back mid-animation lands her forward.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [stepIndex]);

  /**
   * Give her an account and save her answers - without asking her for anything.
   *
   * Runs behind the calculating loader, where the email + 6-digit code step used
   * to be. Supabase anonymous sign-in mints a real user id with no email
   * attached, which is all `/api/auth/save-quiz` and Stripe checkout need. The
   * email arrives later, at Stripe, and the webhook stamps it onto this same id
   * - so her profile, her plan and her subscription all hang off one account
   * from the first question to the first charge.
   *
   * Returns false when the caller should stay put (an error to retry, or a
   * redirect already in flight).
   */
  const completeRegistration = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      // getUser() rather than getSession(): it validates against Supabase
      // instead of trusting localStorage. A token for an account the purge cron
      // has since deleted still parses locally but is dead server-side, and
      // save-quiz would 401 on it with no way out but a cleared browser.
      const supabase = await getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      let sessionUser = userData?.user ?? null;

      // A session already here means she came back through the ad on an account
      // she already has. If it still has access, send her to the product rather
      // than re-onboarding her or selling her a second subscription. Checked for
      // anonymous sessions too - one that already paid is exactly the case that
      // must not be sold twice, and `is_anonymous` is not a reliable "never
      // paid" signal once the webhook has bound an email to the account.
      if (sessionUser) {
        const { data: trialRow } = await supabase
          .from("user_trials")
          .select(TRIAL_SELECT_COLS)
          .eq("user_id", sessionUser.id)
          .maybeSingle();
        if (trialRow && stateAllowsAccess(getAccountState(trialRow).state)) {
          router.replace("/dashboard");
          router.refresh();
          return false;
        }
      }

      if (!sessionUser) {
        // Drop any dead token locally first, or signInAnonymously refuses to
        // replace what it thinks is a live session.
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        const { user: anonUser, error: anonError } = await signInAnonymouslyWithRetry(supabase);
        if (!anonUser) {
          console.error("Anonymous sign-in failed:", anonError);
          setError(anonSignInMessage(anonError));
          return false;
        }
        sessionUser = anonUser;
      }

      // She now has an id, and it is the only identifier this funnel will ever
      // have for her - Stripe collects the email, and that is two screens away.
      // Hand it to the pixel as advanced-matching `external_id` so the browser
      // ViewContent and InitiateCheckout below match the same person as the
      // server-side Lead this next request is about to send. See
      // `identifyMetaUser`.
      identifyMetaUser(sessionUser.id);
      setUserId(sessionUser.id);

      const res = await fetch("/api/auth/save-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ quizAnswers: quizPayload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Couldn't save your answers. Please try again.");
        return false;
      }

      // Ad-funnel step 3, `Lead`, is deliberately NOT fired here any more. It
      // used to be, deduped in sessionStorage, which made it "once per tab" —
      // and ads send the same woman back over and over, so every return in a
      // fresh tab minted another Lead. Since Lead is the fallback optimization
      // objective while Purchase volume is thin, that inflation taught delivery
      // to chase repeat clickers. `/api/auth/save-quiz` now sends it from the
      // server on profile *insert*, where the database can tell a new woman
      // from a returning one. See `sendMetaLead`.
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
      return false;
    }
  }, [quizPayload, router]);

  // Runs once per visit to the calculating screen. The ref guard matters: a
  // second run would mint a second anonymous account and orphan the first.
  const registrationStarted = useRef(false);
  const [registrationRetry, setRegistrationRetry] = useState(0);

  useEffect(() => {
    if (phase !== "calculating" || registrationStarted.current) return;
    registrationStarted.current = true;

    // No cleanup flag on purpose. StrictMode remounts this effect in dev, and
    // the ref (which survives the remount) already blocks the second run - so a
    // cancel-on-unmount guard would leave the only in-flight run unable to
    // advance the phase, hanging the funnel on the loader in dev only.
    void (async () => {
      // The loader is a real beat in the funnel - she is watching her plan be
      // built, and that perceived work is the only receipt she gets for the
      // price - so hold it for its full length even when the network is fast,
      // and hold it longer when it isn't. Results only open once the save has
      // actually landed; otherwise she could reach the paywall with no profile
      // and no account to check out with.
      const [ok] = await Promise.all([
        completeRegistration(),
        new Promise((resolve) => setTimeout(resolve, CALCULATING_MS)),
      ]);
      if (ok) setPhase("results");
      else registrationStarted.current = false; // let the retry button through
    })();
  }, [phase, completeRegistration, registrationRetry]);

  const toggleProblem = (problemId: string) => {
    setSymptomSeverity((prev) => {
      const on = Boolean(prev[problemId]);
      // Untick her first pick and the follow-up is now rating a different
      // symptom than the one she answered about, so the rating goes with it.
      if (on && Object.keys(prev)[0] === problemId) setSymptomImpact("");
      if (on) {
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

  const [checkoutLoading, setCheckoutLoading] = useState(false);

  /**
   * Un-stick the buy button when she comes Back from Stripe.
   *
   * `handleStartCheckout` sets `checkoutLoading` and then leaves the page via
   * `window.location.href`, so it never clears the flag — there is no "after"
   * to clear it in. Browsers restore this page from bfcache *exactly as it was*,
   * spinner and all, so pressing Back at Stripe returned her to a paywall whose
   * only CTA was permanently disabled. Her sole remaining move was a hard
   * refresh, and the visitor most likely to press Back at a payment form is
   * precisely the hesitant one an ad is paying to re-engage.
   *
   * `pageshow` with `persisted` is the bfcache restore signal; a normal load
   * mounts fresh with the flag already false, so the guard costs nothing.
   */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setCheckoutLoading(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  const [syncingPayment, setSyncingPayment] = useState(false);

  /**
   * The address Stripe collected, read back off her account for the success
   * screen.
   *
   * It is the only thing standing between a paid customer and an account she
   * cannot log into: she never set a password, so that address *is* her login,
   * and until now nothing in the funnel ever told her so or showed it back to
   * her to check. A typo at Stripe is currently a support ticket with no
   * self-serve fix (see "She paid but can't log into the app" in CLAUDE.md).
   *
   * The address only exists on `auth.users` once fulfillment has bound it, which
   * is a race with the webhook - so if it isn't there yet and we have a
   * `session_id`, run the same `sync-session` fallback the "Manage my
   * subscription" button used to run and read again. `claimFulfillment()` makes
   * that idempotent against the webhook, so at worst this is a wasted call, and
   * at best it repairs a purchase whose webhook never arrived while she is still
   * on the page.
   */
  const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null);
  /**
   * Whether this landing is a free trial rather than a purchase — `offer` is
   * stamped on the success URL by `create-checkout` from the same variable
   * that set `trial_period_days`, so the screen and the charge agree.
   */
  const isTrialLanding = isTrialOffer(searchParams.get("offer"));
  /**
   * The first-charge date printed on the trial landing. Stripe's own
   * `trial_end` when fulfillment has already written it (read back through
   * `/api/account/status`), else the same arithmetic the paywall used — the
   * two only differ if checkout straddled local midnight.
   */
  const [trialChargeDate, setTrialChargeDate] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "download") return;
    // She has paid. The ticket's whole job was getting her back to the price
    // screen, and it must not survive to pull a paying customer onto a paywall
    // if this tab is reloaded.
    clearFunnelResume();
    let cancelled = false;

    void (async () => {
      const supabase = await getSupabase();
      const read = async () => (await supabase.auth.getUser()).data?.user?.email ?? null;

      let email = await read();
      if (!email) {
        const sessionId = searchParams.get("session_id");
        if (sessionId) {
          try {
            await fetch("/api/stripe/sync-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: sessionId }),
            });
            email = await read();
          } catch {
            // The screen reads fine without it - the copy falls back to "the
            // email address you used at checkout".
          }
        }
      }
      if (!cancelled) setCheckoutEmail(email);

      if (isTrialLanding) {
        let chargeAt = trialEndDate();
        try {
          const res = await fetch("/api/account/status", {
            credentials: "include",
            cache: "no-store",
          });
          const json = res.ok ? ((await res.json()) as { ends_at?: string | null }) : null;
          const ends = json?.ends_at ? new Date(json.ends_at) : null;
          // Trust the server date only if it looks like *this* trial: in the
          // future and no further out than the free trial plus a day. A stale
          // period end on a merged account would otherwise print last year.
          if (
            ends &&
            !Number.isNaN(ends.getTime()) &&
            ends.getTime() > Date.now() &&
            ends.getTime() <= Date.now() + (TRIAL_DAYS + 1) * 86_400_000
          ) {
            chargeAt = ends;
          }
        } catch {
          // Fall through to the client-side date.
        }
        if (!cancelled) setTrialChargeDate(formatChargeDate(chargeAt));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, searchParams, isTrialLanding]);

  /** Back to question 1. The funnel's only recovery move — there is no state to
   *  restore, so restarting is both the simplest repair and the honest one.
   *  Drops the resume ticket with it: she is being sent to question 1 on
   *  purpose, and a ticket left behind would pull her back out of the quiz she
   *  has just been asked to retake on the next reload. */
  const restartQuiz = useCallback(() => {
    clearFunnelResume();
    setStepIndex(0);
    setPhase("quiz");
  }, []);

  /**
   * Come back from Stripe onto the paywall, not onto question 1.
   *
   * Runs once, before the first paint (see `useIsomorphicLayoutEffect`), and
   * only when this load would otherwise have started the funnel from the top -
   * `?phase=download` and the dev-only phase params are already decided by the
   * initializer and outrank a ticket.
   *
   * What it restores is every answer she gave plus the account id she gave them
   * on, so the screens behind the paywall (Back → relief → diagnosis → results)
   * are the same screens she just walked, not cold ones. `reliefStage` is pinned
   * to `reward` for the reason the stage machine never rewinds past it either:
   * she has already done the breathing exercise, and making her do it again to
   * get back to a price she has already seen is a worse tax than the reload was.
   *
   * The pixel needs re-identifying because this is a fresh document - without it
   * the browser `ViewContent` this paywall is about to fire carries no
   * `external_id` and stops matching the server copy. Its own once-per-tab guard
   * (also `sessionStorage`) means a restored paywall does not re-count her.
   */
  const resumeChecked = useRef(false);
  const skipPhaseTransition = useRef(false);
  useEffect(() => {
    // Runs after every commit, i.e. after the restore swap has painted.
    skipPhaseTransition.current = false;
  });
  useIsomorphicLayoutEffect(() => {
    if (resumeChecked.current) return;
    resumeChecked.current = true;
    // "quiz" is the cold-start phase. What this guard is really saying is "only
    // when this load would otherwise begin the funnel from the top" -
    // `?phase=download` and the dev-only params are decided by the initializer
    // and outrank a ticket. Keep it keyed to whatever that cold-start phase is:
    // when the default moved off the start screen this read `phase !== "start"`,
    // which silently disabled the whole resume path - every Back from Stripe
    // dropped her on question 1 with her answers gone, the exact bug the ticket
    // exists to prevent.
    if (phase !== "quiz") return;

    const saved = readFunnelResume();
    if (!saved) return;

    const a = saved.answers;
    setAgeBand(a.ageBand);
    setHeightUnit(a.heightUnit);
    setHeightCm(a.heightCm);
    setHeightFt(a.heightFt);
    setHeightIn(a.heightIn);
    setWeightUnit(a.weightUnit);
    setWeightKg(a.weightKg);
    setWeightLb(a.weightLb);
    setFitnessLevel(a.fitnessLevel);
    setTrainingTime(a.trainingTime);
    setHereFor(a.hereFor);
    setMenopauseType(a.menopauseType);
    setGoal(a.goal);
    setSymptomSeverity(a.symptomSeverity);
    setSymptomImpact(a.symptomImpact);
    setHrtStatus(a.hrtStatus);
    setNutritionStyle(a.nutritionStyle);
    setRelaxationStyle(a.relaxationStyle);
    setFirstName(a.firstName);
    setUserId(saved.userId);
    identifyMetaUser(saved.userId);
    // She reached the paywall the first time, so the quiz is behind her: leave
    // the step index at the end rather than at question 1, or a Back out of the
    // funnel's front half would restart it after all.
    setStepIndex(STEPS.length - 1);
    setReliefStage("reward");
    // Swap without the phase cross-fade. This one is not a step she took:
    // question 1 is on screen only because it is what the server rendered before
    // the ticket could be read, and fading it out for 0.22s in front of her is
    // the same "your quiz is gone" beat, just prettier. Reset after the paint
    // below, so every real phase change still animates.
    skipPhaseTransition.current = true;
    setPhase("paywall");
    // Mount-only by construction: the ref makes a re-run a no-op, and `phase` is
    // read only for the guard above, where it is "quiz" on the mount that
    // matters. (The lint rule does not walk into the isomorphic alias, so the
    // empty dep array is not flagged - it is still deliberate.)
  }, []);

  const handleStartCheckout = async (metaEventId: string) => {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      // By construction she has an account here: this screen is only reachable
      // by walking the funnel, and the loader does not open the results until
      // `completeRegistration()` has saved her answers to it.
      //
      // So a missing session means the funnel is not in the state it looks like
      // it is in — a wiped storage mid-visit, an expired token. Restart the quiz
      // rather than minting a blank anonymous account, which is what this used
      // to do: that account has no profile, and the plan she paid $59 for would
      // come out generic. Two minutes of quiz beats the wrong plan.
      // (If she is really an existing customer, the email she types at Stripe
      // collides in the webhook and the subscription is merged onto her real
      // account — see resolveCheckoutAccount.)
      const supabase = await getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        restartQuiz();
        setCheckoutLoading(false);
        return;
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: PLAN_ID,
          from_registration: true,
          return_origin: origin || undefined,
          // Dedup key for the server-side InitiateCheckout the route fires.
          meta_event_id: metaEventId,
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // She already has an active subscription on this account — the
        // retargeted customer who walked the funnel a second time. Send her to
        // what she has already bought instead of showing her a payment error
        // for the crime of trying to pay us twice. Apple-managed subscriptions
        // come back with a `manageUrl` and belong in Apple's settings, not ours.
        if (res.status === 409 && data.error === "already_subscribed") {
          if (data.manageUrl) {
            window.location.href = data.manageUrl;
            return;
          }
          router.replace("/dashboard");
          router.refresh();
          return;
        }
        setError(data.error ?? "Could not start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }
      if (data.url) {
        // The last line before she leaves our origin. Stamp the resume ticket so
        // Back at Stripe reopens this paywall instead of question 1 - see the
        // ticket's docstring at the top of this file. The id is the one we just
        // verified above, which is also the account this checkout session is
        // being opened on.
        writeFunnelResume(userData.user.id, funnelAnswers);
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

  /**
   * A session is already in the browser — decide whether she belongs in the app
   * or in the funnel.
   *
   * **Gate on access, never on "a profile row exists."** The Supabase session
   * lives in localStorage forever, so every woman who ever finished the quiz
   * still has one on her next ad click. Keying off the profile row meant she was
   * bounced to `/dashboard`, payment-gated by `proxy.ts`, and redirected right
   * back to `/register?phase=paywall` — landing cold on the price screen with no
   * quiz, no score, no plan and no relief exercise. Every piece of persuasion the
   * funnel owns was skipped, for the one visitor who had already said no once,
   * and the click was paid for.
   *
   * So: access → the app. No access → she walks the funnel again, on the same
   * account. `save-quiz` UPDATEs an existing profile, so a re-run mints no second
   * account and costs nothing. This now matches `completeRegistration()`, which
   * has always made the decision this way; the two disagreeing was the bug.
   */
  useEffect(() => {
    if (
      phase === "calculating" ||
      phase === "results" ||
      phase === "diagnosis" ||
      phase === "relief" ||
      phase === "paywall" ||
      phase === "download"
    ) {
      return;
    }

    // No auth cookie means there is no session to find, and the overwhelming
    // majority of this page's traffic is a cold ad click with exactly that.
    // Skipping the check keeps the Supabase auth chunk (52KB gz) off the wire
    // entirely for those visitors - they first need it when the quiz ends and
    // completeRegistration() signs them in. The hint is only allowed to skip
    // work here; the branch below still verifies before redirecting anyone.
    if (!hasAuthCookieHint()) return;

    let mounted = true;

    async function checkSessionAndRedirect() {
      if (!mounted) return;

      try {
        const supabase = await getSupabase();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Session check error:", sessionError);
          return;
        }

        // No session at all: a first-time visitor. Leave her on question 1.
        if (!sessionData?.session?.user) return;

        const user = sessionData.session.user;

        // The same read `proxy.ts` and the dashboard layout do. Selecting the
        // full TRIAL_SELECT_COLS is load-bearing — a partial select makes the
        // missing columns read as "no dispute, not canceled".
        const { data: trialRow, error: trialError } = await supabase
          .from("user_trials")
          .select(TRIAL_SELECT_COLS)
          .eq("user_id", user.id)
          .maybeSingle();

        if (trialError) {
          // Fail toward the funnel, not toward a redirect loop. Worst case she
          // is shown a paywall she has already paid past, and `/dashboard` is
          // one tap away; the opposite failure strands a paying customer.
          console.error("Error checking account state:", trialError);
          return;
        }

        if (!mounted) return;

        if (trialRow && stateAllowsAccess(getAccountState(trialRow).state)) {
          // She is paid up. This is the only case that belongs in the app, and
          // it is the only one `proxy.ts` will not bounce straight back here.
          router.replace("/dashboard");
          router.refresh();
          return;
        }

        // No access. She stays in the funnel and sees all of it, from the start
        // screen — which is emphatically the right landing for an ad click, and
        // now the only one. (`proxy.ts` used to send accounts with no onboarding
        // to `?phase=quiz`; it sends them to plain `/register` instead, so there
        // is no longer a phase param to honour.)
      } catch (e) {
        if (!mounted) return;
        console.error("Error checking session:", e);
      }
    }

    checkSessionAndRedirect();

    return () => {
      mounted = false;
    };
  }, [router, phase]);

  // max-w-4xl, with the horizontal padding trimmed on phones, so the quiz card
  // gets the extra width in both directions. The quiz is the only phase that
  // spans this box - results / plan / relief / paywall / download all wrap
  // themselves in max-w-md - so widening it here widens nothing else. The quiz's
  // fixed Next bar carries the same max-w; keep the two equal or the button
  // stops lining up with the card above it.
  return (
    <main className="overflow-hidden relative mx-auto px-2 pb-2 sm:px-4 sm:pb-4 h-dvh flex flex-col pt-2 max-w-4xl min-h-0">
      {/* One cross-fade across every phase change.
          Each step *inside* the quiz already animated, but the phase changes
          themselves - results → plan → relief → paywall, the five biggest
          moments in the funnel - were plain sibling conditionals that swapped
          instantly. Eight hard cuts made it read as eight separate pages rather
          than one product.

          Opacity only, deliberately. A translate here would look better in
          isolation and would break every screen: a transformed ancestor becomes
          the containing block for `position: fixed`, so all five sticky CTA bars
          would anchor to this box (inset by main's padding) instead of the
          viewport, and float a few pixels off the bottom edge with gaps down
          each side. The per-phase entrance animations supply the movement. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: prefersReducedMotion || skipPhaseTransition.current ? 0 : 0.22,
            ease: "easeOut",
          }}
          className="flex-1 flex flex-col min-h-0"
        >

      {/* Calculating Phase - loader between quiz and results; also where the
          account is created and the quiz is saved (see completeRegistration) */}
      {phase === "calculating" && (
        <CalculatingScreen
          error={error}
          onRetry={() => {
            setError(null);
            setRegistrationRetry((n) => n + 1);
          }}
        />
      )}

      {/* Results Phase */}
      {phase === "results" && (
        <div
          className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-[calc(120px+env(safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:rgba(255,141,161,0.35)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 hover:[&::-webkit-scrollbar-thumb]:bg-primary/50"
        >
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-md mx-auto w-full pt-2"
          >
            {/* Results image, delivered: the envelope opens and her letter
                rises out of it, and the letter is the score card - metric,
                number, scale, goal. The copy below is re-timed to cascade
                behind the letter rather than land on top of it - see the
                delays. */}
            <div className="mb-3">
              <EnvelopeReveal
                src="/illustrations/results.webp"
                scoreMv={scoreMv}
                score={score}
                name={firstName.trim() || undefined}
              />
            </div>

            {/* Headline. The finding carries a rose sweep - see
                getSeverityHeadline for why it is split into three parts. */}
            {(() => {
              const headline = getSeverityHeadline(derivedSeverity);
              return (
                <motion.h1
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75 }}
                  className="text-3xl sm:text-4xl font-normal text-[#3D3D3D] text-center leading-tight mb-2"
                >
                  <span className="font-bold">{firstName.trim() || "You"}</span>
                  {headline.pre}
                  <HighlightSweep variant="rose" active={resultsHighlight}>
                    {headline.sweep}
                  </HighlightSweep>
                  {headline.post}
                </motion.h1>
              );
            })()}

            {/* Pain paragraph - the subheadline under the finding.
                Left-aligned, because centred is right for one-line headings and
                wrong for body copy: the ragged left edge costs a re-fixation on
                every line, and this runs to two or three.
                Sized down to 14px on 2026-08-17. It had been pushed to 15px
                while it was still a four-line paragraph; it is one sentence now,
                and at 15px directly under a 3xl/4xl headline it sat close
                enough in weight to read as a second headline rather than as the
                line that supports it. 14px keeps it comfortably readable at
                45-60 while restoring the step down the hierarchy needs. */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.85 }}
              className="text-sm text-[#5A5A5A] leading-relaxed mb-4 px-0.5"
            >
              {getSeverityPainText(derivedSeverity, topProblems.length, firstName || "you")}
            </motion.p>

            {/* What is behind her score, why each part of it happens, and the
                one cause underneath all of it. The score itself was delivered
                by the letter above; the "Why this is happening to you" card
                that used to sit under this one was folded in on 2026-08-17 -
                see <ScoreCauseCard /> for both splits. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95 }}
            >
              <ScoreCauseCard
                score={score}
                benchmark={getScoreBenchmark(ageBand)}
                cohortLabel={AGE_BAND_LABELS[ageBand] ?? "women your age"}
                drivers={scoreDrivers}
                symptomCount={topProblems.length}
              />
            </motion.div>

            {/* The "Why this is happening to you" card used to sit here: her
                symptom count at 5xl over "they all trace back to the same
                thing: estrogen rising and falling", plus the "not willpower"
                line. All three moved *into* the card above on 2026-08-17,
                because the two cards were halves of one sentence with 200px of
                scroll between them - the list of symptoms was in the first and
                the claim about that list was in the second. Nothing was cut;
                the count is the node the rail runs into, and the mechanism
                lines it now carries are what turned the claim into an argument.

                Earlier occupants of this slot, for the record: a two-line SVG
                estrogen chart, an illustration of the hormonal swings
                (<HormoneShift />), <PlanFinishBoard /> (moved to the plan-ready
                card below, where "what happens next" belongs) and a 3-col grid
                of her own symptom tiles. */}

            {/* The plan, existing.
                The ad promised "your personalized 8-week plan, built around
                your symptoms" and the loader said "Building your 8
                weeks" - and then this screen used to deliver a score, a chart,
                and a promise that she would *understand* her symptoms within two
                weeks. The object she was promised did not appear anywhere on the
                page she waited for, and the last line before the CTA sold
                knowledge rather than relief.
                This block closes that loop, so the next tap opens something that
                already exists rather than starting another pitch.

                Green, not pink. Green is what the gauge above has just spent a
                whole card establishing as "the gap and the thing that closes
                it", so the plan arriving in the same colour reads as the answer
                to the number she was just shown. Pink also put a brand-tinted
                card directly above the pink gradient CTA, roughly 60px apart -
                the card read as a second button, and the two of them split the
                attention the real one needed. Pink is the CTA's colour on this
                screen and nothing else's. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.16 }}
              className="rounded-2xl border-2 border-green-600/30 bg-green-50 p-4 mb-5"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600/15">
                  <Check className="h-4 w-4 text-green-700" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-[#3D3D3D] leading-tight">
                    {firstName.trim() ? `${firstName.trim()}, your ` : "Your "}
                    {PLAN_WEEKS}-week plan is ready
                  </h2>
                  <p className="text-xs text-[#5A5A5A] leading-snug mt-1">
                    Built from your {QUESTION_STEPS.length} answers - {PLAN_PILLARS.length} small
                    things a day, starting tomorrow.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                {PLAN_PILLARS.map((pillar) => (
                  <div key={pillar.key} className="flex flex-1 flex-col items-center gap-1">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-xl",
                        pillar.chip
                      )}
                    >
                      <pillar.icon className={cn("h-4 w-4", pillar.tint)} />
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-[#5A5A5A] text-center">
                      {pillar.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* What the plan actually does with those eight weeks, as an
                  instrument rather than a claim. It sat inside the "why this is
                  happening" card until 2026-08-17, where it was answering a
                  question that card does not ask: the card explains the cause,
                  and a finish line is about the cure.

                  Here it is the evidence for the sentence directly above it -
                  "your {PLAN_WEEKS}-week plan is ready" is an assertion until
                  something shows what the eight weeks contain. Both ends are
                  her own words (her #1 symptom today, the goal she picked at
                  week 8), so the card reads as her plan rather than a product
                  description. See <PlanFinishBoard />. */}
              <PlanFinishBoard
                topProblems={topProblems}
                goal={goal}
                className="mt-3.5"
              />
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
              <button
                type="button"
                onClick={() => setPhase("diagnosis")}
                className={CTA_GRADIENT_CLASS}
                style={CTA_GRADIENT_STYLE}
              >
                {getGoalCtaLabel(goal)}
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-xs text-[#9A9A9A] text-center mt-1.5">{RESULTS_CTA_SUB}</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Plan Phase (`diagnosis` internally) - the offer, in the order she needs
          it: the plan she gets -> what changes -> someone who finished it ->
          the cost of doing nothing -> the app that runs it. */}
      {phase === "diagnosis" && (
        <div
          className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-[calc(132px+env(safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:rgba(255,141,161,0.35)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 hover:[&::-webkit-scrollbar-thumb]:bg-primary/50"
        >
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

            {/* ══ Block 1: THE PLAN ═══════════════════════════════════════════
                This is the product, so it is now the first thing on the page and
                the only block that keeps a 4xl headline.

                It used to sit fourth, behind a fear chart and a before/after
                carousel, each of which shouted at exactly the same volume: three
                consecutive 4xl bold headlines meant nothing was subordinate to
                anything and therefore nothing read as the point. She scrolled,
                hit the third giant headline, and left before reaching what she
                was actually being sold.

                There is exactly one h1 on this screen, and this is it. A
                separate "{goal} in 8 weeks" hero used to sit directly above it,
                so the page opened on two 4xl headlines saying the same thing in
                different words, roughly 60px apart - the reader had to pick
                which one was the promise. They are now one sentence: her goal,
                the timeframe and the deliverable together, with the score
                movement demoted to the subline where a proof point belongs.

                The screenshots are also no longer decoration, and no longer
                split. They all run through one static bezel as
                <PlanHeroCarousel />: `day` first, because "Day 1 · Week 1" plus
                four pillars with real progress is the whole offer in one frame,
                then the surfaces that run it - a session, the food list, a
                habit, the eight weeks, the streak. See PLAN_HERO_SLIDES for
                why that order. They used to be a hero plus
                a tilted, cropped, faded trio of the same three shots 300px
                lower, where nothing in them could be read - see the component
                for why one legible phone beats one legible phone and three
                thumbnails. It is *not* full width: a 2.17:1-tall shot eats a
                viewport at column width. ─────────────────────────────────── */}
            {(() => {
              const goalLabel = getOfferPromise(goal).toLowerCase();
              return (
                <motion.div
                  // No delay: this block contains the hero, and the phase
                  // cross-fade in front of it (mode="wait") has already spent
                  // 0.22s before this even mounts. Anything added here is dead
                  // air on the screen that has to land fastest.
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: "easeOut" }}
                  className="mb-6"
                >
                  <div className="px-1 mb-3">
                    <h1 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                      {firstName.trim() ? `${firstName.trim()}, here's your ` : "Here's your "}
                      <HighlightSweep active={diagnosisHighlight}>
                        {PLAN_WEEKS}-week plan
                      </HighlightSweep>{" "}
                      to {goalLabel}.
                    </h1>
                    <p className="text-xs text-[#5A5A5A] mt-1.5">
                      Built from your {QUESTION_STEPS.length} answers. About 15 minutes a day -
                      enough to take your score from{" "}
                      <span className="font-bold text-[#3D3D3D]">{score}</span> to{" "}
                      <span className="font-bold text-green-600">{SCORE_GOAL}+</span>.
                    </p>
                  </div>

                  <PlanHeroCarousel slides={PLAN_HERO_SLIDES} />
                  <p className="mt-2.5 text-center text-[11px] text-[#9A9A9A] leading-snug">
                    You get all of this automatically in your mobile app.
                  </p>

                  <div className="mt-4 rounded-2xl overflow-hidden border-2 border-[#E8DDD9] bg-card shadow-md shadow-primary/5">
                    {/* The scroll, staged. Her name is written on it, then it
                        plays a day on the plan and the eight weeks those days
                        add up to. It loops on its own while it's on screen -
                        nothing in it is tappable, so it never competes with the
                        CTA for a thumb.

                        A <ShotStage /> of nutrition/habits/rewards used to
                        close this card. Those three are now slides 2-4 of the
                        hero directly above, at a size where the checklist,
                        the habit and the streak can actually be read - so the
                        stage was the same three images a second time, ~300px
                        lower, tilted to ~30% width behind a gradient fade.
                        Showing a shot twice on one screen doesn't double the
                        proof; it halves the attention on the legible copy. */}
                    <PlanStage
                      firstName={firstName.trim() || undefined}
                      goalLabel={goalLabel}
                      className="pb-2"
                    />
                  </div>
                </motion.div>
              );
            })()}

            {/* ── Block 2: Personalized before/after for her symptoms.
                Demoted from 4xl to 2xl - it supports the plan above rather than
                competing with it. ────────────────────────────────────────────── */}
            {diagnosisTransforms.length > 0 && (() => {
              const transforms = diagnosisTransforms;
              return (
                // On scroll, not on mount. Everything from here down starts a
                // clear viewport below the fold - block 1 alone is the headline,
                // the hero phone and the scroll - so a mount animation finished
                // playing long before she arrived, and she scrolled onto a still.
                // Blocks 3 and 4 already worked this way; 2, 5 and the trust
                // strip did not, which is why the page went from arriving to
                // already-arrived halfway down.
                //
                // The cards are variant children rather than per-card
                // `whileInView` for the reason the carousel exists: only the
                // first card and a sliver of the second are ever on screen, so
                // an observer per card would leave the rest - including the
                // sliver that is the whole signal there *is* a carousel -
                // permanently invisible. They ran their own mount stagger until
                // 2026-08-31, which is the same bug one level down: they
                // animated behind this fade, finished before she arrived, and
                // she scrolled onto a still inside a block that had just moved.
                <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: prefersReducedMotion ? 0 : 0.5,
                        ease: [0.16, 1, 0.3, 1],
                        staggerChildren: prefersReducedMotion ? 0 : 0.09,
                        delayChildren: prefersReducedMotion ? 0 : 0.12,
                      },
                    },
                  }}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.15 }}
                  className="mb-5"
                >
                  <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight mb-3">
                    {firstName.trim() ? `${firstName.trim()}, what ` : "What "}
                    <HighlightSweep>{PLAN_WEEKS} weeks</HighlightSweep> can look like
                  </h2>

                  <div
                    ref={transformCarousel.ref}
                    onScroll={transformCarousel.onScroll}
                    className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {transforms.map((t) => (
                      <motion.div
                        key={t.image}
                        variants={{
                          hidden: { opacity: 0, y: 12 },
                          show: {
                            opacity: 1,
                            y: 0,
                            transition: {
                              duration: prefersReducedMotion ? 0 : 0.45,
                              ease: [0.16, 1, 0.3, 1],
                            },
                          },
                        }}
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
                          {/* Verified check on the "after" half - stock photography
                              on its own says nothing about software; the tick is
                              what ties the outcome back to the app that tracked it. */}
                          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 pl-1 pr-2 py-0.5 shadow-md">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-600">
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                            </span>
                            <span className="text-[9px] font-bold text-green-700 tracking-wide">
                              8 week plan
                            </span>
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
                  <CarouselDots count={transforms.length} index={transformCarousel.index} />
                  <p className="text-[10px] text-[#9A9A9A] mt-2 px-1 leading-snug">
                    Illustrative. MenoLisa is not a medical treatment.
                  </p>
                </motion.div>
              );
            })()}

            {/* ── Block 3: Someone already walking it. Placed after the plan
                because this is the moment the plan is at its most abstract - she
                has just been shown eight weeks of tasks she hasn't done yet, and
                the next honest question is "does this work for
                anyone real". ────────────────────────────────────────────────────── */}
            <SocialProofPolaroid reduced={!!prefersReducedMotion} />

            {/* ── Block 4: Where this is heading.
                Moved down from the top of the page. Opening on fear spent
                credibility before she had seen a single thing she was being
                sold; the cost of doing nothing lands far better *after* she
                knows there is a concrete alternative, because now it is a
                comparison rather than a threat. ─────────────────────────────── */}
            {(() => {
              // Unlike the blocks above it, this one arrives on scroll rather
              // than on mount: it sits far enough down the plan scroll that a
              // mount animation has always finished playing to nobody, and the
              // card is an argument in three beats - the claim, the sentence,
              // then the chart that draws it - so the beats are staggered in
              // that order.
              //
              // Reduced motion collapses every duration to zero instead of
              // branching on `initial`: `useReducedMotion()` reads false through
              // hydration, so a branch there is a mismatch on exactly the
              // visitors it is meant to help.
              const rise: Variants = {
                hidden: { opacity: 0, y: 14 },
                show: {
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: prefersReducedMotion ? 0 : 0.5,
                    ease: [0.16, 1, 0.3, 1],
                  },
                },
              };
              return (
                <motion.div
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.14 } },
                  }}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.25 }}
                  className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-5 shadow-md shadow-primary/5"
                >
                  <motion.div variants={rise} className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-5 h-5 text-red-500" />
                    <h2 className="text-base font-bold text-[#3D3D3D]">And if you do nothing</h2>
                  </motion.div>
                  <motion.p variants={rise} className="text-xs text-[#5A5A5A] mb-3">
                    {firstName.trim() ? (
                      <>
                        <span className="font-bold">{firstName.trim()}</span>, untreated
                      </>
                    ) : (
                      "Untreated"
                    )}{" "}
                    perimenopause symptoms persist 4&ndash;7 years on average - and often get
                    worse before they settle.
                  </motion.p>
                  {/* Not a `rise` child: the chart runs its own draw off its
                      own `whileInView`, so it starts when *it* is on screen
                      rather than when the card's headline is. Two beats that
                      happen to overlap read better than a chart that finished
                      drawing above the fold. */}
                  <TrajectoryChart score={score} reduced={!!prefersReducedMotion} />
                </motion.div>
              );
            })()}

            {/* ── Block 5: What she gets alongside the plan. Deliberately after
                the plan and deliberately small - these are the tools she runs
                the plan with, not the offer. Selling them first was selling a
                tracker to someone who came here to stop feeling this way.

                It carried three `/diagnosys` phone shots until 2026-08-16. They
                were an older generation of the app UI, and they sat on the same
                screen as the current `/screenshots` masters in block 1 - so the
                page showed her two different apps and asked her to believe both.
                A screenshot that no longer matches the product is worse than no
                screenshot: block 1 has already proved the app is real, and this
                block only has to say what it keeps doing after day one. So it is
                now typographic, and small enough to stay subordinate.

                It was a three-row icon list until 2026-08-17 - a feature list,
                answering "what do you get" on a screen that has already shown
                her the product. What it has to answer is *how the days work*,
                which is a sequence, so `<HowLisaRuns />` plays it as one. ───── */}
            {(() => {
              const topSymptom = [...topProblems]
                .sort((a, b) => (scoredSeverity[b] ?? 0) - (scoredSeverity[a] ?? 0))[0];
              // No article - the sentence below supplies "your", so the fallback
              // must not repeat it.
              const topLabel = topSymptom
                ? (SYMPTOM_LABELS[topSymptom] || topSymptom).toLowerCase()
                : "symptoms";
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.5,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="mb-5"
                >
                  <div className="px-1 mb-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight">
                      The plan doesn&apos;t{" "}
                      <HighlightSweep>run itself</HighlightSweep>. Lisa does.
                    </h2>
                    <p className="text-xs text-[#5A5A5A] mt-1.5">
                      Every day for {PLAN_WEEKS} weeks, she decides what you do next - so you
                      never have to.
                    </p>
                  </div>

                  <HowLisaRuns topLabel={topLabel} />
                </motion.div>
              );
            })()}

            {/* ── Trust strip ───────────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
              className="mb-4"
            >
              {/* Pricing reassurance ("no charge today", "cancel anytime") lives on
                  the paywall, not here - this page's job is belief, and naming the
                  charge two screens early just raises her guard. */}
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-[#9A9A9A]">
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Built around your {QUESTION_STEPS.length} answers</span>
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Menopause researched</span>
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
                      className={CTA_GRADIENT_CLASS}
                      style={CTA_GRADIENT_STYLE}
                    >
                      {DIAGNOSIS_CTA_LABEL}
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

      {/* Relief Phase - the one screen between the plan and the price: a
          paced-breathing exercise she completes herself, and the tool she keeps
          for having done it. She reaches the paywall having already been given
          something that worked.

          A five-row nutrition audit and its verdict used to sit between the
          reward and the paywall (and before that, ten rows on their own phase).
          Two more taps and two more screens immediately after she tapped "I'm
          ready to feel better" - the point of maximum intent in the whole
          funnel, and the worst possible place to ask her for anything. */}
      {phase === "relief" && (
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2",
            // The reward stack is taller than the exercise, so it gets to scroll
            // on short screens; the exercise itself must never move under her.
            reliefStage === "reward" &&
              "overflow-y-auto pb-[calc(132px+env(safe-area-inset-bottom))]"
          )}
        >
          <div className="max-w-md mx-auto w-full flex-1 flex flex-col min-h-0">
            {/* Back leaves the phase from every stage - there is nothing left in
                front of the reward to step back through. */}
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
              {reliefStage === "intro" || reliefStage === "running" ? (
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
                  <div className="min-h-32 sm:min-h-[136px] flex flex-col justify-end w-full">
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

                  {/* Skip: an escape hatch on a 36-second timer has to be
                      findable at a glance, or she waits it out or leaves. Sized
                      as a real tap target rather than an 11px underline, but
                      outlined and neutral so it never competes with the circle
                      it sits under.

                      **It renders on the intro too now (2026-09-02).** It used
                      to appear only once the exercise was `running`, which meant
                      the intro screen offered exactly one way forward: start a
                      36-second timer. That is a hard gate two screens before the
                      price, on a funnel that has already asked for 26 taps, and
                      the women it stops are the impatient ones - not obviously
                      the ones least likely to buy. The exercise is the better
                      path and still the prominent one; this is the door for
                      everyone who was going to leave through it anyway.

                      The label differs because the two skips mean different
                      things: from the intro she is asking for the plan, from the
                      middle she is ending something she started. */}
                  {(reliefStage === "intro" || reliefStage === "running") && (
                    <button
                      type="button"
                      onClick={() => skipRelief(reliefStage === "intro")}
                      className="shrink-0 inline-flex items-center gap-1 rounded-full border-2 border-[#C9C9C9] bg-white px-5 py-2.5 text-sm font-bold text-[#3D3D3D] transition-colors hover:border-[#9A9A9A] hover:bg-white"
                    >
                      {reliefStage === "intro" ? `Skip to my ${PLAN_WEEKS}-week plan` : "Skip this step"}
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  )}
                </motion.div>
              ) : (
                /* ── Reward: she keeps the tool she just used, and sees the
                    three she doesn't have yet - felt first, read second. ── */
                <motion.div
                  key="relief-reward"
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

                  {/* Answers whatever she just tapped - see
                      getReliefRewardCopy(). The skip and resume paths pass
                      `null` and get the original line back. */}
                  {(() => {
                    const rewardCopy = getReliefRewardCopy(
                      reliefFeedback,
                      firstName.trim()
                    );
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="space-y-2"
                      >
                        <h1 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight">
                          {rewardCopy.heading}
                        </h1>
                        <p className="text-xs text-[#5A5A5A] leading-relaxed max-w-xs mx-auto">
                          {rewardCopy.body}
                        </p>
                      </motion.div>
                    );
                  })()}

                  {/* ── The check-in, folded into the reward (2026-09-03). ──

                      It had a screen to itself between the last exhale and this
                      one, which made `relief` four full screens standing between
                      the diagnosis and the price - a 36-second timer, a
                      question, a payoff, and an intro before all three - on a
                      funnel that has already asked for 26 taps. The phase loses
                      16% and a screen that exists only to ask one optional
                      question is the cheapest of the four to stop charging her
                      for.

                      Nothing about the question changes: the three chips are
                      still equal in weight, still describe her body rather than
                      her opinion, and "Not yet" still gets the warmest reply.
                      What changes is that her answer now swaps the copy she is
                      already looking at instead of gating the screen that
                      carries it. Answering is optional, which it always was in
                      substance - nothing is stored either way.

                      Shown only when she actually breathed. `reliefElapsed > 0`
                      excludes both the intro skip (`reliefFeedback` is
                      "skipped") and the Back-from-Stripe resume, which pins the
                      stage here without her having taken a breath this load. */}
                  {reliefFeedback === null && reliefElapsed > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                      className="w-full max-w-xs space-y-2"
                    >
                      <p className="text-[13px] font-semibold text-[#3D3D3D]">
                        Notice a difference?
                      </p>
                      <div className="flex gap-2">
                        {RELIEF_CHECKIN_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => answerCheckin(option.id)}
                            className="flex-1 min-h-11 rounded-xl border-2 border-[#E8DDD9] bg-card px-2 text-[13px] font-semibold text-[#3D3D3D] transition-all hover:border-primary/60 hover:bg-primary/5 active:scale-[0.98] cursor-pointer"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Tool 1 of 4: what she keeps, then what she doesn't have yet. */}
                  <ToolkitStack unlockedCount={1} topProblems={topProblems} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fixed bottom CTA. Absent during the exercise itself, so the ask
              always lands after the reward and never during a breath. The 0.9s
              delay lets the confetti, the headline and the toolkit land first -
              and, now that the check-in rides on this screen, gives her a beat
              to answer it before the way out appears.

              Its sub-line (getCtaCopy) closes the loop <ToolkitStack /> just
              opened rather than reassuring her about the price; the reasoning
              is at that function. */}
          {reliefStage === "reward" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]"
            >
              <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
                <button
                  type="button"
                  onClick={() => setPhase("paywall")}
                  className={CTA_GRADIENT_CLASS}
                  style={CTA_GRADIENT_STYLE}
                >
                  {`View my ${PLAN_WEEKS}-week plan`}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-[#9A9A9A] text-center mt-1.5">
                  {getCtaCopy().sub}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Paywall Phase. The card is saved at Stripe and first charged
          TRIAL_DAYS later. The funnel's account is minutes old, so it is
          trial-eligible — `create-checkout` re-checks the account's history
          and is the side that decides what Stripe is told. */}
      {phase === "paywall" && (
        <PaywallView
          onCheckout={handleStartCheckout}
          checkoutLoading={checkoutLoading}
          error={error}
          onBack={() => setPhase("relief")}
          firstName={firstName}
          trackingSource="register"
          topProblems={topProblems}
          goal={goal}
          userId={userId}
          trialEligible
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

            <h2 className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] mb-3">
              {firstName.trim() ? `${firstName.trim()}, you're all set!` : "You're all set!"}
            </h2>
            <p className="text-sm sm:text-base text-[#5A5A5A] mb-5 leading-relaxed">
              {isTrialLanding ? (
                <>
                  Your free trial has started. Your first charge, if you keep the plan, is{" "}
                  {formatPrice(PLAN_PRICE)}
                  {trialChargeDate ? ` on ${trialChargeDate}` : ` in ${TRIAL_DAYS} days`}. Your{" "}
                  {PLAN_WEEKS}-week plan is being built right now &mdash; download the app to start it.
                </>
              ) : (
                <>
                  Your {PLAN_WEEKS}-week plan is being built right now. Download the app to start it.
                </>
              )}
            </p>

            {/* How she gets in, stated before the store badges rather than left
                for her to work out.
                She never set a password: her login *is* the email she typed at
                Stripe, and nothing in the funnel has ever told her that. She
                also never confirmed that address anywhere she could check it,
                and a typo there is an account she has paid for and cannot reach,
                with no self-serve recovery. This screen is the last moment the
                address is still on her mind, so it is the last chance to catch
                it - and the two sentences that turn a purchase into an install. */}
            <div className="mb-6 rounded-2xl border-2 border-[#E8DDD9] bg-card p-4 text-left">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
                How to sign in
              </p>
              {checkoutEmail ? (
                <p className="text-sm text-[#3D3D3D] leading-snug">
                  Open the app and enter{" "}
                  <span className="font-bold break-all">{checkoutEmail}</span> - the address you
                  used at checkout. We&apos;ll text you a 6-digit code. No password to remember.
                </p>
              ) : (
                <p className="text-sm text-[#3D3D3D] leading-snug">
                  Open the app and enter{" "}
                  <span className="font-bold">the email address you used at checkout</span>.
                  We&apos;ll send you a 6-digit code. No password to remember.
                </p>
              )}
              <p className="mt-2 text-xs text-[#7A7A7A] leading-snug">
                Your plan is on its way to that inbox too. Wrong address, or the code never
                arrives?{" "}
                <a className="font-semibold text-primary underline" href="mailto:menolisahelp@gmail.com">
                  menolisahelp@gmail.com
                </a>{" "}
                will fix it.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 mb-6">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-[1.03]"
              >
                <Image
                  src="/badges/app-store.png"
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
                  src="/badges/google-play.png"
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
              {syncingPayment ? "Loading…" : "Manage my subscription"}
            </button>
          </motion.div>
        </div>
      )}

      {/* Quiz Phase */}
      {phase === "quiz" && (
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 overflow-hidden",
            // Room for the fixed Next bar - only reserved on the steps that have
            // one. 76px = the CTA's own 52px (py-3.5 around a 24px line, which
            // clears min-h-12) plus the bar's py-3. Keep it in step with
            // CTA_GRADIENT_CLASS or the card runs under the button.
            autoAdvances
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(76px+env(safe-area-inset-bottom))]"
          )}
        >
          {/* Progress: the counter is the top line of the screen and Back sits on
              the same row, absolutely placed so the label stays optically
              centred whatever its length. They used to be two stacked rows; the
              chrome above the card is kept as tight as it will go, because every
              pixel it takes is a pixel off the card, which is the only part of
              this screen doing work. Back is absent on question 1: it is the
              funnel's entrance, so there is nothing behind it (see goBack). */}
          <div className="mb-1 sm:mb-1.5 shrink-0 pt-1 px-2">
            <div className="relative flex items-center justify-center min-h-6 mb-1">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="absolute left-0 flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}
              <p className="text-center text-base sm:text-lg font-semibold text-[#3D3D3D]" role="status" aria-live="polite">
                {REWARD_STEPS.includes(currentStep)
                  ? REWARD_LABEL[currentStep] ?? "Quick win"
                  : activeQuestionIndex === QUESTION_STEPS.length - 1
                    ? "Last question"
                    : activeQuestionIndex === QUESTION_STEPS.length - 2
                      ? "Almost there"
                      : `Question ${activeQuestionIndex + 1} of ${QUESTION_STEPS.length}`}
              </p>
            </div>
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
            <div className="rounded-xl sm:rounded-2xl border border-foreground/10 bg-card backdrop-blur-sm p-2.5 mx-0 my-1 sm:p-3 sm:mx-1 space-y-1.5 sm:space-y-2 flex-1 min-h-0 shadow-lg shadow-primary/5 overflow-hidden flex flex-col">
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
                  <ImageChoiceGrid
                    options={AGE_OPTIONS}
                    selected={ageBand}
                    onSelect={(id) => selectAndAdvance(() => setAgeBand(id))}
                  />
                </div>
              )}

              {/* Body baseline - height + weight on one screen. Two consecutive
                  numeric screens read as a form appearing mid-quiz; together they
                  are one short detour she can finish without the page moving. */}
              {currentStep === "q_body" && (
                <div className="flex-1 flex flex-col justify-center gap-3 sm:gap-4 min-h-0 overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">
                      Your body baseline
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Lisa uses this to size your movement and nutrition plan
                    </p>
                  </div>

                  {/* Height */}
                  <div className="space-y-3 shrink-0 rounded-xl border-2 border-foreground/10 bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Ruler className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-[#3D3D3D]">Height</p>
                      </div>
                      <div className="flex gap-1 p-1 rounded-lg bg-foreground/5">
                        {(["cm", "ft"] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setHeightUnit(u)}
                            className={`min-h-8 px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                              heightUnit === u
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {u === "cm" ? "cm" : "ft / in"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-center gap-1 tabular-nums">
                      {heightUnit === "cm" ? (
                        <>
                          <span className="text-4xl font-bold text-[#3D3D3D]">{heightCm}</span>
                          <span className="text-base text-muted-foreground">cm</span>
                        </>
                      ) : (
                        <span className="text-4xl font-bold text-[#3D3D3D]">
                          {heightFt}′{heightIn}″
                        </span>
                      )}
                    </div>

                    {heightUnit === "cm" ? (
                      <input
                        type="range"
                        min={120}
                        max={210}
                        step={1}
                        value={heightCm || "165"}
                        onChange={(e) => setHeightCm(e.target.value)}
                        className="w-full accent-primary cursor-pointer"
                      />
                    ) : (
                      <input
                        type="range"
                        min={48}
                        max={84}
                        step={1}
                        value={(parseInt(heightFt || "5", 10) * 12) + parseInt(heightIn || "0", 10)}
                        onChange={(e) => {
                          const total = parseInt(e.target.value, 10);
                          setHeightFt(String(Math.floor(total / 12)));
                          setHeightIn(String(total % 12));
                        }}
                        className="w-full accent-primary cursor-pointer"
                      />
                    )}
                  </div>

                  {/* Weight */}
                  <div className="space-y-3 shrink-0 rounded-xl border-2 border-foreground/10 bg-background p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Weight className="w-4 h-4 text-muted-foreground" />
                        <p className="text-sm font-semibold text-[#3D3D3D]">Weight</p>
                      </div>
                      <div className="flex gap-1 p-1 rounded-lg bg-foreground/5">
                        {(["kg", "lb"] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => setWeightUnit(u)}
                            className={`min-h-8 px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 cursor-pointer ${
                              weightUnit === u
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {u}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-baseline justify-center gap-1 tabular-nums">
                      <span className="text-4xl font-bold text-[#3D3D3D]">
                        {weightUnit === "kg" ? weightKg : weightLb}
                      </span>
                      <span className="text-base text-muted-foreground">{weightUnit}</span>
                    </div>

                    <input
                      type="range"
                      min={weightUnit === "kg" ? 40 : 88}
                      max={weightUnit === "kg" ? 160 : 352}
                      step={1}
                      value={weightUnit === "kg" ? (weightKg || "70") : (weightLb || "154")}
                      onChange={(e) =>
                        weightUnit === "kg"
                          ? setWeightKg(e.target.value)
                          : setWeightLb(e.target.value)
                      }
                      className="w-full accent-primary cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Movement time (image grid, same style as Q5 HRT). Asked as time
                  available rather than as a self-rated fitness rank - see
                  FITNESS_OPTIONS. The subline sells the answer she is most
                  likely to be embarrassed by: the smallest one is a real plan
                  here, not a lesser version of the plan. */}
              {currentStep === "q_fitness" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How much time do you have for exercise?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Pick what you can keep up for 8 weeks - your plan is built around it
                    </p>
                  </div>
                  <ImageChoiceGrid
                    options={FITNESS_OPTIONS}
                    selected={fitnessLevel}
                    onSelect={(id) => selectAndAdvance(() => setFitnessLevel(id))}
                  />
                </div>
              )}

              {/* When she trains, straight after how much time she has. Text rows
                  rather than an image grid: three parts of a day have no honest
                  illustration, and each option carries a line of its own that a
                  tile caption could not hold.

                  The subline names what the answer is for. A quiz question with
                  no visible consequence is one she answers carelessly, and this
                  one sets a reminder that will arrive on her phone for the next
                  eight weeks. */}
              {currentStep === "q_training_time" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      When is the best time for you to exercise?
                    </h2>
                    <p className="text-sm text-muted-foreground leading-snug">
                      Lisa reminds you about your movement in that part of the day - and
                      nowhere else. You can change it any time.
                    </p>
                  </div>
                  <ToneChoiceList
                    options={TRAINING_TIME_OPTIONS}
                    tones={TRAINING_TIME_TONE}
                    selected={trainingTime}
                    onSelect={(id) => selectAndAdvance(() => setTrainingTime(id))}
                  />
                </div>
              )}

              {/* Nutrition starting point - feeds the plan's nutrition_focus */}
              {currentStep === "q_nutrition" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How would you describe your eating right now?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Honestly - this is where your plan starts, not a test
                    </p>
                  </div>
                  <ImageChoiceGrid
                    options={NUTRITION_STYLE_OPTIONS}
                    selected={nutritionStyle}
                    onSelect={(id) => selectAndAdvance(() => setNutritionStyle(id))}
                  />
                </div>
              )}

              {/* Relaxation starting point - feeds the relaxation pillar */}
              {currentStep === "q_relaxation" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How do you currently unwind or manage stress?
                    </h2>
                  </div>
                  <ImageChoiceGrid
                    options={RELAXATION_STYLE_OPTIONS}
                    selected={relaxationStyle}
                    onSelect={(id) => selectAndAdvance(() => setRelaxationStyle(id))}
                  />
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
                  <ImageChoiceGrid
                    options={HERE_FOR_OPTIONS}
                    selected={hereFor}
                    onSelect={(id) => selectAndAdvance(() => setHereFor(id))}
                  />
                </div>
              )}

              {/* Q3: How menopause began - surgical/medical onset changes the plan.
                  Plain coloured list, no tiles: see MENOPAUSE_TYPE_OPTIONS. */}
              {currentStep === "q_menopause_type" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      How did menopause begin for you?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      It changes what your plan can safely suggest
                    </p>
                  </div>
                  <ToneChoiceList
                    options={MENOPAUSE_TYPE_OPTIONS}
                    tones={MENOPAUSE_TYPE_TONE}
                    selected={menopauseType}
                    onSelect={(id) => selectAndAdvance(() => setMenopauseType(id))}
                  />
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
                    {/* Flex-wrap, not grid: both of these lists have an odd option count,
                        so a grid always left a hole in the last row. Wrapping with a
                        centred last row fills the shelf and keeps every tile the same
                        size. */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {GOAL_OPTIONS.map((option) => {
                        const isSelected = goal.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleGoal(option.id)}
                            className={`flex flex-col w-[calc(50%-0.25rem)] sm:w-[calc(33.333%-0.334rem)] rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer outline-none focus:outline-none ${
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
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 -mr-1 pb-1 [scrollbar-width:thin] scroll-smooth">
                    {/* Flex-wrap, not grid: both of these lists have an odd option count,
                        so a grid always left a hole in the last row. Wrapping with a
                        centred last row fills the shelf and keeps every tile the same
                        size. */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {PROBLEM_OPTIONS.map((option) => {
                        const isSelected = (symptomSeverity[option.id] ?? 0) > 0;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => toggleProblem(option.id)}
                            className={`flex flex-col w-[calc(50%-0.25rem)] sm:w-[calc(33.333%-0.334rem)] rounded-2xl overflow-hidden transition-all duration-200 cursor-pointer outline-none focus:outline-none ${
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
                                // This is the funnel's landing screen (symptoms
                                // first since 2026-09-03), so these nine tiles
                                // are the LCP. Without `priority` next/image
                                // ships them `loading="lazy"` — verified on the
                                // live HTML — and the ad's first paint is a grid
                                // of labels over empty boxes on a phone.
                                priority
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

              {/* Severity - its own screen, straight after the tiles. One overall
                  rating of the whole load; asking her to rate nine symptoms
                  separately is the version of this question nobody finishes. */}
              {currentStep === "q_symptom_impact" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      Overall, how much are{" "}
                      <span className="text-primary">your symptoms</span>{" "}
                      costing you?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      No wrong answer — it shapes the plan we build for you
                    </p>
                  </div>
                  <ToneChoiceList
                    options={SYMPTOM_IMPACT_OPTIONS}
                    tones={IMPACT_TONE}
                    selected={symptomImpact}
                    onSelect={(id) => selectAndAdvance(() => setSymptomImpact(id))}
                  />
                </div>
              )}

              {/* Reward 1: her worst symptom named, explained, and one free
                  thing she can do about it tonight.

                  It listed her symptoms back in tap order with a prevalence bar
                  each until 2026-08-30 - the only one of the three payoffs that
                  handed her nothing she did not already have, in the slot where
                  she is deciding whether to finish twelve questions. See the
                  note above <StartingPointBoard /> for the full argument; the
                  short version is that boards 2 and 3 give her an object and
                  this one gave her a receipt.

                  The ranking runs through `getTopBurdenSymptoms()`, the same
                  function `scoreDrivers` uses, so this screen and the results
                  card can never disagree about which symptom is her worst. */}
              {currentStep === "reward_symptoms" && (() => {
                const cohort = COHORT_PHRASE[hereFor] ?? "women your age";
                // Ranked by how much each symptom typically drags a day
                // (SYMPTOM_IMPACT), her tap order breaking ties. Four is the
                // ceiling: the payload below is the point of the screen, and a
                // fifth row pushes it under the fold on a short viewport.
                const ranked = getTopBurdenSymptoms(scoredSeverity, 4).filter(
                  (id) => SYMPTOM_ICON[id]
                );
                const rows = ranked.map((id) => ({
                  id,
                  label: SYMPTOM_LABELS[id] || id,
                  Icon: SYMPTOM_ICON[id] ?? Sparkles,
                }));
                const top = ranked[0];
                // Everything these captions name is a count of her own answers
                // or a lookup keyed off one - nothing is asserted about her,
                // and each one is now a thing the board actually does. The
                // middle caption used to say "Comparing with {cohort}" for a
                // payoff whose comparison is a grey footnote; the last one
                // promised a ranking the old board never showed.
                const messages = [
                  `Reading your ${topProblems.length} symptom${topProblems.length === 1 ? "" : "s"}...`,
                  "Ranking them by what they cost you...",
                  "Picking your one move for tonight...",
                ];
                return (
                  <QuizReward
                    messages={messages}
                    initialDone={!!rewardSeen.current.reward_symptoms}
                    onDone={() => markRewardSeen("reward_symptoms")}
                  >
                  <div className={REWARD_SCROLL_SHELL + " py-1"}>
                    <div className={REWARD_PAYOFF_CENTER}>
                    <StartingPointBoard
                      rows={rows}
                      cohort={cohort}
                      topPct={(top ? SYMPTOM_PREVALENCE[top] : undefined) ?? 70}
                      mechanism={top ? SYMPTOM_MECHANISM[top] : undefined}
                      firstMove={top ? SYMPTOM_FIRST_MOVE[top] : undefined}
                      planWeeks={PLAN_WEEKS}
                    />
                    </div>
                  </div>
                  </QuizReward>
                );
              })()}

              {/* Reward: someone who already finished it.
                  The only screen in the quiz that is not her own answers read
                  back to her - see the note on REWARD_STEPS for why it sits
                  here rather than anywhere else in the run.

                  <SocialProofPolaroid /> rather than <SymptomOutcomeCards />,
                  the other export in that file. The cards are the better fit
                  for the reward contract on paper (they personalize to her
                  symptoms) and the worse fit in practice: a horizontal carousel
                  with an "illustrative / not a medical treatment" footnote is
                  built for a sales page she can scroll, and this is a centred
                  card at fixed height. One woman's face also does the job the
                  quiz is missing, which the before/after cards - already shown
                  on the diagnosis screen and again at the paywall - do not.

                  The meter copy follows the same rule as the other three (see
                  reward_symptoms): every caption is either a count of her own
                  answers or a plain statement of what is being shown. It does
                  *not* claim to search for women like her - there is no such
                  lookup, and a fabricated one on the single screen whose whole
                  job is credibility is the most expensive place in the funnel
                  to be caught.

                  `initialDone` on Back, like the others: re-running the meter in
                  front of a payoff she has already seen reads as the funnel
                  changing its mind. Scrollable rather than clipped - the
                  print plus her story is the tallest reward payoff, and a short
                  viewport must cut off nothing.

                  The framed line under it is her progress, not a second telling
                  of the member's story - the print's own caption already
                  introduces her, and restating it 40px lower is the duplicate
                  payoff the results screen's count-up was fixed for. The count
                  is `activeQuestionIndex + 1`, i.e. questions actually
                  answered; `stepIndex` would bill her for the reward screens
                  too, which is exactly the kind of invented number the meter
                  copy above is careful not to print. */}
              {currentStep === "reward_social_proof" && (
                <QuizReward
                  messages={[
                    "Marking where you are today...",
                    "One woman started right here...",
                    "Opening her story...",
                  ]}
                  initialDone={!!rewardSeen.current.reward_social_proof}
                  onDone={() => markRewardSeen("reward_social_proof")}
                >
                  <div className={REWARD_SCROLL_SHELL}>
                    <div className={cn(REWARD_PAYOFF_CENTER, "max-w-md mx-auto px-1 pt-1")}>
                      {/* Faster than the paywall's hold: this board is the
                          whole screen and she leaves it in seconds, so the
                          default 8s would show her one woman and call it a
                          rotation. See `rotateMs` in components/SocialProof.tsx. */}
                      <SocialProofPolaroid reduced={!!prefersReducedMotion} rotateMs={4500} />
                      <motion.p
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: prefersReducedMotion ? 0 : 0.5, duration: 0.45 }}
                        className="-mt-2 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-center text-sm sm:text-base font-semibold text-[#3D3D3D] leading-snug"
                      >
                        You&apos;re {activeQuestionIndex + 1} questions in. A few
                        more and your {PLAN_WEEKS}-week plan is ready.
                      </motion.p>
                    </div>
                  </div>
                </QuizReward>
              )}

              {/* Reward 2: her week, day by day. Breaks the six-question run
                  through body/fitness/nutrition/relaxation/HRT in half, and it
                  is the first screen in the funnel that shows the actual shape
                  of what she'd be buying. Every chip is read straight out of
                  MOVEMENT_VOLUME + cardioForWeek() - see `weekPlanner`. */}
              {currentStep === "reward_plan_shape" && (() => {
                const messages = [
                  "Sizing your week...",
                  "Setting your food starting point...",
                  "Placing your wind-down...",
                ];
                const food = NUTRITION_START[nutritionStyle];
                const windDown = RELAXATION_START[relaxationStyle];
                return (
                  <QuizReward
                    messages={messages}
                    initialDone={!!rewardSeen.current.reward_plan_shape}
                    onDone={() => markRewardSeen("reward_plan_shape")}
                    ready={!!weekShape && !!weekPlanner}
                  >
                  <div className={REWARD_SCROLL_SHELL + " py-1"}>
                    {weekPlanner && (
                      <div className={REWARD_PAYOFF_CENTER}>
                      <TrainingWeekBoard
                        days={weekPlanner}
                        totalMinutes={weekShape?.weeklyMinutes ?? 0}
                        food={food}
                        windDown={windDown}
                      />
                      </div>
                    )}
                  </div>
                  </QuizReward>
                );
              })()}

              {/* Reward 3: the movement rules her last two answers just set,
                  then the stage-keyed pride line.

                  This used to lead on "6 years is how long the average woman
                  waits for support" - a generic factoid, and a regret argument
                  aimed at a woman who has just answered thirteen questions.
                  What replaces it is the one number in the funnel she can
                  verify against the plan she buys: `allowedExercises()` really
                  does cut the pool to her level before the model sees it. See
                  lib/plan/catalog.ts.

                  It had a second branch until 2026-08-29, counting what her
                  `q_limitations` answers took *out*. That screen is gone, so
                  there is no subtraction to name and the number is the pool she
                  got rather than the one she was spared.

                  Since 2026-08-29 the pool size is a footnote and the screen is
                  her real week-1 session - see `sessionPreview`. */}
              {currentStep === "reward_progress" && (() => {
                const pride = STAGE_PRIDE_LINE[hereFor] ?? "You're finally putting yourself first - that takes strength.";
                return (
                  <QuizReward
                    messages={[
                      "Checking your history...",
                      "Matching moves to your level...",
                      "Building session 1...",
                    ]}
                    initialDone={!!rewardSeen.current.reward_progress}
                    onDone={() => markRewardSeen("reward_progress")}
                    ready={!!exercisePool && !!sessionPreview}
                  >
                  <div className={REWARD_SCROLL_SHELL + " py-1"}>
                    <div className={REWARD_PAYOFF_CENTER}>
                    {sessionPreview && (
                      <FirstSessionBoard
                        heading={sessionPreview.heading}
                        minutesLabel={sessionPreview.minutesLabel}
                        warmup={sessionPreview.warmup}
                        rows={sessionPreview.rows}
                        cooldown={sessionPreview.cooldown}
                        poolCount={exercisePool?.allowed ?? 0}
                        sessionsTotal={sessionPreview.sessionsTotal}
                      />
                    )}
                    {/* The stage-keyed pride line survives the redesign, one
                        size down and outside the paper. It is the only
                        emotional beat on a board that is otherwise all
                        prescription, and stacking it inside as a second pill
                        would have fought the board's own sign-off. */}
                    <p className="mx-auto mt-2 max-w-sm text-center text-[11.5px] italic leading-snug text-[#7A7A7A]">
                      {pride}
                    </p>
                    </div>
                  </div>
                  </QuizReward>
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
                  <ImageChoiceGrid
                    options={HRT_OPTIONS}
                    selected={hrtStatus}
                    onSelect={(id) => selectAndAdvance(() => setHrtStatus(id))}
                  />
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
                      First name only - it&apos;s what Lisa calls you from here on.
                      No email needed to see your results.
                    </p>
                  </div>
                  <div className="relative">
                    <UserCircle className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                    {/* The only text input in the funnel, and it was losing 22%
                        of everyone who reached it — mechanically, not because of
                        the question.

                        `autoFocus` used to open the keyboard the instant the
                        screen mounted. The Continue button below is
                        `fixed bottom-0`, and a fixed element is laid out against
                        the *layout* viewport, which does not shrink when the
                        software keyboard opens — so on iOS Safari and the Meta
                        in-app webview the keyboard covered the only way forward
                        the moment she arrived. She saw a text box, a keyboard,
                        and no button. The CTA bar is visualViewport-aware now
                        (see `keyboardInset`), and the focus is hers to give.

                        `enterKeyHint` + the Enter handler are the other half:
                        the return key did nothing, on the one screen in
                        seventeen where pressing it is the obvious move. iOS
                        renders it as "Go" from the hint.

                        `autoComplete="given-name"` lets the browser offer the
                        name she has typed into a hundred other forms, which on a
                        phone is the difference between one tap and eight. */}
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                          goNext();
                        }
                      }}
                      placeholder="First name"
                      enterKeyHint="go"
                      autoComplete="given-name"
                      autoCapitalize="words"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 rounded-lg sm:rounded-xl border-2 border-foreground/15 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all duration-200 text-base sm:text-lg"
                    />
                    {firstName.trim().length > 0 && (
                      <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2">
                        <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary animate-in zoom-in duration-200" />
                      </div>
                    )}
                  </div>
                  {/* No skip on this step, deliberately. Her name is a required
                      answer like the other twelve: it carries the greetings, the
                      reward boards and the Meta `fn` match parameter, and an
                      opt-out on the last screen before the account is minted
                      would be taken by people who would otherwise have typed
                      four letters. The 22% this screen was losing was the
                      keyboard covering the Continue button (see the input
                      above), not the question — fix the mechanism, keep the
                      question. */}
                </div>
              )}
            </div>
          </div>

          {/* Terms and Privacy, on question 1 only.

              These lived on the start screen's CTA bar, and were put there
              because it was the funnel's entrance: the two documents Meta's ad
              reviewers look for, and the two a cautious 45-60 visitor looks for,
              have to be reachable from the screen the ad lands on. Since
              2026-09-02 that screen is this one, so the links moved with the
              entrance; the start screen itself was deleted on 2026-09-04, which
              makes this the only copy in the funnel. Do not remove it.

              Question 1 only: repeating them under all seventeen steps is noise,
              and the entrance is the only place the obligation attaches.
              `target="_blank"` so reading them never costs her the funnel;
              `prefetch={false}` because this is the ad landing page and two
              speculative page loads is a real cost for a link most visitors
              never tap. #5A5A5A rather than #9A9A9A - 6.9:1 against 2.85:1, and
              small legal text is exactly where the audience least able to
              resolve it gets punished. */}
          {stepIndex === 0 && (
            <p className="shrink-0 text-[11px] text-[#5A5A5A] text-center px-4 pb-1 leading-snug">
              <Link
                href="/terms"
                prefetch={false}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[#3D3D3D]"
              >
                Terms
              </Link>
              <span aria-hidden className="mx-1.5">
                ·
              </span>
              <Link
                href="/privacy"
                prefetch={false}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[#3D3D3D]"
              >
                Privacy
              </Link>
            </p>
          )}

          {/* Navigation Buttons - fixed to bottom of viewport, safe-area aware.
              Absent on single-choice steps, which advance themselves, and while
              a reward step's meter is still running - see `onRewardMeter`. */}
          {!autoAdvances && !onRewardMeter && (
            <div
              className="fixed inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
              style={{
                // With the keyboard up, the bar rides on top of it; with it
                // down, `keyboardInset` is 0 and this is the old `bottom-0`.
                // The safe-area pad is dropped while lifted - the home
                // indicator is behind the keyboard, not behind the bar.
                bottom: keyboardInset,
                paddingBottom: keyboardInset
                  ? undefined
                  : "env(safe-area-inset-bottom)",
              }}
            >
              <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3">
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!stepIsAnswered(currentStep)}
                  className={cn(
                    CTA_GRADIENT_CLASS,
                    // The gradient is an inline background, so there is no bg
                    // utility to dim - opacity carries the disabled state, and
                    // the hover lift has to be cancelled explicitly or a dead
                    // button still grows under the cursor.
                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                  )}
                  style={CTA_GRADIENT_STYLE}
                >
                  {REWARD_STEPS.includes(currentStep) || stepIndex === STEPS.length - 1 ? "Continue" : "Next"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </motion.div>
      </AnimatePresence>
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
