-- 2026-09-04 — drop the two things nothing reads any more.
--
-- ── public.llm_usage ────────────────────────────────────────────────────────
-- One row per OpenAI call, written by lib/llmUsage.ts from lib/plan/generate.ts.
-- It was read by the `/admin` AI-cost tile until 2026-09-03, when that tile was
-- removed for the reason recorded in CLAUDE.md: the measured serving cost was
-- fractions of a cent per plan and never changed a decision. Since then the
-- table has been write-only — 301 rows and $0.30 of history in total, last
-- written 2026-08-29.
--
-- The argument for keeping it was "a cost question is a query against that
-- table, not a permanent tile". That argument is now retired: the write path
-- (lib/llmUsage.ts, lib/llmCost.ts, and the `meter` plumbing through
-- buildPlan/buildNutritionWhy) is deleted in the same commit, so the table can
-- only ever hold what it already holds. Note that it never covered Lisa chat at
-- all — only plan generation called recordLlmUsage — so it was never a complete
-- picture of OpenAI spend even while it was live.
--
-- If per-call cost accounting is wanted again, add it back deliberately: it
-- needs to cover /api/langchain-rag as well as plan generation, and it needs a
-- reader, or it lands straight back here.
--
-- A JSON export of the 301 rows was taken before this ran.
drop table if exists public.llm_usage;

-- ── public.cleanup_old_notifications() ──────────────────────────────────────
-- No caller anywhere: not in this codebase, not in the Expo app, and not on a
-- schedule — `pg_cron` is not installed on this project (verified 2026-09-04,
-- `select count(*) from pg_extension where extname='pg_cron'` returns 0). It
-- has therefore never run since it was created.
--
-- Notification retention, if it is ever wanted, belongs with the other
-- scheduled work in /api/cron/ where vercel.json can be read to find it, rather
-- than in a database function no file in the repo mentions.
drop function if exists public.cleanup_old_notifications();

-- Verify:
--   select to_regclass('public.llm_usage');                    -- null
--   select count(*) from pg_proc
--    where proname = 'cleanup_old_notifications';              -- 0
