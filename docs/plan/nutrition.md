# Nutrition — the daily log, as the app tracks it

Source: the paper "Daily Menopause Vitality Log". Everything on that sheet that
was a blank to write in — the date, the weight, the protein she ate, the time
she broke her fast, the time she started it — is **not** here. A row exists only
where ticking it is the whole interaction.

The paper log gets its meal structure from printing the same block three times.
The app gets it from a count on one row: `target` is how many ticks a full day
takes.

## 🥗 Every meal
| Label | Ticks a day |
|---|---|
| 25-30g protein | 3 |
| Healthy fats | 3 |
| High-fiber food | 3 |
| Low-glycemic fruit only | 1 |
| 10-min walk after eating | 3 |

The post-meal walk is a nutrition row, not a movement one — it is what flattens
the glucose rise the meal just caused, so it belongs to the meal.

## ⏳ Timing & fasting
| Label | Ticks a day |
|---|---|
| 12-hour overnight fast | 1 |
| 5 hours between meals | 1 |
| No snacking between meals | 1 |

## 💧 Hydration & supplements
| Label | Ticks a day |
|---|---|
| Glasses of water (6+, up to 8) | 6 |
| Daily supplements taken | 1 |

Supplement sub-options: Omega-3 · Magnesium · Vitamin D3 + K2

IDs, order and grouping live in `docs/plan/pillars.md` — that is the contract
the funnel and the tracker both hold to.
