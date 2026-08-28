# Upper Body — 8-week plan, mapped to the live catalog

Built from the four-block session in the brief, using only IDs that exist in
`lib/plan/catalog.ts`. One upper session per week is the design target; a second
lighter day is at the end.

**Every dose in this plan is seconds, because the catalog has no rep unit.**
That is not a formatting choice — it changes the heavy block, and the
translation is spelled out below.

---

## 1. Movement mapping

| Brief | Catalog | Notes |
|---|---|---|
| 1a. Broomstick around the world | `W03` PVC around the world | Exact match. Dropped by `shoulder`. |
| 1b. Yoga push-up | `W14` Inchworm to plank reach | Closest available. Loads the shoulder rather than opening it; dropped by `back`, `shoulder`, `pelvic_floor`. |
| 2a. Standing DB overhead press | `U06` Standing overhead press | Exact match. |
| 2b. Bent-over DB row | `U07` Bent-over dumbbell row | Exact match. |
| 3a. Floor DB chest press | `U04` Dumbbell floor press | Exact match. |
| 3b. Half-kneeling band pull-down | `U08` Single-arm dumbbell row | **Substitution, not a match.** See gap 1. |
| 4a. DB lateral raise | `U11` Dumbbell lateral raise | Exact match. |
| 4b. Band tricep push-down | `U12` Seated overhead triceps extension | Same muscle, different joint angle and no band. |
| 4c. Bicep curl | `U09` Rear-delt fly | **No curl exists.** See gap 2. Rear-delt serves the block's stated posture goal better anyway. |

Unused and deliberately held back: `U01`–`U03` (the push-up ladder) and `U05`
(seated press) go to the beginner and shoulder-limited variants, where they carry
the session. `U10` Y-T-W appears in the deload week.

## 2. Translating reps into seconds

A 4-rep heavy set and a 10-rep accessory set become the same thing if you only
control time, so the two blocks progress on different variables:

- **Block 2 (structural)** progresses on **load**. Seconds stay short and nearly
  flat — 20s is roughly 4–5 reps at the 4–5s tempo a heavy press actually takes.
  If the seconds climb, the set stops being a strength set.
- **Blocks 3 and 4** progress on **time**, then load. 30–40s is roughly 10 reps
  with a controlled lowering, which is what the brief asks for in 2b's
  "3... 2... 1..." cue.

Rest comes from `restSeconds()` and is not adjustable per block: 60s for every
level-2 movement here, 45s for `U10`, 15s for bookends. See gap 4 — the heavy
block wants more than 60s.

## 3. The session

### Block 1 — Movement Prep
`W03` PVC around the world · 40s
`W14` Inchworm to plank reach · 40s
`W04` Shoulder mobility · 40s
Fixed across all eight weeks. 15s rest. Runs about three minutes.

### Blocks 2–4 — the eight weeks

Format is `sets × seconds`. Weeks 5 is a deload: volume drops, load holds.

| Block | ID | Movement | Wk 1–2 | Wk 3–4 | Wk 5 | Wk 6–7 | Wk 8 |
|---|---|---|---|---|---|---|---|
| 2 | `U06` | Standing overhead press | 3 × 20s | 4 × 20s | 2 × 20s | 4 × 25s | 4 × 25s |
| 2 | `U07` | Bent-over row | 3 × 35s | 4 × 40s | 2 × 35s | 4 × 40s | 4 × 45s |
| 3 | `U04` | Dumbbell floor press | 3 × 30s | 3 × 35s | 2 × 30s | 3 × 40s | 3 × 45s |
| 3 | `U08` | Single-arm row (per side) | 3 × 25s | 3 × 30s | 2 × 25s | 3 × 35s | 3 × 40s |
| 4 | `U11` | Lateral raise | 2 × 25s | 3 × 30s | 2 × 25s | 3 × 35s | 3 × 35s |
| 4 | `U12` | Overhead triceps extension | 2 × 25s | 3 × 30s | 2 × 25s | 3 × 35s | 3 × 35s |
| 4 | `U09` | Rear-delt fly | 2 × 30s | 3 × 30s | 2 × 30s | 3 × 35s | 3 × 40s |

Week 5 also swaps `U09` for `U10` Y-T-W shoulder raise (2 × 30s) — level 1, no
load, and it is the one accessory that trains the scapular positions the rest of
the week never reaches.

**Load progression for Block 2:** hold the weight for weeks 1–2, add the smallest
available increment at week 3, hold through the deload, add again at week 6, add
again at week 8. If the last 5 seconds of the final set are clean, the weight was
too light.

All seconds sit inside the `timed` clamp of 15–90s, so nothing here needs a
schema change.

### Cooldown
`S10` Chest and shoulder stretch · 30s per side
`S07` Cross-arm shoulder stretch · 30s per side
`S09` Seated spinal twist · 30s per side

Session runs about 35–40 minutes at week 6, the heaviest point. Cutting `U12`
takes off five minutes without touching the structural work.

## 4. Variants

**Shoulder limitation.** `physical_limits: shoulder` strips `U04`, `U05`, `U06`,
`U11`, `U12`, plus `W03`, `W14` and `S10` — the entire Block 2 push, two of three
accessories, and two of three warm-ups. What remains still makes a session:

- Warm-up: `W04` shoulder mobility · `W05` open book cross · `W11` thread the needle
- Block 2: `U01` → `U02` → `U03` (wall → table → bench) as the push, one rung
  every two to three weeks; `U07` bent-over row unchanged
- Block 3: `U03` bench push-up · `U08` single-arm row
- Block 4: `U09` rear-delt fly · `U10` Y-T-W
- Cooldown: `S07` · `S08` · `S09`

That ladder is the rehab, not a consolation — it is the reason `U01`–`U03` stay
in the pool for a sore shoulder.

**Beginner (`maxLevel: 1`).** The level-1 upper pool is `U01`, `U02` and `U10`.
Three movements. This template cannot run — see gap 5.

**Second upper day.** Same warm-up and cooldown, then `U03` bench push-up
3 × 30s, `U08` single-arm row 3 × 30s per side, `U10` Y-T-W 3 × 30s. No Block 2.
Keeps the frequency without stacking two heavy pressing days.

---

## 5. What the catalog is missing

In rough order of how much they cost the plan.

1. **There is no vertical pull.** The brief's half-kneeling band pull-down has no
   equivalent — `U07` and `U08` are both horizontal. A single-arm band pull-down
   or a dumbbell pullover would close it, and the half-kneeling position is
   what supplies the anti-rotation demand named in Block 3's goal. Right now
   nothing in the upper catalog pulls overhead.

2. **There is no biceps movement.** Rows train elbow flexion incidentally and
   that is most of what a 45+ program needs, but the brief asks for a curl and
   the app cannot show one. A standing dumbbell curl is a one-clip shoot.

3. **No bands anywhere in the catalog.** Two of the brief's nine movements are
   band-anchored. Worth an explicit product decision — bands are cheap, travel
   well, and solve gap 1 in the same shoot — rather than letting it stay an
   accident of what got filmed.

4. **Rest is a function of dose and level, so the heavy block cannot get heavy
   rest.** `U06` at 4 × 20s with 60s rest is a hypertrophy rest on a strength
   set; it wants 90–120s. An `intent` field on the prescription (`heavy` /
   `accessory`) that `restSeconds()` reads would fix it without a per-exercise
   override table.

5. **A beginner cannot run an upper day.** Three level-1 movements, one of which
   (`U10`) is an accessory, means `allowedExercises()` returns a pool too thin
   for a four-block session, and any "use N different ids" rule will fail or
   repeat. Two more level-1 rows — an incline table row, a banded pull-apart —
   would matter more than anything else on this list.

6. **`ensureBoneLoading()` will not credit this session.** It keys on impact, and
   every upper movement here is `none`. But Block 2's stated goal is bone
   density, and loaded overhead pressing is exactly how the upper skeleton gets
   loaded. Either the coverage check needs a second predicate for axial load, or
   an eight-week plan with a strong upper day will report as under-covering bone
   work and pull in `I01` stomping marches it does not need.