| ID | Category | Exercise Name | Equipment / Context |
| --- | --- | --- | --- |
| **L01** | Lower Body — Strength | Box Squat / Chair Squat | Bodyweight / Standard Chair

 |
| **L02** | Lower Body — Strength | Bodyweight Squat | Bodyweight

 |
| **L03** | Lower Body — Strength | Goblet Squat | Dumbbell

 |
| **L04** | Lower Body — Strength | Step-Up | Bodyweight / Household Step or Sturdy Chair

 |
| **L05** | Lower Body — Strength | Step-Up (Loaded) | Dumbbells + Household Step or Sturdy Platform

 |
| **L06** | Lower Body — Strength | Supported Reverse Lunge | Bodyweight + Wall or Counter Support

 |
| **L07** | Lower Body — Strength | Walking Lunge (Loaded) | Dumbbells

 |
| **L08** | Lower Body — Strength | Calf Raises (Loaded / Deficit) | Dumbbells + Bottom Stair / Step

 |
| **L09** | Lower Body — Strength | Bulgarian Split Squat | Bodyweight / Dumbbells + Standard Chair or Couch

 |
| **L10** | Lower Body — Strength | Split Squat | Bodyweight / Dumbbells

 |
| **L11** | Lower Body — Strength | Prisoner Squat | Bodyweight

 |
| **L12** | Lower Body — Strength | Air Squat | Bodyweight

 |
| **L13** | Lower Body — Strength | Dumbbell Sumo Deadlift | Dumbbell

 |
| **P01** | Posterior Chain / Hinge | Glute Bridge | Bodyweight / Mat

 |
| **P02** | Posterior Chain / Hinge | Glute Bridge (Weighted) | Dumbbell + Mat

 |
| **P03** | Posterior Chain / Hinge | Romanian Deadlift (RDL) | Dumbbells

 |
| **U01** | Upper Body — Push | Wall Push-Up | Wall

 |
| **U02** | Upper Body — Push | Counter Push-Up | Countertop

 |
| **U03** | Upper Body — Push | Incline Push-Up (Table/Sturdy Surface) | Sturdy Table / Sturdy Surface

 |
| **U04** | Upper Body — Push | Floor Push-Up | Bodyweight / Mat

 |
| **U05** | Upper Body — Push | Dumbbell Floor Press | Dumbbells + Floor/Mat

 |
| ~~**U06**~~ | — | Yoga flow (no press) | Moved to WARMUPS as **W15** on 2026-08-25 — it is a mobility flow, not a push

 |
| **U07** | Upper Body — Press & Pull | Seated Overhead Shoulder Press | Dumbbells + Standard Chair

 |
| **U08** | Upper Body — Press & Pull | Standing Overhead Shoulder Press | Dumbbells

 |
| **U09** | Upper Body — Press & Pull | Bent-Over Dumbbell Row | Dumbbells

 |
| **U10** | Upper Body — Press & Pull | Rear-Delt Fly / Reverse Fly | Dumbbells

 |
| **U11** | Upper Body — Press & Pull | Prone Y-T-W Shoulder Raises | Bodyweight / Mat

 |
| **U12** | Upper Body — Press & Pull | Dumbbell Lateral Raise | Dumbbells

 |
| **C01** | Core, Stability & Carries | Wall Sit | Wall

 |
| **C02** | Core, Stability & Carries | Bird-Dog | Mat

 |
| **C03** | Core, Stability & Carries | Farmer's Carry | Dumbbells

 |
| **C04** | Core, Stability & Carries | Plank | Bodyweight / Mat

 |
| **C05** | Core, Stability & Carries | Side Plank | Bodyweight / Mat

 |
| **C06** | Core, Stability & Carries | Dead Bug | Mat

 |
| **C07** | Core, Stability & Carries | Pallof Press | Resistance Band

 |
| **I01** | Impact & Bone-Loading | Stomping March | Bodyweight (Low Impact)

 |
| **I02** | Impact & Bone-Loading | Supported Heel Drop | Bodyweight + Wall Support (Low Impact)

 |
| **I03** | Impact & Bone-Loading | Low Hop | Bodyweight (Moderate Impact)

 |
| **I04** | Impact & Bone-Loading | Plyometric Skip | Bodyweight (Moderate Impact)

 |
| **I05** | Impact & Bone-Loading | Pogo Jumps | Bodyweight (Moderate Impact)

 |
| **I06** | Impact & Bone-Loading | Forward Fall Landing (stand, fall forward, land on both feet) | Bodyweight (Moderate Impact)

 |
| **I07** | Impact & Bone-Loading | Low Step-Off Landing Drill | Bottom Stair / Low Step (Moderate Impact)

 |

| **L14** | Lower Body — Strength | Barbell Back Squat | Barbell + Rack |
| **U13** | Upper Body — Press & Pull | Single-Arm Dumbbell Row | Dumbbell + Chair or Bench |
| **C08** | Core, Stability & Carries | Mountain Climber | Mat |
| **C09** | Core, Stability & Carries | Oblique Twist | Mat |
| **I08** | Impact & Bone-Loading | Pogo Jumps, Forward & Back | Bodyweight (Moderate Impact) |
| **I09** | Impact & Bone-Loading | Pogo Jumps, Lateral | Bodyweight (Moderate Impact) |
| **I10** | Impact & Bone-Loading | Pogo Jumps, Multi-Directional | Bodyweight (Moderate Impact) |
| **I11** | Impact & Bone-Loading | Single-Leg Pogo | Bodyweight (Moderate Impact) |
| **I12** | Impact & Bone-Loading | Soft-Surface Heel Drop | Cushion / Folded Towel (Low Impact) |

## Bookends

The warm-up (`W01`-`W16`) and cool-down (`S01`-`S19`) families are not listed
here — `lib/plan/catalog.ts` is their table, and it is the one the clip
filenames follow. They are ordinary catalog rows; the prefix is the only thing
that keeps them out of the prescribable pool.

## A warning about ids

The ids in this file are the ones the app and the clip bucket use. The 2026-08
shoot list numbers from an older revision and is offset by one from `L04` down.
The mapping is in `docs/plan/recording-list.md`; read it before naming a file.

## What is filmed

`MEDIA_READY` in `lib/plan/catalog.ts` is the live list, and
`npm run clips audit` checks it against the bucket. What is still unfilmed, and
in what order it is worth shooting, is `docs/plan/recording-list.md`.
