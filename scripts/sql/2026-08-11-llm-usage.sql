-- 2026-08-11 — per-call OpenAI usage and cost
--
-- We sell an 8-week plan for $59 and generate it with two gpt-4o-mini calls,
-- and until now nothing recorded what those calls cost. The admin panel needs
-- to put cost-per-plan next to revenue-per-plan, so every call writes a row.
--
-- `run_id` is the join that makes "cost per generation" answerable: the weeks
-- call and the nutrition-reasons call share one, so a generation's cost is a
-- sum over run_id and the count of generations is `count(distinct run_id)`.
-- Averaging over rows instead would report half the true figure.
--
-- `cost_usd` is nullable on purpose. It is computed at write time from the rate
-- table in lib/llmCost.ts, and a model missing from that table stores NULL
-- rather than 0 — a zero would read as "free" and quietly understate spend.
-- The panel counts the unpriced rows so the gap is visible.

create table if not exists public.llm_usage (
  id                   bigserial primary key,
  user_id              uuid,
  run_id               uuid not null,
  kind                 text not null,
  model                text not null,
  prompt_tokens        integer not null default 0,
  cached_prompt_tokens integer not null default 0,
  completion_tokens    integer not null default 0,
  cost_usd             numeric(12, 6),
  duration_ms          integer,
  created_at           timestamptz not null default now()
);

comment on table public.llm_usage is
  'One row per OpenAI API call. Written by lib/llmUsage.ts, read only by the admin panel. cost_usd is frozen at write time from the rates in lib/llmCost.ts; NULL means the model was not in that table.';
comment on column public.llm_usage.run_id is
  'Groups the calls of one logical generation (an 8-week plan is two calls). Cost per generation = sum(cost_usd) grouped by run_id.';

create index if not exists llm_usage_created_at_idx on public.llm_usage (created_at desc);
create index if not exists llm_usage_kind_created_at_idx on public.llm_usage (kind, created_at desc);
create index if not exists llm_usage_run_id_idx on public.llm_usage (run_id);

-- No user ever reads this table: it is written with the service role and read
-- by the password-gated admin endpoint, both of which bypass RLS. RLS on with
-- zero policies and no grants is therefore the correct shape — anon and
-- authenticated get nothing. Do not add a "service role can manage all" policy;
-- service_role bypasses RLS entirely, so such a policy is either redundant or,
-- written without a TO clause, a hole (see 2026-08-08-URGENT-fix-rls-bypass).
alter table public.llm_usage enable row level security;

revoke all on table public.llm_usage from public, anon, authenticated;

-- Verify:
--   select has_table_privilege('anon', 'public.llm_usage', 'SELECT');          -- false
--   select has_table_privilege('authenticated', 'public.llm_usage', 'SELECT'); -- false
--   select kind, count(*), sum(cost_usd) from public.llm_usage group by 1;
