/**
 * The only way an alert reaches a user.
 *
 * One `AlertCopy` in, two channels out: a row in `notifications` for the app's
 * Alerts tab, and an Expo push carrying the same title and body. Nothing else
 * in the codebase may write a `notifications` row for a scheduled alert or call
 * `sendPushNotification` directly — that is what let the old system drift into
 * a push and an in-app row that said different things.
 *
 * Idempotency is uniform: every alert carries a `metadata.alert_key` naming the
 * occurrence it is for ("daily_nudge:2026-08-14", "week_start:3"). A key is
 * generated once and never again, so a cron that runs twice, or catches up a
 * day late, cannot double-send.
 */

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushNotification } from "@/lib/sendPushNotification";
import { ALERTS, type AlertCopy, type AlertKind } from "./catalog";

export type AlertRequest = {
  userId: string;
  kind: AlertKind;
  /** The finished words. Built by a copy function in catalog.ts, never inline. */
  copy: AlertCopy;
  /**
   * What occurrence this is — a date, a plan week, a renewal timestamp. Combined
   * with the kind to form `metadata.alert_key`. Must be stable for a given
   * occurrence and never reused for a later one.
   */
  occurrence: string;
};

/**
 * How far back the duplicate check looks.
 *
 * Purely an index optimisation. Occurrence keys embed a date or a monotonic
 * plan week, so no key we generate can recur at all, let alone inside a week.
 */
const DEDUPE_WINDOW_DAYS = 7;

/** Expo requests in flight at once. High enough to be quick, low enough to be polite. */
const PUSH_CONCURRENCY = 8;

/** User ids per `.in()` filter — PostgREST puts the list in the URL. */
const ID_CHUNK = 400;

const alertKey = (kind: AlertKind, occurrence: string) => `${kind}:${occurrence}`;

/**
 * Send one alert. Returns true if it was delivered, false if it was a duplicate.
 *
 * For a whole cohort use `sendAlerts` — it does the same work in three queries
 * instead of three per user.
 */
export async function sendAlert(request: AlertRequest): Promise<boolean> {
  const [delivered] = await sendAlerts([request]);
  return delivered ?? false;
}

/**
 * Send a batch. Returns one boolean per input, in order: true if delivered.
 *
 * The in-app rows go in first, in a single insert. Pushes follow, and a failed
 * push is not a failed alert — the row is already there, so the worst case is
 * that she finds it the next time she opens the app rather than on her lock
 * screen.
 */
export async function sendAlerts(requests: AlertRequest[]): Promise<boolean[]> {
  if (requests.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const results = new Array<boolean>(requests.length).fill(false);

  const keyed = requests.map((request) => ({
    request,
    key: alertKey(request.kind, request.occurrence),
  }));

  // Already sent, on a previous run. Read in URL-sized batches: PostgREST puts
  // the id list in the query string, and a truncated read here would look like
  // "never sent" and notify everyone a second time.
  const since = new Date(Date.now() - DEDUPE_WINDOW_DAYS * 86_400_000).toISOString();
  const uniqueIds = [...new Set(keyed.map((entry) => entry.request.userId))];
  const existingRows: { user_id: string; metadata: unknown }[] = [];

  for (let i = 0; i < uniqueIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("notifications")
      .select("user_id, metadata")
      .in("user_id", uniqueIds.slice(i, i + ID_CHUNK))
      .gte("created_at", since);

    if (error) {
      // We can no longer tell a first send from a repeat. Sending anyway risks
      // notifying the whole base twice; skipping costs one cycle of one alert.
      console.error("sendAlerts: dedupe read failed, sending nothing", error);
      return results;
    }
    existingRows.push(...(data ?? []));
  }

  const alreadySent = new Set(
    existingRows
      .map((row) => {
        const key = (row.metadata as { alert_key?: string } | null)?.alert_key;
        return key ? `${row.user_id}|${key}` : null;
      })
      .filter((entry): entry is string => entry !== null)
  );

  // Two requests for the same occurrence inside one batch are also duplicates.
  const seenInBatch = new Set<string>();
  const fresh: { index: number; request: AlertRequest; key: string }[] = [];

  keyed.forEach((entry, index) => {
    const identity = `${entry.request.userId}|${entry.key}`;
    if (alreadySent.has(identity) || seenInBatch.has(identity)) return;
    seenInBatch.add(identity);
    fresh.push({ index, request: entry.request, key: entry.key });
  });

  if (fresh.length === 0) return results;

  const { error: insertError } = await supabase.from("notifications").insert(
    fresh.map(({ request, key }) => {
      const spec = ALERTS[request.kind];
      return {
        user_id: request.userId,
        type: spec.type,
        title: request.copy.title,
        message: request.copy.body,
        priority: spec.alwaysDeliver ? "high" : "medium",
        seen: false,
        dismissed: false,
        metadata: {
          alert_kind: request.kind,
          alert_key: key,
          screen: spec.screen,
        },
      };
    })
  );

  if (insertError) {
    // No row means no dedupe record, so a push now would be re-sent tomorrow
    // with nothing to stop it. Fail both channels together.
    console.error("sendAlerts: insert failed, no pushes sent", insertError);
    return results;
  }

  fresh.forEach(({ index }) => {
    results[index] = true;
  });

  await mapLimit(fresh, PUSH_CONCURRENCY, async ({ request }) => {
    const spec = ALERTS[request.kind];
    await sendPushNotification({
      userId: request.userId,
      // The same strings that went into the row above. Never re-worded here.
      title: request.copy.title,
      body: request.copy.body,
      data: pushData(spec.screen),
      skipPreferenceCheck: spec.alwaysDeliver ?? false,
    }).catch(() => {});
  });

  return results;
}

/**
 * Deep-link payload the app reads in `addNotificationResponseReceivedListener`.
 *
 * Billing lives on the web, so an account alert asks the app to open the
 * billing entry point rather than naming a screen it does not have.
 */
function pushData(screen: string): Record<string, string> {
  return screen === "Account" ? { action: "upgrade" } : { screen };
}

/** Run `worker` over `items`, at most `limit` at a time. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}
