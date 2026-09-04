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
`W` family — and the dose comes off the catalog, because a warm-up is not
progressed across the eight weeks. (Until 2026-08-29 the `W` pool was also
filtered by her `q_limitations` answers; that question and its filter are gone,
so every warm-up is available to everyone.) Plans
generated before that date still resolve through step 2, which is why both paths
stay. Nothing about the response shape changed.

**What the app should do:** build the session as warm-up → work → cool-down, and
never read the three arrays separately. Phase is not a label on a card; it
changes how the session runs — a shorter card between prep moves, a capped rest,
and only the `main` sets deciding whether the session counts as done. Draw no
section for a phase that is absent.

---

## 15. Engagement alerts moved to the device (**breaking**) — 2026-08-27

The server no longer sends the daily plan nudge, the streak warning or the
week-start note. They are local `expo-notifications` scheduled by the app
(`src/lib/reminders`), and `/api/cron/alerts` has been deleted.

**Why:** a cron fires at one UTC wall clock for every user on earth. 08:00 UTC
is 04:00 on the US east coast, which is why none of those alerts could ever be
given a time of day — and why "time to hydrate" could not be added at all. A
cron also cannot cancel a reminder the moment she ticks the box; a device can,
and does.

| alert | before | after |
|---|---|---|
| `daily_nudge` | `/api/cron/alerts?slot=morning`, 08:00 UTC | local, at her chosen morning time |
| `streak_risk` | `/api/cron/alerts?slot=evening`, 19:00 UTC | local, at her chosen evening time |
| `week_start` | `/api/cron/alerts?slot=evening`, 19:00 UTC | local, at her chosen evening time |
| — | — | **new:** water check, 15:00 local, only on a day she has started |
| — | — | **new:** movement, evening, only while the week's sessions are open |
| `weekly_recap` | `/api/cron/alerts?slot=evening` | `/api/cron/weekly-recap`, Sundays 19:00 UTC |
| `renewal`, `access_ending`, `payment_failed` | unchanged | unchanged |

- **`/api/cron/alerts` is gone.** `vercel.json` now schedules
  `/api/cron/weekly-recap` on Sundays only. Money alerts still come from
  `/api/cron/renewal-notices` and the Stripe webhook, unchanged — a declined card
  is not something a phone can work out, and it has to arrive whether or not the
  app is ever opened.
- The `daily_nudge` / `streak_risk` / `week_start` kinds stay in
  `lib/alerts/catalog.ts` so rows already written still render in the Alerts tab.
  Nothing may send them from the server again.
- Local reminders write **no** `notifications` row — they are not news, they are
  a nudge about something already on her plan, and a duplicate row in the Alerts
  tab would be the third place the same sentence appears.
- The volume ceiling is now structural: **at most one reminder per half-day, so
  two a day, and none once the day is finished.** See
  `src/lib/reminders/select.ts` — adding a sixth reminder cannot raise it.
- `PUT /api/notifications/preferences` is unchanged, but the app now writes
  `notification_enabled` and `weekly_insights_enabled` to the same value: the
  recap is the only non-money alert the server still sends, so one visible
  switch governs it, and the master column can no longer suppress it invisibly.
- Reminder times live on the device (`@menolisa:reminders_v1`), not on
  `user_preferences`. There is no server-side consumer for them.

### `GET /api/account/status` gains `training_time`

```jsonc
{ "has_access": true, "first_name": "Ana", "training_time": "morning", ... }
```

- `"morning" | "midday" | "evening" | null`, from the new `q_training_time` quiz
  step ("When is the best time for you to exercise?") → `user_profiles.training_time`.
  Migration: `scripts/sql/2026-08-27-training-time.sql`.
- **Null for every account created before the question existed.** Treat that as
  `evening`, which is when the movement reminder fired for everyone previously.
- It decides which half of the day the movement reminder lands in — the app maps
  each window to a clock time (`TRAINING_TIMES`: 8:00 / 12:30 / 18:00) and a time
  before 14:00 puts the reminder in the morning half. A time she sets herself in
  Settings overrides it.
- It rides on this endpoint for the same reason `first_name` does: it is the one
  call the app already polls, and this is not worth a second round trip.

**What the app should do:** nothing further — this is the app-side change. Any
second client must not reimplement the three retired alerts against the API.

---

## 16. `GET /api/app-version` — update prompts (**new**) — 2026-08-28

A shipped build cannot know a newer one exists, so it has to ask. One public,
unauthenticated route answers:

```
GET /api/app-version

{
  "minimum": "1.3.0",
  "latest":  "1.4.0",
  "ios_url":     "https://apps.apple.com/app/id6761130271",
  "android_url": "https://play.google.com/store/apps/details?id=com.menolisa.app"
}
```

**No auth, on purpose.** It has to answer a client that is signed out, expired,
or running code we no longer support — none of which is a reason to withhold
"please update". Nothing in the payload is a secret: two version strings and two
public store listings. Cached five minutes.

**The two numbers.**

- `minimum` — below this the app **blocks**: a full-screen gate above the
  navigator, no way past it, no sign-in behind it. Reserve it for builds that
  are genuinely broken against the current API — a contract change that would
  silently corrupt her data, a security fix. Locking a paying subscriber out of
  her plan is a real cost, so it is not the default lever.
- `latest` — below this the app **nudges**: a dismissible card on the daily
  loop, silenced per version. Dismissing 1.4.0 silences 1.4.0 and nothing else.

Both are read from `MOBILE_MIN_VERSION` / `MOBILE_LATEST_VERSION`, falling back
to constants in the route. Unset, they resolve to `0.0.0` / the current shipped
version, which blocks nobody and nags nobody — the feature is inert until it is
configured. An invalid value is treated as unset rather than as `0`, so a typo
cannot enforce a block.

`latest` is never allowed to fall behind `minimum`: if it did, the app would
block her and then send her to a store listing with nothing newer to install.
Setting only `MOBILE_MIN_VERSION` therefore raises `latest` to match, rather
than silently dropping the block.

**Comparison is numeric per dotted segment**, missing segments counting as 0 —
`1.4` equals `1.4.0`, and `1.10.0` is above `1.9.0`. No suffixes, no build
numbers: this is the store's user-facing version (`CFBundleShortVersionString`
/ `versionName`), not the build number EAS increments.

**What the app does:** `src/lib/appVersion.ts` reads the running version from
`expo-application` (the native bundle, not `Constants.expoConfig`, which reports
what was embedded at build time and can drift from what the store is serving).
`useAppUpdate()` holds one shared answer per launch, re-checked when the app
returns to the foreground after 30 minutes. Every failure path — unreachable
server, unparseable payload, unreadable version — resolves to "carry on". A
version check that blocks on a bad connection is worse than one that misses an
update.

**What a second client must not do:** re-derive "out of date" from anything
else, and in particular must not block on `unknown`.

---

## 17. `GET /api/plan` — sessions gained a power block (**additive**) — 2026-08-29

A movement task now carries a **fourth** phase, between the work and the
cool-down, plus a number saying how often it runs:

```jsonc
{
  "key": "w1_movement0",
  "pillar": "movement",
  "target": 3,               // sessions this week — UNCHANGED
  "warmup":    [ /* PlanExercise[] */ ],
  "exercises": [ /* PlanExercise[] — the work itself, UNCHANGED */ ],
  "power":     [ /* PlanExercise[] — NEW: bone loading, after the work */ ],
  "powerSessions": 2,        // NEW: how many of this week's sessions include it
  "cooldown":  [ /* PlanExercise[] */ ]
}
```

`power` has the same element shape as the other three — `dose` object, clip and
all — so it needs no second renderer and no second player. Run the session as
**warm-up → work → power → cool-down**.

### What it is

Plyometric and force-absorption work: hops, drops and marching landings, from
the `I` family. Bone density falls with estrogen and impact loading is the one
thing exercise does about that which nothing else does, so this is not a bonus
round — it is the pillar the plan is named after.

It used to be one exercise the LLM was *asked* to include and often didn't.
Measured over four generations, two plans had none at all. It is now a segment
built in code, on its own time budget, in every session of every plan.

### `exercises` still means the main work only

Same rule as the bookends, and it matters more here because a power block is
real work. Every read that asks "how much did she train" — session length, the
exercise count, adherence, the volume the next cycle is sized from — goes
through `exercises`. **Do not fold `power` into it.** If a screen needs the
whole session, it adds the arrays up itself and says so.

### `powerSessions` — the part that needs app logic

This is the one field that is not just "draw another section".

A movement task holds **one** session that she repeats `target` times a week, so
the plan physically cannot say "plyo on Tuesday and Friday". It says *do this
block on 2 of your 3 sessions this week* and the app decides which two.

**Show the power block on the first `powerSessions` completions of the week, and
hide it on the rest.** With `target: 3` and `powerSessions: 2`, her first two
sessions of the week run warm-up → work → power → cool-down and her third runs
warm-up → work → cool-down. Beginners have `target: 2` and `powerSessions: 2`,
so every session carries it.

The week boundary is the same one `doneThisWeek` already uses, and that counter
is what to drive this from — no new state, no new endpoint.

If you would rather not gate it in v1, showing it every session is a safe
fallback: it is more impact than prescribed but nothing in it is unsafe.
Skipping it entirely is not — that is the plan losing its point.

### Both fields are optional, and absent on purpose

There is **no generic default** for `power`, unlike the two bookends, and that
asymmetry is deliberate: a hip circle is safe for everyone, a plyometric is not.
Which ones she may be given depends on her fitness level and on whether she
reported joint pain, and neither is knowable from a stored task. So `power` is
absent — draw no section, and don't invent one — on:

- **movement snacks** (`cadence: "per_day"`) — five-minute bursts. Their bone
  loading is mixed into `exercises` instead.
- **cardio-only sessions** (every id starts with `K`).
- **every plan generated before 2026-08-29.** Existing plans finish their eight
  weeks without one; the next cycle has it.

Treat a missing `powerSessions` beside a present `power` as "every session", and
a present `powerSessions` beside a missing `power` as nothing to draw.

### Sessions got longer, and the quiz now says so

The time budget used to be one number per fitness level and is now a band: the
ordinary session, and what a session may reach on the days that carry the power
block. The block is additive — it never shortens the work she was already sold.

| Level | Ordinary session | With the power block | Power block |
|---|---|---|---|
| beginner | 20 min | 25 min | ~5 min |
| medium | 30 min | 40 min | ~10 min |
| advanced | 35 min | 45 min | ~10 min |
| movement snacks | 5 min | 5 min | none |

Two quiz labels changed with them (`medium` read "About 30 min" against a
28-minute ceiling; `advanced` read "35+ min" against a hard maximum of exactly
35). **If the app renders session length anywhere from its own table, it now
needs both numbers, or it will understate every power day.** Prefer summing the
`dose.estimatedSeconds` the response already carries.

**What the app should do:** run warm-up → work → power → cool-down; gate the
power section on `powerSessions` against `doneThisWeek`; keep `exercises`
meaning the main work in every count; draw nothing for an absent phase.

## 18. `GET /api/plan` — a guided meditation beside every relaxation task (**additive**) — 2026-08-29

`GET /api/plan?media=1` gained one top-level field. It is **not** inside `weeks`
and **not** a task:

```jsonc
{
  "status": "ready",
  // ... weeks, nutrition, habits, resistSuggestions ...
  "meditation": {
    "id": "meditation_settle",
    "title": "Guided meditation",
    "use": "Lie down, eyes closed, and let the voice do the work.",
    "seconds": 657,                       // 10:57 — the catalog's stated length
    "audio": "https://<supabase>/storage/v1/object/public/relaxation-audio/meditation.MP3"
  }
}
```

### Why it is not a catalog item

Every id in `RELAXATION` is in the plan prompt's enum, so anything added there is
something the model **schedules**. The day it scheduled the meditation as her
relaxation task, the choice this exists to offer would collapse into meditation
versus meditation. Keeping it off the plan also means:

- **Every existing plan gets it immediately.** A plan is written once and stored;
  a new catalog row would only reach women whose next eight weeks are generated
  after it shipped — seven weeks away for someone on day 3.
- **Adherence does not move.** Her relaxation task is still one task with one
  target. She completes it by breathing *or* by lying still with this playing;
  the tick goes against `task.key` either way and the plan cannot tell which.

### What the app does with it

Offer it as the second option beside whatever `weeks[].tasks[].relaxation` asked
for, and tick the same `task.key` on completion. **Do not** add a second log key,
and do not count it separately anywhere.

- **Media-gated.** Absent without `?media=1`, for the same reason as the exercise
  clips: the web dashboard has no player and should not be handed audio it would
  only pay egress for.
- **Optional, always.** Absent on any server that predates it, and absent when
  `NEXT_PUBLIC_SUPABASE_URL` is unset. Both mean *offer no choice* — never an
  error, never a player with nothing behind it.
- **`audio` is the only source of the URL.** Never build one from `id`. Nothing
  in the app may know the bucket, the filename, or its spelling — the file is
  `meditation.MP3`, capital extension and all, and that lives on the catalog row.
- **`seconds` is what to print before playback.** The real duration comes off the
  file once loaded; this is what the choice card can say while she decides.

### The file

`relaxation-audio`, public read, one flat namespace — the audio sibling of
`exercise-clips`. Managed by `npm run meditation`:

```
npm run meditation check  <file>   parse the mp3 against the catalog, no network
npm run meditation upload <file>   validate, then upload with a 1-year cacheControl
npm run meditation audit           live bucket vs the catalog
npm run meditation recache         re-upload live files carrying a short header
```

The duration check is the blocking one: `Meditation.seconds` is printed in the UI
before a byte is fetched, so a file whose real length disagrees with the catalog
is a screen that promises eleven minutes and delivers six.

**Never upload through the Supabase dashboard.** It stamps
`cacheControl: max-age=3600` — the first upload of `meditation.MP3` did exactly
that, on a 15MB file. `recache` fixes an object already up without needing the
master.

### Client-side notes (mobile)

Two things the app has to do that no previous media needed:

- **Download it once.** `expo-audio` has no disk cache of its own (unlike
  `expo-video`, which is why the clips only needed a flag). Streamed, a nightly
  meditation would pull 15MB every night. The app downloads to its cache
  directory on first play and plays the local file after — which also makes it
  work with no signal, and bed is where signal goes to die.
- **Switch the audio session, then hand it back.** One session per app: the
  settings that make a reward chime polite (muted by the mute switch, mixed under
  other audio, dead in the background) are the ones that make an eleven-minute
  meditation useless. iOS also needs `UIBackgroundModes: ['audio']`, without
  which the background-playback flag is silently ignored.

---

---

## 19. `GET /api/plan/history` — a `habit` pillar (**additive**) — 2026-08-29

Every `overall`, every `weeks[]` and every `days[]` object gained one field,
beside `movement` / `nutrition` / `relaxation` and shaped identically:

```jsonc
{
  "movement":   { "done": 4, "target": 6, "ratio": 0.67 },
  "nutrition":  { "done": 41, "target": 70, "ratio": 0.59 },
  "relaxation": { "done": 5, "target": 7, "ratio": 0.71 },
  "habit":      { "done": 3, "target": 7, "ratio": 0.43 },  // NEW
  "score": 0.66                                            // UNCHANGED — still the three above
}
```

### `score` deliberately does not include it

`score` is what the app draws as three rings, so folding a fourth pillar into it
would make the number disagree with the picture on the same screen. It still
averages movement, nutrition and relaxation exactly as before. **Nothing about
the existing rings changes**, and an app that ignores `habit` keeps working.

When the app is ready to draw a fourth ring, say so and `score` gains it in the
same release — it is one line server-side (`SCORED` in `lib/plan/history.ts`).

### Why it appeared

The plan writes her a small daily habit every week ("cool the room before bed"),
she could always tick it, and it was scored **nowhere**: not in a ring, not in
the history grid, and not in the adherence numbers that size her next eight
weeks. Eight weeks of keeping every habit and eight weeks of keeping none
produced the identical next plan.

It now also reaches the next cycle's prompt as `Adherence.habit`, which was the
part that actually cost her something: under 50% now tells the model the habits
it wrote did not fit her day, and to make the next ones smaller and anchor them
to something already in it.

**What the app should do:** nothing is required. If you want the extra signal,
render `habit` beside the other three — the shape is identical, and `null` means
the plan asked nothing of her there, never zero.

## 20. `GET /api/plan` — cardio is its own task every week (**additive**) — 2026-08-29

Every week now carries one or two **extra movement tasks** beside the strength
session. They come from code, not the model, and they are there in every plan
generated from today, on the fallback path too:

```jsonc
{
  "key": "w3_cardio",              // NEW — Zone 2. Every week.
  "pillar": "movement",
  "title": "Zone 2 cardio",
  "why": "…",
  "cadence": "weekly",
  "target": 2,                     // sessions this week
  "exercises": [
    { "id": "K01", "minutes": 25, "name": "Zone 2 cardio",
      "props": "Any activity — walk, bike, swim, row, elliptical",
      "dose": { "unit": "duration", "sets": 1, "seconds": 1500, "restSeconds": 0, "estimatedSeconds": 1500, "perSide": false } }
  ]
  // no warmup, no power, no cooldown, no video — see below
},
{
  "key": "w5_intervals",           // NEW — from a set week, medium and advanced only
  "pillar": "movement",
  "title": "Sprint intervals",
  "cadence": "weekly",
  "target": 1,
  "exercises": [ { "id": "K02", "minutes": 19, /* … */ } ]
}
```

### What it is

The aerobic pillar. `K01` is a dose, not a movement — minutes at a pace where
she could talk but not sing, on whatever she has. `K02` is a fixed 19-minute
protocol: **5 min easy, then 3-4 × (30s all-out + 2 min complete rest), then
5 min easy.** Hard sessions **replace** Zone 2 sessions rather than adding to
them; the number of cardio sessions in a week never changes mid-plan.

| Level | Weeks 1-2 | Weeks 3-8 | Zone 2 minutes wk 1-2 / 3-5 / 6-8 |
|---|---|---|---|
| beginner | 7 × Zone 2 | 7 × Zone 2 | 15 / 20 / 25 |
| medium | 6 × Zone 2 + **1 × intervals** | 5 × Zone 2 + **2 × intervals** | 20 / 25 / 30 |
| advanced | 4 × Zone 2 + **2 × intervals** | 4 × Zone 2 + **2 × intervals** | 25 / 30 / 35 |
| movement snacks | 7 × walk | 7 × walk | 20 / 20 / 20 |

**`w{n}_intervals` can carry `target: 2` (2026-08-29).** It used to be `1`
always, so an app that hardcoded one tick will under-count a medium user from
week 3 and every advanced user from week 1. Read `target`, like any other
weekly task — one task, two ticks, same 19-minute protocol both times.

**beginner and movement snacks are daily.** Their `w{n}_cardio` task is titled
"Daily walk" and written `cadence: "daily", target: 1` — one `K01` a day — not
`weekly` with `target: 7`. Render and score it the way every other `daily` task
(relaxation, habit) already is: a tick per day, against every day. Beginner's
minutes still climb across the bands (15 → 25); the snack walk is flat by
design. Everything else in this section still applies to both: one `K01`
exercise, `duration` dose, no bookends, no power, no video.

### How to render it

- **It is a movement task with exactly one exercise**, and that exercise has
  `dose.unit: "duration"` — a single countdown of `dose.seconds`, no sets, no
  rest. Both the existing session runner and the existing task list already
  handle that shape (§11); nothing new to build for the timer.
- **No `warmup`, `power` or `cooldown`, ever.** A walk warms up by being a walk.
  Draw no empty section.
- **No `video`.** `K` rows carry no clip by design; show name + props.
- **Tick it like any weekly task.** Log against `task.key` with the date;
  `doneThisWeek` counts against `target`. It contributes to the movement ring
  and to `Adherence.movement` exactly like the strength session does — a week
  she walked and did not lift scores as half a movement week.
- Tell them apart from the strength session by `key` suffix (`_cardio`,
  `_intervals`) or by every exercise id starting with `K` — not by title.

### Keys

New plans key the strength session `w{n}_movement` (it was `w{n}_movement0`).
Plans already stored keep their keys, and logs are keyed by whatever the plan
row says, so nothing migrates. Never hardcode either.

### Also gone

The `joint_pain` symptom no longer filters the exercise pool, and catalog rows
no longer carry an `impact` grade. Nothing in the API exposed either.

**What the app should do:** render `w{n}_cardio` / `w{n}_intervals` as movement
tasks with a single-timer exercise and no bookends, power or video; count them
against `target` with `doneThisWeek`; nothing else changes.

## 21. `GET /api/plan` — movement snacks: a different 3-move burst every day (**additive**) — 2026-08-29

The snack task (`cadence: "per_day"`) now carries **`days`**: seven lists,
one per day of the plan week, index 0 = the day the week starts (the same
`weekStart` the `doneThisWeek` window uses). `exercises` is still there and is
always identical to `days[0]`, so a build that ignores `days` keeps working
exactly as before — it just shows Monday's list all week.

**A burst is one exercise, and `target` is bursts a day — now 3, was 4.** So a
day's list has exactly `target` entries and each entry is its own burst: she
does one move (its `dose`, 2 sets with rest, ~1½ minutes), ticks it, and comes
back later for the next. `doneToday` counts bursts, 0-3. The three together are
fitted to about five minutes.

```jsonc
{
  "key": "w1_movement",
  "pillar": "movement",
  "cadence": "per_day",
  "target": 3,                       // bursts a day == entries per day
  "exercises": [ /* == days[0] */ ],
  "days": [                          // NEW — 7 entries, snack tasks only
    [ { "id": "L01", /* … */ }, { "id": "L02", /* … */ }, { "id": "I01", /* … */ } ],
    [ { "id": "U01", /* … */ }, { "id": "C04", /* … */ }, { "id": "I03", /* … */ } ],
    // … 5 more
  ]
}
```

Every day is **exactly three moves, in the order of her day**: the
bone-loading `I` move **first** (while she is fresh and furthest from bed), a
strength move second, and a **calm move last** — a hold, bird-dog, dead bug,
bridge, balance stand or calf raise (`CALM_SNACK_IDS` in the catalog), never a
jump, march or mountain climber, because the third burst is the evening one
and must not raise her heart rate or cortisol. At most one of the three is
per-side. No non-bone move repeats inside a week, no two consecutive days
share the bone move, and each day's three are fitted to the five minutes at
the week's dose. **Render them in array order** — it is the order she should
do them. Each entry is hydrated the same
way `exercises` is (name, props, `dose`, `video` when asked for).

**What the app should do:** for a task with `days`, render
`days[daysSince(weekStart) % 7]` (clamp to `days.length - 1` if a client's clock
runs past the week) instead of `exercises`, as **three separate bursts** — one
exercise, one timer, one tick each — rather than one session. `key`, logging
and the movement ring are unchanged; a tick is a burst, up to `target` (3) a
day. `days` is absent on every other task and on every snack plan
generated before today; those keep showing `exercises`.

The daily walk (§20) is unchanged by this: it is its own `w{n}_cardio` task.

## 22. `GET /api/plan` — every exercise says why she is doing it (**additive**) — 2026-08-29

Every hydrated exercise object now carries a **`why`**: one or two plain
sentences telling her why *this* movement is on her list. It is on **all five
places an exercise appears** — `exercises`, each list inside `days`, `warmup`,
`power` and `cooldown` — because they all hydrate through the same function.

```jsonc
{
  "id": "L04",
  "name": "Step-up",
  "props": "Stair or sturdy chair",
  "dose": { "sets": 3, "seconds": 40, "unit": "timed", "perSide": true, "estimatedSeconds": 240 },
  "why": "Stairs are one leg at a time, so train them one leg at a time. This is the move that stops your thighs burning halfway up.",   // NEW
  "video": "https://…/L04%20-%20Bodyweight%20Step%20Up.mp4"
}
```

### It is on every plan, including the ones already generated

`why` is resolved from the catalog at **read time**, exactly like `name`,
`props` and `video`. Nothing is stored in `user_plans`, no migration runs and no
plan is regenerated — a woman who is in week 6 of a plan built last week opens
the app and the reasons are there.

### It is not the task's `why`, and both should be shown

The two are different things and the app already receives the other one:

| Field | Scope | Written by | Changes per user |
|---|---|---|---|
| `task.why` | the whole week's session/habit | the model, at generation | **yes** — tied to her symptoms |
| `exercise.why` | one movement | the catalog, once | no — a fact about the movement |

So `task.why` belongs at the top of the session screen ("why this week looks
like this") and `exercise.why` belongs on the movement itself. Do not replace
one with the other.

### How to render it

Put it **where she reads it before she starts the set** — under the exercise
name on the session screen, or on the exercise detail sheet beside the clip. It
is 92-184 characters, two lines on a phone at body size, and it is written to be
read at a glance rather than tapped into. If the design has no room, an
expandable "Why this one?" row is fine; a tooltip is not, because the whole
point is that she sees it without going looking.

Ordinary body text, not a callout — the reason should read as part of the
exercise, not as an ad for it.

### It is optional, and absent means absent

`why` is missing when nobody has written copy for that row yet (there are none
today — all 79 catalog rows have one, and `npm run verify-plan-dose` fails the
build if one is missing). Treat it exactly like `video`: **draw nothing** when
the field is absent, never a placeholder or an empty paragraph.

### Nothing else changed

No new endpoint, no query parameter, no logging, no key change, no effect on
`doneToday` / `doneThisWeek` / adherence. `?media=1` is unrelated — `why` is
text and is sent to every client either way. An app build that ignores the field
behaves exactly as it does today.

## 23. Weeks 1-2 are a ramp, and the disclaimer is one screen — 2026-08-29

**Nothing for the app to build.** Both halves are either ordinary data through
existing fields or a change inside the app itself; this section exists so a
tester who notices does not file them as bugs.

### The plan ramps its two intensity levers over the first fortnight

- **No `w1_intervals` or `w2_intervals` at any level.** `K02` is thirty seconds
  all-out and the funnel screens nobody, so medium and advanced now open on two
  weeks of easy aerobic work and pick up their two hard days from week 3. Cardio
  session *counts* are unchanged — 7 a week at medium, 6 at advanced — so
  `w{n}_cardio` simply carries all of them in weeks 1-2.
- **The power block stays on the ground in weeks 1-2.** Those weeks draw only
  `I01` / `I07` (stomping march and lateral step and stick); the pogo jumps and
  drops arrive in week 3. Same fields, same
  `powerSessions`, same shape.

### One disclaimer, at the start, saying everything

The app used to carry **three** differently-worded medical disclaimers — the
consent modal, a card at the bottom of the daily loop, and a paragraph at the
bottom of Settings. Three wordings is three things to keep true, and the two
inline ones were wallpaper: permanent furniture on screens she opens every day,
which is the fastest way to make a safety notice invisible.

There is now exactly one, in `MedicalDisclaimerModal` — the "Before you begin"
gate that already ran on first launch. It covers, in three sections: that this
is not medical advice and that Lisa is an AI that can be wrong; that her plan is
built from her quiz answers rather than a medical assessment, when to check with
a doctor before starting, and the stop signals; and the existing AI/data-sharing
and privacy links.

**The consent key moved to `@menolisa:consent_v3_accepted`**, so everyone sees
the gate once more — consent already given cannot cover text that did not exist
when she gave it. Bump it again on any future change to what she is agreeing to.

**It is deliberately not served by the API.** A `disclaimer` field on
`GET /api/plan` was built and then removed: that endpoint needs auth *and* a
paid subscription, so it cannot answer on first launch, which is exactly when
this has to be read. The trade is real — correcting the wording now needs an
App Store release — and it is the right way round for a consent gate, which has
to show before there is anything to authenticate against.

---

## 24. Catalog edits — one nutrition id changed, one exercise deleted, one renamed — 2026-08-30

Four small changes, none of them a shape change. Nothing in any response gained
or lost a field; the app needs no new rendering, only the two lines noted below.

**`post_meal_walk` is now `post_meal_squats`** — "20 squats after eating",
`group: "Every meal"`, `target: 3`, unchanged in every other respect. Same
mechanism (blunt the rise the meal just caused), two minutes instead of ten. The
log key changed with it: `nut_post_meal_walk` → `nut_post_meal_squats`. Any tick
history under the old key is **orphaned, not migrated** — it stops being counted
rather than being read as squats she never did. Labels and groups already come
from the response, so the only thing to change on the device is the local icon
map (`src/lib/planIconMapping.ts`), which is decoration and keyed by id.

**`I09` (supported heel drop) is deleted.** It was a level-1 plyometric, so the
practical effect is that a **beginner's power block is now one movement, `I01`
(stomping march), for all eight weeks** — the block still renders exactly as it
did, just with a single row in it. It was also the only `I` row marked `snack`,
so a movement-snack pool lost one of its impact moves (23 → 22). Its clip is
still in the bucket and is now an orphan; a plan generated before today may
still name `I09`, and the app should keep doing what it already does with an id
it cannot resolve.

**`W02` is renamed** from "Dynamic movement prep" to **"Spiderman lunge w/
rotation"** — the movement the clip actually shows. Its dose changed with the
name, from a 60-second block to `timed, per side · 20s`, which is where the
other single-movement warm-ups sit. Same id, same clip URL, same shape.

**The "This week" chip is gone from the nutrition row.** `NutritionItem.focus`
is still sent and still true for the rows this week pushes on — nothing renders
it. Beside a cadence hint ("Every meal") and a streak chip it read as a third
status about the row rather than as emphasis, and there was nothing on the
screen that told her what it was claiming.

## Quick checklist

- [ ] Render `exercise.why` on the session screen (§22)
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
- [ ] Schedule the plan, water, movement, streak and week-start reminders locally
- [ ] Never send `daily_nudge`, `streak_risk` or `week_start` from the server again
- [ ] Keep the ceiling at two reminders a day, and none on a finished day
- [ ] Ask for notification permission after her first finished task, not at launch
- [ ] Offer a way back into notifications from Settings in every non-granted state
- [ ] Delete `user_push_tokens` rows Expo reports as `DeviceNotRegistered`
- [ ] Read `training_time` from `/api/account/status`; treat null as `evening`
- [ ] Let a time set in Settings override the quiz answer, never the reverse
- [ ] Check `GET /api/app-version` on launch and on foreground return
- [ ] Block below `minimum`; nudge, dismissibly and per version, below `latest`
- [ ] Read the running version from the native bundle, never from the JS config
- [ ] Fail open: an unreachable or unparseable check must never block anyone
- [ ] Run a movement session as `warmup` → `exercises` → `power` → `cooldown`
- [ ] Show `power` on the first `powerSessions` sessions of the week, hide it after
- [ ] Keep `power` out of `exercises` in every count, estimate and adherence score
- [ ] Draw no power section when the field is absent (snacks, walks, old plans)
- [ ] Snack task with `days`: show `days[daysSince(weekStart) % 7]`, not `exercises`, as 3 one-move bursts in array order — impact, strength, calm (§21)
- [ ] Snack `w{n}_cardio` is `cadence: "daily"` — a tick a day, like relaxation (§20)
- [ ] Stop hardcoding session length per level — it is a band now, or sum the doses
- [ ] Optional: render the new `habit` pillar from `/api/plan/history`
- [ ] Keep reading `score` as the three rings — `habit` is not in it yet
- [ ] Render `w{n}_cardio` / `w{n}_intervals` as one-exercise movement tasks with a single countdown
- [ ] Draw no warm-up, power, cool-down or video on a cardio task
- [ ] Count cardio ticks against `target` with `doneThisWeek`, like any weekly task
- [ ] Keep exactly one medical disclaimer — the "Before you begin" gate; never add a second inline one (§23)
- [ ] Bump `@menolisa:consent_vN_accepted` whenever that modal gains something she has not agreed to (§23)
- [ ] Expect no interval sessions in weeks 1-2 at any level, and no jumping in the week 1-2 power block (§23)
- [ ] Nutrition: send `nut_post_meal_squats`; expect no history under `nut_post_meal_walk` (§24)
- [ ] Expect a one-movement power block at beginner level — `I01` alone (§24)


## §25 — The free 7-day trial needs nothing from the app (2026-09-04)

The web paywall now sells the first week free: Stripe saves the card at $0
and charges $59 on day 7. Nothing in the API
contract changes. A trialing subscription is stored as an ordinary paid one —
`account_status: "paid"`, `subscription_ends_at` = the first charge date — so
`GET /api/account/status` returns `has_access: true` and `days_left` counts
down from 7, and every paid route answers as before.

Two optional fields are new on `/api/account/status`: `trial_ends_at` (ISO)
and `in_trial` (boolean), null / false for anyone not in a free week. Use them only
if a screen wants to say "first charge Sep 11" rather than "renews Sep 11".

- [ ] Nothing to build. Do not add a trial state; branch on `in_trial` for copy only, if at all.
