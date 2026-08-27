-- 2026-08-27 — "When do you usually have time to exercise?"
--
--   NEW  q_training_time → user_profiles.training_time  (morning/midday/evening)
--
-- It exists for one consumer: the mobile app's local movement reminder. Since
-- the engagement alerts moved onto the device (see docs/mobile-app-changes.md
-- §15) a reminder can finally be given a time of day, and the honest default for
-- "your movement is still open" is the part of the day she said she trains in.
-- Guessing it — or asking her again in Settings on day one — was the alternative.
--
-- Nullable with no default on purpose: null means "she was never asked", which
-- is every account that predates this question. The app falls back to an evening
-- reminder for those, which is what everybody got before the question existed.
--
-- Apply by hand in the Supabase SQL editor (there is no migration runner).

alter table public.user_profiles
  add column if not exists training_time text;

-- Value set is enforced by zod in /api/auth/save-quiz; this is the second wall,
-- so a bad write from anywhere else fails loudly instead of landing a value the
-- app will silently ignore.
-- `not valid` skips the scan of existing rows — they are all null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_training_time_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_training_time_check
      check (training_time is null or training_time in ('morning', 'midday', 'evening'))
      not valid;
  end if;
end $$;
