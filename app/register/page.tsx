 
"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image, { getImageProps } from "next/image";
import {
  motion,
  AnimatePresence,
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import {
  getAccountState,
  stateAllowsAccess,
  TRIAL_SELECT_COLS,
} from "@/lib/getAccountState";
import { detectBrowser, hasBrowserMismatchIssue } from "@/lib/browserUtils";
import { cn } from "@/lib/utils";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/constants";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Goal,
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
} from "lucide-react";
import { PaywallView } from "@/components/PaywallView";
// The identical component used to be defined a second time in this file, with a
// narrower `variant` union that had already drifted from the shared one.
import { PlanFinishBoard } from "@/components/PlanFinishBoard";
import { HighlightSweep } from "@/components/HighlightSweep";
import MetaPurchaseTracker from "@/components/MetaPurchaseTracker";
import { SocialProofPolaroid } from "@/components/SocialProof";
import { PlanStage } from "@/components/PlanStage";
import { HowLisaRuns } from "@/components/HowLisaRuns";
import { PhoneShot, ShotStage, SHOT_W, SHOT_H, PHONE_SHOT_SIZES } from "@/components/PhoneShots";
import { PLAN_PILLARS } from "@/lib/planPillars";
import {
  PLAN_ID,
  PLAN_WEEKS,
} from "@/lib/pricing";
import { getSymptomTransforms } from "@/lib/testimonials";
import { getOfferPromise } from "@/lib/planTimeline";
import {
  SYMPTOM_LABELS,
  AGE_BAND_LABELS,
  SCORE_GOAL,
  getScoreBenchmark,
  getScoreVerdict,
  getTopBurdenSymptoms,
  calculateWellbeingScore,
} from "@/lib/quiz-results-helpers";

/** Quiz step/phase -> illustration filename (from public/quiz/, same as mobile app assets/quiz/). */
const QUIZ_ILLUSTRATION: Record<string, string> = {
  q8_name: "illustration_q8_name.webp",
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
  | "q_nutrition"
  | "q_relaxation"
  | "q5_hrt"
  | "q_limitations"
  | "reward_progress"
  | "q8_name";

const STEPS: Step[] = [
  "q1_age",
  "q2_here_for",
  "q_menopause_type",
  "q4_symptoms",
  "q_symptom_impact",
  "q3_goals",
  "reward_symptoms",
  "q_body",
  "q_fitness",
  "q_nutrition",
  "q_relaxation",
  "q5_hrt",
  "q_limitations",
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
  "q_nutrition",
  "q_relaxation",
  "q5_hrt",
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

// One accent per option so the list reads as four distinct choices at a glance.
// Full class strings, never interpolated - Tailwind only ships classes it can
// find as literal text in the source.
const MENOPAUSE_TYPE_TONE: Record<
  string,
  { idle: string; selected: string; dot: string; label: string }
> = {
  natural: {
    idle: "border-[#2E9E6B]/30 hover:border-[#2E9E6B]/70 hover:bg-[#2E9E6B]/5",
    selected: "border-[#2E9E6B] bg-[#2E9E6B]/10 shadow-md shadow-[#2E9E6B]/20",
    dot: "bg-[#2E9E6B]",
    label: "text-[#1F7A50]",
  },
  surgical: {
    idle: "border-[#3E8FD0]/30 hover:border-[#3E8FD0]/70 hover:bg-[#3E8FD0]/5",
    selected: "border-[#3E8FD0] bg-[#3E8FD0]/10 shadow-md shadow-[#3E8FD0]/20",
    dot: "bg-[#3E8FD0]",
    label: "text-[#2A6DA9]",
  },
  medical: {
    idle: "border-[#8B6BC7]/30 hover:border-[#8B6BC7]/70 hover:bg-[#8B6BC7]/5",
    selected: "border-[#8B6BC7] bg-[#8B6BC7]/10 shadow-md shadow-[#8B6BC7]/20",
    dot: "bg-[#8B6BC7]",
    label: "text-[#6A4BA3]",
  },
  not_sure: {
    idle: "border-[#8A8A8A]/30 hover:border-[#8A8A8A]/70 hover:bg-[#8A8A8A]/5",
    selected: "border-[#8A8A8A] bg-[#8A8A8A]/10 shadow-md shadow-[#8A8A8A]/20",
    dot: "bg-[#8A8A8A]",
    label: "text-[#5F5F5F]",
  },
};

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

// Green/amber/red so the three levels read as a scale before she reads a word.
// Full class strings, never interpolated - Tailwind only ships classes it can
// find as literal text in the source.
const IMPACT_TONE: Record<
  string,
  { idle: string; selected: string; dot: string; label: string }
> = {
  mild: {
    idle: "border-[#2E9E6B]/30 hover:border-[#2E9E6B]/70 hover:bg-[#2E9E6B]/5",
    selected: "border-[#2E9E6B] bg-[#2E9E6B]/10 shadow-md shadow-[#2E9E6B]/20",
    dot: "bg-[#2E9E6B]",
    label: "text-[#1F7A50]",
  },
  moderate: {
    idle: "border-[#E0A32E]/30 hover:border-[#E0A32E]/70 hover:bg-[#E0A32E]/5",
    selected: "border-[#E0A32E] bg-[#E0A32E]/10 shadow-md shadow-[#E0A32E]/20",
    dot: "bg-[#E0A32E]",
    label: "text-[#A9741A]",
  },
  severe: {
    idle: "border-[#DB4F45]/30 hover:border-[#DB4F45]/70 hover:bg-[#DB4F45]/5",
    selected: "border-[#DB4F45] bg-[#DB4F45]/10 shadow-md shadow-[#DB4F45]/20",
    dot: "bg-[#DB4F45]",
    label: "text-[#B23A31]",
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
//   movement_snacks 4x5min/day · beginner 2x18 · medium 3x28 · advanced 4x35.
// Change a number here only if you change it there too.
//
// Ordered by ascending time, so the four read as one ladder. `movement_snacks`
// leads because it is the smallest ask, and it is the honest home for the woman
// who would otherwise pick "Beginner" and get twice the sessions she has room
// for.
const FITNESS_OPTIONS = [
  { id: "movement_snacks", label: "A few minutes, spread out", image: "/quiz/fitness/movement-snacks.webp" },
  { id: "beginner", label: "About 20 min, 2 days a week", image: "/quiz/fitness/beginner.webp" },
  { id: "medium", label: "About 30 min, 3 days a week", image: "/quiz/fitness/medium.webp" },
  { id: "advanced", label: "35+ min, 4 days a week", image: "/quiz/fitness/advanced.webp" },
];

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

// What hurts when she moves. Text rows, no illustrations - these are body parts,
// and a watercolor tile per joint would be noise. Multi-select, but the last row
// is exclusive: ticking it clears the pains and any pain clears it, because
// "nothing holds me back AND knee pain" is not an answer anyone means to give.
//
// The ids are load-bearing twice over: `LIMITATION_EXCLUDES` in
// `lib/plan/catalog.ts` filters the exercise pool on them in code, and
// `limitationLine()` names them in the plan prompt. Renaming one here without
// the other silently stops the filter.
const LIMITATION_OPTIONS = [
  { id: "back", label: "Lower back pain" },
  { id: "knee", label: "Knee pain" },
  { id: "hip", label: "Hip pain" },
  { id: "shoulder", label: "Neck or shoulder pain" },
  { id: "pelvic_floor", label: "Pelvic floor / leaking" },
  { id: "balance", label: "Balance problems or dizziness" },
  { id: "none", label: "Nothing holds me back", exclusive: true },
];

// The exclusive row's id, named once because it is also the step's default
// answer and its fallback when she un-ticks her last pain.
const NO_LIMITATION_ID = "none";

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
  q_nutrition: NUTRITION_STYLE_OPTIONS.map((o) => o.image),
  q_relaxation: RELAXATION_STYLE_OPTIONS.map((o) => o.image),
  q5_hrt: HRT_OPTIONS.map((o) => o.image),
  q8_name: [`/quiz/${QUIZ_ILLUSTRATION.q8_name}`],
};

// Screenshots of the plan itself. `day` is the hero and is treated differently
// from every other shot on the page: full width, no tilt, no crop, no fade. It
// is the only image in the funnel that has to be *read* rather than glanced at -
// it carries "Day 1 · Week 1", the phase name, and all four pillars with real
// progress on them, which is the entire offer in one frame. The supporting three
// are allowed to be decorative because they only have to prove the app is real.
const PLAN_SHOTS = {
  day: "/screenshots/screen1.webp",
  nutrition: "/screenshots/screen2.webp",
  habits: "/screenshots/screen3.webp",
  rewards: "/screenshots/screen4.webp",
};

// SHOT_W / SHOT_H (the intrinsic size of the /screenshots masters) live in
// components/PhoneShots.tsx alongside <PhoneShot /> and <ShotStage />, which the
// paywall now shares.

// The hero's `sizes`, hoisted out of <PlanHeroShot /> because the preloader below
// has to pass the *identical* string; PHONE_SHOT_SIZES comes from the shared
// component for the same reason. A preload that declares a different layout width
// than the <img> resolves to a different candidate in the srcset, which is a
// second full download of the same shot - and a cold one, at the moment she's
// looking at it.
const PLAN_HERO_SIZES = "(max-width: 480px) 56vw, 208px";

// Real app screenshots used on the plan step. Preloaded while she reads her
// results so the phone shots are already cached and don't pop in one by one.
// The hero is first: it is the one that must never be seen loading.
const DIAGNOSIS_SHOTS: ReadonlyArray<{ src: string; sizes: string }> = [
  { src: PLAN_SHOTS.day, sizes: PLAN_HERO_SIZES },
  { src: PLAN_SHOTS.nutrition, sizes: PHONE_SHOT_SIZES },
  { src: PLAN_SHOTS.habits, sizes: PHONE_SHOT_SIZES },
  { src: PLAN_SHOTS.rewards, sizes: PHONE_SHOT_SIZES },
];

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
  | "start"
  | "quiz"
  | "calculating"
  | "results"
  | "diagnosis"
  | "relief"
  | "paywall"
  | "download";


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
// Naming the plan here also closes the loop the start screen opened ("answer 13
// questions, get your personalized 8-week plan") - the promised object finally
// exists and the next tap opens it.
const RESULTS_CTA_SUB = "Built from your 13 answers. Nothing to pay to look.";

// The funnel's one forward-tap look: gradient, dark ink, pink glow. It was
// pasted inline at five call sites (start screen, results, plan, relief, and now
// the quiz's Next bar) and drifting apart by a hex digit was only a matter of
// time. Every button that moves her one screen closer to the plan wears this;
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
function getCtaCopy(): { sub: string } {
  return { sub: "See your plan and the price. No card needed to look." };
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
  return { sub: "Not a pitch - 36 seconds of relief you can use tonight." };
}




// ─── Diagnosis: personalized before/after transformations ───────────────────
// SYMPTOM_TRANSFORM / getSymptomTransforms live in lib/testimonials.ts, shared
// with the paywall's SymptomOutcomeCards.
// The "after" side is deliberately a *feeling*, not a piece of knowledge. The
// guarantee she reads two blocks later promises she'll feel better, so an after
// column that only promises understanding undercuts the offer it sits above.

// ─── The plan: what she actually buys ───────────────────────────────────────
// The four daily task areas and the 8-week arc live in lib/planPillars.ts.
// They're the offer's mechanism - "track your symptoms" never explained how
// anyone gets better - so on the diagnosis screen they aren't a list any more:
// <PlanStage /> plays them inside the plan scroll.

/**
 * Two diverging trajectories: slow decline with no plan vs. the climb her plan
 * is built to produce.
 *
 * The horizon used to contradict itself three ways. The sentence above the chart
 * said symptoms persist **4-7 years**; the x-axis was labelled **Now / 4 weeks /
 * 8 weeks**; and the code claimed **~2 years**. As rendered, the red line
 * therefore asserted she would measurably deteriorate within eight weeks - which
 * is not what the sentence above it says, is not defensible, and sat directly
 * above the block where she most needs to believe us.
 *
 * The window is now two years, stated on the axis, with one compressed segment:
 * the first third of the plot is her 8 weeks, the remaining two thirds are the
 * rest of the two years. That is a broken axis, and it is the honest way to draw
 * this - the alternative is her whole plan squeezed into 7% of the width, where
 * the line that matters is invisible. The ticks say exactly where the break is.
 *
 * The two lines now make different claims on purpose:
 *   - green climbs to the goal *by week 8* and then holds, which is precisely
 *     what the offer promises and nothing more.
 *   - red drifts down slowly across two years, which is the "persist 4-7 years
 *     and often get worse before they settle" sentence, drawn.
 */
const TRAJ_PLAN_SPLIT = 1 / 3;

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
  const treatedArea = `${toPath(treated)} L${xAt(1)},${H - padBottom} L${padLeft},${H - padBottom} Z`;
  const endU = untreated[untreated.length - 1];
  const endT = treated[treated.length - 1];
  const goalY = yAt(SCORE_GOAL);

  return (
    <svg
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

      {/* Goal line */}
      <line x1={padLeft} y1={goalY} x2={xAt(1)} y2={goalY} stroke="#16A34A" strokeWidth="1" strokeDasharray="3 4" opacity="0.45" />

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

      {/* X axis labels. The middle tick sits on the scale break, so it is
          labelled with what it is - the end of her plan - rather than with a
          midpoint the axis does not actually have. */}
      <text x={xAt(0)} y={H - 9} textAnchor="start" fontSize="11" fill="#9A9A9A" fontWeight="500">Now</text>
      <text x={xAt(TRAJ_PLAN_SPLIT)} y={H - 9} textAnchor="middle" fontSize="11" fill="#3D3D3D" fontWeight="700">Week {PLAN_WEEKS}</text>
      <text x={xAt(1)} y={H - 9} textAnchor="end" fontSize="11" fill="#9A9A9A" fontWeight="500">2 years</text>
    </svg>
  );
}

/**
 * What is left of the score card once the letter delivers the score itself.
 *
 * The card this replaces was a full gauge: metric name, "higher is better",
 * her number on a marker, the track, the goal. Every one of those things is
 * now printed on the sheet that rises out of the envelope (see
 * <EnvelopeReveal />), a screen-height above - so the card was restating the
 * reveal rather than adding to it, which is the same duplication the 2026-08-17
 * pass removed between the two count-ups.
 *
 * The division of labour now: **the letter says where she is, this says why -
 * and who closes it.**
 *
 * This card led on the gap as a number until 2026-08-17: a 52px "34" over the
 * words "points to your goal". It was the biggest figure on the screen and it
 * said nothing, because a point is not a unit of anything she has ever felt. It
 * is an internal quantity on a scale that exists nowhere outside this funnel,
 * so "34 of them" is arithmetic she cannot check about a metric she has no
 * reason to trust, presented in the type size reserved for the screen's most
 * important fact. Worse, the letter one screen-height above already *draws* the
 * gap - her fill, the green band, the goal pin - so the number was a third
 * telling of a thing already shown twice.
 *
 * What replaces it is the question the gap was standing in for: **why is my
 * score what it is?** The answer is her own symptoms, ranked by how much each
 * one costs a normal day (getTopBurdenSymptoms, off the same weights the score
 * is built from). That is recognition rather than a grade - she reads three
 * words and knows we got it right - and it hands over to the plan naturally,
 * because those are the symptoms the plan is built around.
 *
 * The three bands, in order:
 *
 *   1. **What is pulling her score down**, in her own words back to her.
 *   2. **The benchmark, in words.** A score out of 100 means nothing without a
 *      reference point. It is stated rather than drawn as a third marker,
 *      which is what the 2026-08-16 rebuild removed for crowding the track.
 *      Deliberately still the quiet band: "typical" here is a modelled profile
 *      rather than a survey average, so it supports the finding and is never
 *      asked to be the finding.
 *   3. **The handover to the plan**, which is the whole reason any of this is
 *      on the page.
 *
 * Her score is never painted as a verdict anywhere. It used to render red under
 * 40 and orange above - never green, at any value - on a scale where higher is
 * better, so the number always appeared in alarm paint regardless of what it
 * said.
 */
function ScoreGapCard({
  score,
  benchmark,
  cohortLabel,
  drivers,
}: {
  score: number;
  benchmark: number;
  cohortLabel: string;
  /** Her symptoms, heaviest first - see getTopBurdenSymptoms. */
  drivers: string[];
}) {
  // `gap` is always 12..68: calculateWellbeingScore compresses to a
  // SCORE_CEILING of 68 precisely so there is never a zero gap to render, which
  // is why there is no at-goal branch here. It is no longer printed as a
  // figure; it survives for the screen-reader summary and the handover line.
  const gap = Math.max(0, SCORE_GOAL - score);
  const verdict = getScoreVerdict(score, benchmark);
  const labels = drivers.map((id) => SYMPTOM_LABELS[id] || id);

  return (
    <div className="rounded-2xl bg-card border-2 border-[#E8DDD9] mb-4 shadow-md shadow-primary/5 overflow-hidden">
      {/* Band 1 - what the score is made of.
          The heading is small and grey and the symptoms are the ink, because
          the symptoms are the payload: she should be able to take this band in
          without reading a full sentence. Rose is this screen's colour for the
          load she is carrying (the CTA owns pink, green owns the gap and the
          fix), so the names take it.

          Skipped entirely if she somehow reached results with no symptoms
          selected - an empty band is worse than no band, and the benchmark
          below stands on its own. */}
      {labels.length > 0 && (
        <div className="px-4 pt-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-[#9A9A9A]">
            What&apos;s pulling your score down
          </p>
          <p className="mt-1.5 text-[22px] font-black leading-tight text-[#B23A31]">
            {labels.length > 1
              ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
              : labels[0]}
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-[#7A7A7A]">
            {labels.length > 1
              ? "These take the most out of an ordinary day - which is where your plan starts."
              : "This takes the most out of an ordinary day - which is where your plan starts."}
          </p>
        </div>
      )}

      {/* Band 2 - the benchmark, which is the only thing that makes a score out
          of 100 mean anything. The cohort is named once, by the verdict, so it
          is not repeated on the number. */}
      <p
        className={cn(
          "px-4 text-[13px] leading-relaxed text-[#5A5A5A]",
          labels.length > 0 ? "mt-3.5 border-t border-[#EFE6E2] pt-3.5" : "pt-4"
        )}
      >
        Menopause is <span className="font-bold text-[#3D3D3D]">{verdict}</span>. Typical is around{" "}
        <span className="font-bold text-[#3D3D3D]">{benchmark}</span> out of 100.
      </p>

      {/* Band 3 - the handover to the plan, on its own green ground so the
          card ends on the thing that closes the gap rather than trailing off
          in the same grey as the sentence above it. */}
      <p className="mt-3.5 flex items-center gap-2 bg-green-50 px-4 py-3 text-[13px] font-medium leading-snug text-[#3D3D3D]">
        <Goal className="w-4 h-4 text-green-600 shrink-0" />
        <span>
          Closing that gap is what your {PLAN_WEEKS}-week plan is built to do.
        </span>
      </p>

      {/* The letter is decorative to a screen reader (it is an animation), so
          the numbers on it are announced here, once. */}
      <p className="sr-only">
        Your Menopause Wellbeing Score is {score} out of 100, where higher is better. Typical for{" "}
        {cohortLabel} is around {benchmark}. The goal is {SCORE_GOAL}, which is {gap} points away.
      </p>
    </div>
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

/**
 * The hero screenshot: her actual Day 1, at a size where it can be read.
 *
 * Every other phone on this page is cropped by a <ShotStage />, tilted, and
 * faded into the card - which is right for evidence that only has to prove the
 * app exists. It is exactly wrong for this one. This shot carries "Day 1 · Week
 * 1", the phase name, and all four pillars with real progress against them,
 * which is the entire offer in a single frame; at 27% width behind a gradient
 * fade it was decoration of the one thing that needed to be legible.
 *
 * So: no tilt, no crop, no fade, and a real device bezel so it reads as a
 * photograph of a product rather than an export.
 *
 * And no entrance of its own. It used to run `whileInView` at opacity 0 / y 30
 * over 0.7s, which stacked on top of two fades it was already inside - the
 * phase cross-fade (0.22s, and `mode="wait"` means this only mounts once that
 * exit finishes) and the block wrapper's own opacity tween. Roughly 1.2s from
 * tapping through to a legible hero, on the one image on the screen that is the
 * offer. Worse, `whileInView` is gated on an IntersectionObserver that framer
 * attaches in an effect *after* mount, so the fade could not even begin on the
 * frame the screen arrived. The block wrapper carries the entrance now; this
 * paints with it. The images are fetched and decoded from the calculating
 * loader onwards (see preloadResponsiveImage) so there is a bitmap ready.
 *
 * It is not full column width, though. The source is 1320x2868 - 2.17 times
 * taller than it is wide - so every pixel of width costs two of height: at the
 * 268px it used to run, the phone alone was ~580px, a whole viewport of scroll
 * for one image, and the headline it belongs to had left the screen before the
 * shot ended. At 208px it is ~450px and the block reads as one unit: promise,
 * proof, caption, pillars. Legibility survives the trim because the thing that
 * has to be read here is layout - "Day 1 · Week 1", four pillar rows, progress
 * against them - not body copy.
 */
function PlanHeroShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[208px] rounded-[1.75rem] bg-[#1d1d1f] p-1.5 shadow-[0_24px_50px_-18px_rgba(61,61,61,0.6)]">
      <Image
        src={src}
        alt={alt}
        width={SHOT_W}
        height={SHOT_H}
        sizes={PLAN_HERO_SIZES}
        className="w-full h-auto rounded-[1.45rem]"
        priority
        // Synchronous decode: the bitmap is already warm (preloaded and decoded
        // back on the calculating loader), so blocking the paint on it costs
        // nothing here and removes the one-frame gap where the bezel renders
        // empty. `async` would let that frame through on exactly the image that
        // cannot be seen arriving.
        decoding="sync"
        fetchPriority="high"
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

function CarouselDots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null;
  return (
    <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          animate={{ width: i === index ? 18 : 6, opacity: i === index ? 1 : 0.35 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="h-1.5 rounded-full bg-primary"
        />
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

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  /**
   * The funnel has one entrance: question 1. Every load starts there.
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
    return "start";
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
  type ReliefStage = "intro" | "running" | "reward";
  const [reliefStage, setReliefStage] = useState<ReliefStage>("intro");
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

  // Lets her bail out of the timer without losing the reward - jumps straight
  // to the reward as if she'd finished, so the toolkit unlock still lands.
  const skipRelief = useCallback(() => {
    setReliefElapsed(BREATH_TOTAL_SECONDS);
    setReliefStage("reward");
  }, []);

  // Preload the next step's images (and prewarm the very first step on mount) so
  // tiles are already cached before the step renders.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const srcs = [
      ...(stepIndex === 0 ? STEP_IMAGES.q1_age ?? [] : []),
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
  // Sliders always carry a value, so seed sensible mid-range defaults.
  const [heightUnit, setHeightUnit] = useState<"cm" | "ft">("cm");
  const [heightCm, setHeightCm] = useState<string>("165");
  const [heightFt, setHeightFt] = useState<string>("5");
  const [heightIn, setHeightIn] = useState<string>("5");
  // Weight: stored per-unit as raw strings; normalized to kg on save.
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [weightKg, setWeightKg] = useState<string>("70");
  const [weightLb, setWeightLb] = useState<string>("154");
  const [fitnessLevel, setFitnessLevel] = useState<string>("");
  const [hereFor, setHereFor] = useState<string>("");
  const [menopauseType, setMenopauseType] = useState<string>("");
  const [goal, setGoal] = useState<string[]>([]);
  // Selection set for the symptom tiles. Every entry carries SELECTED_SEVERITY -
  // the real intensity comes from `symptomImpact` below and is applied in
  // `scoredSeverity`, so insertion order (= the order she tapped) survives.
  const [symptomSeverity, setSymptomSeverity] = useState<Record<string, number>>({});
  // Her Mild/Moderate/Severe answer for the symptom she picked first.
  const [symptomImpact, setSymptomImpact] = useState<string>("");
  // "What have you tried" step removed; kept empty so the score calc + save-quiz payload stay intact.
  const [triedOptions] = useState<string[]>([]);
  const [hrtStatus, setHrtStatus] = useState<string>("");
  const [nutritionStyle, setNutritionStyle] = useState<string>("");
  const [relaxationStyle, setRelaxationStyle] = useState<string>("");
  // Pre-answered with the exclusive "nothing" option, so q_limitations opens with
  // a live Next button and costs nothing to pass. It is the only step in the quiz
  // whose honest answer for most women is "none of these", and making them tap a
  // row to say so was charging a click for silence. Ticking any pain clears it
  // (see toggleLimitation), so the default can never ride along with a real
  // limitation. `"none"` is inert downstream - LIMITATION_EXCLUDES and
  // LIMITATION_LABEL have no entry for it, and save-quiz's zod enum accepts it -
  // so this is identical to an empty array as far as the plan is concerned.
  const [physicalLimits, setPhysicalLimits] = useState<string[]>([NO_LIMITATION_ID]);
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

  // Loading screen state (between quiz and results)
  const [messageIndex, setMessageIndex] = useState(0);
  const [calcPct, setCalcPct] = useState(0);

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

  // Calculating screen: the percentage and the message carousel, both derived
  // from one rAF clock so they never disagree about how far along she is. The
  // work that sits behind this loader (account + save-quiz) is driven by the
  // effect next to completeRegistration below, which is also what advances the
  // phase - the clock here is presentation only and deliberately outlasts the
  // network call on a fast connection.
  useEffect(() => {
    if (phase !== "calculating") return;
    setMessageIndex(0);
    setCalcPct(0);

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / CALCULATING_MS);
      setCalcPct(Math.round(t * CALCULATING_MAX_PCT));
      setMessageIndex(
        Math.min(LOADING_MESSAGES.length - 1, Math.floor(t * LOADING_MESSAGES.length))
      );
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
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
        case "reward_progress":
          return true;
        case "q_nutrition":
          return nutritionStyle !== "";
        case "q_relaxation":
          return relaxationStyle !== "";
        case "q5_hrt":
          return hrtStatus !== "";
        case "q_limitations":
          return physicalLimits.length > 0;
        case "q8_name":
          return firstName.trim().length > 0;
        default:
          return false;
      }
    },
    [
      ageBand,
      bodyMetrics,
      fitnessLevel,
      hereFor,
      menopauseType,
      goal,
      topProblems,
      symptomImpact,
      nutritionStyle,
      relaxationStyle,
      hrtStatus,
      physicalLimits,
      firstName,
    ]
  );

  // One payload, two consumers: the sessionStorage stash below and the
  // save-quiz POST in completeRegistration. They used to be two hand-kept copies
  // of the same object literal, which is one place too many to forget a field.
  const quizPayload = useMemo(
    () => ({
      age_band: ageBand || null,
      top_problems: topProblems,
      symptom_impact: symptomImpact || null,
      tried_options: triedOptions,
      hrt_status: hrtStatus || null,
      goal,
      goals: goal,
      here_for: hereFor || null,
      menopause_type: menopauseType || null,
      nutrition_style: nutritionStyle || null,
      relaxation_style: relaxationStyle || null,
      physical_limits: physicalLimits,
      name: firstName.trim() || null,
      height_cm: bodyMetrics.height_cm,
      weight_kg: bodyMetrics.weight_kg,
      height_unit: bodyMetrics.height_unit,
      weight_unit: bodyMetrics.weight_unit,
      fitness_level: fitnessLevel || null,
    }),
    [
      ageBand,
      topProblems,
      symptomImpact,
      triedOptions,
      hrtStatus,
      goal,
      hereFor,
      menopauseType,
      nutritionStyle,
      relaxationStyle,
      physicalLimits,
      firstName,
      bodyMetrics,
      fitnessLevel,
    ]
  );

  // There is no sessionStorage copy of the answers. There used to be a
  // `pending_quiz_answers` stash written here, but nothing ever read it back —
  // the three call sites were all `removeItem`. It was a copy of her health
  // answers sitting in browser storage doing no work, so it is gone. The live
  // `quizPayload` above is the only copy, and `completeRegistration` POSTs it.

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

  // Back off question 1 returns to the start screen rather than dead-ending, so
  // the first tap stays as reversible as it was promised to be.
  const goBack = useCallback(() => {
    // Cancel a pending auto-advance, or Back mid-animation lands her forward.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    } else {
      setPhase("start");
    }
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
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError || !anonData?.user) {
          // Almost always "Anonymous sign-ins are disabled" in the Supabase
          // dashboard - see scripts/sql/2026-08-10-anonymous-funnel-accounts.sql.
          console.error("Anonymous sign-in failed:", anonError);
          setError("We couldn't save your results. Please try again.");
          return false;
        }
        sessionUser = anonData.user;
      }

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

  // "Nothing holds me back" clears the pains, and any pain clears it - see
  // LIMITATION_OPTIONS.
  //
  // Ticking the exclusive option also advances the step. It is a complete answer
  // by definition - there is nothing to add to "nothing holds me back" - so it
  // was the only single-meaning tap left in the quiz that still demanded a second
  // press on Next. The pain rows keep the button, because there she may well have
  // more than one to tick.
  //
  // The exclusive row never un-ticks. It starts selected (see physicalLimits), so
  // a plain toggle would let her tap it and land on an empty answer with a dead
  // Next button - a dead end she reached by tapping the row that was already
  // right. Tapping it is always "yes, nothing holds me back", and always moves on.
  const toggleLimitation = (limitId: string) => {
    const exclusive = LIMITATION_OPTIONS.find((o) => o.id === limitId)?.exclusive;

    if (exclusive) {
      selectAndAdvance(() => setPhysicalLimits([limitId]));
      return;
    }

    setPhysicalLimits((prev) => {
      if (prev.includes(limitId)) {
        // Un-ticking her last pain means "actually, nothing" - so say that,
        // rather than leaving the step blank and Next dead.
        const rest = prev.filter((id) => id !== limitId);
        return rest.length ? rest : [NO_LIMITATION_ID];
      }
      return [
        ...prev.filter((id) => !LIMITATION_OPTIONS.find((o) => o.id === id)?.exclusive),
        limitId,
      ];
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

  useEffect(() => {
    if (phase !== "download") return;
    let cancelled = false;

    void (async () => {
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
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, searchParams]);

  /** Back to question 1. The funnel's only recovery move — there is no state to
   *  restore, so restarting is both the simplest repair and the honest one. */
  const restartQuiz = useCallback(() => {
    setStepIndex(0);
    setPhase("quiz");
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

    let mounted = true;

    async function checkSessionAndRedirect() {
      if (!mounted) return;

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error("Session check error:", sessionError);
          return;
        }

        // No session at all: a first-time visitor. Leave her on the start screen.
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
  }, [router, phase, searchParams]);

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
          transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: "easeOut" }}
          className="flex-1 flex flex-col min-h-0"
        >

      {/* Start Phase - the screen the ad lands on.
          One job: enter on her own sentence, take the blame off her, and hand her
          a single tap. The quiz used to start here, which meant the first thing
          she was asked for was her age - an admin field, at the moment she is
          least committed. Price, credentials and a testimonial wall still stay
          off this screen. The one exception is the hero photo (2026-08-17): a
          real before/after - scrolling alone, then holding her plan, smiling -
          so the promise in the headline below is something she sees happen to
          someone else before she's asked to believe it for herself. */}
      {phase === "start" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto items-center justify-center px-2 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
            className="w-full max-w-md mx-auto flex flex-col items-center py-2"
          >
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="w-full shrink-0 rounded-2xl overflow-hidden ring-1 ring-black/5 shadow-[0_16px_36px_-10px_rgba(61,61,61,0.35)]"
            >
              <Image
                src="/start/start.webp"
                alt="Before: scrolling alone, unsure what's happening to her. After: her personalized plan in hand, and a smile back."
                width={900}
                height={504}
                priority
                sizes="(max-width: 480px) 92vw, 420px"
                className="w-full h-auto max-h-[30vh] sm:max-h-[34vh] object-cover"
              />
            </motion.div>

            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.15, duration: 0.4 }}
              className="text-2xl sm:text-3xl font-bold text-[#3D3D3D] leading-tight px-2"
            >
              You don&apos;t feel like yourself anymore.
            </motion.h1>

            {/* The reframe. It has to land before she is asked to do any work -
                self-blame is what keeps her from starting at all. */}
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.28, duration: 0.4 }}
              className="mt-2.5 text-sm sm:text-base text-[#5A5A5A] leading-snug px-2"
            >
              The sleep, the mood, the fog - it isn&apos;t in your head, and it isn&apos;t your
              fault. <span className="font-semibold text-[#3D3D3D]">Your hormones changed the
              rules.</span>
            </motion.p>

            {/* What she actually walks away with. Named as the plan, and shown as
                its three real pillars, so the outcome is concrete rather than
                "take a quiz". */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.4, duration: 0.4 }}
              className="mt-5 w-full rounded-2xl border border-foreground/10 bg-card px-4 py-3.5 shadow-sm"
            >
              <p className="text-sm sm:text-base font-bold text-[#3D3D3D]">
                Answer {QUESTION_STEPS.length} questions, get your{" "}
                <HighlightSweep>personalized {PLAN_WEEKS}-week plan</HighlightSweep>
              </p>
              <div className="mt-3 flex items-start justify-center gap-3 sm:gap-5">
                {PLAN_PILLARS.slice(0, 3).map((pillar) => (
                  <div key={pillar.key} className="flex flex-col items-center gap-1 w-16">
                    <pillar.icon className={cn("w-5 h-5", pillar.tint)} />
                    <span className="text-[11px] font-medium text-[#5A5A5A] leading-tight">
                      {pillar.label}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-[#9A9A9A] leading-snug">
                Built around your symptoms and your life - not a template.
              </p>
            </motion.div>

            {/* The one tap. Same gradient as the results and paywall CTAs, so the
                first step and the last one look like the same size of decision. */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: prefersReducedMotion ? 0 : 0.52, duration: 0.4 }}
              className="w-full mt-5"
            >
              <button
                type="button"
                onClick={() => setPhase("quiz")}
                className={cn(CTA_GRADIENT_CLASS, "min-h-13 cursor-pointer")}
                style={CTA_GRADIENT_STYLE}
              >
                Build my plan
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-[#9A9A9A] text-center mt-2">
                Takes 2 minutes · free to take · no download
              </p>
            </motion.div>
          </motion.div>
        </div>
      )}

      {/* Calculating Phase - loader between quiz and results; also where the
          account is created and the quiz is saved (see completeRegistration) */}
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
            {/* The percentage carries the "something is being built" job that a
                static header can't. There used to be a fixed h2 here reading
                "Getting to know you better..." *above* the three rotating
                messages - two headers on a three-second screen, one of which
                never changed. */}
            <p className="mb-1 text-4xl font-black tabular-nums text-[#3D3D3D]">
              {calcPct}
              <span className="text-xl font-bold text-[#B0B0B0]">%</span>
            </p>
            <div className="mb-4 h-1.5 w-40 overflow-hidden rounded-full bg-primary/15">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${calcPct}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>

            {/* Saving her answers happens behind this loader, so a failure has to
                surface here - silently spinning forever would strand her one tap
                short of her results. */}
            {error ? (
              <div className="w-full max-w-sm text-center">
                <p className="text-sm text-error mb-3">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setRegistrationRetry((n) => n + 1);
                  }}
                  className="min-h-11 px-6 py-2.5 font-bold text-foreground rounded-xl transition-all hover:scale-[1.02]"
                  style={CTA_GRADIENT_STYLE}
                >
                  Try again
                </button>
              </div>
            ) : (
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
            )}
          </motion.div>
        </div>
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
                src="/results.webp"
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

            {/* What is behind her score, and the plan that closes the gap. The
                score itself was delivered by the letter above - see
                <ScoreGapCard /> for the split. */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.95 }}
            >
              <ScoreGapCard
                score={score}
                benchmark={getScoreBenchmark(ageBand)}
                cohortLabel={AGE_BAND_LABELS[ageBand] ?? "women your age"}
                drivers={scoreDrivers}
              />
            </motion.div>

            {/* Why this is happening - root-cause insight comes right after her
                score: the relief ("one cause, workable") before the fear.

                The hero number is her own symptom count, which is a fact she
                supplied, and the estrogen link is stated as the general fact
                about menopause that it is. It used to be a per-user percentage
                computed from her quiz answers - see the note where `estrogenPct`
                used to live.

                The cause is named in plain English - "estrogen rising and
                falling", which is what actually happens in perimenopause -
                rather than "shifting estrogen", which is clinical shorthand
                that tells a 45-60 reader nothing she can picture. */}
            {topProblems.length > 0 && (() => {
              const withImage = topProblems.filter((id) => SYMPTOM_IMAGE[id]);
              // Six fills two clean rows of three. Five left an orphan tile on
              // its own row, and nine turned the card into a wall.
              const tiles = withImage.slice(0, 6);
              const overflow = withImage.length - tiles.length;
              const one = topProblems.length === 1;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.02 }}
                  className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-4 shadow-md shadow-primary/5"
                >
                  <p className="text-xs uppercase tracking-wide font-semibold text-[#9A9A9A] text-center mb-1">
                    Why this is happening to you
                  </p>
                  <p className="text-center mb-4">
                    {/* The count is the load she is carrying, so it takes the
                        load colour. It used to render in brand pink - the same
                        ink as the CTA gradient and the plan card, which made
                        the one bad number on the screen look like an offer. */}
                    <span className="block text-5xl font-black text-[#B23A31] leading-none">
                      {topProblems.length}
                    </span>
                    <span className="block text-[15px] font-medium text-[#3D3D3D] mt-1.5 leading-snug">
                      {one ? "symptom" : "symptoms"}, and {one ? "it traces" : "they all trace"} back
                      to the same thing:
                      <br />
                      <span className="font-bold">estrogen rising and falling</span>
                    </span>
                  </p>

                  {/* What happens to those symptoms over the eight weeks.
                      This slot held a two-line SVG estrogen chart, then an
                      illustration of the hormonal swings (<HormoneShift />) -
                      both of which redrew the sentence directly above them
                      instead of adding to it. The card has already named the
                      cause in words she can picture; a second rendering of the
                      same claim is the funnel's most common failure, and it
                      cost her the one thing this card never said: what comes
                      next.

                      The board answers that, and it is her own words at both
                      ends - her #1 symptom today, the goal she picked at week
                      8 - so it reads as a continuation of her answers rather
                      than as stock art. See <PlanFinishBoard />. */}
                  <PlanFinishBoard
                    topProblems={topProblems}
                    goal={goal}
                    className="mb-4"
                  />

                  {/* Her symptoms, at a size she can actually read.
                      These were 48px circles under 9px grey labels until
                      2026-08-17 - the most personal element on the screen
                      rendered as its smallest, in a type size a presbyopic
                      45-60 reader cannot resolve at arm's length. She tapped
                      these same tiles at ~224px ninety seconds earlier, so
                      shrinking them to a fifth of that reads as a decorative
                      afterthought rather than as her own answers coming back.

                      This is also the only place they appear on this screen -
                      there used to be a second, redundant row of red text pills
                      immediately below this card, the same list twice in two
                      visual languages about 40px apart. */}
                  <div className="grid grid-cols-3 gap-2">
                    {tiles.map((id, i) => (
                      <motion.div
                        key={id}
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 1.1 + i * 0.06, duration: 0.3 }}
                        className="flex flex-col overflow-hidden rounded-2xl shadow-sm"
                      >
                        {/* Deliberately the *same* chrome as the quiz tile she
                            tapped: square crop, object-cover, dark footer bar,
                            white 11px label - see PROBLEM_OPTIONS' grid. The
                            point of this block is recognition, and a symptom
                            redrawn in a different visual language is just a
                            picture of a symptom rather than her own answer
                            handed back.

                            Square also matters on its own: the sources are
                            460x460 with the subject centred, so a landscape
                            crop would cut a quarter off the top and bottom.

                            The footer is the quiz's *unselected* dark rather
                            than its selected pink. Every tile here is by
                            definition selected, so pink would be redundant -
                            and pink is the CTA's colour on this screen. */}
                        <div className="relative aspect-square">
                          <Image
                            src={SYMPTOM_IMAGE[id]}
                            alt=""
                            fill
                            sizes="(max-width: 480px) 30vw, 140px"
                            className="object-cover"
                          />
                        </div>
                        <div className={cn(TILE_FOOTER_BASE, "bg-[#2a2a2a]")}>
                          <span className={TILE_LABEL}>{SYMPTOM_LABELS[id] || id}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  {overflow > 0 && (
                    <p className="mt-2 text-center text-xs font-medium text-[#9A9A9A]">
                      + {overflow} more you told us about
                    </p>
                  )}

                  {/* One line, because it is the only thing left to say here:
                      it is not her fault, and it moves. The paragraph this
                      replaces spent three lines saying that and then handed off
                      to the plan - a handoff the plan-ready card 200px lower
                      makes properly, with the plan in it. */}
                  <p className="text-[13px] text-[#5A5A5A] leading-relaxed mt-3.5 text-center">
                    Not willpower. <span className="font-bold text-[#3D3D3D]">Biology - and
                    biology responds.</span>
                  </p>
                </motion.div>
              );
            })()}

            {/* The plan, existing.
                The start screen promised "answer 13 questions, get your
                personalized 8-week plan" and the loader said "Building your 8
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
                  <p className="text-[13px] text-[#5A5A5A] leading-snug mt-1">
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

                The screenshots are also no longer decoration. `day` is her real
                first day - "Day 1 · Week 1", the phase name, four pillars with
                real progress - rendered uncropped and untilted, because it is
                the one image in the funnel that has to be read rather than
                glanced at. It is *not* full width: see <PlanHeroShot /> for why
                a 2.17:1-tall shot eats a viewport at column width. The three
                supporting shots keep the tilted, cropped treatment, since they
                only have to prove the app is real. ───────────────────────── */}
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

                  <PlanHeroShot
                    src={PLAN_SHOTS.day}
                    alt={`Day 1 of your personalized ${PLAN_WEEKS}-week plan in the MenoLisa app, showing movement, nutrition, relaxation and habit tasks`}
                  />
                  <p className="mt-2.5 text-center text-[11px] text-[#9A9A9A] leading-snug">
                    You get this automatically in your mobile app.
                  </p>

                  <div className="mt-4 rounded-2xl overflow-hidden border-2 border-[#E8DDD9] bg-card shadow-md shadow-primary/5">
                    {/* The scroll, staged. Her name is written on it, then it
                        plays a day on the plan and the eight weeks those days
                        add up to. It loops on its own while it's on screen -
                        nothing in it is tappable, so it never competes with the
                        CTA for a thumb. */}
                    <PlanStage
                      firstName={firstName.trim() || undefined}
                      goalLabel={goalLabel}
                      className="pb-2"
                    />

                    {/* Supporting evidence: the pillar screens behind the day.
                        This is the last thing in the card, so its bottom fade
                        lands on the card edge - which is what the fade was
                        drawn for.

                        A second stage used to follow it holding one 52%-wide
                        shot of the plan email. Half of that strip was bare
                        gradient either side of the phone, and it butted
                        straight onto the flat clip of the three shots above,
                        so the two stages together read as an empty band under
                        the screenshots. It was also the last `/diagnosys`
                        asset in this card - an older generation of the app UI
                        sitting directly beneath the current `/screenshots`
                        masters, which is the one comparison this block cannot
                        afford. */}
                    <ShotStage className="h-52">
                      <PhoneShot
                        src={PLAN_SHOTS.nutrition}
                        alt="The nutrition list for today in the MenoLisa app"
                        rotate={-8}
                        className="w-[30%] -mr-3 mt-3"
                        width={SHOT_W}
                        height={SHOT_H}
                      />
                      <PhoneShot
                        src={PLAN_SHOTS.habits}
                        alt="Your habits in the MenoLisa app"
                        rotate={0}
                        delay={0.1}
                        className="w-[32%] z-10"
                        width={SHOT_W}
                        height={SHOT_H}
                      />
                      <PhoneShot
                        src={PLAN_SHOTS.rewards}
                        alt="Streaks and badges in the MenoLisa app"
                        rotate={8}
                        delay={0.18}
                        className="w-[30%] -ml-3 mt-3"
                        width={SHOT_W}
                        height={SHOT_H}
                      />
                    </ShotStage>
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
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
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

            {/* ── Block 3: Someone who already finished it. Placed after the plan
                because this is the moment the plan is at its most abstract - she
                has just been shown eight weeks of tasks she hasn't done yet, and
                the next honest question is "does anyone actually get to the end
                of this". ────────────────────────────────────────────────────── */}
            <SocialProofPolaroid reduced={!!prefersReducedMotion} />

            {/* ── Block 4: Where this is heading.
                Moved down from the top of the page. Opening on fear spent
                credibility before she had seen a single thing she was being
                sold; the cost of doing nothing lands far better *after* she
                knows there is a concrete alternative, because now it is a
                comparison rather than a threat. ─────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 mb-5 shadow-md shadow-primary/5"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h2 className="text-base font-bold text-[#3D3D3D]">And if you do nothing</h2>
              </div>
              <p className="text-xs text-[#5A5A5A] mb-3">
                {firstName.trim() ? (
                  <>
                    <span className="font-bold">{firstName.trim()}</span>, untreated
                  </>
                ) : (
                  "Untreated"
                )}{" "}
                perimenopause symptoms persist 4&ndash;7 years on average - and often get worse
                before they settle.
              </p>
              <TrajectoryChart score={score} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-700">
                    Without a plan
                  </div>
                  <p className="text-xs text-red-700/80 mt-0.5 leading-snug">
                    Symptoms drift on for years.
                  </p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-green-700">
                    With Lisa
                  </div>
                  <p className="text-xs text-green-700/80 mt-0.5 leading-snug">
                    {SCORE_GOAL}+ by week {PLAN_WEEKS}, then hold it.
                  </p>
                </div>
              </div>
            </motion.div>

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
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
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
                <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> Built around your {QUESTION_STEPS.length} answers</span>
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

          {/* Fixed bottom CTA. Absent during the exercise itself, so the ask
              always lands after the reward and never during a breath. It is the
              paywall doorstep now that nothing sits between, so it carries the
              no-charge reassurance. The 0.9s delay lets the confetti, the
              headline and the toolkit land first. */}
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

      {/* Paywall Phase - charged in full at Stripe checkout, no trial */}
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
              Your {PLAN_WEEKS}-week plan is being built right now. Download the app to start it.
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
          {/* Back - on question 1 this returns to the start screen (see goBack).
              The entry headline that used to sit here is now the start screen,
              so question 1 gets the full card. */}
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-1 self-start shrink-0 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] px-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          {/* Progress: explicit "Question X of 9" above dots so users always see
              how much is left. The chrome above the card - back link, counter,
              dots - is kept tight on purpose: every pixel it takes is a pixel
              off the card, which is the only part of this screen doing work. */}
          <div className="mb-1.5 sm:mb-2 shrink-0 pt-1 sm:pt-2 px-2">
            <p className="text-center text-base sm:text-lg font-semibold text-[#3D3D3D] mb-1.5 min-h-6" role="status" aria-live="polite">
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
                    priority
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
                  <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                    {MENOPAUSE_TYPE_OPTIONS.map((option) => {
                      const isSelected = menopauseType === option.id;
                      const tone = MENOPAUSE_TYPE_TONE[option.id];
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => selectAndAdvance(() => setMenopauseType(option.id))}
                          className={`w-full shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
                            isSelected ? tone.selected : tone.idle
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span
                              aria-hidden
                              className={`w-2.5 h-2.5 shrink-0 rounded-full ${tone.dot}`}
                            />
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
                  <div className="flex-1 flex flex-col justify-center gap-2.5 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                    {SYMPTOM_IMPACT_OPTIONS.map((level) => {
                      const isSelected = symptomImpact === level.id;
                      const tone = IMPACT_TONE[level.id];
                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() => selectAndAdvance(() => setSymptomImpact(level.id))}
                          className={`w-full shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
                            isSelected ? tone.selected : tone.idle
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span
                              aria-hidden
                              className={`w-2.5 h-2.5 shrink-0 rounded-full ${tone.dot}`}
                            />
                            <span className="min-w-0">
                              <span
                                className={`block font-semibold text-sm sm:text-base ${
                                  isSelected ? tone.label : "text-[#3D3D3D]"
                                }`}
                              >
                                {level.label}
                              </span>
                              <span className="block text-xs text-[#8A8A8A] leading-tight mt-0.5">
                                {level.hint}
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

              {/* Reward 2: one fact (the 6-year wait) + one personal win (stage-keyed pride). No overlap. */}
              {currentStep === "reward_progress" && (() => {
                const pride = STAGE_PRIDE_LINE[hereFor] ?? "You're finally putting yourself first - that takes strength.";
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
                  <ImageChoiceGrid
                    options={HRT_OPTIONS}
                    selected={hrtStatus}
                    onSelect={(id) => selectAndAdvance(() => setHrtStatus(id))}
                  />
                </div>
              )}

              {/* Physical limitations. Text rows, not tiles - see
                  LIMITATION_OPTIONS. The subline names the payoff rather than
                  reassuring her about privacy: nothing here is sensitive, and
                  what she needs to know is that ticking a box changes the
                  exercises she is about to be sold. */}
              {currentStep === "q_limitations" && (
                <div className="flex-1 flex flex-col min-h-0 gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0">
                    <h2 className="text-lg sm:text-xl font-bold mb-0.5">
                      Does anything hurt or hold you back when you move?
                    </h2>
                    <p className="text-sm text-muted-foreground leading-snug">
                      Your plan leaves out the exercises that would aggravate it, and swaps
                      in ones that don&apos;t.
                    </p>
                  </div>
                  <div className="flex-1 flex flex-col justify-center gap-2 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                    {LIMITATION_OPTIONS.map((option) => {
                      const isSelected = physicalLimits.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleLimitation(option.id)}
                          className={`w-full shrink-0 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                              : "border-foreground/15 hover:border-primary/50"
                          }`}
                        >
                          <span
                            className={`font-semibold text-sm sm:text-base ${
                              option.exclusive ? "text-[#5A5A5A]" : "text-[#3D3D3D]"
                            }`}
                          >
                            {option.label}
                          </span>
                          {isSelected ? (
                            <span className="w-5 h-5 shrink-0 rounded-md bg-primary flex items-center justify-center animate-in zoom-in duration-200">
                              <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="w-5 h-5 shrink-0 rounded-md border-2 border-foreground/20" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="shrink-0 flex items-center justify-center gap-1.5 text-[11px] text-[#9A9A9A]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tick everything that applies - or just continue.
                  </p>
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

          {/* Navigation Buttons - fixed to bottom of viewport, safe-area aware.
              Absent on single-choice steps, which advance themselves. */}
          {!autoAdvances && (
            <div className="fixed bottom-0 inset-x-0 z-30 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]">
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
