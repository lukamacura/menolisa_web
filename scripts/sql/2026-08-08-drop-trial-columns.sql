-- Remove the last of the free-trial machinery from the schema.
--
-- The product is a single $59 / 8-week subscription with no trial. The triggers
-- that recomputed trial_end were dropped in
-- 2026-08-08-kill-trial-residue-and-lock-rpc.sql; this drops the columns
-- themselves, so nothing can write a phantom trial again.
--
-- getAccountState() now derives access solely from subscription_ends_at.
--
-- Order matters: get_email_sequence_due() returns SETOF
-- email_sequence_recipients, so it must be dropped before the table's row type
-- changes and recreated afterwards.

begin;

-- 1) Drop the reader; it is recreated at the end against the new row type.
drop function if exists public.get_email_sequence_due(text);

-- 2) Stop the sync function copying trial columns across.
create or replace function public.sync_email_sequence_recipient(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_email text;
  v_name text;
  v_top_problems text[];
  v_goal text;
  v_account_status text;
  v_subscription_ends_at timestamptz;
  v_existing_paid_at timestamptz;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  SELECT name, top_problems, goal
  INTO v_name, v_top_problems, v_goal
  FROM public.user_profiles
  WHERE user_id = p_user_id;

  SELECT account_status, subscription_ends_at
  INTO v_account_status, v_subscription_ends_at
  FROM public.user_trials
  WHERE user_id = p_user_id;

  SELECT paid_at INTO v_existing_paid_at
  FROM public.email_sequence_recipients
  WHERE user_id = p_user_id;

  INSERT INTO public.email_sequence_recipients (
    user_id, email, name, top_problems, goal,
    account_status, subscription_ends_at,
    paid_at, updated_at, sent_steps, registered_at
  ) VALUES (
    p_user_id, v_email, v_name, v_top_problems, v_goal,
    v_account_status, v_subscription_ends_at,
    CASE WHEN v_account_status = 'paid' AND v_existing_paid_at IS NULL THEN now() ELSE v_existing_paid_at END,
    now(),
    '{}',
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email            = EXCLUDED.email,
    name             = EXCLUDED.name,
    top_problems     = EXCLUDED.top_problems,
    goal             = EXCLUDED.goal,
    account_status   = EXCLUDED.account_status,
    subscription_ends_at = EXCLUDED.subscription_ends_at,
    paid_at = CASE
      WHEN EXCLUDED.account_status = 'paid' AND email_sequence_recipients.paid_at IS NULL THEN now()
      ELSE email_sequence_recipients.paid_at
    END,
    updated_at = now();
    -- registered_at intentionally excluded: set once, never overwritten
    -- sent_steps intentionally excluded: only the cron writes it
END;
$function$;

-- 3) Drop the columns.
alter table public.email_sequence_recipients
  drop column if exists trial_start,
  drop column if exists trial_end;

alter table public.user_trials
  drop column if exists trial_start,
  drop column if exists trial_end,
  drop column if exists trial_days;

-- 4) Recreate the reader. The only change to the logic is the removal of
--    `r.trial_start IS NULL` from the p-1 predicate: account_status =
--    'pending_payment' already means "registered, never paid", so the extra
--    condition was redundant even before the column went away.
create or replace function public.get_email_sequence_due(p_step text)
returns setof email_sequence_recipients
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
    OR (p_step = '3-5' AND r.account_status = 'paid' AND r.subscription_ends_at IS NOT NULL
     AND r.subscription_ends_at >= (now() + interval '20 hours') AND r.subscription_ends_at <= (now() + interval '2 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-5')))
  );
END;
$function$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and this one
-- returns customer email addresses. Revoke from public (not from the named
-- roles — that leaves the PUBLIC grant intact and the function still callable).
revoke all on function public.get_email_sequence_due(text) from public;
revoke all on function public.sync_email_sequence_recipient(uuid) from public;
grant execute on function public.get_email_sequence_due(text) to service_role;
grant execute on function public.sync_email_sequence_recipient(uuid) to service_role;

commit;
