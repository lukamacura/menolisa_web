# The 8-week plan — how it works, and what the LLM is told

Source of truth in code: `lib/plan/generate.ts` and `lib/plan/catalog.ts`.
If you change the prompt in one place, change it in the other.

---

## How the flow works

```
She finishes the quiz          → answers saved to user_profiles
She pays (Stripe, on web)      → webhook marks the plan "generating", then builds it in the background
LLM builds all 8 weeks at once → saved as JSON in user_plans.plan
She opens the app              → GET /api/plan returns her plan
She ticks a task               → POST /api/plan/complete saves it for that day
```

**1. Purchase.** `app/api/stripe/webhook/route.ts` handles `checkout.session.completed`.
It calls `markPlanGenerating(userId)` immediately (fast, so Stripe gets its 200),
then runs `generatePlan(userId)` in the background via `after()`.

**2. Generation.** `generatePlan` reads her quiz answers from `user_profiles`,
filters the exercise catalog down to what she's allowed, calls the LLM once for
all 8 weeks, validates the result, and saves it to `user_plans`.

If the LLM fails or drifts off the catalog, a deterministic fallback plan is used
instead. She always ends up with a plan.

**3. Recovery.** If generation never finishes (function evicted, OpenAI hung),
`GET /api/plan` re-kicks it when she opens the app. There is no separate cron.

**4. Reading it.** `GET /api/plan?date=YYYY-MM-DD` returns everything the daily
screen needs in one call. Mobile and web use the same endpoint — Bearer token for
the app, cookie for the web dashboard.

The one difference between them is `?media=1`, which the Expo app passes and the
web dashboard does not: exercise clips are mobile-only, so only that caller gets
`video` URLs. See [exercises.md](exercises.md).

**5. Week timing.** `started_at` is set the **first time she opens the plan**, not
when she paid — she buys on web and may not install the app for days. Week number
is `floor(days since started_at / 7) + 1`, capped at 8.

**6. Locking.** Past and current weeks return their full task list. Future weeks
return their **title only**, so she sees the whole map but can't jump ahead.

---

## The four pillars are not four of the same thing

This is the shape of the whole feature, and it is deliberately uneven:

| Pillar | Where it lives | Who chooses | Cadence |
|---|---|---|---|
| **Movement** | A weekly task with 3-6 exercise ids and a clip each | LLM picks ids from her filtered pool | `weekly` × her level, or `per_day` for snacks |
| **Nutrition** | **Not a task.** All 9 items, every day, for everyone | Nobody — fixed list. The week only *highlights* 1-2 | Daily, always |
| **Relaxation** | A weekly task pointing at one catalog practice | LLM picks the item_id | Daily |
| **Habits** | Two kinds — see below | She does. LLM only suggests | Daily |

**Habits split in two**, because building and quitting are not the same act:

- **build** — a small thing she *adds*. Written free-text by the LLM, one per
  week, lives in the plan JSON ("Cool the room before bed").
- **resist** — a temptation she gets credit for *not* giving in to. Lives in
  `user_habits` with `kind='resist'`, so it persists across weeks and its streak
  never resets at a week boundary. The LLM writes four personalised
  `resistSuggestions` from her symptoms; **she opts in.** We never auto-add one —
  a resist habit she didn't choose isn't a habit, it's a lecture.

---

## What the LLM is allowed to decide

| Decided by the LLM | Decided by code (the model gets no vote) |
|---|---|
| Which exercises, from her filtered list | Which exercises she's *allowed* — level + injury filters |
| — | Which clip plays, and whether one is sent at all — the model only ever emits ids |
| How the 8 weeks progress | How often she trains — set by fitness level |
| Which relaxation item, and when | The wording of that item — taken from the catalog |
| Which 1-2 nutrition ids a week highlights | The nutrition list itself — all 9, every day, unchangeable |
| The build-habit text and the resist suggestions | Whether a resist suggestion is adopted — she chooses |
| The "why" line for each task | Task keys, week numbers, cadence for non-movement tasks |

Two safety rules run **before** the prompt is even built, so the model never sees
what it isn't allowed to give:

- **Joint pain** → every high-impact exercise is removed from her pool
- **Fitness level** → caps which exercises she can be given at all

---

## The instructions given to the LLM

### System message

> You are Lisa, a warm, evidence-informed menopause companion. You build practical
> 8-week plans by selecting from an approved list. Never invent exercises or
> supplements. Return JSON only.

Model: `gpt-4o-mini` · temperature `0.5` · `response_format: json_schema`, `strict: true`

The schema is built per-user by `planJsonSchema(pool)` and every id is an
**enum**: her allowed exercise ids, the nine relaxation ids, the ten nutrition
ids, the three pillars, the three cadences. Under `json_object` these were
prose rules the model could ignore — and did: it read "relaxation" and put the
movement id `M03` in `item_id` about once in three plans, which dropped that
task, left the week with two, and failed the completeness check so the whole
personalized plan was thrown away for the deterministic one. As enums they are
unrepresentable rather than rejected.

Two consequences for the prompt: every field must be present, so `item_id` is
sent as `null` on movement and habit tasks and `exercises` as `null` on
anything that isn't movement; and bounds keywords (`minItems`, `maximum`, …)
aren't supported in strict mode, so counts and lengths stay in `PlanSchema`,
which clamps rather than rejects.

### User message

Everything in `{braces}` is filled in from her quiz answers.

```
Woman in menopause. Build her 8-week plan.

Her answers:
- Symptoms, worst first: {top_problems}
- Goals, most important first: {goals}
- Stage: {here_for} · struggling for: {timing}
- Age: {age_band} · HRT: {hrt_status}
- Fitness level: {fitness_level} · readiness: {qualifier}

MOVEMENT — pick only these exercise ids, and give {movement volume}:
{her filtered exercise list, as "L01 Box squat | L02 Bodyweight squat | ..."}

RELAXATION — pick only these item_ids, and use their label as the title:
{the 9 relaxation ids, labels and "use" lines}

NUTRITION — all nine of these are shown to her every day; you do not create
nutrition tasks. You only name 1-2 ids per week as "nutrition_focus":
{the 9 nutrition ids and labels}

Rules:
- Exactly 8 weeks, numbered 1-8. Weeks 1-2 steady the basics, 3-5 build, 6-8 lock it in.
- Each week: 3-4 tasks — at least one movement, one relaxation, one habit. No
  nutrition tasks.
- Each week also needs "nutrition_focus": 1-2 nutrition ids to push on that week.
  Build on the previous week; do not restart from the same id every week.
- Habit tasks are yours to write: one small, concrete daily action she ADDS
  (e.g. "Cool the room before bed"). Cadence "daily". Never write a habit about
  quitting something — that is what resist_suggestions is for.
- Relaxation tasks need item_id and cadence "daily" (or "per_day" with a target).
  Match the item to her worst symptom: hot flashes get breath_hotflash, night
  waking gets breath_sleep, anxiety or palpitations get breath_sigh.
- Movement tasks need an exercises array of 3-6 ids with sets/seconds, or minutes
  for one continuous block. Every dose is time — there are no repetitions. Title
  the session as a whole ("Lower body strength"), never after one exercise.
- Titles and focus lines are sentence case: "Steady the basics", not
  "Steady The Basics".
- Add difficulty gradually. Never introduce more than one new thing per week.
- "why" is one short sentence to her, in second person, tied to her symptoms.
  No medical claims, no dosages.
- pillar and cadence must be lowercase, exactly as written above. Omit fields you
  have no value for — never send null.

RESIST — separately, write 4 "resist_suggestions": specific temptations SHE is
likely to face given her symptoms, each one she gets credit for resisting for a
day. Phrase each as the thing not done, concrete and time-bound where it helps
("No sweets after 8pm", "Phone stays out of the bedroom"). Draw them from what her
symptoms actually predict — sleep trouble suggests the late screen and the evening
wine, cravings suggest the 3pm sugar. Never suggest quitting a medication or HRT.
"why" is one warm sentence, no shame.

Return JSON: {"weeks":[{"number":1,"title":"...","focus":"...",
"nutrition_focus":["protein_25_30g"],"tasks":[{"pillar":"...","title":"...",
"why":"...","cadence":"...","target":1,"item_id":"...",
"exercises":[{"id":"L01","sets":3,"seconds":40}]}]}],
"resist_suggestions":[{"title":"...","why":"..."}]}
```

### Movement volume, by fitness level

The `{movement volume}` line above is filled from her quiz answer:

| Fitness level | What the prompt asks for | Cadence |
|---|---|---|
| `beginner` | 2 sessions per week, ~18 min | `weekly`, target 2 |
| `medium` | 3 sessions per week, ~28 min | `weekly`, target 3 |
| `advanced` | 4 sessions per week, ~35 min | `weekly`, target 4 |
| `movement_snacks` | 4 short bursts **per day**, ~5 min | `per_day`, target 4 |

`movement_snacks` is a cadence, not a difficulty — she gets short, no-setup moves
she can repeat through the day, not easier ones.

---

## What happens to the model's answer

Everything below runs in `sanitize()` before the plan is saved.

1. **Tolerated and fixed** — capitalized enums (`"Movement"` → `movement`),
   lowercase exercise ids (`"l01"` → `L01`), `null` where a field should be
   missing, over-long titles (truncated).
2. **Validated one task at a time** — a single malformed task is dropped, not the
   whole plan. An unknown pillar (including a leftover `nutrition` task) is dropped.
3. **Exercises checked against her filtered list** — anything outside it is removed,
   and a movement task left with none is **filled from her pool**, not dropped.
   Likewise a relaxation `item_id` that isn't in the catalog is **repaired** by
   `relaxationForSymptom()`, matched to her worst symptom and skipping any
   practice already used that week. Dropping it was what made one word
   association cost the whole plan; the strict schema should now make both
   cases unreachable, and they stay as the belt to its braces.
4. **Sessions topped up** — the model often returns one exercise when asked for
   3–6. Short sessions are filled from her own list.
5. **Volume overwritten** — movement cadence and target come from the table above,
   never from the model.
6. **Non-movement tasks forced to daily** — only `per_day` carries a real target.
7. **Relaxation titles replaced** with the catalog label, so the app and the
   `/register` funnel always use the same words.
8. **`nutrition_focus` filtered** to real ids and capped at 2.
9. **Resist suggestions** validated individually; if none survive, the generic
   four are used rather than losing an otherwise good 8 weeks.

The plan is only accepted if it has **all 8 weeks with at least 3 tasks each**.
Otherwise the fallback plan is used.

---

## Task keys — what streaks hang off

`user_plan_logs` has primary key `(user_id, task_key, date)`. The key decides
whether a streak survives a week boundary:

| Kind | Key | Resets weekly? |
|---|---|---|
| Movement session | `w3_movement0` | Yes — it's a different session each week |
| Build habit | `w3_habit2` | Yes — it's a different habit each week |
| Relaxation | `w3_breath_hotflash` | Yes, but the id is stable, so a "since week 1" view is possible |
| **Nutrition** | `nut_protein_25_30g` | **No** — never week-prefixed |
| **Resist habit** | `habit_<uuid>` | **No** — lives in `user_habits` |

The two that are scored on streak are exactly the two that aren't week-prefixed.
That is the reason for the difference, not an accident.

---

## The fallback plan

Used when the LLM fails or its answer doesn't survive the checks. It is still
personalised — her fitness level and injuries filter the exercise list the same
way — it just isn't tailored to her symptoms. Eight fixed week themes, rotating
through the catalog, sets stepping up from 2 to 3 after week 4, `nutritionFocus`
walking the nine in priority order two a week so all nine get pushed by week 8,
and four generic resist suggestions.

---

## Related

- [exercises.md](exercises.md) — how the shoot's seven series map onto the catalog's prefixes, and why filenames are not ids
- [pillars.md](pillars.md) — the nutrition wording shared with the funnel
- [relaxation.md](relaxation.md) — the breathing patterns and why they're timed that way
- [nutrition.md](nutrition.md) — nutrition tracking copy
