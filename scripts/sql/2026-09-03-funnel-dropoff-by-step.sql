-- ─── funnel_dropoff: group by screen, not by position ───────────────────────
--
-- 2026-09-03. The original (2026-09-02) grouped by `step_index` and labelled
-- each group `min(step)`, on the stated assumption that "a step is only ever
-- renamed, never moved". That assumption died the next day: the quiz reordered
-- so that symptoms is question 1 and age is question 2, which swaps their two
-- positions.
--
-- The failure is silent and looks like a working panel. For any window spanning
-- the reorder, position 1 holds old `q1_age` rows plus new `q4_symptoms` rows,
-- and position 2 holds the mirror image. `min()` picks `q1_age` for BOTH, so
-- /admin renders two rows with the same label, no symptoms row at all, and two
-- counts that are each a blend of two different screens — for a full 30 days,
-- i.e. exactly the window in which you are trying to read whether the reorder
-- worked.
--
-- So the grouping key is the screen itself, which is the thing being measured.
-- A moved step keeps one honest row, and its position in the returned ordering
-- is the position it was LAST seen at — the funnel as it stands today, not as
-- it stood at the start of the window. `step_index` keeps its name and its type
-- so /api/admin/stats needs no change: it is still "where this screen sits",
-- just no longer the grouping key.
--
-- One artefact worth knowing rather than hiding: across a reorder the curve is
-- not strictly monotonic, because the two swapped screens were each seen by
-- almost everyone, in different orders. That is the truth about a window with
-- two funnels in it, and it resolves on its own once the old rows age out.
--
-- `security invoker` (the default) on purpose: service_role bypasses RLS
-- entirely, so this needs no elevated rights, and a SECURITY DEFINER function
-- over a table would be a way to read it without the service role. Don't add it.
create or replace function public.funnel_dropoff(since timestamptz)
returns table (step_index smallint, step text, sessions bigint)
language sql
stable
as $$
  select (array_agg(e.step_index order by e.created_at desc))[1]::smallint,
         e.step,
         count(distinct e.session_id)
    from public.funnel_events e
   where e.created_at >= since
   group by e.step
   order by 1;
$$;

-- All three, always. Postgres grants EXECUTE to PUBLIC by default *and* Supabase
-- ships an ALTER DEFAULT PRIVILEGES that hands anon/authenticated their own
-- direct grant at creation time; revoking either side alone leaves the other and
-- the function stays callable with the anon key. CREATE OR REPLACE preserves the
-- 2026-09-02 revoke, but never assume it — run this and then check.
revoke all on function public.funnel_dropoff(timestamptz) from public, anon, authenticated;

-- Verify — must be false, both of them.
--   select has_function_privilege('anon', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
