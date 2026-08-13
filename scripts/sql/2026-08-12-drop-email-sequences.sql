-- 2026-08-12 — Remove the email sequence system. One renewal notice replaces it.
--
-- Why all of it goes:
--
-- The `p-1`…`p-6` winback needed an address from someone who abandoned the
-- paywall, and since 2026-08-10 the funnel collects no address before Stripe.
-- It had also never sent a single email for a second reason — it selects on
-- `account_status = 'pending_payment'`, which a stale check constraint had been
-- rejecting since the state was introduced (see
-- 2026-08-12-fix-account-status-check.sql).
--
-- The paid drip (`3-2`, `3-4`) was engagement mail, and engagement now lives in
-- the Expo app: she pays, she installs, the app owns the relationship. Sending
-- her "how is it going with Lisa?" from a second channel is a worse version of
-- what a push notification already does.
--
-- What survives is `3-5`, the renewal notice — the only message here that is
-- about her money rather than her attention, and the one the paywall promises.
-- It moved to `/api/cron/renewal-notices`, which reads `user_trials` directly.
--
-- That removes the reason all of this machinery existed. The mirror table, the
-- two triggers keeping it in sync and the three functions were infrastructure
-- for answering "who is due for which of nine steps"; a single date-driven
-- email answers that with a `where` clause. Deleting them also retires the
-- ordering rule in CLAUDE.md §4 that the email must be bound before
-- `user_trials` is written — there is no longer a trigger to lose the race to.
-- (Bind it first anyway. It is still the honest order.)

-- ── 1. Idempotency marker for the renewal notice ───────────────────────────
--
-- Holds the `subscription_ends_at` we already warned about. Equal means this
-- renewal is covered; a later period end is the next cycle and arms the notice
-- again, so the column never needs resetting.
alter table public.user_trials
  add column if not exists renewal_notice_sent_for timestamptz;

comment on column public.user_trials.renewal_notice_sent_for is
  'subscription_ends_at value the renewal notice was last sent for. Compared for equality by /api/cron/renewal-notices; never reset.';

-- ── 2. Drop the sequence machinery ─────────────────────────────────────────
drop trigger if exists sync_email_recipient_on_user_profiles on public.user_profiles;
drop trigger if exists sync_email_recipient_on_user_trials   on public.user_trials;

drop function if exists public.trigger_sync_email_sequence_recipient();
drop function if exists public.sync_email_sequence_recipient(uuid);
drop function if exists public.get_email_sequence_due(text);

-- Last, because the functions above reference it.
drop table if exists public.email_sequence_recipients;

-- ── 3. purge_stale_anonymous_users() without the dropped table ─────────────
--
-- The purge deletes each user_id table explicitly (public tables have no
-- cascade from auth.users), so dropping a table it names breaks the 3am cron.
-- Same function, one delete removed.
create or replace function public.purge_stale_anonymous_users(p_older_than_hours integer default 168)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
begin
  select array_agg(u.id) into v_ids
  from auth.users u
  where u.is_anonymous is true
    and (u.email is null or u.email = '')
    and u.created_at < now() - make_interval(hours => p_older_than_hours)
    and not exists (
      select 1
      from public.user_trials t
      where t.user_id = u.id
        and t.account_status = 'paid'
    );

  if v_ids is null then
    return 0;
  end if;

  delete from public.conversations   where user_id = any(v_ids);
  delete from public.daily_mood      where user_id = any(v_ids);
  delete from public.notifications   where user_id = any(v_ids);
  delete from public.symptom_logs    where user_id = any(v_ids);
  delete from public.symptoms        where user_id = any(v_ids);
  delete from public.user_habits     where user_id = any(v_ids);
  delete from public.user_insights   where user_id = any(v_ids);
  delete from public.user_plan_logs  where user_id = any(v_ids);
  delete from public.user_plans      where user_id = any(v_ids);
  delete from public.user_preferences where user_id = any(v_ids);
  delete from public.user_profiles   where user_id = any(v_ids);
  delete from public.user_push_tokens where user_id = any(v_ids);
  delete from public.user_trials     where user_id = any(v_ids);
  delete from public.weekly_insights where user_id = any(v_ids);

  delete from auth.users where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

-- Postgres grants EXECUTE to PUBLIC on a new function, and Supabase's default
-- privileges add anon/authenticated on top. Revoke all three — see CLAUDE.md §5.
revoke all on function public.purge_stale_anonymous_users(integer) from public, anon, authenticated;

-- ── Verification ───────────────────────────────────────────────────────────
-- select to_regclass('public.email_sequence_recipients');          -- must be null
--
-- select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname ilike '%email_sequence%';  -- must be 0
--
-- select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
--  where not t.tgisinternal and t.tgname like 'sync_email_recipient%';  -- must be 0
--
-- select has_function_privilege('anon', 'public.purge_stale_anonymous_users(integer)', 'EXECUTE');
--                                                                  -- must be false
--
-- select public.purge_stale_anonymous_users(24000);                -- returns 0, proves it still runs
