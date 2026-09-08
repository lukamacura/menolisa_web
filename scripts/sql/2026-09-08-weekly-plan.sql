-- 2026-09-08 — the $1-then-$4.99/week plan, funnel event columns, test flags.
--
-- What changed on the money side needs nothing from the schema: a weekly
-- Stripe price is stored exactly like the 8-week one (account_status 'paid',
-- subscription_ends_at = the current week's period end). plan_type gains the
-- value 'weekly' (text column, no constraint). The trial columns
-- (trial_ends_at / first_paid_at / offer_variant) stay: nothing writes them
-- any more and two historical rows carry them.
--
-- Four things this file adds, and why:
--
--   user_profiles.email     Optional, typed on the results screen ("Save your
--                           results and plan"). NOT her login address —
--                           auth.users.email is bound from Stripe at checkout
--                           and nothing here touches that. Never verified.
--   user_profiles.is_test   Operator's own accounts. /admin excludes them.
--   funnel_events.is_test   Same, per visit (the ?qa=1 session, and the
--                           checkout it opens).
--   funnel_events.detail    One bounded token, used by exactly one step:
--                           `paywall_exit` (too_expensive | not_sure_helps |
--                           see_plan_first | dont_pay_for_apps | skipped).
--                           It is not health data and it must stay that way —
--                           the route allowlists the values; do not widen it
--                           to free text or to anything she answered on a quiz
--                           screen.
--
-- Server-side rows now land in funnel_events too (checkout_opened,
-- purchase_completed, subscription_canceled, payment_failed). They are keyed
-- on the browser's funnel session id when the Checkout Session carried one
-- (`funnel_session_id` metadata) and on a fresh uuid otherwise. Still no
-- user id — see the 2026-09-02 file for why.

alter table public.user_profiles
  add column if not exists email text,
  add column if not exists is_test boolean not null default false;

alter table public.funnel_events
  add column if not exists is_test boolean not null default false,
  add column if not exists detail text
    check (detail is null or char_length(detail) between 1 and 32);

comment on column public.user_profiles.email is
  'Optional, typed on the results screen. Not her login; auth.users.email is. Unverified.';
comment on column public.user_profiles.is_test is
  'Operator/test account. /admin excludes it from every count.';
comment on column public.funnel_events.is_test is
  'QA visit (?qa=1) or a checkout/subscription opened by one. /admin excludes it.';
comment on column public.funnel_events.detail is
  'One allowlisted token, paywall_exit only. Never an answer to a quiz screen.';

create index if not exists funnel_events_step_created_idx
  on public.funnel_events (step, created_at desc);

-- ── Flag the rows we already know are ours ────────────────────────────────
-- The operator's accounts: the two addresses that have ever been used to test
-- checkout, and every profile whose "name" was typed as Test/Testy/test while
-- walking the funnel on 2026-09-04/05. Real women do not name themselves Test.
update public.user_profiles p
   set is_test = true
  from auth.users u
 where u.id = p.user_id
   and u.email in ('luka.xzy@gmail.com', 'luka.macura@yandex.com');

update public.user_profiles
   set is_test = true
 where name in ('Test', 'Testy', 'test', 'Ana');

-- The funnel visits behind those profiles: `save-quiz` inserts the profile
-- behind the `calculating` screen, so a calculating ping within 90 seconds of
-- a test profile's created_at is that same visit. Every row of that session is
-- flagged.
update public.funnel_events e
   set is_test = true
 where e.session_id in (
   select distinct f.session_id
     from public.funnel_events f
     join public.user_profiles p on p.is_test
    where f.step = 'calculating'
      and f.created_at between p.created_at - interval '90 seconds'
                           and p.created_at + interval '90 seconds'
 );

-- ── funnel_dropoff: same shape, test rows excluded ────────────────────────
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
     and not e.is_test
   group by e.step
   order by 1;
$$;
revoke all on function public.funnel_dropoff(timestamptz) from public, anon, authenticated;

-- ── funnel_daily: the curve per operator-local day ────────────────────────
-- One row per (day, step): distinct visits that reached the step on that day.
-- `tz_offset_minutes` is what JS `Date.getTimezoneOffset()` reports (UTC − local),
-- the same convention /api/admin/stats already uses for isoDay().
create or replace function public.funnel_daily(since timestamptz, tz_offset_minutes int)
returns table (day date, step text, sessions bigint)
language sql
stable
as $$
  select (e.created_at - make_interval(mins => tz_offset_minutes))::date as day,
         e.step,
         count(distinct e.session_id)
    from public.funnel_events e
   where e.created_at >= since
     and not e.is_test
   group by 1, 2
   order by 1, 2;
$$;
revoke all on function public.funnel_daily(timestamptz, int) from public, anon, authenticated;

-- Verify — all four must be false.
--   select has_function_privilege('anon', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_dropoff(timestamptz)', 'EXECUTE');
--   select has_function_privilege('anon', 'public.funnel_daily(timestamptz, int)', 'EXECUTE');
--   select has_function_privilege('authenticated', 'public.funnel_daily(timestamptz, int)', 'EXECUTE');
