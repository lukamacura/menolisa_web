/**
 * Server-side rows in `funnel_events` — the steps that happen after her
 * browser has left the funnel (Stripe, the webhook) or that carry a token the
 * client must not be allowed to invent.
 *
 * Same table, same rules as `POST /api/funnel-step`: a visit id, a screen
 * name, a position, never a user id, never a quiz answer. The one addition is
 * `detail`, a single allowlisted token used by `paywall_exit` alone.
 *
 * The visit id: the browser mints it (`lib/funnelClient.ts`), passes it to
 * `create-checkout`, which stamps it on the Checkout Session and subscription
 * metadata as `funnel_session_id` — so the webhook can key `purchase_completed`
 * and `subscription_canceled` to the same visit that walked the quiz. When no
 * id survived (a mobile checkout, a subscription from before this shipped) the
 * row gets a fresh uuid: it still counts once, it just cannot be joined to a
 * screen curve. That is the honest fallback; a user id is not.
 */
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERVER_FUNNEL_STEPS,
  IS_TEST_METADATA_KEY,
  FUNNEL_SESSION_METADATA_KEY,
  isFunnelSessionId,
  type ServerFunnelStep,
  type PaywallExitReason,
} from "@/lib/funnelSteps";

export {
  SERVER_FUNNEL_STEPS,
  PAYWALL_EXIT_REASONS,
  UUID_RE,
  FUNNEL_SESSION_METADATA_KEY,
  IS_TEST_METADATA_KEY,
  isPaywallExitReason,
  isFunnelSessionId,
} from "@/lib/funnelSteps";
export type { ServerFunnelStep, PaywallExitReason } from "@/lib/funnelSteps";

export function isTestFromMetadata(metadata: Record<string, string> | null | undefined): boolean {
  return metadata?.[IS_TEST_METADATA_KEY] === "1";
}

export function funnelSessionFromMetadata(
  metadata: Record<string, string> | null | undefined
): string | null {
  const v = metadata?.[FUNNEL_SESSION_METADATA_KEY];
  return isFunnelSessionId(v) ? v : null;
}

/**
 * Insert one row. Never throws — a failed measurement must not fail a webhook
 * (Stripe would retry and re-run the account update) or a checkout.
 */
export async function logFunnelEvent(
  supabaseAdmin: SupabaseClient,
  opts: {
    step: ServerFunnelStep;
    sessionId?: string | null;
    detail?: PaywallExitReason | null;
    isTest?: boolean;
  }
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("funnel_events").insert({
      session_id: isFunnelSessionId(opts.sessionId) ? opts.sessionId : randomUUID(),
      step: opts.step,
      step_index: SERVER_FUNNEL_STEPS[opts.step],
      detail: opts.detail ?? null,
      is_test: !!opts.isTest,
    });
    if (error) console.error(`funnel_events ${opts.step} insert failed:`, error);
  } catch (e) {
    console.error(`funnel_events ${opts.step} insert threw:`, e);
  }
}
