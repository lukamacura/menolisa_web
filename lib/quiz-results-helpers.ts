export interface Insight {
  icon: string;
  title: string;
  text: string;
}

// Simplified helper functions for new results page

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

// Symptom ID -> the one-line reason it happens, each ending at the same place:
// estrogen. This is the payload of the results card - the only block in the
// funnel that tells her something she did not already know, rather than reading
// her own answers back to her.
//
// Two rules these lines have to keep:
//
//   1. **General physiology, never a claim about her.** "Estrogen helps hold
//      deep sleep" is a fact about menopause; "your estrogen has fallen 23%" is
//      a measurement we never took. The funnel deleted a per-user `estrogenPct`
//      for exactly this reason - see the note where it used to live in
//      app/register/page.tsx.
//   2. **Every line names estrogen.** The card's whole argument is that a list
//      of unrelated-feeling complaints has one cause, and the convergence is
//      only legible if she can see the same word arriving from each row.
//
// Kept to roughly 12-16 words: this is read on a phone, three at a time, by
// someone who has been answering questions for two minutes.
export const SYMPTOM_MECHANISM: Record<string, string> = {
  hot_flashes:
    "Estrogen steadies the brain's thermostat. As it drops, a normal room reads as too hot.",
  sleep_issues:
    "Estrogen helps hold deep sleep and keeps night temperature level. Both wobble as it falls.",
  brain_fog:
    "Memory centres run on estrogen-driven blood flow, so word-finding is the first thing to slow.",
  mood_swings:
    "Estrogen sets your serotonin level. When estrogen swings through the day, mood swings with it.",
  weight_changes:
    "Less estrogen moves fat storage to your middle and lets muscle - your calorie burner - slip away.",
  low_energy:
    "Broken sleep plus an estrogen-shifted stress rhythm means the tank starts each morning part-empty.",
  anxiety:
    "Estrogen buffers your stress response. With less of it, adrenaline hits harder and clears slower.",
  joint_pain:
    "Estrogen is anti-inflammatory and keeps cartilage cushioned, which is why mornings stiffen first.",
  bloating:
    "Shifting estrogen and progesterone slow the gut down and make the body hold on to water.",
};

// Symptom id -> the one thing she can do about it tonight, free, before she has
// bought anything. The payload of the first quiz reward - see
// <StartingPointBoard /> in components/funnel/RewardBoards.tsx.
//
// This table exists because the first reward was the only one of the three that
// handed her nothing. Boards 2 and 3 give her an object she did not have (her
// week, her session 1); board 1 read her own answers back with a prevalence
// figure stapled to them, six questions in, at the exact moment she is deciding
// whether twelve questions are worth finishing. The cheapest way to answer that
// question is to pay her once, early, with something she can use before the
// price is ever mentioned.
//
// Four rules, and each one has a way of going wrong:
//
//   1. **Tonight, free, and no equipment.** If it needs a purchase, a
//      practitioner or a Tuesday, it is a plan preview rather than a gift, and
//      the screen goes back to being a promise.
//   2. **Never the breathing exercise.** That is RELIEF_TOOL_NAME, the thing
//      she unlocks by *doing* it in the relief phase - the one item in the
//      toolkit stack marked "yours to keep". Handing out a breathing drill here
//      spends that unlock two phases before it happens.
//   3. **General self-care, never treatment.** No doses, no supplements, no
//      "this will fix your sleep". Same standard as SYMPTOM_MECHANISM above:
//      a true statement about the body, and an action anyone can take, with no
//      claim about what it will do to her specifically.
//   4. **`why` earns the action, in one line.** Without it this is a listicle
//      tip. With it, it is the first time the funnel has explained itself, and
//      it is what makes her believe the plan behind it was reasoned too.
export const SYMPTOM_FIRST_MOVE: Record<string, { do: string; why: string }> = {
  hot_flashes: {
    do: "Cool the bedroom and lay out loose cotton before you get in.",
    why: "A cooler start gives the night surge less to build on.",
  },
  sleep_issues: {
    do: "Set tomorrow's wake time now — and keep it even if tonight goes badly.",
    why: "The wake time is what anchors the next night. The bedtime isn't.",
  },
  brain_fog: {
    do: "Write tomorrow's three things on paper before bed.",
    why: "Fog is a retrieval problem. Paper does the retrieving for you.",
  },
  mood_swings: {
    do: "Charge your phone outside the bedroom tonight.",
    why: "The late scroll is a stress spike you can't buffer the way you used to.",
  },
  weight_changes: {
    do: "Set tomorrow's protein out tonight — eggs on the counter, yoghurt at the front.",
    why: "Muscle is the thing you're protecting, and it's built from the first meal.",
  },
  low_energy: {
    do: "Before you sleep, set a morning alarm for ten minutes outside.",
    why: "The rhythm that runs your energy is set at first light, not at noon.",
  },
  anxiety: {
    do: "Write the loop down — one line, whatever it is — and shut the notebook.",
    why: "On paper it stops re-arriving every twenty minutes.",
  },
  joint_pain: {
    do: "Two minutes of slow ankle and hip circles on the edge of the bed.",
    why: "Stiff mornings start with a night that never moved.",
  },
  bloating: {
    do: "Close the kitchen three hours before bed tonight.",
    why: "A gut that has already slowed down needs the runway more than it used to.",
  },
};

// Age band -> human label for cohort comparison copy.
export const AGE_BAND_LABELS: Record<string, string> = {
  under_40: "women under 40",
  "40_45": "women aged 40–45",
  "46_50": "women aged 46–50",
  "51_plus": "women aged 51+",
  prefer_not: "women your age",
};

// Typical wellbeing score per age band (higher = better), calibrated to the
// calculateWellbeingScore distribution (12–68 range). A defensible model profile of
// the typical menopause quiz-taker per band — NOT a claimed survey average.
// Every value must stay under SCORE_CEILING, or the benchmark tick on the score
// bar sits somewhere no real score can ever reach.
const TYPICAL_SCORE_BY_AGE: Record<string, number> = {
  under_40: 66,
  "40_45": 64,
  "46_50": 62,
  "51_plus": 58,
  prefer_not: 64,
};

export function getScoreBenchmark(ageBand: string): number {
  return TYPICAL_SCORE_BY_AGE[ageBand] ?? TYPICAL_SCORE_BY_AGE.prefer_not;
}

// `getScoreVerdict()` lived here until 2026-08-17. It ranked her against the
// cohort in words - "hitting you harder than most women your age" - and opened
// the benchmark band of <ScoreCauseCard />.
//
// It was removed rather than left unused because the ranking is the weakest
// claim the results screen makes: TYPICAL_SCORE_BY_AGE below is a defensible
// modelled profile, not a survey average, so a comparative verdict built on it
// asks her to believe a baseline we invented, on the one screen where belief is
// being formed. The benchmark number still ships (it is the only thing that
// makes a score out of 100 mean anything) - it is now stated as a reference
// point rather than a placing. Bring the verdict back only alongside real
// cohort data.

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
  // The quiz rates her worst symptom (Mild/Moderate/Severe) and scales the rest
  // from it, so these values really do differ per woman.
  symptomSeverity: Record<string, number>;
  // How long symptoms have been going on. The web quiz stopped asking on
  // 2026-08-12; mobile and legacy rows may still supply it. Omitted = the
  // mid-range DURATION_PENALTY below, applied uniformly.
  timing?: string;       // just_started | been_while | over_year | several_years
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

/**
 * Her selected symptoms, ordered by how much each one costs a normal day —
 * i.e. by the same SYMPTOM_IMPACT weights the score itself is built from.
 *
 * This exists so the results card can say *why* her score is what it is using
 * her own answers, instead of leading with the size of the gap to the goal. The
 * gap is a count of points on a scale that exists nowhere outside this funnel;
 * "sleep, energy and anxiety" is a sentence she recognises before she finishes
 * reading it.
 *
 * The quiz rates her worst symptom and scales the rest from it, so intensities
 * are currently uniform across her picks and this ordering resolves to the
 * weights. It still multiplies by intensity: the day the quiz rates each
 * symptom separately, this ranking becomes hers without a second edit here.
 * Ties keep selection order, which is her own priority.
 */
export function getTopBurdenSymptoms(
  symptomSeverity: Record<string, number>,
  limit = 3
): string[] {
  return Object.entries(symptomSeverity)
    .filter(([, sev]) => sev > 0)
    .map(([id, sev], order) => ({ id, weight: (SYMPTOM_IMPACT[id] ?? 1.0) * sev, order }))
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.id);
}

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

// The 8-week goal shown everywhere in the funnel. The score model is calibrated
// against it: the best possible answer set must still land meaningfully below.
export const SCORE_GOAL = 80;
// Highest score anyone can be shown — 12 points of headroom under the goal, so
// the plan always has something to do.
const SCORE_CEILING = SCORE_GOAL - 12; // 68
// Above this the remaining points get compressed instead of clipped, so the
// lightest answer sets still order correctly relative to each other.
const SCORE_SOFT_CAP = 60;
const SCORE_SQUASH = 0.2;

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

  const durationPenalty = timing ? DURATION_PENALTY[timing] ?? 4 : 4;
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

  // A hard clamp at 79 produced the absurd case of "your score: 79, your 8-week
  // target: 80+" — a one-point journey nobody would pay for. So instead of
  // clipping the top, we compress it: below SOFT_CAP the raw score passes
  // through untouched, above it each remaining point is worth SQUASH of a point.
  // The result is still strictly monotonic (a lighter answer set always scores
  // higher) but can never exceed SCORE_CEILING, which leaves a visible gap to
  // the 80+ goal for every possible set of answers.
  const compressed =
    raw > SCORE_SOFT_CAP ? SCORE_SOFT_CAP + (raw - SCORE_SOFT_CAP) * SCORE_SQUASH : raw;

  // Floor 12 so it's never hopeless, ceiling SCORE_CEILING so there's always
  // room to improve (someone took this quiz for a reason).
  const score = Math.max(12, Math.min(SCORE_CEILING, Math.round(compressed)));

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

