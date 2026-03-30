/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { fetchTrackerData, analyzeTrackerData, formatTrackerSummary, type PlainLanguageInsight, type TrackerSummary } from "@/lib/trackerAnalysis";
import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// Import lazy Supabase admin client
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushNotification } from "@/lib/sendPushNotification";

// Import RAG orchestrator
import { orchestrateRAG } from "@/lib/rag/orchestrator";
import { getPersonaSystemPrompt } from "@/lib/rag/persona-prompts";
import { addMessage, getConversationHistory } from "@/lib/rag/conversation-memory";
import type { RetrievalMode } from "@/lib/rag/types";

/** Asset keys used by mobile app assets/symptoms/ (snake_case filenames without extension). */
const SYMPTOM_ASSET_KEYS = [
  "anxiety", "bloating", "brain_fog", "fatigue", "headaches", "hot_flashes",
  "insomnia", "joint_pain", "low_libido", "mood_swings", "night_sweats", "period", "weight_gain",
] as const;
const NEUTRAL_ICON = "neutral";

/** Map symptom name from chat to a mobile asset key or neutral. Kept in sync with mobile app assets/symptoms/. */
function getSymptomIconKey(symptomName: string): string {
  const slug = symptomName.trim().toLowerCase().replace(/\s+/g, "_");
  if (SYMPTOM_ASSET_KEYS.includes(slug as any)) return slug;
  const alias: Record<string, string> = {
    headache: "headaches", hot_flash: "hot_flashes", night_sweat: "night_sweats",
    mood_swing: "mood_swings", sleep_disturbance: "insomnia", sleep_issues: "insomnia",
    sleep_problems: "insomnia", tired: "fatigue", tiredness: "fatigue", exhaustion: "fatigue",
    brain_fog: "brain_fog", weight_gain: "weight_gain", low_libido: "low_libido",
  };
  if (alias[slug]) return alias[slug];
  if (slug.includes("headache")) return "headaches";
  if (slug.includes("hot_flash") || slug.includes("hotflash")) return "hot_flashes";
  if (slug.includes("night_sweat")) return "night_sweats";
  if (slug.includes("mood_swing") || slug.includes("moodswing")) return "mood_swings";
  if (slug.includes("sleep") || slug.includes("insomnia")) return "insomnia";
  if (slug.includes("fatigue") || slug.includes("tired") || slug.includes("energy")) return "fatigue";
  if (slug.includes("brain") || slug.includes("fog") || slug.includes("cognitive")) return "brain_fog";
  if (slug.includes("anxiety") || slug.includes("anxious")) return "anxiety";
  if (slug.includes("joint") || slug.includes("pain") && slug.includes("joint")) return "joint_pain";
  if (slug.includes("bloat")) return "bloating";
  if (slug.includes("weight")) return "weight_gain";
  if (slug.includes("libido")) return "low_libido";
  if (slug.includes("period") || slug.includes("menstrual")) return "period";
  return NEUTRAL_ICON;
}

// Initialize LLM with function calling support
// Base LLM for normal conversation (with personalization)
const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini", // or "gpt-4" for better quality
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// LLM for knowledge base responses (moderate temperature for natural but grounded answers)
const llmKnowledgeBase = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.35, // Moderate temperature for natural responses grounded in knowledge base
  openAIApiKey: process.env.OPENAI_API_KEY,
});

// Helper functions for condition detection
function detectBadDay(symptomLogs: SymptomLog[], today: Date): boolean {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const todayLogs = symptomLogs.filter(log => {
    const logDate = new Date(log.logged_at);
    return logDate >= todayStart && logDate <= todayEnd;
  });

  // Check for 3+ symptoms today OR any severe symptom (severity=3)
  const symptomCount = new Set(todayLogs.map(log => log.symptom_id)).size;
  const hasSevereSymptom = todayLogs.some(log => log.severity === 3);

  return symptomCount >= 3 || hasSevereSymptom;
}

function checkStreakMilestone(streak: number): number | null {
  // Check if streak is 7, 14, or 30 days
  if (streak === 7 || streak === 14 || streak === 30) {
    return streak;
  }
  return null;
}

function detectNewPatterns(
  currentInsights: PlainLanguageInsight[],
  lastPatternDate: Date | null
): PlainLanguageInsight | null {
  if (!lastPatternDate || currentInsights.length === 0) {
    // If no last pattern date, consider first insight as new
    return currentInsights[0] || null;
  }

  const now = new Date();
  const hoursSinceLastPattern = (now.getTime() - lastPatternDate.getTime()) / (1000 * 60 * 60);

  // If pattern was detected in last 48 hours, return the most important one
  if (hoursSinceLastPattern <= 48 && currentInsights.length > 0) {
    // Prioritize: progress > trigger > timing > correlation > pattern
    const priorityOrder: Record<string, number> = {
      progress: 0,
      trigger: 1,
      'time-of-day': 2,
      'food-correlation': 2.5,
      correlation: 3,
      pattern: 4
    };
    const sorted = [...currentInsights].sort((a, b) => {
      const aPriority = priorityOrder[a.type] ?? 5;
      const bPriority = priorityOrder[b.type] ?? 5;
      return aPriority - bPriority;
    });
    return sorted[0];
  }

  return null;
}

function detectImprovement(trackerSummary: TrackerSummary): { symptom: string; percent: number } | null {
  // Look for progress insights with positive change
  const progressInsights = trackerSummary.plainLanguageInsights.filter(
    insight => insight.type === 'progress' && insight.changeDirection === 'down'
  );

  if (progressInsights.length > 0) {
    const topInsight = progressInsights[0];
    if (topInsight.symptomName && topInsight.changePercent) {
      return {
        symptom: topInsight.symptomName,
        percent: topInsight.changePercent,
      };
    }
  }

  return null;
}

function hasLogToday(symptomLogs: SymptomLog[], today: Date): boolean {
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  return symptomLogs.some(log => {
    const logDate = new Date(log.logged_at);
    return logDate >= todayStart && logDate <= todayEnd;
  });
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins <= 1 ? 'just now' : `${diffMins} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

// Helper: Generate personalized greeting
async function generatePersonalizedGreeting(user_id: string): Promise<string> {
  try {
    const today = new Date();
    const hour = today.getHours();
    
    // Fetch user profile, preferences, and tracker data in parallel
    const supabaseClient = getSupabaseAdmin();
    const [profileResult, preferencesResult, trackerData] = await Promise.all([
      supabaseClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", user_id)
        .single(),
      supabaseClient
        .from("user_preferences")
        .select("current_streak, last_pattern_detected_at, last_seen_insights")
        .eq("user_id", user_id)
        .single(),
      fetchTrackerData(user_id, 14), // Last 14 days for better context (7 for recent, 14 for comparison)
    ]);

    const userProfile = profileResult.data;
    const preferences = preferencesResult.data;
    const trackerSummary = analyzeTrackerData(
      trackerData.symptomLogs,
      trackerData.dailyMood
    );

    // Get user's name
    const userName = userProfile?.name || "";

    // Check conditions in priority order
    const todayLogs = trackerData.symptomLogs;

    // 0. Check for unseen insights (highest priority - before other conditions)
    const lastSeenInsights = preferences?.last_seen_insights || [];
    const currentInsights = trackerSummary.plainLanguageInsights;
    
    // Helper to check if insight matches seen insight
    const isInsightSeen = (insight: PlainLanguageInsight): boolean => {
      return lastSeenInsights.some((seen: any) => {
        if (seen.type !== insight.type) return false;
        switch (insight.type) {
          case 'trigger':
            return seen.symptom === insight.symptomName && seen.trigger === insight.triggerName;
          case 'time-of-day':
            return seen.symptom === insight.symptomName && seen.timeOfDay === insight.timeOfDay;
          case 'progress':
            return seen.symptom === insight.symptomName && seen.changeDirection === insight.changeDirection;
          case 'correlation':
            return seen.symptom === insight.symptomName;
      case 'pattern':
        return seen.symptom === insight.symptomName;
      default:
        return false;
        }
      });
    };

    const unseenInsights = currentInsights.filter(insight => !isInsightSeen(insight));
    
    if (unseenInsights.length > 0) {
      // Prioritize: progress > trigger > timing > correlation > pattern
      const priorityOrder: Record<string, number> = { 
        progress: 0,
        trigger: 1,
        'time-of-day': 2,
        correlation: 3,
        pattern: 4
      };
      const sorted = [...unseenInsights].sort((a, b) => {
        const aPriority = priorityOrder[a.type] ?? 5;
        const bPriority = priorityOrder[b.type] ?? 5;
        return aPriority - bPriority;
      });
      const topUnseen = sorted[0];

      // Generate proactive mention based on insight type
      if (topUnseen.type === 'trigger' && topUnseen.symptomName && topUnseen.triggerName) {
        return `Hey ${userName}! Before we chat — I found something interesting in your logs. Looks like ${topUnseen.triggerName} appears frequently with your ${topUnseen.symptomName}.\n\nWant me to explain what this means?`;
      } else if (topUnseen.type === 'time-of-day' && topUnseen.symptomName && topUnseen.timeOfDay) {
        const timeLabel = {
          morning: '6am-12pm',
          afternoon: '12pm-6pm',
          evening: '6pm-10pm',
          night: '10pm-6am',
        }[topUnseen.timeOfDay] || topUnseen.timeOfDay;
        return `Hey ${userName}! Before we chat — I found something interesting in your logs. Looks like your ${topUnseen.symptomName} happens most in the ${timeLabel}.\n\nWant me to explain what this means?`;
      } else if (topUnseen.type === 'progress' && topUnseen.symptomName) {
        if (topUnseen.changeDirection === 'down') {
          return `Hey ${userName}! Before we chat — I found something interesting in your logs. Looks like your ${topUnseen.symptomName} is down ${topUnseen.changePercent || ''}% compared to last week.\n\nWant me to explain what this means?`;
        } else {
          return `Hey ${userName}! Before we chat — I found something interesting in your logs. Looks like your ${topUnseen.symptomName} is up ${topUnseen.changePercent || ''}% this week.\n\nWant me to explain what this means?`;
        }
      } else if (topUnseen.type === 'correlation' && topUnseen.symptomName) {
        return `Hey ${userName}! Before we chat — I found something interesting in your logs. Looks like ${topUnseen.symptomName} might be connected to other symptoms.\n\nWant me to explain what this means?`;
      } else {
        return `Hey ${userName}! Before we chat — I found something interesting in your logs.\n\nWant me to explain what this means?`;
      }
    }

    // 1. Bad Day Detection
    if (detectBadDay(todayLogs, today)) {
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      const todaySymptomLogs = todayLogs.filter(log => {
        const logDate = new Date(log.logged_at);
        return logDate >= todayStart && logDate <= todayEnd;
      });
      const symptomCount = new Set(todaySymptomLogs.map(log => log.symptom_id)).size;
      const severeCount = todaySymptomLogs.filter(log => log.severity === 3).length;

      return `Hey ${userName}. I see today's been rough — you've logged ${symptomCount} symptom${symptomCount > 1 ? 's' : ''}, ${severeCount > 0 ? 'including some tough ones' : ''}. I'm here if you want to talk through what's going on, or if you just need company. 💜\n\nWhat's hitting hardest right now?`;
    }

    // 2. Streak Milestone
    const streak = preferences?.current_streak || 0;
    const milestone = checkStreakMilestone(streak);
    if (milestone) {
      return `Hey ${userName}! Quick thing — you've logged for ${milestone} days straight. 🔥 That's amazing. The patterns I'm seeing are getting clearer because of your consistency.\n\nHow are you feeling today?`;
    }

    // 3. New Pattern Detection
    const lastPatternDate = preferences?.last_pattern_detected_at 
      ? new Date(preferences.last_pattern_detected_at) 
      : null;
    const newPattern = detectNewPatterns(trackerSummary.plainLanguageInsights, lastPatternDate);
    if (newPattern) {
      if (newPattern.type === 'time-of-day' && newPattern.symptomName && newPattern.timeOfDay) {
        const timeLabel = {
          morning: '6am-12pm',
          afternoon: '12pm-6pm',
          evening: '6pm-10pm',
          night: '10pm-6am',
        }[newPattern.timeOfDay] || newPattern.timeOfDay;
        return `Hey ${userName}. I noticed something in your logs — your ${newPattern.symptomName} seems to happen most in the ${timeLabel}. That's actually a useful clue.\n\nWant me to explain what might be going on and what you could try?`;
      } else if (newPattern.type === 'trigger' && newPattern.symptomName && newPattern.triggerName) {
        return `Hey ${userName}. I noticed something in your logs — ${newPattern.triggerName} appears frequently with your ${newPattern.symptomName}. That's actually a useful clue.\n\nWant me to explain what might be going on and what you could try?`;
      }
    }

    // 4. Improvement Detection
    const improvement = detectImprovement(trackerSummary);
    if (improvement) {
      return `Hey ${userName}! Good news — your ${improvement.symptom} is down ${improvement.percent}% compared to last week. That's real progress.\n\nWhat do you think made the difference?`;
    }

    // 5. No Log Today Check (after 2pm)
    if (hour >= 14 && !hasLogToday(todayLogs, today)) {
      return `Hey ${userName}. I haven't seen you in your check-in today. Everything okay, or just a quiet symptom day?`;
    }

    // 6. Default: Reference most recent log
    if (trackerSummary.symptoms.recent.length > 0) {
      const mostRecent = trackerSummary.symptoms.recent[0];
      const logDate = new Date(mostRecent.logged_at);
      const timeAgo = formatTimeAgo(logDate);
      const symptomName = mostRecent.symptom_name || 'a symptom';
      
      return `Hey ${userName}. I saw you logged ${symptomName} ${timeAgo}. How are you feeling now?\n\nAnything on your mind?`;
    }

    // Fallback if no logs at all - use random welcome message
    const welcomeMessages = [
      `Hi there${userName ? `, ${userName}` : ''}! How are you doing today?`,
      `Hey${userName ? `, ${userName}` : ''}! What can I help you with?`,
      `Hey${userName ? `, ${userName}` : ''}! What's going on?`,
      `Hi${userName ? `, ${userName}` : ''}! What would you like to talk about today?`,
      `Hey there${userName ? `, ${userName}` : ''}! What do you need today?`,
      `Hi${userName ? `, ${userName}` : ''}! How can I help?`,
      `Hey${userName ? `, ${userName}` : ''}! Good to hear from you. What's up?`,
      `Hello${userName ? `, ${userName}` : ''}! I'm here - what's on your mind?`,
    ];
    const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    return randomMessage;
  } catch (error) {
    console.error("Error generating personalized greeting:", error);
    // Fallback greeting - use random welcome message
    const welcomeMessages = [
      "Hi there! How are you doing today?",
      "Hey! What can I help you with?",
      "Hey! What's going on?",
      "Hi! What would you like to talk about today?",
      "Hey there! What do you need today?",
      "Hi! How can I help?",
      "Hey! Good to hear from you. What's up?",
      "Hello! I'm here - what's on your mind?",
    ];
    const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    return randomMessage;
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = authUser.id;

    const { message, userInput, sessionId, history, mode, stream: streamParam } = (await req.json()) as {
      message?: string; // New parameter name
      userInput?: string; // Legacy support
      sessionId?: string;
      history?: string;
      mode?: RetrievalMode;
      stream?: boolean;
    };

    // Support both 'message' and 'userInput' for backward compatibility
    const userMessage = message || userInput;

    // Check if this is a greeting request (empty message)
    if (!userMessage?.trim()) {
      const greeting = await generatePersonalizedGreeting(user_id);
      return NextResponse.json({ content: greeting, persona: "menopause_specialist", source: "llm", isGreeting: true });
    }

    if (!sessionId?.trim()) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }

    // Check if trial is expired
    const isExpired = await checkTrialExpired(user_id);
    if (isExpired) {
      return NextResponse.json(
        { error: "Trial expired. Please upgrade to continue using the chat feature." },
        { status: 403 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // Use streaming by default, but allow opt-out
    const useStreaming = streamParam !== false;

    // Parallel data fetching for performance
    const supabaseClient = getSupabaseAdmin();
    const [profileResult, conversationsResult, trackerData] = await Promise.all([
      supabaseClient
        .from("user_profiles")
        .select("*")
        .eq("user_id", user_id)
        .single(),
      supabaseClient
        .from("conversations")
        .select("user_message, assistant_message, created_at")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false })
        .limit(10),
      fetchTrackerData(user_id, 30),
    ]);

    const userProfile = profileResult.data;
    const recentConversations = conversationsResult.data;

    const trackerSummary = analyzeTrackerData(
      trackerData.symptomLogs,
      trackerData.dailyMood
    );
    const trackerContext = formatTrackerSummary(trackerSummary);

    // 3. Use RAG orchestrator for persona-based retrieval and response generation
    // Get conversation history from memory
    const memoryHistory = getConversationHistory(sessionId);
    
    // Build conversation history for orchestrator (legacy support + memory)
    const dbHistoryMessages: Array<["user" | "assistant", string]> = [];
    if (recentConversations && recentConversations.length > 0) {
      const chronological = [...recentConversations].reverse();
      for (const conv of chronological) {
        if (conv.user_message) {
          dbHistoryMessages.push(["user", conv.user_message]);
        }
        if (conv.assistant_message) {
          dbHistoryMessages.push(["assistant", conv.assistant_message]);
        }
      }
    }

    const sessionHistoryMessages = parseHistory(history || "");
    const memoryHistoryArray = memoryHistory.map(msg => [msg.role, msg.content] as ["user" | "assistant", string]);
    const allHistoryMessages = [...dbHistoryMessages, ...sessionHistoryMessages, ...memoryHistoryArray];

    // Call orchestrator with new signature
    const orchestrationResult = await orchestrateRAG(
      userMessage,
      user_id,
      sessionId,
      mode, // Optional mode parameter
      userProfile,
      trackerContext,
      allHistoryMessages
    );

    // If verbatim response (KB strict mode with KB match) or refusal response, return directly
    if (orchestrationResult.response && (orchestrationResult.isVerbatim || orchestrationResult.retrievalMode === "kb_strict")) {
      // Extract follow_up_links from KB entries
      const followUpLinks = orchestrationResult.kbEntries?.[0]?.metadata?.follow_up_links || [];
      
      // Store conversation in memory
      addMessage(sessionId, {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      });
      addMessage(sessionId, {
        role: "assistant",
        content: orchestrationResult.response,
        persona: orchestrationResult.persona,
        timestamp: Date.now(),
      });
      
      // Store conversation in database with session tracking
      await storeConversation(user_id, userMessage, orchestrationResult.response, sessionId);

      if (useStreaming) {
        // Stream the response
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const words = orchestrationResult.response!.split(/(\s+)/);
              let accumulated = "";

              for (const word of words) {
                accumulated += word;
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: "chunk", content: accumulated })}\n\n`)
                );
                await new Promise(resolve => setTimeout(resolve, 1));
              }

              // Send follow_up_links after content is done
              if (followUpLinks.length > 0) {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: "follow_up_links", links: followUpLinks })}\n\n`)
                );
              }

              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
              );
              controller.close();
            } catch (error: unknown) {
              console.error("Streaming error:", error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`)
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      } else {
        // Non-streaming - return proper format with follow_up_links
        return NextResponse.json({
          content: orchestrationResult.response,
          persona: orchestrationResult.persona,
          source: orchestrationResult.source,
          follow_up_links: followUpLinks.length > 0 ? followUpLinks : undefined,
        });
      }
    }

    // Extract follow_up_links from KB entries for non-verbatim responses too
    const followUpLinks: Array<{ persona: string; topic: string; subtopic: string; label: string }> = [];
    if (orchestrationResult.kbEntries && orchestrationResult.kbEntries.length > 0) {
      for (const entry of orchestrationResult.kbEntries) {
        const links = entry.metadata?.follow_up_links;
        if (Array.isArray(links)) {
          for (const link of links) {
            if (link && link.label && link.subtopic && !followUpLinks.some(l => l.subtopic === link.subtopic)) {
              followUpLinks.push(link);
            }
          }
        }
      }
    }

    // For non-verbatim responses, continue with LLM (with tools) using orchestrator's system prompt
    // The orchestrator has already handled KB retrieval and persona classification

    // 4. Build comprehensive user profile context for personalization
    let userContext = "";
    if (userProfile) {
      const profileParts: string[] = [];

      if (userProfile.name) profileParts.push(`Name: ${userProfile.name}`);
      if (userProfile.age) profileParts.push(`Age: ${userProfile.age}`);

      // New User Memory Questions fields
      if (userProfile.top_problems && Array.isArray(userProfile.top_problems) && userProfile.top_problems.length > 0) {
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
        const problems = userProfile.top_problems.map((p: string) => problemLabels[p] || p).join(", ");
        profileParts.push(`Main concerns: ${problems}`);
      }

      if (userProfile.severity) {
        const severityLabels: Record<string, string> = {
          mild: "Mild — Annoying but manageable",
          moderate: "Moderate — Affecting work/relationships",
          severe: "Severe — Struggling every day",
        };
        profileParts.push(`Severity: ${severityLabels[userProfile.severity] || userProfile.severity}`);
      }

      if (userProfile.timing) {
        const timingLabels: Record<string, string> = {
          just_started: "Just started (0-6 months)",
          been_while: "Been a while (6-12 months)",
          over_year: "Over a year",
          several_years: "Several years",
        };
        profileParts.push(`Symptoms started: ${timingLabels[userProfile.timing] || userProfile.timing}`);
      }

      if (userProfile.tried_options && Array.isArray(userProfile.tried_options) && userProfile.tried_options.length > 0) {
        const triedLabels: Record<string, string> = {
          nothing: "Nothing yet",
          supplements: "Supplements / Vitamins",
          diet: "Diet changes",
          exercise: "Exercise",
          hrt: "HRT / Medication",
          doctor_talk: "Talked to doctor",
          apps: "Apps / Tracking",
        };
        const tried = userProfile.tried_options.map((t: string) => triedLabels[t] || t).join(", ");
        profileParts.push(`Already tried: ${tried}`);
      }

      if (userProfile.doctor_status) {
        const doctorLabels: Record<string, string> = {
          yes_actively: "Yes, actively",
          yes_not_helpful: "Yes, but they're not helpful",
          no_planning: "No, planning to",
          no_natural: "No, prefer natural approaches",
        };
        profileParts.push(`Doctor status: ${doctorLabels[userProfile.doctor_status] || userProfile.doctor_status}`);
      }

      if (userProfile.goal) {
        const goalLabels: Record<string, string> = {
          sleep_through_night: "Sleep through the night",
          think_clearly: "Think clearly again",
          feel_like_myself: "Feel like myself",
          understand_patterns: "Understand my patterns",
          data_for_doctor: "Have data for my doctor",
          get_body_back: "Get my body back",
        };
        profileParts.push(`Primary goal: ${goalLabels[userProfile.goal] || userProfile.goal}`);
      }

      if (profileParts.length > 0) {
        userContext = `\n\n=== USER PROFILE (ALWAYS USE THIS FOR PERSONALIZATION) ===\n${profileParts.join("\n")}\n=== END USER PROFILE ===\n`;
      }
    }


    // 5. Build system message using persona-specific prompt from orchestrator
    // Pass userQuery for state detection (low energy, overtraining) and WHY routing
    const personaSystemPrompt = getPersonaSystemPrompt(orchestrationResult.persona, userMessage);
    
    const systemParts: string[] = [personaSystemPrompt];

    // Add current date context so Lisa knows what "today" is
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    systemParts.push(`\n=== CURRENT DATE & TIME ===
Today is ${dateStr}. The current time is ${timeStr}.
Use this to determine what "today", "yesterday", "this week" means when referencing user data.
=== END DATE & TIME ===`);

    // Add KB context for hybrid mode
    if (orchestrationResult.retrievalMode === "hybrid" && orchestrationResult.kbContext) {
      systemParts.push(`\n\n=== KNOWLEDGE BASE CONTEXT ===
You have access to knowledge base content that provides evidence-based information. Use this content to ground your responses while generating personalized plans and recommendations.

KNOWLEDGE BASE CONTENT:
${orchestrationResult.kbContext}

INSTRUCTIONS:
- Use the knowledge base content as evidence for your recommendations
- Generate personalized plans and meal/workout ideas based on the KB data
- Combine KB evidence with creative, practical suggestions
- Maintain your persona's tone and style
- Personalize with user context when relevant`);
    }

    // Add user context
    if (userContext && userContext.trim()) {
      systemParts.push(userContext);
    }

    // Add tracker context
    if (trackerContext && trackerContext.trim()) {
      systemParts.push(`\n${trackerContext}`);
    }

    // Add conversation history note
    if (allHistoryMessages.length > 0) {
      systemParts.push(`\nNote: You have access to ${allHistoryMessages.length} previous conversation turns. Use this history to provide continuity and personalized responses.`);
    }

    // Add special instructions for casual conversation
    const isCasualGreetingCheck = (query: string): boolean => {
      const casualPatterns = [
        /^(hey|hi|hello|hiya|heya)/i,
        /^(how are you|how's it going|how are things|what's up|sup)/i,
        /^(how am i doing|how am i|how do i look)/i,
        /^(good morning|good afternoon|good evening|gm|gn)/i,
        /^(thanks|thank you|ty|thx)/i,
        /^(ok|okay|k|sure|yeah|yep|nope|no)/i,
      ];
      return casualPatterns.some(pattern => pattern.test(query.trim()));
    };

    if (isCasualGreetingCheck(userMessage)) {
      systemParts.push(`\n=== CASUAL CONVERSATION MODE ===
IMPORTANT: The user is engaging in casual conversation, not asking for information.
- ALWAYS respond to the CURRENT message immediately - don't reference previous messages unless directly relevant
- When user mentions food/activity, acknowledge it immediately in your response, not in the next turn
- Respond naturally and conversationally, matching their casual tone
- Reference specific tracker data or recent activity if available
- Be warm and friendly, like a close friend
- Use emojis to make responses more engaging: 🍳 for food, 💪 for workouts, 😊 for greetings, etc.
- NEVER use generic phrases like "If there's anything on your mind" or "I'm here for you"
- NEVER repeat responses you've given before in this conversation
- If they ask "how am I doing?", reference their actual tracker data or ask about something specific
- Keep it short, natural, and personal - not formal or robotic
- NEVER use numbered lists (1., 2., 3.) - use natural paragraph flow or conversational transitions
- Write as if chatting with a friend over coffee - flowing and natural, not structured like a manual`);
    }

    const systemMessage = systemParts.join("\n");

    // 6. Select appropriate LLM based on retrieval mode
    // For hybrid mode with KB, use lower temperature; for llm_reasoning, use standard
    const llmToUse = (orchestrationResult.retrievalMode === "hybrid" && orchestrationResult.usedKB) 
      ? llmKnowledgeBase 
      : llm;

    // 7. Build messages array using LangChain message classes
    // CRITICAL: Messages must be in chronological order: [SystemMessage, ...History, CurrentUserInput]
    const messages: BaseMessage[] = [new SystemMessage(systemMessage)];

    // Add history FIRST (chronological order)
    const recentHistory = allHistoryMessages.slice(-20);
    for (const [role, content] of recentHistory) {
      if (role === "user" && content.trim()) {
        messages.push(new HumanMessage(content));
      } else if (role === "assistant" && content.trim()) {
        messages.push(new AIMessage(content));
      }
    }

    // Add current user input LAST (most recent)
    // For hybrid mode, KB context is already in orchestrator's system prompt
    // For llm_reasoning mode, no KB context needed
    messages.push(new HumanMessage(userMessage || ""));

    // 9. Create tools for function calling
    const tools = [
      new DynamicStructuredTool({
        name: "log_symptom",
        description: "Automatically log a symptom entry for the user WITHOUT asking for permission. Use this immediately when the user mentions experiencing a symptom, even casually. Extract the symptom name, severity level (mild/moderate/severe), optional triggers (what might have caused it), optional notes, and date/time reference from the user's message (e.g., 'yesterday', '2 days ago', 'this morning'). If no date is mentioned, use current time. Do NOT ask the user if they want to log it - just log it automatically.",
        schema: z.object({
          name: z.string().describe("The name of the symptom (e.g., 'hot flashes', 'sleep disturbance', 'mood swings')"),
          severity: z.enum(["mild", "moderate", "severe"]).describe("Severity level: 'mild' (noticeable but manageable), 'moderate' (affecting my day), or 'severe' (hard to function)"),
          triggers: z.array(z.string()).optional().describe("Optional array of triggers that might have caused the symptom (e.g., ['Stress', 'Poor sleep', 'Coffee', 'Spicy food', 'Exercise', 'Hot weather', 'Work', 'Travel', 'Hormonal', 'Unknown']). Only include if the user mentions what might have triggered it."),
          notes: z.string().optional().describe("Optional additional notes about the symptom"),
          date_reference: z.string().optional().describe("Date/time reference from user's message (e.g., 'yesterday', '2 days ago', 'this morning', 'last night'). Use the exact phrase from the user's message if present, otherwise omit."),
        }),
        func: async ({ name, severity, triggers, notes }) => {
          try {

            // Map severity text to number (1=mild, 2=moderate, 3=severe)
            const severityMap: Record<string, number> = {
              mild: 1,
              moderate: 2,
              severe: 3,
            };
            const severityNumber = severityMap[severity.toLowerCase()] || 2; // Default to moderate

            const supabaseClient = getSupabaseAdmin();
            
            // First, find or create the symptom definition
            let symptomDef;
            const { data: existingSymptom } = await supabaseClient
              .from("symptoms")
              .select("id")
              .eq("user_id", user_id)
              .eq("name", name.trim())
              .single();

            if (existingSymptom) {
              symptomDef = existingSymptom;
            } else {
              // Create symptom definition if it doesn't exist
              const iconKey = getSymptomIconKey(name);
              const { data: newSymptom, error: createError } = await supabaseClient
                .from("symptoms")
                .insert([
                  {
                    user_id,
                    name: name.trim(),
                    icon: iconKey,
                    is_default: false,
                  },
                ])
                .select("id")
                .single();

              if (createError) {
                return `Error creating symptom definition: ${createError.message}`;
              }
              symptomDef = newSymptom;
            }

            // Normalize triggers: ensure they're valid strings and filter out empty values
            const normalizedTriggers = triggers 
              ? triggers
                  .map(t => t.trim())
                  .filter(t => t.length > 0)
              : [];

            // Now insert into symptom_logs
            const { error: logError } = await supabaseClient
              .from("symptom_logs")
              .insert([
                {
                  user_id,
                  symptom_id: symptomDef.id,
                  severity: severityNumber,
                  triggers: normalizedTriggers,
                  notes: notes?.trim() || null,
                },
              ]);

            if (logError) {
              return `Error logging symptom: ${logError.message}`;
            }

            const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);
            const triggersText = normalizedTriggers.length > 0
              ? ` | Triggers: ${normalizedTriggers.join(", ")}`
              : "";
            const summaryMessage = `${name} (${severityLabel})${triggersText}`;
            const notificationTitle = "Symptom logged";

            await supabaseClient.from("notifications").insert([
              {
                user_id,
                type: "symptom_logged",
                title: notificationTitle,
                message: summaryMessage,
                priority: "medium",
                seen: false,
                dismissed: false,
              },
            ]);

            sendPushNotification({
              userId: user_id,
              title: notificationTitle,
              body: summaryMessage,
              data: { screen: "Notifications" },
            }).catch(() => {});

            return `Successfully logged 📝 symptom: ${summaryMessage}`;
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return `Error logging symptom: ${errorMessage}`;
          }
        },
      }),
      new DynamicStructuredTool({
        name: "update_long_term_memory",
        description: "Update the user's basic profile information in the user_profiles table. Use this when the user explicitly mentions wanting to save something to their long-term memory, profile, or when they want to remember something important about themselves (like their name or age). Only use this when the user explicitly requests to save/remember something long-term.",
        schema: z.object({
          field_to_update: z.enum([
            "name",
            "age"
          ]).describe("The field in the user profile to update (name or age)"),
          value: z.string().describe("The value to save. For age, provide a number as a string (e.g., '45'). For name, provide the full name."),
        }),
        func: async ({ field_to_update, value }) => {
          try {
            // Build update object
            const updateData: Record<string, string | number> = {};

            // Handle different field types
            if (field_to_update === "age") {
              const ageNum = parseInt(value);
              if (isNaN(ageNum) || ageNum < 0 || ageNum > 150) {
                return `Error: Invalid age value. Please provide a valid number between 0 and 150.`;
              }
              updateData[field_to_update] = ageNum;
            } else {
              updateData[field_to_update] = value.trim();
            }

            // Update the user profile
            const supabaseClient = getSupabaseAdmin();
            const { error } = await supabaseClient
              .from("user_profiles")
              .update(updateData)
              .eq("user_id", user_id)
              .select()
              .single();

            if (error) {
              return `Error updating long-term memory: ${error.message}`;
            }

            return `Successfully saved to your long-term memory! I've updated your ${field_to_update.replace(/_/g, ' ')}. I'll remember this for future conversations.`;
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            return `Error updating long-term memory: ${errorMessage}`;
          }
        },
      }),
    ];

    const llmWithTools = llmToUse.bindTools(tools);

    // 10. Handle streaming vs non-streaming
    if (useStreaming) {
      // Create streaming response
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let fullResponse = "";
            const currentMessages: BaseMessage[] = [...messages];
            const maxIterations = 5; // Prevent infinite loops
            let iteration = 0;

            while (iteration < maxIterations) {
              iteration++;

              // Get response with tools
              const response = await llmWithTools.invoke(currentMessages);

              // Check for tool calls
              if (response.tool_calls && response.tool_calls.length > 0) {
                // Emit tool_call events for each tool
                for (const toolCall of response.tool_calls) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({
                      type: "tool_call",
                      tool_name: toolCall.name,
                      tool_args: toolCall.args
                    })}\n\n`)
                  );
                }

                // Execute tools in parallel for better performance
                const toolResults = await Promise.all(
                  response.tool_calls.map(async (toolCall: { name: string; id?: string; args: Record<string, unknown> }) => {
                    const tool = tools.find((t) => t.name === toolCall.name);
                    if (tool && toolCall.id) {
                      try {
                         
                        const result = await (tool as any).invoke(toolCall.args);

                        // Emit tool_result event
                        controller.enqueue(
                          new TextEncoder().encode(`data: ${JSON.stringify({
                            type: "tool_result",
                            tool_name: toolCall.name,
                            tool_args: toolCall.args,
                            result: result,
                            success: true
                          })}\n\n`)
                        );

                        return new ToolMessage({
                          content: result,
                          tool_call_id: toolCall.id,
                        });
                      } catch (e: unknown) {
                        // Emit tool_result event with error
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        controller.enqueue(
                          new TextEncoder().encode(`data: ${JSON.stringify({
                            type: "tool_result",
                            tool_name: toolCall.name,
                            tool_args: toolCall.args,
                            result: `Error: ${errorMessage}`,
                            success: false
                          })}\n\n`)
                        );

                        return new ToolMessage({
                          content: `Error: ${errorMessage}`,
                          tool_call_id: toolCall.id,
                        });
                      }
                    }
                    return null;
                  })
                );

                // Filter out null results
                const validToolResults = toolResults.filter((r) => r !== null) as ToolMessage[];

                // Add tool results to messages and continue
                currentMessages.push(response);
                currentMessages.push(...validToolResults);

                // Continue loop to get final response
                continue;
              }

              // No tool calls, stream the response
              // Extract text content from response
              let responseText = "";
              if (typeof response.content === 'string') {
                responseText = response.content;
              } else if (Array.isArray(response.content)) {
                responseText = response.content
                  .map((part) => {
                    if (typeof part === 'string') return part;
                    if (part && typeof part === 'object' && 'text' in part) {
                      return (part as { text: string }).text;
                    }
                    return '';
                  })
                  .filter(Boolean)
                  .join('');
              } else {
                responseText = String(response.content || '');
              }

              // Stream the response word by word for natural effect
              if (responseText) {
                fullResponse = responseText;

                // Split into chunks for smooth streaming (words + spaces)
                const words = responseText.split(/(\s+)/);
                let accumulated = "";

                for (const word of words) {
                  accumulated += word;
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: "chunk", content: accumulated })}\n\n`)
                  );

                  // OPTIMIZATION: Reduced delay to 1ms for faster streaming
                  await new Promise(resolve => setTimeout(resolve, 1));
                }
              }

              // Break after streaming response
              break;
            }

            // Store conversation after streaming completes
            if (fullResponse) {
              addMessage(sessionId, {
                role: "user",
                content: userMessage,
                timestamp: Date.now(),
              });
              addMessage(sessionId, {
                role: "assistant",
                content: fullResponse,
                persona: orchestrationResult.persona,
                timestamp: Date.now(),
              });
              await storeConversation(user_id, userMessage, fullResponse, sessionId);
            }

            // Send follow_up_links after content is done
            if (followUpLinks.length > 0) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ type: "follow_up_links", links: followUpLinks })}\n\n`)
              );
            }

            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
            );
            controller.close();
          } catch (error: unknown) {
            console.error("Streaming error:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", error: errorMessage })}\n\n`)
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    } else {
      // Non-streaming mode (backward compatibility) — used by Android chat (stream: false)
      const response = await llmWithTools.invoke(messages);

      let responseText = "";
      let toolCallsMade = false;
      const toolNotifications: Array<{
        tool_name: string;
        tool_args: Record<string, unknown>;
        success: boolean;
      }> = [];

      if (response.tool_calls && response.tool_calls.length > 0) {
        toolCallsMade = true;
        // Execute tools in parallel for better performance
        const toolResults = await Promise.all(
          response.tool_calls.map(async (toolCall: { name: string; id?: string; args: Record<string, unknown> }) => {
            const tool = tools.find((t) => t.name === toolCall.name);
            if (tool && toolCall.id) {
              try {
                const result = await (tool as any).invoke(toolCall.args);
                toolNotifications.push({
                  tool_name: toolCall.name,
                  tool_args: toolCall.args ?? {},
                  success: true,
                });
                return new ToolMessage({
                  content: result,
                  tool_call_id: toolCall.id,
                });
              } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                toolNotifications.push({
                  tool_name: toolCall.name,
                  tool_args: toolCall.args ?? {},
                  success: false,
                });
                return new ToolMessage({
                  content: `Error: ${errorMessage}`,
                  tool_call_id: toolCall.id,
                });
              }
            }
            return null;
          })
        );

        const validToolResults = toolResults.filter((r) => r !== null) as ToolMessage[];
        messages.push(response);
        messages.push(...validToolResults);
        const finalResponse = await llmWithTools.invoke(messages);
        responseText = typeof finalResponse.content === 'string'
          ? finalResponse.content
          : String(finalResponse.content);
      } else {
        responseText = typeof response.content === 'string'
          ? response.content
          : String(response.content);
      }

      // Store conversation in memory
      addMessage(sessionId, {
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
      });
      addMessage(sessionId, {
        role: "assistant",
        content: responseText,
        persona: orchestrationResult.persona,
        timestamp: Date.now(),
      });
      
      await storeConversation(user_id, userMessage, responseText, sessionId);

      return NextResponse.json({
        content: responseText,
        persona: orchestrationResult.persona,
        source: orchestrationResult.source,
        toolCallsMade,
        follow_up_links: followUpLinks.length > 0 ? followUpLinks : undefined,
        tool_notifications: toolNotifications.length > 0 ? toolNotifications : undefined,
      });
    }
  } catch (e: unknown) {
    console.error("LangChain RAG error:", e);
    // Log full error for debugging, but return generic message to client
    console.error("Full error details:", e);
    return NextResponse.json(
      { error: "An internal error occurred. Please try again." },
      { status: 500 }
    );
  }
}

// Helper: Parse history string into LangChain message format
function parseHistory(history: string): Array<["user" | "assistant", string]> {
  if (!history.trim()) return [];

  const messages: Array<["user" | "assistant", string]> = [];
  const lines = history.split("\n");

  let currentRole: "user" | "assistant" | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("User:")) {
      if (currentRole && currentContent.length > 0) {
        messages.push([currentRole, currentContent.join("\n").trim()]);
      }
      currentRole = "user";
      currentContent = [line.replace(/^User:\s*/, "")];
    } else if (line.startsWith("Assistant:")) {
      if (currentRole && currentContent.length > 0) {
        messages.push([currentRole, currentContent.join("\n").trim()]);
      }
      currentRole = "assistant";
      currentContent = [line.replace(/^Assistant:\s*/, "")];
    } else if (currentRole && line.trim()) {
      currentContent.push(line);
    }
  }

  if (currentRole && currentContent.length > 0) {
    messages.push([currentRole, currentContent.join("\n").trim()]);
  }

  return messages;
}

const MAX_SESSION_TITLE_LENGTH = 48;

// Helper: Store conversation for long-term memory
async function storeConversation(
  user_id: string,
  userMessage: string,
  assistantMessage: string,
  session_id?: string,
  title?: string
) {
  try {
    const supabaseClient = getSupabaseAdmin();
    const now = new Date().toISOString();
    let resolvedTitle = title ?? null;
    if (session_id && !resolvedTitle && userMessage?.trim()) {
      const { count } = await supabaseClient
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id)
        .eq("session_id", session_id);
      if (count === 0) {
        const trimmed = userMessage.trim();
        resolvedTitle =
          trimmed.length <= MAX_SESSION_TITLE_LENGTH
            ? trimmed
            : trimmed.slice(0, MAX_SESSION_TITLE_LENGTH).trim() + "…";
      }
    }
    await supabaseClient.from("conversations").insert([
      {
        user_id,
        user_message: userMessage,
        assistant_message: assistantMessage,
        session_id: session_id || null,
        title: resolvedTitle,
        updated_at: now,
      },
    ]);
  } catch (error) {
    console.error("Error storing conversation:", error);
    // Don't fail the request if storage fails
  }
}

