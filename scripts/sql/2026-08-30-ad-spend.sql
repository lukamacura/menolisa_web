-- Daily Meta ad spend, typed into /admin.
--
-- Why a table and not localStorage (where this lived until 2026-08-30):
--   * localStorage is one browser. Opening /admin on a phone showed an empty
--     box and half the panel went dark.
--   * It held a single "total to date" number, which cannot be windowed. So
--     cost-per-sale for the last 30 days was contaminated by every dollar ever
--     spent, and got more wrong the longer the account ran.
-- One row per calendar day fixes both: spend can be summed over the same window
-- as the revenue it is compared against.
--
-- The day is the operator's calendar day as typed, not a timestamp. Ad spend is
-- reported by Meta per day in the ad account's timezone; storing a `date` keeps
-- it comparable to what Ads Manager shows rather than silently shifting it.
--
-- Service-role only, exactly like `llm_usage`: RLS on, no policies, no grants.
-- POST /api/admin/stats is the only writer and it is password-gated.
create table if not exists public.ad_spend (
  day         date primary key,
  amount_usd  numeric(10,2) not null check (amount_usd >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.ad_spend enable row level security;
revoke all on table public.ad_spend from public, anon, authenticated;

-- Verify from outside — must return a permission error, not [].
--   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/ad_spend?select=amount_usd&limit=1" \
--        -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
