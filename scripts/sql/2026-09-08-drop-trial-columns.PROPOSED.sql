-- PROPOSED — NOT APPLIED. Needs a backup and sign-off first (see the bottom).
--
-- Drops the four user_trials columns that the free trial (2026-09-04) and the
-- renewal-notice email left behind. As of 2026-09-08 nothing in the web app,
-- the Expo app or the scripts reads or writes any of them:
--
--   trial_ends_at            written by the trial-era webhook; 2 rows non-null
--   first_paid_at            the trial-conversion claim; 0 rows non-null
--   offer_variant            'trial_free' / 'trial7_free'; 2 rows non-null
--   renewal_notice_sent_for  the pre-renewal email marker; 0 rows non-null
--
-- The two rows are both expired test/cancelled trials:
--   da972fe5-b271-4a38-bab6-c22ef3114ff4  trial_ends_at 2026-09-10 01:58:05+00  offer_variant trial_free
--   29e8b9be-b0a6-4b4c-8fd7-0815d44380da  trial_ends_at 2026-09-11 10:29:40+00  offer_variant trial7_free
--
-- Nothing else is proposed. Every table has live readers and writers (checked
-- 2026-09-08: web + mobile code references, row counts, last writes), no RLS
-- policy references a removed feature — the only user_trials policy is the
-- SELECT-own-row the account card reads through — and the Apple IAP columns
-- (product_id / original_transaction_id / latest_receipt) back live code in
-- app/api/iap/.
--
-- ── 1. Backup (run first, keep the table until the next release is out) ──
create table if not exists public.backup_user_trials_trial_cols_20260908 as
  select user_id, trial_ends_at, first_paid_at, offer_variant, renewal_notice_sent_for
    from public.user_trials
   where trial_ends_at is not null
      or first_paid_at is not null
      or offer_variant is not null
      or renewal_notice_sent_for is not null;
alter table public.backup_user_trials_trial_cols_20260908 enable row level security;
revoke all on table public.backup_user_trials_trial_cols_20260908 from public, anon, authenticated;

-- ── 2. Drop ──────────────────────────────────────────────────────────────
-- Deploy the 2026-09-08 build BEFORE running this: the previous build's
-- webhook and account routes select these columns and PostgREST fails the
-- whole read on an unknown one.
alter table public.user_trials
  drop column if exists trial_ends_at,
  drop column if exists first_paid_at,
  drop column if exists offer_variant,
  drop column if exists renewal_notice_sent_for;

-- ── 3. Later: drop the backup ────────────────────────────────────────────
-- drop table public.backup_user_trials_trial_cols_20260908;
