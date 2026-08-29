import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordLlmUsage } from "@/lib/llmUsage";
import type { Adherence } from "@/lib/plan/cycles";
import {
  DEFAULT_COOLDOWN,
  DEFAULT_WARMUP,
  INTERVALS_ID,
  MOVEMENT_VOLUME,
  NUTRITION,
  POWER_SESSIONS_PER_WEEK,
  RELAXATION,
  ZONE2_ID,
  allowedCooldowns,
  allowedExercises,
  allowedPower,
  allowedWarmups,
  buildPowerBlock,
  cardioForWeek,
  defaultDoseForWeek,
  doseBands,
  exerciseMedia,
  fitSessionToMinutes,
  getExercise,
  hydrateDose,
  intervalsMinutes,
  isCardioId,
  isNutritionId,
  isPowerId,
  isRelaxationId,
  listSeconds,
  powerMinutes,
  relaxationDetail,
  relaxationForSymptom,
  type Exercise,
  type StoredExercise,
} from "@/lib/plan/catalog";

export const PLAN_WEEKS = 8;

/**
 * Both generation calls run on the same model. Named because it is also the key
 * the cost table in lib/llmCost.ts is looked up by — change it in one place and
 * the admin panel's cost-per-plan follows; change it in two and one of the
 * calls silently prices as "unknown model".
 */
const PLAN_MODEL = "gpt-4o-mini";

/** Ties the two calls of one generation together for cost reporting. */
type PlanMeter = { userId: string | null; runId: string };

/**
 * Nutrition is no longer one of these. All ten nutrition habits are shown
 * every day to everyone (see catalog.NUTRITION), so they are not something a
 * week "contains" — the week only nominates which of them to push on.
 */
export type Pillar = "movement" | "relaxation" | "habit";

export type PlanTask = {
  /** Stable across the plan's life — user_plan_logs.task_key points at this. */
  key: string;
  pillar: Pillar;
  title: string;
  why: string;
  /** daily = every day; weekly = `target` times this week; per_day = `target` times a day. */
  cadence: "daily" | "weekly" | "per_day";
  target: number;
  /**
   * The prescribed dose per exercise, written by the model and clamped in
   * `sanitize()`. Which of these fields *apply* is a property of the exercise,
   * not of the plan — the catalog decides that a walk is one continuous block,
   * and `hydrateDose()` reads the matching field at request time.
   *
   * On a cardio task this is exactly one `K` id with `minutes`, written by
   * code — see `cardioTasks()`.
   */
  exercises?: StoredExercise[];
  /**
   * What she does before and after the work, when the model wrote them
   * (`bookendFrom()`). Absent means "use the generic pair": read them through
   * `sessionWarmup()` / `sessionCooldown()`, never directly.
   *
   * `exercises` stays meaning the main work only. Folding bookends into it
   * would silently change what every adherence and volume read is measuring.
   */
  warmup?: StoredExercise[];
  cooldown?: StoredExercise[];
  /**
   * The bone-loading block, between the work and the cool-down.
   *
   * Written by code at generation (`buildPowerBlock()`), not by the model and
   * not resolved at read time — unlike the bookends there is no generic version
   * of it, because which plyometrics she may be given depends on her level.
   * Absent on a snack, on a cardio task, and on every plan generated before
   * 2026-08-29.
   *
   * `exercises` still means the main work only. The same rule the bookends
   * follow, for the same reason: every adherence and volume read measures that
   * array, and folding a fourth phase into it would silently change what they
   * are counting.
   */
  power?: StoredExercise[];
  /**
   * How many of the week's sessions the power block belongs to.
   *
   * A movement task holds one session repeated `target` times, so the plan
   * cannot say "plyo on Tuesday and Friday". It says "do this block twice this
   * week" and the app counts. See `POWER_SESSIONS_PER_WEEK`.
   */
  powerSessions?: number;
};

export type PlanWeek = {
  number: number;
  title: string;
  focus: string;
  tasks: PlanTask[];
  /** Nutrition ids to highlight this week. The other seven still show. */
  nutritionFocus: string[];
};

/** A temptation she gets rewarded for resisting. She opts in; we never assume. */
export type ResistSuggestion = { title: string; why: string };

export type Plan = {
  weeks: PlanWeek[];
  resistSuggestions: ResistSuggestion[];
  /**
   * Why each nutrition row is on her list, written for her — keyed by nutrition
   * id, one entry per item in catalog.NUTRITION.
   *
   * It lives on the plan rather than on the week because the ten rows don't
   * change across the eight weeks; a per-week copy would be eighty strings
   * saying the same thing. Written once at generation and never regenerated, so
   * the reason she read in week 1 is the reason still there in week 8.
   *
   * Optional on read: plans generated before this existed have no such key, and
   * `GET /api/plan` falls back to the catalog default per id.
   */
  nutritionWhy?: Record<string, string>;
};

/** The quiz answers the two prompts actually read. Nothing else is selected. */
export type Profile = {
  top_problems: string[] | null;
  symptom_impact: string | null;
  goals: string[] | null;
  goal: string | null;
  age_band: string | null;
  here_for: string | null;
  menopause_type: string | null;
  hrt_status: string | null;
  fitness_level: string | null;
  nutrition_style: string | null;
  relaxation_style: string | null;
  safety_flags: string[] | null;
};

/** Contraindications she ticked on the quiz's safety screen, as a line for the
 *  prompt. "None" and "prefer not to say" are not contraindications, so they
 *  never reach the model as one. */
const SAFETY_LABEL: Record<string, string> = {
  breast_cancer: "history of breast cancer",
  clots_stroke: "history of blood clots or stroke",
  liver_disease: "liver disease",
};

function safetyLine(flags: string[] | null): string | null {
  const named = (flags ?? []).map((f) => SAFETY_LABEL[f]).filter(Boolean);
  return named.length ? named.join(", ") : null;
}

// ─── LLM contract ───────────────────────────────────────────────────────────

// The model reliably drifts in two ways: it capitalizes enum values ("Movement")
// and it emits null instead of omitting optional fields. Both are cheap to
// absorb here, and rejecting over them would throw away an otherwise good plan.
// The cast keeps the literal union as the output type; z.preprocess widens it to string.
const lower = <T extends string>(schema: z.ZodType<T>) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
    schema
  ) as unknown as z.ZodType<T>;

/** Truncates rather than rejects — length is never a good reason to lose a plan. */
const text = (max: number) =>
  z.string().nullish().transform((v) => (v ?? "").trim().slice(0, max));
const optNum = (max: number) => z.number().int().min(1).max(max).nullish();

const TaskSchema = z.object({
  pillar: lower(z.enum(["movement", "relaxation", "habit"])),
  // Nullish, not `.min(1)`. An empty title used to fail the parse, and a failed
  // parse drops the task — which leaves the week with two, and a week with two
  // discards the entire eight-week plan in buildPlan(). Measured live: that path
  // cost BOTH beginner archetypes their personalized plan. It is repaired in
  // sanitize() instead, by pillar; see taskTitle().
  title: z.string().nullish().transform((v) => (v ?? "").trim().slice(0, 80)),
  why: text(200),
  cadence: lower(z.enum(["daily", "weekly", "per_day"])),
  target: z.number().int().min(1).max(7).nullish().transform((v) => v ?? 1),
  item_id: z
    .string()
    .nullish()
    .transform((v) => v?.trim().slice(0, 40) || undefined),
  exercises: z
    .array(
      z.object({
        id: z.preprocess(
          (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
          z.string().max(8)
        ),
        sets: optNum(6),
        seconds: optNum(120),
        minutes: optNum(90),
      })
    )
    .max(8)
    .nullish(),
  // Bookends carry ids only. The model chooses WHICH movement warms her up; it
  // does not get to dose it, because a warm-up is not progressed across the
  // eight weeks — it is the same two minutes in week 8 as in week 1. The dose
  // comes off the catalog in sanitize(), which deletes a whole class of error
  // (a 90-second "hip circle" set) at the cost of nothing anyone wanted.
  warmup: z.array(z.string()).max(6).nullish(),
  cooldown: z.array(z.string()).max(6).nullish(),
});

/**
 * One week, parsed leniently.
 *
 * `number` and `title` are the two fields the model gets wrong in a way that
 * used to be fatal, so neither can fail here: an unusable `number` falls back to
 * the week's position in the array (the model emits them in order), and an empty
 * `title` falls back to the written one for that week. Both repairs are made in
 * sanitize(), which is the only place that knows the position.
 */
const WeekSchema = z.object({
  number: z.coerce.number().int().nullish(),
  title: z.string().nullish().transform((v) => (v ?? "").trim().slice(0, 60)),
  focus: text(200),
  tasks: z.array(z.unknown()).max(10).nullish(),
  nutrition_focus: z.array(z.string()).max(4).nullish(),
});

const ResistSchema = z.object({
  title: z.string().min(1).transform((s) => s.trim().slice(0, 60)),
  why: text(160),
});

// Tasks are validated one at a time inside sanitize(), so a single malformed
// task costs us that task instead of all eight weeks.
const PlanSchema = z.object({
  // Neither the week count nor a week's number is bounded at PLAN_WEEKS here,
  // and that is deliberate. Both used to be, and both rejected the WHOLE plan
  // over a ninth week — a model that wrote eight good weeks and then a bonus one
  // lost all nine and she got the deterministic plan instead. It is the same
  // mistake as dropping a task for a bad id, one level up.
  //
  // sanitize() reads weeks by number, 1 to PLAN_WEEKS, so anything outside that
  // range is simply never looked at. The cap that remains is an absurdity guard,
  // not a rule.
  // Weeks are `unknown` here and parsed one at a time in sanitize(), for exactly
  // the reason the tasks below them are: a single malformed week must cost that
  // week, not the plan.
  //
  // They used to be parsed inline, and it cost a real customer her plan. Strict
  // mode does not support bounds keywords, so `number` is only declared as an
  // integer to the model — nothing stops it emitting `0`, and nothing stops an
  // empty `title`. Measured across five live generations, **one in five** came
  // back with four weeks like that, and `.min(1)` on either field rejected the
  // WHOLE response: eight good weeks thrown away for the deterministic
  // "Session 1 … Session 8" plan. The comment two lines up already said this was
  // the mistake to avoid at the week-count level; it was still being made at the
  // field level inside each week.
  weeks: z.array(z.unknown()).min(1).max(32),
  resist_suggestions: z.array(z.unknown()).max(8).nullish(),
  // Keys are checked against the catalog in sanitize(), not here — an id the
  // model invented should cost that one entry, not the whole plan.
  nutrition_why: z.record(z.string(), z.unknown()).nullish(),
});

/**
 * The response schema, enforced by OpenAI rather than asked for in prose.
 *
 * `json_object` mode only guarantees "some valid JSON", which is why the prompt
 * had to spell out every id rule and why the model could ignore them: it
 * routinely put a movement id in `item_id`, that task was dropped, and a week
 * left with two tasks cost the entire personalized plan. Under `strict: true`
 * the ids are enums, so an invalid one is not rejected downstream — it is
 * unrepresentable. sanitize() still runs; it now only handles judgement calls
 * (too few exercises, a habit restating nutrition), not malformed output.
 *
 * The pool is per-user, so the schema is built per-user too.
 *
 * Two constraints of strict mode shape what's below:
 *  - every property must be listed in `required`, so what used to be omitted is
 *    now sent explicitly as null (`item_id` on a habit, `exercises` on anything
 *    that isn't movement). The prompt says so, and the zod layer already treats
 *    null and absent alike.
 *  - bounds keywords (minItems, maximum, …) are not supported here, so the
 *    counts and lengths stay in PlanSchema, which clamps rather than rejects.
 */
function planJsonSchema(pool: Exercise[]) {
  const nullableInt = { type: ["integer", "null"] };
  // Warm-up and cool-down get SEPARATE enums, which is the strongest form the
  // "dynamic in front, static after" rule can take: under `strict: true` a
  // stretch in the warm-up slot is not a rule the model can break, it is a token
  // it cannot emit. The prose version of this rule was being ignored routinely.
  const bookend = (family: Exercise[]) => ({
    type: ["array", "null"],
    items: { type: "string", enum: family.map((e) => e.id) },
  });
  const warmup = bookend(allowedWarmups());
  const cooldown = bookend(allowedCooldowns());

  return {
    type: "object",
    additionalProperties: false,
    required: ["weeks", "resist_suggestions"],
    properties: {
      weeks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["number", "title", "focus", "nutrition_focus", "tasks"],
          properties: {
            number: { type: "integer" },
            title: { type: "string" },
            focus: { type: "string" },
            nutrition_focus: {
              type: "array",
              items: { type: "string", enum: NUTRITION.map((n) => n.id) },
            },
            tasks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["pillar", "title", "why", "cadence", "target", "item_id", "exercises", "warmup", "cooldown"],
                properties: {
                  pillar: { type: "string", enum: ["movement", "relaxation", "habit"] },
                  title: { type: "string" },
                  why: { type: "string" },
                  cadence: { type: "string", enum: ["daily", "weekly", "per_day"] },
                  target: { type: "integer" },
                  // Null on movement and habit. The null belongs in the enum as
                  // well as the type — a nullable enum needs it in both.
                  item_id: {
                    type: ["string", "null"],
                    enum: [...RELAXATION.map((r) => r.id), null],
                  },
                  exercises: {
                    type: ["array", "null"],
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["id", "sets", "seconds", "minutes"],
                      properties: {
                        // Her allowed pool only — this is the line that makes
                        // an out-of-pool or invented exercise impossible.
                        id: { type: "string", enum: pool.map((e) => e.id) },
                        sets: nullableInt,
                        // Seconds of work per set. There is no reps field to
                        // reach for: every dose in the plan is time, so the
                        // model's only job is how long, and how that grows.
                        seconds: nullableInt,
                        minutes: nullableInt,
                      },
                    },
                  },
                  warmup,
                  cooldown,
                },
              },
            },
          },
        },
      },
      resist_suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "why"],
          properties: { title: { type: "string" }, why: { type: "string" } },
        },
      },
    },
  };
}

/** Exported for `scripts/verify-plan-dose.ts`, which reads the dose rules back. */
/**
 * What the last eight weeks tell the model about how to size the next ones.
 *
 * Two things this block is careful about, and both have a wrong version that
 * looks reasonable:
 *
 * 1. **A low pillar shrinks the ask, it does not scold her.** The instinct is
 *    to push harder where she fell behind. That is exactly backwards — a plan
 *    she could not keep for eight weeks will not be kept by being made bigger.
 * 2. **The numbers never reach her.** They change what gets built; they are
 *    banned from every title, focus and why. She is opening a new plan, not a
 *    report card, and "last time you only managed 38%" is the sentence that
 *    makes her cancel.
 *
 * A `null` pillar means the last plan never asked for it. That is a gap in the
 * plan, not a failure of hers, and it is stated as such.
 */
function adherenceBlock(a: Adherence | null): string[] {
  if (!a) return [];

  const line = (label: string, value: number | null | undefined) =>
    value == null
      ? `- ${label}: her last plan asked nothing here.`
      : `- ${label}: she did ${value}% of what her last plan asked.`;

  // Only call it a fade or a build when the gap is big enough to mean
  // something. Eight percentage points either way is noise, and a plan built
  // to correct noise is a plan built on nothing.
  const drift = a.secondHalf - a.firstHalf;
  const trend =
    drift <= -10
      ? `- She started well and faded: ${a.firstHalf}% over the first four weeks, ${a.secondHalf}% over the last four. Weeks 6-8 must stay as easy to keep as week 2 — grow the dose, never the number of separate things she has to remember in a day.`
      : drift >= 10
        ? `- She built as she went: ${a.firstHalf}% over the first four weeks, ${a.secondHalf}% over the last four. She is on an upward slope, so open week 1 above true beginner and keep climbing.`
        : `- She held steady across the eight weeks (${a.firstHalf}% then ${a.secondHalf}%).`;

  return [
    `HER LAST 8 WEEKS — this is plan number ${a.cycle + 1}. She has already lived one, and finished it.`,
    line("Movement", a.movement),
    line("Nutrition", a.nutrition),
    line("Relaxation", a.relaxation),
    line("Daily habit", a.habit),
    trend,
    ``,
    `Size this plan to what she ACTUALLY did, pillar by pillar:`,
    `- 80% or above — she has room. Progress it: open week 1 near where her last plan's week 6 sat, and add one genuinely new thing.`,
    `- 50-79% — the size was right, the shape was not. Keep the same weekly ask and change what fills it: different exercises, a different relaxation item, a different habit.`,
    // "Fewer sessions a week" used to lead this line, and it was the one cut
    // the model could not make: sanitize() overwrites `cadence` and `target`
    // from MOVEMENT_VOLUME on every movement task, so a model that dutifully
    // wrote 2 sessions for a woman at 30% had it put back to 3 on the way to
    // the database. A prompt that promises a smaller plan and a code path that
    // silently restores the big one is worse than either alone — the cut she
    // needed most was the only one guaranteed not to happen. The session count
    // is hers by fitness level; the cut goes inside the session.
    `- Below 50% — the ask was too big. CUT it: fewer exercises in a session, shorter sets, one daily practice instead of two. Make the smaller plan excellent rather than the bigger plan optional.`,
    `- How many sessions a week is set by her fitness level and is not yours to change. Cut inside the session, never the number of them.`,
    `- Where a pillar was never asked for, introduce it gently: one short task, cadence "daily", nothing to schedule.`,
    `- Nutrition focus follows the same rule. Under 50% means going back to one or two rows and staying there, not marching through all ten again.`,
    `- Give her new habit tasks and new resist_suggestions. She has had eight weeks of the last set.`,
    // Habits were scored nowhere until 2026-08-29, so this rule had no number
    // behind it and could not be written. A habit she dropped is a habit that
    // did not fit her day, and the answer to that is a smaller one, not the
    // same one repeated louder.
    `- If her daily habit score was under 50%, the habits you wrote last time did not fit her day. Make the next ones smaller and tie each to something already in it ("while the kettle boils", "before you turn the light off"), not to a new slot she has to find.`,
    `- NEVER put a percentage, a score, "last time", "you missed", "you struggled", or any reference to a previous plan into a title, a focus or a why. The numbers above decide what you build. They never appear in what she reads.`,
    ``,
  ];
}

export function buildPrompt(
  profile: Profile,
  pool: Exercise[],
  adherence: Adherence | null = null
): string {
  const level = profile.fitness_level ?? "beginner";
  const vol = MOVEMENT_VOLUME[level] ?? MOVEMENT_VOLUME.beginner;
  const movement = vol.perDay
    ? `${vol.sessions} short bursts per day of about ${vol.minutes} minutes (cadence "per_day")`
    : `${vol.sessions} sessions per week of about ${vol.minutes} minutes (cadence "weekly", target ${vol.sessions})`;
  // A 5-minute snack cannot hold six exercises; a 30-minute session should not
  // hold one. sanitize() tops up to this same floor when the model under-delivers.
  const [minEx, maxEx] = vol.perDay ? [MIN_SNACK_EXERCISES, MAX_SNACK_EXERCISES] : [MIN_EXERCISES, MAX_EXERCISES];
  // Bookends belong on every session except a snack — see wantsBookends().
  const hasBookends = !vol.perDay;
  const warmupPool = allowedWarmups();
  const cooldownPool = allowedCooldowns();
  // What is actually left for the work, once the bookends have taken their two
  // minutes. This is the number the ladder below has to fit inside.
  const workMinutes = workMinutesFor(vol);
  // The cardio the app schedules beside her sessions, so the model can be told
  // it exists and told not to write it. Week 1's shape is enough for that.
  const cardio = cardioForWeek(level, 1);
  // The ladder, sized to HER session rather than printed as a constant.
  //
  // It used to be the same three lines for everyone: "weeks 6-8: 3 sets, 45-60
  // seconds". For a 35-minute advanced session that is right. For the woman who
  // chose "a few minutes, spread out" it is arithmetically impossible — three
  // exercises at 3x55s is thirteen minutes, and week 8 was asking her for that
  // four times a day. She was shown "About 5 min" on the quiz screen and charged
  // $59 against it, so the promise is explicit and the overrun was a broken one.
  const ladder = doseLadder(workMinutes, minEx, maxEx);
  const perSide = pool.filter((e) => e.perSide).map((e) => e.id);
  // Named from her own pool, so a coverage rule can never ask for an id her
  // limitations already took away.
  const boneIds = pool.filter((e) => isPowerId(e.id)).map((e) => e.id);
  // Whether a power block will be appended to every session she is given. The
  // pools are computed in buildPlan(); this only has to know that the cadence
  // supports one, which is the same condition sanitize() applies.
  const hasPower = !vol.perDay && powerMinutes(vol) > 0;
  const upperIds = pool.filter((e) => e.id.startsWith("U")).map((e) => e.id);

  return [
    adherence
      ? `Woman in menopause who has just finished an 8-week plan. Build her next one.`
      : `Woman in menopause. Build her 8-week plan.`,
    ``,
    `Her answers:`,
    `- Symptoms, worst first: ${profile.top_problems?.join(", ") || "general menopause symptoms"}${profile.symptom_impact ? ` · the worst one hits her: ${profile.symptom_impact}` : ""}`,
    `- Goals, most important first: ${profile.goals?.join(", ") || profile.goal || "feeling like herself again"}`,
    `- Stage: ${profile.here_for ?? "unknown"} · onset: ${profile.menopause_type ?? "unknown"}`,
    `- Age: ${profile.age_band ?? "unknown"} · HRT: ${profile.hrt_status ?? "unknown"}`,
    `- Fitness level: ${profile.fitness_level ?? "beginner"}`,
    `- Eating right now: ${profile.nutrition_style ?? "unknown"} · unwinds: ${profile.relaxation_style ?? "unknown"}`,
    ``,
    ...adherenceBlock(adherence),
    `MOVEMENT — pick only these exercise ids, and give ${movement}:`,
    pool.map((e) => `${e.id} ${e.name}`).join(" | "),
    ``,
    ...(hasBookends
      ? [
          ``,
          `WARM-UP — pick only these ids, and send them as plain id strings (no sets, no seconds — the app doses them):`,
          warmupPool.map((e) => `${e.id} ${e.name}`).join(" | "),
          ``,
          `COOL-DOWN — a different list. Pick only these, same plain-string shape:`,
          cooldownPool.map((e) => `${e.id} ${e.name}`).join(" | "),
        ]
      : []),
    ``,
    `RELAXATION — pick only these item_ids, and use their label as the title:`,
    RELAXATION.map((r) => `${r.id} = ${r.label} (${r.use})`).join(" | "),
    ``,
    `NUTRITION — all ten of these are shown to her every day; you do not create`,
    `nutrition tasks. You only name 1-2 ids per week as "nutrition_focus":`,
    NUTRITION.map(
      (n) => `${n.id} = ${n.label}${n.target > 1 ? ` (${n.target}x a day)` : ""}`
    ).join(" | "),
    ``,
    `Rules:`,
    `- Exactly 8 weeks, numbered 1-8. Weeks 1-2 steady the basics, 3-5 build, 6-8 lock it in.`,
    `- Each week: 3-4 tasks — at least one movement, one relaxation, one habit. No nutrition tasks.`,
    `- Each week also needs "nutrition_focus": 1-2 nutrition ids to push on that week. Build on the previous week; do not restart from the same id every week.`,
    `- Start the nutrition focus where her eating actually is. "skipping" or "convenience" means week 1 is one anchored meal, not fasting windows; "intentional" means skip the basics she already does and open on timing and fasting.`,
    `- Match the relaxation cadence to how she already unwinds. "none" or "want_to" starts at one short daily practice and stays there for weeks 1-2; "routine" can carry two from the start.`,
    ...(safetyLine(profile.safety_flags)
      ? [
          `- SAFETY — she has: ${safetyLine(profile.safety_flags)}. Never suggest hormone therapy, phytoestrogen or soy loading, herbal supplements, or high-intensity work she has not built up to. Where a task touches this, keep it to food, movement, sleep and breathing, and tell her to clear anything else with her doctor.`,
        ]
      : []),
    ...(profile.menopause_type === "surgical" || profile.menopause_type === "medical"
      ? [
          `- Her menopause was ${profile.menopause_type === "surgical" ? "surgical" : "brought on by cancer treatment"}, so it arrived at once rather than over years. Do not write "as your hormones gradually shift" or anything that assumes a slow transition, and open movement one step gentler than her stated fitness level.`,
        ]
      : []),
    `- She also gets ${cardio.zone2.sessions + (cardio.intervals ? 1 : 0)} cardio sessions a week — walks, bike, swim, whatever she has — that the app schedules beside your sessions. You do not write them. Never put walking, cardio, running, cycling or intervals into an exercises array, a title, a "why" or a habit; it is already there.`,
    `- Habit tasks are yours to write: one small, concrete daily action she starts doing (e.g. "Cool the room before bed"). Cadence "daily". Name the action itself — never begin the title with "Add". Never write a habit about quitting something — that is what resist_suggestions is for.`,
    `- Never write a habit or movement task that repeats a nutrition row — no walks after meals, no water, no protein, no meal timing. She already ticks those every day; put the id in nutrition_focus instead.`,
    `- Relaxation tasks need item_id and cadence "daily" (or "per_day" with a target). Match the item to her worst symptom: hot flashes get breath_hotflash, night waking gets breath_sleep, anxiety or palpitations get breath_sigh.`,
    `- Movement tasks need an exercises array of ${minEx}-${maxEx} DIFFERENT ids — a session, not one move. Fewer than ${minEx} is a failed week.`,
    // Left to itself the model builds eight leg-and-core weeks. Measured over
    // four generations it used ZERO upper-body ids in one plan and zero
    // bone-loading ids in two — and bone is the reason a menopause plan lifts at
    // all, so an eight-week plan with none of it is missing its point rather
    // than missing some variety.
    // Only reachable on the snack cadence now. Every other level has its bone
    // loading in the power block, built in code from ids this pool no longer
    // contains — so for them `boneIds` is empty and this rule correctly
    // disappears rather than asking for something the model cannot select.
    ...(boneIds.length
      ? [
          `- Bone loading is why this plan exists: falling estrogen takes bone density with it, and the ${boneIds.join("/")} ids are the only ones here that load it. At least four of the eight weeks must include one.`,
        ]
      : []),
    // …and the other half of that. Without this the model writes "finish with
    // some gentle hops" into a session whose hops it was never given, or titles
    // a week after jumping it did not prescribe.
    ...(hasPower
      ? [
          `- Every session ends with a short bone-loading power block that the app adds for her — hops, drops and marching landings, on ${POWER_SESSIONS_PER_WEEK} of her ${vol.sessions} sessions a week. You do not write it and cannot see its ids. Never put jumping, hopping, landing or plyometric work into your exercises, your titles or your "why" lines; it is already there.`,
        ]
      : []),
    ...(upperIds.length
      ? [
          `- Every week needs at least one upper-body id (${upperIds.slice(0, 6).join(", ")}${upperIds.length > 6 ? ", …" : ""}). Squats and core alone is half a plan.`,
        ]
      : []),
    `- Across the eight weeks, use at least ${Math.min(pool.length, minEx * 3)} different exercise ids. Repeating the same four every week is not progression.`,
    ...(hasBookends
      ? [
          `- Every movement task also gets "warmup" (${BOOKEND_MIN}-${bookendMax(vol.minutes)} ids from the WARM-UP list) and "cooldown" (${BOOKEND_MIN}-${bookendMax(vol.minutes)} ids from the COOL-DOWN list), chosen for what that session actually does: warm the joints it is about to load, then release the ones it just worked. A squat session opens the hips and ankles and finishes on the glutes and hip flexors; a pressing session opens the shoulders and mid-back and finishes on the chest.`,
          `- The two lists do not overlap and neither may repeat an id from "exercises".`,
          `- These are the only two arrays of bare strings in the plan. Send them as ["W06","W09"] and ["S06","S04"], never as objects.`,
        ]
      : []),
    ``,
    `DOSE — every exercise is measured in TIME. There are no repetitions anywhere in this plan: she works for the seconds you prescribe and the app counts them down. Never write a rep count in a title or a "why". Every exercise carries "sets" and "seconds" — "seconds" is how long ONE set runs — and "minutes" is always null.`,
    ...(perSide.length
      ? [
          `- ${perSide.join(", ")} are worked one side at a time, so "seconds" is per side and the set runs twice. Keep them shorter than a both-sides move.`,
        ]
      : []),
    ``,
    `PROGRESSION — this is the point of an 8-week plan. The same exercise must not carry the same numbers in week 1 and week 8.`,
    // The absolute ladder is for a FIRST plan only.
    //
    // It used to print unconditionally, including underneath the adherence
    // block — which tells a woman who did 80% to "open week 1 near where her
    // last plan's week 6 sat", i.e. 3 sets of 45-60s. So the same prompt named
    // two different week-1 doses, four times as many words apart as the model
    // needs to forget the first one, and nothing downstream could tell which
    // rule it had followed. From cycle 2 the opening dose belongs to the
    // adherence rules, and this block only says which way to climb from there.
    ...(adherence
      ? [
          `- Open week 1 where the rules above put it, NOT at a beginner dose. She has already lived eight weeks of this.`,
          `- Climb from wherever week 1 opens: add seconds first, then a third set. Never go past 3 sets or 60 seconds a set.`,
        ]
      : ladder),
    `- Move one number at a time. Add seconds before adding a set, and never raise both in the same week.`,
    `- If you bring an exercise back in a later week, it gets the later week's dose — never a smaller one than it had before.`,
    `- Title each movement session after what is actually in it, and give all 8 weeks different titles. Never title a session after one exercise, and never repeat a title you have already used.`,
    `- Titles and focus lines are sentence case: "Steady the basics", not "Steady The Basics".`,
    `- Add difficulty gradually. Never introduce more than one new thing per week.`,
    `- "why" is one short sentence to her, in second person, tied to her symptoms. No medical claims, no dosages.`,
    `- Never write "can help", "helps with", "supports", "improves", "boosts", "promotes", "is important", "is essential", "overall health" or "overall well-being" in any "why". Those say nothing. Name what actually happens instead.`,
    `- Every task carries every field. Send "item_id": null on movement and habit tasks, and "exercises": null, "warmup": null and "cooldown": null on anything that is not movement. Inside an exercise, send null for every dose field its shape does not use, per DOSE above.`,
    ``,
    `RESIST — separately, write 4 "resist_suggestions": specific temptations SHE`,
    `is likely to face given her symptoms, each one she gets credit for resisting`,
    `for a day. Phrase each as the thing not done, concrete and time-bound where`,
    `it helps ("No sweets after 8pm", "Phone stays out of the bedroom"). Draw them`,
    `from what her symptoms actually predict — sleep trouble suggests the late`,
    `screen and the evening wine, cravings suggest the 3pm sugar. Never suggest`,
    `quitting a medication or HRT. "why" is one warm sentence, no shame, and the`,
    `banned phrases above apply to it too.`,
    ``,
    `Return JSON: {"weeks":[{"number":1,"title":"...","focus":"...","nutrition_focus":["protein_25_30g"],"tasks":[{"pillar":"movement","title":"...","why":"...","cadence":"weekly","target":2,"item_id":null,"exercises":[{"id":"...","sets":3,"seconds":40,"minutes":null},{"id":"...","sets":3,"seconds":45,"minutes":null}],"warmup":["W06","W09"],"cooldown":["S06","S04"]},{"pillar":"relaxation","title":"...","why":"...","cadence":"daily","target":1,"item_id":"breath_sleep","exercises":null,"warmup":null,"cooldown":null},{"pillar":"habit","title":"...","why":"...","cadence":"daily","target":1,"item_id":null,"exercises":null,"warmup":null,"cooldown":null}]}],"resist_suggestions":[{"title":"...","why":"..."}]}`,
  ].join("\n");
}

/**
 * Four, matching the `${minEx}-${maxEx}` the prompt asks for.
 *
 * It was three, and the prompt has always said four — so a model that sent
 * three was under the prompt's floor and exactly on the code's, and nothing
 * topped it up. Measured over four generations that was the normal case, not
 * the edge one: 28-minute sessions were arriving with three exercises in them
 * and running eighteen minutes. Two numbers for one rule is how that hid.
 */
const MIN_EXERCISES = 4;
/**
 * What makes a week a week: one movement, one relaxation, one habit. The prompt
 * asks for 3-4 and buildPlan() discards the plan below this, so sanitize() tops
 * a thin week up to it rather than letting one cost the other seven.
 */
const MIN_TASKS_PER_WEEK = 3;
/** A 5-minute burst done four times a day is two or three moves, not six. */
const MIN_SNACK_EXERCISES = 2;
const MAX_EXERCISES = 6;
/**
 * …and the ceiling has to agree with that comment. It didn't: the prompt asks a
 * snack for 2-3 ids and this file then trimmed every session to 6, so a model
 * that sent six put six exercises into five minutes and nothing caught it.
 */
const MAX_SNACK_EXERCISES = 3;

/**
 * How many movements a bookend may hold.
 *
 * Two to four. One is not a warm-up, and five is a second workout in front of
 * the workout — the thing that makes a 28-minute session quietly run 40 and
 * stops being done at all by week three.
 */
const BOOKEND_MIN = 2;

/**
 * …and the ceiling scales with the session, because four at each end does not
 * fit inside a short one.
 *
 * It was a flat 4. Measured against the catalog on 2026-08-28 that let a model
 * spend **580 seconds — nine minutes forty — of an eighteen-minute beginner
 * session** on bookends, by picking the two 90-second warm-up sequences plus two
 * per-side movements and four per-side stretches. Fifty-four percent of the
 * session she was sold, on getting ready for the session.
 *
 * Two at each end under 20 minutes, three above. A 20-minute beginner session
 * spends about 3-4 minutes on bookends; a 35-minute advanced one can afford
 * five and has enough movements in it to need them.
 */
const bookendMax = (sessionMinutes: number) => (sessionMinutes <= 20 ? 2 : 3);

/**
 * What a warm-up plus a cool-down costs a session, near enough to size the dose
 * ladder with.
 *
 * **Derived, not asserted.** It was the literal `4` while the generic pair
 * actually measured 360 seconds — six minutes — so the prompt was told a
 * beginner had 14 minutes of work when she had 12, prescribed for 14, and
 * `fitSessionToMinutes()` then quietly cut it back on essentially every
 * beginner session. The model was being set up to fail and the trim was hiding
 * it. Reading the real doses off the catalog means this cannot drift again: it
 * follows DEFAULT_WARMUP and DEFAULT_COOLDOWN wherever they go.
 *
 * A model that writes its own bookends can still land above this on a longer
 * session; `fitSessionToMinutes` is the hard backstop and measures what that
 * session will actually run.
 */
const BOOKEND_MINUTES = Math.round(
  (listSeconds(DEFAULT_WARMUP) + listSeconds(DEFAULT_COOLDOWN)) / 60
);

/**
 * The minutes left for the WORK once the bookends have taken theirs.
 *
 * The prompt sizes its dose ladder against this number, so everything that
 * writes a dose has to size against the same one — handing `vol.minutes` to
 * `defaultDoseForWeek()` would ask a 30-minute band to fill a 26-minute
 * session, which is the overrun `fitSessionToMinutes()` then has to cut back
 * out. A snack has no bookends, so for it the two numbers are the same.
 */
const workMinutesFor = (vol: (typeof MOVEMENT_VOLUME)[string]) =>
  vol.perDay ? vol.minutes : Math.max(3, vol.minutes - BOOKEND_MINUTES);

/**
 * The three progression bands, sized to the minutes she actually has.
 *
 * The rungs are ordered by what one exercise costs, so "the hardest week that
 * fits" is a search down the list rather than a formula. Weeks 6-8 land on that
 * rung, and 3-5 and 1-2 step back down it — which keeps the shape of the ladder
 * (add seconds before adding a set) identical at every session length, and only
 * moves where it starts and stops.
 *
 * **The steps back are one and three rungs, not two and four** (2026-08-29).
 * The wider spacing put week 1 at 61-70% of the minutes she was sold — a
 * medium user opening on 14:50 against "30-40 min, 3 days a week". The clock
 * is the promise and the dose is the progression: her week 1 should be the
 * length she chose at a shorter set, not a shorter session. Measured after,
 * week 1 lands at 76-92% and week 8 still climbs in intensity.
 *
 * Every level still progresses. A five-minute snack goes 2x20 -> 2x25 -> 2x40,
 * which is modest and honest; the alternative was a week 8 she cannot do, and a
 * dose she cannot do is a dose she does not do.
 */
function doseLadder(workMinutes: number, exerciseCount: number, maxExercises: number): string[] {
  // Same table the code's own top-up reads, so the exercises the model writes
  // and the ones we add to fill the session carry the same dose. See DOSE_RUNGS.
  const [[loSets, loSecs], [midSets, midSecs], [hiSets, hiSecs]] = doseBands(
    workMinutes,
    exerciseCount
  );
  return [
    `- Weeks 1-2: ${loSets} sets, ${loSecs} seconds per set.`,
    `- Weeks 3-5: ${midSets} sets, ${midSecs} seconds per set.`,
    `- Weeks 6-8: ${hiSets} sets, ${hiSecs} seconds per set.`,
    // The old version of this line read "Those are the ceiling, not a starting
    // point to build on", which the model obeyed exactly: it wrote doses UNDER
    // the bottom rung, and a medium week 1 measured 14:50 against the 30
    // minutes she was sold. The line was written to stop overrun and it bought
    // that at the price of under-delivery on the first session she ever does,
    // which is the one that decides whether she believes the product. Say the
    // length is a target to fill, and let fitSessionToMinutes() be the ceiling
    // — that is what it is for, and it cannot be argued with.
    `- Her session is ${workMinutes} minutes of work. FILL it: with ${exerciseCount}-${maxExercises} exercises at the week's dose above it should come out close to ${workMinutes} minutes, in week 1 as much as in week 8. A week 1 that runs half the length she chose is a failed week, not a gentle one — week 1 is gentler because the sets are shorter, never because the session is.`,
    `- Do not go under the doses above to be cautious, and do not go over them to be ambitious. Anything larger is trimmed back before she sees it.`,
  ];
}

/**
 * Habit titles that restate a nutrition row.
 *
 * The prompt forbids these in as many words and the model writes them anyway —
 * "Take a 5-minute walk after meals", "Drink a glass of water before meals" —
 * which puts one job on her list twice, in two places, with two streaks. It is
 * caught here for the same reason exercise ids are: a rule the model can opt out
 * of is not a rule. The offender is swapped for a written habit rather than
 * dropped, because dropping it can leave the week under three tasks and throw
 * away an otherwise good plan.
 */
const NUTRITION_ECHO =
  /\b(protein|water|hydrat\w*|fib(?:er|re)|healthy fats?|snack\w*|fasting|fast\b|between meals|before (?:a |your )?meals?|after (?:you )?eat\w*|after (?:a |your |each )?meals?|after (?:breakfast|lunch|dinner)|supplements?|omega|magnesium|vitamin)\b/i;

/**
 * A movement title when the model sent none, named after what is in the session.
 *
 * Two exercises, not one — the prompt's own rule is never to title a session
 * after a single movement, and the same reasoning applies to our fallback.
 */
function movementTitle(exercises: readonly StoredExercise[], week: number): string {
  const names = exercises
    .map((e) => getExercise(e.id)?.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2);
  if (names.length >= 2) {
    const [a, b] = names;
    return `${a} and ${b.charAt(0).toLowerCase()}${b.slice(1)}`;
  }
  return names[0] ?? FALLBACK_WEEKS[(week - 1) % FALLBACK_WEEKS.length][0];
}

/** Rotates a list by `n`, so each week tops up from a different starting point. */
const rotate = <T>(items: T[], n: number): T[] =>
  items.length ? [...items.slice(n % items.length), ...items.slice(0, n % items.length)] : items;

/**
 * Stable sort putting exercises that have a clip first.
 *
 * Applied only where the CODE chooses an exercise — the top-up and the bone
 * substitution — never to the pool itself. An id with no clip is still a real
 * exercise and the model may pick it; she gets the name and the props, which is
 * a deliberate-looking fallback. But when we are the ones choosing, and the
 * choice is between two exercises that both fit, there is no reason to hand her
 * the one she can't watch. Six of the forty-two are unshot today, and this makes
 * them the last resort rather than a coin toss.
 */
const filmedFirst = (items: Exercise[]): Exercise[] => [
  ...items.filter((e) => exerciseMedia(e.id)),
  ...items.filter((e) => !exerciseMedia(e.id)),
];

/**
 * Turns the model's bookend id list into stored exercises, dosed from the
 * catalog.
 *
 * `taken` carries every id already spent in this session — the main work, then
 * the warm-up — so a cool-down cannot repeat what she has just done and the two
 * bookends cannot be the same two moves. Returns undefined rather than `[]` on
 * an empty result, because `sessionWarmup()` reads absence as "use the generic
 * one" and an empty array as "she has a warm-up with nothing in it".
 */
function bookendFrom(
  ids: readonly string[] | null | undefined,
  allowedWarm: Set<string>,
  taken: Set<string>,
  max: number
): StoredExercise[] | undefined {
  const out: StoredExercise[] = [];
  for (const raw of ids ?? []) {
    if (out.length >= max) break;
    const id = raw.trim().toUpperCase();
    if (!allowedWarm.has(id) || taken.has(id)) continue;
    const ex = getExercise(id);
    if (!ex) continue;
    taken.add(id);
    // Dose from the catalog, never from the model — see TaskSchema.
    out.push({ id, sets: 1, seconds: ex.seconds });
  }
  return out.length ? out : undefined;
}

/**
 * The snack cadence is the one that gets no power block, so its bone loading
 * stays where it always was: in the main list, as ordinary work (see
 * `allowedExercises`).
 *
 * **Every week, and added before it is substituted.** It used to run on even
 * weeks only and always by replacement, which is the pair of faults
 * `ensureBoneLoading()` was deleted for, surviving in the one branch that
 * still needed a backstop: four of eight weeks covered, and each of those four
 * bought at the price of a strength movement. A snack user is the one who
 * trains most often and she was getting the least bone loading of anyone. Now
 * the guarantee is 8 of 8, and the swap only happens when her five minutes
 * genuinely cannot hold another movement — which is the honest reason to take
 * one out, unlike "it is an even week".
 */
function ensureSnackBone(
  work: StoredExercise[],
  n: number,
  pool: Exercise[],
  vol: (typeof MOVEMENT_VOLUME)[string],
  workMinutes: number
): void {
  const floor = MIN_SNACK_EXERCISES;
  const exerciseCeiling = MAX_SNACK_EXERCISES;
  if (!vol.perDay || !work.length || work.some((e) => isPowerId(e.id))) return;
  const bone = filmedFirst(pool.filter((e) => isPowerId(e.id)));
  const pick = bone[(n - 1) % (bone.length || 1)];
  if (!pick) return;
  const added = { id: pick.id, ...defaultDoseForWeek(pick, n, workMinutes, floor) };
  if (work.length < exerciseCeiling && listSeconds([...work, added]) <= vol.minutes * 60) {
    work.push(added);
    return;
  }
  // No room, so it takes the last movement's place — at its OWN dose, not the
  // one it is replacing. Inheriting `sets`/`seconds` looks conservative and
  // is not: rest and per-side are properties of the movement, so a per-side
  // hop wearing a both-sides dose costs double and pushed a five-minute snack
  // to 5:10. Re-fit afterwards, because a swap can only be safe if something
  // measures it.
  work[work.length - 1] = added;
  work.splice(0, work.length, ...fitSessionToMinutes(work, 0, vol.minutes, floor));
}


/**
 * The cardio sessions for one week, written the same way on both paths.
 *
 * A separate task rather than an exercise inside the strength session, and a
 * separate task rather than a second "movement" the model writes: `cadence`
 * and `target` on a model-written movement task are overwritten from
 * `MOVEMENT_VOLUME`, so a second one would double her strength week, which is
 * exactly why one-movement-task-per-week was a rule. Cardio has its own volume
 * table (`CARDIO_VOLUME`) and its own keys (`w3_cardio`, `w3_intervals`), so it
 * sits beside that rule rather than breaking it.
 *
 * Pillar stays `movement`: the app draws three rings and the history averages
 * every movement task's ratio into one, so a week she walked and did not lift
 * scores as half a movement week, which is what it was.
 *
 * No bookends and no power block — `wantsBookends()` and `sessionPower()` both
 * read a cardio-only task as wanting neither, and a walk warms up by being a
 * walk for the first five minutes.
 */
function cardioTasks(fitnessLevel: string | null, n: number): PlanTask[] {
  const { zone2, intervals } = cardioForWeek(fitnessLevel, n);
  const out: PlanTask[] = [];
  if (zone2.sessions > 0) {
    out.push({
      key: "cardio",
      pillar: "movement",
      title: getExercise(ZONE2_ID)?.name ?? "Zone 2 cardio",
      why: CARDIO_WHY[(n - 1) % CARDIO_WHY.length],
      cadence: "weekly",
      target: zone2.sessions,
      exercises: [{ id: ZONE2_ID, minutes: zone2.minutes }],
    });
  }
  if (intervals) {
    out.push({
      key: "intervals",
      pillar: "movement",
      title: getExercise(INTERVALS_ID)?.name ?? "Sprint intervals",
      why: INTERVALS_WHY[(n - 1) % INTERVALS_WHY.length],
      cadence: "weekly",
      target: 1,
      exercises: [{ id: INTERVALS_ID, minutes: intervalsMinutes() }],
    });
  }
  return out;
}

/**
 * Written reasons for the cardio tasks, one per week. Same rules as
 * PILLAR_WHY: run anything new past STOCK_PHRASES first, because the gate does
 * not check its own copy.
 */
const CARDIO_WHY = [
  "Your heart is the organ estrogen was quietly protecting. This is you taking that job over.",
  "A pace where you can talk but not sing is where the heart gets stronger without the stress hormones climbing.",
  "Twenty steady minutes teaches the same nervous system that runs a hot flash how to settle.",
  "This is the one pillar that asks nothing of your knees and gives the most back to your heart.",
  "Walking is where the sugar from lunch goes, and where the 3pm slump does not.",
  "The point is the minutes, not the miles. Any pace you could hold a conversation at counts.",
  "Sleep comes easier to a body that was warm and moving in daylight.",
  "Eight weeks of this is what turns stairs and hills back into things you do not notice.",
];

const INTERVALS_WHY = [
  "Three short hard efforts, once a week, is the cheapest thing you can do for your heart — and it is over in twenty minutes.",
  "Going hard for thirty seconds and easing off is what teaches your heart to recover fast, which is the whole skill.",
  "One hard day a week. The easy ones build the base; this is the one that raises the ceiling.",
];

/**
 * Drops anything the model invented, repairs what it got wrong, and adds the
 * segments it never sees (the power block, the cardio tasks). Also assigns the
 * stable task keys — the model never sees those either.
 */
function sanitize(
  raw: z.infer<typeof PlanSchema>,
  pool: Exercise[],
  vol: (typeof MOVEMENT_VOLUME)[string],
  profile: Profile,
  powerPool: Exercise[]
): Plan {
  const workMinutes = workMinutesFor(vol);
  const allowed = new Set(pool.map((e) => e.id));
  const allowedWarm = new Set(allowedWarmups().map((e) => e.id));
  const allowedCool = new Set(allowedCooldowns().map((e) => e.id));
  const topProblems = profile.top_problems ?? [];

  // Parse each week on its own, and repair the two fields the model breaks: a
  // number outside 1..PLAN_WEEKS is replaced by the week's position in the
  // array, and an empty title by the written one for that week.
  const parsedWeeks = raw.weeks.flatMap((rawWeek, i) => {
    const p = WeekSchema.safeParse(rawWeek);
    if (!p.success) return [];
    const declared = p.data.number;
    const number =
      declared && declared >= 1 && declared <= PLAN_WEEKS ? declared : i + 1;
    return [{
      ...p.data,
      number,
      title: p.data.title || FALLBACK_WEEKS[(number - 1) % FALLBACK_WEEKS.length][0],
      tasks: p.data.tasks ?? [],
    }];
  });

  const weeks: PlanWeek[] = [];
  /**
   * Every week title and every session title used so far, lowercased.
   *
   * The prompt asks for eight different titles in as many words ("never repeat
   * a title you have already used") and the model repeats them anyway —
   * measured on a live advanced plan, "Full body strength session" was weeks 3,
   * 6 and 8. On her phone that is an eight-week plan that looks like the same
   * workout copied out, which is the one thing a personalized plan cannot look
   * like. Same rule as everywhere else in this file: a rule the model can opt
   * out of is not a rule, so it is repaired here instead.
   */
  const usedTitles = new Set<string>();
  /** Takes `title` if it is new, otherwise the first alternative that is. */
  const uniqueTitle = (title: string, ...alternatives: string[]): string => {
    for (const candidate of [title, ...alternatives]) {
      const key = candidate.trim().toLowerCase();
      if (!key || usedTitles.has(key)) continue;
      usedTitles.add(key);
      return candidate;
    }
    return title;
  };

  const genericBookendSeconds = vol.perDay
    ? 0
    : listSeconds(DEFAULT_WARMUP) + listSeconds(DEFAULT_COOLDOWN);
  const exerciseFloor = vol.perDay ? MIN_SNACK_EXERCISES : MIN_EXERCISES;
  const exerciseCeiling = vol.perDay ? MAX_SNACK_EXERCISES : MAX_EXERCISES;

  /** The bone-loading block. Undefined on a snack, which has no segment for it. */
  const powerFor = (work: StoredExercise[], n: number) =>
    vol.perDay || !work.length ? undefined : buildPowerBlock(powerPool, n, powerMinutes(vol));

  /**
   * A whole movement session, built from her pool alone.
   *
   * For the week the model gave no movement task at all. Measured live on a
   * beginner plan: week 8 came back with a relaxation task and a habit and no
   * workout, the top-up below filled it to three tasks with another habit, and
   * the completeness gate in buildPlan() — which counts tasks, not pillars —
   * waved through an eight-week exercise plan whose last week had no exercise
   * in it. A week without the pillar she bought is not a thin week, it is a
   * missing one.
   */
  function sessionFromPool(n: number): StoredExercise[] {
    const picks: StoredExercise[] = [];
    for (const cand of filmedFirst(rotate(pool, n))) {
      if (picks.length >= exerciseCeiling) break;
      const extra = { id: cand.id, ...defaultDoseForWeek(cand, n, workMinutes, exerciseFloor) };
      if (
        picks.length >= exerciseFloor &&
        listSeconds([...picks, extra]) + genericBookendSeconds > vol.minutes * 60
      ) continue;
      picks.push(extra);
    }
    const work = fitSessionToMinutes(picks, genericBookendSeconds, vol.minutes, exerciseFloor);
    ensureSnackBone(work, n, pool, vol, workMinutes);
    return work;
  }

  for (let n = 1; n <= PLAN_WEEKS; n++) {
    const w = parsedWeeks.find((x) => x.number === n);
    if (!w) continue;

    const tasks: PlanTask[] = [];
    // Practices already placed this week, so a repaired task doesn't duplicate
    // the one sitting next to it.
    const usedRelaxation = new Set<string>();
    /**
     * One movement task per week, and the second one is dropped rather than
     * merged.
     *
     * `cadence` and `target` are overwritten from MOVEMENT_VOLUME on every
     * movement task, so two of them do not split her week between them — they
     * each ask for the full `vol.sessions`, and each gets its own power block.
     * A medium user with two movement tasks is being asked for six sessions
     * and twice the impact loading against a plan that sold her three. Nothing
     * downstream can tell the difference, because a doubled ask is
     * indistinguishable from an ambitious one.
     *
     * Dropping is safe: the week still needs MIN_TASKS_PER_WEEK, and the
     * top-up below refills it with a relaxation practice or a written habit —
     * both of which are things she can actually add to a day, unlike a second
     * workout.
     */
    let movementPlaced = false;
    for (const rawTask of w.tasks) {
      const parsed = TaskSchema.safeParse(rawTask);
      if (!parsed.success) continue;
      const t = parsed.data;
      const base = { key: "", pillar: t.pillar, title: t.title, why: taskWhy(t.why, t.pillar, n), cadence: t.cadence, target: t.target };

      if (t.pillar === "movement") {
        if (movementPlaced) continue;
        const exercises: NonNullable<PlanTask["exercises"]> = (t.exercises ?? [])
          .filter((e) => allowed.has(e.id))
          .map((e) => ({
            id: e.id,
            sets: e.sets ?? undefined,
            seconds: e.seconds ?? undefined,
            minutes: e.minutes ?? undefined,
          }));

        // The model routinely returns a single exercise however firmly it's
        // asked for more, which is not a session. Top up from her own pool —
        // her *first* exercise's family first (the id prefix is the movement
        // pattern), so a squat day gets more legs rather than a neck stretch
        // bolted onto it. The title the model wrote describes that first pick,
        // and this is what keeps the title honest.
        //
        // An empty array is filled from the pool rather than dropping the task:
        // under the strict schema the ids can't be invalid, so empty means the
        // model simply sent none, and a session built from her own pool is
        // worth more than the week losing a task. Only an empty *pool* — which
        // would mean no exercise is safe for her — leaves it unfixable.
        const used = new Set(exercises.map((e) => e.id));
        const family = exercises[0]?.id[0];
        const candidates = filmedFirst(
          family
            ? [
                ...rotate(pool.filter((e) => e.id[0] === family), n),
                ...rotate(pool.filter((e) => e.id[0] !== family), n),
              ]
            : rotate(pool, n)
        );
        for (const cand of candidates) {
          if (exercises.length >= exerciseFloor) break;
          if (used.has(cand.id)) continue;
          used.add(cand.id);
          // Same ladder the prompt asks the model for, so a topped-up exercise
          // matches the intensity of the ones it is sitting next to.
          exercises.push({ id: cand.id, ...defaultDoseForWeek(cand, n, workMinutes, exerciseFloor) });
        }
        if (!exercises.length) continue;

        const capped = exercises.slice(0, exerciseCeiling);

        // Bookends, and only on a session that wants them. `wantsBookends()`
        // already refuses to draw a generic warm-up onto a movement snack —
        // four five-minute bursts a day with two minutes of hip circles in
        // front of each is a 40% tax on the thing she agreed to do four times.
        // Writing one into the stored plan would route straight past that
        // check, so the same rule is applied here at the source.
        const taken = new Set(capped.map((e) => e.id));
        const maxBookend = bookendMax(vol.minutes);
        // Below BOOKEND_MIN is not a bookend, so it is dropped here rather than
        // further down. It used to be dropped only at the point of writing the
        // task, while `bookendSeconds` below was still measured off the short
        // list — so a session whose model-written warm-up had ONE usable id was
        // budgeted against 40 seconds and then shown the 120-second generic pair
        // at read time, because `sessionWarmup()` reads an absent field as "use
        // the default". The session was fitted to a warm-up it would never run,
        // and overran by the difference. Resolve the fallback once, here, and
        // every number below is measured against what her phone will show.
        const atLeastMin = (list: StoredExercise[] | undefined) =>
          list && list.length >= BOOKEND_MIN ? list : undefined;
        const warmup = vol.perDay
          ? undefined
          : atLeastMin(bookendFrom(t.warmup, allowedWarm, taken, maxBookend));
        const cooldown = vol.perDay
          ? undefined
          : atLeastMin(bookendFrom(t.cooldown, allowedCool, taken, maxBookend));

        // The session has to fit the minutes she was sold. Everything above this
        // line decides WHAT is in it; this decides how much of it there is room
        // for, and it is the last word — see fitSessionToMinutes() for why the
        // cuts happen in the order they do. Measured against the bookends this
        // session will actually run, generic ones included, because that is what
        // her phone will put on the clock.
        const bookendSeconds = vol.perDay
          ? 0
          : listSeconds(warmup ?? DEFAULT_WARMUP) + listSeconds(cooldown ?? DEFAULT_COOLDOWN);

        // The other half of the same promise. Trimming an over-long session is
        // the safety half; this is the value half — she was sold 28 minutes, and
        // a model that sends three short exercises hands her eighteen and calls
        // it a plan. Fill toward the length she chose while there is room for a
        // whole extra exercise, from her own pool, at the week's own dose.
        const roomFor = (list: StoredExercise[], extra: StoredExercise) =>
          listSeconds([...list, extra]) + bookendSeconds <= vol.minutes * 60;
        for (const cand of candidates) {
          if (capped.length >= exerciseCeiling) break;
          if (used.has(cand.id)) continue;
          const extra = { id: cand.id, ...defaultDoseForWeek(cand, n, workMinutes, exerciseFloor) };
          if (!roomFor(capped, extra)) continue;
          used.add(cand.id);
          capped.push(extra);
        }

        const work = fitSessionToMinutes(capped, bookendSeconds, vol.minutes, exerciseFloor);

        // The power block, on its OWN budget on top of everything above.
        //
        // Deliberately measured after `work` rather than alongside it: the
        // block lives in the gap between `vol.minutes` and `vol.maxMinutes`, so
        // nothing it costs can take a set or an exercise away from the session
        // she was sold. That is the whole reason the volume became a band.
        //
        // Skipped on a snack, as the bookends are — four five-minute bursts a
        // day do not each get plyometrics bolted on.
        ensureSnackBone(work, n, pool, vol, workMinutes);
        const power = powerFor(work, n);

        // Volume is a rule keyed off her fitness level, not something the model
        // gets a vote on — it kept sending "daily x7" and "per_day x1".
        tasks.push({
          ...base,
          key: "movement",
          // Named after the two movements in it when the model's own title is
          // missing OR already spent — both are the same failure to her.
          title: uniqueTitle(base.title || movementTitle(work, n), movementTitle(work, n)),
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises: work,
          // Already filtered by atLeastMin() above, so what was measured is
          // exactly what is stored.
          ...(warmup ? { warmup } : {}),
          ...(cooldown ? { cooldown } : {}),
          // Never one without the other: a block with no frequency is a block
          // the app cannot schedule, and a frequency with no block is a heading.
          ...(power ? { power, powerSessions: Math.min(POWER_SESSIONS_PER_WEEK, vol.sessions) } : {}),
        });
        movementPlaced = true;
        continue;
      }

      // Everything else is a daily habit; only per_day carries a real target.
      const perDay = t.cadence === "per_day";
      const daily = { ...base, cadence: perDay ? ("per_day" as const) : ("daily" as const), target: perDay ? Math.min(t.target, 6) : 1 };

      if (t.pillar === "relaxation") {
        // A named id that isn't in the catalog is repaired, not dropped. This
        // used to `continue`, and it was the single most expensive line in the
        // file: the model reads "relaxation" and reaches for a stretch (`M03`),
        // the task disappears, the week is left with two, and buildPlan()
        // throws away all eight weeks for the deterministic plan. One word
        // association cost the whole personalized plan. The strict schema
        // should now make this unreachable — this is the belt to its braces.
        // `usedRelaxation` gates the model's own choice too, not just the
        // repair. It used to gate only the fallback, so two relaxation tasks
        // naming the SAME item_id produced two tasks with the same catalog id
        // — and the key below is built from that id, so the week ended up with
        // two rows carrying the identical `w3_breath_sleep`. On her phone that
        // is a visible duplicate whose two ticks write to one log row, so
        // completing either completes both. The prompt actively invites two
        // relaxation tasks ("routine can carry two from the start"), which is
        // what makes this reachable rather than theoretical.
        const named = t.item_id ?? "";
        const item =
          isRelaxationId(named) && !usedRelaxation.has(named)
            ? RELAXATION.find((r) => r.id === named)!
            : relaxationForSymptom(topProblems, usedRelaxation);
        usedRelaxation.add(item.id);
        // The catalog label wins over whatever the model typed, so the app and
        // the funnel always use the same words for the same practice.
        tasks.push({ ...daily, key: item.id, title: item.label });
        continue;
      }

      // A habit that restates a nutrition row is replaced, not kept — see
      // NUTRITION_ECHO. The written substitute is indexed by week so a plan
      // with two offenders doesn't get the same replacement twice.
      if (NUTRITION_ECHO.test(daily.title)) {
        tasks.push({
          ...daily,
          title: FALLBACK_HABITS[(n - 1) % FALLBACK_HABITS.length],
          why: pillarWhy("habit", n),
        });
        continue;
      }
      tasks.push({
        ...daily,
        title: daily.title || FALLBACK_HABITS[(n - 1) % FALLBACK_HABITS.length],
      });
    }

    // No movement task at all — build her one. This runs before the top-up
    // below, so the week is counted with its workout already in it.
    if (tasks.length && !movementPlaced) {
      const work = sessionFromPool(n);
      if (work.length) {
        const power = powerFor(work, n);
        tasks.unshift({
          key: "movement",
          pillar: "movement",
          title: uniqueTitle(movementTitle(work, n), FALLBACK_WEEKS[(n - 1) % FALLBACK_WEEKS.length][0]),
          why: pillarWhy("movement", n),
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises: work,
          ...(power ? { power, powerSessions: Math.min(POWER_SESSIONS_PER_WEEK, vol.sessions) } : {}),
        });
        movementPlaced = true;
      }
    }

    // A week the model left short is topped up rather than sunk. Below three
    // tasks buildPlan() discards all eight weeks for the deterministic plan, so
    // the cost of one thin week is the whole product being less personalised —
    // wildly out of proportion to a missing habit line. Relaxation first (it is
    // matched to her worst symptom), then a written habit.
    while (tasks.length && tasks.length < MIN_TASKS_PER_WEEK) {
      if (!tasks.some((t) => t.pillar === "relaxation")) {
        const item = relaxationForSymptom(topProblems, usedRelaxation);
        usedRelaxation.add(item.id);
        tasks.push({ key: item.id, pillar: "relaxation", title: item.label, why: pillarWhy("relaxation", n), cadence: "daily", target: 1 });
        continue;
      }
      const used = new Set(tasks.map((t) => t.title));
      const habit = FALLBACK_HABITS.find((h) => !used.has(h)) ?? FALLBACK_HABITS[(n - 1) % FALLBACK_HABITS.length];
      tasks.push({ key: "", pillar: "habit", title: habit, why: pillarWhy("habit", n), cadence: "daily", target: 1 });
    }

    // The cardio sessions, after the top-up so they never stand in for a
    // missing relaxation practice or habit. Same on both paths — see
    // cardioTasks().
    if (tasks.length) tasks.push(...cardioTasks(profile.fitness_level, n));

    if (tasks.length) {
      // Keys must be unique within a week and stable forever. Relaxation takes
      // its catalog id as the suffix so the key says which practice it is; the
      // week prefix stays on, so the same practice in week 1 and week 6 is two
      // keys. Nothing derives a cross-week streak from a plan task (only
      // nutrition and her own habits get streaks), so that is fine — but a
      // per-task streak would need the prefix dropped and hydrateRelaxation
      // taught to parse the bare id.
      weeks.push({
        number: n,
        // FALLBACK_WEEKS has eight distinct titles and n never repeats, so the
        // alternative is guaranteed to be free.
        title: uniqueTitle(w.title, FALLBACK_WEEKS[(n - 1) % FALLBACK_WEEKS.length][0]),
        focus: w.focus,
        // A week with no valid focus still shows all ten; it just doesn't
        // highlight any, which is a worse week, not a broken one.
        nutritionFocus: (w.nutrition_focus ?? []).filter(isNutritionId).slice(0, 2),
        tasks: tasks.map((t, i) => ({ ...t, key: `w${n}_${t.key || `${t.pillar}${i}`}` })),
      });
    }
  }

  // A resist line whose reason is a stock hedge is dropped, not shown. Unlike a
  // task, one of these costs nothing to lose — buildPlan tops the list back up
  // from FALLBACK_RESIST, which is written.
  const resistSuggestions = (raw.resist_suggestions ?? []).flatMap((r) => {
    const parsed = ResistSchema.safeParse(r);
    if (!parsed.success || STOCK_PHRASES.test(parsed.data.why)) return [];
    return [parsed.data];
  });

  return { weeks, resistSuggestions: resistSuggestions.slice(0, RESIST_TARGET) };
}

// ─── Nutrition: why each row is on her list ─────────────────────────────────

/**
 * The ten reasons, rewritten for her.
 *
 * This is a **separate call** from the plan. Asked for as one more clause of
 * the plan prompt, gpt-4o-mini returned ten interchangeable stock lines
 * ("Walking after meals can aid digestion and support weight management") no
 * matter how firmly the tone rules were worded — there is too much else in that
 * prompt for them to survive. On its own, with the catalog sentence in front of
 * it as the standard, it writes to her instead.
 *
 * The catalog sentence is the anchor on purpose: the mechanism stays ours,
 * written and reviewable, and the model's job is to say that mechanism in the
 * terms of *her* symptoms. It is the same bargain as the exercise catalog —
 * the model personalises, it does not decide the medicine.
 */
function buildWhyPrompt(profile: Profile): string {
  return [
    `Woman in menopause. She sees these ten nutrition habits every day and can`,
    `tap any of them to read why it is on her list. Rewrite each reason for her.`,
    ``,
    `Her answers:`,
    `- Symptoms, worst first: ${profile.top_problems?.join(", ") || "general menopause symptoms"}`,
    `- Goals, most important first: ${profile.goals?.join(", ") || profile.goal || "feeling like herself again"}`,
    `- Stage: ${profile.here_for ?? "unknown"} · onset: ${profile.menopause_type ?? "unknown"}`,
    `- Age: ${profile.age_band ?? "unknown"} · HRT: ${profile.hrt_status ?? "unknown"}`,
    `- Eating right now: ${profile.nutrition_style ?? "unknown"}`,
    ``,
    `The habits, each with the reason as we would write it:`,
    ...NUTRITION.map((n) => `${n.id} — ${n.label}: "${n.why}"`),
    ``,
    `Rules:`,
    `- Keep the mechanism of the reference sentence. You are changing who it is`,
    `  written to, not what is true. Never contradict it.`,
    `- Connect it to her symptoms and goals where it honestly connects. Where it`,
    `  doesn't, say the mechanism plainly rather than forcing a link.`,
    `- Write to her, as "you". 120-220 characters. One or two real sentences.`,
    `- Say the specific thing. "Ten minutes of walking gives the meal you just ate`,
    `  somewhere to go, so the rise is a slope instead of a spike" is the standard.`,
    `  "Walking after meals can aid digestion and support weight management" is a`,
    `  failure — vague, stock, and it tells her nothing she hadn't assumed.`,
    `- Never write "can help", "supports", "is essential", "is important",`,
    `  "promotes", "boosts", "overall health" or "overall well-being". Those are`,
    `  what generic health copy sounds like. Give the mechanism instead.`,
    `- Vary the openings. No two of the ten may start the same way.`,
    `- Never promise an outcome, never give a dosage, never name a condition she`,
    `  hasn't mentioned, never tell her to start or stop a medication or HRT, and`,
    `  never imply she should have been doing this already.`,
    ``,
    `Return JSON keyed by id: {${NUTRITION.map((n) => `"${n.id}":"..."`).join(",")}}`,
  ].join("\n");
}

/**
 * The stock-phrase list from the prompt, enforced. A model that ignores the
 * tone rules gets that row dropped rather than shipped — she is better served
 * by our sentence than by a worse rewrite of it.
 */
/**
 * Also applied to `resist_suggestions[].why` and, since it was wired to them,
 * every task `why` — see `taskWhy()`. The modal hedge ("can help", "can
 * improve", "may reduce") is the real tell: it is what a model writes when it
 * has been asked for a reason and has none, and it was in half of every resist
 * line the model produced before this gate existed.
 *
 * **The bare verbs are banned too, not just the modal ones.** The first version
 * of this pattern only caught "can help" and "helps to improve", so "Building
 * strength helps with energy levels", "A cooler room helps you sleep better"
 * and "Combining movements enhances overall strength" all walked through it —
 * 12 of the 22 reasons in one live plan. They fail for exactly the same reason
 * the modal ones do: "helps" is a claim of direction with the mechanism left
 * out, and the mechanism is the whole product. `overall` is here on the same
 * grounds — "overall energy", "overall strength", "overall health" are the
 * three ways of saying nothing that this voice reaches for first.
 *
 * The cost of a false positive is one written sentence instead of a model's, so
 * the pattern is deliberately blunt. If a genuinely good line is ever caught by
 * it, rewrite the line — do not loosen the gate.
 */
const STOCK_PHRASES =
  /\b(?:(?:can|may|will) (?:help|improve|enhance|reduce|support|boost|prevent|promote)|help(?:s|ing)?\b|enhanc(?:e|es|ed|ing)\b|aids?\b|supports?\b|is (?:essential|important|key|vital|crucial)|promotes?|boosts?|overall\b)/i;
const MIN_WHY_CHARS = 90;
const MAX_WHY_CHARS = 240;

/**
 * What a task's reason falls back to, by pillar, when the model's own is stock.
 *
 * **One per week, not one per pillar.** The gate below fires on almost every
 * reason the model writes — 24 of 24 on the first live run after it was wired
 * up — so this is not an occasional patch, it is the copy she actually reads.
 * A three-line rotation made weeks 1, 4 and 7 identical, which reads as a
 * template rather than a plan. Eight means her eight weeks each say something
 * different, and a model line that clears the gate is a bonus rather than the
 * load-bearing case.
 *
 * These are also what `fallbackPlan()` writes, so the deterministic plan and a
 * repaired one speak with one voice.
 *
 * Adding a line: run it past STOCK_PHRASES first. The gate does not check its
 * own fallbacks, so a hedge written in here ships forever and silently.
 */
const PILLAR_WHY: Record<Pillar, string[]> = {
  movement: [
    "Muscle and bone respond fastest to steady, repeatable work.",
    "Strength is the one thing falling estrogen takes that you can put back yourself.",
    "Loading a joint on purpose is what keeps it willing to be loaded by accident.",
    "Bone rebuilds where it is asked to carry something. This is the asking.",
    "Muscle is where the sugar from a meal goes. More of it, and the meal lands softer.",
    "The strength you build now is what makes the next twenty years of stairs unremarkable.",
    "Two sessions you actually do beat five you plan. That is the whole design.",
    "Your legs and your back are the two that fade first and come back fastest.",
  ],
  relaxation: [
    "Lowering the background stress softens the symptoms sitting on top of it.",
    "A slow exhale is the one switch you can reach for from the inside.",
    "Your nervous system reads your breathing before it reads your day.",
    "Cortisol and hot flashes share a trigger, and this is where you get between them.",
    "Two minutes now is cheaper than the hour you lose at 3am.",
    "You cannot think your way calm, but you can breathe your way there.",
    "The point is not relaxing. It is teaching your body that it is allowed to.",
    "Doing it before you need it is what makes it work when you do.",
  ],
  habit: [
    "Small, and it holds the rest of the day together.",
    "One decision made in the morning, so the evening does not have to make it.",
    "It costs almost nothing on the day, and it compounds across the eight weeks.",
    "The you at 10pm has less willpower than the you at 8am. This is the 8am one deciding.",
    "Nothing here needs motivation — only that it stays easy enough to repeat.",
    "One thing every day is worth more than five things this week.",
    "A habit does not have to be impressive. It has to survive a bad Tuesday.",
    "You are not adding to your day. You are changing one thing already in it.",
  ],
};

/** The written reason for this pillar in this week. Wraps past week 8. */
const pillarWhy = (pillar: Pillar, week: number) =>
  PILLAR_WHY[pillar][(week - 1) % PILLAR_WHY[pillar].length];

const taskWhy = (why: string, pillar: Pillar, week: number) =>
  STOCK_PHRASES.test(why) ? pillarWhy(pillar, week) : why;

function usableWhy(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (clean.length < MIN_WHY_CHARS || clean.length > MAX_WHY_CHARS) return null;
  if (STOCK_PHRASES.test(clean)) return null;
  return clean;
}

/**
 * Her ten reasons, always complete: anything the model skipped, invented, or
 * wrote badly falls back to the catalog's own sentence. The row she taps must
 * never open on nothing, and a gap here would stay invisible until she tapped
 * that exact row weeks later.
 */
function nutritionWhy(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of NUTRITION) {
    out[item.id] = usableWhy(raw?.[item.id]) ?? item.why;
  }
  return out;
}

/** Never throws and never returns a partial map — the plan must not fail over copy. */
async function buildNutritionWhy(
  openai: OpenAI,
  profile: Profile,
  meter: PlanMeter
): Promise<Record<string, string>> {
  try {
    const startedAt = Date.now();
    const completion = await openai.chat.completions.create({
      model: PLAN_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Lisa, a warm, evidence-informed menopause companion. You explain why a habit is on a woman's list, in her terms, using the mechanism you are given. Plain language, no stock health-copy phrases, no promises. Return JSON only.",
        },
        { role: "user", content: buildWhyPrompt(profile) },
      ],
    });
    await recordLlmUsage({
      userId: meter.userId,
      runId: meter.runId,
      kind: "plan_nutrition_why",
      model: PLAN_MODEL,
      usage: completion.usage,
      durationMs: Date.now() - startedAt,
    });
    const raw = completion.choices[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;
    return nutritionWhy(parsed && typeof parsed === "object" ? parsed : null);
  } catch (err) {
    console.error("Plan: nutrition why generation failed, using catalog copy:", err);
    return nutritionWhy(null);
  }
}

// ─── Deterministic fallback ─────────────────────────────────────────────────

const FALLBACK_WEEKS: [string, string][] = [
  ["Get your baseline", "Start gently and see where you're at."],
  ["Find your rhythm", "Repeat week 1 so it starts to feel normal."],
  ["Steady your days", "Add one thing that holds the rest together."],
  ["Build a little", "Slightly more movement, same easy structure."],
  ["Keep the momentum", "You've got a routine now — protect it."],
  ["Go a bit further", "Push gently where you feel strongest."],
  ["See the change", "Look back at what's actually shifted."],
  ["Lock it in", "Keep only what worked, and make it yours."],
];

/**
 * Also the replacement pool for a habit that restated a nutrition row, so no
 * entry here may be one — nothing about protein, water, fiber, fasting, meal
 * spacing or supplements. Each of those already has a row of its own, ticked
 * daily, with its own streak.
 */
const FALLBACK_HABITS = [
  "Same wake time every day",
  "Daylight within 30 minutes of waking",
  "Caffeine cut-off at noon",
  "Cool the room before bed",
  "Move every hour you sit",
  "Lights down an hour before bed",
  "Phone out of the bedroom",
  "One 20-minute break, actually booked",
];

/** Generic but real. The LLM personalises these; this is what she gets if it can't. */
const RESIST_TARGET = 4;

const FALLBACK_RESIST: ResistSuggestion[] = [
  { title: "No sweets after 8pm", why: "Late sugar is what wakes you at 3am, not the heat." },
  { title: "Phone stays out of the bedroom", why: "The light is the part your body reads as morning." },
  { title: "No second glass of wine", why: "The first one relaxes you; the second one runs the hot flash." },
  { title: "No coffee after noon", why: "It's still in you at bedtime, even when you can't feel it." },
];

/**
 * Fills the resist list back to four after the stock-phrase gate ate some of
 * the model's. Matched on title so a written duplicate of "No sweets after 8pm"
 * never lands beside the model's version of the same idea.
 */
function topUpResist(kept: ResistSuggestion[], written: ResistSuggestion[]): ResistSuggestion[] {
  const out = [...kept];
  const taken = new Set(out.map((r) => r.title.toLowerCase()));
  for (const r of written) {
    if (out.length >= RESIST_TARGET) break;
    if (taken.has(r.title.toLowerCase())) continue;
    taken.add(r.title.toLowerCase());
    out.push(r);
  }
  return out;
}

/**
 * Used when the LLM fails. Still personalized: her level filters the pool, her
 * symptoms filter impact.
 *
 * It gets the power block on the same terms the model path does. That is new on
 * 2026-08-29 and it closes a real hole: `ensureBoneLoading()` ran only inside
 * `sanitize()`, so a woman who fell back — which is every woman when OpenAI is
 * down — got an eight-week menopause plan with, measured, one to four weeks of
 * bone loading in it and no guarantee of any. The block is built the same way
 * here, so the fallback is now the same plan minus the personalized copy rather
 * than minus a pillar.
 */
function fallbackPlan(profile: Profile, pool: Exercise[], powerPool: Exercise[]): Plan {
  const vol = MOVEMENT_VOLUME[profile.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;
  const workMinutes = workMinutesFor(vol);

  // Session titles are named after the movements in them, and a small pool
  // wraps: a beginner's fifteen ids rotate back to week 1's pair by week 6, so
  // weeks 6-8 repeated weeks 1-3's titles word for word — measured live on the
  // fallback path. Same repair as sanitize(): the next pair in the session,
  // then the written week title, which is unique by construction.
  const usedTitles = new Set<string>();
  const uniqueTitle = (...candidates: string[]) => {
    for (const c of candidates) {
      const key = c.trim().toLowerCase();
      if (!key || usedTitles.has(key)) continue;
      usedTitles.add(key);
      return c;
    }
    return candidates[0];
  };

  return {
    resistSuggestions: FALLBACK_RESIST,
    // No model ran, so every row gets the catalog's written reason.
    nutritionWhy: nutritionWhy(undefined),
    weeks: FALLBACK_WEEKS.map(([title, focus], i) => {
      const n = i + 1;
      // Rotate through the pool so the weeks don't all look identical, and ramp
      // the set count once past the halfway mark.
      const count = vol.perDay ? MIN_SNACK_EXERCISES : 4;
      const picks = Array.from({ length: count }, (_, k) => pool[(i * 3 + k) % pool.length]).filter(Boolean);
      const relaxation = RELAXATION[i % RELAXATION.length];
      // The same clamp the model's plan gets. This path writes no bookends, so
      // it will be shown the generic pair and has to leave room for them.
      const bookendSeconds = vol.perDay
        ? 0
        : listSeconds(DEFAULT_WARMUP) + listSeconds(DEFAULT_COOLDOWN);
      const floor = vol.perDay ? MIN_SNACK_EXERCISES : MIN_EXERCISES;
      const ceiling = vol.perDay ? MAX_SNACK_EXERCISES : MAX_EXERCISES;
      const exercises = fitSessionToMinutes(
        picks.map((e) => ({ id: e.id, ...defaultDoseForWeek(e, n, workMinutes, picks.length) })),
        bookendSeconds,
        vol.minutes,
        floor
      );

      // Fill toward the length she was sold, exactly as sanitize() does.
      //
      // `picks` is a flat four, so the fallback delivered four exercises into
      // every session at every level — which trims correctly on a short one and
      // under-delivers badly on a long one: measured, an advanced week 8 ran
      // 32:55 against a 35-minute session, five minutes of work she had paid
      // for and did not get. The trim was always the loud half of the promise
      // and the fill is the quiet half; the model path has had both since
      // 2026-08-28 and this path had neither.
      const used = new Set(exercises.map((e) => e.id));
      for (const cand of rotate(pool, n)) {
        if (exercises.length >= ceiling) break;
        if (used.has(cand.id)) continue;
        const extra = { id: cand.id, ...defaultDoseForWeek(cand, n, workMinutes, floor) };
        if (listSeconds([...exercises, extra]) + bookendSeconds > vol.minutes * 60) continue;
        used.add(cand.id);
        exercises.push(extra);
      }

      // The same bone guarantee the model path gets. It used to live only in
      // sanitize(), so a snack user who fell back — which is every snack user
      // when OpenAI is down — measured 1 to 2 weeks of bone loading out of
      // eight. The fallback is meant to be the same plan minus the personalized
      // copy, never minus a pillar.
      ensureSnackBone(exercises, n, pool, vol, workMinutes);

      const power =
        vol.perDay || !exercises.length ? undefined : buildPowerBlock(powerPool, n, powerMinutes(vol));

      const tasks: PlanTask[] = [
        {
          key: `w${n}_movement`,
          pillar: "movement",
          // Named after what is in it, like every other path that has to write
          // a title. It was the literal "Movement snack" on every snack week,
          // so a fallback snack plan was eight weeks with one name — which
          // reads as broken rather than as deterministic.
          title: uniqueTitle(movementTitle(exercises, n), movementTitle(exercises.slice(2), n), title),
          why: pillarWhy("movement", n),
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises,
          ...(power ? { power, powerSessions: Math.min(POWER_SESSIONS_PER_WEEK, vol.sessions) } : {}),
        },
        { key: `w${n}_${relaxation.id}`, pillar: "relaxation", title: relaxation.label, why: pillarWhy("relaxation", n), cadence: "daily", target: 1 },
        { key: `w${n}_habit`, pillar: "habit", title: FALLBACK_HABITS[i % FALLBACK_HABITS.length], why: pillarWhy("habit", n), cadence: "daily", target: 1 },
        ...cardioTasks(profile.fitness_level, n).map((t) => ({ ...t, key: `w${n}_${t.key}` })),
      ];
      // Walk the ten in priority order, two a week, so by week 5 she has been
      // pushed on every one of them at least once, and the last three weeks
      // come back round to the highest-leverage ones.
      const nutritionFocus = [NUTRITION[(i * 2) % NUTRITION.length].id, NUTRITION[(i * 2 + 1) % NUTRITION.length].id];
      return { number: n, title, focus, tasks, nutritionFocus };
    }),
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Builds the plan from her answers. Never throws — falls back to the
 * deterministic plan so she always gets something usable.
 */
export async function buildPlan(
  p: Profile,
  userId?: string | null,
  adherence: Adherence | null = null
): Promise<Plan> {
  // One run id across both calls, so the admin panel can add them up into the
  // cost of *a plan* rather than averaging two very differently sized calls.
  const meter: PlanMeter = { userId: userId ?? null, runId: randomUUID() };
  const pool = allowedExercises(p.fitness_level ?? null);
  // Bone loading, kept out of `pool` on purpose — the model never sees these
  // ids and cannot spend a strength slot on them. See allowedPower().
  const powerPool = allowedPower(p.fitness_level ?? null);
  const vol = MOVEMENT_VOLUME[p.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;

  const fallback = fallbackPlan(p, pool, powerPool);
  let plan = fallback;

  // The SDK constructor throws on a missing key, and it would throw from
  // *outside* the try below — which, since generatePlan runs inside after(),
  // is an unhandled rejection and no plan at all. She gets the deterministic
  // one instead.
  if (!process.env.OPENAI_API_KEY) {
    console.error("Plan: OPENAI_API_KEY is not set, using fallback");
    return fallback;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Two calls, in parallel: the weeks, and her ten nutrition reasons. They share
  // nothing, and running them together keeps generation inside the time the
  // success screen is willing to wait. buildNutritionWhy never rejects.
  const whyPromise = buildNutritionWhy(openai, p, meter);

  try {
    const startedAt = Date.now();
    const completion = await openai.chat.completions.create({
      model: PLAN_MODEL,
      temperature: 0.5,
      response_format: {
        type: "json_schema",
        json_schema: { name: "eight_week_plan", strict: true, schema: planJsonSchema(pool) },
      },
      messages: [
        {
          role: "system",
          content:
            "You are Lisa, a warm, evidence-informed menopause companion. You build practical 8-week plans by selecting from an approved list. Never invent exercises or supplements. Return JSON only.",
        },
        { role: "user", content: buildPrompt(p, pool, adherence) },
      ],
    });

    await recordLlmUsage({
      userId: meter.userId,
      runId: meter.runId,
      kind: "plan_weeks",
      model: PLAN_MODEL,
      usage: completion.usage,
      durationMs: Date.now() - startedAt,
    });

    // A strict schema can be refused rather than answered, and a refusal comes
    // back with no content — worth its own line in the log, since it means the
    // prompt tripped a safety filter and retrying the same input won't help.
    const message = completion.choices[0]?.message;
    if (message?.refusal) {
      console.error("Plan: model refused the request:", message.refusal);
    }

    const raw = message?.content;
    const parsed = raw ? PlanSchema.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) {
      const cleaned = sanitize(parsed.data, pool, vol, p, powerPool);
      // A thin plan means the model drifted off the catalog; the deterministic
      // fallback is better than handing her a week with two things in it.
      // Counting tasks alone let a week with no workout through — see
      // `sessionFromPool()`. sanitize() repairs that now; this is the gate that
      // would have caught it, and it stays because the repair can only fire
      // while her pool has something in it. The strength session specifically:
      // the cardio tasks are movement too, and they are always there.
      const complete =
        cleaned.weeks.length === PLAN_WEEKS &&
        cleaned.weeks.every(
          (w) =>
            w.tasks.length >= MIN_TASKS_PER_WEEK &&
            w.tasks.some((t) => t.pillar === "movement" && !isCardioTask(t))
        );
      if (complete) {
        // Losing the resist list is not worth losing a good 8 weeks over, and
        // the stock-phrase gate routinely takes one or two of them.
        plan = {
          ...cleaned,
          resistSuggestions: topUpResist(cleaned.resistSuggestions, fallback.resistSuggestions),
        };
      } else {
        console.error(
          `Plan: incomplete after sanitize (weeks ${cleaned.weeks.length}/${PLAN_WEEKS}, tasks ${cleaned.weeks
            .map((w) => w.tasks.length)
            .join(",")}, movement ${cleaned.weeks
            .map((w) => (w.tasks.some((t) => t.pillar === "movement" && !isCardioTask(t)) ? "y" : "n"))
            .join("")}), using fallback`
        );
      }
    } else if (parsed) {
      console.error("Plan: LLM output failed validation:", parsed.error.flatten());
    }
  } catch (err) {
    console.error("Plan: generation failed, using fallback:", err);
  }

  // The reasons survive a failed plan: they are keyed by nutrition id and owe
  // nothing to the weeks, so a run that fell back to the deterministic plan
  // still gets the ten written for her.
  return { ...plan, nutritionWhy: await whyPromise };
}

/**
 * What cycle to write, and what the cycle before it looked like.
 *
 * Both default to "her first plan", so the Stripe webhook keeps calling
 * `generatePlan(userId)` and gets cycle 1 with no history behind it.
 */
export type GenerateOptions = {
  cycle?: number;
  /** The finished cycle's numbers. Null on cycle 1, and on any rollover we failed to score. */
  adherence?: Adherence | null;
};

/**
 * Generates one 8-week cycle and saves it. Called from the Stripe webhook via
 * after() for cycle 1, from GET /api/plan at rollover for every cycle after,
 * and re-kicked by GET /api/plan if a run never finished.
 *
 * Never throws — a purchase must not fail because OpenAI is down.
 */
export async function generatePlan(
  userId: string,
  { cycle = 1, adherence = null }: GenerateOptions = {}
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  // Idempotent: the webhook can retry, and /api/plan re-kicks stalled runs.
  // Scoped to the cycle, so a rollover is never mistaken for a finished run of
  // the plan it is replacing.
  const { data: existing } = await supabaseAdmin
    .from("user_plans")
    .select("status")
    .eq("user_id", userId)
    .eq("cycle", cycle)
    .maybeSingle();
  if (existing?.status === "ready") return;

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select(
      "top_problems, symptom_impact, goals, goal, age_band, here_for, menopause_type, hrt_status, fitness_level, nutrition_style, relaxation_style, safety_flags"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const plan = await buildPlan((profile ?? {}) as Profile, userId, adherence);

  // `started_at` is deliberately not written here. It is stamped by the first
  // GET that reads the row, from her local date — which for a rollover is the
  // day she comes back, not the day the cron-less kick happened to run.
  const { error } = await supabaseAdmin
    .from("user_plans")
    .upsert(
      {
        user_id: userId,
        cycle,
        status: "ready",
        plan,
        prior_adherence: adherence,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,cycle" }
    );
  if (error) console.error("Plan: save failed:", error);
}

/**
 * Claims the row for one cycle so the app can show "building your plan" the
 * moment she opens it. Fast and synchronous — safe inside the Stripe webhook.
 *
 * `ignoreDuplicates` is what makes this the claim rather than a write: two
 * requests racing to start the same cycle both call this, and only the one
 * that inserted a row gets `claimed` back. The loser kicks nothing.
 */
export async function markPlanGenerating(
  userId: string,
  cycle = 1,
  priorAdherence: Adherence | null = null
): Promise<{ claimed: boolean }> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_plans")
    .upsert(
      { user_id: userId, cycle, status: "generating", prior_adherence: priorAdherence },
      { onConflict: "user_id,cycle", ignoreDuplicates: true }
    )
    .select("cycle");
  if (error) {
    console.error("Plan: could not mark generating:", error);
    return { claimed: false };
  }
  return { claimed: Boolean(data?.length) };
}

/**
 * Hydrates a stored exercise reference with its catalog name and props.
 *
 * `includeMedia` is off by default because clips are a mobile-app capability —
 * the web dashboard has no player and must not be handed URLs it would only
 * pay egress for. Defaulting to off means a new client that forgets to ask gets
 * no video, rather than silently pulling megabytes it can't render.
 *
 * Even with it on, `video` is absent until that exercise's clip has
 * actually been shot (a `clip` on its catalog row) — the app shows name + props and no
 * player.
 */
export function hydrateExercises(task: PlanTask, includeMedia = false) {
  return hydrateList(task.exercises, includeMedia);
}

/** Hydrates any stored exercise list. Unknown ids are dropped, never faked. */
function hydrateList(list: readonly StoredExercise[] | undefined, includeMedia: boolean) {
  if (!list) return undefined;
  return list.flatMap((e) => {
    const ex = getExercise(e.id);
    if (!ex) return [];
    // `dose` is the repaired, runnable version of the stored sets/seconds/minutes.
    // The raw fields are still sent alongside it: an older app build reads those
    // and is unaffected by any of this.
    return [
      {
        ...e,
        name: ex.name,
        props: ex.props,
        dose: hydrateDose(ex, e),
        ...(includeMedia ? exerciseMedia(e.id) : undefined),
      },
    ];
  });
}

/** A movement task whose work is cardio — the ones `cardioTasks()` writes. */
export const isCardioTask = (task: PlanTask) =>
  task.pillar === "movement" &&
  Boolean(task.exercises?.length) &&
  task.exercises!.every((e) => isCardioId(e.id));

/**
 * Whether this session is one a generic warm-up and cool-down belong on.
 *
 * Two sessions are left alone, both because a generic bookend would make them
 * worse rather than safer:
 *
 * - **Movement snacks** (`per_day`). Four five-minute bursts a day is the whole
 *   design. Two minutes of hip circles in front of each of them is not a
 *   warm-up, it is a 40% tax on the thing she agreed to do four times.
 * - **Cardio tasks.** A Zone 2 walk warms up by being a walk for the first five
 *   minutes, and cools down the same way. Bolting mobility work onto either end
 *   asks her to stand in the driveway doing arm swings before going for a walk,
 *   which is how a walk stops happening.
 *
 * Everything else — anything with a loaded or bodyweight movement in it — gets
 * them. That is the case the bookends were added for.
 */
function wantsBookends(task: PlanTask): boolean {
  if (task.pillar !== "movement" || !task.exercises?.length) return false;
  if (task.cadence === "per_day") return false;
  return !isCardioTask(task);
}

/**
 * An empty phase is an absent phase.
 *
 * `hydrateList` drops ids the catalog does not hold, so a bookend can hydrate to
 * nothing at all if a default is ever built from an id that later leaves the
 * catalog — which is what happened when the generic pair was still made of the
 * retired `M01`-`M04` mobility rows.
 *
 * The contract the app is built against says draw no section when the field is
 * absent, and `[]` is not absent — it is a warm-up heading with nothing under
 * it. Collapse the empty case here so a thin catalog degrades to "no warm-up"
 * rather than to an empty one.
 */
function orAbsent<T>(list: T[] | undefined) {
  return list?.length ? list : undefined;
}

/**
 * The session's warm-up: hers if the plan wrote one, the generic one otherwise.
 *
 * Resolved at read time rather than stamped into the stored plan on purpose.
 * Every plan already in the database was written before bookends existed, and
 * a woman mid-cycle should not have to wait eight weeks for a warm-up — nor
 * should her stored plan be rewritten underneath her to give her one.
 */
export function sessionWarmup(task: PlanTask, includeMedia = false) {
  if (task.warmup?.length) return orAbsent(hydrateList(task.warmup, includeMedia));
  if (!wantsBookends(task)) return undefined;
  return orAbsent(hydrateList(DEFAULT_WARMUP, includeMedia));
}

/** The session's cool-down, on the same terms as `sessionWarmup`. */
export function sessionCooldown(task: PlanTask, includeMedia = false) {
  if (task.cooldown?.length) return orAbsent(hydrateList(task.cooldown, includeMedia));
  if (!wantsBookends(task)) return undefined;
  return orAbsent(hydrateList(DEFAULT_COOLDOWN, includeMedia));
}

/**
 * The bone-loading block, between the work and the cool-down.
 *
 * **No generic fallback, unlike the two bookends**, and that asymmetry is the
 * point. A hip circle is safe for everyone, so a session with no written
 * warm-up can be handed the default pair. A plyometric is not: which ones she
 * may be given depends on her level, which is not knowable from the stored
 * task. So a plan with no `power` — every plan generated before 2026-08-29, and
 * every snack and cardio task since — gets no block rather than a guessed one.
 */
export function sessionPower(task: PlanTask, includeMedia = false) {
  if (task.pillar !== "movement") return undefined;
  return orAbsent(hydrateList(task.power, includeMedia));
}

/** Attaches the breathing pattern (or practice length) to a relaxation task. */
export function hydrateRelaxation(task: PlanTask) {
  if (task.pillar !== "relaxation") return undefined;
  // Keys are `w<n>_<catalogId>`; the catalog id is everything after the first _.
  return relaxationDetail(task.key.slice(task.key.indexOf("_") + 1));
}
