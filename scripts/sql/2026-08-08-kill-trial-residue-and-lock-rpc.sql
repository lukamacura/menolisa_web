-- Applied 2026-08-08. Kept here for the record — there is no migration runner.
--
-- Two unrelated problems, both in user_trials' blast radius.
--
-- 1. THE PHANTOM TRIAL. The product stopped selling a 3-day trial (one plan,
--    $59, charged at checkout — see lib/pricing.ts), but the database never
--    got the memo. `update_trial_end_trigger` fired BEFORE INSERT OR UPDATE and
--    unconditionally recomputed
--        trial_end := trial_start + trial_days
--    with trial_start defaulting to now() and trial_days defaulting to 3. So
--    every Stripe webhook write — including the one that records a $59 payment
--    — silently stamped a 3-day trial window back onto the row, overwriting the
--    `trial_end: null` the webhook had just written.
--
--    getAccountState() reads that as `inTrial` and reports state "trialing"
--    with 3 days left to someone who just paid for 8 weeks. Access itself
--    survived (subscription_ends_at wins for the cutoff) but every trial-shaped
--    surface lied for the first 3 days. Two triggers did the same job, so both go.
--
-- 2. ANON-CALLABLE SECURITY DEFINER RPCs. These bypass RLS by design and were
--    reachable unauthenticated at /rest/v1/rpc/<name> with the anon key — which
--    ships in the browser bundle and is therefore public. get_email_sequence_due
--    is the bad one: it returns SETOF email_sequence_recipients, so anyone could
--    dump customer email addresses. They are only ever called by cron routes and
--    triggers running as service_role, which bypasses GRANTs entirely.

begin;

-- ── 1. Phantom trial ────────────────────────────────────────────────────────

drop trigger if exists update_trial_end_trigger on public.user_trials;
drop trigger if exists set_trial_end_before_insert_or_update on public.user_trials;

drop function if exists public.update_trial_end();
drop function if exists public.set_user_trials_trial_end();

-- Never attached to auth.users (only seed_default_symptoms is), so this one has
-- been dead code granting anon an INSERT into user_trials for nothing.
drop function if exists public.create_user_trial_on_signup();

-- Defaults must not imply access. 'trial' is not a status getAccountState()
-- grants on — it falls through to the fail-closed branch — but a row that reads
-- "trial" while meaning "has not paid" is a trap for the next person.
alter table public.user_trials alter column account_status set default 'pending_payment';
alter table public.user_trials alter column trial_days   set default 0;

-- Clear the windows the trigger stamped. Nothing sells a trial today: Stripe
-- checkout sets no trial_period_days, and no Apple/Google intro-offer rows
-- exist, so every non-null trial_end here is trigger residue.
update public.user_trials
   set trial_end  = null,
       trial_days = 0
 where trial_end is not null;

-- ── 2. Lock the SECURITY DEFINER RPCs ───────────────────────────────────────

-- Revoke from PUBLIC, not from anon/authenticated. Postgres grants EXECUTE on
-- new functions to PUBLIC by default, and anon/authenticated inherit it from
-- there — revoking the named roles leaves the PUBLIC grant intact and the
-- function still callable. (Confirmed the hard way: the first pass revoked
-- anon, authenticated and has_function_privilege('anon', …) still said true.)
revoke execute on function public.get_email_sequence_due(text)            from public;
revoke execute on function public.sync_email_sequence_recipient(uuid)     from public;
revoke execute on function public.trigger_sync_email_sequence_recipient() from public;
revoke execute on function public.cleanup_old_notifications()             from public;
revoke execute on function public.seed_default_symptoms()                 from public;

-- Pin search_path on what's left, so a caller-controlled search_path can't
-- resolve these to a shadowed table (the linter's 0011 warning).
alter function public.sync_email_sequence_recipient(uuid)     set search_path = public;
alter function public.trigger_sync_email_sequence_recipient() set search_path = public;
alter function public.cleanup_old_notifications()             set search_path = public;
alter function public.seed_default_symptoms()                 set search_path = public;
alter function public.update_updated_at_column()              set search_path = public;
alter function public.update_user_profiles_updated_at()       set search_path = public;
alter function public.update_notifications_updated_at()       set search_path = public;
alter function public.update_daily_mood_updated_at()          set search_path = public;
alter function public.set_time_of_day()                       set search_path = public;

commit;
