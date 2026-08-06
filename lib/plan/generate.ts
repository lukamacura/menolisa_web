import OpenAI from "openai";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MOVEMENT_VOLUME,
  NUTRITION,
  RELAXATION,
  allowedExercises,
  getExercise,
  isNutritionId,
  isRelaxationId,
  type Exercise,
} from "@/lib/plan/catalog";

export const PLAN_WEEKS = 8;

export type Pillar = "movement" | "nutrition" | "relaxation" | "habit";

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

export type PlanWeek = { number: number; title: string; focus: string; tasks: PlanTask[] };
export type Plan = { weeks: PlanWeek[] };

export type Profile = {
  name: string | null;
  top_problems: string[] | null;
  goals: string[] | null;
  goal: string | null;
  age_band: string | null;
  here_for: string | null;
  timing: string | null;
  hrt_status: string | null;
  fitness_level: string | null;
  qualifier: string | null;
};

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
  pillar: lower(z.enum(["movement", "nutrition", "relaxation", "habit"])),
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
      })
    )
    .min(1)
    .max(PLAN_WEEKS),
});

function buildPrompt(profile: Profile, pool: Exercise[]): string {
  const vol = MOVEMENT_VOLUME[profile.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;
  const movement = vol.perDay
    ? `${vol.sessions} short bursts per day of about ${vol.minutes} minutes (cadence "per_day")`
    : `${vol.sessions} sessions per week of about ${vol.minutes} minutes (cadence "weekly", target ${vol.sessions})`;

  return [
    `Woman in menopause. Build her 8-week plan.`,
    ``,
    `Her answers:`,
    `- Symptoms, worst first: ${profile.top_problems?.join(", ") || "general menopause symptoms"}`,
    `- Goals, most important first: ${profile.goals?.join(", ") || profile.goal || "feeling like herself again"}`,
    `- Stage: ${profile.here_for ?? "unknown"} · struggling for: ${profile.timing ?? "unknown"}`,
    `- Age: ${profile.age_band ?? "unknown"} · HRT: ${profile.hrt_status ?? "unknown"}`,
    `- Fitness level: ${profile.fitness_level ?? "beginner"} · readiness: ${profile.qualifier ?? "unknown"}`,
    ``,
    `MOVEMENT — pick only these exercise ids, and give ${movement}:`,
    pool.map((e) => `${e.id} ${e.name}`).join(" | "),
    ``,
    `NUTRITION — pick only these item_ids, and use their label as the title:`,
    NUTRITION.map((n) => `${n.id} = ${n.label}`).join(" | "),
    ``,
    `RELAXATION — pick only these item_ids, and use their label as the title:`,
    RELAXATION.map((r) => `${r.id} = ${r.label}`).join(" | "),
    ``,
    `Rules:`,
    `- Exactly 8 weeks, numbered 1-8. Weeks 1-2 steady the basics, 3-5 build, 6-8 lock it in.`,
    `- Each week: 4-5 tasks — at least one movement, one nutrition, one relaxation, one habit.`,
    `- Habit tasks are yours to write: one small, concrete daily action (e.g. "Cool the room before bed"). Cadence "daily".`,
    `- Nutrition and relaxation tasks need item_id and cadence "daily" (or "per_day" with a target).`,
    `- Movement tasks need an exercises array of 3-6 ids with sets/reps, or minutes for cardio. Title the session as a whole ("Lower body strength"), never after one exercise.`,
    `- Titles and focus lines are sentence case: "Steady the basics", not "Steady The Basics".`,
    `- Add difficulty gradually. Never introduce more than one new thing per week.`,
    `- "why" is one short sentence to her, in second person, tied to her symptoms. No medical claims, no dosages.`,
    `- pillar and cadence must be lowercase, exactly as written above. Omit fields you have no value for — never send null.`,
    ``,
    `Return JSON: {"weeks":[{"number":1,"title":"...","focus":"...","tasks":[{"pillar":"...","title":"...","why":"...","cadence":"...","target":1,"item_id":"...","exercises":[{"id":"L01","sets":3,"reps":10}]}]}]}`,
  ].join("\n");
}

/**
 * Drops anything the model invented: unknown exercise/nutrition/relaxation ids,
 * exercises outside her allowed pool, and movement tasks left with nothing in
 * them. Also assigns the stable task keys — the model never sees them.
 */
const MIN_EXERCISES = 3;
const MAX_EXERCISES = 6;

function sanitize(
  raw: z.infer<typeof PlanSchema>,
  pool: Exercise[],
  vol: (typeof MOVEMENT_VOLUME)[string]
): Plan {
  const allowed = new Set(pool.map((e) => e.id));
  const label = (id: string) =>
    NUTRITION.find((n) => n.id === id)?.label ?? RELAXATION.find((r) => r.id === id)?.label;

  const weeks: PlanWeek[] = [];
  for (let n = 1; n <= PLAN_WEEKS; n++) {
    const w = raw.weeks.find((x) => x.number === n);
    if (!w) continue;

    const tasks: PlanTask[] = [];
    for (const rawTask of w.tasks) {
      const parsed = TaskSchema.safeParse(rawTask);
      if (!parsed.success) continue;
      const t = parsed.data;
      const base = { key: "", pillar: t.pillar, title: t.title, why: t.why, cadence: t.cadence, target: t.target };

      if (t.pillar === "movement") {
        const exercises = (t.exercises ?? [])
          .filter((e) => allowed.has(e.id))
          .map((e) => ({ id: e.id, sets: e.sets ?? undefined, reps: e.reps ?? undefined, minutes: e.minutes ?? undefined }));
        if (!exercises.length) continue;

        // The model routinely returns a single exercise however firmly it's
        // asked for more, which is not a session. Top up from her own pool.
        const used = new Set(exercises.map((e) => e.id));
        for (let k = 0; exercises.length < MIN_EXERCISES && k < pool.length; k++) {
          const cand = pool[(n * 3 + k) % pool.length];
          if (used.has(cand.id)) continue;
          used.add(cand.id);
          exercises.push({ id: cand.id, sets: n > 4 ? 3 : 2, reps: 10, minutes: undefined });
        }

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

      if (t.pillar === "nutrition" || t.pillar === "relaxation") {
        const id = t.item_id ?? "";
        if (!(t.pillar === "nutrition" ? isNutritionId(id) : isRelaxationId(id))) continue;
        // The catalog label wins over whatever the model typed, so the app and
        // the funnel always use the same words for the same habit.
        tasks.push({ ...daily, key: id, title: label(id) ?? t.title });
        continue;
      }
      tasks.push(daily);
    }

    if (tasks.length) {
      // Keys must be unique within a week and stable forever — nutrition and
      // relaxation reuse their catalog id so the same habit keeps one key across weeks.
      weeks.push({
        number: n,
        title: w.title,
        focus: w.focus,
        tasks: tasks.map((t, i) => ({ ...t, key: `w${n}_${t.key || `${t.pillar}${i}`}` })),
      });
    }
  }
  return { weeks };
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

const FALLBACK_HABITS = [
  "Same wake time every day",
  "Daylight within 30 minutes of waking",
  "Caffeine cut-off at noon",
  "Cool the room before bed",
  "Move every hour you sit",
  "Water first thing in the morning",
  "Phone out of the bedroom",
  "One 20-minute break, actually booked",
];

/** Used when the LLM fails. Still personalized: her level filters the pool, her symptoms filter impact. */
function fallbackPlan(profile: Profile, pool: Exercise[]): Plan {
  const vol = MOVEMENT_VOLUME[profile.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;

  return {
    weeks: FALLBACK_WEEKS.map(([title, focus], i) => {
      const n = i + 1;
      // Rotate through the pool so the weeks don't all look identical, and ramp
      // the set count once past the halfway mark.
      const picks = Array.from({ length: 4 }, (_, k) => pool[(i * 3 + k) % pool.length]).filter(Boolean);
      const nutrition = NUTRITION[i % NUTRITION.length];
      const relaxation = RELAXATION[i % RELAXATION.length];

      const tasks: PlanTask[] = [
        {
          key: `w${n}_movement`,
          pillar: "movement",
          title: vol.perDay ? "Movement snack" : `Session ${n}`,
          why: "Muscle and bone respond fastest to steady, repeatable work.",
          cadence: vol.perDay ? "per_day" : "weekly",
          target: vol.sessions,
          exercises: picks.map((e) => ({ id: e.id, sets: n > 4 ? 3 : 2, reps: 10 })),
        },
        { key: `w${n}_${nutrition.id}`, pillar: "nutrition", title: nutrition.label, why: "One change at a time is what makes it stick.", cadence: "daily", target: 1 },
        { key: `w${n}_${relaxation.id}`, pillar: "relaxation", title: relaxation.label, why: "Lowering the background stress softens the symptoms on top of it.", cadence: "daily", target: 1 },
        { key: `w${n}_habit`, pillar: "habit", title: FALLBACK_HABITS[i % FALLBACK_HABITS.length], why: "Small, and it holds the rest of the day together.", cadence: "daily", target: 1 },
      ];
      return { number: n, title, focus, tasks };
    }),
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Builds the plan from her answers. Never throws — falls back to the
 * deterministic plan so she always gets something usable.
 */
export async function buildPlan(p: Profile): Promise<Plan> {
  const pool = allowedExercises(p.fitness_level ?? null, p.top_problems ?? []);
  const vol = MOVEMENT_VOLUME[p.fitness_level ?? "beginner"] ?? MOVEMENT_VOLUME.beginner;

  let plan = fallbackPlan(p, pool);
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Lisa, a warm, evidence-informed menopause companion. You build practical 8-week plans by selecting from an approved list. Never invent exercises or supplements. Return JSON only.",
        },
        { role: "user", content: buildPrompt(p, pool) },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    const parsed = raw ? PlanSchema.safeParse(JSON.parse(raw)) : null;
    if (parsed?.success) {
      const cleaned = sanitize(parsed.data, pool, vol);
      // A thin plan means the model drifted off the catalog; the deterministic
      // fallback is better than handing her a week with two things in it.
      const complete =
        cleaned.weeks.length === PLAN_WEEKS && cleaned.weeks.every((w) => w.tasks.length >= 3);
      if (complete) plan = cleaned;
      else
        console.error(
          `Plan: incomplete after sanitize (weeks ${cleaned.weeks.length}/${PLAN_WEEKS}, tasks ${cleaned.weeks
            .map((w) => w.tasks.length)
            .join(",")}), using fallback`
        );
    } else if (parsed) {
      console.error("Plan: LLM output failed validation:", parsed.error.flatten());
    }
  } catch (err) {
    console.error("Plan: generation failed, using fallback:", err);
  }

  return plan;
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
    .select("name, top_problems, goals, goal, age_band, here_for, timing, hrt_status, fitness_level, qualifier")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = await buildPlan((profile ?? {}) as Profile);

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

/** Hydrates a stored exercise reference with its catalog name and props. */
export function hydrateExercises(task: PlanTask) {
  if (!task.exercises) return undefined;
  return task.exercises.flatMap((e) => {
    const ex = getExercise(e.id);
    return ex ? [{ ...e, name: ex.name, props: ex.props }] : [];
  });
}
