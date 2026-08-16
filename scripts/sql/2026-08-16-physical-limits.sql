-- 2026-08-16 — q_safety replaced by q_limitations in the web funnel.
--
-- The /register screen that read "Do any of these apply to you?" and collected
-- clinical contraindications now asks what hurts when she moves:
--   q_limitations → user_profiles.physical_limits  (multi-select)
--
-- The answers are load-bearing rather than decorative: `LIMITATION_EXCLUDES` in
-- lib/plan/catalog.ts removes the aggravating exercises from her pool in code
-- before the model ever sees it, so a value outside the set below is a knee that
-- silently gets lunges. Hence the check constraint.
--
-- Dropped from the web funnel, NOT from the schema:
--   q_safety → `safety_flags` — the Expo app still asks it, every profile
--   written between 2026-08-12 and today carries a value, and the plan
--   generator's hard rule about hormone therapy, phytoestrogens and herbal
--   supplements still reads it. Web writes an empty array from now on.
--
-- Depends on nothing in 2026-08-12-quiz-v2-columns.sql — apply in either order.
--
-- Apply by hand in the Supabase SQL editor (there is no migration runner).

alter table public.user_profiles
  add column if not exists physical_limits text[];

-- Value set is enforced by zod in /api/auth/save-quiz; this constraint is the
-- second wall, so a bad write from anywhere else fails loudly instead of landing
-- a value the exercise filter will silently ignore.
-- `not valid` skips the scan of existing rows — they are all null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_physical_limits_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_physical_limits_check
      check (
        physical_limits is null
        or physical_limits <@ array[
             'back', 'knee', 'hip', 'shoulder', 'pelvic_floor', 'balance', 'none'
           ]::text[]
      )
      not valid;
  end if;
end $$;

-- No RLS or GRANT changes: this is a column on an existing table, and
-- user_profiles already carries its "own rows" policy and its grants to
-- `authenticated`. Server-side writes go through the service role in
-- /api/auth/save-quiz, which bypasses both.

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_profiles'
--      and column_name = 'physical_limits';
