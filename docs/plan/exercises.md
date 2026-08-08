## Final visual asset list — 60 assets

Deduplicated across Level 1, Level 2, Level 3, and F.A.C.E. This is the complete generation list.

> The tables below sum to **60**: 59 exercises plus `X01` (rest day icon). An
> earlier draft of this heading said 56 — the count was corrected, not the list.
> All 59 exercises are loaded in `lib/plan/catalog.ts`; `X01` is not selectable.

### Lower body — strength (8)

| ID | Exercise | Props |
| --- | --- | --- |
| L01 | Box squat | Sturdy chair |
| L02 | Bodyweight squat | None |
| L03 | Goblet squat | 1 dumbbell |
| L04 | Barbell back squat | Barbell, rack |
| L05 | Step-up | Stair or low step |
| L06 | Step-up, loaded | Stair, 2 dumbbells |
| L07 | Supported reverse lunge | 1 dumbbell, wall |
| L08 | Walking lunge, loaded | 2 dumbbells |

### Posterior chain / hinge (5)

| ID | Exercise | Props |
| --- | --- | --- |
| P01 | Glute bridge | Mat |
| P02 | Glute bridge, weighted | Mat, 1 dumbbell |
| P03 | Bent-over dumbbell row | 2 dumbbells |
| P04 | Romanian deadlift | 2 dumbbells |
| P05 | Hex bar deadlift | Hex bar |

### Upper body — push (6)

| ID | Exercise | Props |
| --- | --- | --- |
| U01 | Wall push-up | Wall |
| U02 | Counter push-up | Kitchen counter |
| U03 | Bench / table push-up | Low table or bench |
| U04 | Floor push-up | Floor |
| U05 | Dumbbell floor press | 2 dumbbells, floor |
| U06 | Dumbbell bench press | 2 dumbbells, flat bench |

### Upper body — press & pull (7)

| ID | Exercise | Props |
| --- | --- | --- |
| U07 | Seated overhead press | 2 dumbbells, chair |
| U08 | Standing overhead press | 2 dumbbells |
| U09 | Band row | Tube band, door anchor |
| U10 | Band pull-apart | Flat loop band |
| U11 | Lat pulldown | Cable machine |
| U12 | Weighted pull-up | Bar, dip belt |
| U13 | Incline dumbbell row | 2 dumbbells, incline bench |

### Core, stability & carries (6)

| ID | Exercise | Props |
| --- | --- | --- |
| C01 | Wall sit | Wall |
| C02 | Bird-dog | Mat |
| C03 | Hanging knee raise | Pull-up bar |
| C04 | Farmer's carry | 2 heavy dumbbells |
| C05 | Household heavy carry | Detergent jug, hugged to chest |
| C06 | Farmer's carry, household | Grocery bags or jugs |

### Balance (4)

| ID | Exercise | Props |
| --- | --- | --- |
| B01 | Single-leg balance, supported | Counter |
| B02 | Single-leg balance, unstable | Foam pad or cushion |
| B03 | Ball-toss balance | Foam pad, tennis ball, wall |
| B04 | Toothbrush single-leg stand | Sink, toothbrush |

### Bone impact (5)

| ID | Exercise | Props |
| --- | --- | --- |
| I01 | Stomping march | None |
| I02 | Low hop | None |
| I03 | Box drop landing | 8-inch box |
| I04 | Plyometric skip | None |
| I05 | Heel drop | None |

### Cardio (14)

| ID | Exercise | Props |
| --- | --- | --- |
| K01 | Zone 2 walk | Outdoor path |
| K02 | Fast walk interval | Outdoor path |
| K03 | Recovery stroll / hike | Path or trail |
| K04 | Hill power walk | Incline |
| K05 | Treadmill incline walk | Treadmill |
| K06 | Cycling | Upright bike |
| K07 | Assault / spin bike sprint | Air bike |
| K08 | Elliptical | Machine |
| K09 | Run / sprint | Outdoor or track |
| K10 | Sled push | Weighted sled |
| K11 | Stair climbing | Flight of stairs |
| K12 | Jump rope | Rope |
| K13 | Jumping jacks | None |
| K14 | High knees in place | None |

### Mobility & flexibility (4)

| ID | Exercise | Props |
| --- | --- | --- |
| M01 | Dynamic floor stretching | Mat |
| M02 | Neck circles & shoulder rolls | None |
| M03 | Torso twist with arm swings | None |
| M04 | Hip circles | None |

### Non-exercise (1)

| ID | Asset | Notes |
| --- | --- | --- |
| X01 | Rest day | Icon, not a figure |

## Clips are mobile-only

The web dashboard has no player and never receives clip URLs. `GET /api/plan`
returns them **only** when the caller passes `?media=1`, which the Expo app does
and nothing else does.

This is opt-in rather than sniffed from the auth method (cookie = web, Bearer =
mobile) for two reasons: "can you play video" is a rendering question, not an
auth one — a web player could be added later without a client having to pretend
to be mobile — and the default direction fails safe. A new client that forgets
the flag gets name + props and no video, rather than silently pulling megabytes
it can't render and billing you the egress.

The LLM is not involved at any point. It picks exercise ids and nothing else;
`exerciseMedia()` runs in `hydrateExercises()` well after `sanitize()`, so no
model ever sees a URL.

## Where the clips live

**Not in the Expo app bundle.** 59 clips would add tens of MB to every binary,
ship again on every app update whether or not they changed, and force an App
Store release to re-cut a single one.

They go in a **public Supabase Storage bucket** — already in the stack, already
behind a CDN, and a re-cut clip is live the moment it's uploaded.

```
bucket: exercise-clips   (public read, no RLS needed — nothing user-specific)
  L01.mp4    6-10s silent loop, H.264, ≤720p, ≤400KB
  L01.webp   poster frame, ≤40KB
```

Filename **is** the exercise id. Nothing else maps them.

- `exerciseMedia()` in `lib/plan/catalog.ts` builds both URLs. It is the only
  place that knows the path — no client ships a hardcoded one, so moving to a
  different CDN is a one-line change. Override the base with
  `EXERCISE_MEDIA_BASE` if you do.
- `MEDIA_READY` in the same file lists which clips actually exist. An id that
  isn't in that set returns no `video`/`poster`, and the app shows name + props
  with no player — so a half-finished shoot never renders a broken video. **Add
  ids to that set as clips land.**
- The Expo app caches each clip on first play (`expo-file-system`); after that
  it's local. Silent loops mean no audio session to manage.

Poster is required, not optional: without it a list of ten exercises is ten
simultaneous video loads on a phone.

### Batching to cut cost

- **U01–U04** are one figure at four angles
- **K01–K04** are one walking figure at four intensities
- **L05/L06**, **P01/P02**, **C04/C06**, **B01/B02** are pose + prop swaps

Roughly 42 unique bodies once batched.

### Two things still unresolved before you generate

**I03** — jumping onto the box or dropping off it. Level 3 says both.

**Yoga and Pilates** are prescribed for 30–45 minutes in Levels 2 and 3 but never broken into named movements. They are not on this list because they cannot be illustrated as written. Name the poses or cut those sessions.