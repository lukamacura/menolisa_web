/**
 * Records what each OpenAI call cost, one row per call, in `llm_usage`.
 *
 * The point is a single number on the admin panel: what one 8-week plan costs
 * to generate, against the $59 it sold for. Generating a plan is two calls (the
 * weeks and the ten nutrition reasons), so the rows carry a shared `run_id` —
 * cost *per generation* is a sum over that id, not an average over rows.
 *
 * Never throws and never blocks the thing it is measuring. Metering a plan is
 * worth strictly less than the plan, so a failed insert is a logged line and
 * nothing more.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { costUsd, tokensFromUsage } from "@/lib/llmCost";

/** What the call was for. Free-form in the DB; keep new values short and stable. */
export type LlmUsageKind = "plan_weeks" | "plan_nutrition_why";

type OpenAiUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
} | null | undefined;

export async function recordLlmUsage(entry: {
  userId?: string | null;
  /** Groups the calls that made up one logical generation. */
  runId: string;
  kind: LlmUsageKind;
  model: string;
  usage: OpenAiUsage;
  /** Wall-clock time of the call, for spotting slow generations later. */
  durationMs?: number;
}): Promise<void> {
  try {
    const tokens = tokensFromUsage(entry.usage);
    const { error } = await getSupabaseAdmin().from("llm_usage").insert({
      user_id: entry.userId ?? null,
      run_id: entry.runId,
      kind: entry.kind,
      model: entry.model,
      prompt_tokens: tokens.promptTokens,
      cached_prompt_tokens: tokens.cachedPromptTokens,
      completion_tokens: tokens.completionTokens,
      cost_usd: costUsd(entry.model, tokens),
      duration_ms: entry.durationMs ?? null,
    });
    if (error) console.error("LLM usage: insert failed:", error);
  } catch (err) {
    console.error("LLM usage: insert threw:", err);
  }
}
