/**
 * Faithfulness / Hallucination Gate
 *
 * Runs AFTER generation on the hybrid path (KB-grounded LLM, non-verbatim). The
 * pre-generation relevance gate only checks retrieval ↔ query; nothing previously
 * checked the generated answer ↔ the source chunk. On a medical-adjacent product
 * the hybrid prompt explicitly invites the model to "combine KB evidence with
 * creative suggestions", so unsupported claims (foods, dosages, protocols) can slip
 * through undetected.
 *
 * Two steps:
 *  1. checkFaithfulness — claim-level entailment check against the KB context.
 *  2. regroundAnswer — if unfaithful, rewrite the answer to drop unsupported claims
 *     while preserving tone, rather than discarding a useful response.
 *
 * Cost: 1 gpt-4o-mini call to detect, +1 only when a correction is needed. Gated to
 * the hybrid KB-grounded path so verbatim and pure-LLM turns are untouched.
 */

import { ChatOpenAI } from "@langchain/openai";

const faithfulnessLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 200,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const regroundLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.2,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export interface FaithfulnessResult {
  grounded: boolean;
  unsupportedClaims: string[];
}

/**
 * Detect claims in `answer` that are not supported by `kbContext`.
 *
 * Returns `grounded: true` with an empty list when every factual claim is backed by
 * the context. On any LLM/parse failure it fails OPEN (grounded: true) so a checker
 * outage never blocks a user response.
 */
export async function checkFaithfulness(
  kbContext: string,
  answer: string
): Promise<FaithfulnessResult> {
  if (!kbContext.trim() || !answer.trim()) {
    return { grounded: true, unsupportedClaims: [] };
  }

  const prompt = `You are a faithfulness checker for a menopause health assistant.
Compare the ANSWER against the KNOWLEDGE BASE CONTEXT. List every FACTUAL claim in the ANSWER that is NOT supported by the CONTEXT (invented foods, dosages, statistics, mechanisms, protocols, etc.). Ignore generic empathy, encouragement, and advice to consult a clinician — those are allowed.

Reply with EXACTLY one of:
- "NONE" if every factual claim is supported.
- Otherwise, one unsupported claim per line, each prefixed with "- ".

KNOWLEDGE BASE CONTEXT:
${kbContext}

ANSWER:
${answer}

Unsupported claims:`;

  try {
    const response = await faithfulnessLLM.invoke(prompt);
    const text = (
      typeof response.content === "string" ? response.content : String(response.content)
    ).trim();

    if (!text || /^none\b/i.test(text)) {
      return { grounded: true, unsupportedClaims: [] };
    }

    const unsupportedClaims = text
      .split("\n")
      .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
      .filter((l) => l.length > 0 && !/^none\b/i.test(l));

    if (unsupportedClaims.length === 0) {
      return { grounded: true, unsupportedClaims: [] };
    }

    console.log(
      `[Faithfulness] ⚠️ ${unsupportedClaims.length} unsupported claim(s) detected:`,
      unsupportedClaims
    );
    return { grounded: false, unsupportedClaims };
  } catch (error) {
    console.error("[Faithfulness] Check failed, treating answer as grounded:", error);
    return { grounded: true, unsupportedClaims: [] };
  }
}

/**
 * Rewrite an answer so it only asserts what the KB context supports, removing the
 * listed unsupported claims while keeping Lisa's tone and formatting.
 *
 * Returns the original answer on failure (better to ship the original than nothing).
 */
export async function regroundAnswer(
  kbContext: string,
  answer: string,
  unsupportedClaims: string[]
): Promise<string> {
  const prompt = `Rewrite the ANSWER below so it ONLY contains information supported by the KNOWLEDGE BASE CONTEXT. Remove or soften these unsupported claims: ${unsupportedClaims
    .map((c) => `"${c}"`)
    .join("; ")}.
Keep the same warm, conversational tone and formatting. Do not introduce any new facts. If removing a claim leaves a gap, replace it with a brief suggestion to consult a healthcare provider rather than inventing details. Output only the rewritten answer.

KNOWLEDGE BASE CONTEXT:
${kbContext}

ANSWER:
${answer}

Rewritten answer:`;

  try {
    const response = await regroundLLM.invoke(prompt);
    const text = (
      typeof response.content === "string" ? response.content : String(response.content)
    ).trim();

    if (!text || text.length < 10) return answer;

    console.log("[Faithfulness] ✅ Answer re-grounded to KB context");
    return text;
  } catch (error) {
    console.error("[Faithfulness] Re-grounding failed, returning original answer:", error);
    return answer;
  }
}

/**
 * Convenience wrapper: check, and reground once if needed.
 * Only meaningful for hybrid KB-grounded answers — callers gate on that.
 */
export async function enforceFaithfulness(
  kbContext: string,
  answer: string
): Promise<{ answer: string; wasCorrected: boolean }> {
  const { grounded, unsupportedClaims } = await checkFaithfulness(kbContext, answer);
  if (grounded) {
    return { answer, wasCorrected: false };
  }
  const corrected = await regroundAnswer(kbContext, answer, unsupportedClaims);
  return { answer: corrected, wasCorrected: corrected !== answer };
}
