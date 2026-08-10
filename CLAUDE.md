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
│   │   ├── insights/        # Insights generation endpoint
│   │   ├── intake/          # Onboarding quiz data saving
│   │   ├── langchain-rag/   # Main AI chat endpoint (Lisa)
│   │   ├── notifications/   # In-app/push notification CRUD
│   │   ├── plan/            # 8-week plan generation, habits, completion
│   │   ├── referral/        # Referral system
│   │   ├── stripe/          # Checkout, portal, webhook, sync
│   │   ├── symptom-logs/    # Symptom log CRUD
│   │   ├── symptoms/        # Symptom definitions (seeded defaults)
│   │   ├── tracker-insights/# Tracker data analysis
│   │   └── user-preferences/# Notification preferences
│   ├── admin/               # Admin stats page
│   ├── auth/                # Auth callback + mobile bridge
│   ├── chat/lisa/           # Lisa AI chat page
│   ├── checkout/            # Stripe checkout success
│   ├── dashboard/           # Protected authenticated area
│   │   ├── account/         # Plan, billing, cancellation — never payment-gated
│   │   ├── notifications/
│   │   ├── settings/
│   │   └── symptoms/        # Main home/tracker page
│   ├── delete-account/      # Account deletion flow
│   ├── login/               # OTP sign-in
│   ├── paywall/
│   ├── privacy/
│   ├── register/            # Onboarding quiz + OTP sign-up
│   └── terms/
├── components/              # Shared React components
│   ├── auth/                # OtpForm — the only auth UI
│   ├── landing/             # Landing page sections
│   ├── notifications/
│   ├── symptom-tracker/     # Main tracker UI (12 components)
│   └── ui/                  # Base UI: button, badge, accordion
├── hooks/                   # 10 custom React hooks (data fetching, UI state)
├── knowledge-base/          # Markdown KB files for RAG (gitignored; source of truth for AI)
├── lib/                     # Shared utilities and business logic
│   ├── insights/            # Pure data insight generation (no AI)
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
| `/api/cron/email-sequences` | 11am UTC daily | Drip email sequences (pending-payment winback + paid drip) |
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
- Registration flow: quiz → **anonymous sign-in** behind the calculating loader → `POST /api/auth/save-quiz` (server reads `userId` from session, validates payload with zod, creates `user_trials` row in `pending_payment`) → results → diagnosis → relief → nutrition → paywall → Stripe checkout **collects the email** → webhook binds it to that same user id and flips `account_status` to `paid`
- Mobile bridge (`app/auth/mobile-bridge/page.tsx`) is a session handoff (mobile → web token via `#hash`), not a login — leave it alone
- Email template: paste branded HTML into Supabase Dashboard → Auth → Email Templates → Magic Link, with `{{ .Token }}` for the 6-digit code
- `proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`, and the exported function from `middleware` → `proxy`) protects `/dashboard/*` and `/chat/lisa/*`. It runs two gates: a session check on everything in `PROTECTED_PREFIXES`, then a payment check that skips `PAYMENT_EXEMPT_PREFIXES` (`/dashboard/account`, `/dashboard/settings`) so cancellation and account deletion stay reachable after access ends. Select the full `TRIAL_SELECT_COLS` when reading `user_trials` — a partial select makes missing columns read as "no dispute, not canceled" and grants access it shouldn't.

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

**Bind the email before writing `user_trials`.** The `sync_email_sequence_recipient()`
trigger fires on that write and returns early for a user with no email, so an
email that lands afterwards means the paid drip never starts for her.

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
| `user_trials` | `user_id`, `account_status` ("pending_payment"/"paid"/"expired"), `subscription_ends_at`, `subscription_canceled`, `payment_failed_at`, `dispute_flagged_at`, `provider`, `plan_type`, `plan_amount`, `fulfilled_at` (one-time-side-effect claim — see "Checkout fulfillment"). No trial columns — see below. The table name is legacy; it holds subscriptions. |
| `documents` | Vector store — `id`, `content`, `metadata` (JSONB), `embedding` (vector 1536) |
| `notifications` | `user_id`, `type`, `content`, `metadata` (JSONB), `is_read`, `created_at` |

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
account deletion.

`WEB_APP_ENABLED` (`lib/constants.ts`, from `NEXT_PUBLIC_WEB_APP_ENABLED`,
**off unless set to `"true"`**) is the switch. When off, `/dashboard/symptoms`,
`/chat/lisa` and `/dashboard/notifications` render `<GetTheAppScreen />` instead
of the product, the nav collapses to Account, and `/dashboard` redirects to
`/dashboard/account`. The pages are still in the repo — this is a flag, not a
deletion, so turning the web app back on is one env var.

It is a **UI** switch only. The API routes stay open because the mobile app
calls them; each enforces access itself via `checkTrialExpired()`. Any new route
serving paid content needs that check — auth alone is not enough.

Account and Settings are never gated on payment or on this flag, in either
`proxy.ts` or the dashboard layout. Someone whose subscription ended must still
be able to cancel and delete.

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

| Event | Fires from | Value |
|---|---|---|
| `PageView` | `components/MetaPixel.tsx` (in `app/layout.tsx`); re-fires on App Router route changes | — |
| `QuizStart` *(custom)* | `app/register/page.tsx` on the quiz phase | — |
| `QuizComplete` *(custom)* | `app/register/page.tsx` last step of `goNext()` | — |
| `Lead` | `app/register/page.tsx` `completeRegistration()`, after save-quiz succeeds | — |
| `ViewContent` | `components/PaywallView.tsx` on mount (once) | $59 |
| `InitiateCheckout` | `components/PaywallView.tsx` CTA click | $59 |
| `Purchase` | Browser: `components/MetaPurchaseTracker.tsx` on the success landing. Server: `sendMetaPurchase()` from the Stripe webhook | $59 |

Step names and their sessionStorage dedup keys are paired in `META_FUNNEL_STEPS`
(`lib/metaPixel.ts`) and fired through `trackFunnelStep()`.
`QuizStart`/`QuizComplete` are custom events — each needs a **Custom Conversion**
defined in Events Manager before it can be optimized for or used as an audience.
`Lead` is standard and needs no setup, which is why it's the fallback
optimization objective while Purchase volume is below learning-phase exit. Since
the funnel stopped collecting an email, `Lead` carries no hashed address and
matches on pixel signals alone — it fires one screen after `QuizComplete`, so
treat it as "profile saved", not as a captured contact.

`Purchase` is sent from **both** browser and server and deduplicated by a shared
`event_id` (`purchaseEventId()` in `lib/metaPixel.ts`, derived from the Stripe
Checkout Session id). Shared constants live in `lib/metaPixel.ts`; the CAPI
sender in `lib/metaCapi.ts` never throws, so a Meta outage can't fail the Stripe
webhook and trigger retries.

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

`_fbp`/`_fbc` cookies plus the client IP and user-agent are captured in
`app/api/stripe/create-checkout/route.ts` and stashed on the Checkout Session
metadata, because the webhook is server-to-server and cannot see them.

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
  screenshots in `diagnosys/` render at 260px. Aim to keep each file under 50KB.
- There is no build step — what you put in `public/` is exactly what ships.

### External Services
| Service | Purpose | Key files |
|---|---|---|
| Supabase | Database, Auth, Vector search | `lib/supabaseClient.ts`, `lib/supabaseAdmin.ts` |
| OpenAI | Embeddings (`text-embedding-3-large`) + Chat (`gpt-4o-mini`) | `app/api/langchain-rag/route.ts`, `scripts/ingest-documents.ts` |
| Stripe | Payments, subscriptions | `app/api/stripe/`, `app/checkout/` |
| Resend | Transactional email (magic links, sequences) | `lib/resend.ts`, `lib/emailSequences.ts` |
| Vercel | Hosting + Cron jobs | `vercel.json` |

### Security-Sensitive Areas
- `app/api/stripe/webhook/route.ts` — **must** verify Stripe signature before processing; never remove signature verification
- `app/api/cron/` — routes check `CRON_SECRET` header; never remove this check
- `lib/supabaseAdmin.ts` — uses service role key (bypasses RLS); only call from server-side code
- `proxy.ts` — modifying the matcher or auth logic can expose protected routes
- **Never take a user id from a request body.** `/api/intake` and
  `/api/referral/apply` both did, while writing with the service role, which let
  anyone overwrite another woman's health profile or mint referral coupons.
  Derive it from `getAuthenticatedUser(req)`, always.
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
  **Side effect: the pending-payment winback (`p-1`…`p-6`) goes dark for web
  signups** — nobody who abandons the paywall leaves an address any more. The
  steps are deliberately left in `lib/emailSequences.ts` because mobile-app
  signups still register with a real email and still receive them.
- **RLS bypass fixed (2026-08-08)** — four `FOR ALL / USING (true)` policies with
  no `TO` clause were exposing every table to the anon key. Dropped; see
  `scripts/sql/2026-08-08-URGENT-fix-rls-bypass.sql`.
- **Trial removed entirely (2026-08-08)** — the `trialing` state, the
  `trial_start`/`trial_end`/`trial_days` columns and their triggers are gone.
  One plan: $59 / 8 weeks, charged at checkout.
- **Access gate fails closed** — `checkTrialExpired()` used to allow on a
  missing row or a query error.
- **Mobile-only web** — `WEB_APP_ENABLED` hides the product surfaces; Account
  and Settings stay reachable so cancellation and deletion always work.
- **Env consolidated** — `.env.example` is the authoritative list;
  `NEXT_PUBLIC_APP_URL` and the retired plan price ids are gone.

Active areas of the codebase:
- Access control (`lib/getAccountState.ts`, `lib/checkTrialStatus.ts`, `proxy.ts`)
- Stripe billing (`app/api/stripe/`, `lib/pricing.ts`, `lib/subscriptionWrite.ts`)
- Email automation (`lib/emailSequences.ts`, `lib/resend.ts`)
- The `/register` funnel (`app/register/page.tsx`, `lib/metaPixel.ts`)

See `docs/mobile-app-changes.md` for the API contract changes the Expo app must
follow.
