-- 2026-08-15 — make account deletion actually reach everything
--
-- `/api/account/delete` deletes a hardcoded list of tables and then calls
-- `auth.admin.deleteUser`. The list has drifted badly behind the schema — it
-- names none of `user_plans`, `user_plan_logs`, `user_habits`, `user_insights`,
-- `referrals` — and the only reason her plan is not left behind today is that
-- every one of those tables happens to carry
-- `user_id references auth.users on delete cascade`. The cascade, not the list,
-- is what makes the "permanently delete your account and all your data" promise
-- in the app true. Any table added without that FK silently opts out.
--
-- Two tables were opted out:
--
--   conversations — her chat transcripts, the most personal data in the product.
--     `user_id` is `text` with no FK, so nothing cascades. It survives only
--     because it is on the hardcoded list, and that loop swallows failures with
--     a console.warn. A failed delete there returned `{success:true}`, signed
--     her out, deleted the auth user, and orphaned every transcript with no
--     remaining way to find them.
--
--   llm_usage — per-call token/cost analytics, keyed by `user_id`, on no list
--     and behind no FK. Rows outlived the account entirely. The cost history is
--     worth keeping for accounting, but her id is not: this gives it
--     `on delete set null`, so the row survives de-identified.
--
-- After this migration the cascade alone is sufficient, and the route's table
-- list is a belt-and-braces ordering detail rather than the mechanism.

begin;

-- ---------------------------------------------------------------------------
-- conversations.user_id : text -> uuid, with a cascading FK
-- ---------------------------------------------------------------------------

-- Guard the type change. Verified clean at authoring time (28 rows, 0 null,
-- 0 non-uuid, 0 orphaned), but this must never coerce garbage into a uuid or
-- drop transcripts to satisfy a constraint.
do $$
declare
  bad_format bigint;
  orphaned   bigint;
begin
  select count(*) into bad_format
  from public.conversations
  where user_id is not null
    and user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  if bad_format > 0 then
    raise exception 'conversations: % row(s) have a user_id that is not a uuid; resolve them before running this', bad_format;
  end if;

  select count(*) into orphaned
  from public.conversations c
  where c.user_id is not null
    and not exists (select 1 from auth.users u where u.id = c.user_id::uuid);

  if orphaned > 0 then
    raise exception 'conversations: % row(s) reference a deleted user; these are the leak this migration exists to stop — inspect and purge them first', orphaned;
  end if;
end $$;

-- Both policies compare `(auth.uid())::text = user_id`, so they depend on the
-- column and Postgres refuses the retype while they exist (0A000, "cannot alter
-- type of a column used in a policy definition"). They have to come off first
-- and go back on after — which is fine, since the whole file is one
-- transaction and the table is never readable un-policied from outside it.
drop policy if exists "Users can view own conversations" on public.conversations;
drop policy if exists "Users can insert own conversations" on public.conversations;

-- The three btree indexes on (user_id, ...) are rebuilt automatically.
alter table public.conversations
  alter column user_id type uuid using user_id::uuid;

alter table public.conversations
  add constraint conversations_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Same rule as before, native types now that the cast is no longer needed.
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

comment on column public.conversations.user_id is
  'FK to auth.users with ON DELETE CASCADE. This is what removes her transcripts on account deletion — /api/account/delete also deletes them explicitly, but the cascade is the guarantee. Do not drop it.';

-- ---------------------------------------------------------------------------
-- llm_usage.user_id : keep the cost row, drop the identity
-- ---------------------------------------------------------------------------

alter table public.llm_usage
  add constraint llm_usage_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

comment on column public.llm_usage.user_id is
  'Nulled by ON DELETE SET NULL when the account is deleted, so the cost/token row survives for accounting without retaining a deleted user''s identifier. Admin panel must treat NULL as "deleted account".';

-- ---------------------------------------------------------------------------
-- purge_stale_anonymous_users() — the same drift, already fatal
-- ---------------------------------------------------------------------------
--
-- The anon-purge cron (daily, /api/cron/purge-anon-accounts) keeps its own
-- hand-maintained copy of the delete list, and that copy has rotted into a
-- function that cannot run at all:
--
--   delete from public.conversations where user_id = any(v_ids);
--     v_ids is uuid[], conversations.user_id is text — no `text = uuid`
--     operator exists, so this raises 42883.
--
--   delete from public.daily_mood where user_id = any(v_ids);
--     public.daily_mood does not exist (to_regclass -> null) — 42P01.
--
-- Both raise before the `delete from auth.users` at the end, and a plpgsql
-- function is atomic, so the entire purge rolls back. It has never deleted an
-- anonymous account. It has not been noticed because there are zero stale anon
-- accounts today; it fires the first time a quiz-abandoner ages past 7 days,
-- and then the cron 500s daily while Supabase keeps billing for the MAUs the
-- purge exists to shed.
--
-- Rather than repair the list, delete it. Every table it named cascades from
-- auth.users (that is what the FK work above finishes), so the single
-- auth.users delete is the whole job — and a table added later is covered
-- automatically instead of silently outliving the account.
create or replace function public.purge_stale_anonymous_users(p_older_than_hours integer default 168)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ids uuid[];
begin
  select array_agg(u.id) into v_ids
  from auth.users u
  where u.is_anonymous is true
    and (u.email is null or u.email = '')
    and u.created_at < now() - make_interval(hours => p_older_than_hours)
    and not exists (
      select 1
      from public.user_trials t
      where t.user_id = u.id
        and t.account_status = 'paid'
    );

  if v_ids is null then
    return 0;
  end if;

  -- Every public user table carries `user_id references auth.users on delete
  -- cascade`, so this removes her plan, habits, transcripts and the rest.
  -- Do not reintroduce a per-table list here; it is what broke this function.
  delete from auth.users where id = any(v_ids);

  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

comment on function public.purge_stale_anonymous_users(integer) is
  'Deletes abandoned anonymous funnel accounts older than p_older_than_hours, skipping any with an email or a paid subscription. Relies entirely on ON DELETE CASCADE from auth.users — never add per-table deletes back.';

commit;

-- ---------------------------------------------------------------------------
-- Verification — expect one row per table, all with on_delete = 'c'
-- (except llm_usage, which is 'n' for SET NULL).
--
--   select c.conrelid::regclass::text as child, a.attname, c.confdeltype
--     from pg_constraint c
--     join unnest(c.conkey) with ordinality as k(attnum, ord) on true
--     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
--    where c.contype = 'f'
--      and c.confrelid = 'auth.users'::regclass
--      and c.conrelid::regclass::text in ('conversations', 'llm_usage');
-- ---------------------------------------------------------------------------
