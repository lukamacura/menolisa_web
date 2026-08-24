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
| @supabase/auth-helpers-nextjs | ^0.10.0 |
| langchain | ^0.3.36 |
| @langchain/openai | ^0.3.17 |
| @langchain/community | ^0.3.0 |
| stripe | ^20.3.1 |
| resend | ^4.0.0 |
| framer-motion | ^12.23.24 |
| zod | ^3.25.76 |
| recharts | ^2.15.4 |
| react-markdown | ^9.x |

### Architecture
**Monolithic Next.js App Router** application. The same codebase serves:
- Web frontend (React, Tailwind, Framer Motion)
- REST API for the companion Expo mobile app (Bearer token auth)
- Scheduled cron jobs (Vercel Cron)

### Key Design Decisions
- **Passwordless auth only** — 6-digit email OTP via Supabase (`signInWithOtp` + `verifyOtp`). No passwords, no magic links. Shared `<OtpForm />` (`components/auth/OtpForm.tsx`) is the only auth UI, and `/login` is now its only caller.
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
│   │   ├── daily-mood/      # Mood tracking (1-4 scale)
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
| `/api/cron/daily-reminders` | 9am UTC daily | Push notification to users who haven't logged today |
| `/api/cron/weekly-insights` | 12am UTC Monday | Generate weekly insight summaries |
| `/api/cron/renewal-notices` | 11am UTC daily | Warn paying subscribers `RENEWAL_NOTICE_DAYS` before the next charge |
| `/api/cron/purge-anon-accounts` | 3am UTC daily | Delete emailless, unpaid anonymous accounts older than 7 days |

These four are the whole list — keep it in sync with `vercel.json`.

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
emailless, unpaid anonymous accounts older than 7 days. Public tables have no FK
to `auth.users`, so nothing cascades — the SQL function clears all 15 `user_id`
tables explicitly. Add a table with a `user_id`, add it there too.

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
| `daily_mood` | `user_id`, `date`, `mood` (1-4); unique on `(user_id, date)` |
| `user_profiles` | `user_id`, `name`, `top_problems[]`, `severity`, `timing`, `goal`, `doctor_status` |
| `user_trials` | `user_id`, `account_status` ("pending_payment"/"paid"/"expired"), `subscription_ends_at`, `subscription_canceled`, `payment_failed_at`, `dispute_flagged_at`, `provider`, `plan_type`, `plan_amount`, `fulfilled_at` (one-time-side-effect claim — see "Checkout fulfillment"), `renewal_notice_sent_for` (the `subscription_ends_at` the renewal email already covered). No trial columns — see below. The table name is legacy; it holds subscriptions. |
| `documents` | Vector store — `id`, `content`, `metadata` (JSONB), `embedding` (vector 1536) |
| `notifications` | `user_id`, `type`, `content`, `metadata` (JSONB), `is_read`, `created_at` |
| `llm_usage` | One row per OpenAI call — `user_id`, `run_id`, `kind`, `model`, `prompt_tokens`, `cached_prompt_tokens`, `completion_tokens`, `cost_usd`, `duration_ms`. Service-role only: RLS on, no policies, no grants. |

### Admin panel (`/admin`)

Password-gated by `ADMIN_PANEL_PASSWORD` (unset = closed, deliberately). One
endpoint, `POST /api/admin/stats`, assembles three sources:

- **Revenue comes from Stripe charges, never from `user_trials`.** The table
  holds one row per person, overwritten on every renewal, so it can say who is
  paying but not how many times or how much came in last month. The charge list
  is the ledger; a customer's first successful charge is a new sale and the rest
  are renewals, which is why no second API call is needed to split them. The
  panel prints `livemode` loudly — test-mode figures look exactly like revenue.
- **Conversion is Supabase-only on both sides** (accounts that ever paid ÷ quiz
  finishers). Dividing Stripe purchases by quiz finishers mixes populations —
  renewals and mobile IAP are in one and not the other — and reads over 100%.
- **Cost per plan comes from `llm_usage`.** Generating an 8-week plan is two
  gpt-4o-mini calls sharing a `run_id`, so cost-per-generation is a sum grouped
  by that id, not an average over rows. Rates live in `lib/llmCost.ts` and are
  applied at write time, so historical spend isn't rewritten when OpenAI changes
  a price; an unlisted model stores `null`, never `0`, and the panel counts
  those unpriced calls out loud. Roughly $0.0017 a plan at current prompt sizes.

The endpoint reads `auth.users` for emails via `listUsers` (PostgREST can't see
that schema and there is no bulk get-by-ids), and caps its Stripe walk, client
list and usage read — each cap surfaces in the response rather than silently
truncating. Migration: `scripts/sql/2026-08-11-llm-usage.sql`.

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

**Five events, all standard. There are no custom events.** Adding one is a
decision about the AEM budget, not a small change — read the whole section
first.

| Event | Browser | CAPI | Fires from | Value |
|---|---|---|---|---|
| `PageView` | yes | — | `components/MetaPixel.tsx` (in `app/layout.tsx`); re-fires on App Router route changes | — |
| `Lead` | — | yes | `sendMetaLead()` from `/api/auth/save-quiz`, **only on `user_profiles` insert** and only for cookie (web) callers | — |
| `ViewContent` | yes | yes | Browser: `components/PaywallView.tsx` on mount. Server: `sendMetaViewContent()` from `POST /api/paywall-view`, the beacon that mount fires | $59 |
| `InitiateCheckout` | yes | yes | Browser: `PaywallView` CTA click. Server: `sendMetaInitiateCheckout()` from `/api/stripe/create-checkout` once the session exists | $59 |
| `Purchase` | yes | yes | Browser: `components/MetaPurchaseTracker.tsx` on the success landing. Server: `sendMetaPurchase()` from the Stripe webhook | $59 |

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
(the Supabase user id) plus `_fbp`/`_fbc`/IP/UA — and, on `Lead`, her first name
(`fn`) and country (2026-08-19). Two parameters Meta scores are deliberately
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
3. Use `createClient` from `@supabase/supabase-js` with service role key, or `pg` client for raw SQL
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

Recent work:
- **The scroll opens when she gets to it (2026-08-24)** — her name being written
  onto the parchment is the made-for-you moment of the funnel, and it was
  playing to an empty room. `<PlanStage />` mounts with the plan block at the
  top of the `diagnosis` screen, but the scroll itself lands roughly a viewport
  lower; the act *clock* was gated on `useInView` while the act *contents* were
  not, so act 1 drew itself below the fold and she scrolled onto a still with
  the ink already dry.
  The scroll now starts rolled shut and unrolls on arrival. One motion value
  drives two layers off the same number — the bottom roll travels down from just
  under the top roll, and the paper is clipped to exactly the roll's top edge
  the whole way, so no un-unrolled paper is ever visible. Nothing is written
  until that finishes, which is what puts the name on an open scroll. Once per
  mount: scrolling away never re-seals it, and flicking past *during* the unroll
  pauses the paper where it is rather than letting it finish unseen.
  The unroll uses `[0.4, 0, 0.2, 1]`, not the `[0.16, 1, 0.3, 1]` the rest of
  the file uses — that one is front-loaded, which is right for UI that should
  feel instant and wrong for paper; it spent 80% of the travel in the first
  third and read as snapping open.
  **Blocks 2, 5 and the trust strip moved to `whileInView` in the same pass.**
  Everything below block 1 on that screen starts a clear viewport below the
  fold, and only blocks 3 and 4 were scroll-triggered — the other three animated
  on mount and were finished before she arrived, so the page went from arriving
  to already-arrived halfway down. The cards inside block 2's carousel keep
  their own mount stagger deliberately: per-card `whileInView` would leave the
  horizontally off-screen cards invisible, including the sliver that is the only
  thing saying it *is* a carousel.
- **Purchase reports what Stripe already knew (2026-08-20)** — three fixes to
  the event the campaign is actually optimized against, prompted by Events
  Manager's "send more parameters" prompt.
  - **The browser `Purchase` was firing with no `external_id`.**
    `identifyMetaUser()` runs in `completeRegistration()` and in the resume
    restore, and neither survives the trip to Stripe: `?phase=download` is a
    cold page load, so the pixel there had never been told who she was. The
    reason that mattered more than a missing parameter usually does is Meta's
    dedup rule — of a matched pair it keeps **the copy that arrives first**, and
    the browser copy fires on landing while the CAPI copy waits on the webhook.
    The surviving `Purchase` was therefore routinely the weaker one, and the
    richer server copy was the one being discarded. `MetaPurchaseTracker` now
    identifies off `getSession()` (local read, no round trip) before firing, and
    falls through to an unidentified fire on any error — an under-matched
    Purchase still beats a missing one.
  - **`Purchase` now sends `fn`/`ln`/`ph`/`ct`/`st`/`zp`/`country`** off
    `session.customer_details` via `metaPersonFrom()`. Stripe collects all of it
    on its own page and the event was sending `em` + `external_id` and nothing
    else a person is findable by — the *only* event in the funnel with real
    identity attached, carrying the least of it. Normalization mirrors Meta's
    SDK (`normalizePhone` drops anything under 8 digits rather than send a
    country-code-less number; `splitName` sends `fn` alone for a single-token
    name rather than invent an `ln`); any field that normalizes to nothing is
    dropped, never sent as the hash of the empty string.
  - **Localhost no longer reports into the live dataset.** `META_PIXEL_ID` falls
    back to a hard-coded literal and the env var is unset in `.env.local`, so
    every `npm run dev` session fired real events into production — and a Stripe
    *test-mode* checkout landing on `?phase=download` fired a real $59
    `Purchase`. Browser events need no access token, which is what made it easy
    to miss; and since `META_CAPI_ACCESS_TOKEN` is also unset locally those dev
    events arrived unpaired, which is indistinguishable from a dedup fault at
    Meta's end. `MetaPixel` is gated on `NODE_ENV === "production"` — enough on
    its own, because `trackFb`/`identifyMetaUser` both go through
    `window.fbq?.()` and no-op with no snippet installed. `VERCEL_ENV` was
    deliberately not used: preview deployments still report, so a branch can be
    tested end to end.
  **Events Manager housekeeping, not code:** the "connect to chat activity"
  prompt is for click-to-Messenger ads and does not apply. The two `fbc`
  coverage prompts (including the "parameter builder" SDK add-on) are already
  answered by `captureFbClickId()` — coverage is structurally capped by the
  share of traffic that arrives with an `fbclid` at all, which is a campaign
  volume question, not a code one. Do not install the add-on to satisfy a card.
- **Back from Stripe no longer restarts the quiz (2026-08-20)** — tapping the
  paywall CTA leaves for `checkout.stripe.com`, and a Back that misses bfcache
  reloads `/register` with her React state gone, i.e. question 1 and a
  twelve-question quiz she finished ninety seconds ago. `handleStartCheckout`
  now stamps a **resume ticket** in `sessionStorage`
  (`menolisa:funnel-resume` — her raw answers plus the user id it just
  verified) as its last act before `window.location.href`, and a load that
  finds a fresh one restores the answers and reopens the paywall.
  It does not reintroduce the cold-paywall bug that killed `?phase=paywall`:
  the only writer runs downstream of `completeRegistration()`, so a restored
  paywall always sits on an account whose `user_profiles` row is saved and can
  never check out blank into the generic plan. The ticket **expires after an
  hour**, is **per-tab**, and is cleared on the download screen and on
  `restartQuiz()` — so a later ad click still lands on the start screen, which
  is where a paid click belongs.
  The restore is a *layout* effect (`useIsomorphicLayoutEffect`) and suppresses
  the phase cross-fade for that one swap: `/register` is server-rendered, so
  the start screen is in the HTML, and fading it out over 0.22s in front of her
  is the same "your quiz is gone" beat with better manners.
  Stripe's own back arrow is unchanged — `cancel_url` still points at
  `/paywall`, which needs no ticket and was never the broken path.
- **`autoConfig: false` re-asserted on the second `init` (2026-08-19)** — Events
  Manager raised "improve deduplication" on `Purchase` **and `Lead`**, and `Lead`
  is the tell: it is server-only, so there is no browser copy of ours to pair
  with, and a redundancy warning on it means a browser `Lead` exists that this
  codebase never fired.
  `identifyMetaUser()` is the only place that calls `fbq('init')` a second time
  (advanced matching, added 2026-08-18) and it did not re-assert the flag.
  `autoConfig: false` is applied per pixel at init, Meta does not document
  whether a re-init resets it, and if it does then Automatic Event Detection
  comes back on mid-funnel — the same machinery that once inferred `Subscribe`
  off the paywall CTA on every Framer Motion re-render. AED's phantoms carry no
  `event_id`, so they can never dedup against our copies, and the two it invents
  most readily are exactly the two that got flagged.
  The fix asserts `set` before `init`, matching the base snippet's order. It is a
  no-op if re-init preserves the flag, which is the point: the cost of asserting
  it twice is nothing and the cost of being wrong is a corrupted `Purchase`
  count. **Confirm from the browser, not from this file** — Network, filter
  `facebook.com/tr`, walk past results: any `ev=Lead` request is not ours. If one
  still appears after this ships, the second source is outside the codebase (a
  partner integration or CAPI Gateway on the dataset), which is a Business
  Manager cleanup and not a code change. That would also finally explain the
  unresolved "Integration: Multiple" on every row — including `PageView`, which
  has no server copy at all.
- **`ViewContent` got a server copy and an honest denominator (2026-08-19)** —
  the last browser-only funnel event is now dual-reported, closing the item left
  open on 2026-08-17. `Purchase` and `InitiateCheckout` were deliberately not
  touched.
  Two problems, and fixing only one would have made things worse. **The count
  was wrong**: `<PaywallView />` guarded its mount effect with a `useRef`, but it
  lives under `<AnimatePresence mode="wait" key={phase}>`, so Back into the
  relief screen and forward again remounted it — as did returning from a
  cancelled Stripe checkout — and it was reporting ~3x the Lead count, which made
  "reached the paywall ÷ anything" unreadable. **The coverage was biased**: for
  an ad-blocked or ITP visitor, `Lead` / `InitiateCheckout` / `Purchase` all
  still landed server-side while `ViewContent` alone disappeared, so the one step
  that went dark was the one in the middle.
  New `POST /api/paywall-view` (`sendMetaViewContent()`), fired by the same mount
  effect alongside the pixel — neither waits on the other, and `keepalive` keeps
  it alive through the navigation to Stripe. **It accepts no request body**: name,
  value and `event_id` are all derived server-side, the last from her user id via
  `viewContentEventId()`, which is also how both copies agree on an id without
  either telling the other. `?source=` is allowlisted to `register|dashboard`.
  That shape is the point — see §4 before adding a parameter to it.
  Counting is now three stacked guards (mount ref → `sessionStorage` per tab →
  Meta's 48h id dedup everywhere else), so it is one-per-woman like `Lead`.
  `userId` is threaded into `PaywallView` from both callers; absent, it degrades
  to the old undeduplicated browser-only fire rather than dropping the event.
  **`Lead` got its match data in the same pass.** It scored 4.4/10 against 6.1
  for every other event because `sendMetaLead` sent only `external_id` +
  `_fbp`/`_fbc`/IP/UA, while her first name sat three lines away in the same
  request going only to the database. It now sends `fn` (normalized Meta's way:
  NFKC, lowercase, letters and combining marks only, so `"  LINDA! "` and
  `"Linda"` hash alike and `"Renée"` keeps its accent) and `country` from
  Vercel's edge geo header. A name with no letters left in it sends **no** `fn`
  rather than the hash of the empty string — a parameter every junk entry shares
  matches nobody and dilutes the ones that work. `db` and `ge` were considered
  and rejected; the reasons are in `sendMetaLead`'s docstring and in §4.
  (`Purchase`'s missing `customer_details` was closed on 2026-08-20 — see the
  entry at the top of this list.)
- **Pixel/CAPI hardened for the first campaign (2026-08-18)** — an audit ahead of
  launch, five fixes, no new events (the AEM budget is unchanged at five).
  - **`_fbc` is reconstructed from `fbclid`** when fbevents.js never loads, which
    is the whole cohort CAPI exists for. Biggest match-quality win of the set;
    see §4 for why `_fbp` deliberately is *not* reconstructed.
  - **Browser events carry `external_id`** (`identifyMetaUser()`), so a browser
    `ViewContent` and the server `Lead` from the same woman stop looking like two
    strangers. Closes the open item from 2026-08-17.
  - **Mobile-app checkouts no longer report a web `Purchase`** — `checkout_surface`
    on the session metadata, read by the webhook. Makes `Purchase` consistent with
    `Lead`, which already excluded Bearer callers.
  - **`checkout.session.completed` no longer skips itself when it looks stale.**
    Stripe guarantees no delivery order, so a `customer.subscription.*` created a
    second later could land first, stamp the watermark past it, and cost the whole
    fulfillment *plus* the Purchase — `sync-session` recovers the former but
    deliberately never reports the latter. It now runs regardless and suppresses
    only the watermark write (`stampWatermark: !stale`), which is safe because
    nothing in that path is read off the event payload: the subscription is
    re-fetched from Stripe, `writeSubscription` refuses to clobber another
    provider, and `claimFulfillment` makes the one-time side effects idempotent.
  - **A blank `NEXT_PUBLIC_META_PIXEL_ID` no longer half-configures the pixel.**
    `??` accepts the empty string, so a Vercel var created and left blank meant
    `fbq('init','')` and a CAPI POST to `/v21.0//events` — every event silently
    discarded. Trimmed truthiness now falls through to the literal. Same trap as
    `customer_email: ""` in create-checkout.
  `event_source_url` was also added to the CAPI `Purchase` (the other two already
  had it). **Left alone deliberately:** the browser `InitiateCheckout` still fires
  on tap, before `create-checkout` can answer `409 already_subscribed`, so a
  retargeted existing customer reports an unpaired IC. Firing it after the
  response instead would mean firing into a `window.location` redirect, which
  loses the event outright for everyone — a rare over-count beats a systematic
  under-count on the signal delivery leans on.
- **The price hold got its clock back (2026-08-17)** — the static "your $59 rate
  is held while you finish" band is a live `PLAN_DISCOUNT_WINDOW_MINUTES` (10)
  countdown again, and at zero the paywall reverts to the anchor: grey border,
  "REGULAR PRICE" badge, `$2.11 / day`, "Billed $118 today", the trust box and
  **the CTA label** all following `livePrice` / `livePricePerDay`, and the
  headline's "50% off" dropped so the screen doesn't shout a discount next to a
  REGULAR PRICE badge.
  **Only the display moves.** There is one Stripe price, so `handleCheckoutClick`
  and `onCheckout` are byte-identical either side of zero: she is charged `$59`
  whether the clock ran out or not, and the intended experience is that a Stripe
  page reading $59 after a paywall reading $118 feels to her like the discount
  slipped through.
  Two properties make that arrangement defensible, and any change here has to
  keep both — the long-form version is the block comment at the bottom of
  `components/PaywallView.tsx`:
  - **The error is always in her favour.** Displayed >= charged, always. The
    page may understate what she pays and must never overstate it, and the
    `renews every 8 weeks` + `RENEWAL_NOTICE_DAYS` disclosure sits on both
    branches. Nobody is out of pocket by a cent; this is what separates it from
    the FTC's false-urgency cases, which are all overcharges.
  - **Nothing about the money is client-controlled.** The deadline is in
    `sessionStorage` and the clock is hers, so `expired` is trivially forgeable —
    fine precisely because it buys nothing. **Do not** "fix" the mismatch with a
    second Stripe Price selected on `expired`: that inverts the first property
    and lets a user's system clock decide whether she pays double. Real expiry
    pricing needs a server-side deadline.
  What did *not* come back is the reclaim button. The 2026-08-12 removal was
  about a timer that visibly resets on one tap, which is the tell that a page is
  theatre — and doubt on this screen lands on the refund guarantee. The deadline
  lives under `menolisa:paywall-discount-deadline`, so a reload does not hand her
  a fresh 10 minutes, and a stored value further out than the full window is
  discarded as tampered. Per-tab rather than `localStorage`: someone returning
  tomorrow gets a new window instead of a paywall that expired days ago.
  `useHydrated()` (a `useSyncExternalStore` flip) keeps the half-spent deadline
  out of hydration, and only the expiry is `aria-live`, never the per-second tick.
- **Pixel cut to five standard events for launch (2026-08-17)** — the seven
  custom funnel events (`QuizStart`, `QuizStep`, `QuizComplete`, `ResultsView`,
  `PlanView`, `PlanScrollDepth`, `ReliefDone`) and their machinery
  (`META_FUNNEL_STEPS`, `trackFunnelStep`, `trackQuizStep`, `trackScrollDepth`,
  the two scroll handlers on `/register`) are deleted. What remains is
  `PageView`, `Lead`, `ViewContent`, `InitiateCheckout`, `Purchase` — all
  standard, three of them dual-reported. The binding reason is the **8-event AEM
  cap**: at twelve events iOS reported only the top eight, so a custom event
  ranked above `Purchase` was costing attributable conversions. See §4 for the
  full argument and the Events Manager housekeeping (archive the eight dark
  Custom Conversions, don't reuse the names).
  `InitiateCheckout` gained a Conversions API copy
  (`sendMetaInitiateCheckout()`, fired from `create-checkout` inside `after()`),
  deduped against the browser on an id the paywall mints and passes as
  `meta_event_id`. It is the closest-to-revenue signal delivery can optimize
  against while `Purchase` volume is below learning-phase exit, and browser-only
  reporting was losing a large slice of it to ITP and ad blockers.
  `onCheckout` now takes that id, so both callers (`/register`, `/paywall`) pass
  it through.
  The missing browser-side `external_id` was closed on 2026-08-18, and
  `ViewContent`'s missing server copy on 2026-08-19 — see those entries.
- **The nutrition checklist is gone (2026-08-17)** — the `relief` phase is now
  breathing → reward → paywall. The five-row audit (`checklist`) and its verdict
  screen (`done`) are deleted from `app/register/page.tsx`, along with
  `NUTRITION_ITEMS` / `NUTRITION_TOTAL` / `NUTRITION_PLAN_TOTAL`,
  `getNutritionVerdict()`, `getReliefForwardCopy()`, the `nutritionDone` state
  and the `ChecklistDone` pixel step. It was two more screens and up to six more
  taps at the point of maximum intent — immediately after she taps "I'm ready to
  feel better" — and the funnel was long enough without them.
  Knock-ons kept deliberately: the toolkit is still four entries with
  **"Nutrition checklist" as locked tool #2** (it is a real feature of the app,
  and the stack is a preview, not a feature list) — the reward screen just ends
  at 1 of 4 instead of walking the bar to 2 of 4. `ToolkitStack` keeps its
  `unlockedCount` prop rather than hardcoding 1. The reward CTA now reads
  "View my {PLAN_WEEKS}-week plan" and carries `getCtaCopy()`'s no-charge
  reassurance, which used to live on the verdict CTA. Back leaves the phase from
  every stage now that nothing sits in front of the reward.
  `META_FUNNEL_STEPS.checklistDone` was removed but its name is documented in
  place in `lib/metaPixel.ts` — **archive the `ChecklistDone` Custom Conversion
  in Events Manager and don't reuse the name**, the historical data behind it
  means the old step. `ReliefDone` is now the last event before `ViewContent`.
- **Paywall: the finish line became an instrument (2026-08-17)** —
  `PlanFinishLine` (two dates and an arrow, inline in `PaywallView`) is now
  `<PlanFinishBoard />` (`components/PlanFinishBoard.tsx`): a taped-down paper
  chart with a needle that travels the eight weeks, colouring the track rose →
  amber → green behind it, lighting three pins (wk 2 / 4 / 8) as it passes and
  swapping the caption to whatever it is standing on. It sits directly above the
  price, and a price is only compared against something you can picture — the
  old block was accurate and made her do all of the picturing herself.
  Horizontal rather than a dial for two reasons: it says the same thing in about
  half the height (the price card still has to be on screen when she lands), and
  a horizontal scale reads as a timeline where a dial reads as a score. Both ends
  stay her own words, the header keeps the {PLAN_DAYS} days / per-day
  denominator, and no projected score appears on it (see `lib/planTimeline.ts`).
  The loop runs only while the board is in view.
  Also: "Everything included" now carries the three app shots, and `<PhoneShot />`
  / `<ShotStage />` / `SHOT_W` / `SHOT_H` moved out of `app/register/page.tsx`
  into `components/PhoneShots.tsx` so the two screens can't drift into looking
  like two different products. `PhoneShot`'s `initial` no longer branches on
  `useReducedMotion` — that hook reads false through hydration, so it was a
  hydration mismatch on every reduced-motion visitor; reduced motion collapses
  the transition to zero instead. Same trap, same fix, in the board.
- **The letter delivers the score card (2026-08-17)** — `<EnvelopeReveal />`'s
  sheet used to print a bare `46/100`, which is not a result: it is a number she
  has to scroll to have explained, and the explanation was `<ScoreGauge />`
  restating the same metric name, the same "higher is better" and the same
  number ~250px lower. The most expensive moment of craft in the funnel was
  paying off a duplicate — the same fault the count-up fix had just removed, one
  level up. The sheet now carries the whole verdict: metric named, direction
  stated, her score on its own track with the goal marked and the gap to it in
  green. `<ScoreGauge />` → `<ScoreGapCard />`, which keeps only what a scale
  can't draw — **the gap as a number, the cohort benchmark in words, and the
  handover to the plan**. The letter says where she is; the card says what is
  missing and who closes it. Everything on the sheet has to survive at ~240×155
  and the letter is `aria-hidden` (it is an animation), so the numbers are
  announced once, from the card's `sr-only`.
  Also: the severity headline's terminal full stop moved *inside* the sweep.
  `HighlightSweep` is an `inline-block`, so a phrase that wraps fills the line
  and the period landed alone on the next one, centred, reading as a stray
  bullet under the headline.
- **Estrogen chart: the hole under it (2026-08-17)** — `<EstrogenCurve />` drew
  its baseline at y=119 in a 120-tall viewBox while the lines ran 16..104, so a
  detached rule sat under the chart with a band of nothing above it. The box is
  now sized to the ink in it (viewBox 110, floor at 106) and the "Now" line is
  filled to that floor, so the troughs read as drops instead of a squiggle
  hanging in space. The "Before" line is dashed again: it was declaring
  `strokeDasharray` *and* animating `pathLength`, and framer-motion owns
  `strokeDasharray` when it draws a path — the dash was overwritten and the
  reference line had been rendering as a second solid series, which is the
  comparison the block exists to make. It fades in now instead of drawing.
- **`<PlanStage />` retimed and its captions cut (2026-08-17)** — the loop ran
  just under 15s on a sales page; holds are ~20% shorter (3.4/4.2/4.4s) with the
  tick and day-fill beat sheets moved to match, so every act still settles with
  room before it hands over. The captions under it were a sentence of copy each,
  under a picture already making the point — now one short line, 10px, on one
  line of reserved height.
- **Results screen: colour, evidence, measurement (2026-08-17)** — the `results`
  phase was the one screen in the funnel carrying its whole argument in
  typography over her own self-report. Three groups of change.
  **Measurement first, again**: results is a four-card scroll and `ResultsView`
  (on mount) was the only thing it reported, so "reached results" and "saw that
  the plan exists" were the same number and nothing below the fold was
  falsifiable. `trackPlanScrollDepth()` → `trackScrollDepth(screen, percent)`,
  and both long scrolls now report through the one event with a `screen` param
  (see §4). Ship this and read it before judging anything below.
  **Colour, given one job**: the screen had brand pink on the CTA, on the
  plan-ready card *and* on her symptom count — the single worst number on the
  page painted in the same ink as the button — while three of its four cards
  shared a byte-identical cream shell, so nothing read as subordinate to
  anything. The rule now: ink = fact, rose = the load she carries now, green =
  the gap and what closes it, **pink = the CTA and nothing else**. So the
  symptom count is rose, the plan-ready card is green (it answers the gauge's
  gap, and it no longer reads as a second button 60px above the real one), and
  `HighlightSweep` gained a `rose` variant for the results headline — which
  until now was the only headline in the funnel with *no* sweep on it, while
  the three on the plan screen one tap later all had one. `getSeverityHeadline`
  returns `{pre, sweep, post}` for that reason.
  **Evidence**: her symptom tiles were 48px circles under 9px grey labels — the
  most personal element on the screen rendered as its smallest, in a size a
  presbyopic 45-60 reader cannot resolve, 90 seconds after she tapped the same
  tiles at ~224px. Now a 3-col grid of square tiles (square because the sources
  are 460×460 and a landscape crop would cut 25% off centred illustrations),
  capped at 6 with a "+N more". And `<EstrogenCurve />` draws the claim the card
  stakes everything on — it is the only block on the screen that isn't her own
  answers read back to her, and it is captioned as illustrative of the pattern
  rather than as her levels.
  **One number, one moment**: the envelope printed her final score at ~1s and
  `<ScoreGauge />` then spent until 2.3s counting up to a number she had already
  read, under a second copy of the same "score /100 / Higher is better" stack.
  The count-up moved onto the letter (retimed to the sheet's rise), the letter
  gained her name, and the gauge dropped its hero number to lead with the
  **gap** — the only figure on the screen she is actually being asked to buy.
  Her score still reads off her marker on the track. The gauge also now *shows*
  the cohort benchmark, which was computed, passed as a prop, used to pick the
  verdict word, and then rendered to nobody but a screen reader.
  Also: the pain paragraph is left-aligned and a step larger — centred 14px
  mid-grey was the hardest possible way to read the emotional core of the page.
  **Not changed, deliberately**: no product screenshot, before/after or polaroid
  moved onto results. Results has to make her believe the *diagnosis*; the plan
  screen has to make her believe the *product*. Moving that proof forward spends
  the offer screen's ammunition early, which is the mistake the 2026-08-16 pass
  had just finished undoing.
  **Known open item**: the "Harder than it hits most" card makes a comparative
  claim and then discloses, in its own footnote, that "typical" is a modelled
  profile rather than a survey average. That is honest, and it is the one thread
  a sceptic can pull on the screen where belief is formed — a comparison that
  admits its own baseline is invented. It was left alone because the fix is
  either real benchmark data or dropping the vs-typical framing, and both are
  calls about what the product is willing to claim, not layout. `results.webp`
  is a second one: it is a full portrait illustration rendered at `opacity-15`
  as a wash behind the score, so 83KB (over the 50KB guideline in §5) buys
  something 85% invisible.
- **The funnel has one entrance (2026-08-17)** — `/register` now always starts at
  question 1, and `?phase=paywall` is gone.
  The quiz answers live in React state and nothing persists them, so any URL
  landing her *past* the quiz lands her in a funnel with no answers in it. On the
  paywall that was a money bug rather than a cosmetic one:
  `handleStartCheckout` signed her in anonymously *unconditionally* to get the
  session `create-checkout` needs, so a woman arriving cold on
  `/register?phase=paywall` — from her history, a bookmark, or `proxy.ts` — could
  buy on a blank account, and `generatePlan()` would read no profile
  (`buildPlan({})`) and build the generic plan. She paid $59 for personalisation
  and got the default, with nothing to tell her before the charge.
  Rather than detect that state, the entrance was removed. **Two URLs, one job
  each**: `/register` is the funnel and only accepts `?phase=download` (Stripe's
  success URL — she has already paid, there is nothing left to lose);
  `/paywall` is the price screen for anyone who *already has an account*, which
  is the same `<PaywallView />` with nothing to re-collect. Stripe's cancel URL
  and `proxy.ts`'s payment gate both point at `/paywall` now (the dashboard
  layout already did), and `proxy.ts`'s `no-onboarding` case points at plain
  `/register`. The residual guard in `handleStartCheckout` is a `getUser()`
  check that restarts the quiz instead of minting a blank account.
  `/paywall` also passes `from_registration: true` now, so a purchase there ends
  on the funnel's download screen instead of `/checkout/success`, which still
  invites her to open Lisa on the web dashboard deleted in 2026-08-14.
  (`/checkout/success` was deleted outright on 2026-08-18 — every checkout now
  returns to `/register?phase=download`, and `defaultSuccess` no longer branches.)
  **Server-side data was never being lost** — every `user_trials` row has its
  `user_profiles` row; only the browser's copy goes, and re-walking the funnel
  UPDATEs the profile on the same account.
  One gap is deliberate and unchanged: `adoptQuizProfile()` keeps the *older*
  profile on an email collision, so a returning customer's re-take is discarded
  in favour of what that account already had.
- **`q_safety` → `q_limitations` (2026-08-16)** — the `/register` screen that
  read "Do any of these apply to you?" and collected clinical contraindications
  now asks "Does anything hurt or hold you back when you move?" and collects
  physical obstacles (`back`, `knee`, `hip`, `shoulder`, `pelvic_floor`,
  `balance`, `none`) into `user_profiles.physical_limits`. The step count is
  unchanged — this replaced the safety screen rather than joining it.
  The answers are a **hard gate, not a prompt hint**: `LIMITATION_EXCLUDES` in
  `lib/plan/catalog.ts` strips the aggravating exercises out of her pool before
  the model sees it, the same way the `joint_pain` impact rule already did, so a
  model can't opt out of it. The prompt gets a line too, but only so the copy
  doesn't apologise for a plan that has already been adjusted. The ids are the
  contract between three files (`LIMITATION_OPTIONS` in `app/register/page.tsx`,
  `PHYSICAL_LIMITS` in save-quiz, `LIMITATION_EXCLUDES` in the catalog) — rename
  in all three or nowhere, because an unmatched value is silently ignored, which
  is a knee that gets lunges.
  Excluding is capped by the pool it leaves behind: a beginner ticking all six
  still keeps 20 exercises with every family represented (`movement_snacks` is
  the floor at 18). Re-check that when adding a limitation — a starved pool
  makes a worse plan than one that lets a step-up through.
  **`safety_flags` was not removed**: the column, the zod field and the plan's
  hormone-therapy/phytoestrogen/herbal rule all stay, because the Expo app still
  asks and every profile written since 2026-08-12 carries a value. Web signups
  just write an empty array now, so that rule no longer fires for them.
  Migration `scripts/sql/2026-08-16-physical-limits.sql` — **not applied yet**.
- **Funnel audit fixes (2026-08-16)** — sixteen changes to `/register`, in three
  groups.
  **Measurement first**: six new Meta events plus parameterized `QuizStep` and
  `PlanScrollDepth` (see §4). Nothing else here was rankable without them.
  **The results screen**, which sold a score and withheld the product: the score
  card is rebuilt as `<ScoreGauge />` (metric named, "higher is better" stated,
  two labelled markers instead of three unlabelled ticks, the *gap* coloured
  rather than the number — it used to render red or orange at every value on a
  higher-is-better scale, under a ⚠ icon); the envelope now delivers her actual
  score instead of a stock illustration; the duplicate red symptom pills are
  gone; "You're not alone" was a fear chart under a comfort headline and now
  says what its data shows; `estrogenPct` — a per-user percentage computed from
  quiz answers and rendered as a clinical claim about her — is replaced by her
  own symptom count plus a general statement about estrogen; and the screen now
  ends on "your 8-week plan is ready", closing the promise the start screen and
  the loader both made.
  **Structure**: the plan is block 1 of the plan screen with the real
  `/screenshots` masters (hero uncropped and full width via `<PlanHeroShot />`,
  three supporting shots tilted) and the only 4xl headline left; the trajectory
  chart moved below it and had its three contradictory time horizons (copy said
  4–7 years, axis said 8 weeks, code said 2 years) resolved into one marked
  broken axis; `relief` and `nutrition` merged into one phase with the checklist
  cut from ten rows to five; the loader runs 6.5s with a percentage; the success
  screen now shows her the address she typed at Stripe and tells her it is her
  login; every phase change cross-fades through one `AnimatePresence`.
  Also: the paywall's "One payment" trust box contradicted "renews every 8
  weeks" 100px above it and is now "Cancel before week 8".
  **Not changed, deliberately**: `PLAN_ADHERENCE_PCT` is still 90. A 90% bar
  over 56 days reads as unclaimable to the skeptic the guarantee exists to
  convert, but lowering it changes a refund promise, which is a business call.
- **Web product surfaces deleted (2026-08-14)** — `app/chat/lisa/` (~2,700
  lines), `app/dashboard/notifications/`, `components/CoffeeLoading.tsx`, the
  three list-only notification components, `hooks/useUnreadCount.ts`,
  `hooks/useIsMobile.ts` and `lib/notificationUtils.ts` are gone. The
  `WEB_APP_ENABLED` flag went with them — with nothing left to toggle it was
  just a stale branch in `proxy.ts`, the dashboard layout and `/register`.
  `SwipeButton` lost its `"lisa"` variant and is now the landing CTA only;
  notification CTAs whose label mentions Lisa route to `/get-the-app` instead
  of the dead `/chat/lisa`. **No API route, no `lib/rag/`, no
  `knowledge-base/` was touched** — that is the Expo app's backend, and
  deleting it would have removed chat and symptom logging from the phone as
  well as the browser. See "Web app vs mobile app" in §4 for the full
  gone/stayed split.
- **Email sequences deleted (2026-08-12)** — the whole system: `p-1`…`p-6`
  (winback), `3-2`/`3-4` (paid drip), `lib/emailSequences.ts`,
  `/api/cron/email-sequences`, the `email_sequence_recipients` mirror table, its
  two sync triggers on `user_profiles`/`user_trials`, and all three
  `*_email_sequence_*` functions. The winback needed an address from someone who
  abandoned the paywall, and the funnel has collected none since 2026-08-10; the
  drip was engagement mail, and engagement belongs to the Expo app now.
  **One step survived**: the renewal notice, rebuilt as `/api/cron/renewal-notices`
  reading `user_trials` directly, deduped by the new
  `user_trials.renewal_notice_sent_for` column (it stores the
  `subscription_ends_at` it warned about, so the next period arms it again with
  no reset). It stays because it is about her money rather than her attention,
  it is the cheapest chargeback insurance in the product, and the paywall
  promises it at the price. `sendSequenceEmail` → `sendTransactionalEmail`;
  `purge_stale_anonymous_users()` rewritten without the dropped table (it deletes
  each `user_id` table explicitly, so dropping one it names breaks the 3am cron).
  Migration `scripts/sql/2026-08-12-drop-email-sequences.sql` — **applied**.
- **Funnel measurement unblocked + paywall credibility (2026-08-12)** —
  `user_trials_account_status_check` still listed the pre-2026-08-08 trial states
  and rejected `'pending_payment'`, so **every web signup's `user_trials` insert
  failed** while `save-quiz` only `console.error`'d it. Nothing broke visibly
  (`'paid'` passed, and `checkTrialExpired()` fails closed) but the entire
  "reached the paywall, didn't buy" cohort had no row, and `p-1`…`p-6` selects on
  `account_status = 'pending_payment'` so it matched nobody. Constraint narrowed
  to the three states the code writes, 7 orphaned finishers backfilled, and the
  insert now logs under `[save-quiz] FUNNEL-BLIND` and returns `trialRowReady`
  rather than failing silently. The winback is still dark for web signups for the
  separate reason that the funnel collects no email.
  Also: the paywall's 10-minute countdown and its one-tap "get my discount back"
  are gone — a timer that visibly resets teaches a 45-60 audience that the page
  is staged, and the element on that screen that cannot afford doubt is the
  refund guarantee. Replaced with a static price hold. (The countdown itself came
  back on 2026-08-17 — see the entry at the top of this list — but the reset
  button did not, and that was the half that did the damage.) And the renewal notice
  moved from 1 day to `RENEWAL_NOTICE_DAYS` (3), stated on the paywall at the
  price rather than in small print; the week-8 charge is the most disputable
  moment in the product. Migration
  `scripts/sql/2026-08-12-fix-account-status-check.sql` — **applied**.
- **Quiz v2 (2026-08-12)** — `/register` is now 12 questions in a new order, with
  four new ones (`q_menopause_type`, `q_nutrition`, `q_relaxation`, `q_safety`)
  and a follow-up severity tap on `q4_symptoms` that rates the symptom she picked
  first. `q6_how_long` and `q7_qualifier` were **dropped from the web funnel** —
  their columns (`timing`, `qualifier`) stay in the schema because the Expo app
  still asks them and every existing row carries a value; web writes null now.
  Two knock-ons: `calculateWellbeingScore`'s `timing` is optional and falls back
  to a flat mid-range penalty, and the `reward_progress` pride line is keyed off
  `here_for` instead. The new answers reach `lib/plan/generate.ts` — the safety
  flags as a hard rule about hormone therapy, phytoestrogens and herbal
  supplements, so **any new plan-prompt work must keep that rule intact**.
  (`q_safety` itself was replaced by `q_limitations` on 2026-08-16 — see the
  entry above. The rule and its column survive for the Expo app.)
  Migration `scripts/sql/2026-08-12-quiz-v2-columns.sql` — **not applied yet**.
  Images for the three new tile questions do not exist yet
  (`public/quiz/menopause-type/`, `nutrition/`, `relaxation/`).
- **Admin panel rebuilt on real numbers (2026-08-11)** — `/admin` now shows
  purchases and revenue read from Stripe charges (new vs renewal, refunds, fees,
  today/7d/30d, six months), a full client table (name, email, account state,
  lifetime spend, whether her plan generated), and cost per LLM plan generation.
  The cost side is new plumbing: `llm_usage` records every OpenAI call with its
  price frozen at write time (`lib/llmCost.ts`, `lib/llmUsage.ts`), and
  `lib/plan/generate.ts` meters both of its calls under one `run_id`. Migration
  `scripts/sql/2026-08-11-llm-usage.sql` — **applied**. See "Admin panel" in §4.
- **Referral system removed (2026-08-10)** — `/api/referral/*` (code,
  discount-eligible, apply), `<InviteReferralSection />`, the `?ref=` capture in
  `/register`, the `referralCode` field on save-quiz, the coupon check in the
  Stripe `invoice.payment_succeeded` handler, `PLAN_PRICE_REFERRAL`,
  `STRIPE_REFERRAL_COUPON_ID` and email step `3-3` are all gone. Schema drop
  (the `referrals` table, `user_profiles.referral_code`,
  `user_trials.referral_discount_used_at`) is
  `scripts/sql/2026-08-10-drop-referral-system.sql` — **not applied yet**. The
  Expo app calls these endpoints too; see §7 of `docs/mobile-app-changes.md`.
- **Checkout fulfillment made webhook-independent (2026-08-10)** — the email
  bind, plan generation and welcome email moved out of the webhook into
  `lib/stripe/fulfillCheckout.ts`, which `/api/stripe/sync-session` now also
  runs. Guarded by a `user_trials.fulfilled_at` claim so the two can't both fire.
  `GET /api/plan` generates on a missing row instead of returning `"none"`
  forever. Prompted by a live purchase where the webhook never arrived and the
  customer ended up paid, emailless and planless. See "Checkout fulfillment" in
  §4 and `scripts/sql/2026-08-10-checkout-fulfillment-claim.sql`.
- **Email step removed from the funnel (2026-08-10)** — `/register` signs her in
  anonymously and Stripe collects the address at checkout; the webhook binds it
  to that account. Removed the `email` phase, `handleOtpSuccess` and `<OtpForm />`
  from the register page. See "Anonymous accounts" in §4 and
  `scripts/sql/2026-08-10-anonymous-funnel-accounts.sql`.
  **Side effect: the pending-payment winback (`p-1`…`p-6`) went dark** — nobody
  who abandons the paywall leaves an address any more. It was deleted outright
  two days later; see the 2026-08-12 entry above.
- **RLS bypass fixed (2026-08-08)** — four `FOR ALL / USING (true)` policies with
  no `TO` clause were exposing every table to the anon key. Dropped; see
  `scripts/sql/2026-08-08-URGENT-fix-rls-bypass.sql`.
- **Trial removed entirely (2026-08-08)** — the `trialing` state, the
  `trial_start`/`trial_end`/`trial_days` columns and their triggers are gone.
  One plan: $59 / 8 weeks, charged at checkout.
- **Access gate fails closed** — `checkTrialExpired()` used to allow on a
  missing row or a query error.
- **Mobile-only web** — the product surfaces are deleted outright (see the
  2026-08-14 entry); Account and Settings stay reachable so cancellation and
  deletion always work.
- **Env consolidated** — `.env.example` is the authoritative list;
  `NEXT_PUBLIC_APP_URL` and the retired plan price ids are gone.

Active areas of the codebase:
- Access control (`lib/getAccountState.ts`, `lib/checkTrialStatus.ts`, `proxy.ts`)
- Stripe billing (`app/api/stripe/`, `lib/pricing.ts`, `lib/subscriptionWrite.ts`)
- Transactional email (`lib/resend.ts`)
- The `/register` funnel (`app/register/page.tsx`, `lib/metaPixel.ts`)

See `docs/mobile-app-changes.md` for the API contract changes the Expo app must
follow.
