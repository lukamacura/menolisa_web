# `user_plans.plan` — the generated 8-week plan

What the LLM writes for each woman when she buys, exactly as it lands in
Supabase, and how to hand it to an AI agent as context without the agent
inventing on top of it.

Read `docs/plan/pillars.md` first if you want the *product* view — what the four
pillars are and what she sees. This file is the data contract.

---

## 1. Where it lives

One row per user, primary key `user_id`.

```
public.user_plans
  user_id       uuid  pk, fk → auth.users on delete cascade
  status        text  not null default 'generating'  -- 'generating' | 'ready' | 'failed'
  plan          jsonb null    -- the object this document describes
  started_at    date  null    -- day 1 of week 1
  generated_at  timestamptz null  -- when `plan` was written
  created_at    timestamptz not null default now()
```

RLS is on with a single `own rows` policy (`auth.uid() = user_id`), so the
mobile app *could* read the row directly with her JWT. It should not — see §6.

Two companion tables carry everything she does against the plan. Neither is part
of `plan`; the plan is immutable after generation.

| Table | Key | Holds |
|---|---|---|
| `user_plan_logs` | `(user_id, task_key, date)` | one tick, with a `count` and optional `note` |
| `user_habits` | `id` | habits she added herself, `kind` = `build` \| `resist` |

`status` is checked against `('generating','ready','failed')`, but nothing writes
`'failed'` today — a generation that fails falls back to the deterministic plan
and still lands as `'ready'`. Treat `'failed'` as reserved.

## 2. When it is written

```
Stripe checkout paid
  └─ fulfillCheckout()               lib/stripe/fulfillCheckout.ts
       ├─ resolveCheckoutAccount()   binds the email to the account
       ├─ writeSubscription()        user_trials → paid
       └─ claimFulfillment()         wins exactly once
            ├─ markPlanGenerating()  awaited: upsert {status:'generating'} on conflict do nothing
            └─ after(generatePlan)   the slow part, after the response
```

`generatePlan(userId)` reads `user_profiles` (the funnel quiz), calls
`buildPlan()`, and upserts `{status:'ready', plan, generated_at}`. It returns
early if the row is already `'ready'`, so a webhook retry costs nothing.

Two other things can start it, and both matter because a webhook may never
arrive:

- `/api/stripe/sync-session` — the success screen's fallback, running the same
  `fulfillCheckout()`.
- `GET /api/plan` — no row at all means she is paying (`checkTrialExpired`
  already passed) and fulfillment never ran, so the read kicks generation. A row
  stuck in `'generating'` past `STALL_MS` (120s) is re-kicked, but only by the
  poller that wins a conditional update on `created_at` — on an unfinished row
  that column means "when the current attempt was claimed", not "when the row was
  born".

**`started_at` is not set at purchase.** Week 1 begins the first time she opens
the plan, because she buys on web and may not install the app for days. The
first `GET /api/plan` stamps it from her local date.

## 3. Who decides what

This is the part an agent has to internalise. The model is a **selector and a
copywriter**, never an author of content.

| Thing | Decided by | Where |
|---|---|---|
| Which exercises exist, their names, equipment, level | Catalog | `EXERCISES` in `lib/plan/catalog.ts` |
| Which exercises *she* may be given | Code | `allowedExercises(fitness_level)` — her level is the only filter |
| The cardio sessions each week, and the bone-loading block in each session | Code | `cardioTasks()` / `buildPowerBlock()` — the model never sees the `K` or `I` ids |
| How many movement sessions, and how long | Code | `MOVEMENT_VOLUME[fitness_level]` — the model's cadence/target is overwritten |
| Which exercises go in a session, and sets/seconds/minutes | **LLM**, filtered to her pool | topped up by code if it under-delivers |
| Session title, week title, week focus, task `why` | **LLM** | ungated copy — see §7 |
| Which relaxation practice each week | **LLM**, by id | title is forced back to the catalog label |
| The breathing pattern, rounds, timings | Catalog | `RELAXATION` — never in `plan` |
| The habit tasks | **LLM**, free text | filtered against `NUTRITION_ECHO` |
| The ten nutrition rows, their labels, groups, targets | Catalog | `NUTRITION` — identical for every user, not in `plan` |
| Which 1-2 nutrition rows a week pushes on | **LLM**, by id | `nutritionFocus` |
| Why each nutrition row is on her list | **LLM**, from a separate call | `nutritionWhy`, gated |
| The resist suggestions | **LLM** | gated, topped up from written copy |

Every id the model emits is an **enum in the response schema** (`strict: true`),
so an invented id or an exercise outside her allowed pool cannot be emitted at
all. The catalog checks in `sanitize()` remain as a second line of defence, but
they now repair rather than drop — see §2 of `docs/plan/instructions.md`.

## 4. The JSON

```ts
type Plan = {
  weeks: PlanWeek[];              // 8, numbered 1-8, in order
  resistSuggestions: { title: string; why: string }[];   // 4-6, usually 4
  nutritionWhy?: Record<string, string>;                 // 10, keyed by nutrition id
};

type PlanWeek = {
  number: number;                 // 1-8
  title: string;                  // ≤60 chars, sentence case
  focus: string;                  // ≤200 chars, one line
  nutritionFocus: string[];       // 0-2 ids from NUTRITION
  tasks: PlanTask[];              // ≥3, one per pillar; 3-4 in practice
};

type PlanTask = {
  key: string;                    // stable; user_plan_logs.task_key points here
  pillar: "movement" | "relaxation" | "habit";
  title: string;                  // ≤80 chars
  why: string;                    // ≤200 chars, second person
  cadence: "daily" | "weekly" | "per_day";
  target: number;                 // completions a full period takes
  // Every dose is time: sets of seconds, or minutes for one continuous block.
  exercises?: { id: string; sets?: number; seconds?: number; minutes?: number }[];
};
```

The stored object is **camelCase**. The model is asked for snake_case
(`nutrition_focus`, `resist_suggestions`) and `sanitize()` renames on the way in
— never read the snake_case names off a stored row.

### `weeks[].tasks[]`

`key` is `w<week>_<suffix>`: `w1_movement0`, `w3_breath_sleep`, `w2_habit2`. For
relaxation the suffix is the catalog id, which is how `hydrateRelaxation()`
recovers the breathing pattern; for everything else it is pillar + index in the
week's task array. Keys are unique within a week and never change for the life
of the plan — the plan JSON is written once and never regenerated, which is what
makes an index safe to embed.

The week prefix stays on relaxation keys too, so the same practice in week 1 and
week 6 is two keys. Nothing derives a cross-week streak from a plan task (only
nutrition rows and her own habits get streaks), so this is invisible today —
but a per-task streak would need the prefix dropped.

`cadence` and `target` read together:

| cadence | target | Means |
|---|---|---|
| `daily` | always 1 | every day |
| `weekly` | 2-4 | that many times this week |
| `per_day` | 2-6 | that many times a day |

Movement always gets its cadence and target from `MOVEMENT_VOLUME`, never from
the model — beginner `weekly 2`, medium `weekly 3`, advanced `weekly 4`,
movement_snacks `per_day 4`. Relaxation and habit are `daily 1` unless the model
asked for `per_day`.

`exercises` is present on movement tasks only, 2-6 entries. The id is the only
identity stored — `name`, `props` and video URLs are joined from the catalog at
read time and are **not** in the row.

Each entry carries the dose the model prescribed for that exercise *in that
week*. **Every dose is time** — there are no repetitions anywhere in the plan —
so there are only two shapes:

| Exercise kind | Fields sent | Example |
|---|---|---|
| A set of anything | `sets` + `seconds` | `{"id":"L01","sets":3,"seconds":40}` |
| A continuous block | `minutes` | `{"id":"K01","minutes":12}` |

The second shape is written by code only: the cardio tasks (`w{n}_cardio`,
`w{n}_intervals`) each hold exactly one `K` id with `minutes`, and no `K` id is
in the pool the model picks from. There is no `reps` field anywhere; the legacy
conversion was removed on 2026-08-29 once no stored plan carried one.
`hydrateDose()` keeps
running.

#### Who decides what

This is the line that matters, and it is not "the model writes the plan":

| Fact | Owner | Why |
|---|---|---|
| Whether an id is worked, held, carried or continuous (`unit`) | **Catalog** | A fact about the exercise, identical for every woman and every week |
| Whether it is per side (`perSide`) | **Catalog** | Same |
| Rest between sets (`restSeconds`) | **Catalog**, from unit + level | Safety-adjacent; the model gets no vote |
| How many sets, seconds, minutes — and how they grow | **LLM** | This *is* the plan. A constant cannot make week 8 harder than week 1 |

The generator used to give sets and reps to everything that was not cardio, so a
wall sit came out as "3 × 10 reps" of a thing you hold and a step-up as "10 reps"
when it meant 10 *per leg*. Putting `unit` in the catalog rather than the plan is
what makes that unrepresentable: the model is never asked the question it kept
getting wrong, and it cannot answer it even if it tries.

Repetitions went the same way, and for the same reason. A rep count and a
countdown are two instructions competing for one screen — the session showed her
a draining ring while asking her to count to twelve. Now the seconds *are* the
instruction, on every step, and `sets` carries the progression.

#### `dose` — what the API actually returns

`hydrateExercises()` joins the catalog facts onto the stored numbers and returns
a single `dose` object, built by `hydrateDose()` in `lib/plan/catalog.ts`:

```ts
dose: {
  unit: "timed" | "hold" | "carry" | "duration";
  perSide: boolean;          // the set runs twice, and `seconds` is per side
  sets: number;              // always >= 1; `duration` is always 1
  seconds: number;           // per set (per side when perSide); whole block for duration
  restSeconds: number;       // between sets; 0 for duration
  estimatedSeconds: number;  // including rest, for the session time estimate
}
```

Everything the model wrote is **clamped into a safe band**, never trusted raw —
timed sets to 15-90s, holds to 10-90s, carries to 15-120s, sets to 1-6, cardio to
the per-session cap. A 600-second wall sit prescribed to a woman new to loading is
an injury, not an ambitious week. A value that is missing or nonsense falls back
to the catalog's starting dose; a plan is never lost over a number.

The raw stored fields are still sent alongside `dose` for clients that predate
it.

#### Progression

The prompt asks for a ladder — weeks 1-2 open at 2 sets of 25-30s, weeks 3-5
build to 30-45s, weeks 6-8 reach 3 sets of 45-60s — moving one number at a time
and never shrinking a dose an exercise already had.

`defaultDoseForWeek()` in the catalog mirrors that same ladder, and is used by
the deterministic fallback plan and by the top-up that fills a session the model
under-delivered, so a repaired exercise sits at the intensity of the ones around
it instead of reading as a week-1 dose dropped into week 7.

Run `npm run verify-plan-dose` after touching any of it — the prompt, the safe
bands and the ladder live in two files and drift silently, because every wrong
number still looks plausible.

### `weeks[].nutritionFocus`

Ids only, 0-2 of them. It does **not** mean "this week's nutrition tasks" —
all ten nutrition rows are shown every day, to everyone, for all eight weeks.
Focus only marks which ones the week pushes on. A week may legitimately have
none.

### `resistSuggestions`

Temptations she gets credit for resisting, as an **offer**. She opts in by
creating a `user_habits` row with `kind: "resist"`; until she does, it is not
part of her plan. `GET /api/plan` filters out any whose title she has already
taken up.

### `nutritionWhy`

Ten entries, keyed by nutrition id, written in one dedicated LLM call with the
catalog's own sentence as the anchor. It lives on the plan rather than the week
because the ten rows do not change across the eight weeks, and it is written
once — the reason she reads in week 1 is the reason still there in week 8.

Optional on read. Plans generated before the field existed have no key, and
`GET /api/plan` falls back to `NUTRITION[].why`. Any individual id may also be
missing from the model's output; `nutritionWhy()` fills it from the catalog, so
a stored plan always has all ten.

### Worked example

Two weeks of a real beginner plan (hot flashes / sleep / anxiety, not on HRT),
trimmed:

```jsonc
{
  "weeks": [
    {
      "number": 1,
      "title": "Steady the basics",
      "focus": "Focus on gentle movement and relaxation.",
      "nutritionFocus": ["protein_25_30g"],
      "tasks": [
        {
          "key": "w1_movement0",
          "pillar": "movement",
          "title": "Gentle bodyweight exercises",
          "why": "Gentle exercises ease tension and settle your mood.",
          "cadence": "weekly",
          "target": 2,
          "exercises": [
            { "id": "L01", "sets": 3, "seconds": 40 },
            { "id": "L02", "sets": 3, "seconds": 40 },
            { "id": "U01", "sets": 2, "seconds": 30 },
            { "id": "K03", "minutes": 15 }
          ]
        },
        {
          "key": "w1_breath_hotflash",
          "pillar": "relaxation",
          "title": "Hot flash rescue breathing",
          "why": "Reach for it the moment you feel one starting.",
          "cadence": "daily",
          "target": 1
        },
        {
          "key": "w1_habit2",
          "pillar": "habit",
          "title": "Cool the room before bed",
          "why": "A cooler room is the difference between waking at 3am and not.",
          "cadence": "daily",
          "target": 1
        }
      ]
    },
    { "number": 2, "title": "Building on the basics", "focus": "…", "nutritionFocus": ["healthy_fats"], "tasks": [] }
  ],
  "resistSuggestions": [
    { "title": "No sweets after 8pm", "why": "Late sugar is what wakes you at 3am, not the heat." },
    { "title": "Phone stays out of the bedroom", "why": "The light is the part your body reads as morning." }
  ],
  "nutritionWhy": {
    "protein_25_30g": "You need more protein now to keep your muscle, and your body can only use a certain amount at once — three moderate portions work better than one big meal.",
    "water_6": "Your sense of thirst fades with age, while hot flashes and night sweats take more water out of you than you notice."
  }
}
```

`L01` is "Box squat, sturdy chair". `K03` is "Recovery stroll / hike". Neither
string is in the row — resolve through `getExercise(id)`.

## 5. The deterministic fallback

`buildPlan()` never throws. When OpenAI is down, `OPENAI_API_KEY` is unset, or
the model's output fails validation or comes back thin (fewer than 8 weeks, or
any week under 3 tasks), she gets a hand-written plan instead. It is still
personalised — her fitness level filters the exercise pool, and it gets the
same power block and cardio tasks — but the week titles, habits and resist lines come from
`FALLBACK_WEEKS` / `FALLBACK_HABITS` / `FALLBACK_RESIST`.

**The stored JSON has exactly the same shape.** There is no flag distinguishing
a fallback plan from a generated one, and no consumer should need one. If you
ever want the distinction for analytics, it has to be added as a column, not
inferred from the copy.

`nutritionWhy` survives a failed plan independently — it is a separate call
keyed by nutrition id, so a run that fell back on the weeks can still have the
ten written for her.

## 6. Giving it to an AI agent

### Read it through `GET /api/plan`, not off the table

The raw row is ids and keys. The endpoint is the same plan **hydrated and
scored**, and it is the only thing that knows what today looks like:

- exercise `name` and `props` joined from the catalog, plus a `video` URL
  when the app sends `?media=1` (there are no poster images — video only)
- the breathing `phases`, `rounds`, `cycleSeconds` and `breathsPerMinute` for a
  relaxation task
- `currentWeek`, and per-week `state` — `past` \| `current` \| `locked`. A
  locked week returns its title and an empty `tasks` array; she cannot read
  ahead, and neither should the agent.
- all ten nutrition rows with today's `count`, `target`, `max`, `doneToday`,
  `streak`, `bestStreak`, and her `why`
- `doneToday` / `doneThisWeek` on every task
- her own habits, and the resist suggestions she has **not** taken up

Reading `plan` directly from Supabase gets you none of that and hands the agent
all eight weeks including ones she has not unlocked.

### What to put in the context window

Send a digest of the current state, not the document. All eight weeks is mostly
tokens she cannot act on today, and a locked week in the prompt is a leak.

```
HER PLAN — week 3 of 8, "Building endurance" (day 17, started 2026-08-05)
This week's focus: Add one thing that holds the rest together.
Pushing on: High-fiber food (0/3 today)

Today:
- Strength and endurance session — 1/2 sessions done this week
  Box squat 3x10 · Bodyweight squat 3x10 · Wall push-up 2x12 · Recovery stroll 15 min
  "Steady, repeatable work is what muscle and bone respond to."
- Paced respiration — not done today (in 5 / out 5, 90 rounds, 15 min)
- Cool the room before bed — done today

Nutrition today: 4 of 10 rows complete. Water 3/6. Protein 2/3.
Longest current streak: 12-hour overnight fast, 9 days.
Her own habits: "No sweets after 8pm" (resist, 4-day streak).
```

That is roughly 200 tokens and it answers the questions she actually asks — what
am I meant to do today, why is this on my list, am I doing well.

Include the earlier weeks' titles only if she asks about progress; include
`nutritionWhy[id]` only for the row she is asking about. `/api/langchain-rag`
already builds a `userContext` string from `user_profiles` in exactly this
style — a plan digest belongs beside it, not in a second system message.

### Rules the agent must hold

1. **Never invent an exercise.** The catalog is 59 entries and her pool is a
   filtered subset — 22 for a beginner, 43 at medium, all 59 at advanced, 25 for
   movement snacks. Anything outside it was excluded for a reason.
2. **Never restate a nutrition row as advice.** She already has ten rows to tick
   with ten streaks. "Try walking after meals" is a duplicate of
   `post_meal_walk`, not a suggestion. The generator strips these out of habit
   tasks; an agent that adds them back in conversation reverses that.
3. **Never contradict `nutritionWhy`.** It is what she read in the app. If the
   mechanism the agent gives differs from the one on her row, one of them is
   wrong and she has no way to tell which.
4. **Do not reveal a locked week.** Weeks past `currentWeek` come back with an
   empty `tasks` array on purpose.
5. **The plan is not the medical layer.** Dosages, HRT, drug interactions and
   diagnosis go through the RAG knowledge base and its safety validator, not
   through the plan. Nothing in `plan` is a medical claim and it must not be
   spoken as one.
6. **Adherence is context, not a verdict.** A zero-tick week is information for
   tone, not something to open with.

### Writing back

Ticking anything goes through `POST /api/plan/complete` with the task key, her
local `date`, and `count` as the **new total** for that key today (it replaces,
it does not add). `done: false` clears the day. The `(user_id, task_key, date)`
primary key makes it idempotent, so a queued offline tap can be replayed safely.
An agent must never write `user_plan_logs` directly, and must never write
`user_plans` at all.

## 7. Known gaps

- **Task `why` copy is ungated.** `STOCK_PHRASES` rejects hedged filler ("can
  help", "supports", "overall health") in `nutritionWhy` and in
  `resistSuggestions`, where a rejection costs one line that written copy
  replaces. It is not applied to `weeks[].tasks[].why`, because dropping a task
  can push a week under three and throw the whole plan onto the fallback. Some
  task `why` lines are therefore still generic. The prompt bans the phrases; the
  model does not fully comply.
- **`nutritionFocus` is barely personalised.** In practice the model walks the
  catalog in order, one id a week, which is close to what the deterministic
  fallback does. It is not wrong — the order is priority order — but it is not
  adding much either.
- **No `failed` status.** Generation failure is invisible; she gets the fallback
  plan and it is indistinguishable from a good run.
- **Nothing regenerates.** The plan is written once. If her profile changes at
  week 4, the plan does not follow. Changing that means deciding what happens to
  the logged keys, which is why it has not been done.

---

Source: `lib/plan/generate.ts` (prompts, validation, fallback),
`lib/plan/catalog.ts` (the approved content), `app/api/plan/route.ts` (the read
model). Product view: `docs/plan/pillars.md`. Mobile API contract:
`docs/mobile-app-changes.md`.
