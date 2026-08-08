-- URGENT. Applied 2026-08-08.
--
-- Four RLS policies named "Service role can ..." were written without a TO
-- clause. A policy with no TO clause applies to the `public` role — which
-- includes `anon` and `authenticated` — not to `service_role`. Each of them
-- carries USING (true), so each one grants every caller unrestricted access to
-- the whole table, and a permissive policy that matches overrides the
-- self-scoped policies sitting next to it.
--
-- Combined with the table GRANTs (anon and authenticated hold full DML on these
-- tables), the effect was that the anon key — which ships in the browser bundle
-- and is public by design — was a master key. Verified against production:
--
--     curl "$SUPABASE_URL/rest/v1/user_profiles?select=name,top_problems" \
--          -H "apikey: $ANON_KEY"
--
-- returned other users' names and symptom lists with no session at all. The
-- same policy is FOR ALL, so the write path was open too: anyone could PATCH
-- their own user_trials row to account_status='paid' with a far-future
-- subscription_ends_at and take the product for free, or wipe the table.
--
-- These policies are not merely mis-scoped, they are unnecessary: service_role
-- BYPASSES row level security entirely, so every server-side path
-- (getSupabaseAdmin(), the Stripe webhook, the cron routes) keeps working with
-- them gone. Dropping them restores the self-scoped policies underneath:
--
--   user_profiles  → view/insert/update own row  (auth.uid() = user_id)
--   user_trials    → view own row only; writes are server-side, which is what
--                    makes the paywall a paywall
--   user_insights  → read own row
--   documents      → no policy, i.e. deny all. Correct: the RAG pipeline reads
--                    it with the service role in app/api/langchain-rag, never
--                    from the browser.

begin;

drop policy if exists "Service role can manage all profiles" on public.user_profiles;
drop policy if exists "Service role can manage all trials"   on public.user_trials;
drop policy if exists "Service role can manage insights"     on public.user_insights;
drop policy if exists "Service role can read all documents"  on public.documents;

commit;

-- After applying, this must return an empty array rather than rows:
--   curl "$SUPABASE_URL/rest/v1/user_profiles?select=name&limit=1" -H "apikey: $ANON_KEY"
