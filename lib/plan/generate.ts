import { randomUUID } from "crypto";
import OpenAI from "openai";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { recordLlmUsage } from "@/lib/llmUsage";
import {
  MOVEMENT_VOLUME,
  NUTRITION,
  RELAXATION,
  allowedExercises,
  exerciseMedia,
  getExercise,
  isCardioId,
  isNutritionId,
  isRelaxationId,
  relaxationDetail,
  relaxationForSymptom,
  type Exercise,
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
  exercises?: { id: string; sets?: number; reps?: number; minutes?: number }[];
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

export type Profile = {
  name: string | null;
  top_problems: string[] | null;
  symptom_impact: string | null;
  goals: string[] | null;
  goal: string | null;
  age_band: string | null;
  here_for: string | null;
  menopause_type: string | null;
  timing: string | null;
  hrt_status: string | null;
  fitness_level: string | null;
  nutrition_style: string | null;
  relaxation_style: string | null;
  safety_flags: string[] | null;
  qualifier: string | null;
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
  title: z.string().min(1).transform((s) => s.trim().slice(0, 80)),
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
        reps: optNum(50),
        minutes: optNum(90),
      })
    )
    .max(8)
    .nullish(),
});

const ResistSchema = z.object({
  title: z.string().min(1).transform((s) => s.trim().slice(0, 60)),
  why: text(160),
});

// Tasks are validated one at a time inside sanitize(), so a single malformed
// task costs us that task instead of all eight weeks.
const PlanSchema = z.object({
  weeks: z
    .array(
      z.object({
        number: z.coerce.number().int().min(1).max(PLAN_WEEKS),
        title: z.string().min(1).transform((s) => s.trim().slice(0, 60)),
        focus: text(200),
        tasks: z.array(z.unknown()).max(10),
        nutrition_focus: z.array(z.string()).max(4).nullish(),
      })
    )
    .min(1)
    .max(PLAN_WEEKS),
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
                required: ["pillar", "title", "why", "cadence", "target", "item_id", "exercises"],
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
                      required: ["id", "sets", "reps", "minutes"],
                      properties: {
                        // Her allowed pool only — this is the line that makes
                        // an out-of-pool or invented exercise impossible.
                        id: { type: "string", enum: pool.map((e) => e.id) },
                        sets: nullableInt,
                        reps: nullableInt,
                        minutes: nullableInt,
                      },
                    },
                  },
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

function buildPrompt(profile: Profile, pool: Exercise[]): string {
  const vol = MOVEMENT_VOLUME[profile.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;
  const movement = vol.perDay
    ? `${vol.sessions} short bursts per day of about ${vol.minutes} minutes (cadence "per_day")`
    : `${vol.sessions} sessions per week of about ${vol.minutes} minutes (cadence "weekly", target ${vol.sessions})`;
  // A 5-minute snack cannot hold six exercises; a 30-minute session should not
  // hold one. sanitize() tops up to this same floor when the model under-delivers.
  const [minEx, maxEx] = vol.perDay ? [2, 3] : [4, 6];

  return [
    `Woman in menopause. Build her 8-week plan.`,
    ``,
    `Her answers:`,
    `- Symptoms, worst first: ${profile.top_problems?.join(", ") || "general menopause symptoms"}${profile.symptom_impact ? ` · the worst one hits her: ${profile.symptom_impact}` : ""}`,
    `- Goals, most important first: ${profile.goals?.join(", ") || profile.goal || "feeling like herself again"}`,
    `- Stage: ${profile.here_for ?? "unknown"} · onset: ${profile.menopause_type ?? "unknown"}`,
    `- Age: ${profile.age_band ?? "unknown"} · HRT: ${profile.hrt_status ?? "unknown"}`,
    `- Fitness level: ${profile.fitness_level ?? "beginner"}`,
    `- Eating right now: ${profile.nutrition_style ?? "unknown"} · unwinds: ${profile.relaxation_style ?? "unknown"}`,
    ``,
    `MOVEMENT — pick only these exercise ids, and give ${movement}:`,
    pool.map((e) => `${e.id} ${e.name}`).join(" | "),
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
    `- Habit tasks are yours to write: one small, concrete daily action she starts doing (e.g. "Cool the room before bed"). Cadence "daily". Name the action itself — never begin the title with "Add". Never write a habit about quitting something — that is what resist_suggestions is for.`,
    `- Never write a habit or movement task that repeats a nutrition row — no walks after meals, no water, no protein, no meal timing. She already ticks those every day; put the id in nutrition_focus instead.`,
    `- Relaxation tasks need item_id and cadence "daily" (or "per_day" with a target). Match the item to her worst symptom: hot flashes get breath_hotflash, night waking gets breath_sleep, anxiety or palpitations get breath_sigh.`,
    `- Movement tasks need an exercises array of ${minEx}-${maxEx} DIFFERENT ids — a session, not one move. Fewer than ${minEx} is a failed week. Ids starting with K are cardio: give them "minutes" and no sets or reps. Everything else gets "sets" and "reps".`,
    `- Title each movement session after what is actually in it, and give all 8 weeks different titles. Never title a session after one exercise, and never repeat a title you have already used.`,
    `- Titles and focus lines are sentence case: "Steady the basics", not "Steady The Basics".`,
    `- Add difficulty gradually. Never introduce more than one new thing per week.`,
    `- "why" is one short sentence to her, in second person, tied to her symptoms. No medical claims, no dosages.`,
    `- Never write "can help", "helps with", "supports", "improves", "boosts", "promotes", "is important", "is essential", "overall health" or "overall well-being" in any "why". Those say nothing. Name what actually happens instead.`,
    `- Every task carries every field. Send "item_id": null on movement and habit tasks, and "exercises": null on anything that is not movement. Inside an exercise, send null for the props that don't apply — a cardio id has "sets": null and "reps": null, everything else has "minutes": null.`,
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
    `Return JSON: {"weeks":[{"number":1,"title":"...","focus":"...","nutrition_focus":["protein_25_30g"],"tasks":[{"pillar":"movement","title":"...","why":"...","cadence":"weekly","target":2,"item_id":null,"exercises":[{"id":"...","sets":3,"reps":10,"minutes":null},{"id":"...","sets":2,"reps":12,"minutes":null},{"id":"K01","sets":null,"reps":null,"minutes":15}]},{"pillar":"relaxation","title":"...","why":"...","cadence":"daily","target":1,"item_id":"breath_sleep","exercises":null},{"pillar":"habit","title":"...","why":"...","cadence":"daily","target":1,"item_id":null,"exercises":null}]}],"resist_suggestions":[{"title":"...","why":"..."}]}`,
  ].join("\n");
}

/**
 * Drops anything the model invented: unknown exercise/relaxation ids, exercises
 * outside her allowed pool, and movement tasks left with nothing in them. Also
 * assigns the stable task keys — the model never sees them.
 */
const MIN_EXERCISES = 3;
/** A 5-minute burst done four times a day is two or three moves, not six. */
const MIN_SNACK_EXERCISES = 2;
const MAX_EXERCISES = 6;

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

/** Rotates a list by `n`, so each week tops up from a different starting point. */
const rotate = <T>(items: T[], n: number): T[] =>
  items.length ? [...items.slice(n % items.length), ...items.slice(0, n % items.length)] : items;

function sanitize(
  raw: z.infer<typeof PlanSchema>,
  pool: Exercise[],
  vol: (typeof MOVEMENT_VOLUME)[string],
  profile: Profile
): Plan {
  const allowed = new Set(pool.map((e) => e.id));
  const topProblems = profile.top_problems ?? [];

  const weeks: PlanWeek[] = [];
  for (let n = 1; n <= PLAN_WEEKS; n++) {
    const w = raw.weeks.find((x) => x.number === n);
    if (!w) continue;

    const tasks: PlanTask[] = [];
    // Practices already placed this week, so a repaired task doesn't duplicate
    // the one sitting next to it.
    const usedRelaxation = new Set<string>();
    for (const rawTask of w.tasks) {
      const parsed = TaskSchema.safeParse(rawTask);
      if (!parsed.success) continue;
      const t = parsed.data;
      const base = { key: "", pillar: t.pillar, title: t.title, why: t.why, cadence: t.cadence, target: t.target };

      if (t.pillar === "movement") {
        const exercises = (t.exercises ?? [])
          .filter((e) => allowed.has(e.id))
          .map((e) => ({ id: e.id, sets: e.sets ?? undefined, reps: e.reps ?? undefined, minutes: e.minutes ?? undefined }));

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
        const candidates = family
          ? [
              ...rotate(pool.filter((e) => e.id[0] === family), n),
              ...rotate(pool.filter((e) => e.id[0] !== family), n),
            ]
          : rotate(pool, n);
        const floor = vol.perDay ? MIN_SNACK_EXERCISES : MIN_EXERCISES;
        for (const cand of candidates) {
          if (exercises.length >= floor) break;
          if (used.has(cand.id)) continue;
          used.add(cand.id);
          exercises.push(
            isCardioId(cand.id)
              ? { id: cand.id, sets: undefined, reps: undefined, minutes: vol.minutes }
              : { id: cand.id, sets: n > 4 ? 3 : 2, reps: 10, minutes: undefined }
          );
        }
        if (!exercises.length) continue;

        // Volume is a rule keyed off her fitness level, not something the model
        // gets a vote on — it kept sending "daily x7" and "per_day x1".
        tasks.push({
          ...base,
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises: exercises.slice(0, MAX_EXERCISES),
        });
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
        const named = t.item_id ?? "";
        const item = isRelaxationId(named)
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
          why: "Small, and it holds the rest of the day together.",
        });
        continue;
      }
      tasks.push(daily);
    }

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
        title: w.title,
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

  return { weeks, resistSuggestions: resistSuggestions.slice(0, 6) };
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
 * Also applied to `resist_suggestions[].why` — see sanitize(). The modal hedge
 * ("can help", "can improve", "may reduce") is the real tell: it is what a model
 * writes when it has been asked for a reason and has none, and it was in half of
 * every resist line the model produced before this gate existed.
 */
const STOCK_PHRASES =
  /\b(?:(?:can|may|will) (?:help|improve|enhance|reduce|support|boost|prevent|promote)|helps? (?:to )?(?:support|promote|improve|maintain)|supports?\b|is essential|is important|promotes?|boosts?|overall (?:health|well-?being|wellness))/i;
const MIN_WHY_CHARS = 90;
const MAX_WHY_CHARS = 240;

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

/** Used when the LLM fails. Still personalized: her level filters the pool, her symptoms filter impact. */
function fallbackPlan(profile: Profile, pool: Exercise[]): Plan {
  const vol = MOVEMENT_VOLUME[profile.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;

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

      const tasks: PlanTask[] = [
        {
          key: `w${n}_movement`,
          pillar: "movement",
          title: vol.perDay ? "Movement snack" : `Session ${n}`,
          why: "Muscle and bone respond fastest to steady, repeatable work.",
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises: picks.map((e) =>
            isCardioId(e.id)
              ? { id: e.id, minutes: vol.minutes }
              : { id: e.id, sets: n > 4 ? 3 : 2, reps: 10 }
          ),
        },
        { key: `w${n}_${relaxation.id}`, pillar: "relaxation", title: relaxation.label, why: "Lowering the background stress softens the symptoms on top of it.", cadence: "daily", target: 1 },
        { key: `w${n}_habit`, pillar: "habit", title: FALLBACK_HABITS[i % FALLBACK_HABITS.length], why: "Small, and it holds the rest of the day together.", cadence: "daily", target: 1 },
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
export async function buildPlan(p: Profile, userId?: string | null): Promise<Plan> {
  // One run id across both calls, so the admin panel can add them up into the
  // cost of *a plan* rather than averaging two very differently sized calls.
  const meter: PlanMeter = { userId: userId ?? null, runId: randomUUID() };
  const pool = allowedExercises(p.fitness_level ?? null, p.top_problems ?? []);
  const vol = MOVEMENT_VOLUME[p.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;

  const fallback = fallbackPlan(p, pool);
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
        { role: "user", content: buildPrompt(p, pool) },
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
      const cleaned = sanitize(parsed.data, pool, vol, p);
      // A thin plan means the model drifted off the catalog; the deterministic
      // fallback is better than handing her a week with two things in it.
      const complete =
        cleaned.weeks.length === PLAN_WEEKS && cleaned.weeks.every((w) => w.tasks.length >= 3);
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
            .join(",")}), using fallback`
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
 * Generates the full 8-week plan and saves it. Called from the Stripe webhook
 * via after(), and re-kicked by GET /api/plan if a run never finished.
 *
 * Never throws — a purchase must not fail because OpenAI is down.
 */
export async function generatePlan(userId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  // Idempotent: the webhook can retry, and /api/plan re-kicks stalled runs.
  const { data: existing } = await supabaseAdmin
    .from("user_plans")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.status === "ready") return;

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select(
      "name, top_problems, symptom_impact, goals, goal, age_band, here_for, menopause_type, timing, hrt_status, fitness_level, nutrition_style, relaxation_style, safety_flags, qualifier"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const plan = await buildPlan((profile ?? {}) as Profile, userId);

  const { error } = await supabaseAdmin
    .from("user_plans")
    .upsert(
      { user_id: userId, status: "ready", plan, generated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) console.error("Plan: save failed:", error);
}

/**
 * Claims the plan row so the app can show "building your plan" the moment she
 * opens it. Fast and synchronous — safe inside the Stripe webhook. Never
 * overwrites a plan she already has.
 */
export async function markPlanGenerating(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("user_plans")
    .upsert({ user_id: userId, status: "generating" }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) console.error("Plan: could not mark generating:", error);
}

/**
 * Hydrates a stored exercise reference with its catalog name and props.
 *
 * `includeMedia` is off by default because clips are a mobile-app capability —
 * the web dashboard has no player and must not be handed URLs it would only
 * pay egress for. Defaulting to off means a new client that forgets to ask gets
 * no video, rather than silently pulling megabytes it can't render.
 *
 * Even with it on, `video`/`poster` are absent until that exercise's clip has
 * actually been produced (see MEDIA_READY) — the app shows name + props and no
 * player.
 */
export function hydrateExercises(task: PlanTask, includeMedia = false) {
  if (!task.exercises) return undefined;
  return task.exercises.flatMap((e) => {
    const ex = getExercise(e.id);
    if (!ex) return [];
    return [
      { ...e, name: ex.name, props: ex.props, ...(includeMedia ? exerciseMedia(e.id) : undefined) },
    ];
  });
}

/** Attaches the breathing pattern (or practice length) to a relaxation task. */
export function hydrateRelaxation(task: PlanTask) {
  if (task.pillar !== "relaxation") return undefined;
  // Keys are `w<n>_<catalogId>`; the catalog id is everything after the first _.
  return relaxationDetail(task.key.slice(task.key.indexOf("_") + 1));
}
