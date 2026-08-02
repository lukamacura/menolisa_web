# Daily pillars — the contract between the funnel and the habit tracker

The mobile habit tracker gives her a list of things to do each day, grouped into
three pillars. The `/register` funnel lets her taste two of them **before** the
paywall, so the tracker she sees on day 1 is a product she has already used, in
the same words.

| Pillar | Funnel taste | Where |
|---|---|---|
| **Relaxation** | 36-second paced breathing exercise | `phase === "relief"` |
| **Nutrition** | The 9-habit daily checklist below | `phase === "nutrition"` |
| **Movement** | *None — stays locked* | shown as toolkit entry 3 |

Movement is deliberately the one she does *not* get to try. It is tool 3 of 4 in
the `ToolkitStack` on both reward screens, sitting behind a padlock while the
first two unlock in front of her. The paywall is then not a purchase — it's the
way to finish a set she already started.

## Nutrition list

These nine IDs and labels are the contract. The tracker's nutrition section must
reuse them verbatim, in this order, or the funnel will have taught her one
vocabulary and the app will greet her with another. Source of truth in code:
`NUTRITION_GROUPS` in `app/register/page.tsx`.

Order is priority order — highest-leverage habit first. The funnel reuses it to
pick her "first 3 swaps for tomorrow" from whatever she left unticked.

### Meals & nutrients
| id | Label |
|---|---|
| `fat_protein_breakfast` | Fat & protein for breakfast |
| `fat_protein_meals` | Fat & protein with every meal |
| `high_fiber` | Added high-fiber foods |
| `low_gi_fruit` | Low-glycemic fruits only |

### Timing & fasting
| id | Label |
|---|---|
| `gap_5h` | 5 hours between meals |
| `fast_12h` | 12-hour fasting window |
| `no_snacking` | No snacking between meals |

### Hydration & supplements
| id | Label |
|---|---|
| `water_6` | Drank 6+ glasses of water |
| `supplements` | Daily supplements taken |

`supplements` has three sub-options — `omega3` (Omega-3), `magnesium`
(Magnesium), `d3k2` (Vitamin D3 + K2). They are shown once the row is ticked and
are **never counted** toward the 9; they exist to name the three supplements that
matter, so even skipping them teaches her something.

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
