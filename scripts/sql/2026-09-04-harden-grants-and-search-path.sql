-- 2026-09-04 — three hardening items from the pre-scale Supabase audit.
-- None of these was an open door. All three are the difference between "safe
-- because of a second mechanism" and "safe because access was never granted".

-- ── 1. match_documents was executable by anon and authenticated ─────────────
-- It is the pgvector search behind Lisa. Every caller in the codebase uses the
-- service-role client (lib/rag/retrieval.ts:747, :866, :1154 — all
-- getSupabaseAdmin()), and service_role bypasses grants entirely, so nothing
-- loses access here.
--
-- It leaked no data even before this: the function is invoker-rights (not
-- SECURITY DEFINER), so RLS on `documents` still applied and an anon caller got
-- zero rows. What it did expose was *compute* — anyone holding the anon key,
-- which ships in the browser bundle, could run unlimited vector searches
-- against our index. On a Free plan that is someone else spending our quota.
-- All three roles, and `public` is the one that matters. Revoking only `anon`
-- and `authenticated` measured as a complete no-op when applied on 2026-09-04:
-- Postgres grants EXECUTE on every new function to PUBLIC by default, both
-- named roles inherit it, and has_function_privilege('anon', ...) still came
-- back true. This is the third time that trap has been hit in this project
-- (2026-08-08, 2026-08-10, 2026-09-04) — never assume a revoke worked, check it.
revoke execute on function public.match_documents(vector, integer, jsonb)
  from public;
revoke execute on function public.match_documents(vector, integer, jsonb)
  from anon, authenticated;

-- ── 2. funnel_dropoff had a mutable search_path ────────────────────────────
-- Flagged by the Supabase linter (0011). Low risk here because the function is
-- already unreachable by anon and authenticated and is not SECURITY DEFINER,
-- but a function that resolves its own table names at call time is one
-- privilege change away from resolving them somewhere an attacker controls.
-- Pin it, the way every other function in this project already is.
alter function public.funnel_dropoff(timestamptz) set search_path = public, pg_temp;

-- ── 3. documents and stripe_webhook_events still carried table grants ──────
-- Both are service-role-only tables in every sense that matters: RLS is on and
-- neither has a single policy, so the anon key already reads `[]` from them.
-- But they still hold GRANTs, unlike ad_spend and funnel_events which return a
-- clean `42501 permission denied`. Two layers is the house pattern (see
-- CLAUDE.md, "Adding a New Database Table"): the GRANT is the access gate, RLS
-- is the row filter. Make these two match.
revoke all on table public.documents from anon, authenticated;
revoke all on table public.stripe_webhook_events from anon, authenticated;

-- Applied 2026-09-04. Verified after: anon and authenticated both false on
-- match_documents, service_role still true (it is the only caller);
-- `documents` and `stripe_webhook_events` now answer 42501 to the anon key
-- rather than an empty array.
--
-- Verify (all must be false / permission denied):
--   select has_function_privilege('anon','public.match_documents(vector,integer,jsonb)','EXECUTE');
--   select has_table_privilege('anon','public.documents','SELECT');
--   select has_table_privilege('anon','public.stripe_webhook_events','SELECT');
--   select proconfig from pg_proc where proname='funnel_dropoff';  -- {search_path=public,pg_temp}
