-- Stripe production-hardening migration.
-- Apply in Supabase SQL Editor (idempotent — safe to run multiple times).

-- 1) user_trials columns: payment-failure flag, dispute flag, last event watermark.
alter table public.user_trials
  add column if not exists payment_failed_at timestamptz,
  add column if not exists dispute_flagged_at timestamptz,
  add column if not exists last_stripe_event_at timestamptz;

-- 2) Webhook event log for idempotency. Stripe retries the same event.id on any non-2xx;
--    inserting the id first guarantees we process each event exactly once.
create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

-- Retention: keep ~90 days. Stripe retries for up to 3 days, so anything older is safe to prune.
create index if not exists stripe_webhook_events_received_at_idx
  on public.stripe_webhook_events (received_at);

-- RLS: only the service role touches this table.
alter table public.stripe_webhook_events enable row level security;
