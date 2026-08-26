# Exercise clips — what still needs recording

Status as of 2026-08-26. **40 of 84** catalog ids have a clip in the
`exercise-clips` bucket. This file lists the other **44**, in the order they are
worth a shoot day.

The live bucket and `MEDIA_READY` in `lib/plan/catalog.ts` agree exactly — no
orphan files, no id served with nothing behind it. Everything below is genuinely
unfilmed.

---

## Before you film anything: the ids do not match the shoot list

The shoot list numbers from an older revision that still had the barbell back
squat at `L04`. From there down it is **offset by one** against `catalog.ts`,
and `catalog.ts` is what the bucket filenames mean.

| Shoot list says | File must be named | Movement |
|---|---|---|
| L04 | **L14** | Barbell back squat |
| L05 | **L04** | Step-up |
| L06 | **L05** | Step-up, loaded |
| L07 | **L06** | Supported reverse lunge |
| L08 | **L07** | Walking lunge, loaded |
| L09 | **L08** | Calf raises |
| L10 | **L09** | Bulgarian split squat |
| L11 | **L10** | Split squat |
| L12 | **L11** | Prisoner squat |
| L13 | **L12** | Air squat |
| L14 | **L13** | Dumbbell sumo deadlift |
| P04 | **P03** | Romanian deadlift |
| U07 | **W15** | Yoga push-ups (refiled as mobility) |
| U09 | **U07** | Seated overhead press |
| U10 | **U08** | Standing overhead press |
| U19 | **U11** | Y-T-W shoulder |
| U20 | **U12** | Dumbbell lateral raise |
| I06 | **I05** | Pogo jumps |
| I07 | **I03** | Low hop / lateral step-and-stick |
| I09 | **I07** + **I02** | Box drop landing + supported heel drop |

Uploading a step-up as `L05.mp4` would overwrite the loaded step-up already
live in her player. **Name every file from the table in `catalog.ts`.**

---

## Priority 1 — the cool-down and the beginner pool (12 clips)

Two reasons these come first.

**The cool-down is now zero-for-nineteen.** `DEFAULT_COOLDOWN` used to resolve to
two warm-up clips that exist; it now points at real stretches that do not, so
every session's cool-down is text until these are shot. S12/S19/S08 are the
generic fallback, S05/S07 are the only other stretches that survive all six
limitation filters.

**The beginner pool is 16 exercises wide** and beginner is the default fitness
level, so a missing clip there lands in a large share of plans.

| id | Movement | Props | Why first |
|---|---|---|---|
| S12 | Piriformis stretch, figure-four | Mat | `DEFAULT_COOLDOWN` |
| S19 | Seated spinal twist | Mat | `DEFAULT_COOLDOWN` |
| S08 | Seated cross-body shoulder stretch | None | `DEFAULT_COOLDOWN` |
| S05 | Thread the needle | Mat | survives all six limitations |
| S07 | Seated side-body stretch | Mat | survives all six limitations |
| L04 | Step-up | Stair or sturdy chair | beginner pool |
| U02 | Counter push-up | Kitchen counter | beginner pool |
| C04 | Plank | Mat | beginner pool |
| I02 | Supported heel drop | Wall or counter | beginner pool |
| I12 | Soft-surface heel drop | Cushion / folded towel | beginner pool, new id |
| W03 | Spider-Man lunge with rotation | Mat | 1 of only 2 warm-up gaps |
| W04 | Half-kneeling hip flexor rockback | Mat | 1 of only 2 warm-up gaps |

After this batch: every warm-up has a clip, the generic cool-down has a clip,
and the beginner plan is fully filmed.

---

## Priority 2 — the rest of the cool-down family (14 clips)

Same shoot, same setup — a mat, a strap, a wall. Cheap to batch, and it is what
lets the plan write a cool-down that matches the session instead of the same
three stretches every week.

| id | Movement | Props |
|---|---|---|
| S01 | Chest & shoulder stretch with strap | Strap or towel |
| S02 | Triceps stretch with strap | Strap or towel |
| S03 | Trunk twist with strap | Strap or towel |
| S04 | Extended puppy pose | Mat |
| S06 | Kneeling chest expansion | Mat |
| S09 | Seated overhead triceps stretch | None |
| S10 | Standing wall chest & biceps stretch | Wall |
| S11 | Hip flexor & anterior hip capsule lunge | Mat |
| S13 | Kneeling low lunge, quad & hip flexor | Mat |
| S14 | Kneeling half-splits, hamstring & calf | Mat |
| S15 | Seated butterfly stretch | Mat |
| S16 | Seated cow-face, outer hip | Mat |
| S17 | Cobra pose | Mat |
| S18 | Child's pose | Mat |

S01–S03 are the only clips in the catalog that need a strap. Film them
together, and use the same strap in all three so the gear line reads as one
object.

---

## Priority 3 — prescribable today, still text-only (9 clips)

Already in the pool for medium and advanced users. Lower frequency than
priority 1, but these are live gaps, not new content.

| id | Movement | Props | Level |
|---|---|---|---|
| L06 | Supported reverse lunge | Wall or counter | 2 |
| L10 | Split squat | None, or 2 dumbbells | 2 |
| U04 | Floor push-up | Mat | 3 |
| C05 | Side plank | Mat | 2 |
| C07 | Pallof press | Tube band, door anchor | 2 |
| I03 | Low hop | None | 2 |
| I04 | Plyometric skip | None | 3 |
| I06 | Forward fall landing | None | 2 |
| I07 | Low step-off landing | Bottom stair or low step | 3 |

**`I06` is a decision, not a shoot.** It is in the catalog and prescribable, and
it is the one movement on this page that is absent from the shoot list
entirely. Either film it or retire it — leaving it is one text-only exercise in
an otherwise filmed impact block.

---

## Priority 4 — new movements, nothing depends on them yet (9 clips)

Added to the catalog on 2026-08-26 to match the shoot list. They enrich the pool
but nothing is missing without them, so they can wait for a second day.

| id | Movement | Props | Note |
|---|---|---|---|
| U13 | Single-arm dumbbell row | 1 dumbbell, chair or bench | per side |
| C08 | Mountain climber | Mat | |
| C09 | Oblique twist | Mat | |
| I08 | Pogo jump, forward & back | None | |
| I09 | Pogo jump, lateral | None | |
| I10 | Pogo jump, multi-directional | None | |
| I11 | Single-leg pogo | None | per side |
| W16 | Inchworm | Mat | |
| L14 | Barbell back squat | Barbell, rack | see below |

**`L14` is a decision too.** It is the only movement in the catalog that needs a
rack. Everything else is filmable in a room with a mat and two dumbbells, and
the product is sold as something she does at home. It is in the catalog because
the shoot list asked for it; it was retired in the first place for this reason.

---

## Delete candidates

Raised here because the catalog now holds everything and some of it should
probably go.

| id | Movement | Case for cutting |
|---|---|---|
| I06 | Forward fall landing | Absent from the shoot list. No clip. |
| L14 | Barbell back squat | Needs a rack; home-workout product. No clip. |

Two ids run the other way — filmed and live, but absent from the shoot list.
Keep them; the clips already exist and cost nothing:

- **U10** Rear-delt fly
- **W13** Lateral hamstring rocker

---

## Shoot spec

Full reasoning is in the header comment of `scripts/exercise-clips.ts` and in
`lib/plan/catalog.ts` under "Exercise video". The gate:

- **1080×1920**, 9:16, 30fps
- **H.264 (`avc1`)** — never HEVC, the library must be one codec
- **No audio track** — the player loops silently
- **`faststart`** — `moov` before `mdat`. In HandBrake this is the "Web
  Optimized" box; in ffmpeg it is `-movflags +faststart`. Skipping it is
  invisible locally and costs three round trips before the first frame on her
  phone.
- **≤1600 kbps**, ≤2.5MB per file
- 4–12 seconds, a clean loop
- Body inside the central **820px** of width at the widest point of the movement
  (arms overhead, full lunge stride), 5% clear top and bottom — the session
  player is full-bleed and crops the outer ~100px on a 19.5:9 phone

```
ffmpeg -i master.mov -an -vf "scale=1080:1920:flags=lanczos" \
  -c:v libx264 -preset veryslow -crf 21 -profile:v high -level 4.1 \
  -pix_fmt yuv420p -movflags +faststart out.mp4
```

Validate before uploading — the script refuses anything off-spec:

```
npm run clips check  <dir>     # parse and validate, no network
npm run clips upload <dir>     # validate, then upload with a 1-year cache
npm run clips audit            # live bucket vs MEDIA_READY
```

**Never upload through the Supabase dashboard.** It stamps
`cacheControl: max-age=3600`; the script sets a year.

After uploading, add the ids to `MEDIA_READY` in `lib/plan/catalog.ts`. An id
listed there with no file behind it is a 404 mid-session; an id left out falls
back to name and props and looks deliberate.

---

## Outstanding on the 40 clips already live

Not recording work, but it is in the same pass.

1. **Every file is still `max-age=3600`.** The 2026-08-26 re-export went in
   through the dashboard. Re-upload the whole batch with
   `npm run clips upload` and each play stops revalidating against origin.
2. **The batch is over the bitrate budget** — ~3276 kbps median against 1600.
   Needs a re-export before that re-upload, or the gate will refuse it.
3. **`I05` carries an audio track.** Re-export silent.
4. **Four files exceed the 2.5MB hard cap:** `U11` 4.36MB, `W15` 2.93MB,
   `W02` 2.68MB, `C03` 2.61MB. The re-export fixes these with the bitrate.

Doing 1–4 as one re-export and one `npm run clips upload` closes all of them
together.
