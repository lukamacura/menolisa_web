import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** Plan task key (e.g. "w2_protein_25_30g") or "habit_<uuid>". */
  taskKey: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean().default(true),
  /**
   * How many times so far today, for anything ticked more than once: movement
   * snacks, and the nutrition rows with a target above 1 (protein, fat, fiber
   * and the post-meal walk are per meal, water is per glass). It replaces the
   * stored count rather than adding to it, so the client sends the new total.
   */
  count: z.number().int().min(1).max(20).default(1),
  note: z.string().max(500).nullable().optional(),
});

/**
 * How far back a tick may be attributed, in days. Offline replay is the reason
 * this is not zero: the app queues taps made without signal and flushes them on
 * reconnect, and a woman who trains on a Friday in a gym basement and reopens
 * the app on Sunday is telling the truth.
 *
 * It is not unbounded, because the 8-week refund guarantee is measured off these
 * rows (see the guarantee section of /terms). With no floor, all 56 days could
 * be ticked in one afternoon of week eight and clear the 90% threshold without
 * a single session having happened. A week is long enough for every honest
 * offline case and far too short to reconstruct a plan she never did.
 */
const MAX_BACKFILL_DAYS = 7;

/**
 * Ticks or un-ticks one task for one day. The (user, task, date) primary key
 * makes this idempotent, so the mobile app can safely replay a queued tap it
 * made offline without double-counting.
 *
 * `date` is the day the work is attributed to and comes from the client;
 * `updated_at` is when we actually recorded it and is stamped here. The two are
 * deliberately separate — the guarantee calculation reads both, so bulk
 * backfilling is visible rather than silent.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (await checkTrialExpired(user.id)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { taskKey, date, done, count, note } = parsed.data;

  // Bound the attribution window. Anything older than MAX_BACKFILL_DAYS is
  // outside what offline replay can honestly explain, and a date far in the
  // future is work that has not happened. Un-ticking is exempt: correcting an
  // old mistake downward is never abuse.
  //
  // The +1 day of headroom is not slack, it is timezones. `date` is *her* local
  // calendar day and this comparison is in UTC, so a woman in Auckland ticking
  // Friday's session at 10am is sending a date UTC has not reached yet. Without
  // the allowance every user ahead of UTC would be told her own plan is in the
  // future — the kind of bug that only ever shows up in the half of the world
  // nobody tested from.
  if (done) {
    const now = Date.now();
    const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const latest = dayKey(now + 86_400_000);
    const earliest = dayKey(now - MAX_BACKFILL_DAYS * 86_400_000);
    if (date > latest || date < earliest) {
      return NextResponse.json(
        { error: "Date out of range", earliest, latest },
        { status: 400 }
      );
    }
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (!done) {
    const { error } = await supabaseAdmin
      .from("user_plan_logs")
      .delete()
      .match({ user_id: user.id, task_key: taskKey, date });
    if (error) {
      console.error("Plan: un-complete failed:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }
    return NextResponse.json({ taskKey, date, count: 0 });
  }

  const { error } = await supabaseAdmin.from("user_plan_logs").upsert(
    { user_id: user.id, task_key: taskKey, date, count, note: note ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id,task_key,date" }
  );
  if (error) {
    console.error("Plan: complete failed:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ taskKey, date, count });
}
