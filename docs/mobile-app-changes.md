# Expo app — required changes

The web app is the API backend for the Expo app. This is everything that
changed on 2026-08-08 and what the mobile client has to do about it.

Nothing here is optional-but-nice: items marked **breaking** will misbehave
silently if the app is not updated, because they change response *shapes* and
*status codes*, not just copy.

---

## 1. `GET /api/account/status` — fields removed (**breaking**)

The 8-week plan has no free trial, so the trial columns were dropped from the
database. Three keys no longer appear in the response:

| Removed key | What to use instead |
|---|---|
| `trial_start` | Nothing. There is no trial. Use `state` for branching. |
| `trial_end` | `ends_at` (or `subscription_ends_at`) |
| `trial_days` | Nothing. |

Everything else is unchanged:

```jsonc
{
  "expired": false,
  "decision": "allow",              // "allow" | "paywall" | "no-onboarding"
  "state": "active",                // see §2
  "ends_at": "2026-10-03T00:00:00Z",
  "days_left": 56,
  "previously_paid": true,
  "is_third_party_provider": false,
  "has_access": true,
  "account_status": "paid",
  "subscription_ends_at": "2026-10-03T00:00:00Z",
  "subscription_canceled": false,
  "payment_failed_at": null,
  "has_onboarding": true
}
```

**Action:** delete any `trial_start` / `trial_end` / `trial_days` reads. If the
app renders a trial countdown or a "X days left in your trial" banner, remove
it — branch on `state` instead.

---

## 2. The `trialing` account state is gone (**breaking**)

`state` was a six-value enum. It is now five:

```
active | canceling | past_due | ended | disputed
```

`"trialing"` will never be returned again. Any `switch` on `state` with a
`trialing` case should drop it; any `if (state === "trialing")` is now dead.

Access rule, unchanged in behaviour: `active`, `canceling` and `past_due` all
keep access. `canceling` keeps it **until `ends_at`** — cancelling stops the
next renewal, it does not revoke weeks already paid for. Prefer the server's
`has_access` boolean over re-deriving this client-side.

---

## 3. Paid routes now fail closed (**breaking — behavioural**)

`checkTrialExpired()` used to return "not expired" when the `user_trials` row
was missing or the query errored, which meant an authenticated user with no
subscription row got the full product. It now denies in both cases.

Affected routes — every paid feature:

```
/api/symptoms          /api/symptom-logs
/api/good-days         /api/langchain-rag     /api/chat-sessions
/api/insights/weekly
/api/doctor-report     /api/health-summary
/api/plan              /api/plan/complete     /api/plan/habits
```

**Action:** the app must handle `403` from these routes by routing to the
paywall rather than showing an error toast. A freshly-registered user who has
not completed checkout will now get `403` where they previously got `200`.

---

## 4. 403 error strings changed

The user-facing message in the 403 body no longer mentions a trial:

| Before | After |
|---|---|
| `"Trial expired"` | `"Subscription required"` |
| `"Trial expired. Please upgrade to continue using the tracker."` | `"Subscription required. Please subscribe to continue using the tracker."` |
| `"Trial expired. Please upgrade to continue using the chat feature."` | `"Subscription required. Please subscribe to continue using the chat."` |

**Action:** if the app string-matches on `"Trial expired"` to detect the
paywall case, switch to matching the **403 status code** instead — that is
stable, the copy is not.

---

## 5. Apple IAP unaffected, with one caveat

`/api/iap/verify-receipt` and `/api/iap/apple-server-notifications` are
unchanged, and `APPLE_IAP_SHARED_SECRET` still gates receipt verification.

The caveat: `getAccountState()` no longer has a trial branch, so an Apple
**introductory offer** (free trial period) would read as `active` rather than
`trialing` for as long as the receipt's `expires_date` is in the future. That
is the correct access decision — the user has access either way — but if the
app wants to display "intro offer" copy it must get that from the receipt, not
from `state`.

---

## 6. Environment variables

Only relevant if the Expo app shares any config with the web project:

- `NEXT_PUBLIC_APP_URL` was **removed**. `NEXT_PUBLIC_SITE_URL` is now the
  single base-URL variable.
- `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_ANNUAL` were removed — those plans
  no longer exist. `STRIPE_PRICE_8WEEK` is the only price.
- `STRIPE_REFERRAL_COUPON_ID` was removed — see §7.

`MOBILE_WEB_HANDOFF_SECRET` is unchanged; the mobile → web session handoff
(`/api/auth/mobile-web-handoff`) still works exactly as before.

---

## 7. The referral system is gone (**breaking**) — 2026-08-10

All three endpoints were deleted. They now return **404**, not an error payload:

| Deleted endpoint | What it did |
|---|---|
| `GET /api/referral/code` | Returned/minted the user's referral code |
| `GET /api/referral/discount-eligible` | Returned `inviteCopyState` for the invite UI |
| `POST /api/referral/apply` | Recorded a referral and attached the 50%-off coupon |

`POST /api/auth/save-quiz` no longer accepts a `referralCode` field. The body
schema is strict-ish zod — send `{ quizAnswers }` only.

Email step `3-3` ("share Lisa with a friend, get 50% off") no longer sends.

The `referrals` table and the `user_profiles.referral_code` /
`user_trials.referral_discount_used_at` columns are dropped by
`scripts/sql/2026-08-10-drop-referral-system.sql`, so any mobile query touching
them fails once that migration is applied.

**Action:** delete the invite/share-code screen, every `/api/referral/*` call,
the `referralCode` argument to save-quiz, and any read of those columns.

---

## 8. Nutrition rows are counted, not just ticked — 2026-08-11

`GET /api/plan` now models the daily nutrition log the way the paper version
does: the meal habits are done **per meal**, water **per glass**. Nothing was
removed, so an old build keeps working — it just reads a three-meal row as a
single tick.

Each item under `nutrition.groups[].items[]` gained four fields:

| Field | Meaning |
|---|---|
| `target` | Ticks a full day takes — `3` for the per-meal rows, `6` for water, `1` for the rest |
| `max` | Ticks the UI should offer; only water differs from `target` (8) |
| `count` | Ticks logged today, `0…max` |
| `why` | One or two sentences on why this row is on *her* list — written for her at plan generation. Always present, on every plan including old ones. Needs somewhere to be read: a tap on the row, an expander, an info sheet. |

`doneToday` is unchanged in type but **changed in meaning**: it is now
`count >= target`, not `count > 0`. `streak` / `bestStreak` follow the same rule
— a day only counts if it reached `target`. `nutrition.doneToday` is therefore
the number of *fully* completed rows.

There is one new row, `post_meal_walk` ("10-min walk after eating", target 3),
and the labels and grouping changed — see `docs/plan/pillars.md`. **Do not
hardcode either.** Render `title`, `group` and `target` from the response; the
group headers are now `Every meal` / `Timing & fasting` / `Hydration &
supplements`, in response order.

`POST /api/plan/complete` is unchanged: send `count` as the **new total** for
that row today (it replaces, it does not add), and `done: false` to clear the
day. For a target-3 row, her third tap sends `count: 3`.

**Action:** render a `target`-segment control instead of a checkbox where
`target > 1`, send the running total as `count`, give `why` a place to be read,
and drop any local copy of the nutrition labels.

---

## 9. `GET /api/rewards` — XP, streaks and achievements (**new**) — 2026-08-11

A new read-only route backing the app's reward system. Send the device's local
date, same as `/api/plan`:

```
GET /api/rewards?date=2026-08-11
```

It writes nothing. Every number is **derived on read** from rows that already
exist — `user_plan_logs`, `symptom_logs` — which is what makes it
retroactive (a user three weeks in opens it and finds the badges she already
earned) and what makes it impossible for XP to disagree with what she actually
logged. Ticking a box via `POST /api/plan/complete` is the only thing that moves
any of it.

The XP model is one sentence: **finish something, get 10 XP.** Five a day is
the goal; 500 is a level. What counts as finishing:

| Finished thing | Counts when |
|---|---|
| Movement / relaxation session | every tick — one tap is one session |
| Habit | every tick |
| Nutrition row | it reaches its `target` for the day (not per tap) |
| Symptom log | per entry |

Partial progress on a nutrition row pays nothing until the row is done — that is
what makes the completion itself the moment worth celebrating.

```jsonc
{
  "date": "2026-08-11",
  "xp":    { "total": 60, "today": 60, "goal": 50, "perCompletion": 10 },
  "level": { "level": 1, "name": "Spark", "floor": 0, "ceiling": 500,
             "intoLevel": 60, "levelSpan": 500, "toNext": 440, "progress": 0.12 },
  "streak": { "current": 1, "best": 1, "activeToday": true },
  "stats": { "totalXp": 60, "bestStreak": 1, "activeDays": 1, "goalDays": 1 /* …18 metrics… */ },
  "achievements": [
    {
      "id": "wildfire", "name": "Wildfire", "blurb": "Days in a row with something logged…",
      "metric": "bestStreak", "value": 1,
      "tier": 0, "maxTier": 8, "target": 3, "floor": 0,
      "goal": "Keep a 3-day streak",
      "unlocked": false, "complete": false, "progress": 0.33,
      "earned": []
    }
  ],
  "earned": ["strong.1", "serene.1"]
}
```

Notes for the client:

- **The server owns the rulebook.** XP values, level thresholds and every badge
  target live in `lib/rewards/catalog.ts`. The app must not re-derive a
  threshold locally — a badge that unlocks on one side and not the other is
  worse than no badge, and the two copies drift the first time a number is
  tuned. The app owns icons, colours and celebration, nothing else. Label a
  reward from `xp.perCompletion`, never from a literal `10`.
- **The per-completion reward is fired client-side, not from this payload.**
  Only the app sees the *transition* — that this tap is what finished the row —
  and it has to be instant, so `PlanContext` detects it optimistically at tick
  time. This route is what confirms the totals a few seconds later. Its rules
  and the app's must stay in step: the app rewards exactly what earns XP here.
- **`earned` is the celebration key.** Each entry is a stable `family.target`
  id (`"wildfire.7"`). Diff it against what the device has already shown.
  Seed that set silently on first run, or a long-standing user gets forty
  modals at once — and a reinstall does it again.
- **`streak.activeToday`** is false before her first tick of the day, while
  `current` still counts to yesterday — the same rule the plan's per-row
  streaks use, so a 40-day run doesn't read 0 every morning.
- Subscription-gated like the plan routes: **403 means paywall**, not error.
- Needs no generated plan. The stored plan is used only to tell a movement tick
  from a relaxation one, and falls back to a key heuristic — so rewards keep
  working while a plan is still being written.

After changing any threshold, run `npx tsx scripts/verify-rewards.ts`.

---

## 10. `GET /api/plan` — exercises gained a `dose` object (**additive**) — 2026-08-14

Every entry in `tasks[].exercises[]` now also carries `dose`. Nothing was
removed: `sets`, `reps` and `minutes` are still there, unchanged, so an older
build keeps working exactly as before.

```jsonc
{
  "id": "C01",
  "name": "Wall sit",
  "props": "Wall",
  "sets": 3, "seconds": 45,     // the raw stored dose, still sent
  "dose": {
    "unit": "hold",             // "reps" | "hold" | "carry" | "duration"
    "perSide": false,           // true means "10 each leg", and a hold runs twice per set
    "sets": 3,
    "seconds": 45,              // per set for hold/carry; the whole block for duration
    "restSeconds": 45,          // between sets; 0 for duration
    "estimatedSeconds": 225     // including rest — sum these for session length
  }
}
```

**Why:** the flat `sets`/`reps`/`minutes` cannot be run by a timer, and for part
of the catalog they were wrong. The generator gave sets and reps to everything
that was not cardio, so a wall sit arrived as "3 × 10 reps" of a thing you hold,
balance work arrived without its per-side flag, and carries were counted in
repetitions.

The fix splits ownership: the **catalog** decides whether an id is repeated,
held, carried or timed and how long the rest is; the **LLM** writes the actual
numbers and grows them across the eight weeks. Everything the model writes is
clamped into a safe band server-side, so the app can render `dose` as given.

Exercise entries now also carry `seconds` next to `sets`/`reps`/`minutes` — the
stored dose for a hold or a carry.

**What the app should do:**

- Prefer `dose` when present; keep the existing `sets`/`reps`/`minutes` path as
  the fallback so the app is safe to ship before the API deploys.
- Render `perSide` — "3 × 10 each side" is a different instruction from "3 × 10".
- Drive any timer off `unit`: `reps` means time the rest, not the work;
  `hold`/`carry` mean count the work down; `duration` is a single block.
- `restSeconds` is a prescription derived in code, not a suggestion the model
  wrote. Do not replace it with a constant.

> Superseded in part by §11 — `unit` no longer has a `"reps"` case.

---

## 11. `GET /api/plan` — every dose is time now (**breaking**) — 2026-08-15

Repetitions are gone from the movement plan. Every exercise is prescribed as
**sets of seconds**, and `dose.unit === "reps"` is never sent again.

```jsonc
{
  "id": "L01",
  "name": "Box squat",
  "props": "Sturdy chair",
  "sets": 3, "seconds": 40,     // the raw stored dose — no `reps` on new plans
  "dose": {
    "unit": "timed",            // "timed" | "hold" | "carry" | "duration"
    "perSide": false,           // true means the set runs twice, seconds per side
    "sets": 3,
    "seconds": 40,              // per set (per side when perSide); whole block for duration
    "restSeconds": 60,
    "estimatedSeconds": 240
  }
}
```

- `"reps"` is replaced by `"timed"`: sets of work for time, at her own tempo.
  `hold`, `carry` and `duration` are unchanged.
- `dose.reps` is gone, and `dose.seconds` is now present on **every** unit — so
  a session timer has one rule: count `seconds` down, always.
- `perSide` no longer depends on the unit. Any per-side exercise runs its
  seconds once per side, with a switch between — including the step-ups and
  bird-dogs that used to be "10 each leg" in a single work step.
- Plans stored before today still carry `reps` in the raw fields. The server
  converts them to seconds inside `dose` at request time, so those plans keep
  running unchanged; nothing new is ever written with `reps`.
- The LLM no longer has a `reps` field to fill in at all.

**Why:** a rep count and a countdown are two different instructions competing for
one screen. She was shown a draining ring while being asked to count to twelve,
which is the one thing a woman mid-squat cannot do. Time is the instruction a
session can actually give her, and `sets` still carries the progression.

**What the app should do:** read `dose.seconds` for every unit, drop any
rep-specific UI, and treat an unknown `unit` as timed.

---

## 12. Plans renew every 8 weeks — cycles (**additive**) — 2026-08-23

Her plan is no longer a thing she has once. Fifty-six days after `startedAt`,
the first `GET /api/plan` of that day scores what she actually did, writes her a
new 8-week plan shaped by those numbers, and raises her **cycle**. The old plan
and every log behind it stay readable forever.

`user_plans` is now keyed `(user_id, cycle)`. `user_plan_logs` did not change at
all — task keys repeat across cycles, but cycles never overlap in time, so the
date already tells them apart.

### `GET /api/plan`

```jsonc
{ "status": "generating", "cycle": 2 }      // rollover in progress
{ "status": "ready", "cycle": 2, "date": "...", "startedAt": "...", ... }
```

- `cycle` is new on **both** states. 1 is the plan she bought.
- It rides along on `generating` on purpose: at a rollover that is the only
  signal available *while she waits*, and the wait is when the recap of the
  eight weeks she just finished should be on screen.
- Nothing else about the ready payload changed. `startedAt` is the current
  cycle's start, `currentWeek` is 1-8 within it, and `weeks` is still 8 long.
- **A rollover is stamped from the day she comes back**, not from day 56. A
  woman who was away for a month opens on day 1 of the new plan, not week 5 of
  one she has never seen.

### `GET /api/plan/history`

Gains `?cycle=<n>`. Omit it for the cycle she is living in; pass a number to
read a plan she has finished.

```jsonc
{
  "cycle": 1,
  "cycles": [
    { "cycle": 1, "startedAt": "2026-08-16", "endsAt": "2026-10-10", "current": false },
    { "cycle": 2, "startedAt": "2026-10-11", "endsAt": "2026-12-05", "current": true }
  ],
  "startedAt": "...", "weeks": [...], "overall": { ... }
}
```

- `cycles` is on **every** response, so a switcher never costs a second request.
  One entry means she is on her first plan and there is nothing to switch.
- A finished cycle is scored against **its own last day**, so it renders as
  eight full weeks rather than trailing off into blank future.
- Only `ready` cycles with a stamped `started_at` appear in `cycles`.
- Still 404s when she has no plan at all, and still never generates.

### What the LLM is told

Only percentages, and only these: movement / nutrition / relaxation adherence
over the finished cycle, the overall score, and first-half vs second-half so it
can tell a fade from a build. `null` on a pillar means the last plan asked
nothing there — it is never a zero.

The rule it is given is the opposite of the obvious one: **a pillar she scored
low on gets a smaller ask, not a bigger one.** A plan she could not keep for
eight weeks will not be kept by being made harder.

**The numbers are banned from every title, focus and `why`.** She is opening a
new plan, not a report card. Nothing about a previous cycle reaches her copy.

**Why:** she is paying a subscription. Week 8 used to be a cliff — the plan
simply stopped progressing and repeated forever — and a plan that silently
resets to week 1 reads as a bug rather than as something earned.

**What the app should do:** read `cycle` from both plan states; when it comes
back higher than the last one shown, show her a one-time recap of `cycle - 1`
(`GET /api/plan/history?cycle=<cycle - 1>`) while the new plan generates. Offer
past cycles from the progress screen via `cycles`.

---

## 13. The pre-renewal screen — `first_name` + a re-aimed alert — 2026-08-23

Three days before her card is charged she is shown one screen: what she did over
these eight weeks, and why not to stop. It is the only point in the cycle where
continuing is a decision rather than a default, and the point she is most likely
to quit — the work is done, and the next eight weeks look like more of it.

### `GET /api/account/status` gains `first_name`

```jsonc
{ "has_access": true, "subscription_ends_at": "2026-08-25T11:32:56Z", "first_name": "Ana", ... }
```

- First name only, already trimmed server-side. **Null** when the quiz never
  captured one — never build a sentence that breaks without it.
- It rides on this endpoint because it is the one the app already polls for
  "who is this and what may she see". The alternative was a second call from
  every screen that wants to address her by name.

### The `renewal` alert changed target and copy

| | before | after |
|---|---|---|
| title | `Your plan renews on 25 August` | `Ana, your 8 weeks are nearly up` |
| body | `Nothing to do — Lisa keeps going from here.` | `Your plan renews on 25 August and carries straight on. This is not the week to stop.` |
| `screen` | `Account` (opens web billing) | `PlanContinue` (in-app) |

- Push payload is now `{ "screen": "PlanContinue" }` instead of
  `{ "action": "upgrade" }`. Route it to the plan screen.
- The Alerts-tab row for `alert_kind: "renewal"` should open the same screen
  rather than the billing page. `access_ending` and `payment_failed` are
  unchanged — those two genuinely need her at a billing page.
- It still names the date. A motivating line that hides the charge three days
  away is a dark pattern, not a nudge.

### No new endpoint

The screen is built from what already exists: `first_name` and
`subscription_ends_at` from `/api/account/status`, and her outcome from
`GET /api/plan/history` (`overall.movement.done`, `.nutrition.done`,
`.relaxation.done` and the ratios).

**What the app should do:** when `subscription_ends_at` is 0-3 days away, she
has access and has **not** cancelled, show the screen once. Key the seen-marker
off `subscription_ends_at` itself — the next period is a different string and
re-arms it automatically, the same trick `renewal_notice_sent_for` plays
server-side. A cancelled subscriber never sees it; she has already decided.

---

## 14. `GET /api/plan` — movement sessions gained a warm-up and cool-down (**additive**) — 2026-08-23

A movement task now carries two optional siblings to `exercises`:

```jsonc
{
  "key": "w1_movement0",
  "pillar": "movement",
  "warmup":    [ /* PlanExercise[] — before the work */ ],
  "exercises": [ /* PlanExercise[] — the work itself, UNCHANGED */ ],
  "cooldown":  [ /* PlanExercise[] — after the work */ ]
}
```

Same element shape as `exercises`, `dose` object and all — an exercise is an
exercise, so the app needs no second renderer and no second player.

### `exercises` still means the main work only

This is the part to hold on to. Every read in either codebase that asks "how
much did she train" — session length, the exercise count, adherence, the volume
the next cycle is sized from — goes through `exercises`. Folding the bookends
into it would have changed all of those answers at once with nothing failing to
compile. They are separate arrays so that any place that needs the whole session
has to say so.

### Both are optional, and absent on purpose for some sessions

`sessionWarmup()` / `sessionCooldown()` in `lib/plan/generate.ts` resolve them at
request time:

1. If the stored plan wrote its own, that wins.
2. Otherwise a generic default (`DEFAULT_WARMUP` / `DEFAULT_COOLDOWN` in
   `lib/plan/catalog.ts`) is used — three unloaded mobility moves in, a
   two-minute floor flow plus neck and shoulders out.
3. Except on two kinds of session, which get **neither** field:
   - **movement snacks** (`cadence: "per_day"`) — five-minute bursts; two
     minutes of hip circles in front of each is a 40% tax on the whole idea.
   - **cardio-only sessions** (every id starts with `K`) — a Zone 2 walk warms
     up by being a walk. Nobody does arm swings in the driveway first.

Resolved at read time rather than stamped into stored plans, so every plan
already in the database has bookends today with no migration and no rewrite
underneath a woman mid-cycle.

**Since 2026-08-25 the plan-building LLM writes them** (step 1), so a new plan
carries a warm-up chosen for what that session actually loads rather than the
same three moves for everyone. It picks ids only — 2-4 per bookend, from the
`W` family, filtered by her `q_limitations` answers — and the dose comes off the
catalog, because a warm-up is not progressed across the eight weeks. Plans
generated before that date still resolve through step 2, which is why both paths
stay. Nothing about the response shape changed.

**What the app should do:** build the session as warm-up → work → cool-down, and
never read the three arrays separately. Phase is not a label on a card; it
changes how the session runs — a shorter card between prep moves, a capped rest,
and only the `main` sets deciding whether the session counts as done. Draw no
section for a phase that is absent.

---

## Quick checklist

- [ ] Remove `trial_start` / `trial_end` / `trial_days` reads
- [ ] Remove the `trialing` case from every `state` branch
- [ ] Treat `403` from paid routes as "show paywall", not "show error"
- [ ] Stop string-matching `"Trial expired"`; match on status `403`
- [ ] Remove any trial countdown / "days left in trial" UI
- [ ] Remove any "start your free trial" onboarding copy
- [ ] Remove the invite/referral screen and every `/api/referral/*` call
- [ ] Stop sending `referralCode` to `/api/auth/save-quiz`
- [ ] Render nutrition rows from `target` / `count`, not as plain checkboxes
- [ ] Drop any hardcoded nutrition labels, groups or the count of nine
- [ ] Surface each nutrition row's `why` (tap-to-open, expander, info sheet)
- [ ] Read `exercises[].dose` for sets and seconds; keep the flat fields as fallback
- [ ] Show "each side" wherever `dose.perSide` is true
- [ ] Remove every rep count from the UI — `dose.unit` is never `"reps"` again
- [ ] Read `cycle` from `GET /api/plan` on both `generating` and `ready`
- [ ] Show the 8-week recap once per finished cycle, during the rollover wait
- [ ] Render past cycles from `history.cycles`; hide the switcher when there is one
- [ ] Never render a plan reset to week 1 without the recap in front of it
- [ ] Read `first_name` from `/api/account/status`; render fine when it is null
- [ ] Route `{ screen: "PlanContinue" }` pushes into the app, not to web billing
- [ ] Open the Alerts-tab `renewal` row in-app; leave the other two on billing
- [ ] Show the pre-renewal screen once per `subscription_ends_at`, never when cancelled
- [ ] Run a movement session as `warmup` → `exercises` → `cooldown`
- [ ] Keep `exercises` meaning the main work in every count, estimate and score
- [ ] Draw no warm-up or cool-down section when the field is absent
- [ ] Let her leave during the cool-down without losing the logged session
