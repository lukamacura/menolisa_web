-- Wipe all test data, keeping one account.
--
-- Run this AFTER 2026-08-08-drop-trial-columns.sql.
--
-- Kept: luka.xzy@gmail.com — the owner account, comp'd until 2027-05-03 and
-- hardcoded in app/api/auth/reviewer-login/route.ts as the App Store reviewer
-- login. Deleting it breaks App Store review.
--
-- Kept: public.documents — the RAG vector store. It holds no user data and is
-- expensive to rebuild (`npm run ingest` re-embeds every KB file).
--
-- Deleting from auth.users does NOT cascade: the only foreign key in the public
-- schema is symptom_logs.symptom_id → symptoms. Every user-scoped table is
-- therefore cleared explicitly, before the auth rows go.
--
-- IRREVERSIBLE. Take a backup first if you want one.

begin;

-- The account to keep. If this select returns no row, the deletes below would
-- wipe everything — so assert it exists before touching anything.
do $$
declare
  v_keep uuid;
begin
  select id into v_keep from auth.users where email = 'luka.xzy@gmail.com';
  if v_keep is null then
    raise exception 'Keeper account luka.xzy@gmail.com not found — aborting rather than wiping everything';
  end if;
end $$;

create temporary table _keep on commit drop as
  select id from auth.users where email = 'luka.xzy@gmail.com';

-- conversations.user_id is text, not uuid — cast the keeper for comparison.
delete from public.conversations
  where user_id is null or user_id not in (select id::text from _keep);

delete from public.symptom_logs        where user_id not in (select id from _keep);
delete from public.symptoms            where user_id not in (select id from _keep);
delete from public.daily_mood          where user_id not in (select id from _keep);
delete from public.notifications       where user_id not in (select id from _keep);
delete from public.user_preferences    where user_id not in (select id from _keep);
delete from public.user_push_tokens    where user_id not in (select id from _keep);
delete from public.user_insights       where user_id not in (select id from _keep);
delete from public.weekly_insights     where user_id not in (select id from _keep);
delete from public.user_habits         where user_id not in (select id from _keep);
delete from public.user_plans          where user_id not in (select id from _keep);
delete from public.user_plan_logs      where user_id not in (select id from _keep);
delete from public.user_profiles       where user_id not in (select id from _keep);
delete from public.email_sequence_recipients where user_id not in (select id from _keep);

-- A referral is void if either side is gone.
delete from public.referrals
  where referrer_id not in (select id from _keep)
     or referred_id not in (select id from _keep);

-- user_trials last: the deletes above don't depend on it, but it is the row
-- that grants access, so it should be the last user-scoped thing standing.
delete from public.user_trials         where user_id not in (select id from _keep);

-- Stripe idempotency log — no user_id, and every event in it belongs to a
-- deleted test account. Clearing it is safe: it only prevents replaying old
-- webhook events, and those subscriptions no longer exist.
delete from public.stripe_webhook_events;

-- Finally the auth rows.
delete from auth.users where id not in (select id from _keep);

commit;

-- Verify: every count below should be 0 or 1 (documents stays at 142).
--
-- select 'auth.users' t, count(*) from auth.users
-- union all select 'user_profiles', count(*) from public.user_profiles
-- union all select 'user_trials', count(*) from public.user_trials
-- union all select 'conversations', count(*) from public.conversations
-- union all select 'documents', count(*) from public.documents;
