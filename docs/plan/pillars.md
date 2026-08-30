# Daily pillars — the contract between the funnel and the habit tracker

For the JSON the generator actually stores per user — every field of
`user_plans.plan`, what the LLM chooses versus what the catalog fixes, and how
to hand it to an AI agent — see [generated-plan.md](generated-plan.md).

The mobile habit tracker gives her a list of things to do each day, grouped into
three pillars. The `/register` funnel lets her taste two of them **before** the
paywall, so the tracker she sees on day 1 is a product she has already used, in
the same words.

| Pillar | Funnel taste | Where |
|---|---|---|
| **Relaxation** | 36-second paced breathing exercise | `phase === "relief"` |
| **Nutrition** | The 10-habit daily checklist below | `phase === "nutrition"` |
| **Movement** | *None — stays locked* | shown as toolkit entry 3 |

Movement is deliberately the one she does *not* get to try. It is tool 3 of 4 in
the `ToolkitStack` on both reward screens, sitting behind a padlock while the
first two unlock in front of her. The paywall is then not a purchase — it's the
way to finish a set she already started.

## Nutrition list

These ten IDs and labels are the contract. The tracker's nutrition section must
reuse them verbatim, in this order, or the funnel will have taught her one
vocabulary and the app will greet her with another. Two places in code hold them
and must stay in step: `NUTRITION_GROUPS` in `app/register/page.tsx` (the funnel)
and `NUTRITION` in `lib/plan/catalog.ts` (the plan).

**All ten appear every day, for every user.** Nutrition is not something the LLM
selects into a week — `GET /api/plan` returns the full grouped list on every
call, and the plan's `nutritionFocus` only marks 1-2 of them as this week's push.
Their log keys are `nut_<id>`, never week-prefixed, so a streak on "25-30g
protein" runs unbroken from day 1 to day 56.

Order is priority order — highest-leverage habit first. The funnel reuses it to
pick her "first 3 swaps for tomorrow" from whatever she left unticked.

The list is the daily vitality log with every write-in blank removed — no meal
times, no fast start/end, no weight, no "what did you eat". A habit is only a
row here if a tap is the entire interaction.

`target` is the ticks a full day takes. It is how the meal structure survives
without three sets of per-meal keys: protein, fat, fiber and the walk are ticked
once per meal, water once per glass, and the count lives on the single key so
one habit keeps one streak. The funnel shows each row as one tap with the
cadence as a chip ("every meal", "6+"); the app's tracker is where it becomes
three ticks.

### Every meal
| id | Label | target |
|---|---|---|
| `protein_25_30g` | 25-30g protein | 3 |
| `healthy_fats` | Healthy fats | 3 |
| `high_fiber` | High-fiber food | 3 |
| `low_gi_fruit` | Low-glycemic fruit only | 1 |
| `post_meal_squats` | 20 squats after eating | 3 |

`post_meal_squats` is nutrition, not movement — it exists to blunt the rise the
meal just caused, and the plan prompt forbids the LLM from writing a movement or
habit task that duplicates it. It was `post_meal_walk` ("10-min walk after
eating") until 2026-08-30: same mechanism, two minutes instead of ten. The id
changed with the label, so ticks logged under `nut_post_meal_walk` are orphaned
rather than recounted.

### Timing & fasting
| id | Label | target |
|---|---|---|
| `fast_12h` | 12-hour overnight fast | 1 |
| `gap_5h` | 5 hours between meals | 1 |
| `no_snacking` | No snacking between meals | 1 |

### Hydration & supplements
| id | Label | target |
|---|---|---|
| `water_6` | Glasses of water | 6 (`max` 8) |
| `supplements` | Daily supplements taken | 1 |

`supplements` has three sub-options — `omega3` (Omega-3), `magnesium`
(Magnesium), `d3k2` (Vitamin D3 + K2). They are shown once the row is ticked and
are **never counted** toward the 10; they exist to name the three supplements
that matter, so even skipping them teaches her something.

### Why each row is on her list

Every row carries a `why` — what she reads when she opens it. It is written
**for her**, at plan generation, and stored on the plan as `nutritionWhy`
(keyed by id, not per week: the ten rows don't change across the eight weeks).

It comes from its own LLM call, not from the plan prompt. Asked for as one more
clause of that prompt, gpt-4o-mini returned ten interchangeable stock lines
("Walking after meals can aid digestion and support weight management") however
firmly the tone rules were written — there is too much else in that prompt for
them to survive. The dedicated call gets the **catalog sentence as its anchor**
and rewrites it in the terms of her symptoms, which is the same bargain as the
exercise catalog: the model personalises, it does not decide the medicine.

Two guarantees hold it up:

- `NutritionItem.why` in the catalog is a written default for every id. It is
  what she gets when the call failed, the id was skipped, or her plan predates
  the field.
- The rewrite is **gated** (`usableWhy()`): 90-240 characters and free of the
  stock phrases the prompt bans ("can help", "supports", "overall health"…). A
  row that fails keeps our sentence, because she is better served by that than
  by a worse rewrite of it. Expect roughly one of the ten to fall back on any
  given run.

## Relaxation list

Breathing exercise (the funnel's version is 3 rounds of in 4 / hold 2 / out 6)
plus the meditations.

## The funnel does not persist any of this

Both taste steps live entirely in React state and die with the page. There is no
DB column, no endpoint, no write. The checklist is a demo, not intake — the
tracker starts fresh on day 1 and she ticks her real first day there.

If that ever changes, note that `saveQuizAnswers()` has already fired by this
point in the funnel and `/api/auth/save-quiz` does a full-object `update()` that
would null out fields if reused — persisting would need its own endpoint.
