-- 2026-08-10 — Anonymous accounts for the /register funnel
--
-- The funnel no longer asks for an email before the card. `/register` signs her
-- in anonymously (Supabase anonymous sign-in) so `save-quiz` and Stripe checkout
-- have a user id to hang off, and the Stripe webhook binds the email collected
-- at checkout onto that same id.
--
-- Two functions support that:
--
--   auth_user_id_by_email      the webhook's collision path. Only one account
--                              can hold an address; when the address typed at
--                              Stripe already belongs to an older account, the
--                              subscription is written to *that* account rather
--                              than to a duplicate she could never log into.
--                              supabase-js has no admin "get user by email", and
--                              paging listUsers() to find one is not an option
--                              inside a webhook.
--
--   purge_stale_anonymous_users  housekeeping. Every woman who finishes the quiz
--                              and does not pay leaves an account behind, and
--                              Supabase bills monthly active users. Nothing
--                              cleans these up on its own.
--
-- Both are SECURITY DEFINER (they read/write auth.users, which the API roles
-- cannot touch), so both must be unreachable by the anon key that ships in the
-- browser bundle — an email→id oracle and a "delete these accounts" button are
-- not things to leave lying around. service_role keeps its grant, which is all
-- the webhook and the cron route need.
--
-- Revoking takes THREE roles, not one:
--
--   revoke execute ... from public, anon, authenticated;
--
-- Postgres grants EXECUTE on every new function to PUBLIC, *and* Supabase ships
-- an ALTER DEFAULT PRIVILEGES in this schema that hands anon/authenticated their
-- own direct grant on creation. Revoking from PUBLIC alone leaves those two
-- direct grants intact and the function still callable — verified the hard way:
-- after `revoke ... from public`, has_function_privilege('anon', …) was still
-- true. (The earlier 2026-08-08 migration's advice to revoke from PUBLIC rather
-- than the named roles is half the story: do both.)
--
-- Always verify, never assume:
--   select has_function_privilege('anon', 'public.fn(args)', 'EXECUTE');

begin;

-- ── 1. Email → user id, for the webhook's merge path ────────────────────────

create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(p_email))
  order by created_at
  limit 1;
$$;

revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;

-- ── 2. Purge abandoned anonymous accounts ───────────────────────────────────
--
-- Deliberately paranoid about what it will touch. All four must hold:
--   * flagged anonymous, AND
--   * still has no email — an account that has been through checkout has one,
--     and `is_anonymous` is not guaranteed to flip when the webhook binds it.
--     This is the condition that makes deleting a paying customer impossible,
--     so keep it even though the next one looks like it covers the same ground.
--   * older than the cutoff (default 7 days), and
--   * no paid subscription row.
--
-- Public tables have no FK to auth.users, so nothing cascades — every table
-- holding a user_id is cleared explicitly. `symptoms` is in the list because
-- the on_auth_user_created_seed_symptoms trigger seeds default rows for every
-- signup, anonymous ones included.

create or replace function public.purge_stale_anonymous_users(p_older_than_hours int default 168)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

  delete from public.conversations              where user_id = any(v_ids);
  delete from public.daily_mood                 where user_id = any(v_ids);
  delete from public.email_sequence_recipients  where user_id = any(v_ids);
  delete from public.notifications              where user_id = any(v_ids);
  delete from public.symptom_logs               where user_id = any(v_ids);
  delete from public.symptoms                   where user_id = any(v_ids);
  delete from public.user_habits                where user_id = any(v_ids);
  delete from public.user_insights              where user_id = any(v_ids);
  delete from public.user_plan_logs             where user_id = any(v_ids);
  delete from public.user_plans                 where user_id = any(v_ids);
  delete from public.user_preferences           where user_id = any(v_ids);
  delete from public.user_profiles              where user_id = any(v_ids);
  delete from public.user_push_tokens           where user_id = any(v_ids);
  delete from public.user_trials                where user_id = any(v_ids);
  delete from public.weekly_insights            where user_id = any(v_ids);

  -- auth.identities / auth.sessions cascade from auth.users.
  delete from auth.users where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke execute on function public.purge_stale_anonymous_users(int) from public, anon, authenticated;

commit;

-- ── Verify from outside, with the key that ships in the browser ─────────────
--   curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/rpc/auth_user_id_by_email" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--        -H "Content-Type: application/json" \
--        -d '{"p_email":"someone@example.com"}'
-- Must come back 401/404 (permission denied), never a uuid.

-- ── Manual step, not expressible here ───────────────────────────────────────
-- Supabase Dashboard → Authentication → Sign In / Providers → enable
-- "Anonymous sign-ins". Without it `/register` cannot create an account and the
-- funnel dead-ends at the calculating screen with "We couldn't save your
-- results." Verify from outside afterwards:
--
--   curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--        -H "Content-Type: application/json" -d '{}'
--
-- A 200 with an access_token means enabled; 422 anonymous_provider_disabled
-- means it is still off.
