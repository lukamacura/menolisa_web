-- 2026-08-29 — drop the schema nothing reads.
--
-- Verified before writing this file: every column and table below was grepped
-- against `app/`, `lib/`, `components/`, `hooks/` in the web app and `src/` in
-- the Expo app. Nothing referenced them except the delete-cascade lists, which
-- this pass removes in the same commit.
--
-- What is NOT dropped, and why:
--   user_preferences.current_streak / longest_streak / last_log_date /
--   total_logs           — read and written by /api/symptom-logs
--   last_seen_insights / last_pattern_detected_at
--                        — read by /api/langchain-rag
--   notification_enabled / weekly_insights_enabled
--                        — the two live toggles on /api/notifications/preferences
--   user_push_tokens     — empty today, but /api/notifications writes it
--   weekly_insights      — written by /api/cron/weekly-recap

-- ─── 1. The referral system (removed in code 2026-08-10, never dropped) ──────
drop table if exists public.referrals;
alter table public.user_profiles drop column if exists referral_code;
alter table public.user_trials  drop column if exists referral_discount_used_at;

-- `referral_reward` is no longer a notification anything can emit.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'lisa_insight','lisa_message','achievement','reminder',
    'trial','welcome','success','error','weekly_insights'
  ]));

-- ─── 2. user_insights — the old "latest AI insight" cache ────────────────────
-- Superseded by weekly_insights + the plan. No route reads or writes it; the
-- only references were the account-delete and purge lists.
drop table if exists public.user_insights;

-- ─── 3. user_preferences — columns from the pre-plan tracker UI ──────────────
alter table public.user_preferences
  drop column if exists favorite_symptoms,
  drop column if exists check_in_time,
  drop column if exists total_good_days,
  drop column if exists morning_checkin_time,
  drop column if exists evening_checkin_enabled,
  drop column if exists evening_checkin_time,
  drop column if exists weekly_summary_day,
  drop column if exists insight_notifications,
  drop column if exists streak_reminders,
  drop column if exists custom_triggers,
  drop column if exists insights_generated_at,
  drop column if exists reminder_time,          -- the route comments say "ignored"
  drop column if exists weekly_insights_day,    -- the cron is a fixed 7pm Sunday
  drop column if exists weekly_insights_time;

-- ─── 4. A trigger function whose table is long gone ─────────────────────────
drop function if exists public.update_daily_mood_updated_at();

-- ─── 5. Stale comment: plan_type predates the single 8-week plan ────────────
comment on column public.user_trials.plan_type is
  'Billing interval label. One plan today ("8week"); the monthly/annual pair was retired 2026-08-08.';
