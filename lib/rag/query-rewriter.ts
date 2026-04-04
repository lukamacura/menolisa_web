/**
 * Context-Aware Query Rewriter
 * 
 * Detects short/ambiguous follow-up messages and rewrites them into
 * standalone search queries using conversation history. This ensures
 * the RAG retrieval step embeds a meaningful query instead of just "yes".
 * 
 * Uses a hybrid approach:
 *   1. Rule-based gate: skip rewriting for self-contained queries (zero latency)
 *   2. LLM rewriter: only invoked for detected follow-ups (~300ms, gpt-4o-mini)
 */

import { ChatOpenAI } from "@langchain/openai";

const rewriterLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 150,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const FOLLOW_UP_PATTERNS = /^(yes|yeah|yep|yup|sure|ok|okay|no|nah|nope|not really|tell me more|go on|go ahead|please|what about that|sounds good|i think so|definitely|absolutely|of course|right|exactly|correct|that one|the first one|the second one|both|all of them|neither|maybe|i guess|mhm|uh huh|why|how|what|more|continue|can you explain|what do you mean|and|also|thanks|thank you)$/i;

const GREETING_PATTERNS = /^(hi|hey|hello|good morning|good evening|good afternoon|howdy|sup|yo)$/i;

/**
 * Determines whether a user message is likely a follow-up that needs
 * conversation context to be meaningful for retrieval.
 */
function isLikelyFollowUp(query: string): boolean {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  if (GREETING_PATTERNS.test(lower)) return false;

  if (FOLLOW_UP_PATTERNS.test(lower)) return true;

  // Very short messages (< 12 chars) that aren't greetings are likely follow-ups
  // e.g. "yes please", "go on", "why not"
  if (trimmed.length < 12) return true;

  // Short messages (< 25 chars) starting with follow-up starters
  if (trimmed.length < 25 && /^(yes|no|sure|ok|yeah|what|how|why|tell|more|and|also|but)\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Extracts a concise topic summary from recent conversation history
 * for the LLM rewriter prompt. Keeps token usage minimal.
 */
function buildHistoryContext(history: Array<["user" | "assistant", string]>): string {
  const recent = history.slice(-6); // last 3 exchange pairs max
  return recent
    .map(([role, content]) => {
      const truncated = content.length > 300 ? content.slice(0, 300) + "..." : content;
      return `${role === "user" ? "User" : "Assistant"}: ${truncated}`;
    })
    .join("\n");
}

/**
 * Rewrites an ambiguous follow-up query into a standalone search query
 * using conversation history context.
 * 
 * For self-contained queries, returns the original query unchanged (zero cost).
 * For follow-ups, uses gpt-4o-mini to produce a context-rich retrieval query.
 */
export async function rewriteQueryWithContext(
  userQuery: string,
  history: Array<["user" | "assistant", string]>
): Promise<{ rewrittenQuery: string; wasRewritten: boolean }> {
  if (!history || history.length === 0) {
    return { rewrittenQuery: userQuery, wasRewritten: false };
  }

  if (!isLikelyFollowUp(userQuery)) {
    return { rewrittenQuery: userQuery, wasRewritten: false };
  }

  const historyContext = buildHistoryContext(history);

  const prompt = `You are a search query rewriter for a menopause health knowledge base. Given the conversation history and the user's latest short/ambiguous message, rewrite it into a single standalone search query that captures the full intent.

Rules:
- Output ONLY the rewritten query, nothing else
- Make it specific enough to retrieve the right knowledge base article
- Preserve the medical/health topic from the conversation
- Keep it concise (under 20 words)
- If the user said "yes" to an offer, turn the offer into a search query

Conversation:
${historyContext}

User's latest message: "${userQuery}"

Rewritten search query:`;

  try {
    const response = await rewriterLLM.invoke(prompt);
    const rewritten = (typeof response.content === "string" ? response.content : String(response.content)).trim();

    if (!rewritten || rewritten.length < 3) {
      console.log(`[Query Rewriter] LLM returned empty/short result, using original: "${userQuery}"`);
      return { rewrittenQuery: userQuery, wasRewritten: false };
    }

    console.log(`[Query Rewriter] Rewrote follow-up: "${userQuery}" → "${rewritten}"`);
    return { rewrittenQuery: rewritten, wasRewritten: true };
  } catch (error) {
    console.error("[Query Rewriter] LLM call failed, using original query:", error);
    return { rewrittenQuery: userQuery, wasRewritten: false };
  }
}
