/**
 * Send push notifications via Expo Push API.
 * Uses the same title and body as the in-app notification for copy consistency.
 */

import { getSupabaseAdmin } from "./supabaseAdmin";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type SendPushOptions = {
  userId: string;
  title: string;
  body: string;
  /** Optional data for deep linking (e.g. { screen: "Notifications", action: "upgrade" }) */
  data?: Record<string, string>;
  /** If true, send even when user has notification_enabled false (e.g. trial/urgent) */
  skipPreferenceCheck?: boolean;
};

/**
 * Load push tokens for a user. Optionally skip if notification_enabled is false (for non-urgent).
 */
async function getPushTokensForUser(
  userId: string,
  skipPreferenceCheck: boolean
): Promise<string[]> {
  const supabase = getSupabaseAdmin();

  if (!skipPreferenceCheck) {
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("notification_enabled")
      .eq("user_id", userId)
      .single();
    if (prefs?.notification_enabled === false) {
      return [];
    }
  }

  const { data: rows, error } = await supabase
    .from("user_push_tokens")
    .select("token")
    .eq("user_id", userId);

  if (error) {
    console.error("sendPushNotification: failed to load tokens", error);
    return [];
  }

  const tokens = (rows ?? [])
    .map((r) => r.token)
    .filter((t): t is string => typeof t === "string" && t.length > 0);
  return tokens;
}

/**
 * Send push notification to all devices for a user.
 * Uses the same title and body as the in-app notification.
 */
export async function sendPushNotification({
  userId,
  title,
  body,
  data,
  skipPreferenceCheck = false,
}: SendPushOptions): Promise<void> {
  const tokens = await getPushTokensForUser(userId, skipPreferenceCheck);
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  }));

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Expo Push API error", res.status, text);
      return;
    }

    const result = await res.json();
    const receipt = Array.isArray(result) ? result : result?.data ?? result;
    if (!Array.isArray(receipt)) return;

    // Expo answers one ticket per message, in the order they were sent, so the
    // index is what says *which* device failed.
    const failed = (receipt as PushTicket[])
      .map((ticket, index) => ({ ticket, token: tokens[index] }))
      .filter(({ ticket }) => ticket?.status === "error");

    if (failed.length === 0) return;
    console.warn(
      "sendPushNotification: some push failed",
      failed.map(({ ticket }) => ticket)
    );

    await pruneDeadTokens(
      failed
        .filter(({ ticket }) => ticket.details?.error === "DeviceNotRegistered")
        .map(({ token }) => token)
    );
  } catch (e) {
    console.error("sendPushNotification: request failed", e);
  }
}

type PushTicket = {
  status?: string;
  details?: { error?: string };
};

/**
 * Delete tokens Expo has told us are dead.
 *
 * Without this the table only ever grows: every reinstall, every restore onto a
 * new phone and every dev rebuild mints a token and abandons the old one, and
 * the account goes on pushing to each of them forever. Worse, Expo recycles
 * tokens — so one left on a stranger's row is how a woman's alerts eventually
 * land on somebody else's lock screen.
 *
 * `DeviceNotRegistered` is the only error safe to act on. The rest
 * (`MessageRateExceeded`, `MessageTooBig`, a transient Expo fault) say nothing
 * about whether the device still exists, and deleting on those would unsubscribe
 * a live phone over a bad afternoon.
 */
async function pruneDeadTokens(tokens: (string | undefined)[]): Promise<void> {
  const dead = tokens.filter((token): token is string => !!token);
  if (dead.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("user_push_tokens").delete().in("token", dead);

  if (error) {
    // Best effort: the alert itself already went out, and a token that survives
    // one prune is deleted by the next send that fails the same way.
    console.error("sendPushNotification: failed to prune dead tokens", error);
    return;
  }
  console.info(`sendPushNotification: pruned ${dead.length} dead token(s)`);
}
