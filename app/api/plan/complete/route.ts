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
  /** For per_day tasks (movement snacks): how many times so far today. */
  count: z.number().int().min(1).max(20).default(1),
  note: z.string().max(500).nullable().optional(),
});

/**
 * Ticks or un-ticks one task for one day. The (user, task, date) primary key
 * makes this idempotent, so the mobile app can safely replay a queued tap it
 * made offline without double-counting.
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
