# Insights API Implementation Plan
## Target: Next.js App Router — `app/api/insights/route.ts`

**Author context**: This document is a complete handoff spec for a web app developer. It covers every code change needed to fix the current `/api/insights` route. No new infrastructure is required — all changes are contained to a single file (with an optional helper extraction).

---

## Table of Contents

1. [What is broken and why](#1-what-is-broken-and-why)
2. [Database reference](#2-database-reference)
3. [Updated TypeScript types](#3-updated-typescript-types)
4. [File structure decision](#4-file-structure-decision)
5. [Full implementation — `app/api/insights/route.ts`](#5-full-implementation)
   - 5.1 Imports and constants
   - 5.2 Helper: format chat history
   - 5.3 Helper: compute cross-symptom correlations
   - 5.4 Helper: format correlations as text
   - 5.5 Helper: build the AI prompt
   - 5.6 Helper: call OpenAI
   - 5.7 Helper: upsert to `user_insights`
   - 5.8 Helper: run full generation pipeline
   - 5.9 GET handler — final flow
6. [SQL reference](#6-sql-reference)
7. [System prompt — full text](#7-system-prompt--full-text)
8. [Environment variables](#8-environment-variables)
9. [Testing checklist](#9-testing-checklist)
10. [AI image suggestion](#10-ai-image-suggestion-for-the-insight-card)

---

## 1. What is broken and why

| # | Problem | Impact |
|---|---------|--------|
| 1 | In-memory cache (`Map` or module-level variable) | Cache is lost on every cold start and not shared across serverless instances |
| 2 | Data window is only 7 days | Too short for menopause pattern detection; misses weekly cycles |
| 3 | Chat history is never fetched | AI has no context about what the user has already discussed with Lisa |
| 4 | No cross-symptom correlations pre-computed | AI must infer everything from raw log text — less reliable, more tokens |
| 5 | Action step labels "easy/medium/advanced" show in UI verbatim | The framing is clinical/judgmental; energy-based labels are warmer |
| 6 | No `generatedAt` or `dataPoints` in response | UI cannot show freshness or data confidence indicators |
| 7 | No background refresh — stale cache blocks fresh data | Users on slow connections wait for full AI generation on every load |

---

## 2. Database reference

All tables live in the Supabase project. The `supabaseAdmin` client (service role key) is used server-side so RLS is bypassed for these queries.

### `symptom_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| symptom_id | uuid | FK → symptoms.id |
| severity | int | 1–3 |
| triggers | text[] | |
| notes | text | |
| logged_at | timestamptz | |
| time_of_day | text | e.g. "morning", "afternoon", "evening", "night" |

### `symptoms`
| Column | Type |
|--------|------|
| id | uuid |
| user_id | uuid |
| name | text |
| icon | text |

### `daily_mood`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| user_id | uuid | |
| date | date | |
| mood | int | 1–4 (1 = rough, 4 = great) |
| created_at | timestamptz | |

### `conversations`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | |
| user_id | **text** | Stored as text, NOT uuid — use `.eq('user_id', user.id.toString())` |
| user_message | text | |
| assistant_message | text | |
| session_id | text | |
| created_at | timestamptz | |

### `user_profiles`
| Column | Type |
|--------|------|
| user_id | uuid |
| name | text |
| top_problems | text[] |
| severity | text |
| timing | text |
| tried_options | text[] |
| goal | text |
| age_band | text |

### `user_insights` (NEW — must exist before deploying)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | UNIQUE, FK → auth.users |
| insight | jsonb | Full `InsightResponse` object |
| generated_at | timestamptz | |
| symptom_logs_count | int | |
| chat_sessions_count | int | |
| data_window_days | int | DEFAULT 14 |

The migration SQL is in [Section 6](#6-sql-reference).

---

## 3. Updated TypeScript types

Replace the existing `InsightResponse` interface with this. **JSON keys are unchanged** — only UI display labels change.

```ts
// lib/insights/types.ts  (or inline at top of route.ts)

export interface InsightDataPoints {
  symptomLogs: number;
  chatSessions: number;
  daysWindow: number; // always 14
}

export interface InsightResponse {
  patternHeadline: string;
  why: string;
  whatsWorking?: string | null;
  actionSteps: {
    easy: string;     // UI label: "STARTS HERE (when low on energy)"
    medium: string;   // UI label: "WHEN YOU HAVE A BIT MORE IN YOU"
    advanced: string; // UI label: "IF YOU WANT TO GO DEEPER"
  };
  doctorNote: string;
  trend: 'improving' | 'worsening' | 'stable';
  whyThisMatters?: string;
  // New metadata fields
  generatedAt: string;        // ISO 8601 timestamp — always set server-side
  dataPoints: InsightDataPoints;
}

export interface InsightApiResponse {
  insight: InsightResponse;
  cached: boolean;
  stale?: boolean; // true when returning old data while regenerating in background
}
```

**UI note for whoever renders the card**: Map the JSON keys to display labels client-side:
```ts
const ACTION_LABELS = {
  easy:     'STARTS HERE (when low on energy)',
  medium:   'WHEN YOU HAVE A BIT MORE IN YOU',
  advanced: 'IF YOU WANT TO GO DEEPER',
};
```

---

## 4. File structure decision

Option A (simpler): Keep everything in `app/api/insights/route.ts`. Recommended for teams that prefer colocation.

Option B (cleaner): Extract helpers into `lib/insights/aiInsight.ts` and import from `route.ts`.

**This document uses Option B** — the helper file keeps `route.ts` focused on HTTP plumbing. If you prefer Option A, inline all helpers into `route.ts`.

```
app/
  api/
    insights/
      route.ts          ← HTTP handler only (GET)
lib/
  insights/
    aiInsight.ts        ← all data fetching, correlation, and AI call logic
    types.ts            ← InsightResponse, InsightApiResponse (optional separate file)
```

---

## 5. Full implementation

### 5.1 Imports and constants

```ts
// lib/insights/aiInsight.ts

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type { InsightResponse, InsightDataPoints } from './types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const DATA_WINDOW_DAYS = 14;
const CHAT_TURN_LIMIT = 20;
```

---

### 5.2 Helper: format chat history

```ts
// lib/insights/aiInsight.ts

interface ConversationRow {
  user_message: string;
  assistant_message: string;
  session_id: string;
  created_at: string;
}

export function formatChatHistory(
  conversations: ConversationRow[]
): { text: string; sessionCount: number } {
  if (!conversations.length) {
    return { text: 'None', sessionCount: 0 };
  }

  const sessionCount = new Set(conversations.map(c => c.session_id)).size;

  // Reverse so they're chronological for the prompt
  const text = [...conversations]
    .slice(0, CHAT_TURN_LIMIT)
    .reverse()
    .map(c => `User: ${c.user_message}\nLisa: ${c.assistant_message}`)
    .join('\n---\n');

  return { text, sessionCount };
}
```

**Fetch call** (goes inside the generation pipeline, Section 5.8):

```ts
const { data: chatHistory, error: chatError } = await supabaseAdmin
  .from('conversations')
  .select('user_message, assistant_message, session_id, created_at')
  .eq('user_id', userId.toString()) // conversations.user_id is text, not uuid
  .order('created_at', { ascending: false })
  .limit(CHAT_TURN_LIMIT);

if (chatError) console.error('[insights] chat fetch error:', chatError);
const { text: chatHistoryText, sessionCount: chatSessionCount } =
  formatChatHistory(chatHistory ?? []);
```

---

### 5.3 Helper: compute cross-symptom correlations

This runs entirely server-side before the prompt is built. The AI receives the pre-digested summary text, not raw log arrays.

```ts
// lib/insights/aiInsight.ts

interface SymptomLogRow {
  logged_at: string;
  severity: number;
  time_of_day: string | null;
  triggers: string[] | null;
  symptoms: { name: string } | null; // joined via select('*, symptoms(name)')
}

interface MoodRow {
  date: string;
  mood: number;
}

interface DayBucket {
  symptoms: SymptomLogRow[];
  mood?: number;
}

export interface CorrelationResult {
  avgSymptomsOnRough: number;   // avg symptom count on mood <= 2 days
  avgSymptomsOnGood: number;    // avg symptom count on mood >= 3 days
  coOccurrence: Record<string, Record<string, number>>;
  byDate: Map<string, DayBucket>;
  timeOfDayClusters: Record<string, string[]>; // symptom name → ['morning', 'morning', 'night']
}

export function computeCorrelations(
  symptomLogs: SymptomLogRow[],
  dailyMoods: MoodRow[]
): CorrelationResult {
  const byDate = new Map<string, DayBucket>();

  // Index symptoms by date
  symptomLogs.forEach(log => {
    const d = new Date(log.logged_at).toISOString().split('T')[0];
    if (!byDate.has(d)) byDate.set(d, { symptoms: [] });
    byDate.get(d)!.symptoms.push(log);
  });

  // Index moods by date
  dailyMoods.forEach(mood => {
    const d = new Date(mood.date).toISOString().split('T')[0];
    if (!byDate.has(d)) byDate.set(d, { symptoms: [] });
    byDate.get(d)!.mood = mood.mood;
  });

  // Mood–symptom correlation
  const roughDays = [...byDate.values()].filter(d => d.mood !== undefined && d.mood <= 2);
  const goodDays  = [...byDate.values()].filter(d => d.mood !== undefined && d.mood >= 3);

  const avg = (arr: DayBucket[]) =>
    arr.length ? arr.reduce((s, d) => s + d.symptoms.length, 0) / arr.length : 0;

  const avgSymptomsOnRough = avg(roughDays);
  const avgSymptomsOnGood  = avg(goodDays);

  // Co-occurrence matrix
  const coOccurrence: Record<string, Record<string, number>> = {};
  [...byDate.values()].forEach(({ symptoms }) => {
    if (symptoms.length < 2) return;
    symptoms.forEach(a => {
      symptoms.forEach(b => {
        const nameA = a.symptoms?.name;
        const nameB = b.symptoms?.name;
        if (!nameA || !nameB || nameA === nameB) return;
        coOccurrence[nameA] ??= {};
        coOccurrence[nameA][nameB] = (coOccurrence[nameA][nameB] ?? 0) + 1;
      });
    });
  });

  // Time-of-day clustering per symptom
  const timeOfDayClusters: Record<string, string[]> = {};
  symptomLogs.forEach(log => {
    const name = log.symptoms?.name;
    if (!name || !log.time_of_day) return;
    timeOfDayClusters[name] ??= [];
    timeOfDayClusters[name].push(log.time_of_day);
  });

  return { avgSymptomsOnRough, avgSymptomsOnGood, coOccurrence, byDate, timeOfDayClusters };
}
```

---

### 5.4 Helper: format correlations as prompt text

```ts
// lib/insights/aiInsight.ts

export function formatCorrelations(corr: CorrelationResult): string {
  const lines: string[] = [];

  // Mood–symptom correlation
  if (corr.avgSymptomsOnRough > corr.avgSymptomsOnGood + 0.5) {
    lines.push(
      `Mood and symptoms are correlated: rough mood days (mood ≤ 2) average ` +
      `${corr.avgSymptomsOnRough.toFixed(1)} symptoms vs ` +
      `${corr.avgSymptomsOnGood.toFixed(1)} on good days.`
    );
  }

  // Top 3 co-occurring pairs (min count = 2)
  const pairs: Array<[string, string, number]> = [];
  Object.entries(corr.coOccurrence).forEach(([a, bs]) => {
    Object.entries(bs).forEach(([b, count]) => {
      if (count >= 2) pairs.push([a, b, count]);
    });
  });
  pairs
    .sort((a, b) => b[2] - a[2])
    .slice(0, 3)
    .forEach(([a, b, count]) => {
      lines.push(`"${a}" and "${b}" appeared together ${count} times in the tracking window.`);
    });

  // Time-of-day patterns
  Object.entries(corr.timeOfDayClusters).forEach(([symptom, times]) => {
    if (times.length < 3) return;
    const freq: Record<string, number> = {};
    times.forEach(t => { freq[t] = (freq[t] ?? 0) + 1; });
    const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] / times.length >= 0.5) {
      lines.push(`"${symptom}" tends to occur predominantly in the ${dominant[0]} (${dominant[1]} of ${times.length} occurrences).`);
    }
  });

  return lines.length ? lines.join('\n') : 'No strong correlations detected yet.';
}
```

---

### 5.5 Helper: build the AI prompt

```ts
// lib/insights/aiInsight.ts

interface PromptInput {
  profile: any;
  currentLogs: SymptomLogRow[];
  previousLogs: SymptomLogRow[];
  dailyMoods: MoodRow[];
  chatHistoryText: string;
  correlationsText: string;
  symptomLogsCount: number;
  chatSessionCount: number;
}

export function buildPrompt(input: PromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    profile,
    currentLogs,
    previousLogs,
    dailyMoods,
    chatHistoryText,
    correlationsText,
    symptomLogsCount,
    chatSessionCount,
  } = input;

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt({
    profile,
    currentLogs,
    previousLogs,
    dailyMoods,
    chatHistoryText,
    correlationsText,
    symptomLogsCount,
    chatSessionCount,
  });

  return { systemPrompt, userPrompt };
}
```

The full system and user prompt text is in [Section 7](#7-system-prompt--full-text).

---

### 5.6 Helper: call OpenAI

```ts
// lib/insights/aiInsight.ts

export async function callOpenAIForInsight(
  systemPrompt: string,
  userPrompt: string
): Promise<InsightResponse> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty content');

  const parsed = JSON.parse(raw) as InsightResponse;

  // Always overwrite generatedAt server-side — never trust AI for timestamps
  parsed.generatedAt = new Date().toISOString();

  return parsed;
}
```

---

### 5.7 Helper: upsert to `user_insights`

```ts
// lib/insights/aiInsight.ts

export async function upsertInsight(
  userId: string,
  insight: InsightResponse,
  symptomLogsCount: number,
  chatSessionsCount: number
): Promise<void> {
  const { error } = await supabaseAdmin.from('user_insights').upsert(
    {
      user_id:            userId,
      insight:            insight,
      generated_at:       new Date().toISOString(),
      symptom_logs_count: symptomLogsCount,
      chat_sessions_count: chatSessionsCount,
      data_window_days:   DATA_WINDOW_DAYS,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[insights] upsert error:', error);
    throw error;
  }
}
```

The Supabase JS `.upsert()` with `onConflict: 'user_id'` maps to:

```sql
INSERT INTO user_insights (user_id, insight, generated_at, symptom_logs_count, chat_sessions_count, data_window_days)
VALUES ($1, $2, now(), $3, $4, 14)
ON CONFLICT (user_id) DO UPDATE SET
  insight              = EXCLUDED.insight,
  generated_at         = EXCLUDED.generated_at,
  symptom_logs_count   = EXCLUDED.symptom_logs_count,
  chat_sessions_count  = EXCLUDED.chat_sessions_count;
```

---

### 5.8 Helper: run full generation pipeline

This is the heavy function. It fetches all data, computes correlations, calls OpenAI, and upserts the result.

```ts
// lib/insights/aiInsight.ts

export async function generateAndPersistInsight(userId: string): Promise<InsightResponse> {
  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - DATA_WINDOW_DAYS); // 14 days ago

  const prevStart = new Date(now);
  prevStart.setDate(prevStart.getDate() - DATA_WINDOW_DAYS * 2); // 28 days ago

  // --- Parallel data fetches ---
  const [
    { data: profile },
    { data: currentLogs,  error: logsError },
    { data: previousLogs },
    { data: dailyMoods },
    { data: chatHistory,  error: chatError },
  ] = await Promise.all([
    supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single(),

    supabaseAdmin
      .from('symptom_logs')
      .select('*, symptoms(name)')
      .eq('user_id', userId)
      .gte('logged_at', start.toISOString())
      .order('logged_at', { ascending: false }),

    // Previous window for trend comparison
    supabaseAdmin
      .from('symptom_logs')
      .select('*, symptoms(name)')
      .eq('user_id', userId)
      .gte('logged_at', prevStart.toISOString())
      .lt('logged_at', start.toISOString())
      .order('logged_at', { ascending: false }),

    supabaseAdmin
      .from('daily_mood')
      .select('date, mood')
      .eq('user_id', userId)
      .gte('date', start.toISOString().split('T')[0])
      .order('date', { ascending: false }),

    supabaseAdmin
      .from('conversations')
      .select('user_message, assistant_message, session_id, created_at')
      .eq('user_id', userId.toString()) // conversations.user_id is text
      .order('created_at', { ascending: false })
      .limit(CHAT_TURN_LIMIT),
  ]);

  if (logsError) console.error('[insights] symptom_logs fetch error:', logsError);
  if (chatError)  console.error('[insights] conversations fetch error:', chatError);

  const logs     = currentLogs  ?? [];
  const prevLogs = previousLogs ?? [];
  const moods    = dailyMoods   ?? [];
  const chats    = chatHistory  ?? [];

  const correlations   = computeCorrelations(logs, moods);
  const correlationsText = formatCorrelations(correlations);
  const { text: chatHistoryText, sessionCount: chatSessionCount } = formatChatHistory(chats);

  const { systemPrompt, userPrompt } = buildPrompt({
    profile,
    currentLogs:     logs,
    previousLogs:    prevLogs,
    dailyMoods:      moods,
    chatHistoryText,
    correlationsText,
    symptomLogsCount:  logs.length,
    chatSessionCount,
  });

  const insight = await callOpenAIForInsight(systemPrompt, userPrompt);

  // Ensure dataPoints are accurate (override anything AI put there)
  insight.dataPoints = {
    symptomLogs:  logs.length,
    chatSessions: chatSessionCount,
    daysWindow:   DATA_WINDOW_DAYS,
  };

  await upsertInsight(userId, insight, logs.length, chatSessionCount);

  return insight;
}
```

---

### 5.9 GET handler — final flow

```ts
// app/api/insights/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateAndPersistInsight } from '@/lib/insights/aiInsight';
import type { InsightApiResponse } from '@/lib/insights/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  // 1. Authenticate
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === 'true';

  // 2. Query user_insights for this user
  const { data: existingRow, error: readError } = await supabase
    .from('user_insights')
    .select('insight, generated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) {
    console.error('[insights] read error:', readError);
  }

  const now = Date.now();

  if (existingRow && !forceRefresh) {
    const generatedAt = new Date(existingRow.generated_at).getTime();
    const ageMs       = now - generatedAt;

    // 3. Fresh cache hit — return immediately
    if (ageMs < CACHE_TTL_MS) {
      const body: InsightApiResponse = {
        insight: existingRow.insight,
        cached:  true,
      };
      return NextResponse.json(body);
    }

    // 4. Stale — return old data immediately, regenerate in background
    // Using fire-and-forget; wrap in void to satisfy TS no-floating-promises if linting
    void generateAndPersistInsight(user.id).catch(err =>
      console.error('[insights] background regeneration failed:', err)
    );

    const body: InsightApiResponse = {
      insight: existingRow.insight,
      cached:  true,
      stale:   true,
    };
    return NextResponse.json(body);
  }

  // 5. No row yet, OR ?refresh=true — full blocking generation
  try {
    const insight = await generateAndPersistInsight(user.id);
    const body: InsightApiResponse = {
      insight,
      cached: false,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[insights] generation error:', err);
    return NextResponse.json(
      { error: 'Failed to generate insight' },
      { status: 500 }
    );
  }
}
```

**Flow summary:**

```
GET /api/insights
│
├── Auth check → 401 if not signed in
│
├── Query user_insights WHERE user_id = me
│
├── Row exists AND age < 24h AND no ?refresh=true
│   └── Return { insight, cached: true }
│
├── Row exists AND age >= 24h AND no ?refresh=true
│   ├── Fire-and-forget: generateAndPersistInsight() in background
│   └── Return { insight (stale), cached: true, stale: true }
│
└── No row OR ?refresh=true
    ├── Fetch all data (parallel)
    ├── Compute correlations
    ├── Call OpenAI (gpt-4o, json_object mode)
    ├── Upsert to user_insights
    └── Return { insight (fresh), cached: false }
```

---

## 6. SQL reference

### Create `user_insights` table

Run this once in the Supabase SQL editor before deploying:

```sql
CREATE TABLE IF NOT EXISTS public.user_insights (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid         UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  insight             jsonb        NOT NULL,
  generated_at        timestamptz  NOT NULL DEFAULT now(),
  symptom_logs_count  int          NOT NULL DEFAULT 0,
  chat_sessions_count int          NOT NULL DEFAULT 0,
  data_window_days    int          NOT NULL DEFAULT 14
);

-- RLS
ALTER TABLE public.user_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own insights"
  ON public.user_insights FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically; no insert policy needed for server-side writes.
-- If you want to support client-side reads via the anon key, keep the SELECT policy above.
```

### Upsert query (reference — Supabase JS handles this)

```sql
INSERT INTO public.user_insights
  (user_id, insight, generated_at, symptom_logs_count, chat_sessions_count, data_window_days)
VALUES
  ($1, $2, now(), $3, $4, 14)
ON CONFLICT (user_id) DO UPDATE SET
  insight              = EXCLUDED.insight,
  generated_at         = EXCLUDED.generated_at,
  symptom_logs_count   = EXCLUDED.symptom_logs_count,
  chat_sessions_count  = EXCLUDED.chat_sessions_count;
```

---

## 7. System prompt — full text

Two functions: `buildSystemPrompt()` and `buildUserPrompt(...)`. Place both in `lib/insights/aiInsight.ts`.

```ts
function buildSystemPrompt(): string {
  return `You are Menolisa's insight engine. Your job is to analyse a woman's perimenopause/menopause tracking data and produce a personalised, warm, medically-grounded insight.

## TONE
- Write like a trusted friend who also happens to understand hormones deeply.
- Lead with recognition before advice. She needs to feel witnessed before she is ready to act.
- The FIRST sentence of patternHeadline should make her feel understood, not instructed.
- Avoid clinical language. Prefer "your body is signalling" over "symptom presentation suggests".
- Sentence case only — no ALL CAPS in response text.
- Never use the word "journey".

## OUTPUT FORMAT
You must return valid JSON matching this exact schema. No markdown, no extra keys.

{
  "patternHeadline": "string — one sentence, empathetic, names the dominant pattern",
  "why": "string — 2-3 sentences explaining the hormonal/physiological mechanism in plain language",
  "whatsWorking": "string or null — if there is positive evidence in the data, name it; otherwise null",
  "actionSteps": {
    "easy":     "string — one concrete action for when she has almost no energy",
    "medium":   "string — one concrete action for when she has a bit more capacity",
    "advanced": "string — one concrete action for when she wants to go deeper"
  },
  "doctorNote": "string — specific patterns and questions worth raising at her next appointment; treat this as ammunition she can bring in",
  "trend":      "improving | worsening | stable",
  "whyThisMatters": "string — one sentence on why addressing this now matters for her long-term health",
  "generatedAt": "string — current ISO timestamp",
  "dataPoints": {
    "symptomLogs":  number,
    "chatSessions": number,
    "daysWindow":   14
  }
}

## ACTION STEP GUIDANCE
- easy:     The step she can do lying in bed or in under 2 minutes. Think: breathwork, adjusting one thing, a single question to ask herself.
- medium:   Requires a bit of effort but no major behaviour change. Think: one dietary swap, a 10-minute walk pattern, a sleep hygiene tweak.
- advanced: For when she is ready to invest. Think: a supplement to research with her doctor, a tracking experiment, a lifestyle shift.

## DOCTOR NOTE GUIDANCE
Frame the doctorNote as specific talking points and patterns she can quote at an appointment — not generic advice to "see a doctor". Example: "In the last 14 days, hot flashes clustered in the evening and night on days when sleep quality was reported low. Worth asking whether progesterone timing could be adjusted."

## TREND LOGIC
- "improving": symptom frequency or severity is meaningfully lower in the last 7 days vs the 7 days before
- "worsening":  symptom frequency or severity is meaningfully higher
- "stable":     no clear directional change

## IMPORTANT
- generatedAt in your response will be overwritten server-side. Include any valid ISO string as a placeholder.
- dataPoints values must match the DATA COUNTS provided to you in the user message.`;
}
```

```ts
function buildUserPrompt(input: {
  profile: any;
  currentLogs: any[];
  previousLogs: any[];
  dailyMoods: any[];
  chatHistoryText: string;
  correlationsText: string;
  symptomLogsCount: number;
  chatSessionCount: number;
}): string {
  const {
    profile,
    currentLogs,
    previousLogs,
    dailyMoods,
    chatHistoryText,
    correlationsText,
    symptomLogsCount,
    chatSessionCount,
  } = input;

  const profileText = profile
    ? `Name: ${profile.name ?? 'unknown'}
Age band: ${profile.age_band ?? 'unknown'}
Top concerns: ${(profile.top_problems ?? []).join(', ') || 'none listed'}
Severity self-rating: ${profile.severity ?? 'unknown'}
Symptom timing: ${profile.timing ?? 'unknown'}
Things tried: ${(profile.tried_options ?? []).join(', ') || 'none listed'}
Goal: ${profile.goal ?? 'not specified'}`
    : 'No profile data available.';

  const formatLog = (log: any) =>
    `[${log.logged_at?.split('T')[0]} ${log.time_of_day ?? ''}] ${log.symptoms?.name ?? 'Unknown'} severity ${log.severity}${log.triggers?.length ? ` triggers: ${log.triggers.join(', ')}` : ''}${log.notes ? ` — "${log.notes}"` : ''}`;

  const currentLogsText  = currentLogs.length  ? currentLogs.map(formatLog).join('\n')  : 'No logs in this window.';
  const previousLogsText = previousLogs.length ? previousLogs.map(formatLog).join('\n') : 'No logs in previous window.';

  const moodsText = dailyMoods.length
    ? dailyMoods.map(m => `${m.date}: mood ${m.mood}/4`).join('\n')
    : 'No mood data.';

  return `WOMAN'S PROFILE:
${profileText}

SYMPTOM LOGS — LAST 14 DAYS (current window):
${currentLogsText}

SYMPTOM LOGS — DAYS 15–28 (previous window, for trend comparison):
${previousLogsText}

MOOD LOG — LAST 14 DAYS:
${moodsText}

RECENT CHAT HISTORY (last sessions with Lisa):
${chatHistoryText}

COMPUTED CORRELATIONS:
${correlationsText}

DATA COUNTS (include these exact values in your dataPoints response field):
- symptomLogs: ${symptomLogsCount}
- chatSessions: ${chatSessionCount}
- daysWindow: 14

Generate the insight JSON now.`;
}
```

---

## 8. Environment variables

These must be set in the Next.js app's environment (`.env.local` for local dev, Vercel/hosting env vars for production):

| Variable | Where it comes from |
|----------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API (secret — server only) |
| `OPENAI_API_KEY` | OpenAI dashboard |

`SUPABASE_SERVICE_ROLE_KEY` must **never** be exposed to the client. It is only used in server-side code (`lib/insights/aiInsight.ts` and `app/api/insights/route.ts`).

---

## 9. Testing checklist

### Unit (manual in dev)

- [ ] `GET /api/insights` with no prior row → generates fresh insight, `cached: false`
- [ ] `GET /api/insights` immediately after → returns same data, `cached: true`, no `stale`
- [ ] Wait 25h (or manually set `generated_at` to 25h ago in Supabase) → returns `cached: true, stale: true` and triggers background refresh
- [ ] `GET /api/insights?refresh=true` on fresh cache → forces regeneration, `cached: false`
- [ ] `GET /api/insights` with no auth cookie → `401 Unauthorized`
- [ ] User with 0 symptom logs → graceful fallback, no crash
- [ ] User with no chat history → `chatHistoryText = 'None'`, `chatSessions = 0`
- [ ] `conversations.user_id` text cast → `.eq('user_id', user.id.toString())` does not throw

### Integration

- [ ] `user_insights` row is created after first generation
- [ ] `user_insights` row is updated (not duplicated) on second generation
- [ ] `insight` jsonb column contains all required fields including `generatedAt` and `dataPoints`
- [ ] `generatedAt` in the DB matches server time, not AI-hallucinated time

### Edge cases

- [ ] OpenAI returns malformed JSON → 500 with error message, nothing written to DB
- [ ] Supabase upsert fails → error logged, 500 returned to client
- [ ] `profile` is null (user deleted their profile data) → prompt includes "No profile data available." and generation still succeeds

---

## 10. AI image suggestion for the insight card

If the web app insight card needs a visual accent image, use this prompt with your image generation tool of choice (DALL-E 3, Midjourney, etc.):

> A soft watercolor illustration of a woman seen from behind, sitting quietly and looking out a window at golden morning light. Botanical elements (lavender, sage) frame the edges softly. Palette: warm blush pink, sage green, soft cream. No face visible. Calm, introspective, empowering. Landscape 16:9.

Recommended placement: as a blurred/low-opacity background or a decorative strip at the top of the insight card. Do not place it where it competes visually with the `patternHeadline` text.

---

*End of implementation plan. All changes are scoped to `app/api/insights/route.ts` and `lib/insights/aiInsight.ts`. No schema changes beyond the single `CREATE TABLE` in Section 6. No new dependencies beyond `openai` and `@supabase/supabase-js`, which are presumably already installed.*
