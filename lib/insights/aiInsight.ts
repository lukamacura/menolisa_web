/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { InsightResponse, InsightDataPoints } from './types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const DATA_WINDOW_DAYS = 14;
const CHAT_TURN_LIMIT = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationRow {
  user_message: string;
  assistant_message: string;
  session_id: string;
  created_at: string;
}

interface SymptomLogRow {
  logged_at: string;
  severity: number;
  time_of_day: string | null;
  triggers: string[] | null;
  notes?: string | null;
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
  avgSymptomsOnRough: number;
  avgSymptomsOnGood: number;
  coOccurrence: Record<string, Record<string, number>>;
  byDate: Map<string, DayBucket>;
  timeOfDayClusters: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Helper: format chat history
// ---------------------------------------------------------------------------

export function formatChatHistory(
  conversations: ConversationRow[]
): { text: string; sessionCount: number } {
  if (!conversations.length) {
    return { text: 'None', sessionCount: 0 };
  }

  const sessionCount = new Set(conversations.map(c => c.session_id)).size;

  const text = [...conversations]
    .slice(0, CHAT_TURN_LIMIT)
    .reverse()
    .map(c => `User: ${c.user_message}\nLisa: ${c.assistant_message}`)
    .join('\n---\n');

  return { text, sessionCount };
}

// ---------------------------------------------------------------------------
// Helper: compute cross-symptom correlations
// ---------------------------------------------------------------------------

export function computeCorrelations(
  symptomLogs: SymptomLogRow[],
  dailyMoods: MoodRow[]
): CorrelationResult {
  const byDate = new Map<string, DayBucket>();

  symptomLogs.forEach(log => {
    const d = new Date(log.logged_at).toISOString().split('T')[0];
    if (!byDate.has(d)) byDate.set(d, { symptoms: [] });
    byDate.get(d)!.symptoms.push(log);
  });

  dailyMoods.forEach(mood => {
    const d = new Date(mood.date).toISOString().split('T')[0];
    if (!byDate.has(d)) byDate.set(d, { symptoms: [] });
    byDate.get(d)!.mood = mood.mood;
  });

  const roughDays = [...byDate.values()].filter(d => d.mood !== undefined && d.mood <= 2);
  const goodDays  = [...byDate.values()].filter(d => d.mood !== undefined && d.mood >= 3);

  const avg = (arr: DayBucket[]) =>
    arr.length ? arr.reduce((s, d) => s + d.symptoms.length, 0) / arr.length : 0;

  const avgSymptomsOnRough = avg(roughDays);
  const avgSymptomsOnGood  = avg(goodDays);

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

  const timeOfDayClusters: Record<string, string[]> = {};
  symptomLogs.forEach(log => {
    const name = log.symptoms?.name;
    if (!name || !log.time_of_day) return;
    timeOfDayClusters[name] ??= [];
    timeOfDayClusters[name].push(log.time_of_day);
  });

  return { avgSymptomsOnRough, avgSymptomsOnGood, coOccurrence, byDate, timeOfDayClusters };
}

// ---------------------------------------------------------------------------
// Helper: format correlations as prompt text
// ---------------------------------------------------------------------------

export function formatCorrelations(corr: CorrelationResult): string {
  const lines: string[] = [];

  if (corr.avgSymptomsOnRough > corr.avgSymptomsOnGood + 0.5) {
    lines.push(
      `Mood and symptoms are correlated: rough mood days (mood ≤ 2) average ` +
      `${corr.avgSymptomsOnRough.toFixed(1)} symptoms vs ` +
      `${corr.avgSymptomsOnGood.toFixed(1)} on good days.`
    );
  }

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

// ---------------------------------------------------------------------------
// Helper: build the AI prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are Menolisa's insight engine. Your job is to analyse a woman's perimenopause/menopause tracking data and produce a personalised, warm, medically-grounded insight.

## TONE
- Write like a trusted friend who also happens to understand hormones deeply.
- Lead with recognition before advice. She needs to feel witnessed before she is ready to act.
- The FIRST sentence of patternHeadline should make her feel understood, not instructed.
- Avoid clinical language. Prefer "your body is signalling" over "symptom presentation suggests".
- Sentence case only — no ALL CAPS in response text.
- Never use the word "journey".

## BREVITY (mobile UI)
The app shows your text in compact cards. Keep every field short and scannable.
- patternHeadline: max ~90 characters; one clear sentence; still warm and specific.
- why: exactly 1–2 short sentences, combined max ~220 characters; plain language only.
- actionSteps (each): max ~85 characters; one imperative phrase each, no filler.
- doctorNote: max ~240 characters; 1–2 concrete talking points she can quote.
- whyThisMatters: max ~120 characters; one tight sentence.

## OUTPUT FORMAT
You must return valid JSON matching this exact schema. No markdown, no extra keys.

{
  "patternHeadline": "string — one sentence, empathetic, names the dominant pattern (keep short; see BREVITY)",
  "why": "string — 1-2 short sentences, mechanism in plain language (see BREVITY)",
  "whatsWorking": "string or null — if there is positive evidence in the data, name it in one short sentence; otherwise null",
  "actionSteps": {
    "easy":     "string — one concrete action for when she has almost no energy (short; see BREVITY)",
    "medium":   "string — one concrete action for when she has a bit more capacity (short; see BREVITY)",
    "advanced": "string — one concrete action for when she wants to go deeper (short; see BREVITY)"
  },
  "doctorNote": "string — specific patterns/questions for her next appointment; short bullet-style phrasing (see BREVITY)",
  "trend":      "improving | worsening | stable",
  "whyThisMatters": "string — one short sentence on long-term relevance (see BREVITY)",
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

function buildUserPrompt(input: {
  profile: any;
  currentLogs: SymptomLogRow[];
  previousLogs: SymptomLogRow[];
  dailyMoods: MoodRow[];
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

  const formatLog = (log: SymptomLogRow) =>
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

// ---------------------------------------------------------------------------
// Helper: call OpenAI
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: upsert to user_insights
// ---------------------------------------------------------------------------

export async function upsertInsight(
  userId: string,
  insight: InsightResponse,
  symptomLogsCount: number,
  chatSessionsCount: number
): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('user_insights').upsert(
    {
      user_id:             userId,
      insight:             insight,
      generated_at:        new Date().toISOString(),
      symptom_logs_count:  symptomLogsCount,
      chat_sessions_count: chatSessionsCount,
      data_window_days:    DATA_WINDOW_DAYS,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('[insights] upsert error:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline: fetch data, compute correlations, call AI, persist
// ---------------------------------------------------------------------------

export async function generateAndPersistInsight(userId: string): Promise<InsightResponse> {
  const supabaseAdmin = getSupabaseAdmin();

  const now   = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - DATA_WINDOW_DAYS);

  const prevStart = new Date(now);
  prevStart.setDate(prevStart.getDate() - DATA_WINDOW_DAYS * 2);

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
      .eq('user_id', userId.toString()) // conversations.user_id is text, not uuid
      .order('created_at', { ascending: false })
      .limit(CHAT_TURN_LIMIT),
  ]);

  if (logsError) console.error('[insights] symptom_logs fetch error:', logsError);
  if (chatError)  console.error('[insights] conversations fetch error:', chatError);

  const logs     = (currentLogs  ?? []) as SymptomLogRow[];
  const prevLogs = (previousLogs ?? []) as SymptomLogRow[];
  const moods    = (dailyMoods   ?? []) as MoodRow[];
  const chats    = (chatHistory  ?? []) as ConversationRow[];

  const correlations     = computeCorrelations(logs, moods);
  const correlationsText = formatCorrelations(correlations);
  const { text: chatHistoryText, sessionCount: chatSessionCount } = formatChatHistory(chats);

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt({
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

  // Ensure dataPoints are accurate — override anything AI put there
  insight.dataPoints = {
    symptomLogs:  logs.length,
    chatSessions: chatSessionCount,
    daysWindow:   DATA_WINDOW_DAYS,
  } satisfies import('./types').InsightDataPoints;

  await upsertInsight(userId, insight, logs.length, chatSessionCount);

  return insight;
}
