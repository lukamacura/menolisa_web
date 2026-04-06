import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionProvider = "apple" | "stripe" | "google";

export type SubscriptionWriteInput = {
  userId: string;
  provider: SubscriptionProvider;
  /** True iff the subscription is currently in a paid period. */
  active: boolean;
  /** ISO timestamp when access ends, or null if unknown. */
  expiresAt: string | null;
  /** Whether auto-renew has been canceled / sub will not renew. */
  canceled: boolean;
  productId?: string | null;
  originalTransactionId?: string | null;
  /** Apple receipt blob — never returned to clients. */
  latestReceipt?: string | null;
  /** Provider-specific extra columns to merge into the upsert (stripe_*). */
  extras?: Record<string, unknown>;
};

export type SubscriptionWriteResult =
  | { written: true }
  | { written: false; reason: "conflict_with_other_provider"; existingProvider: SubscriptionProvider };

/**
 * Conflict-aware write into user_trials.
 *
 * Rules:
 *  - If no row exists → upsert.
 *  - If existing row has the same provider (or null provider) → upsert.
 *  - If existing row has a DIFFERENT provider:
 *      - Allow overwrite ONLY when the incoming sub is active AND the existing one is not.
 *      - Otherwise skip the write and log a conflict.
 *
 * This prevents an old/stale Apple sandbox receipt from clobbering a real Stripe subscriber
 * (and vice versa).
 */
export async function writeSubscription(
  supabaseAdmin: SupabaseClient,
  input: SubscriptionWriteInput
): Promise<SubscriptionWriteResult> {
  const { data: existing, error: readError } = await supabaseAdmin
    .from("user_trials")
    .select("provider, account_status, subscription_ends_at")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (readError && readError.code !== "PGRST116") {
    console.error("writeSubscription: read failed", readError);
  }

  const existingProvider = (existing?.provider ?? null) as SubscriptionProvider | null;
  if (existingProvider && existingProvider !== input.provider) {
    const existingEndsMs = existing?.subscription_ends_at
      ? new Date(existing.subscription_ends_at).getTime()
      : 0;
    const existingActive =
      existing?.account_status === "paid" && (!existingEndsMs || existingEndsMs > Date.now());

    if (!(input.active && !existingActive)) {
      console.warn(
        `writeSubscription: provider conflict for user ${input.userId}: existing=${existingProvider} (active=${existingActive}), incoming=${input.provider} (active=${input.active}). Skipping write.`
      );
      return { written: false, reason: "conflict_with_other_provider", existingProvider };
    }
  }

  const row: Record<string, unknown> = {
    user_id: input.userId,
    provider: input.provider,
    account_status: input.active ? "paid" : "expired",
    subscription_ends_at: input.expiresAt,
    subscription_canceled: input.canceled,
    updated_at: new Date().toISOString(),
    ...(input.productId !== undefined && { product_id: input.productId }),
    ...(input.originalTransactionId !== undefined && {
      original_transaction_id: input.originalTransactionId,
    }),
    ...(input.latestReceipt !== undefined && { latest_receipt: input.latestReceipt }),
    ...(input.extras ?? {}),
  };

  const { error } = await supabaseAdmin.from("user_trials").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("writeSubscription: upsert failed", error);
    throw error;
  }
  return { written: true };
}
