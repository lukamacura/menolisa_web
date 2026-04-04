/**
 * LLM Relevance Gate
 *
 * Lightweight LLM verification that checks whether retrieved KB content
 * actually answers the user's query before returning it verbatim.
 *
 * Prevents low-relevance results (e.g. generic "what is menopause")
 * from being served for out-of-scope queries that merely share a keyword.
 *
 * Only invoked on the non-exact-match verbatim path — exact intent pattern
 * matches (string equality after normalization) bypass this check entirely.
 *
 * Cost: gpt-4o-mini, maxTokens 3 → ~50-100 ms, negligible token usage.
 */

import { ChatOpenAI } from "@langchain/openai";

const relevanceLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 3,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Verify that a KB entry actually answers the user's query.
 *
 * @returns `true` if the KB content is relevant, `false` if it is a
 *          false-positive match that should fall through to the LLM.
 */
export async function verifyKBRelevance(
  userQuery: string,
  kbTopic: string,
  kbSubtopic: string,
): Promise<boolean> {
  try {
    const prompt = `User asked: "${userQuery}"
The closest knowledge base article is about: "${kbTopic} — ${kbSubtopic}"

Does this article DIRECTLY address what the user is asking about? Answer YES or NO only.`;

    const response = await relevanceLLM.invoke(prompt);
    const answer = (
      typeof response.content === "string"
        ? response.content
        : String(response.content)
    )
      .trim()
      .toUpperCase();

    const isRelevant = answer.startsWith("YES");

    console.log(
      `[Relevance Gate] Query: "${userQuery.substring(0, 80)}" | KB: "${kbTopic} > ${kbSubtopic}" | Relevant: ${isRelevant}`,
    );

    return isRelevant;
  } catch (error) {
    console.error(
      "[Relevance Gate] LLM call failed, defaulting to relevant:",
      error,
    );
    return true;
  }
}
