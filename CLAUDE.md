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
- **Passwordless auth only** — magic link via Supabase OTP; no password-based login
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
│   │   ├── account/         # Account management (delete, etc.)
│   │   ├── admin/           # Admin utilities (one-time migrations)
│   │   ├── auth/            # Auth helpers (magic link, check user, save quiz)
│   │   ├── chat-sessions/   # Chat session persistence
│   │   ├── cron/            # Scheduled jobs (reminders, insights, trial checks)
│   │   ├── daily-mood/      # Mood tracking (1-4 scale)
│   │   ├── doctor-report/   # Generate doctor-ready health report
│   │   ├── fitness/         # Fitness tracking
│   │   ├── good-days/       # "Good day" logs
│   │   ├── health-summary/  # Health summary report generation
│   │   ├── hydration/       # Hydration tracking
│   │   ├── insights/        # Insights generation endpoint
│   │   ├── intake/          # Onboarding quiz data saving
│   │   ├── langchain-rag/   # Main AI chat endpoint (Lisa)
│   │   ├── notifications/   # In-app/push notification CRUD
│   │   ├── nutrition/       # Nutrition logging
│   │   ├── nutrition-insights/ # Nutrition-specific insights
│   │   ├── referral/        # Referral system
│   │   ├── register/        # User registration helper
│   │   ├── stripe/          # Stripe checkout + webhook
│   │   ├── symptom-logs/    # Symptom log CRUD
│   │   ├── symptoms/        # Symptom definitions (seeded defaults)
│   │   ├── tracker-insights/# Tracker data analysis
│   │   └── user-preferences/# Notification preferences
│   ├── auth/                # Auth callback handlers
│   ├── chat/lisa/           # Lisa AI chat page
│   ├── checkout/            # Stripe checkout page
│   ├── dashboard/           # Protected authenticated area
│   │   ├── fitness/
│   │   ├── notifications/
│   │   ├── nutrition/
│   │   ├── overview/        # Health analytics overview
│   │   ├── settings/
│   │   └── symptoms/        # Main home/tracker page
│   ├── delete-account/      # Account deletion flow
│   ├── forgot-password/
│   ├── login/
│   ├── magic-link/          # Magic link confirmation page
│   ├── privacy/
│   ├── register/            # Onboarding quiz (8 steps)
│   ├── reset-password/
│   └── terms/
├── components/              # Shared React components
│   ├── fitness/
│   ├── insights/
│   ├── landing/             # Landing page sections
│   ├── notifications/
│   ├── nutrition/
│   ├── symptom-tracker/     # Main tracker UI (13 components)
│   └── ui/                  # Base UI: button, badge, accordion, AnimatedComponents
├── hooks/                   # 12 custom React hooks (data fetching, UI state)
├── knowledge-base/          # Markdown KB files for RAG (never edit manually — source of truth for AI)
├── lib/                     # Shared utilities and business logic
│   ├── insights/            # Pure data insight generation (no AI)
│   ├── rag/                 # Full RAG pipeline (orchestrator, retrieval, personas, etc.)
│   └── *.ts                 # Utilities, Supabase clients, auth helpers
├── public/                  # Static assets (fonts/, images)
├── scripts/                 # One-off scripts (ingestion, migrations)
├── next.config.ts
├── middleware.ts             # Route protection and CORS
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

**Database migrations:** There is no ORM migration system. Schema changes are applied via:
1. Direct SQL in Supabase Dashboard
2. Ad-hoc scripts in `scripts/` (e.g., `apply-migration.ts`, `create-user-trials-table.ts`)
3. One-time API endpoints in `app/api/admin/`

Run a migration script: `npx tsx scripts/<script-name>.ts`

**Cron jobs** (run automatically on Vercel per `vercel.json`):
| Endpoint | Schedule | Purpose |
|---|---|---|
| `/api/cron/daily-reminders` | 9am UTC daily | Push notification to users who haven't logged today |
| `/api/cron/weekly-insights` | 12am UTC Monday | Generate weekly insight summaries |
| `/api/cron/trial-reminders` | 10am UTC daily | Email users whose trial is ending soon |
| `/api/cron/email-sequences` | 11am UTC daily | Drip email sequences |

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
| Server client | Created inline via `@supabase/ssr` | Server components, middleware |
| Admin client | `lib/supabaseAdmin.ts` → `getSupabaseAdmin()` | API routes, scripts (bypasses RLS) |

```typescript
// API routes always use admin client
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
const supabaseAdmin = getSupabaseAdmin(); // lazy singleton
```

### Authentication
- `lib/getAuthenticatedUser.ts` — **always use this** in API routes; it handles both cookie-based (web) and Bearer token (mobile) auth
- Registration flow: quiz form → `POST /api/auth/send-magic-link` (creates account + saves quiz + starts trial) → email → `/auth/callback` → session
- Middleware at `middleware.ts` protects `/dashboard/*` and `/chat/lisa/*` routes

### Database Schema (key tables)
Supabase (PostgreSQL) — no ORM, raw SQL queries via Supabase JS client:

| Table | Key Columns |
|---|---|
| `symptoms` | `id`, `user_id`, `name`, `icon`, `is_default` |
| `symptom_logs` | `id`, `user_id`, `symptom_id`, `severity` (1-3), `triggers[]`, `time_of_day`, `notes`, `logged_at` |
| `daily_mood` | `user_id`, `date`, `mood` (1-4); unique on `(user_id, date)` |
| `user_profiles` | `user_id`, `name`, `top_problems[]`, `severity`, `timing`, `goal`, `doctor_status` |
| `user_trials` | `user_id`, `trial_start`, `trial_end`, `trial_days` (default 3), `account_status` ("trial"/"paid"/"expired"), `subscription_ends_at` |
| `documents` | Vector store — `id`, `content`, `metadata` (JSONB), `embedding` (vector 1536) |
| `notifications` | `user_id`, `type`, `content`, `metadata` (JSONB), `is_read`, `created_at` |

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
All env vars live in `.env.local` (local) and Vercel project settings (production). Pattern:
- `NEXT_PUBLIC_*` — safe to expose to browser
- Others — server-only (API routes, scripts)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # Admin operations, never expose to client
OPENAI_API_KEY                 # LangChain / embeddings
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_MONTHLY           # Stripe Price ID (price_xxx)
STRIPE_PRICE_ANNUAL            # Stripe Price ID
STRIPE_WEBHOOK_SECRET          # Webhook signature verification
RESEND_API_KEY                 # Transactional email
CRON_SECRET                    # Protects /api/cron/* endpoints
NEXT_PUBLIC_SITE_URL           # Base URL (used in redirects)
```

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
- `middleware.ts` — modifying the matcher or auth logic can expose protected routes

### Constraints
- OpenAI embeddings dimension is **fixed at 1536** — changing this requires dropping and rebuilding the `documents` table
- Stripe webhook events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — new event types require new handlers
- Vercel Cron is only available on paid Vercel plans; cron endpoints must respond within 60 seconds

### Do Not Refactor Without Discussion
- `lib/rag/` — the entire RAG pipeline is carefully tuned with specific thresholds (semantic: 0.30/0.35, hybrid: 0.44-0.50, intent: 0.80); changing values affects AI response quality
- Auth flow in `app/api/auth/send-magic-link/route.ts` — creates account + trial in one atomic flow; breaking this disrupts onboarding
- `middleware.ts` matcher config — must stay in sync with protected route list

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
4. Access from API routes via `getSupabaseAdmin()` (bypasses RLS for server operations)
5. Access from client components via `supabase` from `lib/supabaseClient.ts` (respects RLS)
6. Document the table schema in this file's "Database Schema" section

### Adding a New Dashboard Page

1. Create `app/dashboard/<feature>/page.tsx`
2. Add `"use client"` if it uses React hooks or browser APIs
3. Add `export const dynamic = "force-dynamic"` if it fetches user-specific data
4. Create a custom hook in `hooks/use<Feature>.ts` for data fetching
5. Add navigation link in `components/ConditionalNavbar.tsx` or the dashboard layout

### Adding a New Frontend Component

1. Create in `components/<category>/<ComponentName>.tsx`
2. Use `cn()` from `@/lib/utils` for conditional Tailwind classes
3. Use Framer Motion via `components/ui/AnimatedComponents.tsx` wrappers for animations
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
- Verify webhook URL matches the live domain (`https://menolisa.com/api/stripe/webhook`)
- Check `STRIPE_WEBHOOK_SECRET` matches the secret shown in Stripe Dashboard for that endpoint
- For local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

**Trial not starting after registration**
- Check `user_trials` table has a row for the user
- `send-magic-link` route creates the trial row; if it failed, create manually via Supabase dashboard

---

## 7. CURRENT STATUS

Recent work (from git log):
- **Paywall** — trial expiry enforcement added across routes
- **Delete account** — full account deletion flow added (`/delete-account`)
- **Privacy & Terms** — pages added
- **Funnel optimization** — onboarding/registration improvements
- **Email sequences** — drip email campaign system added (`lib/emailSequences.ts`, `/api/cron/email-sequences`)

Active areas of the codebase (most recently changed):
- Trial/paywall enforcement (`lib/checkTrialStatus.ts`, `components/PricingModal.tsx`)
- Email automation (`lib/emailSequences.ts`, `lib/resend.ts`)
- Account management (`app/delete-account/`, `app/api/account/`)
