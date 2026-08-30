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
| Plyometrics & Force Absorption | `I01`–`I08` | 8 | The power block — bone loading |
| Upper Body Strength | `U01`–`U13` | 13 | Main work |
| Core & Posterior Stability | `C01`–`C09` + `P01`–`P03` | 12 | Main work |
| Warm-up & Mobility | `W01`–`W15` | 15 | Bookend, front |
| Post-Lower Body Routine | `S01`–`S06` | 6 | Bookend, back |
| Post-Upper Body Routine | `S07`–`S11` | 5 | Bookend, back |
| *(not filmed)* Cardio | `K01`–`K02` | 2 | Cardio tasks — the aerobic pillar |

77 clips, 78 catalog rows. Two `K` cardio rows carry no `clip` on purpose (see
below), and since `I09` was deleted on 2026-08-30 its file
(`Plyo09 - Supported Heel Drop.mp4`) is an orphan in the bucket. `npm run clips
audit` names all three and is expected to.

The 2026-08-29 top-up added four of those clips — `L17` supported lateral lunge,
`I09` supported heel drop, `U13` standing dumbbell biceps curl, `C09` supported
single-leg stand. Three of them stand; `I09` was deleted again on 2026-08-30,
which re-opens the beginner bone-loading gap this file used to end on. A
fifth row had been drafted for a band pull-apart; it was not shot, so it was
**deleted rather than left clipless**, and the id it was holding went to the
curl. That is the line between it and the `K` rows: "walk at a pace where you
could talk but not sing" is a complete instruction on its own, "band pull-apart"
in front of a woman who has never held a band is not. Shoot it first, then add
the row.

### Cardio is its own task, scheduled by code

The `K` prefix was wired and empty from the day the plan was written until
2026-08-28, and for one day after that it was two ids the model could put
*inside* a strength session — which made cardio optional (it forgot),
wrong-sized (a walk handed the whole half hour) and expensive to police. Since
2026-08-29 it is a segment of the week, like the power block is a segment of
the session: `CARDIO_VOLUME` in `lib/plan/catalog.ts` is the schedule,
`cardioForWeek()` says what a given week holds, and `cardioTasks()` in
`generate.ts` writes it into every week on both the model path and the fallback.
`allowedExercises()` keeps both `K` ids out of the model's pool.

| Level | Cardio days a week | Zone 2 minutes, weeks 1-2 / 3-5 / 6-8 | Intervals (`K02`) |
| --- | --- | --- | --- |
| beginner | 7 (`daily`) | 15 / 20 / 25 | never |
| medium | 7 | 20 / 25 / 30 | 1 a week, then 2 from week 3 |
| advanced | 6 | 25 / 30 / 35 | 2 a week, from week 1 |
| movement_snacks | 7 (`daily`) | 20 / 20 / 20 | never |

The interval days **replace** easy sessions rather than adding to them, so the
number of times a week she laces up is fixed for the whole plan. `intervals` on
`CARDIO_VOLUME` is read on the same three bands as `minutes`, which is how
medium steps from one hard day to two once the first fortnight is behind her.
Advanced takes its rest day out of the easy sessions instead — six days, not
seven, because two genuinely maximal days a week need one day that asks for
nothing. Beginners and snack users never get `K02`.

It cost no shoot: `clip` is optional and `exerciseMedia()` returns undefined
without one, so the app draws name and props and no player — which for "walk
at a pace where you could talk but not sing" is the correct presentation, not
a degraded one. **Do not shoot these to make the library look uniform.**

`K01` is a dose, not a movement: minutes at a conversational pace on whatever
she has, which is also why there is no separate indoor row. `K02` is the only
protocol row — 5 min easy, then **30 seconds all-out** and **two minutes of
complete rest**, 3-4 rounds, then 5 min easy to come down, on the same
activity. About nineteen minutes. The effort has to be maximal, and it can only
be maximal if the rest is passive and long enough to buy it: jogging the two
minutes turns it into a tempo session that costs more and gives less.

Core & Posterior Stability is one series and two prefixes: `C` is the trunk work
and `P` the hinge — two movement patterns the session top-up can tell apart.

Two of those renamings carry weight:

- **PLYO → `I`.** `isPowerId()` tests `startsWith("I")`, and `P` belongs to the
  posterior chain — under a prefix rule `PLYO01` and `P01` are
  indistinguishable. `I` for impact keeps the predicate working without a
  rewrite.
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

## Pool sizes

What `allowedExercises()` and `allowedPower()` leave her, measured by
`npm run verify-plan-dose`. **Her fitness level is the only filter** — the
limitation screen went on 2026-08-29 and the `joint_pain` impact rule went
the same day, taking the `impact` grade on every row with it.

| Level | strength pool | power pool | cardio |
| --- | --- | --- | --- |
| beginner | 15 | 2 | 7 × Zone 2 (daily) |
| medium | 40 | 6 | 6 × Zone 2 + 1 SIIT, then 5 + 2 |
| advanced | 42 | 9 | 4 × Zone 2 + 2 SIIT |
| movement_snacks | 23 | 0 | 7 × 20-min walk (daily) |

Three pools. The `I` family is **reserved for the power block** and the `K`
family for the cardio tasks — neither is in `allowedExercises()`, so the model
cannot spend a strength slot on a plyometric or a walk it is going to be given
anyway. The snack cadence is the exception on bone loading: it has no power
block, so its `I` rows stay ordinary main work, which is the only reason a snack
user has bone loading in her bursts at all.

Bookends are not filtered: 15 warm-ups and 11 stretches, the same for everyone.

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
