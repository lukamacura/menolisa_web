# Exercises

**`lib/plan/catalog.ts` is the source of truth.** This file used to be a second
copy of the table — 41 rows of id, name and equipment — and it drifted the first
time the shoot renamed anything, which is the only thing a duplicated table
reliably does. What is left here is the part that is not visible from reading
the rows.

## The shoot has seven series; the code has four prefixes

The clips in the `exercise-clips` bucket are organized the way they were filmed.
The catalog groups them the way the generator needs to reason about them. The
mapping is not one-to-one and both halves are deliberate:

| Shoot series | Catalog ids | n | Role |
| --- | --- | --- | --- |
| Lower Body Strength | `L01`–`L16` | 16 | Main work |
| Plyometrics & Force Absorption | `I01`–`I08` | 8 | Main work — bone loading |
| Upper Body Strength | `U01`–`U12` | 12 | Main work |
| Core & Posterior Stability | `C01`–`C08` + `P01`–`P03` | 11 | Main work |
| Warm-up & Mobility | `W01`–`W15` | 15 | Bookend, front |
| Post-Lower Body Routine | `S01`–`S06` | 6 | Bookend, back |
| Post-Upper Body Routine | `S07`–`S11` | 5 | Bookend, back |

73 clips, 73 catalog rows, no orphans either way.

Core & Posterior Stability is one series and two prefixes: `C` is the trunk work
and `P` the hinge. They are kept apart because different limitations exclude
them — a pelvic floor rule wants the front plank gone and the glute bridge
kept.

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

| Level | clean | +joint_pain | + all six limitations |
| --- | --- | --- | --- |
| beginner | 15 | 15 | 12 |
| medium | 42 | 38 | 19 |
| advanced | 47 | 40 | 19 |
| movement_snacks | 21 | 18 | 13 |

A beginner ticking every limitation *and* reporting joint pain still keeps 12,
with lower body, hinge, upper body, core and low-impact bone loading all
represented. Twelve is workable across eight weeks; ten would not be. Re-measure
when adding a limitation — a gate that starves the generator produces a worse
plan than one that lets a step-up through.

Bookends: 15 warm-ups (11 under all six limitations) and 11 stretches (6).

**One content gap survives.** `I01` is the only bone-loading movement a limited
user can be given — everything else in the plyometric series involves leaving
the ground, so `joint_pain` and five of the six limitations drop it wholesale.
`ensureBoneLoading()` covers four of the eight weeks with whatever it is handed,
so for those women that is the same movement four times. A second low-impact
clip (a supported heel drop was the old one) is the cheapest fix.

`ensureBoneLoading()` also runs only inside `sanitize()`, which is the LLM path.
A **fallback** plan gets no bone-coverage guarantee — measured at 1 of 8 weeks
for a medium user with joint pain.
