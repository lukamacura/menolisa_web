import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAccountState, TRIAL_SELECT_COLS, type AccountStateRow } from "@/lib/getAccountState";
import { weeklyRecapCopy } from "@/lib/alerts/catalog";
import { sendAlerts, type AlertRequest } from "@/lib/alerts/send";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The Sunday recap — the last engagement alert still sent from a server.
 *
 * Everything else that used to run here (the morning plan nudge, the streak
 * warning, the week-start note) now runs **on the phone**, as local
 * notifications, and this route is what is left after that move. See
 * `src/lib/reminders/types.ts` in the mobile app for why:
 *
 *   - a cron fires at one UTC wall time for every user on earth, which is 04:00
 *     for a woman on the US east coast and the reason none of those alerts could
 *     ever be given a time of day;
 *   - a cron cannot cancel a reminder the moment she ticks the box.
 *
 * The recap is the one alert with neither problem and one hard requirement the
 * phone cannot meet: it counts symptom logs across a whole week, which lives in
 * the database and nowhere else. It also has to reach a woman who has not opened
 * the app in seven days — which is precisely the case where a device-scheduled
 * notification has nothing to say.
 *
 * Everything is bulk-read. The old version ran three or four queries *per user*
 * inside a loop, which is what capped it at a few hundred accounts per run.
 *
 * Timezone caveat: "this week" is the UTC week, and the send is at one wall
 * clock for everyone. It matters far less for a weekly summary than it did for
 * "time to hydrate", but it is still the reason nothing else lives here.
 */

const DAY = 86_400_000;
const asUtc = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
const addDays = (d: string, n: number) => new Date(asUtc(d) + n * DAY).toISOString().slice(0, 10);

/**
 * User ids per `.in()` filter.
 *
 * PostgREST puts the list in the query string, so one call covering the whole
 * base eventually exceeds the URL limit — and it fails by returning fewer rows,
 * not by erroring. A short read here would silently under-count somebody's week.
 */
const ID_CHUNK = 400;

/**
 * Run an `.in("user_id", …)` read in URL-sized batches and concatenate.
 *
 * The row type is asserted rather than inferred: the generated Supabase types
 * describe an embedded `symptoms (name)` as an array, while PostgREST returns a
 * single object for a many-to-one join.
 */
async function selectByUser<T>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

type SymptomRow = { user_id: string; symptoms?: { name?: string } | { name?: string }[] | null };

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = addDays(today, -6);
    const supabase = getSupabaseAdmin();

    // ---- who is eligible at all ------------------------------------------
    //
    // Both switches, because the app writes both to one value: `notification_enabled`
    // is the master and `weekly_insights_enabled` is this alert's own flag, and
    // either being off means she has said no to the recap.
    const { data: prefRows, error: prefError } = await supabase
      .from("user_preferences")
      .select("user_id")
      .eq("notification_enabled", true)
      .eq("weekly_insights_enabled", true);

    if (prefError) {
      console.error("cron/weekly-recap: preference read failed", prefError);
      return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
    }

    const candidateIds = (prefRows ?? []).map((row) => row.user_id as string);
    if (candidateIds.length === 0) {
      return NextResponse.json({ ok: true, considered: 0, sent: 0 });
    }

    // Access is the server's decision, never re-derived from raw columns here.
    const trialRows = await selectByUser<{ user_id: string }>(candidateIds, (batch) =>
      supabase.from("user_trials").select(`user_id, ${TRIAL_SELECT_COLS}`).in("user_id", batch)
    );

    const withAccess = new Set(
      trialRows
        .filter((row) => getAccountState(row as unknown as AccountStateRow).hasAccess)
        .map((row) => row.user_id)
    );

    const userIds = candidateIds.filter((id) => withAccess.has(id));
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, considered: candidateIds.length, sent: 0 });
    }

    // ---- the seven days behind her ---------------------------------------
    const [logRows, symptomRows] = await Promise.all([
      selectByUser<{ user_id: string; date: string }>(userIds, (batch) =>
        supabase
          .from("user_plan_logs")
          .select("user_id, date")
          .in("user_id", batch)
          .gte("date", weekAgo)
          .lte("date", today)
      ),
      selectByUser<SymptomRow>(userIds, (batch) =>
        supabase
          .from("symptom_logs")
          .select("user_id, symptoms (name)")
          .in("user_id", batch)
          .gte("logged_at", `${weekAgo}T00:00:00Z`)
      ),
    ]);

    /** Distinct active dates per user — a day counts if she touched anything at all. */
    const activeDates = new Map<string, Set<string>>();
    for (const row of logRows) {
      const set = activeDates.get(row.user_id) ?? new Set<string>();
      set.add(row.date);
      activeDates.set(row.user_id, set);
    }

    /** Symptom names per user. Empty strings keep the count right when a join misses. */
    const symptomsByUser = new Map<string, string[]>();
    for (const row of symptomRows) {
      const joined = Array.isArray(row.symptoms) ? row.symptoms[0] : row.symptoms;
      const list = symptomsByUser.get(row.user_id) ?? [];
      list.push(joined?.name ?? "");
      symptomsByUser.set(row.user_id, list);
    }

    const requests: AlertRequest[] = userIds.map((userId) => {
      const logged = symptomsByUser.get(userId) ?? [];
      return {
        userId,
        kind: "weekly_recap" as const,
        copy: weeklyRecapCopy({
          activeDays: (activeDates.get(userId) ?? new Set()).size,
          symptomCount: logged.length,
          topSymptom: mostFrequent(logged.filter(Boolean)),
        }),
        occurrence: today,
      };
    });

    const delivered = (await sendAlerts(requests)).filter(Boolean).length;

    return NextResponse.json({
      ok: true,
      considered: userIds.length,
      sent: delivered,
    });
  } catch (e) {
    console.error("cron/weekly-recap error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function mostFrequent(names: string[]): string | null {
  if (names.length === 0) return null;
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
