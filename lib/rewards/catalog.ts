/**
 * The reward system's rulebook: what earns XP, what the levels are, and every
 * achievement she can unlock.
 *
 * This file is the single source of truth. The mobile app renders what the API
 * sends and owns nothing but icons and colours — deliberately, because a second
 * copy of these thresholds would drift the moment one of them is tuned, and a
 * badge that unlocks on the server but not on the phone (or the reverse) is
 * worse than no badge at all.
 *
 * Nothing here is written to the database. Every number below is *derived* from
 * `user_plan_logs` and `symptom_logs` on each read — see
 * `compute.ts`. That is what makes the whole system retroactive: a woman who
 * has been ticking her plan for six weeks opens the app and finds the badges
 * she already earned, rather than starting from zero on the day we shipped.
 */

/** Pillars a plan task can belong to. Mirrors the plan generator's own set. */
export type RewardPillar = "movement" | "relaxation" | "habit";

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

/**
 * XP for finishing one thing. Everything pays the same.
 *
 * One flat number, deliberately. A table of per-pillar values meant she could
 * not predict what a tick was worth without looking it up, and "was that 4 or
 * 15?" is not a thought a reward is supposed to provoke. The whole system now
 * reads as one sentence: **finish something, get 10 XP.**
 *
 * What counts as finishing is defined in `compute.ts` — a movement or
 * relaxation session, a habit ticked, a nutrition row taken all the way to its
 * target, a symptom logged. Partial progress on a row pays
 * nothing until the row is done, which is what makes the completion itself the
 * moment worth celebrating.
 */
export const XP_PER_COMPLETION = 10;

/**
 * XP she is asked for in a day — five finished things.
 *
 * A realistic good day rather than a perfect one: a couple of nutrition rows, a
 * habit and a practice clears it. A goal she only meets by doing everything is
 * a goal she stops aiming at.
 */
export const DAILY_XP_GOAL = 50;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * XP per level — fifty finished things, flat forever.
 *
 * Replaced a hand-tuned threshold table. Widening gaps are the standard way to
 * pace a game, but they also mean she cannot tell how far the next level is
 * without the app telling her, and they make late levels feel like a stall. A
 * constant step is explainable in six words and never slows down.
 */
export const XP_PER_LEVEL = 500;

/**
 * Level names. Past the list she keeps the last name and the number climbs —
 * "Phoenix 14" reads better than inventing thin synonyms forever.
 */
const LEVEL_NAMES = [
  "Spark",
  "Ember",
  "Glow",
  "Radiant",
  "Blossom",
  "Thrive",
  "Luminous",
  "Unstoppable",
  "Sage",
  "Phoenix",
];

export type RewardLevel = {
  /** 1-based. */
  level: number;
  name: string;
  /** Total XP at which this level started. */
  floor: number;
  /** Total XP the next level starts at. */
  ceiling: number;
  /** XP earned inside this level. */
  intoLevel: number;
  /** XP this level spans. */
  levelSpan: number;
  /** Still needed for the next level. */
  toNext: number;
  /** 0-1 through the level. */
  progress: number;
};

/** Where a total sits on the level curve. */
export function levelForXp(totalXp: number): RewardLevel {
  const xp = Math.max(0, Math.floor(totalXp));

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const floor = (level - 1) * XP_PER_LEVEL;
  const intoLevel = xp - floor;

  return {
    level,
    name: LEVEL_NAMES[Math.min(level, LEVEL_NAMES.length) - 1],
    floor,
    ceiling: floor + XP_PER_LEVEL,
    intoLevel,
    levelSpan: XP_PER_LEVEL,
    toNext: XP_PER_LEVEL - intoLevel,
    progress: intoLevel / XP_PER_LEVEL,
  };
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/**
 * Every number `compute.ts` measures. An achievement family names one of these
 * and a ladder of targets against it; nothing else about a family varies, which
 * is what keeps adding a badge a one-line change.
 */
export type RewardMetric =
  | "bestStreak"
  | "totalXp"
  | "nutritionRows"
  | "waterDays"
  | "proteinDays"
  | "movementSessions"
  | "relaxationSessions"
  | "habitTicks"
  | "goalDays"
  | "activeDays"
  | "symptomLogs"
  | "planWeek"
  | "weekendDays"
  | "totalTicks"
  | "comebacks"
  | "bigDays"
  | "strongWeeks";

export type AchievementFamily = {
  id: string;
  /** Shown as the badge's name at every tier. */
  name: string;
  metric: RewardMetric;
  /**
   * What earning the next tier takes, as a sentence completing "…to reach the
   * next level". `{target}` is replaced with the tier's number.
   */
  goal: string;
  /** One line on why this is worth doing. Shown on the badge's detail sheet. */
  blurb: string;
  /** Ascending. Each entry is one unlockable tier. */
  tiers: number[];
};

/**
 * The families, in the order the rewards screen shows them.
 *
 * Ordered so the ones she can move today sit first: streak and XP are what a
 * single session changes, and a grid that opens on eight locked badges she
 * cannot affect this week teaches her not to open it again.
 */
export const ACHIEVEMENTS: AchievementFamily[] = [
  {
    id: "wildfire",
    name: "Wildfire",
    metric: "bestStreak",
    goal: "Keep a {target}-day streak",
    blurb: "Days in a row with something logged. The single best predictor that this sticks.",
    tiers: [3, 7, 14, 30, 60, 100, 180, 365],
  },
  {
    id: "sage",
    name: "Sage",
    metric: "totalXp",
    goal: "Earn {target} XP",
    blurb: "Everything you have ever finished, added up.",
    // Rescaled for flat 10-XP completions: a good day is around 60, so these
    // land at roughly a week, a month, the full eight weeks, and beyond.
    tiers: [100, 500, 1500, 3000, 6000, 12000],
  },
  {
    id: "flawless",
    name: "Flawless",
    metric: "goalDays",
    goal: "Hit your daily goal on {target} days",
    blurb: "Days you reached your XP goal. Not perfect days — good ones.",
    tiers: [1, 5, 15, 40, 100],
  },
  {
    id: "devoted",
    name: "Devoted",
    metric: "activeDays",
    goal: "Show up on {target} days",
    blurb: "Days you logged anything at all. Consistency beats intensity.",
    tiers: [3, 14, 30, 60, 120, 240],
  },
  {
    id: "strong",
    name: "Strong",
    metric: "movementSessions",
    goal: "Complete {target} movement sessions",
    blurb: "Strength work protects the bone and muscle that fall fastest now.",
    tiers: [1, 5, 15, 40, 100],
  },
  {
    id: "serene",
    name: "Serene",
    metric: "relaxationSessions",
    goal: "Complete {target} relaxation practices",
    blurb: "Breathing and downshifting — what actually shortens a hot flush.",
    tiers: [1, 5, 20, 60, 150],
  },
  {
    id: "nourished",
    name: "Nourished",
    metric: "nutritionRows",
    goal: "Complete {target} nutrition rows",
    blurb: "Each row you took all the way to its target for the day.",
    tiers: [20, 100, 300, 750, 1500],
  },
  {
    id: "hydrated",
    name: "Hydrated",
    metric: "waterDays",
    goal: "Hit your water target on {target} days",
    blurb: "Dehydration mimics half the symptoms you are tracking.",
    tiers: [3, 10, 30, 75, 200],
  },
  {
    id: "protein",
    name: "Protein Queen",
    metric: "proteinDays",
    goal: "Hit your protein target on {target} days",
    blurb: "The one nutrition change with the most evidence behind it in midlife.",
    tiers: [3, 10, 30, 75, 200],
  },
  {
    id: "habitual",
    name: "Habitual",
    metric: "habitTicks",
    goal: "Log {target} habit ticks",
    blurb: "The habits you chose yourself, kept.",
    tiers: [5, 25, 100, 300, 750],
  },
  {
    id: "attuned",
    name: "Attuned",
    metric: "symptomLogs",
    goal: "Log {target} symptoms",
    blurb: "What you track is what Lisa can connect for you.",
    tiers: [1, 10, 30, 100, 250],
  },
  {
    id: "graduate",
    name: "Graduate",
    metric: "planWeek",
    goal: "Reach week {target} of your plan",
    blurb: "Eight weeks is the whole arc. Every week you reach is one she built for you.",
    tiers: [1, 2, 4, 6, 8],
  },
  {
    id: "consistent",
    name: "Consistent",
    metric: "strongWeeks",
    goal: "Log 5+ days in {target} different weeks",
    blurb: "A strong week, repeated. This is what a changed life looks like from the inside.",
    tiers: [1, 4, 8, 16],
  },
  {
    id: "weekender",
    name: "Weekend Warrior",
    metric: "weekendDays",
    goal: "Log something on {target} weekend days",
    blurb: "Saturdays and Sundays are where most plans quietly die.",
    tiers: [2, 8, 20, 50, 100],
  },
  {
    id: "century",
    name: "Centurion",
    metric: "totalTicks",
    goal: "Log {target} ticks in total",
    blurb: "Every single box you have ever checked.",
    tiers: [100, 500, 1500, 4000, 10000],
  },
  {
    id: "overachiever",
    name: "Overachiever",
    metric: "bigDays",
    goal: "Double your daily goal on {target} days",
    blurb: "Days you went well past what was asked.",
    tiers: [1, 5, 20, 50],
  },
  {
    id: "comeback",
    name: "Comeback",
    metric: "comebacks",
    goal: "Come back {target} times after a break",
    blurb: "Missing days is not failing. Returning is the whole skill.",
    tiers: [1, 3, 5, 10],
  },
];

/** A single unlockable step. `wildfire.7` is "Wildfire, the 7-day tier". */
export function tierId(familyId: string, target: number): string {
  return `${familyId}.${target}`;
}

export type AchievementProgress = {
  id: string;
  name: string;
  blurb: string;
  metric: RewardMetric;
  /** Where she is on this family's metric. */
  value: number;
  /** Tiers fully earned. 0 means the badge is still locked. */
  tier: number;
  maxTier: number;
  /** The next tier's number, or null once the family is complete. */
  target: number | null;
  /** The tier she last passed — the progress bar's left edge. */
  floor: number;
  /** What the next tier asks for, ready to render. Empty once complete. */
  goal: string;
  unlocked: boolean;
  complete: boolean;
  /** 0-1 toward the next tier. 1 when complete. */
  progress: number;
  /** Every tier earned, as stable ids. The client diffs these to celebrate. */
  earned: string[];
};

/** Score one family against a measured value. */
export function evaluate(family: AchievementFamily, value: number): AchievementProgress {
  const earnedTiers = family.tiers.filter((t) => value >= t);
  const tier = earnedTiers.length;
  const complete = tier >= family.tiers.length;
  const target = complete ? null : family.tiers[tier];
  const floor = tier > 0 ? family.tiers[tier - 1] : 0;

  // Measured from the tier she just passed, not from zero — otherwise the bar
  // for a 365-day badge sits visually still for a year.
  const span = target === null ? 0 : target - floor;
  const progress = complete ? 1 : span > 0 ? Math.min(1, Math.max(0, (value - floor) / span)) : 0;

  return {
    id: family.id,
    name: family.name,
    blurb: family.blurb,
    metric: family.metric,
    value,
    tier,
    maxTier: family.tiers.length,
    target,
    floor,
    goal: target === null ? "" : family.goal.replace("{target}", String(target)),
    unlocked: tier > 0,
    complete,
    progress,
    earned: earnedTiers.map((t) => tierId(family.id, t)),
  };
}
