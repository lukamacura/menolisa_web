-- Free 7-day trial (2026-09-04). Three columns on user_trials; no new state.
--
-- A trialing subscription is stored exactly like a paid one — account_status
-- 'paid', subscription_ends_at = Stripe's trial_end — so getAccountState()
-- needs nothing from this file. The columns exist so the readers that must
-- tell "a week free" from "eight weeks paid" can:
--
--   trial_ends_at   Stripe's trial_end. The renewal cron sends the "your free
--                   week ends" copy when it equals subscription_ends_at; the
--                   account card prints the first-charge date off it.
--   first_paid_at   The one-time claim for the trial's first real charge —
--                   the Meta Purchase and the "your plan has started" email
--                   fire only for the caller that sets it from null
--                   (claimFirstPayment in lib/stripe/fulfillCheckout.ts).
--                   Never set it by hand: a non-null value suppresses both.
--   offer_variant   What the checkout sold: 'trial_free' or 'paid_upfront' ('trial7_free' on the first day's sessions).
--                   Stamped from the Checkout Session so /admin can split
--                   the two paywalls without re-reading Stripe.
--
-- Apply in the Supabase SQL editor BEFORE deploying the trial build: the
-- webhook writes trial_ends_at on every subscription event, and PostgREST
-- rejects the whole update on an unknown column.

alter table public.user_trials
  add column if not exists trial_ends_at timestamptz,
  add column if not exists first_paid_at timestamptz,
  add column if not exists offer_variant text;

comment on column public.user_trials.trial_ends_at is
  'Stripe trial_end. Equals subscription_ends_at while the free week is running.';
comment on column public.user_trials.first_paid_at is
  'When money first moved. One-time claim for the trial-conversion side effects; never set by hand.';
comment on column public.user_trials.offer_variant is
  'What checkout sold: trial_free | paid_upfront (lib/pricing.ts OfferVariant; trial7_free is the 2026-09-04 legacy id).';

-- Verify: all three present, no rows touched.
-- select column_name, data_type from information_schema.columns
--  where table_name = 'user_trials'
--    and column_name in ('trial_ends_at', 'first_paid_at', 'offer_variant');
