-- 2026-08-29 — q_limitations removed from the /register funnel, and with it the
-- exercise-pool filter it fed. This drops the column it wrote to.
--
-- Reverses 2026-08-16-physical-limits.sql. The reason is scope, not friction: a
-- woman who tells us her knee hurts needs a clinician, and an unsupervised
-- eight-week plan generated from six checkboxes is not one. Asking the question
-- implies we can serve her safely and the product is not built to, so she is out
-- of scope rather than accommodated.
--
-- Gone from the code in the same commit:
--   LIMITATION_OPTIONS / the q_limitations step   app/register/page.tsx
--   PHYSICAL_LIMITS + the physical_limits write   app/api/auth/save-quiz/route.ts
--   LIMITATION_EXCLUDES, limitationLine(),        lib/plan/catalog.ts
--     LIMITATION_LABEL, and the physicalLimits
--     parameter on allowedExercises() /
--     allowedWarmups() / allowedCooldowns()
--   the profile field and both prompt lines       lib/plan/generate.ts
--
-- APPLIED 2026-08-29, BEFORE the code deploy, deliberately — there are no real
-- users yet, only test accounts. Note what that means while it is true: the
-- live build still puts `physical_limits` in the object it hands to
-- .insert()/.update() in save-quiz, so every profile write against production
-- fails until the matching deploy lands. save-quiz only console.errors that, so
-- the funnel carries her to Stripe with no profile behind her. Harmless on test
-- traffic, an unrecoverable $59 sale on real traffic. Deploy.
--
-- On any future project with live users, run a drop like this AFTER the deploy
-- that stops writing the column, never before.
--
-- WHAT THIS DESTROYED: 3 of 11 test profiles carried a value — ["hip"],
-- ["shoulder","pelvic_floor"] and one legacy ["none"], which meant nothing even
-- when the filter was live. No real users, so nothing of consequence. The
-- snapshot below was offered and declined; it is left here as the pattern for
-- the next irreversible drop:
--
--   create table if not exists public.physical_limits_archive as
--     select user_id, physical_limits, now() as archived_at
--       from public.user_profiles
--      where coalesce(array_length(physical_limits, 1), 0) > 0;
--
-- NOT dropped: `safety_flags`. The Expo app still asks q_safety, every profile
-- written since 2026-08-12 carries a value, and the plan generator's hard rule
-- about hormone therapy, phytoestrogens and herbal supplements still reads it.
--
-- Applied via the Supabase MCP `apply_migration` (name: drop_physical_limits),
-- then verified with the two queries at the foot of this file — both empty.

-- Redundant — Postgres drops a single-column check with the column — but
-- explicit, so the constraint from 2026-08-16 cannot outlive what it guarded.
alter table public.user_profiles
  drop constraint if exists user_profiles_physical_limits_check;

alter table public.user_profiles
  drop column if exists physical_limits;

-- No RLS or GRANT changes: dropping a column from a table that keeps its
-- "own rows" policy and its grants to `authenticated`.

-- Verify — both must return no rows:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_profiles'
--      and column_name = 'physical_limits';
--   select conname from pg_constraint
--    where conname = 'user_profiles_physical_limits_check';
