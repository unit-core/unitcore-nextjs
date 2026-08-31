-- The write gate: who may change data through an OAuth client, and who decides.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/checks/oauth-write-gate.sql
--
-- It raises, so a non-zero exit is the CI signal.
--
-- Write access is granted by the user to one client_id and stored in
-- public.oauth_grants. Five things have to hold for that to mean anything, and
-- each of them is one policy or one function away from silently not holding:
--
-- 1. A connected client must not be able to edit its own row. Its token grants
--    full access to the user's data, this table included, so /rest/v1/oauth_grants
--    is one PATCH away from can_write = true unless a restrictive policy pins
--    the change to a browser session.
-- 2. private.mcp_can_write() has to stay a security definer scalar: definer so
--    it can read the grant from under an OAuth token whose RLS hides the table,
--    scalar so security-invariants.sql keeps letting it exist.
-- 3. The allowlist this replaced has to be gone, or it stays behind reading
--    like a live permission surface to whoever finds it next.
-- 4. The restrictive policies that call it have to keep covering every table and
--    command they covered before permissions became per-user. A dropped policy
--    is an open door that no test notices, because everything still works.
-- 5. The deletes no grant may ever unlock have to stay shut. Those gates read
--    mcp_client_id() directly, so can_write does not reach them.
do $$
declare
  missing_rls boolean;
  missing_web_only boolean;
  bad_gate text;
  leftover_allowlist boolean;
  drifted_policies text;
  missing_delete_ban text;
begin
  -- 1. The table itself.
  select not coalesce(c.relrowsecurity, false)
    into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'oauth_grants';

  if missing_rls is null then
    raise exception 'public.oauth_grants does not exist: the write gate has no store';
  end if;

  if missing_rls then
    raise exception 'public.oauth_grants has row level security disabled';
  end if;

  select not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'oauth_grants'
      and permissive = 'RESTRICTIVE'
      and cmd = 'ALL'
      and qual like '%mcp_client_id() IS NULL%'
      and with_check like '%mcp_client_id() IS NULL%'
  ) into missing_web_only;

  if missing_web_only then
    raise exception
      'public.oauth_grants has no restrictive FOR ALL policy pinning writes to a web session '
      '(mcp_client_id() IS NULL in both USING and WITH CHECK): a connected client can grant itself write access';
  end if;

  -- 2. The function every restrictive policy below calls.
  select coalesce(
    (
      select case
        when pg_get_function_result(p.oid) <> 'boolean' then
          format('private.mcp_can_write() returns %s, expected boolean', pg_get_function_result(p.oid))
        when not p.prosecdef then 'private.mcp_can_write() is not security definer'
        when p.provolatile <> 's' then 'private.mcp_can_write() is not stable'
      end
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'mcp_can_write' and p.pronargs = 0
    ),
    case
      when exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'mcp_can_write' and p.pronargs = 0
      ) then null
      else 'private.mcp_can_write() does not exist'
    end
  ) into bad_gate;

  if bad_gate is not null then
    raise exception '%', bad_gate;
  end if;

  -- 3. The allowlist it replaced. Left in place it is dead weight that reads
  --    like a live permission surface to whoever finds it next.
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'oauth_clients_allowed'
  ) into leftover_allowlist;

  if leftover_allowlist then
    raise exception 'public.oauth_clients_allowed still exists: the global allowlist was replaced by public.oauth_grants';
  end if;

  -- 4. Coverage. Both directions: a policy that disappeared opens a table, and
  --    one that appeared unannounced means this list is stale.
  with expected (tbl, cmd) as (
    values
      ('budget.categories', 'INSERT'),
      ('budget.categories', 'UPDATE'),
      ('budget.categories', 'DELETE'),
      ('budget.transaction_items', 'INSERT'),
      ('budget.transaction_items', 'UPDATE'),
      ('budget.transaction_items', 'DELETE'),
      ('budget.transactions', 'INSERT'),
      ('budget.transactions', 'UPDATE'),
      ('budget.transactions', 'DELETE'),
      ('public.profiles', 'UPDATE'),
      ('public.space_members', 'INSERT'),
      ('public.spaces', 'INSERT'),
      ('public.spaces', 'UPDATE')
  ),
  actual (tbl, cmd) as (
    select format('%s.%s', schemaname, tablename), cmd
    from pg_policies
    where permissive = 'RESTRICTIVE'
      and (coalesce(qual, '') like '%mcp_can_write()%' or coalesce(with_check, '') like '%mcp_can_write()%')
  ),
  drift as (
    select 'missing: ' || tbl || ' ' || cmd as line from (select * from expected except select * from actual) d
    union all
    select 'unexpected: ' || tbl || ' ' || cmd from (select * from actual except select * from expected) d
  )
  select string_agg(line, ', ' order by line) into drifted_policies from drift;

  if drifted_policies is not null then
    raise exception 'restrictive policies calling mcp_can_write() drifted from the expected set: %', drifted_policies;
  end if;

  -- 5. Deletes that no grant may unlock. Spaces, memberships and profiles are
  --    gone for good once removed, so an OAuth client never deletes them —
  --    that gate reads mcp_client_id() directly and ignores can_write.
  with expected (tbl) as (
    values ('public.spaces'), ('public.space_members'), ('public.profiles')
  ),
  actual (tbl) as (
    select format('%s.%s', schemaname, tablename)
    from pg_policies
    where permissive = 'RESTRICTIVE'
      and cmd = 'DELETE'
      and qual like '%mcp_client_id() IS NULL%'
  )
  select string_agg(tbl, ', ' order by tbl) into missing_delete_ban
  from (select * from expected except select * from actual) d;

  if missing_delete_ban is not null then
    raise exception 'no restrictive DELETE policy blocking OAuth clients on: %', missing_delete_ban;
  end if;

  raise notice 'oauth write gate ok';
end $$;
