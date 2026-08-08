-- Applied 2026-08-07. Kept here for the record — there is no migration runner.
--
-- A habit she ADDS ('build') and a temptation she RESISTS ('resist') are ticked
-- the same way but rewarded differently: resist is scored on streak length,
-- because the whole point is the unbroken run.

alter table public.user_habits
  add column if not exists kind text not null default 'build';

alter table public.user_habits
  drop constraint if exists user_habits_kind_check;

alter table public.user_habits
  add constraint user_habits_kind_check check (kind in ('build', 'resist'));

-- Streaks read every log for one habit key in date order; without this the
-- daily plan fetch table-scans once her history gets long.
create index if not exists user_plan_logs_user_key_date_idx
  on public.user_plan_logs (user_id, task_key, date);
