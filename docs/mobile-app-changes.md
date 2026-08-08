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
/api/symptoms          /api/symptom-logs      /api/daily-mood
/api/good-days         /api/langchain-rag     /api/chat-sessions
/api/insights          /api/insights/weekly   /api/tracker-insights
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

`MOBILE_WEB_HANDOFF_SECRET` is unchanged; the mobile → web session handoff
(`/api/auth/mobile-web-handoff`) still works exactly as before.

---

## Quick checklist

- [ ] Remove `trial_start` / `trial_end` / `trial_days` reads
- [ ] Remove the `trialing` case from every `state` branch
- [ ] Treat `403` from paid routes as "show paywall", not "show error"
- [ ] Stop string-matching `"Trial expired"`; match on status `403`
- [ ] Remove any trial countdown / "days left in trial" UI
- [ ] Remove any "start your free trial" onboarding copy
