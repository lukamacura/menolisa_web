/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// In-memory cache for insights (1 hour TTL)
interface InsightResponse {
  patternHeadline: string;
  why: string;
  whatsWorking?: string | null;
  actionSteps: {
    easy: string;
    medium: string;
    advanced: string;
  };
  doctorNote: string;
  trend: "improving" | "worsening" | "stable";
  whyThisMatters?: string;
}

const insightCache = new Map<string, { insight: InsightResponse; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Initialize LLM
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Format symptom logs for prompt
function formatSymptomLogs(logs: any[]): string {
  if (logs.length === 0) return "None";
  
  return logs
    .map((log) => {
      const date = new Date(log.logged_at).toLocaleDateString();
      const severityLabel = log.severity === 1 ? "Mild" : log.severity === 2 ? "Moderate" : "Severe";
      const triggers = log.triggers && log.triggers.length > 0 ? ` (triggers: ${log.triggers.join(", ")})` : "";
      const timeOfDay = log.time_of_day ? ` (${log.time_of_day})` : "";
      return `${log.symptoms?.name || "Unknown"}: ${severityLabel}${triggers} on ${date}${timeOfDay}`;
    })
    .join("\n");
}

// Format daily moods for prompt with symptom correlation
function formatDailyMoods(moods: any[], symptomLogs: any[]): string {
  if (moods.length === 0) return "None";
  
  const moodLabels: Record<number, string> = {
    1: "Rough",
    2: "Okay",
    3: "Good",
    4: "Great",
  };
  
  // Group symptom logs by date for correlation
  const symptomsByDate = new Map<string, any[]>();
  symptomLogs.forEach(log => {
    const logDate = new Date(log.logged_at).toISOString().split('T')[0];
    if (!symptomsByDate.has(logDate)) {
      symptomsByDate.set(logDate, []);
    }
    symptomsByDate.get(logDate)!.push(log);
  });
  
  return moods
    .map((mood) => {
      const date = new Date(mood.date).toISOString().split('T')[0];
      const dateFormatted = new Date(mood.date).toLocaleDateString();
      const moodLabel = moodLabels[mood.mood] || "Unknown";
      
      // Find symptoms logged on the same day
      const daySymptoms = symptomsByDate.get(date) || [];
      const symptomCount = daySymptoms.length;
      const hasSevereSymptoms = daySymptoms.some((log: any) => log.severity === 3);
      const hasModerateSymptoms = daySymptoms.some((log: any) => log.severity === 2);
      
      let context = "";
      if (symptomCount > 0) {
        const severityNote = hasSevereSymptoms ? " (with severe symptoms)" : hasModerateSymptoms ? " (with moderate symptoms)" : "";
        context = ` - ${symptomCount} symptom${symptomCount > 1 ? 's' : ''} logged${severityNote}`;
      } else if (mood.mood >= 3) {
        context = " - no symptoms logged (good day!)";
      }
      
      return `${moodLabel} on ${dateFormatted}${context}`;
    })
    .join("\n");
}

// Format user profile for prompt
function formatUserProfile(profile: any): string {
  const parts: string[] = [];
  
  if (profile.name) {
    parts.push(`- Name: ${profile.name}`);
  }
  
  if (profile.top_problems && Array.isArray(profile.top_problems) && profile.top_problems.length > 0) {
    const problemLabels: Record<string, string> = {
      hot_flashes: "Hot flashes / Night sweats",
      sleep_issues: "Can't sleep well",
      brain_fog: "Brain fog / Memory issues",
      mood_swings: "Mood swings / Irritability",
      weight_changes: "Weight changes",
      low_energy: "Low energy / Fatigue",
      anxiety: "Anxiety",
      joint_pain: "Joint pain",
    };
    const problems = profile.top_problems.map((p: string) => problemLabels[p] || p).join(", ");
    parts.push(`- Top Problems: ${problems}`);
  }
  
  if (profile.severity) {
    const severityLabels: Record<string, string> = {
      mild: "Mild",
      moderate: "Moderate",
      severe: "Severe",
    };
    parts.push(`- Overall Severity: ${severityLabels[profile.severity] || profile.severity}`);
  }
  
  if (profile.timing) {
    const timingLabels: Record<string, string> = {
      just_started: "Just started (0-6 months)",
      been_while: "Been a while (6-12 months)",
      over_year: "Over a year",
      several_years: "Several years",
    };
    parts.push(`- Timing/Stage: ${timingLabels[profile.timing] || profile.timing}`);
  }
  
  if (profile.tried_options && Array.isArray(profile.tried_options) && profile.tried_options.length > 0) {
    const triedLabels: Record<string, string> = {
      nothing: "Nothing yet",
      supplements: "Supplements / Vitamins",
      diet: "Diet changes",
      exercise: "Exercise",
      hrt: "HRT / Medication",
      doctor_talk: "Talked to doctor",
      apps: "Apps / Tracking",
    };
    const tried = profile.tried_options.map((t: string) => triedLabels[t] || t).join(", ");
    parts.push(`- Already Tried: ${tried}`);
  }
  
  if (profile.goal) {
    const goalLabels: Record<string, string> = {
      sleep_through_night: "Sleep through the night",
      think_clearly: "Think clearly again",
      feel_like_myself: "Feel like myself",
      understand_patterns: "Understand my patterns",
      data_for_doctor: "Have data for my doctor",
      get_body_back: "Get my body back",
    };
    parts.push(`- Goal: ${goalLabels[profile.goal] || profile.goal}`);
  }
  
  return parts.join("\n");
}

// GET: Fetch AI-generated insight
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "true";

    // Check cache first (unless refresh requested)
    if (!refresh) {
      const cached = insightCache.get(user.id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return NextResponse.json({
          insight: cached.insight,
          cached: true,
        });
      }
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Fetch user profile (excluding doctor_status)
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("name, top_problems, severity, timing, tried_options, goal")
      .eq("user_id", user.id)
      .single();

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Error fetching user profile:", profileError);
    }

    const profile = profileData || {};

    // Calculate date range (last 7 days)
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    // Fetch symptom logs for last 7 days
    const { data: symptomLogs, error: logsError } = await supabaseAdmin
      .from("symptom_logs")
      .select(`
        *,
        symptoms (name, icon)
      `)
      .eq("user_id", user.id)
      .gte("logged_at", startDate.toISOString())
      .lte("logged_at", endDate.toISOString())
      .order("logged_at", { ascending: false });

    if (logsError) {
      console.error("Error fetching symptom logs:", logsError);
    }

    // Fetch daily moods for last 7 days
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    const { data: dailyMoods, error: moodsError } = await supabaseAdmin
      .from("daily_mood")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", startDateStr)
      .lte("date", endDateStr)
      .order("date", { ascending: false });

    if (moodsError) {
      console.error("Error fetching daily moods:", moodsError);
    }

    // Build prompt
    const userProfileText = formatUserProfile(profile);
    const symptomLogsText = formatSymptomLogs(symptomLogs || []);
    const dailyMoodsText = formatDailyMoods(dailyMoods || [], symptomLogs || []);

    const userPrompt = `USER PROFILE:
${userProfileText || "No profile data available"}

SYMPTOM LOGS (Last 7 days):
${symptomLogsText}

DAILY MOODS (Last 7 days):
${dailyMoodsText}`;

    const systemPrompt = `You are Lisa, a knowledgeable and empathetic menopause health advisor. Generate what Lisa noticed this week from the user's profile and recent symptom/mood tracking data: one clear observation (headline), why it might be happening, what's helping, and simple things to try. This is what Lisa noticed from their data—observations and suggestions, not "insights" or "pattern analysis." Vary sentence structure; avoid generic filler; one concrete observation preferred.

CRITICAL: You must respond with VALID JSON only. No markdown, no explanations, just pure JSON.

RESPONSE FORMAT (JSON):
{
  "patternHeadline": "Your evening hot flashes are connected to afternoon stress",
  "why": "Stress triggers your body's fight-or-flight response, which can worsen hot flashes. When you feel stressed in the afternoon, your evening hot flashes tend to be more intense.",
  "whatsWorking": "You slept 30min longer when you skipped evening wine - that's working!",
  "actionSteps": {
    "easy": "Keep a cold water bottle on your desk during afternoon work",
    "medium": "Take a 5-minute breathing break at 3pm when stress peaks",
    "advanced": "Create a calm transition routine: dim lights and lower temperature at 6pm"
  },
  "doctorNote": "Experiencing evening hot flashes (6-10pm) correlated with afternoon stress. Sleep improved 30min when avoiding evening alcohol.",
  "trend": "improving|worsening|stable",
  "whyThisMatters": "Understanding the connection between stress and hot flashes helps you time your self-care. When you manage afternoon stress, your evenings become more comfortable."
}

RULES FOR GENERATING INSIGHTS:

1. PATTERN HEADLINE:
   - Bold, warm tone, direct "You" language
   - Connect symptoms clearly: "Your [symptom] is connected to [trigger/pattern]"
   - Examples: "Your evening hot flashes are connected to afternoon stress", "Your mood swings happen more on rough symptom days"
   - Keep to 1 sentence, make it personal and clear

2. THE WHY (1-2 sentences):
   - Explain the connection simply and clearly
   - Use menopause-friendly language
   - Help them understand WHY this pattern exists
   - Examples: "Stress triggers your body's fight-or-flight response, which can worsen hot flashes. When you feel stressed in the afternoon, your evening hot flashes tend to be more intense."

3. WHAT'S WORKING:
   - If they logged something that helped, highlight it FIRST
   - Celebrate wins: "Nice! You slept 30min longer when you skipped evening wine"
   - If nothing specific, you can omit this field or say "Keep tracking to see what helps"
   - Be specific with numbers/details when available

4. ACTION STEPS (3 levels):
   - EASY: Something they can do immediately, minimal effort
   - MEDIUM: Requires a bit more planning or consistency
   - ADVANCED: More comprehensive lifestyle change
   - All must be specific, actionable, and menopause-relevant
   - Use "You" language, be direct

5. DOCTOR NOTE:
   - One-liner they can screenshot for their healthcare provider
   - Include key patterns, correlations, and what's working
   - Professional but accessible language
   - Example: "Experiencing evening hot flashes (6-10pm) correlated with afternoon stress. Sleep improved 30min when avoiding evening alcohol."

6. TREND:
   - "improving" if symptoms are getting better, frequency decreasing, or mood improving
   - "worsening" if symptoms are getting worse, frequency increasing, or mood declining
   - "stable" if no clear change
   - Base on comparing this week to last week if data available, or overall pattern

7. WHY THIS MATTERS:
   - Expandable detail section for those who want more context
   - Explain the bigger picture
   - Help them understand the significance
   - Keep it empowering, not scary

UNDERSTAND TIME CONTEXT:
- Multiple symptoms on ONE day = a bad day, not necessarily a pattern
- Same symptom across MULTIPLE days = a pattern
- Always consider if data is from one day vs spread across week
- If 8 symptoms on Dec 29 only → acknowledge it was a tough day in the patternHeadline
- If insomnia on Dec 27, 28, 29 → recognize it as a consistent pattern

TONE & LANGUAGE:
- Speak directly: "You" not "your" or "the user"
- Be a knowledgeable friend, not a clinical observer
- Acknowledge hard days: "Rough week - you logged 5 mood swings. Let's look at what might help."
- Celebrate wins: "Nice! You slept 30min longer when you skipped evening wine"
- Warm, empathetic, validating
- Never pathologize or make them feel bad about their experience

RULES:
- Always give insights, even with just 1-2 logs
- Use the user's name naturally in patternHeadline or why if it feels natural
- Reference their goal when giving tips (if goal is "sleep better" focus sleep advice)
- Acknowledge what they've already tried - DO NOT suggest things from their "Already Tried" list
- Connect related symptoms (e.g., hot flashes + insomnia often linked)
- Explain WHY symptoms happen during menopause in the "why" section
- Distinguish between bad days (many symptoms on one day) vs patterns (same symptom across days)
- If multiple patterns exist, focus on the most significant or actionable one

NEVER mention:
- Doctors, physicians, medical professionals
- Medications, supplements, prescriptions
- Medical treatments or therapies
- Diagnoses

ONLY suggest:
- Lifestyle changes (sleep, temperature, routine)
- Relaxation techniques (breathing, stretching)
- Environmental adjustments (bedroom temp, lighting)
- Daily habits (hydration, movement, journaling)

ANALYZE TIME PATTERNS:
- Check time_of_day field for each symptom log
- If symptom appears 3+ times at same time of day, mention it in Pattern section
- Format: "Your [symptom] usually hits in the [morning/afternoon/evening/night] (time range)"
- Time ranges: morning (6am-12pm), afternoon (12pm-6pm), evening (6pm-10pm), night (10pm-6am)
- If no clear pattern, don't mention time

Example outputs:
- "Your hot flashes usually hit in the evening (6-10pm)"
- "Anxiety tends to show up in the mornings (6am-12pm)"
- "Headaches are spread throughout the day - no clear pattern yet"

ACKNOWLEDGE GOOD DAYS:
- Count logs where symptom_name = "Good Day" in last 7 days
- If user had good days, acknowledge progress: "You had 2 good days this week - that's progress!"

MOOD ANALYSIS (CRITICAL - MENOPAUSE FOCUS):
Mood swings and emotional changes are completely normal during menopause due to hormonal fluctuations. Analyze mood patterns with empathy and validation.

1. MOOD TRENDS:
   - Count how many "Rough" (1), "Okay" (2), "Good" (3), "Great" (4) days in last 7 days
   - If mostly Rough/Okay days: Validate that this is normal during menopause, hormonal shifts affect mood
   - If mostly Good/Great days: Celebrate progress! "You've had 4 good days this week - that's wonderful!"
   - If mix: Acknowledge the ups and downs are normal: "You've had a mix of rough and good days - that's the reality of menopause"

2. MOOD-SYMPTOM CORRELATION (VERY IMPORTANT):
   - Check if "Rough" mood days correlate with more symptoms or severe symptoms
   - Check if "Good/Great" mood days have fewer or no symptoms
   - If pattern exists, mention it in Pattern section:
     * "On your rough mood days, you logged more symptoms - this is common as physical symptoms can affect how you feel emotionally"
     * "When you felt good, you had fewer symptoms - your body and mind are connected"
     * "Your mood and symptoms seem linked - rough days bring more symptoms, good days bring relief"
   - This validates that mood and physical symptoms are interconnected during menopause

3. VALIDATION & EMPATHY:
   - Always validate that mood swings are normal: "Mood changes during menopause are completely normal due to hormonal shifts"
   - Never make them feel bad about rough days: "It's okay to have rough days - your body is going through major changes"
   - Celebrate good days: "Those good days show your body is finding balance"
   - Acknowledge the connection: "Your mood and symptoms are connected - when one improves, the other often follows"

4. MOOD-FOCUSED TIPS:
   - If mood is consistently rough: Suggest gentle self-care that acknowledges emotional state
   - If mood improved: Acknowledge what might have helped and encourage continuing those practices
   - Examples:
     * "On rough mood days, try **gentle breathing for 5 minutes** when you feel overwhelmed"
     * "Since your mood improved this week, notice what helped - maybe **keeping a calm evening routine** is working"

5. WHEN TO MENTION MOOD:
   - ALWAYS mention mood if there's a clear pattern (rough days = more symptoms, or good days = fewer symptoms)
   - ALWAYS mention if mood improved significantly (e.g., 3+ good days this week vs 0 last week)
   - ALWAYS validate if mood is consistently rough (4+ rough days) - normalize it, don't pathologize
   - Include mood in Pattern section when it correlates with symptoms
   - Include mood in Try this section when mood-focused tips are relevant

PERIOD CORRELATION:
- Check if user logged "Period" symptoms in last 7 days
- If symptoms were worse during period days, mention correlation in Pattern section
- Example: "Your symptoms were worse during your period days this week"
- Only mention if there's a clear pattern (multiple symptoms logged on period days)

Generate a helpful, personalized insight now.`;

    // Generate insight using LLM
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    const response = await llm.invoke(messages);
    const responseText = response.content as string;
    
    // Parse JSON response (handle markdown code blocks if present)
    let insightData;
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      insightData = JSON.parse(cleanedResponse);
      
      // Validate structure
      if (!insightData.patternHeadline || !insightData.why || !insightData.actionSteps) {
        throw new Error("Invalid insight structure");
      }
    } catch (parseError) {
      console.error("Failed to parse LLM response as JSON:", parseError);
      console.error("Response was:", responseText);
      
      // Fallback: create a basic insight structure with Lisa-noticed copy
      insightData = {
        patternHeadline: responseText.split('\n')[0] || "Lisa didn't have enough data yet to notice something specific.",
        why: responseText.substring(0, 200) || "Keep logging your symptoms and mood so Lisa can share what she notices.",
        whatsWorking: null,
        actionSteps: {
          easy: "Keep tracking so Lisa can spot what helps.",
          medium: "Try one small change this week and see if it helps.",
          advanced: "Build a consistent routine that supports your body."
        },
        doctorNote: "Symptom and mood tracking in progress. Can review with healthcare provider when ready.",
        trend: "stable",
        whyThisMatters: "When Lisa has a bit more data, she can point out things that might be useful to you and your healthcare team."
      };
    }

    // Cache the insight
    insightCache.set(user.id, {
      insight: insightData,
      timestamp: Date.now(),
    });

    return NextResponse.json({
      insight: insightData,
      cached: false,
    });
  } catch (e) {
    console.error("GET /api/insights error:", e);
    return NextResponse.json(
      { error: "Failed to generate insight" },
      { status: 500 }
    );
  }
}
