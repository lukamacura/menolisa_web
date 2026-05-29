/**
 * HyDE — Hypothetical Document Embeddings
 *
 * For queries phrased very differently from the KB's intent patterns
 * (e.g. "my body feels like it's on fire at 3am" vs. "why do I get night sweats"),
 * a raw query embedding underperforms. HyDE generates a short hypothetical answer
 * to the query and embeds THAT instead — the hypothetical answer is lexically and
 * semantically closer to how the KB content is actually written, closing the gap.
 *
 * This is the learned substitute for the hand-maintained synonym map: it covers
 * novel phrasings the team never anticipated.
 *
 * Cost: one gpt-4o-mini call (~150 tokens). Gated by retrieval confidence in
 * retrieval.ts so the common (high-confidence) case pays nothing.
 */

import { ChatOpenAI } from "@langchain/openai";

const hydeLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 160,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a short hypothetical knowledge-base-style answer for the query.
 * The returned text is meant for embedding only — it is never shown to the user.
 *
 * Returns the original query on failure so callers can fall back gracefully.
 */
export async function generateHypotheticalAnswer(query: string): Promise<string> {
  const prompt = `You are writing a short passage for a menopause & perimenopause health knowledge base.
Write 2-3 sentences that would directly answer the following question, using the kind of clinical-but-warm wording such an article uses. Do NOT add caveats, greetings, or disclaimers — just the informative passage.

Question: "${query}"

Passage:`;

  try {
    const response = await hydeLLM.invoke(prompt);
    const text = (
      typeof response.content === "string" ? response.content : String(response.content)
    ).trim();

    if (!text || text.length < 10) {
      return query;
    }

    console.log(`[HyDE] Generated hypothetical answer for: "${query.substring(0, 60)}"`);
    return text;
  } catch (error) {
    console.error("[HyDE] LLM call failed, using original query:", error);
    return query;
  }
}
