-- ─── funnel_dropoff / funnel_daily: an upper bound on the window ────────────
--
-- 2026-09-09. `/admin`'s funnel block gained a day picker, so the window can
-- now end somewhere other than "now" — "show me 1–5 September" has to mean
-- those five days and not "1 September onwards".
--
-- Both functions take `until` as an **exclusive** end, defaulted to null so an
-- older deploy calling them with the arguments it already knows about keeps
-- working exactly as before. That default is what makes this safe to apply
-- ahead of the deploy rather than in lockstep with it.
--
-- The old signatures are dropped rather than left beside the new ones: a
-- 1-argument `funnel_dropoff` next to a 2-argument one whose second argument
-- has a default is an ambiguous call, and Postgres resolves that at call time
-- with an error rather than at creation time with one.
--
-- `security invoker` (the default) on purpose, as before: service_role bypasses
-- RLS entirely, so this needs no elevated rights, and a SECURITY DEFINER
-- function over `funnel_events` would be a way to read it without the service
-- role. Don't add it.

drop function if exists public.funnel_dropoff(timestamptz);
create or replace function public.funnel_dropoff(
  since timestamptz,
  until timestamptz default null
)
returns table (step_index smallint, step text, sessions bigint)
language sql
stable
as $$
  select (array_agg(e.step_index order by e.created_at desc))[1]::smallint,
         e.step,
         count(distinct e.session_id)
    from public.funnel_events e
   where e.created_at >= since
     and (until is null or e.created_at < until)
     and not e.is_test
   group by e.step
   order by 1;
$$;

drop function if exists public.funnel_daily(timestamptz, int);
create or replace function public.funnel_daily(
  since timestamptz,
  tz_offset_minutes int,
  until timestamptz default null
)
returns table (day date, step text, sessions bigint)
language sql
stable
as $$
  select (e.created_at - make_interval(mins => tz_offset_minutes))::date as day,
         e.step,
         count(distinct e.session_id)
    from public.funnel_events e
   where e.created_at >= since
     and (until is null or e.created_at < until)
     and not e.is_test
   group by 1, 2
   order by 1, 2;
$$;

-- All three, always. Postgres grants EXECUTE to PUBLIC by default *and*
-- Supabase ships an ALTER DEFAULT PRIVILEGES that hands anon/authenticated
-- their own direct grant at creation time; revoking either side alone leaves
-- the other and the function stays callable with the anon key. These are fresh
-- functions (the old ones were dropped), so the previous revokes do not carry.
revoke all on function public.funnel_dropoff(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.funnel_daily(timestamptz, int, timestamptz)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Verify — all four must be false.
--   select has_function_privilege('anon', 'public.funnel_dropoff(timestamptz, timestamptz)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_dropoff(timestamptz, timestamptz)', 'EXECUTE');
--   select has_function_privilege('anon', 'public.funnel_daily(timestamptz, int, timestamptz)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_daily(timestamptz, int, timestamptz)', 'EXECUTE');
