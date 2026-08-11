/**
 * What a model call cost us, in dollars.
 *
 * OpenAI bills per token and publishes the rates per million; this table is a
 * hand-copied snapshot of them, so it drifts the moment OpenAI changes a price
 * or we point a call at a model that isn't listed. Two rules keep that drift
 * visible instead of silent:
 *
 *  - An unknown model returns `null`, never `0`. A zero would quietly report
 *    "the 8-week plan costs nothing to generate", which is the one wrong answer
 *    the admin panel must never give. The caller stores the tokens anyway and
 *    the panel counts the unpriced calls out loud.
 *  - The cost is computed once, at the moment of the call, and stored on the
 *    row. Recomputing historical spend against today's price list would rewrite
 *    what we actually paid every time OpenAI moves a number.
 *
 * Rates below are USD per 1,000,000 tokens, as of 2026-08-11.
 */

export type ModelRate = {
  /** Fresh input tokens. */
  input: number;
  /** Input tokens served from OpenAI's prompt cache — roughly half price. */
  cachedInput: number;
  /** Generated tokens. Embedding models have none. */
  output: number;
};

const PER_MILLION: Record<string, ModelRate> = {
  // Chat — the 8-week plan and Lisa both run on 4o-mini.
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  // Embeddings — knowledge-base ingest and every RAG query.
  "text-embedding-3-large": { input: 0.13, cachedInput: 0.13, output: 0 },
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
};

/** Tokens as OpenAI reports them, flattened to what pricing actually depends on. */
export type TokenCounts = {
  promptTokens: number;
  /** Subset of `promptTokens` that hit the prompt cache. */
  cachedPromptTokens: number;
  completionTokens: number;
};

/**
 * Dated model ids (`gpt-4o-mini-2024-07-18`) bill at the base model's rate, so
 * fall back to the longest listed prefix rather than calling them unknown.
 */
function rateFor(model: string): ModelRate | null {
  const exact = PER_MILLION[model];
  if (exact) return exact;
  const prefix = Object.keys(PER_MILLION)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? PER_MILLION[prefix] : null;
}

/** `null` when the model isn't priced here — see the note at the top of the file. */
export function costUsd(model: string, tokens: TokenCounts): number | null {
  const rate = rateFor(model);
  if (!rate) return null;
  const fresh = Math.max(0, tokens.promptTokens - tokens.cachedPromptTokens);
  const dollars =
    (fresh * rate.input +
      tokens.cachedPromptTokens * rate.cachedInput +
      tokens.completionTokens * rate.output) /
    1_000_000;
  // Six decimals: a single 4o-mini call lands around $0.0003, and rounding to
  // cents would store every one of them as zero.
  return Math.round(dollars * 1e6) / 1e6;
}

/** Normalizes an OpenAI `completion.usage` object, which is optional on every response. */
export function tokensFromUsage(usage: {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
} | null | undefined): TokenCounts {
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    cachedPromptTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}
