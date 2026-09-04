# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. PROJECT OVERVIEW

**MenoLisa** is a web app (and API backend for a companion Expo mobile app) that helps women track menopause/perimenopause symptoms and receive AI-driven insights and chat support from "Lisa," an AI health companion.

### Tech Stack (from package.json)
| Package | Version |
|---|---|
| next | ^16.1.3 |
| react | 19.2.1 |
| typescript | ^5 |
| tailwindcss | ^4 |
| @supabase/supabase-js | ^2.76.1 |
| @supabase/ssr | ^0.7.0 |
| @langchain/openai | ^0.3.17 |
| @langchain/community | ^0.3.0 |
| stripe | ^20.3.1 |
| resend | ^4.0.0 |
| framer-motion | ^12.23.24 |
| zod | ^3.25.76 |
| lucide-react | ^0.546.0 |

### Architecture
**Monolithic Next.js App Router** application. The same codebase serves:
- Web frontend (React, Tailwind, Framer Motion)
- REST API for the companion Expo mobile app (Bearer token auth)
- Scheduled cron jobs (Vercel Cron)

### Key Design Decisions
- **Passwordless auth only** — 6-digit email OTP via Supabase (`signInWithOtp` + `verifyOtp`). No passwords, no magic links. Shared `<OtpForm />` (`components/auth/OtpForm.tsx`) is the only auth UI, and `/login` is now its only caller.
- **The paywall sells a free trial** — card up front, $0 at checkout, $59 when the trial ends (`TRIAL_DAYS`, 5 since 2026-09-04; it shipped at 7), then the same $59/8-week subscription. It is not an account state and there is no flag; see "The free trial" in §4. **There is no refund guarantee** — the "100% guarantee" on the paywall *is* the trial (cancel before the first charge, pay nothing), and Terms §12 says exactly that.
- **The `/register` funnel never asks for an email** — it signs her in anonymously and lets Stripe collect the address at checkout. See "Anonymous accounts" below.
- **Dual auth paths** — cookie (web) and Bearer token (mobile) coexist in every API route via `getAuthenticatedUser()`
- **Verbatim KB-first RAG** — AI chat tries to return exact knowledge base content before falling back to LLM generation; this ensures medically accurate, consistent answers
- **Persona-based routing** — queries are classified into 4 personas before retrieval to ensure the right tone and knowledge domain
- **Webpack forced** (`next dev --webpack`) — Turbopack had compatibility issues

---

## 2. DIRECTORY STRUCTURE

```
web app/
├── app/                     # Next.js App Router pages and API routes
│   ├── api/                 # All REST API endpoints
│   │   ├── account/         # Account status + deletion
│   │   ├── admin/           # Admin stats (password-gated)
│   │   ├── auth/            # OTP helpers, save-quiz, mobile↔web handoff
│   │   ├── chat-sessions/   # Chat session persistence
│   │   ├── cron/            # Scheduled jobs (see table below)
│   │   ├── doctor-report/   # Generate doctor-ready health report
│   │   ├── good-days/       # "Good day" logs
│   │   ├── health-summary/  # Health summary report generation
│   │   ├── iap/             # Apple IAP receipt verify + server notifications
│   │   ├── insights/weekly/ # Weekly summary read (cron writes the rows)
│   │   ├── intake/          # Onboarding quiz data saving
│   │   ├── langchain-rag/   # Main AI chat endpoint (Lisa)
│   │   ├── notifications/   # In-app/push notification CRUD
│   │   ├── plan/            # 8-week plan generation, habits, completion
│   │   ├── stripe/          # Checkout, portal, webhook, sync
│   │   ├── symptom-logs/    # Symptom log CRUD
│   │   ├── symptoms/        # Symptom definitions (seeded defaults)
│   │   └── user-preferences/# Notification preferences
│   ├── admin/               # Admin stats page
│   ├── auth/                # Auth callback + mobile bridge
│   ├── checkout/            # Stripe checkout success
│   ├── dashboard/           # Protected authenticated area
│   │   ├── account/         # Plan, billing, cancellation — never payment-gated
│   │   └── settings/        # Incl. push-notification preferences
│   ├── delete-account/      # Account deletion flow
│   ├── get-the-app/         # Public store-badge page; target of every email CTA
│   ├── login/               # OTP sign-in
│   ├── paywall/
│   ├── privacy/
│   ├── register/            # Onboarding quiz + OTP sign-up
│   └── terms/
├── components/              # Shared React components
│   ├── auth/                # OtpForm — the only auth UI
│   ├── landing/             # Landing page sections
│   ├── notifications/       # Toast stack only (provider, container, card)
│   └── ui/                  # Base UI: button, badge, accordion
├── hooks/                   # Custom React hooks (data fetching, UI state)
├── knowledge-base/          # Markdown KB files for RAG (gitignored; source of truth for AI)
├── lib/                     # Shared utilities and business logic
│   ├── insights/            # Weekly summary generation (no AI); feeds the cron
│   ├── plan/                # 8-week plan catalog + generator
│   ├── rag/                 # Full RAG pipeline (orchestrator, retrieval, personas, etc.)
│   └── *.ts                 # Utilities, Supabase clients, auth helpers
├── public/                  # Static assets (fonts/, images)
├── scripts/                 # ingest-documents, cleanup-oversized-documents
│   └── sql/                 # Dated migrations — the schema history
├── .env.example             # Authoritative env var list
├── next.config.ts
├── proxy.ts                  # Route protection and CORS (Next 16's rename of middleware.ts)
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json              # Cron job configuration
```

**Where to add new features:**
- New API endpoint → `app/api/<feature>/route.ts`
- New dashboard page → `app/dashboard/<feature>/page.tsx`
- New reusable component → `components/<category>/`
- New data-fetching hook → `hooks/use<Feature>.ts`
- New shared utility → `lib/`

**Never edit manually:**
- `node_modules/`
- `.next/` (build output)
- `next-env.d.ts`

---

## 3. DEVELOPMENT COMMANDS

```bash
# Install dependencies
npm install

# Dev server (webpack mode, required)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint
npm run lint

# Ingest knowledge base into Supabase vector store
# WARNING: clears and rebuilds the entire documents table
npm run ingest

# Clean up oversized documents from vector store
npm run cleanup-docs

# Check the generated plan against every dose, safety, pattern and cardio rule.
# Runs the real generator on the fallback path — no model call, no network.
# Treat a failure as a build failure.
npm run verify-plan-dose

# Exercise clips in the Supabase `exercise-clips` bucket.
#   clips check <dir>   — validate MP4s against the spec (<=1600 kbps, faststart,
#                         1080x1920, H.264, no audio) without uploading
#   clips upload <dir>  — validate then upload; refuses anything that fails
#   clips audit         — compare the live bucket against the catalog
#   clips recache       — re-stamp the one-year cache header on existing files
# Always upload through this script: the Supabase dashboard stamps max-age=3600.
npm run clips <subcommand>

# Meditation audio, same shape as `clips`
npm run meditation <subcommand>
```

Five more tools are run by hand rather than through `npm`, and are deliberately
not wired to a script — each one writes to a real account:

```bash
npx tsx scripts/delete-test-user.ts <email>              # wipe one user, all tables
npx tsx --env-file=.env.local scripts/regenerate-plan.ts <email>
npx tsx --env-file=.env.local scripts/seed-renewal-test.ts pre-renewal|rollover|fresh
npx tsx --env-file=.env.local scripts/plan-cycle-demo.ts <email> rollover|restore
npx tsx scripts/verify-rewards.ts                        # reward maths, no DB writes
```

**No automated test suite is configured.** There are no unit/integration/e2e test files or test runners in this project.

**Database migrations:** There is no ORM migration system. Every schema change
is a dated `.sql` file in `scripts/sql/`, applied by hand in the Supabase SQL
editor. The directory is the migration history — write the file even when you
apply the change through the dashboard, or the next person has no record of it.

The one-time admin API endpoints that used to run DDL are gone: an
unauthenticated route holding the service role key is a remote SQL console.
Don't add another.

**Cron jobs** (run automatically on Vercel per `vercel.json`):
| Endpoint | Schedule | Purpose |
|---|---|---|
| `/api/cron/weekly-recap` | 7pm UTC Sunday | The week's recap |
| `/api/cron/renewal-notices` | 11am UTC daily | Warn paying subscribers `RENEWAL_NOTICE_DAYS` before the next charge |
| `/api/cron/purge-anon-accounts` | 3am UTC daily | Delete emailless, unpaid anonymous accounts older than 7 days |

These three are the whole list — keep it in sync with `vercel.json`. (This table
used to name `daily-reminders` and `weekly-insights`, which have not been in
`vercel.json` for some time; engagement reminders moved to the device on
2026-08-27.)

**Any route that generates a plan needs `export const maxDuration`.** Generation
measures 15-17 seconds inside `after()`, and `after()` work is billed against
the function's duration — so a route that declares nothing inherits the platform
default, and if that default is under the generation time the callback is killed
mid-flight. The row stays `generating`, the app's poll re-kicks a run guaranteed
to die the same way, and she watches "building your plan" forever on an account
she has paid for. `/api/plan`, `/api/stripe/webhook` and
`/api/stripe/sync-session` each declare 60.

---

## 4. CODE PATTERNS & CONVENTIONS

### API Route Pattern
Every API route follows this exact order:

```typescript
// app/api/<feature>/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  // 1. Auth check (supports both cookie and Bearer token)
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Trial/paywall check (omit for free features)
  const isExpired = await checkTrialExpired(user.id);
  if (isExpired) {
    return NextResponse.json({ error: "Trial expired" }, { status: 403 });
  }

  // 3. Parse and validate body
  const body = await req.json();
  const { field } = body;
  if (!field) {
    return NextResponse.json({ error: "field is required" }, { status: 400 });
  }

  // 4. DB operation
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("table_name")
    .upsert({ user_id: user.id, field }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) {
    console.error("DB error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // 5. Response
  return NextResponse.json({ data }, { status: 201 });
}
```

### Supabase Clients
There are three Supabase client patterns — use the correct one:

| Client | File | When to use |
|---|---|---|
| Browser client | `lib/supabaseClient.ts` | Client components (`"use client"`) |
| Server client | Created inline via `@supabase/ssr` | Server components, `proxy.ts` |
| Admin client | `lib/supabaseAdmin.ts` → `getSupabaseAdmin()` | API routes, scripts (bypasses RLS) |

```typescript
// API routes always use admin client
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
const supabaseAdmin = getSupabaseAdmin(); // lazy singleton
```

### Authentication
- `lib/getAuthenticatedUser.ts` — **always use this** in API routes; it handles both cookie-based (web) and Bearer token (mobile) auth
- Auth UI: shared `components/auth/OtpForm.tsx`, used by `app/login/page.tsx`. The `/register` funnel no longer has an email phase (see below), so login is its only caller.
- Login flow: email → `signInWithOtp({ shouldCreateUser: false })` → 6-digit code → `verifyOtp` → session → honor `?redirectedFrom=` (validated, must start with `/` and not `//`)
- Registration flow: quiz → **anonymous sign-in** behind the calculating loader → `POST /api/auth/save-quiz` (server reads `userId` from session, validates payload with zod, creates `user_trials` row in `pending_payment`) → results → plan (the `diagnosis` phase) → relief → paywall → Stripe checkout **collects the email** → webhook binds it to that same user id and flips `account_status` to `paid`. `relief` runs breathing → reward and nothing else; the nutrition checklist that followed it (its own `nutrition` phase until 2026-08-16, then the second half of `relief`) was removed on 2026-08-17
- Mobile bridge (`app/auth/mobile-bridge/page.tsx`) is a session handoff (mobile → web token via `#hash`), not a login — leave it alone
- Email template: paste branded HTML into Supabase Dashboard → Auth → Email Templates → Magic Link, with `{{ .Token }}` for the 6-digit code
- `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`, and the exported function from `middleware` → `proxy`) protects `/dashboard/*`. It runs two gates: a session check on everything in `PROTECTED_PREFIXES`, then a payment check that skips `PAYMENT_EXEMPT_PREFIXES` (`/dashboard/account`, `/dashboard/settings`) so cancellation and account deletion stay reachable after access ends. Select the full `TRIAL_SELECT_COLS` when reading `user_trials` — a partial select makes missing columns read as "no dispute, not canceled" and grants access it shouldn't.

### Anonymous accounts (the `/register` funnel)

The funnel asks for **nothing** before the card. No email box, no 6-digit code,
no waiting on an inbox. It works because a Supabase anonymous user is a real row
in `auth.users` with a real id and a real JWT — it just has no email — and every
route here keys off `user.id`, never the address.

The chain, and the order it must happen in:

1. `completeRegistration()` (`app/register/page.tsx`) runs behind the
   calculating loader: `supabase.auth.signInAnonymously()`, then `save-quiz`.
   A ref guards it — running twice mints a second account and orphans the first.
2. `create-checkout` passes `customer_email: user.email ?? undefined`. For a
   funnel visitor that is `undefined`, so **Stripe collects the email**.
3. `resolveCheckoutAccount()` (`lib/stripe/fulfillCheckout.ts`) binds
   `session.customer_details.email` to the account with
   `auth.admin.updateUserById(..., { email_confirm: true })`.

**Bind the email before writing `user_trials`.** This used to be load-bearing: a
trigger on that write mirrored her into an email-sequence table and returned
early if she had no address yet, so a late bind cost her the drip silently. That
machinery is gone (2026-08-12) and nothing races the bind now — but keep the
order anyway. Every step after it reads the address off `auth.users` rather than
being handed it, and it is how she logs into the app.

Two consequences worth knowing before changing any of this:

- **Collision is a real path, not an edge case.** Only one account can hold an
  address, so a returning customer typing her usual email at Stripe fails the
  bind. `resolveCheckoutAccount` then looks the address up via
  `auth_user_id_by_email` and **returns that account's id**, so the subscription
  lands on the account she can actually log into. Her quiz answers are copied
  over only if that account has no profile yet — existing data outranks a
  re-take.
- **The address is never verified.** She proves nothing by typing it into
  Stripe, so a typo is an account she has paid for and cannot log into. There is
  no self-serve recovery; it is a support job.

`is_anonymous` is **not** a reliable "never paid" flag — it may stay `true` after
the webhook binds an email. Never gate anything on it alone. `purge_stale_anonymous_users()`
requires `email is null` *and* no paid row for exactly this reason, and
`completeRegistration()` checks the `user_trials` row for every session,
anonymous or not, rather than trusting the flag.

Housekeeping: every quiz finisher who never pays leaves an account behind, and
Supabase bills monthly active users, so `/api/cron/purge-anon-accounts` deletes
emailless, unpaid anonymous accounts older than 7 days. Every public user table
now carries `user_id references auth.users on delete cascade` (verified
2026-08-29; `llm_usage` used to be the one exception and was dropped
2026-09-04). `purge_stale_anonymous_users()` therefore
deletes from `auth.users` alone and lets the cascade do the rest; the per-table
list it used to carry is gone, and it is what broke the function last time. Add
a table with a `user_id`, give it the FK — do not add a line to that function.

**Requires "Anonymous sign-ins" enabled** in Supabase Dashboard → Authentication
→ Sign In / Providers. With it off, `/register` dead-ends at the calculating
screen. Migration + verification commands:
`scripts/sql/2026-08-10-anonymous-funnel-accounts.sql`.

### Checkout fulfillment (`lib/stripe/fulfillCheckout.ts`)

Everything a paid checkout triggers lives in `fulfillCheckout()`, and **two
callers run it**:

- `app/api/stripe/webhook/route.ts` on `checkout.session.completed` — normal.
- `app/api/stripe/sync-session/route.ts` — the fallback the success screen calls
  with its `session_id`, authorized by `session.client_reference_id === user.id`.

The fallback exists because a webhook genuinely may never arrive: a signing
secret that no longer matches the endpoint, an endpoint pointed at the apex
(`menolisa.com` **307s to `www`, and Stripe does not follow redirects**), a
Stripe incident. It used to recover only the subscription row, so a missed
webhook cost the customer her login address and her plan with no way back. Both
paths now do the same four things: bind the email, write `user_trials`, kick the
8-week plan, send the welcome email.

**The one-time side effects are claimed, not checked.** She lands on the success
screen at roughly the moment Stripe fires the event, so both callers really do
race. `claimFulfillment()` does a conditional update:

```sql
update user_trials set fulfilled_at = now()
 where user_id = $1 and fulfilled_at is null returning user_id;
```

Postgres serialises the two on the row lock, so exactly one gets a row back and
sends the email / starts the plan. Add a new once-per-purchase side effect
behind this claim, never beside it. Never set `fulfilled_at` by hand — a
non-null value permanently suppresses them.

Two things stay webhook-only:
- **`last_stripe_event_at`**, the out-of-order watermark. It records how far
  Stripe's *event stream* has been processed; stamping it from the fallback
  would make the next genuine webhook look stale and be dropped. Hence
  `stampWatermark`.
- **The Meta CAPI `Purchase`**, which is deduped against the browser pixel by a
  shared `event_id`. The fallback runs inside the browser's own request and
  can't tell whether the pixel copy fired, so it reports nothing.

If neither path ran, `GET /api/plan` is the last net: reaching it with no
`user_plans` row means she is paying (`checkTrialExpired` already passed) and has
no plan, so it claims the row and generates. It used to return `status: "none"`
forever — the stall re-kick below it needs a row to already exist.

Migration: `scripts/sql/2026-08-10-checkout-fulfillment-claim.sql`.

### Database Schema (key tables)
Supabase (PostgreSQL) — no ORM, raw SQL queries via Supabase JS client:

| Table | Key Columns |
|---|---|
| `symptoms` | `id`, `user_id`, `name`, `icon`, `is_default` |
| `symptom_logs` | `id`, `user_id`, `symptom_id`, `severity` (1-3), `triggers[]`, `time_of_day`, `notes`, `logged_at` |
| `user_profiles` | `user_id`, `name`, `top_problems[]`, `severity`, `timing`, `goal`, `doctor_status` |
| `user_trials` | `user_id`, `account_status` ("pending_payment"/"paid"/"expired"), `subscription_ends_at`, `subscription_canceled`, `payment_failed_at`, `dispute_flagged_at`, `provider`, `plan_type`, `plan_amount`, `fulfilled_at` (one-time-side-effect claim — see "Checkout fulfillment"), `renewal_notice_sent_for` (the `subscription_ends_at` the renewal email already covered), `trial_ends_at` / `first_paid_at` / `offer_variant` (the free trial — see "The free trial"; none of them is read by `getAccountState()`). The table name is legacy; it holds subscriptions. |
| `documents` | Vector store — `id`, `content`, `metadata` (JSONB), `embedding` (vector 1536) |
| `notifications` | `user_id`, `type`, `content`, `metadata` (JSONB), `is_read`, `created_at` |
| `ad_spend` | One row per calendar day of Meta ad spend, typed into `/admin` — `day` (PK), `amount_usd`. Service-role only: RLS on, no policies, no grants. |
| `funnel_events` | One row per `/register` screen reached — `session_id` (a random per-visit uuid, **not** an account and never joined to `auth.users`), `step`, `step_index`, `created_at`. The funnel's only measurement before the profile insert at step 17. Service-role only: RLS on, no policies, no grants. Never add her answers to it — see below. |

### Admin panel (`/admin`) — the sales desk

Password-gated by `ADMIN_PANEL_PASSWORD` (unset = closed, deliberately). One
endpoint, `POST /api/admin/stats`. Rebuilt 2026-08-30 around a sharper question
than before: not "is money arriving?" but **"should I spend more on ads
tomorrow?"** — which is the only question a $59 auto-renewing plan sold on Meta
ever really asks. Five blocks: the verdict, cash in, unit economics, the funnel
top to bottom, latest sales, needs a human.

- **Money is Stripe. People are Supabase. Never mixed.** Every dollar comes from
  `stripe.charges.list()`; names, quiz finishers, renewal dates, plan status and
  cancellations come from Supabase. `user_trials` holds one row per person,
  overwritten on every renewal, so it can say who is paying but never how many
  times or how much arrived last month — that history is destroyed on each
  update. Both the route and the page say so at the top, and every block on
  screen carries a source tag, because this is the thing people forget first.
- **A customer's first successful charge is a new sale; the rest are renewals.**
  One charge list gives revenue, the new-vs-renewal split, the new-customer
  count, the renewal rate and the guarantee exposure — no second API call.
- **Cost per customer divides by *new* customers only.** Ads do not buy
  renewals. The old panel divided ad spend by every charge, which flattered CAC
  and got worse every cycle as the renewal base grew.
- **Renewal rate and LTV are the point of the block.** Without them, CAC vs the
  first $59 is the strictest possible bar and will tell you to switch off
  campaigns that make money. The cohort is customers whose first charge is older
  than `PLAN_WEEKS*7 + RENEWAL_GRACE_DAYS`; the grace exists because Stripe
  dunning retries for several days and scoring those as churned understates the
  rate exactly when it matters. `ltv` caps the `1/(1-r)` multiplier so a tiny
  all-renewed cohort can't print an infinite customer.
- **`ADMIN_CAMPAIGN_START` floors the funnel, because Stripe sessions cannot be
  deleted.** A Checkout Session is immutable — there is no delete in the API,
  and `loadCheckoutStarts` counts every session whatever its status — so the
  taps you made testing the paywall sit in the 30-day window for a full 30 days
  with no way to remove them at the source. On 2026-09-02 that was 4 live
  sessions against a one-day-old campaign, i.e. more checkouts than visitors.
  Deleting the Supabase side makes it *worse*: the quiz finishers go and the
  sessions stay, so the middle funnel step exceeds the first (the bar clamp at
  `Funnel()` exists for exactly this). The floor gates `newCustomers30` (the CAC
  denominator — dividing this month's ad spend by a customer who bought before
  you ran an ad reports a CAC the ads did not earn); it used to gate the funnel
  steps too, until the curve was floored at the first screen ping instead. It is anchored at **local midnight** on that day: UTC midday throws
  away launch morning, UTC midnight lets the previous evening back in east of
  Greenwich, and both were live bugs in the first cut of it. `funnel.clamped`
  makes the panel say "Since 1 Sep · 2 days" rather than "Last 30 days" — never
  present a floored window as a full one. Unset = no floor; safe to delete once
  the campaign is over 30 days old.
- **Dates are the operator's day, not UTC's.** The browser sends
  `tzOffsetMinutes` (clamped to ±840); `isoDay()` **must** be passed it. Both
  halves of this were live bugs on 2026-08-30: `toISOString()` renders the UTC
  date, so local midnight east of Greenwich filed today's ad spend under
  yesterday; and the daily series indexed backwards from midnight, which floors
  to −1 for anything later than midnight today — dropping every charge taken
  today and shifting yesterday's into today's slot. The series must sum to
  `money.last30.net` exactly; that equality is the test.
- **Ad spend lives in the `ad_spend` table, one row per day.** It was
  `localStorage` until 2026-08-30 — one browser, one "total to date" number.
  That is unwindowable, so 30-day cost-per-sale was contaminated by every dollar
  ever spent, and opening `/admin` on a phone showed an empty box. The write
  rides the same `POST /api/admin/stats` (one endpoint, one password check) and
  returns recalculated stats in the same round trip; `amount: null` clears a day.
  Missing days in the last 7 are surfaced — today is excluded, since you type it
  in at the end of the day. Migration: `scripts/sql/2026-08-30-ad-spend.sql`.
- **`keptPerSale` is measured, not assumed** — the real fee rate off the balance
  transactions, falling back to Stripe's published 2.9% + 30¢ only at zero
  volume. `kept` (net less fees) is the only figure it is honest to compare
  against ad spend, and it is what contribution is built from.
- **The funnel is one curve, one window, and no row measured twice.** It was two
  panels until 2026-09-02, then one block with two bands until 2026-09-03. The
  bands were merged because the seam was doing damage, not because the units
  stopped differing:
    - Its first row, "Finished the quiz", **was** the `calculating` row above it.
      `save-quiz` writes `user_profiles` behind the calculating loader, so they
      are the same instant — one counted women, the other visits, over two
      different windows, printed as two rows of one funnel. That is the duplicate
      that made the panel read 63 above 54 and look broken.
    - The bands overlapped rather than stacked. The top ran to `paywall`, which
      is *below* where the bottom restarted, so the curve appeared to climb.
    - **Paywall → card form could not be computed at all**, because it spanned
      the seam — and it is the number that splits "the offer screen is weak"
      from "checkout is leaking".
  The unit objection that justified the split does not survive the data: over one
  window `calculating` is 54 visits and `user_profiles` is 54 women, exactly.
  Visits and women diverge at the *top*, where one woman opens the ad twice, and
  every money row is at the bottom where they have converged. So the source is
  stated **per row** (`source: "screens" | "stripe"`) rather than per band, and
  `group` prints a stretch label — presentation only, it never changes a base.
- **Everything on the curve is windowed from `curveSince`** = the later of the
  acquisition window and the **first `funnel_events` ping that ever happened**.
  Read unwindowed so it is a fixed instant: "the oldest ping in the last 30 days"
  walks forward whenever traffic pauses and would silently narrow the whole block
  over a quiet weekend. This is what removed the two-windows artefact rather than
  footnoting it, and it is why `ADMIN_CAMPAIGN_START` no longer gates the funnel
  at all — tracking began after the campaign did, so the tracking floor is
  strictly stricter. The env var's remaining job is `newCustomers30`, the CAC
  denominator, which keeps `funnelSince` (exported as `acqSince`/`acqDays`): a
  customer who bought the day before tracking went live still cost ad money.
- **Two rows are excluded from the curve, both deliberately.** `start` — the
  screen is reachable only by pressing Back since `/register` cold-starts on
  question 1, and it carries `step_index` 0, so leaving it in would make a
  handful of women who arrived backwards the 100% base for every bar. And
  `download`, the post-checkout landing screen, because it measures the same
  event `stripe_paid` measures and Stripe is the side that knows whether money
  moved. `INACTIVE_STEPS` in the route, not the label map — the page must never
  compute a figure the route didn't.
- **The two money rows are Stripe, appended below `paywall` because that is
  where they happen:** `stripe_checkout` (Checkout Sessions, mobile excluded via
  `checkout_surface`) then `stripe_paid` (first charges — a first charge is a new
  customer, later ones are renewals). Mixing a `funnel_events` numerator with a
  Stripe denominator is only sound because both are web-only today (the Expo app
  is downloaded *after* checkout); if mobile signup becomes real traffic, split
  before trusting the percentage.
- **The RPC groups by screen name, never by `step_index`** — it grouped by
  position for one day, on the assumption that a step is renamed but never moved,
  and the quiz reordered the next morning. Two screens swapping places then land
  two different screens in one bucket and label both with whichever name sorts
  first: two identical rows, no row for the moved screen, and blended counts, for
  a whole 30-day window — the window you are reading to find out whether the
  reorder worked. Ordering is the position each screen was *last* seen at, i.e.
  the funnel as it stands today. Migration:
  `scripts/sql/2026-09-03-funnel-dropoff-by-step.sql`.
- **Three reading rules, all of them measurement rules rather than styling.**
  The bar is share-of-entry, but **the called-out number is what that row lost to
  the next one** — a cumulative curve falls monotonically, so every late step
  looks bad by construction and none of them is accused of anything. Which row
  carries the figure is not cosmetic: `pingFunnelStep` fires when a screen
  *renders*, so a woman missing from `q_body` abandoned on the reward board
  before it. This shipped the other way round for one day and the first analysis
  of the data blamed the symptoms question for the age question's loss and the
  height/weight sliders for the reward board's — both fixes aimed one screen past
  the problem. And only losses at or above `CLIFF_PCT` (25%) are coloured,
  because on a 23-screen funnel everything below that is ordinary attrition and
  colouring it all teaches you to ignore the colour.
- **Colour names one thing each.** Bar fill is **depth** — hue 221° → 360°, blue
  at the top of the funnel to red at the money, deliberately not through green
  and yellow (a rainbow puts the loudest colour mid-funnel for no reason, and
  green is what this panel means by Stripe everywhere else). A cliff therefore
  marks the screen's **name** in orange rather than its bar, so the accusation
  and the depth cue never compete. Bar length is one shared scale across the
  whole curve; before 2026-09-03 the money band's first row was hard-coded to
  100% because it was measured against itself, which made the longest bar in the
  chart one of its smallest numbers.
- **Two separate sample guards, and they are not the same number** — the first
  live render got this wrong and the panel showed it: `MIN_CLIFF_BASE` (25) is
  per row and decides whether a loss may be *called* a cliff at all, because
  `2 → 1` is otherwise a 50% catastrophe in bright orange; `MIN_VERDICT_ENTRY`
  (50) gates the sentence that tells you what to do, and is higher on purpose,
  because a coloured bar is an observation a reader can weigh while "fix that
  screen before any other" is an instruction — at n=10 it sends you to rewrite a
  screen chosen by three people. Below it the block states the visit count and
  says it is too early, the same choice the empty state makes. Both thresholds
  and the `significant` flag come from the route, so the bar, the figure and the
  verdict can never use different rules.
- **`STEP_LABELS` mirrors the quiz, and nothing on it is invented.** The keys are
  exactly what `pingFunnelStep()` sends (`STEPS` then `POST_QUIZ_PHASES`, in that
  order) plus the two Stripe rows; the `Q<n>` prefixes are the quiz's own counter
  (`QUESTION_STEPS`, rewards excluded), so Q13 is the thirteenth of thirteen on
  screen; and each label uses the words that screen uses. Renumber in the same
  commit as a reorder — a stale number is worse than a raw key, because it looks
  answered. It keeps a raw-name fallback on purpose: this panel must never be the
  reason a step cannot be added to `app/register/page.tsx`.
- **One artefact the block must keep explaining**, because it looks like a
  broken panel and is not: a row bigger than the one above it. Two things do it
  and neither is a miscount — a screen that moved in the quiz sits in a window
  containing both orders (live right now: 181 on age against 141 on symptoms),
  and Stripe Checkout Sessions cannot be deleted, so test taps stay until they
  age out. Bars clamp; the rates print the true figure.
- **The verdict sentence is computed server-side**, so the panel and any future
  alert can never disagree about what the numbers mean.
- **`ADMIN_FIXED_MONTHLY_USD`** is hosting + database + email + domain. Unset
  reads as 0 and the panel says so, rather than reporting a contribution figure
  that quietly ignores the bills.

The endpoint reads `auth.users` for emails via `listUsers` (PostgREST can't see
that schema and there is no bulk get-by-ids), and caps its Stripe walks and
client list — each cap surfaces in the response rather than silently truncating
(`salesTotal` is what lets the list say "newest 40 of 113"). Read `user_trials`
through `TRIAL_SELECT_COLS`, never a hand-written column list.

**What was deliberately removed, and why not to re-add it.** From 2026-08-29: AI
cost per plan, token counts, generation duration, MRR, the six-card
account-state grid, the by-month bar chart, the gross/net/fees split, and the
table of every account with a billing row. `llm_usage` and `lib/llmCost.ts` are
themselves **gone** as of 2026-09-04 — there is no per-call cost record any
more, so a cost question needs the instrumentation rebuilt before it can be
asked. (The last survivor — the *measured*
serving cost per customer, deducted from contribution — went on 2026-09-03: it
was fractions of a cent per plan and never changed a decision. Contribution is
kept, less ads, less fixed costs, nothing else.) From
2026-08-30: **"Profit"** — all-time revenue minus a hand-typed spend total, no
fees, no fixed costs, two windows that never lined up; **the "Her plan" column**
— an ops signal in a money table, already duplicated by the alert under it;
**the refund and declined-card banners** — figures, not emergencies, so they
moved into Cash and the alert block stays alarming; and **"collected today" as
the headline** — at two sales a day it swings 100% on noise, so seven days leads
and today is a cell. Migrations: `scripts/sql/2026-08-11-llm-usage.sql`,
`scripts/sql/2026-08-30-ad-spend.sql`.


### Funnel measurement (`POST /api/funnel-step`, `funnel_events`)

The `/register` funnel mints her account at **step 17 of 17**, so until
2026-09-02 the first sixteen screens produced no server-side record at all. The
first paid campaign bought ~200 landing page views and produced 10 profiles, and
nothing in the database could say which screen the other 190 left on — so every
candidate cause was equally plausible and none was testable.

`POST /api/funnel-step` fires once per screen and writes one row. Rules:

- **It is unauthenticated, and that is the point.** Any session check would
  measure only the women who already finished, which is the number we already
  have. The payload is therefore the whole attack surface: `session_id` must
  parse as a uuid, `step` must match `/^[a-z0-9_]{1,32}$/`, `step_index` must be
  an integer in 0..40. Anything else is a 400 that writes nothing.
- **No user id, ever** — not from the body (see `/api/intake`'s history) and not
  from a session. `session_id` is minted in the browser per visit and dies with
  the tab.
- **Never add the answer she gave on the screen.** The safety argument for
  storing this is that a leak would disclose that somebody reached question 9 and
  nothing else. A symptom or a goal here makes it health data about a
  re-identifiable visit — the exact thing `sendMetaLead` had to stop doing on
  2026-08-30.
- **It is not a Meta event and must not become one.** AEM caps the domain at 8
  prioritized events; that is why the seven custom funnel events were deleted on
  2026-08-17 and why re-adding them is in the "decided against" table. "Which
  screen leaks" is a product question, answered in our own database.
- **One key per row, and re-keying a row throws its history away.** `relief` was
  split into `relief_intro` / `relief_running` / `relief_reward` on 2026-09-03
  (the phase really is three screens, and the single row could not say which of
  them lost the 16%) and put back on **2026-09-04**. The split was right about
  the product question and wrong about the cost: every session already inside the
  30-day window is keyed `relief`, so the chart printed three near-empty rows
  beside a historical one and the breathing step became unreadable at exactly the
  volume it was added to measure. `POST_QUIZ_FUNNEL_STEPS` pings one `relief`
  again; `/api/admin/stats` folds `relief_intro` back into `relief` (same
  phase-entry event, and a session pinged one key or the other depending on the
  deploy, never both, so the sum is exact) and drops `relief_running` /
  `relief_reward` via `INACTIVE_STEPS`. If those three screens are worth
  separating again, do it as a second chart off the same table rather than by
  re-keying the row the curve depends on.
- Client side is `pingFunnelStep()` in `app/register/page.tsx` — `keepalive`,
  fire-and-forget, every failure swallowed, deduped per visit by a ref. It
  returns without a row rather than inventing a weak id when `sessionStorage` or
  `crypto.randomUUID` is unavailable.

Disclosure: covered by Privacy §2.6 ("Usage data — which features and screens
you use"). Verified before shipping; no policy edit was needed. Retention is the
operator's call and `created_at` is indexed so a periodic delete is cheap.
Migration: `scripts/sql/2026-09-02-funnel-events.sql`.

### The free trial (2026-09-04)

The first campaign's read was 74 quiz finishers, a normal paywall → card-form
rate, and 0 payments: the ask, $59 from a woman who met the brand ten minutes
ago, was the last step failing. The paywall now sells **a free trial**:
Stripe saves the card at $0 (`subscription_data.trial_period_days: TRIAL_DAYS`,
`payment_method_collection: "always"`) and charges `PLAN_PRICE` when it ends,
then every `PLAN_WEEKS` weeks as before. `lib/pricing.ts` holds `TRIAL_DAYS`
(**5** — it shipped at 7 and was cut the same day, with `RENEWAL_NOTICE_DAYS`
going 3 → 2 so the notice still lands inside it), `trialEndDate()`,
`formatChargeDate()`, the two `OFFER_VARIANT_*` ids and `isTrialOffer()`;
nothing else states the length. **Copy says "free trial" and prints
`TRIAL_DAYS`, never "free trial"** — that wording was true for one day.
`OFFER_VARIANT_TRIAL` is `trial_free` (length-agnostic on purpose: it is
persisted on `user_trials.offer_variant`, Stripe metadata and the success URL);
the first day's sessions carry `trial7_free`, so **read it through
`isTrialOffer()`, never `===`**. **There is no feature flag** — one was built
and removed the same day ("no complications"); the $59-today path survives
only for returning customers (`trialEligible === false`, "welcome back").
Migration: `scripts/sql/2026-09-04-free-trial.sql` — **apply it before
deploying this code**: the account card and `/api/account/status` select
`trial_ends_at`, and a select naming a missing column fails the whole read,
which the dashboard turns into a paywall for every paying customer.

Rules that hold it together:

- **It is not a state.** A trialing subscription is stored as `paid` with
  `subscription_ends_at = trial_end` — Stripe reports `current_period_end ===
  trial_end` during a trial, so `getAccountState()` needed no change and the
  Expo app sees an ordinary subscriber with `TRIAL_DAYS` days left. `trial_ends_at`
  exists beside it so the readers that must tell "a free trial" from "eight
  weeks paid" can: the renewal cron (sends "your free trial ends" when the two
  dates match), `/api/account/status` (`in_trial`), and the account card
  (`inTrial`). The rule in "Access control" stands: don't teach
  `getAccountState()` about a trial.
- **`RENEWAL_NOTICE_DAYS < TRIAL_DAYS`**, asserted at module load in
  `lib/pricing.ts`. The notice is the same cron, the same window and the same
  `renewal_notice_sent_for` marker, landing on day 3 of the five; only the copy
  branches. One constant covers the trial end *and* every 8-week renewal, so
  cutting it to 2 for the trial also shortened the renewal warning to 2 days.
- **Meta `Purchase` fires once, when the free trial starts, at value 0.**
  Browser copy from `MetaPurchaseTracker` (off `?offer=trial7_free`), server
  copy from the webhook, deduped on `purchaseEventId(session.id)`. The live ad
  set optimises on `Purchase` and re-pointing it means a new ad set and a fresh
  learning phase, so the event stays where it was; the value is
  `TRIAL_PURCHASE_VALUE` (0) because that is what moved — reporting $59 on a
  saved card inflates Meta's revenue by the trial-cancel rate. A returning
  customer's $59-today checkout still reports 59. **The trial-end charge is
  `Subscribe`** (standard event, server-only, value = amount paid,
  `subscribeEventId(invoice.id)`), never a second `Purchase` — two conversions
  a week apart from one click is an attribution mess, and `Subscribe` gives a
  clean money event to build a future ad set on. Its match data rides on
  `subscription_data.metadata`, copied there by `create-checkout`, because an
  invoice can reach its subscription but not the Checkout Session. Once
  `/admin` can state the trial → paid rate, `TRIAL_PURCHASE_VALUE` may become
  rate × `PLAN_PRICE` — one constant in `lib/metaPixel.ts`. Nothing in Ads
  Manager needs touching.
- **`first_paid_at` is a claim, like `fulfilled_at`.** `claimFirstPayment()`
  sets it from null exactly once; `sendTrialConvertedEmail` (the trial-end
  receipt) fires only for the caller that won. It runs **before** the
  webhook's stale check on purpose — the conversion arrives as a burst with
  `customer.subscription.updated`, and the ordinary ordering could drop the
  invoice event as stale. A paid-upfront checkout claims it at fulfillment
  (`amount_total > 0`), so that path sends nothing new. Never set it by hand.
- **One free trial per person, as far as we can see.** `create-checkout` refuses
  the trial to any account with a `stripe_subscription_id` or `fulfilled_at`,
  and asks Stripe when the row has a customer id; `/paywall` shows the
  "welcome back — starts today at $59" line off `previously_paid`. The gap is
  the returning customer on a fresh anonymous account: the funnel collects no
  email before Stripe, so she is recognised only when the address collides in
  the webhook and the subscription merges onto her old account. She gets a
  second free trial. The fix would be asking for an email before the card,
  which the funnel exists not to do.
- **`sync-session` accepts `no_payment_required`.** A $0 session completes
  with that `payment_status`; checking `"paid"` alone would leave a trial
  customer whose webhook was lost with no plan and no login address.
- **Terms §10.7 is the trial's contract.** It and §10.1 import every figure.
- **`/admin` splits the two paywalls** (`trials.checkoutByOffer`), draws a
  `stripe_trial` row between the card form and the charge, scores trial →
  paid only on trials older than
  `TRIAL_DAYS + RENEWAL_GRACE_DAYS`, and counts cancels-in-trial off the
  subscription list. The paywall and the Stripe rows are excluded from
  `worstStep`: a price is always the steepest drop, and with the trial the
  paid row lags the card form by a week.
- Not done: `consent_collection.terms_of_service` on the session. Stripe
  rejects the whole checkout unless a Terms URL is set in Dashboard → Settings
  → Public details; add it once that is confirmed set in live mode.

### Access control (who gets in)

`lib/getAccountState.ts` is the single place access is decided. Everything else
— `checkTrialExpired()`, `proxy.ts`, `/api/account/status`, the dashboard
layout — is a caller. Add a rule here, not at a call site.

The plan is $59 per 8 weeks with **no trial**, so the shape is simple:

| Row state | `state` | Access |
|---|---|---|
| `paid`, `subscription_ends_at` in future | `active` | yes |
| `paid` + `subscription_canceled` | `canceling` | yes, **until `subscription_ends_at`** |
| `paid` + `payment_failed_at` (Stripe dunning) | `past_due` | yes |
| `paid` but period elapsed (webhook missed) | `ended` | no |
| `paid` with **no** `subscription_ends_at` | `ended` | no — fail closed |
| `expired` / `pending_payment` / unknown / no row | `ended` | no |
| `dispute_flagged_at` set | `disputed` | no |

Cancelling stops the **next** renewal; it never revokes the weeks already paid
for. That is what Stripe and the app stores expect, and revoking early invites
chargebacks.

Two rules worth keeping:
- **Never write `account_status: "paid"` without an expiry.** The read side
  fails closed on it, so a null cutoff locks out a paying customer. The Stripe
  webhook falls back to `now + PLAN_WEEKS` if Stripe hands back no period end.
- **Select every column in `TRIAL_SELECT_COLS`.** Missing columns come back
  `undefined`, which reads as "no dispute, not canceled, no failed payment".

There is no trial machinery left, in the code or the schema. The `trialing`
state, the `trial_start` / `trial_end` / `trial_days` columns, and the triggers
that recomputed `trial_end` on every write (which stamped a phantom 3-day trial
onto freshly-paid accounts) were all removed on 2026-08-08 — see
`scripts/sql/2026-08-08-drop-trial-columns.sql`. `subscription_ends_at` is the
only access boundary. Don't reintroduce a trial without teaching
`getAccountState()` what it means; a column nothing reads is worse than useless,
because the next reader assumes it is authoritative.

`checkTrialExpired()` **fails closed**: a missing row or a failed query denies
access. It used to allow in both cases, which handed the whole product to any
authenticated user whose `user_trials` row hadn't been created yet. The function
keeps its legacy name; it gates subscriptions, not trials.

### Web app vs mobile app

The product — symptom tracking, Lisa chat, notifications — lives in the Expo
app. The web app's job is the `/register` funnel that sells it, plus billing and
account deletion. **The web UI for all three is deleted, not flagged off**, as
of 2026-08-14:

| Gone | Was |
|---|---|
| `app/chat/lisa/` | Lisa chat |
| `app/dashboard/notifications/` + `NotificationGroup`/`ListItem`/`Help`, `hooks/useUnreadCount.ts`, `lib/notificationUtils.ts` | Notification centre |
| `app/dashboard/symptoms/`, `components/symptom-tracker/`, `/api/insights`, `/api/tracker-insights` | Tracker + "What Lisa noticed" (removed earlier) |
| `WEB_APP_ENABLED` / `NEXT_PUBLIC_WEB_APP_ENABLED` | The switch that used to hide them |

There is no flag to bring them back — restoring any of it means writing it
again. The dashboard nav is Account alone, `/dashboard` redirects to
`/dashboard/account`, and `/get-the-app` is the stable public URL that old links
(welcome and renewal emails, the daily log reminder, notification CTAs
mentioning Lisa) point at.

**What stayed, and why it must:**

- **Every API route.** `/api/langchain-rag`, `/api/chat-sessions`,
  `/api/symptoms`, `/api/symptom-logs`, `/api/notifications`, `lib/rag/`,
  `lib/trackerAnalysis.ts`, `knowledge-base/` and `npm run ingest` are the
  backend the Expo app calls — `/api/langchain-rag` *is* Lisa on mobile.
  Deleting them because "chat is gone from the web app" takes the feature out
  of the phone too. Each enforces access itself via `checkTrialExpired()`; any
  new route serving paid content needs that check, because auth alone is not
  enough.
- **The toast stack** (`NotificationProvider`, `NotificationContainer`,
  `NotificationCard`) — still mounted by the dashboard layout for trial and
  billing toasts. Only the notification *centre* page went.
- **`/dashboard/settings/notifications`** — push preferences, which govern what
  the phone sends. A web setting for a mobile behaviour is still a web setting.

Account and Settings are never gated on payment, in either `proxy.ts` or the
dashboard layout. Someone whose subscription ended must still be able to cancel
and delete.

### State Management
No global state library (no Redux/Zustand). Patterns used:
- **Custom hooks** in `hooks/` for server data (fetch on mount, return `{ data, loading, error, refetch }`)
- **Custom DOM events** for cross-component communication: `document.dispatchEvent(new Event('symptom-log-updated'))`
- **URL search params** for modal state and post-checkout redirects
- **React `useState`/`useReducer`** for local UI state

### Error Handling
```typescript
// API routes: always log + return structured JSON error
if (error) {
  console.error("Context:", error);
  return NextResponse.json({ error: "Human-readable message" }, { status: 500 });
}

// Client-side hooks: return error state, never throw
const [error, setError] = useState<string | null>(null);
// ... in catch: setError(err.message)
```

### Environment Variables
Local values live in `.env.local` (gitignored); production values live in the
Vercel project settings. `.env.example` is the committed template and is the
authoritative list — **it is kept in sync with the code, so if you add a
`process.env.X`, add it there too.** Pattern:
- `NEXT_PUBLIC_*` — safe to expose to browser
- Others — server-only (API routes, scripts)

Every variable in `.env.example` is read somewhere. Two rules that earned their
place:

- **`NEXT_PUBLIC_SITE_URL` is the only base-URL variable.** There used to be a
  second one, `NEXT_PUBLIC_APP_URL`, read in seven places with a different
  fallback — so email links and Stripe redirect URLs could disagree about which
  domain the app was on. Removed 2026-08-08.
- **One plan means one price id.** `STRIPE_PRICE_MONTHLY` and
  `STRIPE_PRICE_ANNUAL` were removed; `STRIPE_PRICE_8WEEK` is the only one.

See `.env.example` for the full annotated list rather than duplicating it here —
a second copy is a second thing to forget to update.

### Meta Pixel / Conversions API
Ad tracking for the `/register` web2app funnel:

**Six events, all standard. There are no custom events.** Adding one is a
decision about the AEM budget, not a small change — read the whole section
first.

| Event | Browser | CAPI | Fires from | Value |
|---|---|---|---|---|
| `PageView` | yes | — | `components/MetaPixel.tsx` (in `app/layout.tsx`); re-fires on App Router route changes | — |
| `Lead` | — | yes | `sendMetaLead()` from `/api/auth/save-quiz`, **only on `user_profiles` insert** and only for cookie (web) callers | — |
| `ViewContent` | yes | yes | Browser: `components/PaywallView.tsx` on mount. Server: `sendMetaViewContent()` from `POST /api/paywall-view`, the beacon that mount fires | $59 |
| `InitiateCheckout` | yes | yes | Browser: `PaywallView` CTA click. Server: `sendMetaInitiateCheckout()` from `/api/stripe/create-checkout` once the session exists | $59 |
| `Purchase` | yes | yes | Browser: `components/MetaPurchaseTracker.tsx` on the success landing. Server: `sendMetaPurchase()` from the Stripe webhook. Fires when the **free trial starts**, at `TRIAL_PURCHASE_VALUE` (0); a returning customer's $59-today checkout reports 59. See "The free trial" | $0 / $59 |
| `Subscribe` | — | yes | `sendMetaSubscribe()` from the webhook on a trial's first **paid** invoice (`first_paid_at` claim). The real-money event; never a second `Purchase` | $59 |

#### Why the funnel's custom events are gone (2026-08-17)

`QuizStart`, `QuizStep`, `QuizComplete`, `ResultsView`, `PlanView`,
`PlanScrollDepth` and `ReliefDone` were removed before the first campaign, along
with `META_FUNNEL_STEPS`, `trackFunnelStep()`, `trackQuizStep()` and
`trackScrollDepth()`. They were good product instrumentation and bad ad
instrumentation:

- **Aggregated Event Measurement caps a domain at 8 prioritized events.** Twelve
  meant iOS traffic reported only the top 8, and any custom event ranked above
  `Purchase` cost real attributable conversions. Five leaves headroom and makes
  the priority order obvious.
- **A custom event is invisible until someone defines a Custom Conversion for
  it**, and a Custom Conversion is a second-class optimization target next to a
  standard event — delivery, Advantage+ and value rules are built around the
  standard set.
- **Only these five can be spent against.** "Which screen leaks" is a product
  question; routing it through the ad pixel bought noise in Events Manager and
  nothing in the auction.

`QuizComplete` specifically was a duplicate — `Lead` fires one screen later with
the same `symptom_count` / `goal`, off the database insert rather than
sessionStorage, so it counts women rather than tabs.

**Housekeeping in Events Manager:** archive the seven Custom Conversions (plus
`ChecklistDone`, dark since the nutrition checklist was cut) and don't reuse the
names — the historical data behind them means the old screens.

**If the funnel screens need measuring again, they need a product-analytics
tool, not this file.** The 2026-08-16 pass added them because results → plan →
relief was an unfalsifiable black box, and that reasoning was right about the
*need* and wrong about the *channel*. Do not re-add one without deciding which
of the eight AEM slots it takes and from whom.

#### Deduplication

Both dual-reported events collapse on a shared `(event_name, event_id)`:

- `Purchase` — `purchaseEventId()` in `lib/metaPixel.ts`, derived from the
  Stripe Checkout Session id, so browser and webhook reach it independently.
- `InitiateCheckout` — there is no shared identifier, so the browser **mints**
  the id (`newInitiateCheckoutEventId()`), fires its copy with it, and passes it
  to `create-checkout` as `meta_event_id`. The route validates it
  (`isValidMetaEventId`) and skips the server copy on anything malformed —
  an unpaired id double-counts her, which is worse than under-reporting. It
  sends inside `after()`, so Meta never sits between her tap and the redirect.
- `ViewContent` — `viewContentEventId()`, from the Supabase user id, so **neither
  side has to tell the other anything.** That is what lets `/api/paywall-view`
  accept no request body, which is the whole reason it is safe to expose (see
  below). It also makes the id stable across tabs, so Meta's 48h dedup collapses
  a re-view onto the first one.

`Lead` is server-only and its id (`leadEventId()`, from the user id) exists just
so a retried save-quiz collapses to one Lead. It is sent server-side rather than
from the browser on purpose: the browser copy deduped in sessionStorage, i.e.
"once per tab", and ads send the same woman back repeatedly — so repeat clickers
inflated Lead, understated cost-per-lead, and taught delivery to buy more repeat
clickers. Keyed off the profile insert, one human is one Lead forever.

Since the funnel collects no email before Stripe, events match on `external_id`
(the Supabase user id) plus `_fbp`/`_fbc`/IP/UA — and, on all three funnel server
events (`Lead`, `ViewContent`, `InitiateCheckout`), her first name (`fn`) off the
quiz and country off `x-vercel-ip-country` (`Lead` 2026-08-19; the other two
2026-08-29 — they had been sitting a match tier below the events either side of
them, which is the wrong place for the last step before the money).
`InitiateCheckout` reads the name inside `after()`: that route is the critical
path to the card form, and a match parameter must never add latency to it. Two parameters Meta scores are deliberately
absent, and `lib/metaCapi.ts` says so at the call site so nobody "fixes" them:
**`db` is impossible** (Meta wants `YYYYMMDD`; the quiz asks for an age *band*,
and a bucket midpoint is a birthday that is wrong all year), and **`ge` is a
choice** — the quiz never asks, it is a single bit of match value, and trans and
non-binary people go through menopause too. If gender is ever wanted, ask for it
on the quiz and send the answer. That is also why `Lead` should
be read as "profile saved", not "contact captured". The server hashes the id;
the browser sends it raw via `identifyMetaUser()` and lets Meta hash it, called
the moment the account exists (the anonymous sign-in in `completeRegistration`,
and the `/paywall` gate) so the browser `ViewContent` / `InitiateCheckout` /
`Purchase` resolve to the same person as the server copies. Only events fired
*after* that call carry it — re-initialising the pixel is Meta's documented way
to attach advanced matching post-sign-in and does not re-fire `PageView`.

The CAPI sender in `lib/metaCapi.ts` **never throws** — a Meta outage must not
fail the Stripe webhook (Stripe would retry and send duplicate welcome emails),
nor show a woman "we couldn't save your results".

#### `ViewContent` and the paywall beacon (`POST /api/paywall-view`)

`ViewContent` is the only event that needed a request invented for it. The other
three server copies ride an HTTP call that was happening anyway — `save-quiz`,
`create-checkout`, the Stripe webhook — but reaching the paywall in the funnel is
`setPhase("paywall")` on a click handler and talks to no server. So it was
browser-only until 2026-08-19, and that had a specific cost: for an ad-blocked or
ITP-restricted visitor, `Lead`, `InitiateCheckout` and `Purchase` all still
arrived server-side and `ViewContent` alone vanished — the one step between
"finished the quiz" and "tapped pay" going dark for exactly the cohort CAPI
exists to recover. That makes the paywall→checkout rate biased, not just noisy.

**The route takes no request body, and that is load-bearing.** Every field is
derived server-side: the event name is a literal, the value is `PLAN_VALUE`, the
`event_id` comes from her user id, the match data comes off the request's own
cookies and headers. The only thing a caller may say is *which* paywall, checked
against a two-item allowlist. A beacon that accepted an event name, a value or an
`event_id` would be an open endpoint for writing arbitrary conversions into the
dataset — inflating a campaign is the cheap version, poisoning the optimization
signal we buy media against is the expensive one. Keep it that way: if a new
server event ever needs a beacon, give it its own route with its own literals
rather than adding parameters to this one.

Bearer callers are answered `{ ok: true, skipped: "mobile" }`, the same exclusion
`Lead` and `Purchase` already make.

**Counting.** `ViewContent` is one-per-woman, not one-per-mount, via three
stacked guards — a ref (this mount), `sessionStorage` (this tab), and Meta's 48h
`(event_name, event_id)` dedup (everywhere else). The ref alone was the whole
guard until 2026-08-19: `<PaywallView />` sits under `<AnimatePresence mode="wait"
key={phase}>`, so Back-and-forward through the relief screen remounted it, as did
returning from a cancelled Stripe checkout, and it was running ~3x the Lead
count. Adding a server copy to a number nobody could divide by anything would
have made it worse, so the counting was fixed in the same pass.

`PageView` remains browser-only and should stay that way — highest volume on the
site, not an optimization target, not in AEM, and a server copy buys nothing in
the auction.

There is one plan — $59 for an 8-week period, no free trial — so reported values
are money actually collected at checkout and Events Manager should reconcile
against Stripe. The single source of truth for the price, the plan id sent as
`plan`, and every displayed figure is `lib/pricing.ts`; never hardcode $59 in a
component. (The retired annual plan reported its full $79 against a $0 3-day
trial, which made reported ad revenue run ahead of collected revenue by the
trial-cancel rate. That gap is gone.)

Only new checkouts report `Purchase` — it fires from
`checkout.session.completed`, not from `invoice.payment_succeeded`, so Meta
optimizes for new customers instead of being handed a fresh conversion every 8
weeks for a subscriber it already won. The webhook prefers the real
`unit_amount` off the Stripe price over `PLAN_VALUE`, so a legacy plan or a
coupon-discounted first invoice still reports the amount actually charged.

`_fbp`/`_fbc` cookies plus the client IP, user-agent and referring URL are
captured in `app/api/stripe/create-checkout/route.ts` and stashed on the Checkout
Session metadata, because the webhook is server-to-server and cannot see them
(`metaContextFrom()` unpacks them again). That same route uses them directly for
its own `InitiateCheckout`.

**`_fbc` is reconstructed when the pixel is blocked.** `captureFbClickId()` (in
`lib/metaPixelClient.ts`, called from `MetaPixel` on every route) writes the
`_fbc` cookie itself from the landing URL's `fbclid`. fbevents.js normally does
this — but only if it loaded, and the cohort CAPI exists to recover is precisely
the one where it didn't; for those visitors both cookies were absent and every
server event fell back to IP+UA, Meta's weakest match tier, on the clicks we most
need attributed. `fbclid` is a real Meta-issued click id, so a reconstructed
`_fbc` is a genuine match. **Do not mint a `_fbp` the same way** — that one is
browser-generated, so a value we invent matches nothing Meta has ever seen. The
value is shape-validated before it reaches a cookie (a raw `;` in an ad URL would
otherwise let a crafted link write a second cookie on our own domain).

**Purchase is web-only.** `create-checkout` stamps `checkout_surface` on the
session, and the webhook skips the CAPI `Purchase` when it reads `"mobile"`. A
checkout begun in the Expo app is not a web ad conversion, and reporting it as
one inflates the campaign with sales no ad drove — the same feedback loop that
moved `Lead` server-side (`save-quiz` already excludes Bearer callers). So Meta's
Purchase count is deliberately ≤ Stripe's; reconcile the *web* ones only.

### Legal pages, and the rule that governs them

`app/terms/page.tsx` and `app/privacy/page.tsx` are **not prose, they are a set
of factual claims about this codebase**, and every one is checkable by anyone
who can read the repo. Edit them the way you would edit a route: verify the
claim before you write it.

Rewritten 2026-08-30 because the previous versions failed that test. They
described magic-link sign-in (it is a 6-digit OTP), claimed collection of
`physical_limits` (column dropped 2026-08-29), stated categorically that nothing
is ever billed through Apple or Google (`app/api/iap/` is live code and
`getAccountState` honors `provider === "apple" | "google"`), omitted
`safety_flags` / `hrt_status` / `menopause_type` / height / weight from the
privacy inventory entirely, had **no disclaimer of warranties at all**, and
omitted the Meta pixel while promising in bold that health data is never used
for advertising — which was false. Three rules came out of it:

- **Every figure comes from `lib/pricing.ts`.** Terms imports `PLAN_PRICE`,
  `PLAN_WEEKS`, `TRIAL_DAYS` and `RENEWAL_NOTICE_DAYS`. A Terms page
  stating a price Stripe does not charge is not a stale doc, it is a
  misrepresentation about money.
- **The guarantee is a contract.** Terms §12 must stay true to the card in
  `components/PaywallView.tsx`. Since 2026-09-04 both say the same thing: the
  "100% guarantee" *is* the free trial — cancel before the first charge, pay
  nothing. There is no adherence threshold, no claim process and no refund
  behind it; `PLAN_ADHERENCE_PCT` is gone and the only refund promise left is
  Terms §11 (7 days from the first charge, no reason required). The landing
  page (`LandingPricing`, `LandingFAQ`) carries the same framing.
  `MAX_BACKFILL_DAYS` in `POST /api/plan/complete` stays at 7 on the plan's own
  account — the next cycle is built from those rows.
- **A promise in the policy is a feature you have to build.** Privacy §6.4 says
  we honor Global Privacy Control, so `lib/privacySignals.ts` exists.

### Nothing about her health goes to an advertising platform

**No value derived from her symptoms, quiz answers, health profile, plan or logs
may be sent to Meta, in any parameter, on any event.** Match parameters (`fn`,
`country`, `external_id`, `_fbp`/`_fbc`) are identity, not health, and are fine;
`value`/`currency` is the one price every buyer pays and discloses nothing.

`Lead` carried `symptom_count` and `goal` until 2026-08-30. That is health data
about an identified person, sent to an ad platform, against a bold promise in our
own policy that we do not do it — the whole of the FTC's GoodRx, BetterHelp and
Cerebral actions, and Washington's My Health My Data Act attaches a **private
right of action** to it. They bought nothing: `custom_data` on a Lead is
reporting metadata, not an optimization signal, so delivery is identical without
them. `sendMetaLead` now sends no `custom_data` at all.

### Global Privacy Control (`lib/privacySignals.ts`)

GPC is a browser-level opt-out from sharing for cross-context behavioral
advertising. We share the identifiers in Privacy §6.1 with Meta, which puts us in
scope, and the policy says we honor it — so this is a compliance control, not a
courtesy. The California AG's first CCPA action (Sephora, $1.2M) was largely
about a policy that claimed to honor GPC while the pixels kept firing.

It arrives two ways and **both are wired**: `Sec-GPC: 1` on the request
(`hasGpcOptOut`) and `navigator.globalPrivacyControl` in the browser. All five
sites are gated — `save-quiz` (Lead), `paywall-view` (ViewContent),
`create-checkout` (InitiateCheckout), the Stripe webhook (Purchase), and
`MetaPixel` itself.

Two things that are easy to get wrong:

- **`MetaPixel` must not install the snippet**, rather than installing it and
  declining to call `fbq`. fbevents.js sets cookies and contacts Meta on load, so
  a loaded-but-unused pixel is still the sharing she opted out of. It reads the
  flag through `useSyncExternalStore` — an effect-plus-setState is a cascading
  render and a hydration mismatch.
- **The webhook cannot see her headers.** `create-checkout` reads the signal
  inside her own request and writes it onto the Checkout Session metadata
  (`GPC_METADATA_KEY`), exactly as it does for `_fbp`/`_fbc`. Skip that and the
  opt-out silently stops the three cheap events and lets `Purchase` — the one
  that matters — through.

Suppression is advertising only. Sign-in, billing and plan generation are
untouched; the opt-out must cost her nothing, which is itself a CPRA
non-discrimination requirement.

### Styling
Tailwind CSS v4. Utility function for merging classes:
```typescript
import { cn } from "@/lib/utils"; // clsx wrapper
className={cn("base-classes", condition && "conditional-class")}
```

Custom CSS variables for fonts: `--font-satoshi`, `--font-script`, `--font-poppins`, `--font-lora`.

---

## 5. IMPORTANT BOUNDARIES

### Never Modify
- `knowledge-base/` files directly to "fix" AI responses — instead update the content, then re-run `npm run ingest` to rebuild embeddings
- `node_modules/`, `.next/`
- The `documents` Supabase table manually — it is fully managed by `npm run ingest`

### Adding images
Everything in `public/` is served to users as-is, so an oversized file is paid
for on every page load. Before adding an image, shrink it (e.g. squoosh.app):
- **Format:** `.webp`, except `favicon.png` and `email-logo.png` — email clients
  can't be relied on to render WebP.
- **Size:** resize to ~2x the CSS box it renders into, not the size it was
  exported at. A quiz tile renders at ~224px, so 460px wide is plenty; the app
  screenshots in `screenshots/` render at 260px. Aim to keep each file under 50KB.
- There is no build step — what you put in `public/` is exactly what ships.
- **Put it in the right folder** — `public/` is organized by role, and a file
  dropped at the root is a file nobody finds again:

  | Folder | Holds |
  |---|---|
  | `badges/` | Third-party trust marks — app store, Google Play, Stripe, card logos |
  | `brand/` | MenoLisa's own marks (Lisa's avatar) |
  | `illustrations/` | Full-screen funnel art — start, results, offer, rewards, login |
  | `landing/` | Landing-page art |
  | `proof/` | Social proof — `before`/`after` photos and `testimonials/` |
  | `quiz/` | Tap tiles, one folder per question (`age/`, `symptoms/`, `hrt/`, …) |
  | `screenshots/` | Real app screenshots (1320x2868 masters) |

  `favicon.png` stays at the root because the browser convention expects it
  there. Two folders share filenames on purpose: `quiz/symptoms/` are 460x460
  tiles she taps, `proof/testimonials/` are 900x490 before/after strips — same
  symptom names, different assets.

### External Services
| Service | Purpose | Key files |
|---|---|---|
| Supabase | Database, Auth, Vector search | `lib/supabaseClient.ts`, `lib/supabaseAdmin.ts` |
| OpenAI | Embeddings (`text-embedding-3-large`) + Chat (`gpt-4o-mini`) | `app/api/langchain-rag/route.ts`, `scripts/ingest-documents.ts` |
| Stripe | Payments, subscriptions | `app/api/stripe/`, `app/checkout/` |
| Resend | Transactional email (welcome, charge confirmed, renewal notice, admin alerts) | `lib/resend.ts` |
| Vercel | Hosting + Cron jobs | `vercel.json` |

### Security-Sensitive Areas
- `app/api/stripe/webhook/route.ts` — **must** verify Stripe signature before processing; never remove signature verification
- `app/api/cron/` — routes check `CRON_SECRET` header; never remove this check
- `lib/supabaseAdmin.ts` — uses service role key (bypasses RLS); only call from server-side code
- `proxy.ts` — modifying the matcher or auth logic can expose protected routes
- **Never take a user id from a request body.** `/api/intake` and the
  now-deleted `/api/referral/apply` both did, while writing with the service
  role, which let anyone overwrite another woman's health profile or mint
  referral coupons. Derive it from `getAuthenticatedUser(req)`, always.
- **RLS policies must name their role.** A policy written without `TO
  service_role` applies to `public` — which includes `anon` and `authenticated`
  — and with `USING (true)` it hands the whole table to anyone holding the anon
  key, which ships in the browser bundle. Four such policies ("Service role can
  manage all trials/profiles/insights", "…read all documents") were exposing
  every user's profile and letting anyone set their own account to `paid`;
  dropped 2026-08-08. They were never needed: **service_role bypasses RLS
  entirely**, so a policy for it is always either redundant or a hole. After any
  policy change, verify from outside:
  ```bash
  curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/user_profiles?select=name&limit=1" \
       -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"   # must return []
  ```
- **`REVOKE ... FROM public, anon, authenticated` — all three.** Postgres grants
  EXECUTE on new functions to `PUBLIC` by default, *and* Supabase ships an
  `ALTER DEFAULT PRIVILEGES` on `public` that hands `anon`/`authenticated` their
  own direct grant at creation time. Revoking either side alone leaves the
  other, and the function stays callable with the anon key. Both halves of this
  have now been confirmed the hard way (2026-08-08 and 2026-08-10). Never assume
  the revoke worked — check it:
  ```sql
  select has_function_privilege('anon', 'public.fn(text)', 'EXECUTE'); -- must be false
  ```
- Never commit a credential as a code fallback (`process.env.X || "secret"`).
  A default in the repo is a published secret; fail closed instead.

### Constraints
- OpenAI embeddings dimension is **fixed at 1536** — changing this requires dropping and rebuilding the `documents` table
- Stripe webhook events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — new event types require new handlers
- Vercel Cron is only available on paid Vercel plans; cron endpoints must respond within 60 seconds

### Do Not Refactor Without Discussion
- `lib/rag/` — the entire RAG pipeline is carefully tuned with specific thresholds (semantic: 0.30/0.35, hybrid: 0.44-0.50, intent: 0.80); changing values affects AI response quality
- Auth flow in `app/api/auth/save-quiz/route.ts` — creates user profile + trial in one atomic call right after OTP verification; breaking this disrupts onboarding
- `proxy.ts` matcher config — must stay in sync with `PROTECTED_PREFIXES`

---

## 6. COMMON TASKS

### Adding a New API Endpoint

1. Create `app/api/<feature>/route.ts`
2. Follow the pattern: `getAuthenticatedUser` → `checkTrialExpired` (if needed) → validate → DB → response
3. Export named functions `GET`, `POST`, `PUT`, `DELETE`, `PATCH` as needed
4. If the endpoint is also used by the mobile app, no extra work needed — `getAuthenticatedUser` already handles Bearer tokens

### Adding a New Database Table

1. Create table via Supabase Dashboard SQL editor or create a migration script in `scripts/`
2. Enable Row Level Security (RLS) on the table
3. Add RLS policy: `auth.uid() = user_id` for user-owned data
4. **Grant Data API access** (required for new tables as of Oct 30, 2026 — without it, client-side queries via the anon key get a permission error):
   ```sql
   ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "own rows" ON public.new_table
     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.new_table TO authenticated;
   ```
   Grant to `authenticated` only — not `anon` — unless the table must be readable while logged out. The GRANT is the access gate; RLS is the row filter — you need both. Server-side access via `getSupabaseAdmin()` (service role) bypasses grants and is unaffected.
5. Access from API routes via `getSupabaseAdmin()` (bypasses RLS for server operations)
6. Access from client components via `supabase` from `lib/supabaseClient.ts` (respects RLS)
7. Document the table schema in this file's "Database Schema" section

### Adding a New Dashboard Page

1. Create `app/dashboard/<feature>/page.tsx`
2. Add `"use client"` if it uses React hooks or browser APIs
3. Add `export const dynamic = "force-dynamic"` if it fetches user-specific data
4. Create a custom hook in `hooks/use<Feature>.ts` for data fetching
5. Add navigation link in `components/ConditionalNavbar.tsx` or the dashboard layout

### Adding a New Frontend Component

1. Create in `components/<category>/<ComponentName>.tsx`
2. Use `cn()` from `@/lib/utils` for conditional Tailwind classes
3. Use Framer Motion directly for animations (there is no shared wrapper module)
4. Client-side data: use existing hooks from `hooks/` or create a new one

### Updating the AI Knowledge Base

1. Edit or add Markdown files in `knowledge-base/` with YAML frontmatter:
   ```yaml
   ---
   persona: menopause  # menopause | nutrition | exercise | empathy
   topic: "Topic Name"
   subtopic: "Specific Subtopic"
   keywords: [keyword1, keyword2]
   intent_patterns:
     - "exact phrase users might ask"
     - "another variation"
   follow_up_links:
     - persona: menopause
       topic: "Related Topic"
       subtopic: "Related Subtopic"
       label: "User-facing link text"
   ---
   # Content here
   ```
2. Run `npm run ingest` — this **clears all existing documents** and re-ingests everything
3. Test in the chat interface

### Writing a Database Migration Script

1. Create `scripts/<migration-name>.ts`
2. Load env vars at top: `import { config } from 'dotenv'; config({ path: '.env.local' });`
3. Use `createClient` from `@supabase/supabase-js` with the service role key
4. Run: `npx tsx scripts/<migration-name>.ts`

### Debugging Common Issues

**"Unauthorized" in API routes (status 401)**
- Web: Check Supabase session cookie is set (log in again)
- Mobile: Verify `Authorization: Bearer <token>` header is present and token is valid

**Lisa AI not finding KB answers**
- Check Supabase `documents` table has rows: `SELECT COUNT(*) FROM documents`
- Re-run `npm run ingest` if table is empty
- Check `OPENAI_API_KEY` is set (needed for embeddings at query time)
- Lower retrieval thresholds temporarily in `lib/rag/retrieval.ts` to debug

**Magic link not arriving**
- Check `RESEND_API_KEY` is set and valid
- Verify `NEXT_PUBLIC_SITE_URL` matches the domain in use (affects redirect URL in email)

**Stripe webhook not updating user status**

`stripe_webhook_events` is the fastest read: the idempotency insert is the
route's first DB write and it happens *after* signature verification, so an
empty table means nothing ever got past `constructEvent`. Then, in order:

- **The URL must be `https://www.menolisa.com/api/stripe/webhook`.** The apex
  307s to `www` and **Stripe does not follow redirects** — every delivery fails
  with nothing in our logs, because the request never reaches us.
- Probe the endpoint. `curl -X POST <url> -d '{}'` should return
  `400 {"error":"Missing stripe-signature"}`. A `500 Webhook not configured`
  means `STRIPE_WEBHOOK_SECRET` is unset; an HTML 401 means Vercel Deployment
  Protection is in front of it.
- Check `STRIPE_WEBHOOK_SECRET` matches that endpoint's secret. A **Sandbox** is
  not Test mode — it has its own endpoint list and its own `whsec_`. And a
  changed env var on Vercel **does not apply until you redeploy**.
- Confirm the endpoint is subscribed to `checkout.session.completed`. The
  `customer.subscription.*` events alone create the row but do **not** bind the
  email or generate the plan.
- The delivery attempt's HTTP status (Stripe → Developers → Webhooks →
  endpoint → Events → the event) distinguishes all of the above in one look.
- For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`,
  and put the `whsec_` it prints into `.env` — it is not the dashboard one.

To repair an account after a missed webhook, **resend the
`checkout.session.completed` event** from the Stripe dashboard rather than
patching rows: it runs the real fulfillment. Her hitting the success screen
again also works — that calls `sync-session`.

**Trial not starting after registration**
- Check `user_trials` table has a row for the user
- `/api/auth/save-quiz` creates the row right after the anonymous sign-in; if it failed, create manually via Supabase dashboard

**`/register` stuck on "Getting to know you better..." / "We couldn't save your results."**
- Anonymous sign-ins are disabled in Supabase → Authentication → Sign In / Providers. Nothing in the funnel works without it.
- Confirm with `curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'` — `422 anonymous_provider_disabled` means it's off.

**She paid but can't log into the app**
- The address she typed at Stripe is what her account holds. Check `auth.users` for it — a typo is the usual cause, and there is no self-serve fix.
- If the address already belonged to another account, the webhook merged the subscription onto that older account by design. Look there before creating anything.

**Magic link OTP code not arriving**
- Check Supabase Dashboard → Auth → Email Templates → Magic Link is enabled and template includes `{{ .Token }}`
- Supabase rate-limits OTP requests (1 per 60s per email); the OtpForm component shows a countdown

---

## 7. CURRENT STATUS

`git log` is the history. This section holds only what the code cannot tell you:
what is still open, what was tried and rejected, and a short record of the recent
passes. **Rules that bind new work belong in §4 and §5, not here** — if something
below reads like a rule, it is a pointer to one of those.

### Still open

**Exercise clips — content and platform, not code**
- All 77 clips now carry a one-year cache header (`npm run clips recache`), but
  the Supabase org is on the **Free plan**, so Smart CDN is off and the public
  endpoint returns `cache-control: no-cache` whatever the metadata says. It
  starts working on upgrade to Pro with nothing further to do.
- `Plyo09 - Supported Heel Drop.mp4` is an **orphan**: `I09` was deleted from
  the catalog on 2026-08-30, so the file has no row pointing at it and
  `npm run clips audit` names it. Deleting it from the bucket closes this and
  also retires the one clip that was over the bitrate budget (1792 kbps against
  1600). Nothing in the app reads it in the meantime.
- The library is ~25MB. It should be downloaded to the device once and played
  from `file://`, which also makes clips work in a gym with no signal. Mobile
  work — nothing about the API contract changes for it.
- `K01`/`K02` carry **no clip, by design and permanently** — "walk at a pace
  where you could talk but not sing" is a complete instruction. The app renders
  name + props with no player. Do not shoot them to make the library look
  uniform.

**Product calls nobody has made**
- Early plan weeks run at 75-92% of the session length she was sold. That is the
  progression ladder working, but the quiz label describes weeks 5-8, and nobody
  has decided whether that is the honest way to sell it.
- The results screen's "Harder than it hits most" card makes a comparative claim
  and then discloses, in its own footnote, that "typical" is a modelled profile
  rather than survey data. It is honest, and it is the one thread a sceptic can
  pull on the screen where belief is formed. The fix is either real benchmark
  data or dropping the vs-typical framing — both are claims decisions.
- The quiz asks nothing about injuries. That is a scope decision and it stands;
  `POWER_RAMP_WEEKS` and the in-app disclaimer are the mitigation. Turning "don't
  ask" into "screen her out" means a severity gate plus refusing her money.

**Inconsistencies worth closing**
- `public/illustrations/results.webp` is 83KB — over the 50KB guideline in §5 —
  and renders at `opacity-15` as a wash, so most of that weight is invisible.

**Migrations: none outstanding.** The referral leftovers went with the
2026-08-29 cleanup below.

**Events Manager housekeeping, not code**
- Archive the eight dark Custom Conversions (the seven funnel events plus
  `ChecklistDone`) and **do not reuse the names** — the historical data behind
  them means screens that no longer exist.
- Every row still reports "Integration: Multiple", including `PageView`, which
  has no server copy at all. Confirm from the browser, not from this file:
  Network, filter `facebook.com/tr`, and any `ev=Lead` request is not ours. If
  one still appears, the second source is outside this codebase — a partner
  integration or CAPI Gateway on the dataset, which is a Business Manager
  cleanup.

### Decided against — do not re-do these

| Don't | Why |
|---|---|
| Re-add custom Meta funnel events | AEM caps the domain at 8 prioritized events. A custom event ranked above `Purchase` costs real attributable conversions, and only the standard five can be spent against. Decide which slot it takes, and from whom, first. |
| Mint a `_fbp` cookie the way `_fbc` is reconstructed | `_fbc` is rebuilt from a real Meta-issued `fbclid`. `_fbp` is browser-generated, so a value we invent matches nothing Meta has ever seen. |
| Add a parameter to `POST /api/paywall-view` | It accepts no request body on purpose. A beacon that took an event name, a value or an `event_id` would be an open endpoint for writing arbitrary conversions into the dataset. A new server event gets its own route with its own literals. |
| Split the funnel back into two bands with two bases | The seam is what created the duplicate row (`Finished the quiz` *is* `calculating`, in women), made the curve appear to climb where the bands overlapped, and put paywall → card form — the number that splits a weak offer screen from a leaking checkout — on opposite sides of a line so it could not be computed. Over one window `calculating` is 54 visits and `user_profiles` 54 women: the units converge before the money rows begin. |
| Put a `Finished the quiz` row back on the curve | It is the `calculating` row counted a second way. One event, one row. |
| Add a `download` row beside `Paid` | Same event, and Stripe is the side that knows whether money moved. |
| Select a second Stripe Price when the paywall countdown expires | It would let a user's system clock decide whether she pays double. The displayed price may understate what she is charged and must never overstate it. |
| Bring back the paywall's "get my discount back" button | A timer that visibly resets teaches a 45-60 audience that the page is staged, and the doubt lands on the refund guarantee. The countdown is fine; the reset was the half that did the damage. |
| Put `seconds` back into `DEFAULT_WARMUP` / `DEFAULT_COOLDOWN` | They take the catalog's dose via `bookendFrom()`. A second copy of a number already in `DOSE` drifted the first time `DOSE` changed. |
| Bring back the 8-week adherence refund guarantee (or any outcome refund) | Removed 2026-09-04. The "100% guarantee" is the free trial: try it, cancel before the first charge, pay nothing. A refund promise needs a measurement, a claim process and a Terms section a regulator can check; the trial needs none of them. Terms §11's 7-day refund window is the only refund left. |
| Compare `offer_variant` with `=== OFFER_VARIANT_TRIAL` | The first day's sessions and rows carry `trial7_free`; the id is `trial_free` now. `isTrialOffer()` accepts both. |
| Teach `getAccountState()` about the trial | The free trial (2026-09-04) is stored as `paid` with `subscription_ends_at = trial_end`, so access needs no trial rule; `trial_ends_at` is read only by the cron, the status route and the account card, for copy. A `trialing` state would mean every gate re-deciding what a trial allows — and the 2026-08-08 phantom-trial bug came from exactly that kind of column. |
| Move Meta `Purchase` to the trial-end invoice (or rename it `StartTrial`) without a new ad set | The live ad set optimises on `Purchase` at checkout. Changing what that event means mid-flight resets learning. The trial-end charge is `Subscribe`; build a new ad set on it if you ever want to optimise on money. |
| Report `PLAN_VALUE` on a trial `Purchase` | $0 moved. $59 there inflates Meta's revenue by the trial-cancel rate and is a lie the moment anyone value-optimises or audits the account. `TRIAL_PURCHASE_VALUE`, and raise it only to a measured expected value. |
| Fire a second `Purchase` on the trial-end charge | Two conversions a week apart from one click. That charge is `Subscribe`. |
| Set `user_trials.first_paid_at` by hand | Same shape as `fulfilled_at`: a non-null value permanently suppresses the trial's `Purchase` and the "your plan has started" email. |
| Add an unauthenticated route that runs DDL | An unauthenticated route holding the service role key is a remote SQL console. The old one-time admin endpoints are gone; don't add another. |
| Set `user_trials.fulfilled_at` by hand | A non-null value permanently suppresses the welcome email and plan generation. |
| Delete `lib/rag/`, `knowledge-base/` or an API route because "the web page is gone" | That is the Expo app's backend. `/api/langchain-rag` *is* Lisa on the phone. |
| Install Meta's "parameter builder" SDK add-on | The `fbc` coverage prompt is already answered by `captureFbClickId()`. Coverage is capped by how much traffic arrives with an `fbclid` at all — a campaign volume question, not a code one. |
| Send a server-side `PageView` | Highest volume on the site, not an optimization target, not in AEM. It buys nothing in the auction. |
| Read revenue from `user_trials` instead of Stripe charges | The table is one row per person, overwritten on every renewal. It can say who is paying, never how many times or how much arrived last month — that history does not exist to read. |
| Divide ad spend by every charge to get cost per customer | Ads do not buy renewals. It flatters CAC and gets worse every cycle as the renewal base grows. Divide by *new* customers only. |
| Judge a campaign on CAC vs the first $59 alone | That is the strictest possible bar on an auto-renewing plan, and it will tell you to switch off campaigns that make money. Renewal rate and LTV are what make the verdict honest. |
| Put ad spend back in `localStorage` | One browser, one number, no history — so no windowed cost per sale, and an empty box the moment you open `/admin` on your phone. |
| Call `isoDay()` without the timezone offset | `toISOString()` renders the UTC date, so local midnight east of Greenwich files today's ad spend under yesterday. It shipped broken once already. |
| Put AI cost, MRR or the full client table back on `/admin` | None of them changed a decision, and together they buried the two figures that do. The `llm_usage` ledger behind the cost figure was deleted on 2026-09-04, so re-adding the tile now means rebuilding the instrumentation first — and it must cover `/api/langchain-rag`, which it never did. |
| Put `symptom_count` or `goal` back on the Meta `Lead` | Health data about an identified person, sent to an ad platform, against our own policy's bold promise. FTC brought GoodRx/BetterHelp/Cerebral on exactly this, and WA's MHMDA gives a private right of action. `custom_data` on a Lead is reporting metadata, not an optimization signal — it bought nothing. |
| Bypass `lib/privacySignals.ts` on any Meta call site | Privacy §6.4 states we honor GPC. A policy that claims it while pixels fire is the Sephora fine ($1.2M, first CCPA action). |
| Write a figure into `/terms` or `/privacy` by hand | Both import from `lib/pricing.ts`. A Terms page stating a price Stripe does not charge is a misrepresentation about money, not a stale doc. |
| Hardcode `$59` in a component | `lib/pricing.ts` is the single source for the price, the plan id sent as `plan`, and every displayed figure. |
| Put the refund back in the paywall headline | It spends the largest type on the page introducing the possibility of failure, at the moment belief is highest. Risk reversal answers a question she only has after she wants the thing. The guarantee card 400px below states it in full. |
| Shorten `PLAN_DISCOUNT_WINDOW_MINUTES` back to 10 | The paywall is ~2000px and is read by a woman in her fifties on a phone. Ten minutes expired mid-read, doubled the displayed price to `PLAN_ANCHOR_PRICE`, and did it to the careful reader — who is the buyer. It also fired on the return-from-Stripe path. An expired countdown converts at roughly nothing. |
| Move her symptoms back behind age, stage and menopause type | Every live creative is a symptom or mechanism argument and Ad 1 ends on "tap your symptom". Three categorising screens before the funnel mentions what she came for is a form, not the audit she was promised. |
| Store the relief check-in answer | A self-report taken thirty seconds after one breathing exercise is not a baseline. Its whole job is the sentence she reads next; writing it to `user_profiles` makes it look clinical. |
| Send anything from her symptoms, plan or check-in to Meta | Already covered above, and the check-in is the newest thing that looks harmless and isn't. |

### Recent work

**2026-09-04 (latest) — trial cut to 5 days, notice to 2, guarantee reframed.**
`TRIAL_DAYS` 7 → 5 and `RENEWAL_NOTICE_DAYS` 3 → 2 in `lib/pricing.ts`; every
surface derives from them, and "free trial" became "free trial" everywhere it
was printed (paywall, account card, three emails, the push alert, the download
screen, `/admin`). The 8-week adherence refund guarantee is gone: the paywall's
green card, Terms §12, the landing pricing block and FAQ now say the same
thing — *100% guarantee: try it free, cancel before the first charge, pay
nothing* — and the card renders only on the trial paywall (a returning
customer is charged today). `PLAN_ADHERENCE_PCT` deleted; Terms §11 (7-day
refund) kept and is now the only refund promise; `/admin`'s exposure figure
re-based onto that 7-day window (`refundExposure`). `OFFER_VARIANT_TRIAL` is
`trial_free`, read via `isTrialOffer()`. Not touched: the Expo app's own
"0-3 days before the charge" screen (`docs/mobile-app-changes.md`), which is
device-side and independent of the email.

**2026-09-04 — the free trial (shipped at 7 days).**
The paywall sells the first week free; Stripe saves the card at $0 and charges
$59 on day 7. Full contract in §4 "The free trial". Touched: `lib/pricing.ts`,
`create-checkout`, `sync-session`, `fulfillCheckout`, the webhook (`first_paid_at` claim,
day-7 receipt; Meta `Purchase` stays at checkout — see §4), `lib/resend.ts` (welcome,
trial-ending notice, trial-converted receipt), the renewal cron, `PaywallView`,
the funnel's download screen, `/paywall`, `/terms` §10.7, `/api/account/status`
+ the account card, `/admin`, and `scripts/sql/2026-09-04-free-trial.sql` (not
yet applied). Not done: Stripe's `consent_collection` (needs the dashboard
Terms URL first), and the returning-customer-on-a-fresh-account gap described
in §4. Read the trial → paid figure on `/admin` once the first cohort is
`TRIAL_DAYS + RENEWAL_GRACE_DAYS` days old; until then the panel says "not yet known".

**2026-09-04 (latest) — first campaign read, funnel screen fixes, `/admin` made
live, dead schema dropped.** The campaign's first 440 landing page views
produced 74 quiz finishers and 0 sales. The audit's most useful result is a
negative one: **checkout is not broken.** An anonymous session against
production returned a real `cs_live_` Checkout Session, HTTP 200 — so
`STRIPE_SECRET_KEY` and `STRIPE_PRICE_8WEEK` are live-mode and matched, and the
2026-09-02 open item is closed. (That probe created one live Checkout Session,
which inflates `/admin`'s checkout row by one for 30 days; Stripe sessions
cannot be deleted.)

- **The keyboard fix from 2026-09-03 worked.** Splitting `funnel_events` on the
  deploy time, `q8_name` → `calculating` went from a 23% loss to 9%. n=11 after,
  so it is directional, not settled — but it is the first confirmed win from the
  telemetry.
- **`q8_name` copy and the last-question label.** The header said "Almost there"
  for the final *two* questions; it now says "Last question" on the last one,
  which is both true and the most motivating thing available on the screen with
  the second-largest loss in the quiz. The sub-line stopped saying "personalize
  your experience" and now says what she gets and what she is not being asked
  for: *no email needed to see your results*. That is checkable — results,
  diagnosis, relief and the paywall all render before Stripe collects an address.
  **The name stays required** (`app/register/page.tsx:4392`): it carries the
  greetings, the reward boards and the Meta `fn` match parameter.
- **Tapping anywhere dismisses the keyboard** (`useDismissKeyboardOnTap`). iOS
  shows no "done" key over a plain text keyboard, so after typing there was no
  way to put it down. The blur is **skipped when the tap lands on a control**,
  and that exclusion is load-bearing: dismissing resizes the visual viewport,
  the `keyboardInset`-anchored CTA drops with it, and the `click` that would
  have followed lands on whatever slid under her finger. Blurring on a tap *at*
  the button is how you break the button.
- **`<SocialProofPolaroid />` takes a `rotateMs`.** The card always rotated; at
  `ROTATE_MS` (8s) on `reward_social_proof` — a screen she leaves in seconds —
  the second woman arrived after she was gone, so four members read as one
  photograph. The board passes 4500; the paywall keeps 8000, where she is
  scrolling a 2000px page and 8s is a read. Note the card is also deliberately
  still under `prefers-reduced-motion`.
- **`/admin` re-reads itself every 30 seconds** (`AUTO_REFRESH_MS`), skipping
  the tick while the tab is backgrounded — every tick is a Stripe charge walk,
  and a desk left open overnight must not spend a night of API calls. A silent
  failure keeps the numbers on screen rather than replacing them with a red
  line; only a dead session (401) surfaces. Figures tween via `useCountUp` so a
  self-updating panel never reads as a glitch, and a countdown bar under the
  masthead says when the figures were last true without a line of text. Colour
  went up (a three-stop page wash, stronger panel lift); text came down (the
  footer's three source sentences are now three labels). **The per-block source
  tags stayed** — which side of the house a figure came from is still the one
  way this screen can lie.
- **Dead schema.** `llm_usage` had been write-only since the 2026-09-03 cost-tile
  removal — 301 rows, $0.30 of history, last written 2026-08-29, and it never
  covered Lisa chat at all. `lib/llmUsage.ts`, `lib/llmCost.ts` and the `meter`
  plumbing through `buildPlan`/`buildNutritionWhy` are deleted;
  `buildPlan(p, adherence)` lost its unused `userId` parameter.
  `cleanup_old_notifications()` had no caller and no scheduler — **`pg_cron` is
  not installed on this project**, so it had never run. Migration:
  `scripts/sql/2026-09-04-drop-llm-usage.sql` (a JSON export of the 301 rows was
  taken first). Nothing else in the codebase is dead: no unimported module, and
  every remaining table has live readers and writers.
- **Supabase audit.** The load-bearing result: **`user_trials` carries a
  SELECT-only policy**, so no user can write their own `account_status` — nobody
  can self-grant `paid`. The anon key returns `[]` or `42501` from all fifteen
  tables, and every SECURITY DEFINER function is unreachable by `anon` and
  `authenticated`. The linter's "anonymous access" warnings on eleven tables are
  the anonymous funnel working as designed — those policies are
  `auth.uid() = user_id`, not `USING (true)`, which is the distinction the
  2026-08-08 incident was about. Three hardening items in
  `scripts/sql/2026-09-04-harden-grants-and-search-path.sql`: `match_documents`
  was executable by `anon` (no data — invoker rights, RLS still applied — but
  free vector-search compute for anyone with the browser key), `funnel_dropoff`
  had a mutable `search_path`, and `documents` / `stripe_webhook_events` still
  carried table grants their service-role-only peers do not.

**Still open.** Both migrations above are written but **not applied** — run them
in the Supabase SQL editor. And the free-tier ceiling that actually binds is
**egress, not storage**: 34.8MB of 500MB database and 74MB of 1GB storage is
nothing, but Smart CDN is off on Free, so every exercise clip re-downloads from
origin on every view. See "Still open" above for the clip caching item.

**2026-09-04 — the start screen deleted.** It was bypassed as the cold-start
phase on 2026-09-02 and kept only so `goBack` off question 1 had somewhere to
land; it is now gone from the code, along with `START_PILLARS` and
`public/illustrations/start.webp`. Three couplings moved with it: the `start`
member of `Phase` and its `funnel_events` ping (index 0 is now never sent), the
resume-ticket guard (`phase !== "quiz"` alone — it is the only cold-start phase
left), and the Back control, which no longer renders on `stepIndex === 0`
because there is nothing behind the entrance. **Terms and Privacy now exist only
under the question 1 card** — that is the funnel's whole legal surface, so do not
remove it. `start` stays in `INACTIVE_STEPS` in `/api/admin/stats` and out of
`STEP_LABELS`: nothing pings the key, but rows written before today are still
inside the 30-day window and it carries `step_index` 0, so leaving it in would
make it the entry row and the 100% base for every bar.

**2026-09-03 (latest) — the first telemetry read, one bad reading, and the
reorder it paid for.** `funnel_events` had a day of data. Three changes, and the
first one is the reason the other two are aimed correctly.

- **The drop-off figure was sitting on the wrong row, and it accused the wrong
  screen.** `pingFunnelStep` fires when a screen *renders*, so a woman missing
  from `q_body` left on the reward board **before** it — the loss belongs to the
  screen she was looking at, which is the row above the one where the count
  falls. It shipped the other way round and produced the wrong reading inside a
  day: the first analysis blamed the symptoms question for the age question's
  loss and the height/weight sliders for the reward board's, and both fixes would
  have been aimed one screen past the problem. `dropPct` is now `lostPct` /
  `lostCount` — what *this* row lost to the next — with the significance base
  moved to this row's own count, and `worstStep` skipping the last row rather
  than the first. The money band follows the same rule.
- **Symptoms is question 1, age is question 2.** With the figure on the right
  row, the largest single loss in the funnel is the opening screen: **156 visits
  entered, 103 reached the symptoms question — 53 women, a third of everything
  paid traffic bought, gone before one tap.** `/register` has cold-started on
  question 1 since 2026-09-02, so that screen *is* the ad's landing page, and
  every live creative ends on "tap your symptom" while the screen showed age
  brackets. Free downstream: age gates nothing before `reward_symptoms` at step
  7, and the rule that governs this order — every answer a reward board prints
  is collected before the board renders — still holds. The image warm-up is now
  index-driven (`STEPS[0]`) rather than naming `q1_age`; the funnel's opening
  screen has changed twice and a hardcoded key there warms the wrong tiles
  silently.
- **`funnel_dropoff` regrouped by screen rather than position**, because the
  reorder is exactly the case its old grouping could not survive. See §4.

**Still open:** the reorder is a hypothesis, not a result. Read the same curve
again once a comparable number of visits has come through the new order, and
expect the top two rows to look non-monotonic while the window still contains
both funnels.

**2026-09-02 — the first campaign audited; the funnel made measurable
and shortened.** ~300 outbound clicks, ~200 landing page views, 10 quiz
finishers, 0 checkouts. The first thing the audit established is what was *not*
wrong: `auth.users` anonymous accounts and `user_profiles` rows matched exactly,
every day (8/8, 1/1, 1/1), so `save-quiz` has a 100% success rate and the
`/admin` figure was correct — the Aug-31 row is excluded by
`ADMIN_CAMPAIGN_START`, which is the floor working as designed. Every CTA in the
post-quiz sequence is fixed-bottom with no scroll gate, and every
`sessionStorage` access in the funnel is inside try/catch, so there is no
white-screen path in the Instagram/Facebook webview. **The loss is real, and all
of it is inside the quiz.**

- **The funnel had no measurement**, which is why nothing above could be ranked.
  `POST /api/funnel-step` and `funnel_events` now exist — see the section above
  — and `/admin` reads them in a **"Which screen loses them"** block, via the
  `funnel_dropoff(since)` RPC. Collection without a reader is a table nobody
  looks at; the block is the point of the table. This is the change that makes
  the rest falsifiable: ship the others, then read the curve rather than
  re-guessing.
- **`/register` cold-starts on question 1.** The start screen was an interstitial
  whose only job was `setPhase("quiz")` — one tap, collecting nothing, on the
  screen that takes 100% of paid traffic. **The screen is kept, not deleted**:
  `goBack` off question 1 still lands there. Three couplings had to move with it,
  and each would have failed silently: the resume-ticket guard was
  `phase !== "start"` and would have disabled the whole Back-from-Stripe restore;
  `warmPhaseChunks` keyed on `phase === "quiz"` and would have pulled three
  chunks during landing hydration, against the ~297KB already fighting for the
  main thread (it takes `stepIndex` now and warms from step 1); and Terms and
  Privacy existed **only** on the start screen's bar, where they were put because
  it was the funnel's entrance — they are now under the question 1 card too.
- **Imperial units are the default** (`heightUnit: "ft"`, `weightUnit: "lb"`).
  The campaign is US-only and `q_body` — step 8 of 17, on a screen promising the
  plan is being sized to her — showed "165 cm" and "70 kg" behind small
  easy-to-miss toggles. Same body either way (5'5" = 165cm, 154lb = 70kg);
  `bodyMetrics` still normalizes to cm/kg, so nothing downstream moved. If the
  campaign ever runs outside the US, derive from `x-vercel-ip-country` rather
  than flipping it back.
- **`100vh` → `100dvh` on the start hero.** The shell is `h-dvh` and the hero's
  height budget was computed against the *large* viewport — 60-90px of overshoot
  on iOS Safari/Chrome and the in-app webview, i.e. the whole margin the 457px
  formula exists to protect, missed on exactly the browsers the ad audience
  arrives in. Any future height maths on that screen uses `dvh`.
- **The start screen was the only phase missing `env(safe-area-inset-bottom)`**,
  so ~34px of the offer card sat under the fixed CTA on notched iPhones. (Both
  of these now matter mainly on the back-navigation path, since that screen is no
  longer the entrance — they were still wrong.)
- **`QUIZ_LOADER_MS` 1700 → 600.** Four reward boards carry that meter over work
  that is synchronous — ~6.8s of the funnel spent watching a progress bar. The
  receipt is the animation, not its length. `CALCULATING_MS` stays at 6500: it
  has a real round trip behind it and is the one honest wait in the funnel.
- **The relief skip moved onto the intro.** The button already existed, but only
  while the timer was `running` — so to leave the screen she first had to start
  36 seconds of breathing, two screens before the price. It renders on the intro
  as well now, and `getReliefRewardCopy` grew a `"skipped"` case — the default
  copy told her she had "calmed your body in 36 seconds", which someone who
  skipped knows to be false, and a funnel caught inventing a result immediately
  before the price has spent the belief it needs.

**Still open, and it is the one thing the code cannot answer:** 0 checkouts is
statistically unremarkable on 10 paywall views, but it is also *indistinguishable
from* a broken checkout, because a failed `create-checkout` creates no Stripe
session at all. Confirm in Vercel that `STRIPE_SECRET_KEY` and
`STRIPE_PRICE_8WEEK` are the same mode and the price is active. Two minutes, and
it is the only hypothesis that explains the second number completely.


**2026-08-30 (latest) — `/admin` rebuilt to answer "should I spend more
tomorrow?"** The panel answered "did money arrive?", which is a bookkeeping
question, not the one a paid-acquisition subscription asks. Full contract in §4;
the four findings that drove it:

- **"Profit" was all-time revenue minus a hand-typed spend total** — no Stripe
  fees, no fixed costs, and two windows that only lined up by accident. Replaced
  by contribution over one stated window with every deduction named on screen.
- **Cost per sale divided by every charge, renewals included.** Ads do not buy
  renewals, so it flattered itself, and worse each cycle.
- **No renewal rate, therefore no LTV.** The panel could only test CAC against
  the first $59 — the strictest bar there is on an 8-week auto-renewing plan.
  Both now come out of the same charge walk that was already happening.
- **Nothing looked forward.** `subscription_ends_at` was already in the database;
  booked revenue for the next 30 days and cancels-at-risk are one pass over rows
  the endpoint already had.

Added: the verdict line, checkout abandonment as a real funnel step (Stripe
Checkout Sessions — the middle step that splits "the offer is weak" from "the
checkout is leaking"), fixed costs, and refund-guarantee exposure. Dropped: the
"Her plan" column, the refund/declined banners, and "collected today" as the
headline.

**Two bugs were only found by running it against live data**, not by the build,
and both are now rules in §4: `isoDay()` rendered the *UTC* date, so a user east
of Greenwich filed today's ad spend under yesterday; and the daily series
indexed backwards from midnight, dropping every charge taken today and shifting
yesterday's into today's slot. The series summing to `money.last30.net` exactly
is the check that catches the second one.

**Still open, and both are the operator's to do, not the code's:** the 3 `paid`
rows in `user_trials` are test checkouts and will sit in the funnel until they
age out of the 30-day window (or are wiped with `delete-test-user.ts`), and
`ADMIN_FIXED_MONTHLY_USD` needs a real figure in Vercel or contribution ignores
the bills.

**2026-08-30 (last) — the funnel audited against the emotional ladder, before
the first campaign.** `docs/marketing/emotional-ladder.md` is the internal model;
this was the first pass that read the funnel *as* a climb rather than as a set of
screens. The finding was that the climb is right — guilt reframe on the start
screen, the quiz click as the Courage step, results at Acceptance, the plan
screen at Reason — and that it **never comes back down**. The two screens before
the card were a breathing exercise that lowers her arousal and a headline leading
with a refund clause, i.e. the close was being made from a resting heart rate.
Six changes, each named in the "Decided against" table above where it carries a
rule:

- **The relief exercise now collects her own verdict.** A `checkin` stage sits
  between the last exhale and the toolkit reward: *"Notice a difference?"* →
  Calmer / A little / Not yet, and the reward line answers whatever she tapped
  (`getReliefRewardCopy`). This is the one moment in the funnel where the product
  works on her body before any money, and it was being spent telling her what had
  happened instead of letting her say it. Skipping the timer skips the question —
  she has nothing to have noticed. Nothing is stored.
- **The relief CTA closes the loop `<ToolkitStack />` opens** ("3 more tools
  waiting inside") instead of framing the paywall as a browse ("No card needed to
  look"). The tap-fear that line was written for is gone by then; what it was
  actually doing was walking her into the decision screen in the lowest-commitment
  state available.
- **Anger, the one rung the funnel never used**, is one sentence on the results
  card under the estrogen node: *"Nobody sat you down and explained this. That
  part isn't on you."* It names the silence, never a clinician — anger at a gap
  converts, anger at her GP is a liability — and it hands straight back to "this
  is biology and it responds", because a negative state without the exit in the
  same breath collapses into apathy.
- **Her symptoms moved to question 2**, behind the age tile only. Status and
  menopause type moved back two slots; safe because every answer a reward board
  prints is still collected before the board renders (`COHORT_PHRASE`,
  `STAGE_PRIDE_LINE`). *(Superseded 2026-09-03: symptoms are question **1**. The
  telemetry priced the age tile in front of them at a third of all paid traffic.)*
- **The paywall headline is the outcome and a date**, the refund lives in its own
  green card, and the price is anchored against one hour of personal training —
  a comparison she can check, unlike a "regular price" set at exactly 2x. A
  personal trainer and not a consultation: framing the price against medical care
  implies a substitution `/terms` disclaims.
- **A "what happens next" strip closes the paywall scroll** (checkout → download
  → Day 1 waiting). The last unanswered objection there is mechanical, not
  financial: she is paying on a web page for something that lives in an app she
  has not downloaded.

**Not done, and both are business calls rather than copy:** `PLAN_ADHERENCE_PCT`
is still 90 — see "Product calls nobody has made" above, where the argument that
it costs more in belief than it saves in refunds now has a second voice — and the
paywall's "4.9 · 12,800+ women" needs to be something the launch can substantiate.
It sits directly above the guarantee, which is the worst place on the page to
have a claim a buyer can pull on.

**Still unmeasured, and the same caveat as the 2026-08-30 reward-board pass:**
there are no funnel step analytics, so every one of these is a judgment about
where the ladder breaks, not a fix for an observed drop-off.

**2026-08-30 (later) — terms, privacy and the guarantee, rewritten against the
code.** Both legal pages were largely LLM-generated and described a product that
had drifted away from them; the full list of what was wrong, and the three rules
that now govern edits, are in §4 "Legal pages". Beyond the documents, four code
changes:

- **`Lead` stopped sending `symptom_count` and `goal` to Meta.** See §4 —
  this was the one with real exposure behind it.
- **Global Privacy Control is honored** across all five advertising call sites
  (`lib/privacySignals.ts`, §4). It was added because the rewritten policy says
  we do it; the alternative was to delete the sentence, and we are in scope for
  the obligation either way.
- **`POST /api/plan/complete` bounds its `date`.** It was client-supplied and
  unchecked, so all 56 days could be ticked in one afternoon of week eight and
  clear the 90% refund threshold with no sessions performed — the guarantee was
  trivially gameable. `MAX_BACKFILL_DAYS` is 7, which covers every honest offline
  case, with a day of headroom for users ahead of UTC. `date` is her local
  calendar day, `updated_at` is when we received it, and the guarantee reads
  both.
- **Terms and Privacy import from `lib/pricing.ts`** so the legal text cannot
  drift from what Stripe charges.

Guarantee changes worth knowing: the period is now defined (56 days from plan
availability, not "eight continuous weeks"), completions must be recorded
contemporaneously, it is scoped to the first period and to Stripe-billed
subscriptions, it is once per *person* rather than per account, and a chargeback
forfeits it. The outcome condition is unchanged and deliberately so — her own
assessment, no evidence, no justification.

Terms additions that were simply missing: a disclaimer of warranties, an
assumption-of-risk and release for the exercise plan (the quiz screens nothing
and the plan prescribes plyometrics and all-out sprints), a ROSCA-shaped
auto-renewal block, a chargeback clause, and an arbitration section with a 30-day
opt-out, class and jury waivers, and mass-arbitration batching. Governing law
moved Delaware → Wyoming to match the entity.

**2026-08-30 — the quiz's first payoff rebuilt; it was the only one that gave
her nothing.** `reward_symptoms` sat at step 7 of 17 — the screen where she
decides whether twelve questions are worth finishing — and listed her own
symptoms back in tap order with a prevalence bar each. Boards 2 and 3 hand her
an object she did not have (her week, her session 1); this one handed back her
homework. Worse, its only new information was a normalisation claim ("80% of
women like you have this"), which is the belief that has kept her doing nothing
for four years, and it was the third telling of the ad's own argument before
question 7. The tell was its own loader: the meter said "Ranking what to move
first…" over a board that showed no ranking.

It now **ranks, explains, and pays her**: `getTopBurdenSymptoms()` orders her
picks worst-first (the same function `scoreDrivers` uses, so this screen and the
results card can never disagree), one line of `SYMPTOM_MECHANISM` explains the
top one, and `SYMPTOM_FIRST_MOVE` — a new nine-row table in
`lib/quiz-results-helpers.ts` — gives her one specific free thing to do tonight
for that symptom. Prevalence survives as a grey footnote, the demotion board 3
already gave its pool count. `<SymptomLoadBoard />` is now
`<StartingPointBoard />`; the paper, tape and written-in stagger are unchanged.

Rules that came out of it and now bind:
- **A reward board has to hand her something she did not walk in with.** Written
  at the top of `components/funnel/RewardBoards.tsx` beside the existing rule
  that nothing on a board is invented.
- **The tonight-actions are never the breathing exercise.** That is
  `RELIEF_TOOL_NAME`, the thing she unlocks by doing it two phases later; handing
  out a breathing drill here spends that unlock early. The other three rules the
  table keeps (tonight/free/no equipment, no treatment claims, `why` earns the
  action) are at the table itself.
- **The board claims nothing about plan sequencing.** `relaxationForSymptom()`
  walks `top_problems` in tap order, so "START HERE" is scoped to the thing this
  screen actually delivers. Ranking by daily cost is a statement about the
  symptom (`SYMPTOM_IMPACT`), never a measurement of her.

Fixed in the same pass, and it was not board 1's bug: every reward payoff sat in
a scroll shell carrying `justify-center`, which centres a payoff taller than the
container **and clips both ends of it** — the top ends up above `scrollTop 0`,
where no scroll can reach it. On 375x557 (the small-phone in-app browser) the
social-proof payoff overflowed by 91px and lost its head and its foot. The shell
and the centring are now `REWARD_SCROLL_SHELL` / `REWARD_PAYOFF_CENTER` in
`app/register/page.tsx`: auto margins on the child centre while there is room and
collapse to nothing when there isn't. All four payoffs verified reachable at
375x557.

**Still unmeasured, and worth saying plainly:** the funnel has no step
analytics — the custom Meta events were removed on 2026-08-17 and re-adding them
is the wrong channel (see the table above). So this pass is a judgment about
where the first payoff was weak, not a fix for an observed drop-off. Knowing
which screen leaks needs a product-analytics tool, which is its own decision.

**2026-08-29 (last) — `/admin` rebuilt as a sales desk.** The panel was
answering questions nobody was asking on the morning the first campaign went
live. It is now five blocks — money collected, is the campaign paying for
itself, quiz → paid, latest sales, needs a human — and the details that earned
their place are in §4. Three things worth knowing: the headline "today" figure
is cut on the operator's timezone, not UTC; ad spend is optional and stamped
with its age, so the panel is fully useful with the field never filled in; and
the empty state is written for the state it will spend the first week in —
"nothing is broken, nobody has paid" — rather than a wall of $0.00 that reads
like a failed deploy.

**2026-08-29 (later) — pre-campaign audit and schema cleanup.** A read-only pass
over both apps plus the live project, then three changes.
- **Dead schema dropped**
  (`scripts/sql/2026-08-29-drop-dead-schema.sql`, applied): the `referrals` and
  `user_insights` tables, `user_profiles.referral_code`,
  `user_trials.referral_discount_used_at`, fourteen `user_preferences` columns
  from the pre-plan tracker UI, and `update_daily_mood_updated_at()` (its table
  had been gone for months). `referral_reward` left the `notifications` type
  check. Eighteen tables to fifteen. Each one was grepped against both
  codebases first; the eight `user_preferences` columns that *are* read
  (`current_streak`, `longest_streak`, `last_log_date`, `total_logs`,
  `last_seen_insights`, `last_pattern_detected_at`, `notification_enabled`,
  `weekly_insights_enabled`) stayed, and the account-delete and
  delete-test-user lists lost their `user_insights` line in the same commit.
- **Lisa stopped contradicting the plan.** `exercisePersonaSpec.ts` taught
  "SIT: 20-30 sec all-out" and "Zone 2: 30-50 min, 3-4x/week"; the catalog
  prescribes 30 s all-out with two minutes of **complete** rest, and 15-35 min
  of Zone 2 five to seven times a week. Both protocols now carry the catalog's
  numbers plus modality, and `buildPersonaPrompt.ts` prints the new fields — so
  a woman who asks Lisa about her sprint day is told what her plan actually
  says.
- **`.env.example` caught up** with `RELAXATION_MEDIA_BASE`, `MOBILE_MIN_VERSION`
  and `MOBILE_LATEST_VERSION`. Only `NODE_ENV` and `VERCEL_URL` are now read
  without being documented, and both come from the platform.

Verified and left alone: `npm run verify-plan-dose`, `npm run clips audit` and
`npm run meditation audit` all pass; both apps typecheck and the web app builds;
every one of the 64 images the funnel references exists; all sensitive DB
functions are unreachable by `anon`; the anon key reads `[]` from every user
table; the Stripe webhook answers `400 Missing stripe-signature` on `www` (the
apex still 307s, as documented); and all three cron routes answer `401` without
`CRON_SECRET`.

**2026-08-29 — the 8-week plan, audited as output rather than read as code.**
Seven passes over `lib/plan/`, each measured across live and fallback
generations rather than reviewed in the source. `npm run verify-plan-dose` turns
all of it into build failures.
- **A session is patterns, not ids.** `PATTERN` maps all 42 prescribable ids to
  squat / lunge / hinge / push / pull / core / calf / carry / balance;
  `MAX_PER_PATTERN` is 2, enforced by `capPatterns()`, `nextDiversePick()` and
  `orderByPattern()` on **every** path that assembles a session. There were two
  fill loops and fixing only one measured as doing nothing. Week 1 used to come
  out as four squat variants — one exercise, as far as she is concerned, in the
  session she judges the whole $59 on.
- **Nothing maximal in weeks 1-2.** `POWER_RAMP_WEEKS` holds the power block to
  `I01`/`I07` (nothing leaves the ground) and `CARDIO_VOLUME.intervals`
  opens at `0` for medium and advanced. The funnel screens nothing, so this is
  the only brake there is. Costs two hard sessions out of fourteen.
- **Cardio is scheduled by code, on both paths**, as its own tasks rather than
  ids the model might place inside a strength session. `K02` is 5 min easy →
  30 s ALL-OUT → 2 min COMPLETE rest, 3-4 rounds → 5 min easy; the stored dose is
  the clock (`19 * 60`) and how many rounds fit is hers. Beginner 7x Zone 2
  daily; medium 7x → 5x + 2 SIIT from week 3; advanced 6x → 4x + 2 SIIT; snacks a
  flat 20-minute daily walk. **`CardioWeek.intervals` is a count, not a boolean.**
- **Movement snacks** are three one-move bursts a day, different every day.
  `PlanTask.days` carries seven lists per week (index 0 = the day the week
  starts), the `I` move first and a calm move last (`CALM_SNACK_IDS`), at most
  one per-side move per burst.
- **Every exercise carries a `why`** — a `WHY` record in `catalog.ts`, not a
  model call, so it lands on every plan already in the database with no migration
  and the deterministic fallback has it too.
- **The `joint_pain` filter, the `impact` grade and the limitations question are
  all gone.** Fitness level is the only filter on the pool.
  `user_profiles.physical_limits` was dropped.
- **`maxDuration` on every route that generates a plan** — see §3. This is the
  one that turns a purchase into a refund.
- **The safety disclaimer lives in the Expo app**, on the "Before you begin"
  consent gate (key bumped to `v3`), not on `GET /api/plan` — that route needs
  auth *and* a paid subscription, so it cannot answer on first launch, which is
  exactly when a safety notice has to be read. The app's two inline disclaimers
  are deleted; permanent furniture on a daily screen is the fastest way to make a
  safety notice invisible. `/terms` keeps the legal version.

**2026-08-28 — the plan stopped throwing itself away.** Measured across five live
generations, two of five customers were getting the deterministic "Session 1 …
Session 8" plan they did not pay for — both beginner, which is the modal
customer. Every cause was the same shape: a repairable detail rejecting something
far larger than itself (a week numbered `0`, an empty task title, a week with two
tasks). Weeks and tasks are parsed one at a time and repaired now, never
discarded wholesale. Sessions are also fitted to the minutes she was sold
(`fitSessionToMinutes()`), and `BOOKEND_MINUTES` is derived from the two bookend
lists rather than asserted at a number six minutes off the real cost.

**2026-08-27 — the exercise catalog rebuilt against a new bucket.** A re-shoot
replaced the library wholesale: 73 new clips, and every old id reused for
something else. **Filenames are no longer derived from ids** — each row carries
the clip's exact bucket filename in a `clip` field, because the shoot did not
name its files after our ids and every clip would otherwise have resolved to a
404 in her player, invisible from the dashboard and invisible in a build.
Prefixes: `L` lower, `I` plyometric / force absorption, `U` upper, `C` + `P`
core and posterior, `W` warm-up, `S` stretch.

**2026-08-26 — clips got a spec gate.** `scripts/exercise-clips.ts`
(`npm run clips`) parses the MP4 boxes directly — no ffprobe — and `upload`
refuses a file that fails, so a bad export is caught on the machine that made it
instead of mid-session on hers. The budget is a **bitrate (≤1600 kbps)**, not a
byte count. **Upload through the script, never the dashboard**: the dashboard
stamps `cacheControl: max-age=3600`, the script sets a year.

**2026-08-24 — the funnel's scroll animation opens when she reaches it.** Act 1
of `<PlanStage />` was drawing itself below the fold, so she arrived on a still
with the ink already dry. Blocks 2, 5 and the trust strip moved to `whileInView`
in the same pass.

**2026-08-17 → 08-20 — Meta pixel and Conversions API, hardened for the first
campaign.** Cut to five standard events; §4 holds the full contract. The fixes
that still bind:
- `Purchase` identifies off `getSession()` before firing. Meta keeps whichever
  copy of a matched pair arrives **first**, and the browser copy fires on landing
  while the CAPI copy waits on the webhook — so the surviving `Purchase` was
  routinely the weaker one.
- `Purchase` sends `fn`/`ln`/`ph`/`ct`/`st`/`zp`/`country` off
  `session.customer_details`. Any field that normalizes to nothing is dropped,
  never sent as the hash of the empty string.
- `MetaPixel` is gated on `NODE_ENV === "production"`. Every `npm run dev`
  session used to fire real events, including a real $59 `Purchase` from a
  test-mode checkout.
- `identifyMetaUser()` re-asserts `autoConfig: false` before its second `init`,
  so Automatic Event Detection cannot come back on mid-funnel.
- `checkout.session.completed` never skips itself as stale — Stripe guarantees no
  delivery order — it suppresses only the watermark write.
- `ViewContent` is one-per-woman via three stacked guards: a mount ref,
  `sessionStorage` per tab, and Meta's 48h `(event_name, event_id)` dedup.
- A blank `NEXT_PUBLIC_META_PIXEL_ID` no longer half-configures the pixel; `??`
  accepted the empty string and every event was silently discarded.

**2026-08-17 — the funnel has one entrance.** `/register` always starts at
question 1 and `?phase=paywall` is gone. A woman landing cold on it could sign in
anonymously, buy on a blank account, and get the generic plan — $59 for
personalisation she never received, with nothing to tell her before the charge.
Two URLs, one job each: `/register` is the funnel (it accepts only
`?phase=download`, Stripe's success URL), `/paywall` is the price screen for
someone who already has an account. Stripe's cancel URL and `proxy.ts`'s payment
gate both point at `/paywall`.

**2026-08-17 — results and paywall rebuilt.** Colour was given one job — ink =
fact, rose = the load she carries now, green = the gap and what closes it, **pink
= the CTA and nothing else**. The score moved onto the envelope letter so one
number is revealed once; `<PlanFinishBoard />` replaced the two-date finish line;
the nutrition checklist was cut out of the `relief` phase; the price-hold
countdown came back **without** its reset button. The paywall's pricing rules
live in the block comment at the bottom of `components/PaywallView.tsx` — read it
before touching the countdown.

**2026-08-14 — web product surfaces deleted.** Lisa chat, the notification centre
and the symptom tracker are deleted from the web app, not flagged off, and there
is no switch to bring them back. See §4 "Web app vs mobile app" for the full
gone/stayed split — every API route stayed, because that is the Expo app's
backend.

**2026-08-12 — email sequences deleted; quiz v2; funnel measurement unblocked.**
The whole email sequence system is gone; only the renewal notice survives, as
`/api/cron/renewal-notices`, deduped by `user_trials.renewal_notice_sent_for` —
it is about her money rather than her attention, and it is the cheapest
chargeback insurance in the product. Separately,
`user_trials_account_status_check` still listed the pre-2026-08-08 trial states
and rejected `'pending_payment'`, so **every web signup's `user_trials` insert
failed** while save-quiz only `console.error`'d it; the constraint was narrowed
and 7 orphaned finishers backfilled. The quiz became 12 questions in a new order;
`q6_how_long` and `q7_qualifier` were dropped from the web funnel but their
columns stay, because the Expo app still asks them.

**2026-08-11 — admin panel rebuilt on real numbers.** Revenue from Stripe
charges, conversion from Supabase on both sides, cost per plan from `llm_usage`
(that last one is gone — see 2026-09-04).
See §4.

**2026-08-10 — the funnel stopped asking for an email; checkout fulfillment made
webhook-independent; referral system removed.** See §4 "Anonymous accounts" and
"Checkout fulfillment" — both are load-bearing and neither is safe to reason
about from the code alone.

**2026-08-08 — RLS bypass fixed, trial removed entirely, access gate fails
closed, env consolidated.** Four `FOR ALL / USING (true)` policies with no `TO`
clause were exposing every table to the anon key. `checkTrialExpired()` used to
allow access on a missing row or a query error. See §4 and §5.

Active areas of the codebase:
- Access control (`lib/getAccountState.ts`, `lib/checkTrialStatus.ts`, `proxy.ts`)
- Stripe billing (`app/api/stripe/`, `lib/pricing.ts`, `lib/subscriptionWrite.ts`)
- Transactional email (`lib/resend.ts`)
- The `/register` funnel (`app/register/page.tsx`, `lib/metaPixel.ts`)

See `docs/mobile-app-changes.md` for the API contract changes the Expo app must
follow — §17-§23 cover the power block, the cardio interval counts, the movement
snack `days` array, the habit pillar, the per-exercise `why`, and the consent
gate.
