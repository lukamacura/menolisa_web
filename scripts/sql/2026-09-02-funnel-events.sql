-- One row per funnel screen reached, for the /register web2app funnel.
--
-- Why this exists
-- ---------------
-- The funnel mints her account at step 17 of 17 (the anonymous sign-in behind
-- the calculating loader), so until 2026-09-02 the first sixteen screens
-- produced no server-side record of any kind. On the first paid campaign that
-- meant ~200 landing page views, 10 quiz finishers, and no way whatsoever to say
-- which of the seventeen screens the other 190 left on. Every ranking of the
-- suspects — the length, the metric units on q_body, the iOS viewport overshoot
-- on the start screen — was a guess, and the fixes shipped alongside this table
-- are unfalsifiable without it.
--
-- What it is deliberately NOT
-- --------------------------
--   * Not a Meta event. Aggregated Event Measurement caps the domain at 8
--     prioritized events and a custom event ranked above `Purchase` costs real
--     attributable conversions — that is exactly why the seven custom funnel
--     events were removed on 2026-08-17, and re-adding them is in the "decided
--     against" table. "Which screen leaks" is a product question and belongs in
--     our own database, which is what this is.
--   * Not keyed to a user. There is no `user_id` column, because for sixteen of
--     the seventeen screens there is no user yet. `session_id` is a random uuid
--     minted in the browser per visit; it identifies a *visit*, not a person, and
--     nothing here can be joined back to `auth.users`. That is also why this
--     table is exempt from the on-delete-cascade rule every other user table
--     follows — there is no identifier to cascade from.
--   * Not health data. `step` is a screen name. Never add the answer she gave on
--     it: this table's whole safety argument is that a leak of it would disclose
--     that someone reached question 9, and nothing else.
--
-- Retention is the operator's call; a month of this is enough to rank the
-- screens, and `created_at` is indexed so a periodic delete is cheap.
--
-- Service-role only, exactly like `ad_spend` and `llm_usage`: RLS on, no
-- policies, no grants. POST /api/funnel-step is the only writer and it writes
-- through the admin client.
create table if not exists public.funnel_events (
  id          bigint generated always as identity primary key,
  -- Random uuid from the browser, per visit. Not an account, not a device id.
  session_id  uuid        not null,
  -- A quiz step name ("q1_age") or a phase name ("paywall"). Shape-validated in
  -- the route rather than constrained to a list here: the step list lives in
  -- app/register/page.tsx and a copy of it in SQL is one more thing to forget to
  -- update. Bounded length is what keeps it safe; exact membership is not what
  -- this column is for.
  step        text        not null check (char_length(step) between 1 and 32),
  -- Position in the funnel, so the drop-off curve can be read without knowing
  -- the step order at query time.
  step_index  smallint    not null check (step_index between 0 and 40),
  created_at  timestamptz not null default now()
);

-- The two queries this table exists to answer: the drop-off curve over a window,
-- and how far one visit got.
create index if not exists funnel_events_created_at_idx
  on public.funnel_events (created_at desc);
create index if not exists funnel_events_session_idx
  on public.funnel_events (session_id, step_index);

alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events from public, anon, authenticated;

-- Verify from outside — must return a permission error, not [].
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/funnel_events?select=step&limit=1" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"

-- The drop-off curve, most-reached first. This is the query the whole table is
-- for; anything below the first big cliff is where the ad budget is going.
--   select step_index, step, count(distinct session_id) as sessions
--     from public.funnel_events
--    where created_at > now() - interval '7 days'
--    group by step_index, step
--    order by step_index;

-- ─── The drop-off curve, as one round trip ──────────────────────────────────
--
-- PostgREST cannot express `count(distinct ...) group by`, and the alternative —
-- selecting every row and aggregating in the route — transfers the whole table
-- to a serverless function to produce twenty numbers. So the aggregation lives
-- here and /api/admin/stats calls it with the same window it measures every
-- other funnel figure over.
--
-- `security invoker` (the default) on purpose: service_role bypasses RLS
-- entirely, so this needs no elevated rights, and a SECURITY DEFINER function
-- over a table would be a way to read it without the service role. Don't add it.
create or replace function public.funnel_dropoff(since timestamptz)
returns table (step_index smallint, step text, sessions bigint)
language sql
stable
as $$
  select e.step_index,
         -- One label per position. A step is only ever renamed, never moved, so
         -- min() is a tiebreak that never fires in practice.
         min(e.step) as step,
         count(distinct e.session_id) as sessions
    from public.funnel_events e
   where e.created_at >= since
   group by e.step_index
   order by e.step_index;
$$;

-- All three, always. Postgres grants EXECUTE to PUBLIC by default *and* Supabase
-- ships an ALTER DEFAULT PRIVILEGES that hands anon/authenticated their own
-- direct grant at creation time; revoking either side alone leaves the other and
-- the function stays callable with the anon key.
revoke all on function public.funnel_dropoff(timestamptz) from public, anon, authenticated;

-- Verify — must be false, both of them.
--   select has_function_privilege('anon', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
