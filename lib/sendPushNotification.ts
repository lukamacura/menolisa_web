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
    if (Array.isArray(receipt)) {
      const errors = receipt.filter(
        (r: { status?: string }) => r.status === "error"
      );
      if (errors.length > 0) {
        console.warn("sendPushNotification: some push failed", errors);
      }
    }
  } catch (e) {
    console.error("sendPushNotification: request failed", e);
  }
}
