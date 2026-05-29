export interface QuizAnswers {
  symptoms: string[];
  severity: string;
  duration: string;
  name: string;
  triedBefore: string[];
  doctorStatus: string;
  goal: string;
}

export function getHeadline(name: string, severity: string): string {
  const displayName = name || "you";
  
  switch (severity) {
    case "severe":
      return `${displayName}, I hear you. And I'm so sorry it's been this hard.`;
    case "moderate":
      return `${displayName}, I understand. This isn't easy.`;
    case "mild":
      return `${displayName}, you're not imagining it. This is real.`;
    default:
      return `${displayName}, I'm here for you.`;
  }
}

export function getEmpathyMessage(answers: QuizAnswers): string {
  const { symptoms, severity, duration, name } = answers;
  const displayName = name || "you";
  const symptomCount = symptoms.length;

  // Severe + many symptoms + long time
  if (
    severity === "severe" &&
    symptomCount >= 4 &&
    ["over_year", "several_years"].includes(duration)
  ) {
    const durationText =
      duration === "several_years" ? "years" : "over a year";
    return `${symptomCount} symptoms. Every single day. For ${durationText}. ${displayName}, that's exhausting. You've been carrying so much — and probably feeling like no one really gets it. I do.`;
  }

  // Severe + any
  if (severity === "severe") {
    return `Struggling every day with ${symptomCount} different symptoms isn't something you should have to "push through." You deserve answers. You deserve relief. And ${displayName}, you deserve someone in your corner.`;
  }

  // Moderate + long time
  if (
    severity === "moderate" &&
    ["over_year", "several_years"].includes(duration)
  ) {
    const durationText =
      duration === "several_years" ? "years" : "over a year";
    return `${displayName}, dealing with this for ${durationText} while still showing up for work, family, life — that takes strength. But you shouldn't have to white-knuckle through this alone.`;
  }

  // Moderate
  if (severity === "moderate") {
    return `When symptoms start affecting your work and relationships, it's not "just menopause." It's your body asking for help. ${displayName}, I'm glad you're here.`;
  }

  // Mild + new
  if (severity === "mild" && duration === "just_started") {
    return `${displayName}, catching this early is smart. These symptoms might feel manageable now, but understanding your patterns now means you can stay ahead of them.`;
  }

  // Mild default
  return `${displayName}, even "mild" symptoms deserve attention. Your body is going through something real, and tracking it will help you understand what's actually going on.`;
}

export interface Insight {
  icon: string;
  title: string;
  text: string;
}

export function getSymptomInsight(symptoms: string[]): Insight {
  // If they have sleep + brain fog
  if (
    symptoms.includes("sleep_issues") &&
    symptoms.includes("brain_fog")
  ) {
    return {
      icon: "Lightbulb",
      title: "There's a connection",
      text: "Poor sleep and brain fog often go hand-in-hand. When we fix one, the other usually improves too.",
    };
  }

  // If they have hot flashes + sleep
  if (
    symptoms.includes("hot_flashes") &&
    symptoms.includes("sleep_issues")
  ) {
    return {
      icon: "Lightbulb",
      title: "I see a pattern already",
      text: "Night sweats disrupting sleep is incredibly common. Tracking when they happen reveals what triggers them.",
    };
  }

  // If they have mood + fatigue
  if (
    symptoms.includes("mood_swings") &&
    symptoms.includes("low_energy")
  ) {
    return {
      icon: "Lightbulb",
      title: "This makes sense",
      text: "Exhaustion and mood swings feed each other. You're not being dramatic — you're depleted.",
    };
  }

  // If they have 5+ symptoms (but we only collect 2, so check for >= 2)
  if (symptoms.length >= 2) {
    return {
      icon: "Lightbulb",
      title: "It's all connected",
      text: `${symptoms.length} symptoms might feel overwhelming, but they often share root causes. Find one trigger, improve many symptoms.`,
    };
  }

  // Default
  return {
    icon: "Lightbulb",
    title: "You're not alone",
    text: "Millions of women experience exactly what you're going through. The difference is having someone help you understand it.",
  };
}

export function getJourneyInsight(
  triedBefore: string[],
  doctorStatus: string
): Insight {
  // Tried many things, nothing worked
  if (triedBefore.length >= 3) {
    return {
      icon: "Target",
      title: "You've been trying",
      text: "Supplements, diet, exercise — you're not giving up. What's been missing is understanding YOUR specific patterns and triggers.",
    };
  }

  // Talked to doctor but not helpful
  if (
    triedBefore.includes("doctor_talk") &&
    doctorStatus === "yes_not_helpful"
  ) {
    return {
      icon: "Target",
      title: "Feeling dismissed?",
      text: 'Too many doctors say "it\'s just menopause." Having your own data changes that conversation completely.',
    };
  }

  // Tried nothing yet
  if (triedBefore.includes("nothing") || triedBefore.length === 0) {
    return {
      icon: "Target",
      title: "Starting fresh",
      text: "Not knowing where to start is exactly why you're here. Lisa will guide you step by step.",
    };
  }

  // Default
  return {
    icon: "Target",
    title: "Now you have help",
    text: "Everything you've tried taught you something. Now Lisa helps you connect the dots.",
  };
}

export function getDoctorInsight(doctorStatus: string): Insight {
  switch (doctorStatus) {
    case "yes_actively":
      return {
        icon: "ClipboardList",
        title: "Better doctor visits",
        text: "Lisa creates reports you can share with your doctor — real data instead of trying to remember everything.",
      };

    case "yes_not_helpful":
      return {
        icon: "ClipboardList",
        title: "Get taken seriously",
        text: "Walking in with tracked data changes everything. Doctors respond differently when you have evidence.",
      };

    case "no_planning":
      return {
        icon: "ClipboardList",
        title: "Be prepared",
        text: "When you do see a doctor, you'll have weeks of data showing exactly what's happening. No more guessing.",
      };

    case "no_natural":
      return {
        icon: "ClipboardList",
        title: "Your body, your choice",
        text: "Understanding your triggers helps you manage symptoms naturally. Knowledge is power.",
      };

    default:
      return {
        icon: "ClipboardList",
        title: "Knowledge is power",
        text: "Whether you see a doctor or not, understanding your patterns puts you in control.",
      };
  }
}

export interface GoalPromise {
  title: string;
  text: string;
  icon: string;
}

export function getGoalPromise(goal: string, name: string): GoalPromise {
  const displayName = name || "you";

  const promises: Record<string, GoalPromise> = {
    sleep_through_night: {
      title: "Imagine sleeping through the night again",
      text: `${displayName}, within weeks of tracking, you'll know exactly what's disrupting your sleep — and what helps. No more guessing.`,
      icon: "Moon",
    },
    think_clearly: {
      title: "Your brain isn't broken",
      text: `${displayName}, brain fog has triggers. When you find yours, that sharp, clear-thinking you miss? She's still there.`,
      icon: "Brain",
    },
    feel_like_myself: {
      title: "She's still in there",
      text: `${displayName}, the you who laughed easily and felt at home in your body — she's not gone. We're going to find her.`,
      icon: "Heart",
    },
    understand_patterns: {
      title: "Clarity is coming",
      text: `${displayName}, within days you'll start seeing patterns. Within weeks, you'll understand your body in a way you never have.`,
      icon: "TrendingUp",
    },
    data_for_doctor: {
      title: "Walk in with confidence",
      text: `${displayName}, your next doctor visit will be different. You'll have real data, clear patterns, and specific questions.`,
      icon: "ClipboardList",
    },
    get_body_back: {
      title: "Your body is listening",
      text: `${displayName}, your body isn't betraying you — it's sending signals. When you understand them, you can finally respond.`,
      icon: "Sparkles",
    },
  };

  return promises[goal] || promises["understand_patterns"];
}

// Simplified helper functions for new results page

export function getSimplifiedHeadline(name: string): string {
  const displayName = name || "you";
  return `${displayName}, you're not alone.`;
}

export function getEmotionalStatement(
  severity: string,
  symptomCount: number,
  name: string
): string {
  const displayName = name || "you";

  if (severity === "severe") {
    return `${symptomCount} symptoms. Every single day. ${displayName}, you've been fighting this alone for too long.`;
  }

  if (severity === "moderate") {
    return `It's affecting your work. Your relationships. Your life. ${displayName}, this isn't something you should just "push through."`;
  }

  // mild
  return `What you're feeling is real. And ${displayName}, understanding it now means you can stay ahead of it.`;
}

export function getSymptomLabel(symptomCount: number): string {
  if (symptomCount >= 5) return "You're dealing with a lot:";
  if (symptomCount >= 3) return "Here's what you're facing:";
  return "Your symptoms:";
}

// Symptom ID to display label mapping
export const SYMPTOM_LABELS: Record<string, string> = {
  hot_flashes: "Hot flashes",
  sleep_issues: "Sleep issues",
  brain_fog: "Brain fog",
  mood_swings: "Mood swings",
  weight_changes: "Weight changes",
  low_energy: "Fatigue",
  anxiety: "Anxiety",
  joint_pain: "Joint pain",
  bloating: "Bloating",
};

// Age band -> human label for cohort comparison copy.
export const AGE_BAND_LABELS: Record<string, string> = {
  under_40: "women under 40",
  "40_45": "women aged 40–45",
  "46_50": "women aged 46–50",
  "51_plus": "women aged 51+",
  prefer_not: "women your age",
};

// Typical symptom intensity (0–3 scale) for the "you're not alone" comparison.
// A defensible model profile of common menopause symptom load — NOT a claimed survey average.
export const TYPICAL_SYMPTOM_SEVERITY: Record<string, number> = {
  hot_flashes: 1.7,
  sleep_issues: 1.9,
  brain_fog: 1.5,
  mood_swings: 1.6,
  weight_changes: 1.7,
  low_energy: 1.9,
  anxiety: 1.5,
  joint_pain: 1.4,
  bloating: 1.5,
};

// Typical wellbeing score per age band (higher = better), calibrated to the
// calculateWellbeingScore distribution (12–92 range). A defensible model profile of
// the typical menopause quiz-taker per band — NOT a claimed survey average.
const TYPICAL_SCORE_BY_AGE: Record<string, number> = {
  under_40: 72,
  "40_45": 68,
  "46_50": 62,
  "51_plus": 58,
  prefer_not: 64,
};

export function getScoreBenchmark(ageBand: string): number {
  return TYPICAL_SCORE_BY_AGE[ageBand] ?? TYPICAL_SCORE_BY_AGE.prefer_not;
}

// Higher score = better, so a score below the cohort benchmark means symptoms are hitting harder.
export function getScoreVerdict(score: number, benchmark: number): string {
  if (score <= benchmark - 4) return "lower than average";
  if (score >= benchmark + 4) return "higher than average";
  return "about average";
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW SCORING MODEL (draft) — Menopause Wellbeing Score
//
// Goal: a transparent 0–100 "quality of life" score (higher = better) that reacts
// to EVERY quiz answer, not just symptom count. Replaces the old calc that was
// clamped to 20–60 and treated every symptom identically.
//
// Model = start at 100, subtract weighted penalties. Each input maps to a clear,
// defensible deduction so the number feels earned and personal.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScoreInputs {
  // symptom id -> intensity 0..3 (0/absent = not selected, 3 = extreme).
  // With plain checkboxes every selected symptom arrives at the same value; the
  // model still works, but per-symptom intensity is what makes the score truly hers.
  symptomSeverity: Record<string, number>;
  timing: string;        // just_started | been_while | over_year | several_years
  hereFor: string;       // pre_menopausal | perimenopausal | post_menopausal | not_sure
  hrtStatus: string;     // currently | past | never
  ageBand: string;       // under_40 | 40_45 | 46_50 | 51_plus | prefer_not
  heightCm: number | null;
  weightKg: number | null;
}

// How hard each symptom drags day-to-day quality of life, relative to a 1.0 baseline.
// Sleep/energy/anxiety weigh most because they cascade into everything else.
const SYMPTOM_IMPACT: Record<string, number> = {
  sleep_issues: 1.3,
  low_energy: 1.2,
  anxiety: 1.2,
  hot_flashes: 1.1,
  brain_fog: 1.1,
  mood_swings: 1.1,
  joint_pain: 1.0,
  weight_changes: 0.9,
  bloating: 0.8,
};

export function computeBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

// BMI outside the healthy range worsens vasomotor symptoms and recovery; we only
// deduct when both height + weight were provided.
function bmiPenalty(bmi: number | null): number {
  if (bmi == null) return 0;
  if (bmi < 18.5) return 2;
  if (bmi < 25) return 0;
  if (bmi < 30) return 3;
  return 5;
}

const DURATION_PENALTY: Record<string, number> = {
  just_started: 0,   // under 6 months
  been_while: 4,     // 6–12 months
  over_year: 8,      // over a year
  several_years: 12, // several years
};

// Stage of the journey. Perimenopause (fluctuating hormones) is typically the
// roughest; symptoms still raging post-menopause is a sign they're unmanaged.
const STAGE_PENALTY: Record<string, number> = {
  pre_menopausal: 0,
  perimenopausal: 4,
  post_menopausal: 3,
  not_sure: 2,
};

// On HRT and still doing this quiz = symptoms persist despite treatment, so the
// credit is small. "Past" can signal a relapse after stopping.
const HRT_PENALTY: Record<string, number> = {
  currently: 1,
  past: 2,
  never: 3,
};

// Menopausal-range symptoms under 40 are unusual and warrant more attention.
const AGE_PENALTY: Record<string, number> = {
  under_40: 3,
  "40_45": 1,
  "46_50": 0,
  "51_plus": 0,
  prefer_not: 1,
};

export interface ScoreBreakdown {
  score: number;            // final 0..100 (higher = better)
  symptomPenalty: number;
  durationPenalty: number;
  stagePenalty: number;
  hrtPenalty: number;
  bmiPenalty: number;
  agePenalty: number;
  bmi: number | null;
}

export function calculateWellbeingScore(inputs: ScoreInputs): ScoreBreakdown {
  const { symptomSeverity, timing, hereFor, hrtStatus, ageBand, heightCm, weightKg } = inputs;

  // 1. Weighted symptom burden (the dominant factor).
  //    burden = Σ impact_i × intensity_i (0..3); ×2 turns it into score points.
  const burden = Object.entries(symptomSeverity).reduce((sum, [id, sev]) => {
    if (!sev) return sum;
    return sum + (SYMPTOM_IMPACT[id] ?? 1.0) * sev;
  }, 0);
  const symptomPenalty = burden * 2;

  const durationPenalty = DURATION_PENALTY[timing] ?? 4;
  const stagePenalty = STAGE_PENALTY[hereFor] ?? 0;
  const hrtPenalty = HRT_PENALTY[hrtStatus] ?? 0;
  const bmi = computeBmi(heightCm, weightKg);
  const bmiPen = bmiPenalty(bmi);
  const agePenalty = AGE_PENALTY[ageBand] ?? 0;

  const raw =
    100 -
    symptomPenalty -
    durationPenalty -
    stagePenalty -
    hrtPenalty -
    bmiPen -
    agePenalty;

  // Let it breathe: floor 12 (never hopeless), cap 92 (someone took this quiz).
  const score = Math.max(12, Math.min(92, Math.round(raw)));

  return {
    score,
    symptomPenalty: Math.round(symptomPenalty),
    durationPenalty,
    stagePenalty,
    hrtPenalty,
    bmiPenalty: bmiPen,
    agePenalty,
    bmi,
  };
}

