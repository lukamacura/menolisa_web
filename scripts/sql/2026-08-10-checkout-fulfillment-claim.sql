-- 2026-08-10 — one-time checkout fulfillment claim
--
-- Fulfilling a checkout has side effects that must happen exactly once per
-- purchase: bind the email Stripe collected, kick the 8-week plan generation,
-- send the welcome email.
--
-- Until now only the Stripe webhook did any of that, so a webhook that never
-- arrived (wrong endpoint URL, stale signing secret, Stripe outage) left a
-- paying customer with no login address and no plan, permanently.
-- `/api/stripe/sync-session` is the fallback the success screen already calls,
-- and it now runs the same fulfillment.
--
-- Two writers means a race, so fulfillment is *claimed* rather than checked:
--
--   update user_trials set fulfilled_at = now()
--    where user_id = $1 and fulfilled_at is null
--   returning user_id;
--
-- Exactly one caller gets a row back; that one does the side effects. Postgres
-- serialises the concurrent updates on the row lock, so the loser sees the
-- winner's non-null value and skips.

alter table public.user_trials
  add column if not exists fulfilled_at timestamptz;

comment on column public.user_trials.fulfilled_at is
  'Set once, by whichever of the Stripe webhook or /api/stripe/sync-session fulfils the checkout first. Claimed with a conditional UPDATE; the winner sends the welcome email and kicks plan generation. Never set this by hand — a non-null value permanently suppresses those.';

-- Backfill: every row that already reached "paid" was fulfilled under the old
-- code (or is the pre-Stripe seed row). Stamping them keeps the fallback from
-- re-sending a welcome email to existing subscribers the first time they hit
-- the success screen or the account page.
update public.user_trials
   set fulfilled_at = coalesce(updated_at, created_at, now())
 where account_status = 'paid'
   and fulfilled_at is null;

-- Verify:
--   select user_id, account_status, fulfilled_at from public.user_trials;
