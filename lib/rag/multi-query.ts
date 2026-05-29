/**
 * Multi-Query Decomposition
 *
 * A query spanning two topics ("why am I so tired AND gaining weight?") embeds to
 * a single vector → one ranked list → one persona, so only one of the two topics
 * surfaces. Decomposing it into focused sub-queries, retrieving each, and fusing
 * the results lets both Sleep and Metabolism docs appear.
 *
 * Gated in retrieval.ts: only multi-topic-looking queries pay for the extra LLM
 * call and extra retrieval round.
 */

import { ChatOpenAI } from "@langchain/openai";

const decomposeLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 120,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Cheap rule gate: is this query worth attempting to decompose?
 * Looks for a conjunction joining what are plausibly two distinct concerns.
 * Avoids spending an LLM call on obviously single-topic queries.
 */
export function looksMultiTopic(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.split(/\s+/).length < 6) return false; // too short to span two topics
  return /\b(and|also|plus|as well as|along with|both)\b/i.test(trimmed);
}

/**
 * Decompose a multi-topic query into up to 2 standalone sub-queries.
 * Returns `[query]` unchanged when the query is single-topic or on failure,
 * so callers can treat the single-query case as a no-op.
 */
export async function decomposeQuery(query: string): Promise<string[]> {
  const prompt = `A user asked a menopause health assistant the following. If it asks about TWO distinct topics, split it into two short standalone questions (one per topic). If it is really about a single topic, return it unchanged.

Output ONLY the question(s), one per line, maximum 2 lines. No numbering, no extra text.

User question: "${query}"`;

  try {
    const response = await decomposeLLM.invoke(prompt);
    const text =
      typeof response.content === "string" ? response.content : String(response.content);

    const lines = text
      .split("\n")
      .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
      .filter((l) => l.length >= 3)
      .slice(0, 2);

    if (lines.length <= 1) {
      return [query];
    }

    console.log(`[Multi-Query] Decomposed "${query.substring(0, 60)}" → ${lines.length} sub-queries`);
    return lines;
  } catch (error) {
    console.error("[Multi-Query] LLM call failed, using original query:", error);
    return [query];
  }
}
