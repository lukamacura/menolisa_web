import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { checkTrialExpired } from "@/lib/checkTrialStatus";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const MAX_HABITS = 10;

const BodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  /**
   * "build" is something she adds; "resist" is a temptation she gets credit for
   * not giving in to. Same tick, different reward — resist is scored on streak.
   * Defaults to build so an older client that doesn't send it still works.
   */
  kind: z.enum(["build", "resist"]).default("build"),
});

/** The habits she picks herself — the fourth pillar. Completion goes through /api/plan/complete. */
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
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const { title, kind } = parsed.data;

  const supabaseAdmin = getSupabaseAdmin();

  const { count } = await supabaseAdmin
    .from("user_habits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_HABITS) {
    return NextResponse.json({ error: `You can track up to ${MAX_HABITS} habits` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_habits")
    .insert({ user_id: user.id, title, kind })
    .select("id, title, kind")
    .single();

  if (error) {
    console.error("Plan: habit create failed:", error);
    return NextResponse.json({ error: "Failed to add habit" }, { status: 500 });
  }

  return NextResponse.json(
    { habit: { ...data, doneToday: 0, streak: 0, bestStreak: 0 } },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Scoped to the caller, so an id from another account deletes nothing.
  const { error } = await supabaseAdmin.from("user_habits").delete().match({ id, user_id: user.id });
  if (error) {
    console.error("Plan: habit delete failed:", error);
    return NextResponse.json({ error: "Failed to remove habit" }, { status: 500 });
  }

  // Its completion history would otherwise linger as orphaned rows.
  await supabaseAdmin.from("user_plan_logs").delete().match({ user_id: user.id, task_key: `habit_${id}` });

  return NextResponse.json({ ok: true });
}
