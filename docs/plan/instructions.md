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

**5. Week timing.** `started_at` is set the **first time she opens the plan**, not
when she paid — she buys on web and may not install the app for days. Week number
is `floor(days since started_at / 7) + 1`, capped at 8.

**6. Locking.** Past and current weeks return their full task list. Future weeks
return their **title only**, so she sees the whole map but can't jump ahead.

---

## What the LLM is allowed to decide

| Decided by the LLM | Decided by code (the model gets no vote) |
|---|---|
| Which exercises, from her filtered list | Which exercises she's *allowed* — level + injury filters |
| How the 8 weeks progress | How often she trains — set by fitness level |
| Which nutrition & relaxation items, and when | The wording of those items — taken from the catalog |
| The habit tasks (free text) | Minimum 3 exercises per session; sessions are topped up if short |
| The "why" line for each task | Task keys, week numbers, cadence for non-movement tasks |

Two safety rules run **after** the model answers, so it cannot opt out of them:

- **Joint pain** → every high-impact exercise is removed
- **Fitness level** → caps which exercises she can be given at all

---

## The instructions given to the LLM

### System message

> You are Lisa, a warm, evidence-informed menopause companion. You build practical
> 8-week plans by selecting from an approved list. Never invent exercises or
> supplements. Return JSON only.

Model: `gpt-4o-mini` · temperature `0.5` · `response_format: json_object`

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

NUTRITION — pick only these item_ids, and use their label as the title:
{the 9 nutrition ids and labels}

RELAXATION — pick only these item_ids, and use their label as the title:
{the 5 relaxation ids and labels}

Rules:
- Exactly 8 weeks, numbered 1-8. Weeks 1-2 steady the basics, 3-5 build, 6-8 lock it in.
- Each week: 4-5 tasks — at least one movement, one nutrition, one relaxation, one habit.
- Habit tasks are yours to write: one small, concrete daily action
  (e.g. "Cool the room before bed"). Cadence "daily".
- Nutrition and relaxation tasks need item_id and cadence "daily"
  (or "per_day" with a target).
- Movement tasks need an exercises array of 3-6 ids with sets/reps, or minutes for
  cardio. Title the session as a whole ("Lower body strength"), never after one
  exercise.
- Add difficulty gradually. Never introduce more than one new thing per week.
- "why" is one short sentence to her, in second person, tied to her symptoms.
  No medical claims, no dosages.
- pillar and cadence must be lowercase, exactly as written above. Omit fields you
  have no value for — never send null.
- Titles and focus lines are sentence case: "Steady the basics", not
  "Steady The Basics".

Return JSON: {"weeks":[{"number":1,"title":"...","focus":"...","tasks":[{"pillar":"...",
"title":"...","why":"...","cadence":"...","target":1,"item_id":"...",
"exercises":[{"id":"L01","sets":3,"reps":10}]}]}]}
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
   `null` where a field should be missing, over-long titles (truncated).
2. **Validated one task at a time** — a single malformed task is dropped, not the
   whole plan.
3. **Exercises checked against her filtered list** — anything outside it is removed.
4. **Sessions topped up** — the model often returns one exercise when asked for
   3–6. Short sessions are filled from her own list.
5. **Volume overwritten** — movement cadence and target come from the table above,
   never from the model.
6. **Non-movement tasks forced to daily** — only `per_day` carries a real target.
7. **Nutrition & relaxation titles replaced** with the catalog label, so the app and
   the `/register` funnel always use the same words. See [pillars.md](pillars.md).

The plan is only accepted if it has **all 8 weeks with at least 3 tasks each**.
Otherwise the fallback plan is used.

---

## The fallback plan

Used when the LLM fails or its answer doesn't survive the checks. It is still
personalised — her fitness level and injuries filter the exercise list the same
way — it just isn't tailored to her symptoms. Eight fixed week themes, rotating
through the catalog, sets stepping up from 2 to 3 after week 4.

---

## Related

- [exercises.md](exercises.md) — the 59 exercises and their illustration status
- [pillars.md](pillars.md) — the nutrition wording shared with the funnel
- [nutrition.md](nutrition.md) — nutrition tracking copy
