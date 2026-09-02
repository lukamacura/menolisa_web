import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * One ping per funnel screen reached. The `/register` funnel's only measurement.
 *
 * **This route is deliberately unauthenticated, and that is the whole point.**
 * The funnel mints her account at step 17 of 17, so any check that required a
 * session would measure only the women who already finished — which is the
 * number we already have and the one that explains nothing. The first paid
 * campaign put ~200 landing page views into a funnel that produced 10 profiles,
 * and not one row anywhere said which of the seventeen screens the other 190
 * left on.
 *
 * Being unauthenticated makes the payload the entire attack surface, so it is
 * kept to three bounded values and nothing is trusted:
 *
 *   - `session_id` must parse as a uuid. It is minted in the browser per visit
 *     and identifies a visit, not a person; it is never joined to `auth.users`
 *     and this route never reads a session.
 *   - `step` is shape-checked against `/^[a-z0-9_]{1,32}$/`, not an allowlist.
 *     An allowlist would be a second copy of `STEPS` in a second file, and this
 *     repo has lost that bet before; since the endpoint is open either way, a
 *     list would not stop pollution with *valid* names, so it buys accuracy it
 *     cannot actually deliver. Bounded shape is what keeps it safe.
 *   - `step_index` must be an integer in 0..40.
 *
 * Anything else is a 400 and writes nothing. Note what is absent: no user id
 * (never take one from a request body — see `/api/intake`'s history), no free
 * text, no answers. **Never add the answer she gave on the screen.** The safety
 * argument for storing this at all is that a leak would disclose that somebody
 * reached question 9 and nothing more; a symptom or a goal here would make it
 * health data about a re-identifiable visit, which is the exact thing
 * `sendMetaLead` had to stop doing on 2026-08-30.
 *
 * Known and accepted: an open endpoint can be spammed to inflate the table. The
 * rows are tiny and bounded, the drop-off curve is read as a shape rather than
 * an absolute, and the alternative — the funnel staying unmeasurable — is worse.
 * If it ever becomes a problem the answer is a rate limit at the edge, not a
 * field in the body.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEP_RE = /^[a-z0-9_]{1,32}$/;
const MAX_STEP_INDEX = 40;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const { session_id: sessionId, step, step_index: stepIndex } =
    (body ?? {}) as Record<string, unknown>;

  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof step !== "string" || !STEP_RE.test(step)) {
    return new NextResponse(null, { status: 400 });
  }
  if (
    typeof stepIndex !== "number" ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex > MAX_STEP_INDEX
  ) {
    return new NextResponse(null, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("funnel_events")
    .insert({ session_id: sessionId, step, step_index: stepIndex });

  if (error) {
    // Logged, never surfaced. A failed measurement must not be visible to her:
    // the client fires this with `keepalive` and ignores the response, and a
    // 500 here would put a red line in the console of a woman mid-quiz.
    console.error("funnel-step insert failed:", error);
  }

  // 204 whatever happened, for the same reason.
  return new NextResponse(null, { status: 204 });
}
