-- 2026-08-10 — Remove the referral system.
--
-- The referral program is gone from the web app and the API: /api/referral/*,
-- the invite section on /dashboard/account, the ?ref= capture in /register, the
-- coupon check in the Stripe invoice webhook, and email step 3-3 ("share Lisa
-- with a friend") were all deleted. This drops the schema behind them.
--
-- Destructive: the referrals table and the two columns are removed for good.
-- Take a backup / export the table first if the history matters.
--
-- Apply in the Supabase SQL editor.

begin;

-- 1) The table itself.
drop table if exists public.referrals cascade;

-- 2) Columns that only the referral flow ever read or wrote.
alter table public.user_profiles
  drop column if exists referral_code;

alter table public.user_trials
  drop column if exists referral_discount_used_at;

-- 3) Recreate the email-sequence reader without the 3-3 branch. Identical to
--    2026-08-08-drop-trial-columns.sql except that step is gone; the TS side
--    (lib/emailSequences.ts) no longer asks for it either.
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
    (p_step = 'p-1'
     AND r.account_status = 'pending_payment'
     AND r.registered_at IS NOT NULL
     AND r.registered_at <= (now() - interval '1 hour')
     AND r.registered_at >= (now() - interval '48 hours')
     AND NOT (r.sent_steps ? 'p-1'))
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
    OR (p_step = '3-4' AND r.account_status = 'paid' AND r.paid_at IS NOT NULL
     AND r.paid_at >= (now() - interval '31 days') AND r.paid_at <= (now() - interval '29 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-4')))
    OR (p_step = '3-5' AND r.account_status = 'paid' AND r.subscription_ends_at IS NOT NULL
     AND r.subscription_ends_at >= (now() + interval '20 hours') AND r.subscription_ends_at <= (now() + interval '2 days')
     AND (r.sent_steps IS NULL OR NOT (r.sent_steps ? '3-5')))
  );
END;
$function$;

-- Recreating the function resets its grants: Postgres hands EXECUTE to PUBLIC,
-- and Supabase's ALTER DEFAULT PRIVILEGES hands anon/authenticated their own.
-- Revoke all three, then re-grant to service_role only.
revoke all on function public.get_email_sequence_due(text) from public, anon, authenticated;
grant execute on function public.get_email_sequence_due(text) to service_role;

commit;

-- Verify (run after commit; every one must come back false / 0 rows):
--   select has_function_privilege('anon', 'public.get_email_sequence_due(text)', 'EXECUTE');
--   select to_regclass('public.referrals');                            -- null
--   select column_name from information_schema.columns
--    where table_schema = 'public'
--      and (   (table_name = 'user_profiles' and column_name = 'referral_code')
--           or (table_name = 'user_trials'   and column_name = 'referral_discount_used_at'));
--
-- Old 3-3 sends stay in email_sequence_recipients.sent_steps. Harmless — nothing
-- reads that key any more. To tidy:
--   update public.email_sequence_recipients
--      set sent_steps = sent_steps - '3-3'
--    where sent_steps ? '3-3';
