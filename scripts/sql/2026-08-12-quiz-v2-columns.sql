-- 2026-08-12 — Quiz v2: four new questions + the symptom impact rating.
--
-- The /register funnel was reordered and re-scoped:
--   NEW  q_menopause_type  → user_profiles.menopause_type
--   NEW  q_nutrition       → user_profiles.nutrition_style
--   NEW  q_relaxation      → user_profiles.relaxation_style
--   NEW  q_safety          → user_profiles.safety_flags   (multi-select)
--   NEW  follow-up on q4   → user_profiles.symptom_impact (mild/moderate/severe)
--
-- Dropped from the web funnel, NOT from the schema:
--   q6_how_long → `timing`     — the Expo app still asks it, and every existing
--   q7_qualifier → `qualifier`   row carries a value. Web writes null from now on.
--
-- Nullable with no defaults on purpose: null means "she was never asked", which
-- is different from "she answered none". Only safety_flags defaults to an empty
-- array, because the quiz makes that screen mandatory and an empty array there
-- would be a bug worth seeing.
--
-- Apply by hand in the Supabase SQL editor (there is no migration runner).

alter table public.user_profiles
  add column if not exists symptom_impact   text,
  add column if not exists menopause_type   text,
  add column if not exists nutrition_style  text,
  add column if not exists relaxation_style text,
  add column if not exists safety_flags     text[];

-- Value sets are enforced by zod in /api/auth/save-quiz; these constraints are
-- the second wall, so a bad write from anywhere else fails loudly instead of
-- landing a value the plan generator will silently ignore.
-- `not valid` skips the scan of existing rows — they are all null.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_symptom_impact_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_symptom_impact_check
      check (symptom_impact is null or symptom_impact in ('mild', 'moderate', 'severe'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_menopause_type_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_menopause_type_check
      check (menopause_type is null or menopause_type in ('natural', 'surgical', 'medical', 'not_sure'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_nutrition_style_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_nutrition_style_check
      check (nutrition_style is null or nutrition_style in ('skipping', 'convenience', 'inconsistent', 'intentional'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_relaxation_style_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_relaxation_style_check
      check (relaxation_style is null or relaxation_style in ('none', 'occasional', 'routine', 'want_to'))
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_profiles_safety_flags_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_safety_flags_check
      check (
        safety_flags is null
        or safety_flags <@ array['breast_cancer', 'clots_stroke', 'liver_disease', 'none', 'prefer_not']::text[]
      )
      not valid;
  end if;
end $$;

-- No RLS or GRANT changes: these are columns on an existing table, and
-- user_profiles already carries its "own rows" policy and its grants to
-- `authenticated`. Server-side writes go through the service role in
-- /api/auth/save-quiz, which bypasses both.

-- Verify:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_profiles'
--      and column_name in ('symptom_impact','menopause_type','nutrition_style',
--                          'relaxation_style','safety_flags');
