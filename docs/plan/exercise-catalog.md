# Exercise catalog — every movement, by type

Generated from `lib/plan/catalog.ts` (the `E` table + `DOSE` map) on
2026-08-29, after the four-clip top-up and the removal of the physical-limitation
filter.
**`lib/plan/catalog.ts` is the source of truth** — this file is a reading copy,
so regenerate it rather than editing it by hand when the catalog changes.

79 movements: **53 prescribable** (`L` / `I` / `U` / `C` / `P` / `K`) and **26
bookends** — 15 warm-ups (`W`) and 11 stretches (`S`), which `allowedExercises()`
drops by prefix so the generator can never spend a strength slot on a hip circle.
Every clip in the `exercise-clips` bucket has a row here. The converse does not
hold: the two `K` cardio rows carry no clip, deliberately and permanently — a
walk does not need a video. `npm run clips audit` lists them as "catalog ids with
no clip" and passes.

## How to read the columns

| Column | Means |
|---|---|
| **Level** | 1 = anyone · 2 = some equipment/load · 3 = gym or high skill. `maxLevel` gates the pool by her fitness answer. |
| **Impact** | `none` / `low` / `high`. There is no middle value — anything leaving the ground or catching a landing is `high` and is dropped wholesale when she reports `joint_pain` on `q4_symptoms`. That is now the catalog's only body-signal filter. |
| **Snack** | Short, no real setup — eligible for a movement-snack session. |
| **Dose** | The unit the set is measured in. **Every dose is time; there are no reps.** `timed` = sets of work · `hold` = isometric · `carry` = loaded carry · `duration` = one continuous block — the two `K` cardio rows. A seconds figure appears only where `DOSE` pins one — bookends and isometrics, which are not progressed. Everything else opens at the model's prescribed seconds, clamped to 15–90s (`timed`), 10–90s (`hold`), 15–120s (`carry`). |
| **Rest** | Between sets, from `restSeconds()` — by dose unit and level. Bookends and mobility are a flat 15s. |

There was an **Excluded by** column here until 2026-08-29, listing which of the
six `physical_limits` answers stripped each row from her pool. The quiz screen
that collected them and the `LIMITATION_EXCLUDES` rules that applied them were
both removed — a woman who reports pain needs a clinician rather than an
unsupervised eight-week plan, so she is out of scope rather than accommodated.
`joint_pain` is what survives. See `allowedExercises()` in `lib/plan/catalog.ts`.

---

### Lower Body Strength (L01–L17) — 17

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `L01` | Chair squat | Sturdy chair | 1 | none | yes | timed | 45s |
| `L02` | Bodyweight squat | None | 1 | none | yes | timed | 45s |
| `L03` | Goblet squat | 1 dumbbell | 2 | none | — | timed | 60s |
| `L04` | Step-up | Stair or sturdy chair | 1 | low | yes | timed, per side | 45s |
| `L05` | Step-up, loaded | Stair, 2 dumbbells | 2 | low | — | timed, per side | 60s |
| `L06` | Walking lunge | None | 3 | none | — | timed, per side | 90s |
| `L07` | Bulgarian split squat, loaded | Chair or couch, 2 dumbbells | 3 | none | — | timed, per side | 90s |
| `L08` | Bulgarian split squat | Chair or couch | 2 | none | — | timed, per side | 60s |
| `L09` | Split squat, loaded | 2 dumbbells | 2 | none | — | timed, per side | 60s |
| `L10` | Split squat | None | 2 | none | yes | timed, per side | 60s |
| `L11` | Prisoner squat | None | 1 | none | yes | timed | 45s |
| `L12` | Air squat | None | 1 | none | yes | timed | 45s |
| `L13` | Dumbbell sumo deadlift | 1 dumbbell | 2 | none | — | timed | 60s |
| `L14` | Calf raise, loaded | 2 dumbbells | 2 | none | — | timed | 60s |
| `L15` | Calf raise | None | 1 | none | yes | timed | 45s |
| `L16` | Supported reverse lunge | Wall or counter | 2 | none | — | timed, per side | 60s |
| `L17` | Supported lateral lunge | Wall or counter | 2 | none | — | timed, per side | 60s |

### Plyometrics & Force Absorption (I01–I09) — 9

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `I01` | Stomping march | None | 1 | low | yes | timed | 45s |
| `I02` | Box drop deceleration | Low box or bottom stair | 3 | high | — | timed | 90s |
| `I03` | Pogo jump, vertical | None | 2 | high | yes | timed | 60s |
| `I04` | Pogo jump, lateral | None | 2 | high | yes | timed | 60s |
| `I05` | Pogo jump, linear | None | 2 | high | yes | timed | 60s |
| `I06` | Pogo jump, multi-directional | None | 3 | high | — | timed | 90s |
| `I07` | Lateral step and stick | None | 2 | high | — | timed, per side | 60s |
| `I08` | Plyometric skip | None | 3 | high | — | timed | 90s |
| `I09` | Supported heel drop | Wall or counter | 1 | low | yes | timed | 45s |

### Upper Body Strength (U01–U13) — 13

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `U01` | Wall push-up | Wall | 1 | none | yes | timed | 45s |
| `U02` | Table push-up | Kitchen counter or table | 1 | none | yes | timed | 45s |
| `U03` | Bench push-up | Sturdy bench or chair | 2 | none | yes | timed | 60s |
| `U04` | Dumbbell floor press | 2 dumbbells, floor | 2 | none | — | timed | 60s |
| `U05` | Seated overhead press | 2 dumbbells, chair | 2 | none | — | timed | 60s |
| `U06` | Standing overhead press | 2 dumbbells | 2 | none | — | timed | 60s |
| `U07` | Bent-over dumbbell row | 2 dumbbells | 2 | none | — | timed | 60s |
| `U08` | Single-arm dumbbell row | 1 dumbbell, chair or bench | 2 | none | — | timed, per side | 60s |
| `U09` | Rear-delt fly | 2 dumbbells | 2 | none | — | timed | 60s |
| `U10` | Y-T-W shoulder raise | Mat | 1 | none | — | timed | 45s |
| `U11` | Dumbbell lateral raise | 2 dumbbells | 2 | none | — | timed | 60s |
| `U12` | Seated overhead triceps extension | 1 dumbbell, chair | 2 | none | — | timed | 60s |
| `U13` | Standing dumbbell biceps curl | 2 dumbbells | 2 | none | — | timed | 60s |

### Core & Posterior Stability — trunk (C01–C09) — 9

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `C01` | Wall sit | Wall | 1 | none | yes | hold · 30s | 45s |
| `C02` | Bird-dog | Mat | 1 | none | yes | timed, per side | 45s |
| `C03` | Farmer's carry | 2 heavy dumbbells | 2 | none | — | carry · 40s | 60s |
| `C04` | Forearm plank | Mat | 1 | none | yes | hold · 20s | 45s |
| `C05` | Side plank | Mat | 2 | none | — | hold, per side · 15s | 45s |
| `C06` | Dead bug | Mat | 1 | none | yes | timed, per side | 45s |
| `C07` | Mountain climber | Mat | 2 | low | yes | timed | 60s |
| `C08` | Oblique twist | Mat | 2 | none | yes | timed, per side | 60s |
| `C09` | Supported single-leg stand | Wall or counter | 1 | none | yes | hold, per side · 30s | 45s |

### Core & Posterior Stability — hinge (P01–P03) — 3

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `P01` | Glute bridge | Mat | 1 | none | yes | timed | 45s |
| `P02` | Glute bridge, weighted | Mat, 1 dumbbell | 2 | none | — | timed | 60s |
| `P03` | Romanian deadlift | 2 dumbbells | 2 | none | — | timed | 60s |

### Warm-up & Mobility (W01–W15) — 15

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `W01` | Lateral leg swings | Wall or counter | 1 | none | — | timed, per side · 20s | 15s |
| `W02` | Dynamic movement prep | None | 1 | none | — | timed · 60s | 15s |
| `W03` | PVC around the world | Broomstick or PVC pipe | 1 | none | — | timed · 40s | 15s |
| `W04` | Shoulder mobility | None | 1 | none | — | timed · 40s | 15s |
| `W05` | Open book cross | Mat | 1 | none | — | timed, per side · 20s | 15s |
| `W06` | Hip circles | None | 1 | none | — | timed, per side · 20s | 15s |
| `W07` | Cobra spinal extension | Mat | 1 | none | — | timed · 40s | 15s |
| `W08` | World's greatest stretch | Mat | 1 | none | — | timed, per side · 20s | 15s |
| `W09` | Deep squat with thoracic reach | None | 1 | none | — | timed, per side · 20s | 15s |
| `W10` | Hamstring rocker | Mat | 1 | none | — | timed, per side · 20s | 15s |
| `W11` | Thread the needle | Mat | 1 | none | — | timed, per side · 20s | 15s |
| `W12` | Full warm-up sequence | None | 1 | none | — | timed · 90s | 15s |
| `W13` | Integrated mobility flow | Mat | 1 | none | — | timed · 90s | 15s |
| `W14` | Inchworm to plank reach | Mat | 1 | none | — | timed · 40s | 15s |
| `W15` | Linear leg swings | Wall or counter | 1 | none | — | timed, per side · 20s | 15s |

### Post-Lower Body Routine (S01–S06) — 6

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `S01` | Toe and heel calf stretch | Wall or step | 1 | none | yes | hold, per side · 30s | 15s |
| `S02` | Kneeling hip flexor stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s |
| `S03` | Kneeling hamstring stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s |
| `S04` | Child's pose | Mat | 1 | none | yes | hold · 40s | 15s |
| `S05` | Butterfly stretch | Mat | 1 | none | yes | hold · 40s | 15s |
| `S06` | Supine figure-4 stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s |

### Post-Upper Body Routine (S07–S11) — 5

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `S07` | Cross-arm shoulder stretch | None | 1 | none | yes | hold, per side · 30s | 15s |
| `S08` | Seated side bend | Mat | 1 | none | yes | hold, per side · 30s | 15s |
| `S09` | Seated spinal twist | Mat | 1 | none | yes | hold, per side · 30s | 15s |
| `S10` | Chest and shoulder stretch | Wall or doorway | 1 | none | yes | hold, per side · 30s | 15s |
| `S11` | Standing shoulder stretch | None | 1 | none | yes | hold · 40s | 15s |

### Cardio (K01–K02) — 2 · not filmed

No clips, deliberately and permanently — the app draws name and props with no
player, which for "walk at a pace where you could talk but not sing" is the
correct presentation rather than a degraded one. Both are `impact: none`, so
cardio survives a `joint_pain` answer intact.

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest |
|---|---|---|---|---|---|---|---|
| `K01` | Zone 2 cardio | Any activity — walk, bike, swim, row, elliptical | 1 | none | — | duration · 15 min | — |
| `K02` | Sprint intervals | Bike, elliptical, rower, or brisk incline walk | 2 | none | — | duration · 19 min | — |

`K02` is the only protocol row: 30s at ~90% effort, 2 min easy, 3 rounds, inside
a 5–10 min warm-up and a 5 min cool-down on the same activity. Level 2, so a
beginner never sees it.

---

## Pool notes

- **The lower-body pool is shallower than 17 suggests.** The shoot filmed loaded
  and bodyweight versions of the same lift as separate clips (four squats, three
  split squats, two step-ups, two calf raises) — roughly eight distinct patterns.
  Right for progression, worth remembering when a "use N different ids" rule is
  satisfied by four squats. `L17` is the eighth and the only frontal-plane one:
  every other split position in the catalog travels forward or back.
- **`I01` and `I09` are the bone loading a joint-pain user gets.** Everything
  else in the plyometric series is `high` impact, so `joint_pain` drops it. `I01`
  was the only survivor until 2026-08-29; `I09` is the second, graded `low` on
  the same reasoning as the stomping march (the heel meets the floor under
  control, with a hand on the counter). If a future shoot adds only high-impact
  `I` rows, this is back to one and `ensureBoneLoading()` covers four of eight
  weeks with a single movement.
- **`C09` is the only balance row.**
- **`L13` and `P03` are the only hinges**, alongside the glute bridges
  (`P01`/`P02`) in the posterior chain.
- **`U01`–`U03` are a graded ramp** (wall → table → bench). So are the scapular
  moves `U09`/`U10`.
- **`C` and `P` are one shoot series under two prefixes.** They stay apart
  because the prefix is what `ensureBoneLoading()` and the prompt's bone rule
  test — under a prefix rule `I` must not collide with the posterior chain.
- **`W` and `S` are two pools, not one.** A leg swing prepares a joint for load;
  a 40-second butterfly hold does the opposite. They get separate enums in the
  response schema, so a stretch in the warm-up slot is a token the model cannot
  emit.
- **The `S` lower/upper split is a block boundary, not a prefix.** `S01`–`S06`
  follow a leg session, `S07`–`S11` an upper-body one, but `allowedCooldowns()`
  draws from one pool — splitting it is a second predicate in the catalog, not a
  rename in the bucket.

## Defaults

Used when the plan did not write its own bookends.

| | Movements |
|---|---|
| `DEFAULT_WARMUP` | `W04` shoulder mobility · `W06` hip circles · `W09` deep squat with thoracic reach — shoulders, hips, spine, all props `"None"` on purpose; 120s |
| `DEFAULT_COOLDOWN` | `S06` supine figure-4 · `S04` child's pose — glutes, then spine; 100s |

## Pool sizes

Measured against the live catalog by `npm run verify-plan-dose`. With the
limitation filter gone, `joint_pain` is the only answer that moves these numbers.

| Fitness answer | Full pool | + `joint_pain` |
|---|---|---|
| `beginner` (level 1) | 18 | 18 |
| `medium` (level ≤2) | 48 | 44 |
| `advanced` (level ≤3) | 53 | 46 |
| `movement_snacks` | 23 | 20 |

Beginner is unmoved because nothing at level 1 is `high` impact. All five filmed
prescribable families (`L`, `I`, `U`, `C`, `P`) survive at every floor, and so
does `K` everywhere except `movement_snacks`, which excludes cardio by shape.
Bookends are no longer filtered at all: **15 warm-ups** and **11 stretches**, the
same for everyone.
