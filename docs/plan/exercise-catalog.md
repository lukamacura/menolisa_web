# Exercise catalog — every movement, by type

Generated from `lib/plan/catalog.ts` (the `E` table + `DOSE` map +
`LIMITATION_EXCLUDES`) on 2026-08-28. **`lib/plan/catalog.ts` is the source of
truth** — this file is a reading copy, so regenerate it rather than editing it
by hand when the catalog changes.

73 movements: **47 prescribable** (`L` / `I` / `U` / `C` / `P`) and **26
bookends** — 15 warm-ups (`W`) and 11 stretches (`S`), which `allowedExercises()`
drops by prefix so the generator can never spend a strength slot on a hip circle.
Every row has a clip in the `exercise-clips` bucket; every clip has a row.

## How to read the columns

| Column | Means |
|---|---|
| **Level** | 1 = anyone · 2 = some equipment/load · 3 = gym or high skill. `maxLevel` gates the pool by her fitness answer. |
| **Impact** | `none` / `low` / `high`. There is no middle value — anything leaving the ground or catching a landing is `high` and is dropped wholesale by `joint_pain` and by every limitation except `shoulder`. |
| **Snack** | Short, no real setup — eligible for a movement-snack session. |
| **Dose** | The unit the set is measured in. **Every dose is time; there are no reps.** `timed` = sets of work · `hold` = isometric · `carry` = loaded carry · `duration` = one continuous block (currently no members). A seconds figure appears only where `DOSE` pins one — bookends and isometrics, which are not progressed. Everything else opens at the model's prescribed seconds, clamped to 15–90s (`timed`), 10–90s (`hold`), 15–120s (`carry`). |
| **Rest** | Between sets, from `restSeconds()` — by dose unit and level. Bookends and mobility are a flat 15s. |
| **Excluded by** | Which `physical_limits` answers strip this row from her pool *before the model sees it*. A `high` impact row is excluded by `joint_pain` and by five of the six limitations, so it is marked as such rather than listed five times. `shoulder` is the one rule with no impact clause — a sore shoulder is not a reason to drop bone loading. |

---

### Lower Body Strength (L01–L16) — 16

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `L01` | Chair squat | Sturdy chair | 1 | none | yes | timed | 45s | — |
| `L02` | Bodyweight squat | None | 1 | none | yes | timed | 45s | — |
| `L03` | Goblet squat | 1 dumbbell | 2 | none | — | timed | 60s | — |
| `L04` | Step-up | Stair or sturdy chair | 1 | low | yes | timed, per side | 45s | `knee` |
| `L05` | Step-up, loaded | Stair, 2 dumbbells | 2 | low | — | timed, per side | 60s | `knee` |
| `L06` | Walking lunge | None | 3 | none | — | timed, per side | 90s | `back`, `knee`, `hip`, `balance` |
| `L07` | Bulgarian split squat, loaded | Chair or couch, 2 dumbbells | 3 | none | — | timed, per side | 90s | `knee`, `hip`, `balance` |
| `L08` | Bulgarian split squat | Chair or couch | 2 | none | — | timed, per side | 60s | `knee`, `hip`, `balance` |
| `L09` | Split squat, loaded | 2 dumbbells | 2 | none | — | timed, per side | 60s | `knee`, `hip`, `balance` |
| `L10` | Split squat | None | 2 | none | yes | timed, per side | 60s | `knee`, `hip`, `balance` |
| `L11` | Prisoner squat | None | 1 | none | yes | timed | 45s | — |
| `L12` | Air squat | None | 1 | none | yes | timed | 45s | — |
| `L13` | Dumbbell sumo deadlift | 1 dumbbell | 2 | none | — | timed | 60s | `back`, `hip`, `pelvic_floor` |
| `L14` | Calf raise, loaded | 2 dumbbells | 2 | none | — | timed | 60s | — |
| `L15` | Calf raise | None | 1 | none | yes | timed | 45s | — |
| `L16` | Supported reverse lunge | Wall or counter | 2 | none | — | timed, per side | 60s | `knee`, `hip` |

### Plyometrics & Force Absorption (I01–I08) — 8

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `I01` | Stomping march | None | 1 | low | yes | timed | 45s | — |
| `I02` | Box drop deceleration | Low box or bottom stair | 3 | high | — | timed | 90s | high impact — dropped by joint pain + all but `shoulder` |
| `I03` | Pogo jump, vertical | None | 2 | high | yes | timed | 60s | high impact — dropped by joint pain + all but `shoulder` |
| `I04` | Pogo jump, lateral | None | 2 | high | yes | timed | 60s | high impact — dropped by joint pain + all but `shoulder` |
| `I05` | Pogo jump, linear | None | 2 | high | yes | timed | 60s | high impact — dropped by joint pain + all but `shoulder` |
| `I06` | Pogo jump, multi-directional | None | 3 | high | — | timed | 90s | high impact — dropped by joint pain + all but `shoulder` |
| `I07` | Lateral step and stick | None | 2 | high | — | timed, per side | 60s | high impact — dropped by joint pain + all but `shoulder` |
| `I08` | Plyometric skip | None | 3 | high | — | timed | 90s | high impact — dropped by joint pain + all but `shoulder` |

### Upper Body Strength (U01–U12) — 12

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `U01` | Wall push-up | Wall | 1 | none | yes | timed | 45s | — |
| `U02` | Table push-up | Kitchen counter or table | 1 | none | yes | timed | 45s | — |
| `U03` | Bench push-up | Sturdy bench or chair | 2 | none | yes | timed | 60s | — |
| `U04` | Dumbbell floor press | 2 dumbbells, floor | 2 | none | — | timed | 60s | `shoulder` |
| `U05` | Seated overhead press | 2 dumbbells, chair | 2 | none | — | timed | 60s | `shoulder` |
| `U06` | Standing overhead press | 2 dumbbells | 2 | none | — | timed | 60s | `shoulder` |
| `U07` | Bent-over dumbbell row | 2 dumbbells | 2 | none | — | timed | 60s | `back` |
| `U08` | Single-arm dumbbell row | 1 dumbbell, chair or bench | 2 | none | — | timed, per side | 60s | `back` |
| `U09` | Rear-delt fly | 2 dumbbells | 2 | none | — | timed | 60s | — |
| `U10` | Y-T-W shoulder raise | Mat | 1 | none | — | timed | 45s | — |
| `U11` | Dumbbell lateral raise | 2 dumbbells | 2 | none | — | timed | 60s | `shoulder` |
| `U12` | Seated overhead triceps extension | 1 dumbbell, chair | 2 | none | — | timed | 60s | `shoulder` |

### Core & Posterior Stability — trunk (C01–C08) — 8

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `C01` | Wall sit | Wall | 1 | none | yes | hold · 30s | 45s | `knee` |
| `C02` | Bird-dog | Mat | 1 | none | yes | timed, per side | 45s | — |
| `C03` | Farmer's carry | 2 heavy dumbbells | 2 | none | — | carry · 40s | 60s | `back`, `pelvic_floor` |
| `C04` | Forearm plank | Mat | 1 | none | yes | hold · 20s | 45s | `pelvic_floor` |
| `C05` | Side plank | Mat | 2 | none | — | hold, per side · 15s | 45s | — |
| `C06` | Dead bug | Mat | 1 | none | yes | timed, per side | 45s | — |
| `C07` | Mountain climber | Mat | 2 | low | yes | timed | 60s | `back`, `shoulder`, `pelvic_floor` |
| `C08` | Oblique twist | Mat | 2 | none | yes | timed, per side | 60s | — |

### Core & Posterior Stability — hinge (P01–P03) — 3

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `P01` | Glute bridge | Mat | 1 | none | yes | timed | 45s | — |
| `P02` | Glute bridge, weighted | Mat, 1 dumbbell | 2 | none | — | timed | 60s | — |
| `P03` | Romanian deadlift | 2 dumbbells | 2 | none | — | timed | 60s | `back`, `pelvic_floor` |

### Warm-up & Mobility (W01–W15) — 15

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `W01` | Lateral leg swings | Wall or counter | 1 | none | — | timed, per side · 40s | 15s | — |
| `W02` | Dynamic movement prep | None | 1 | none | — | timed · 60s | 15s | — |
| `W03` | PVC around the world | Broomstick or PVC pipe | 1 | none | — | timed · 40s | 15s | `shoulder` |
| `W04` | Shoulder mobility | None | 1 | none | — | timed · 40s | 15s | — |
| `W05` | Open book cross | Mat | 1 | none | — | timed, per side · 40s | 15s | — |
| `W06` | Hip circles | None | 1 | none | — | timed, per side · 40s | 15s | — |
| `W07` | Cobra spinal extension | Mat | 1 | none | — | timed · 40s | 15s | — |
| `W08` | World's greatest stretch | Mat | 1 | none | — | timed, per side · 40s | 15s | `back`, `knee`, `hip`, `balance` |
| `W09` | Deep squat with thoracic reach | None | 1 | none | — | timed, per side · 40s | 15s | `knee`, `hip`, `pelvic_floor` |
| `W10` | Hamstring rocker | Mat | 1 | none | — | timed, per side · 40s | 15s | — |
| `W11` | Thread the needle | Mat | 1 | none | — | timed, per side · 40s | 15s | — |
| `W12` | Full warm-up sequence | None | 1 | none | — | timed · 90s | 15s | — |
| `W13` | Integrated mobility flow | Mat | 1 | none | — | timed · 90s | 15s | — |
| `W14` | Inchworm to plank reach | Mat | 1 | none | — | timed · 40s | 15s | `back`, `shoulder`, `pelvic_floor` |
| `W15` | Linear leg swings | Wall or counter | 1 | none | — | timed, per side · 40s | 15s | — |

### Post-Lower Body Routine (S01–S06) — 6

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `S01` | Toe and heel calf stretch | Wall or step | 1 | none | yes | hold, per side · 30s | 15s | — |
| `S02` | Kneeling hip flexor stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s | `knee` |
| `S03` | Kneeling hamstring stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s | `back` |
| `S04` | Child's pose | Mat | 1 | none | yes | hold · 40s | 15s | `knee` |
| `S05` | Butterfly stretch | Mat | 1 | none | yes | hold · 40s | 15s | `hip` |
| `S06` | Supine figure-4 stretch | Mat | 1 | none | yes | hold, per side · 30s | 15s | — |

### Post-Upper Body Routine (S07–S11) — 5

| ID | Exercise | Props | Level | Impact | Snack | Dose | Rest | Excluded by |
|---|---|---|---|---|---|---|---|---|
| `S07` | Cross-arm shoulder stretch | None | 1 | none | yes | hold, per side · 30s | 15s | — |
| `S08` | Seated side bend | Mat | 1 | none | yes | hold, per side · 30s | 15s | — |
| `S09` | Seated spinal twist | Mat | 1 | none | yes | hold, per side · 30s | 15s | — |
| `S10` | Chest and shoulder stretch | Wall or doorway | 1 | none | yes | hold, per side · 30s | 15s | `shoulder` |
| `S11` | Standing shoulder stretch | None | 1 | none | yes | hold · 40s | 15s | — |

---

## Pool notes

- **The lower-body pool is shallower than 16 suggests.** The shoot filmed loaded
  and bodyweight versions of the same lift as separate clips (four squats, three
  split squats, two step-ups, two calf raises) — roughly seven distinct patterns.
  Right for progression, worth remembering when a "use N different ids" rule is
  satisfied by four squats.
- **`I01` is the only bone loading a limited user can get.** Everything else in
  the plyometric series is `high` impact, so `joint_pain` and five of six
  limitations drop it. `ensureBoneLoading()` then covers four of eight weeks
  with the same movement. A second low-impact clip is the cheapest content fix
  left in the catalog.
- **`L13` and `P03` are the only hinges.** A `back`, `hip` or `pelvic_floor`
  answer takes both, leaving the glute bridges (`P01`/`P02`) as the whole
  posterior chain.
- **`U01`–`U03` are a graded ramp** (wall → table → bench) and stay in for a sore
  shoulder deliberately — that ladder *is* the way back. So do the scapular moves
  `U09`/`U10`.
- **`C` and `P` are one shoot series under two prefixes**, kept apart because
  different limitations exclude them: `pelvic_floor` wants the plank gone and the
  bridge kept.
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
| `DEFAULT_WARMUP` | `W04` shoulder mobility · `W06` hip circles · `W09` deep squat with thoracic reach — shoulders, hips, spine, all props `"None"` on purpose |
| `DEFAULT_COOLDOWN` | `S06` supine figure-4 · `S02` kneeling hip flexor · `S04` child's pose — hips, front of hip, spine; about two minutes |

## Pool sizes

Measured against the live catalog. "Worst case" = `joint_pain` plus all six
physical limitations ticked.

| Fitness answer | Full pool | Worst case |
|---|---|---|
| `beginner` (level 1) | 15 | 12 |
| `medium` (level ≤2) | 42 | — |
| `advanced` (level ≤3) | 47 | 19 |
| `movement_snacks` | 21 | 13 |

All five prescribable families (`L`, `I`, `U`, `C`, `P`) survive at every floor.
Bookends worst case: **11 of 15 warm-ups** and **6 of 11 stretches** (`S01` calf,
`S06` glute, `S07` shoulder, `S08` side, `S09` spine, `S11` shoulder).

Re-check these when adding a limitation rule — a starved pool makes a worse plan
than one that lets a step-up through.
