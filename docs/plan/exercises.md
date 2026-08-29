# Exercises

**`lib/plan/catalog.ts` is the source of truth.** This file used to be a second
copy of the table — 41 rows of id, name and equipment — and it drifted the first
time the shoot renamed anything, which is the only thing a duplicated table
reliably does. What is left here is the part that is not visible from reading
the rows.

## The shoot has seven series; the code has six prefixes

The clips in the `exercise-clips` bucket are organized the way they were filmed.
The catalog groups them the way the generator needs to reason about them. The
mapping is not one-to-one and both halves are deliberate:

| Shoot series | Catalog ids | n | Role |
| --- | --- | --- | --- |
| Lower Body Strength | `L01`–`L17` | 17 | Main work |
| Plyometrics & Force Absorption | `I01`–`I09` | 9 | Main work — bone loading |
| Upper Body Strength | `U01`–`U13` | 13 | Main work |
| Core & Posterior Stability | `C01`–`C09` + `P01`–`P03` | 12 | Main work |
| Warm-up & Mobility | `W01`–`W15` | 15 | Bookend, front |
| Post-Lower Body Routine | `S01`–`S06` | 6 | Bookend, back |
| Post-Upper Body Routine | `S07`–`S11` | 5 | Bookend, back |
| *(not filmed)* Cardio | `K01`–`K02` | 2 | Main work — the aerobic pillar |

77 clips, 79 catalog rows. The bucket has no orphans and no ghosts; the two
extra rows are the `K` cardio block, which carries no `clip` on purpose — see
below. `npm run clips audit` lists them under "catalog ids with no clip" and
passes.

The 2026-08-29 top-up added four of those clips — `L17` supported lateral lunge,
`I09` supported heel drop, `U13` standing dumbbell biceps curl, `C09` supported
single-leg stand — and closed the bone-loading gap this file used to end on. A
fifth row had been drafted for a band pull-apart; it was not shot, so it was
**deleted rather than left clipless**, and the id it was holding went to the
curl. That is the line between it and the `K` rows: "walk at a pace where you
could talk but not sing" is a complete instruction on its own, "band pull-apart"
in front of a woman who has never held a band is not. Shoot it first, then add
the row.

### Cardio has rows and no clips, deliberately

The `K` prefix was wired and empty from the day the plan was written until
2026-08-28: `isCardioId()`, `cardioMinutes()`, the `duration` dose unit and the
prompt's continuous-block rule all existed with nothing to apply to, so an
eight-week menopause plan contained no aerobic work at all. Estrogen falls,
cardiovascular risk climbs, and nothing else in the catalog touches it. (The
ten-minute post-meal walk lives in `NUTRITION`, where it is a glucose habit and
is counted as one.)

Closing it cost five rows and no code, which is exactly what the catalog's own
note had predicted it would take. It also cost no shoot: `clip` is optional and
`exerciseMedia()` returns undefined without one, so the app draws name and props
and no player — which for "walk at a pace where you could talk but not sing" is
the correct presentation, not a degraded one. **Do not shoot these to make the
library look uniform.**

Both are `snack: false` (a continuous block is the opposite shape from a
five-minute desk-side burst) and `impact: none`, so cardio is the one family a
`joint_pain` answer leaves completely intact — which is the point: the woman
whose knees hurt is the one who most needs the pillar that is not jumping.
Modality is where she adapts, and modality is hers.

`K01` is a dose, not a movement: 150 minutes a week at a pace where she could
talk but not sing, on whatever she has — which is also why there is no separate
indoor row: "any activity" already covers marching in the front room, and a
second id meaning the same dose is a second thing to keep in step for nothing.
`K02` is the only protocol row —
30s at ~90% effort, 2 min easy, 3 rounds, inside a 5-10 min warm-up and a 5 min
cool-down on the same activity — and it is level 2, so a beginner never sees it.

Core & Posterior Stability is one series and two prefixes: `C` is the trunk work
and `P` the hinge. They are kept apart because the prefix is what
`ensureBoneLoading()` and the prompt's bone rule test — under a prefix rule the
plyometrics and the posterior chain must not share a letter.

Two of those renamings carry weight:

- **PLYO → `I`.** `ensureBoneLoading()` and the prompt's bone-coverage rule both
  test `startsWith("I")`, and `P` belongs to the posterior chain — under a prefix
  rule `PLYO01` and `P01` are indistinguishable. `I` for impact keeps every
  existing predicate working without a rewrite.
- **Rl/Ru → one `S` series.** `isStretchId()` is `startsWith("S")`, so both
  post-workout routines fold into one cool-down pool and `allowedCooldowns()`
  needs no change. The lower/upper split survives as the `S01`–`S06` /
  `S07`–`S11` block boundary in the catalog. Splitting the predicate in two — so
  a pressing session finishes on the post-upper routine specifically — is a
  reasonable thing to want once the `U` series exists, and it is a change here,
  not a rename in the bucket.

`W` and `S` are two pools, not one. A leg swing prepares a joint for load and a
40-second butterfly hold does the opposite, so they get separate enums in the
response schema: under `strict: true` a stretch in the warm-up slot is not a
rule the model can break, it is a token it cannot emit.

## Filenames are not ids

A catalog row carries the clip's **exact filename in the bucket**, spaces and
all (`L01 - Chair Squat.mp4`), in its `clip` field. `exerciseMedia()`
percent-encodes it.

This used to be a `MEDIA_READY` set of ids plus `${base}/${id}.mp4`, which
assumed the shoot would name its files after our ids. It didn't, and under the
old rule every clip in the library would have resolved to a URL with nothing
behind it — a 404 in her player mid-session, invisible from the Supabase
dashboard and invisible in a build. Two lists that had to agree are now one
field that cannot disagree with itself.

`npm run clips audit` checks it in both directions against what is actually
live: a row whose clip is missing, and a file no row claims.

## Pool sizes, and the one gap left

What `allowedExercises()` leaves her, measured by
`npx tsx scripts/verify-plan-dose.ts`:

| Level | main | +joint_pain | power | +joint_pain |
| --- | --- | --- | --- | --- |
| beginner | 16 | 16 | 2 | 2 |
| medium | 42 | 42 | 6 | 2 |
| advanced | 44 | 44 | 9 | 2 |
| movement_snacks | 23 | 20 | 0 | 0 |

Two pools, since 2026-08-29. The `I` family is **reserved for the power block**
and is no longer in `allowedExercises()` — see `allowedPower()` — so the model
cannot spend a strength slot on a plyometric it is going to be given anyway. The
snack cadence is the exception: it has no power block, so its `I` rows stay
ordinary main work, which is the only reason a snack user has bone loading at
all.

That reshuffle is also why the main pool is now unmoved by `joint_pain` at every
level: with `I` reserved, the only `high` impact rows left in it were `I` rows.
The whole of that filter's remaining work moved to the power pool, where it
bites hard — **every level collapses to `I01` and `I09`**, the two `low` impact
rows that survive it.

Every level except `movement_snacks` gained cardio on 2026-08-28 (`K01` at
level 1, both at level 2+); the snack pool is unchanged because cardio is
`snack: false`.

Bookends are no longer filtered: 15 warm-ups and 11 stretches, the same for
everyone.

## Session length and what the bookends cost

`MOVEMENT_VOLUME` is the sentence she read on the quiz screen before she paid,
not an internal target, and `fitSessionToMinutes()` enforces it as a ceiling.
Three things were corrected on 2026-08-28 and they compound:

| | before | after |
| --- | --- | --- |
| `beginner` minutes | 18 (label said "about 20 min") | 20 |
| generic bookends | 360s | 220s |
| beginner work time | 12.0 min | 16.3 min |
| bookend share of a beginner session | 33% | 18% |

- **Per-side warm-ups were costing double.** Eight of the twelve ordinary
  warm-up rows read `40` in `DOSE` under a comment claiming the family was
  uniform, and a per-side set runs twice — so those eight cost 80 seconds while
  the four beside them cost 40. They now read `20`, which makes every ordinary
  warm-up movement cost the same 40 seconds whichever column it is in.
- **The stretches were not shortened.** 30 seconds a side is the floor for
  tissue to give. The cool-down got shorter by holding one fewer position
  (`S02` went; it is the only one of the three a knee rules out).
- **`DEFAULT_WARMUP` / `DEFAULT_COOLDOWN` no longer restate `seconds`.** They
  did, which is a second copy of a number already in `DOSE`, and it behaved the
  way second copies do: the per-side cut landed in `DOSE` and the generic
  warm-up kept running at the old dose. They take the catalog's dose now, by the
  same path `bookendFrom()` uses.
- **`BOOKEND_MINUTES` is derived from those two lists rather than asserted.** It
  was the literal `4` against a real cost of 6 minutes, so the prompt sized its
  dose ladder for 14 work-minutes a beginner did not have, and
  `fitSessionToMinutes()` quietly trimmed the result on essentially every
  beginner session.
- **The per-end cap scales with the session** (`bookendMax()`: 2 under 20
  minutes, 3 above). At a flat 4 a model could spend 580 seconds — nine minutes
  forty, 54% — of an 18-minute session on bookends.

**Bone loading is a segment now, not an exercise (2026-08-29).**
`ensureBoneLoading()` is gone, and with it both gaps this section used to end
on. It was the repair for a prompt rule the model kept ignoring — bone work was
requested, absent from two of four measured generations, and the function went
round afterwards swapping an `I` id into the last slot of the shortest sessions
until four of eight weeks had one. Three faults, one cause:

- it **cost a strength exercise** every time it fired, because it replaced
  rather than added;
- it **covered four weeks with one movement** on a thin pool;
- it **never ran on the fallback path**, so a woman generating a plan while
  OpenAI was down got between 1 and 4 of 8 weeks of bone loading and no
  guarantee of any.

All three were the same fault: bone loading was competing for a slot instead of
having one. `buildPowerBlock()` gives it its own segment, on its own budget on
top of the session, in **8 of 8 weeks on both paths** — measured across all
eight profile shapes, every session inside its band.

**Still open: variety, for the woman who reported joint pain.** Her power pool
is `I01` and `I09` at every level, so her block alternates two movements for
eight weeks while a clean medium pool rotates six. Her block is also shorter for
the same reason — ~6 minutes against ~10 — because there is nothing left to fill
it with. That is a content gap, not a code one, and the fix is a shoot: three or
four more `low` impact bone-loading rows (heel-raise-and-drop variations, low
step-downs, a step-and-stick off a four-inch box). Grade anything new `low` if it
can honestly be graded there — a shoot that adds only `high` rows widens this
gap rather than closing it.
