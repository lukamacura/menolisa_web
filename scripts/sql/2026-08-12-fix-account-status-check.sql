-- 2026-08-12 — Let `pending_payment` into user_trials, and give the renewal
-- notice more than one day's warning.
--
-- Two independent fixes, both about being able to see and keep customers.
--
-- ── 1. The check constraint the funnel could not satisfy ────────────────────
--
-- `user_trials_account_status_check` was written when the product still had a
-- trial, and never updated when the states became pending_payment / paid /
-- expired. So every anonymous funnel signup hit:
--
--     new row for relation "user_trials" violates check constraint
--     "user_trials_account_status_check"
--
-- and `POST /api/auth/save-quiz` swallowed it (it only console.error'd the trial
-- insert), so the funnel carried on and the row was simply never written.
--
-- Nothing broke visibly: `'paid'` passed the constraint, so checkout still
-- worked, and `checkTrialExpired()` fails closed, so nobody got free access.
-- What it cost was measurement — the entire "reached the paywall, didn't buy"
-- cohort had no row anywhere — and the `p-1`…`p-6` winback, which selects on
-- `account_status = 'pending_payment'` and therefore matched nobody, ever.
--
-- The new list is exactly the three values the code writes:
--   'pending_payment'  save-quiz, on quiz completion
--   'paid'             stripe webhook / sync-session / IAP  (lib/subscriptionWrite.ts)
--   'expired'          subscription ended or was refunded
-- 'trial', 'active' and 'suspended' are dropped — the trial machinery was
-- removed on 2026-08-08 and nothing has written the other two.

alter table public.user_trials
  drop constraint if exists user_trials_account_status_check;

alter table public.user_trials
  add constraint user_trials_account_status_check
  check (account_status in ('pending_payment', 'paid', 'expired'));

-- Backfill the finishers who were silently skipped: a completed quiz with no
-- user_trials row can only have come from this bug. Anyone who actually paid
-- already has a row, so the insert cannot downgrade a paying account.
insert into public.user_trials (user_id, account_status, created_at)
select p.user_id, 'pending_payment', p.created_at
from public.user_profiles p
left join public.user_trials t on t.user_id = p.user_id
where t.user_id is null
on conflict (user_id) do nothing;

-- ── 2. Renewal notice: 1 day → 3 days ──────────────────────────────────────
--
-- Step `3-5` fired inside a now+20h … now+2d window, i.e. "renews tomorrow".
-- One day is not enough time to decide, and a charge that lands before she has
-- acted is the highest-probability chargeback in the whole product — the week-8
-- renewal is the moment she is least sure the plan worked. Several US states
-- (California's ARL among them) also want at least 3 days' notice on an
-- auto-renewal.
--
-- The window is exactly 24h wide so a once-daily cron matches each subscriber
-- on precisely one run. Everything else in the function is unchanged.

create or replace function public.get_email_sequence_due(p_step text)
returns setof public.email_sequence_recipients
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  RETURN QUERY
  SELECT r.*
  FROM public.email_sequence_recipients r
  WHERE r.email IS NOT NULL AND r.email != ''
  AND (
    -- ── Pending-payment sequence (abandoned paywall, 6 emails) ────────────
    -- p-1: 1h–48h after registration, still pending
    (p_step = 'p-1'
     AND r.account_status = 'pending_payment'
     AND r.registered_at IS NOT NULL
     AND r.registered_at <= (now() - interval '1 hour')
     AND r.registered_at >= (now() - interval '48 hours')
     AND NOT (r.sent_steps ? 'p-1'))
    -- p-2 through p-6: chained off p-1 send time, only while still pending
    OR (p_step = 'p-2'
     AND r.account_status = 'pending_payment'
     AND r.sent_steps ? 'p-1'
     AND (r.sent_steps->>'p-1')::timestamptz <= (now() - interval '20 hours')
     AND (r.sent_steps->>'p-1')::timestamptz >= (now() - interval '48 hours')
     AND NOT (r.sent_steps ? 'p-2'))
    OR (p_step = 'p-3'
     AND r.account_status = 'pending_payment'
     AND r.sent_steps ? 'p-1'
     AND (r.sent_steps->>'p-1')::timestamptz <= (now() - interval '44 hours')
     AND (r.sent_steps->>'p-1')::timestamptz >= (now() - interval '72 hours')
     AND NOT (r.sent_steps ? 'p-3'))
    OR (p_step = 'p-4'
     AND r.account_status = 'pending_payment'
     AND r.sent_steps ? 'p-1'
     AND (r.sent_steps->>'p-1')::timestamptz <= (now() - interval '68 hours')
     AND (r.sent_steps->>'p-1')::timestamptz >= (now() - interval '96 hours')
     AND NOT (r.sent_steps ? 'p-4'))
    OR (p_step = 'p-5'
     AND r.account_status = 'pending_payment'
     AND r.sent_steps ? 'p-1'
     AND (r.sent_steps->>'p-1')::timestamptz <= (now() - interval '92 hours')
     AND (r.sent_steps->>'p-1')::timestamptz >= (now() - interval '120 hours')
     AND NOT (r.sent_steps ? 'p-5'))
    OR (p_step = 'p-6'
     AND r.account_status = 'pending_payment'
     AND r.sent_steps ? 'p-1'
     AND (r.sent_steps->>'p-1')::timestamptz <= (now() - interval '116 hours')
     AND (r.sent_steps->>'p-1')::timestamptz >= (now() - interval '144 hours')
     AND NOT (r.sent_steps ? 'p-6'))
    -- ── Paid-subscriber sequence ─────────────────────────────────────────
    OR (p_step = '3-2' AND r.account_status = 'paid' AND r.paid_at IS NOT NULL
     AND r.paid_at >= (now() - interval '7 days') AND r.paid_at <= (now() - interval '5 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-2')))
    OR (p_step = '3-3' AND r.account_status = 'paid' AND r.paid_at IS NOT NULL
     AND r.paid_at >= (now() - interval '21 days') AND r.paid_at <= (now() - interval '14 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-3')))
    OR (p_step = '3-4' AND r.account_status = 'paid' AND r.paid_at IS NOT NULL
     AND r.paid_at >= (now() - interval '31 days') AND r.paid_at <= (now() - interval '29 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-4')))
    -- 3-5: renewal notice, now three days out rather than one.
    OR (p_step = '3-5' AND r.account_status = 'paid' AND r.subscription_ends_at IS NOT NULL
     AND r.subscription_ends_at >= (now() + interval '3 days')
     AND r.subscription_ends_at <= (now() + interval '4 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-5')))
  );
END;
$function$;

-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's default
-- privileges hand anon/authenticated their own grant on top. Revoke all three
-- and verify — see the security notes in CLAUDE.md §5.
revoke all on function public.get_email_sequence_due(text) from public, anon, authenticated;

-- ── Verification ───────────────────────────────────────────────────────────
-- select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'user_trials_account_status_check';
--
-- select account_status, count(*) from public.user_trials group by 1;
--
-- select count(*) from public.user_profiles p
--   left join public.user_trials t on t.user_id = p.user_id
--   where t.user_id is null;                                    -- must be 0
--
-- select has_function_privilege('anon', 'public.get_email_sequence_due(text)', 'EXECUTE');
--                                                               -- must be false
