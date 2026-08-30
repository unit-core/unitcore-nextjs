-- Two ways to hand out rows that RLS never approved, and one query that finds
-- both. Run it against the project after every migration that touches a view
-- or a function:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/checks/security-invariants.sql
--
-- It raises, so a non-zero exit is the CI signal.
--
-- 1. A view is created by postgres and therefore runs as postgres, which has
--    BYPASSRLS. Without `with (security_invoker = true)` it reads the base
--    tables as its owner and returns every row to anyone allowed to select
--    from the view. Materialized views cannot be invoker views at all, so they
--    have no place in an exposed schema.
--
-- 2. A `security definer` function runs as its owner for the same reason. That
--    is exactly what the private.is_* helpers need — they answer yes or no
--    about the caller. It stops being safe the moment such a function returns
--    rows: PostgREST exposes anything in public as /rest/v1/rpc/<name>, and a
--    definer function returning setof is an endpoint that hands out the table.
--    Scalars are fine (public.invite_lookup answers about an address the
--    caller already knows); trigger functions are fine (not callable directly).
do $$
declare
  bad_views text;
  bad_functions text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
    into bad_views
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'budget')
    and (
      (c.relkind = 'v' and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=true%')
      or c.relkind = 'm'
    );

  select string_agg(format('%I.%I -> %s', n.nspname, p.proname, pg_get_function_result(p.oid)), ', ' order by p.proname)
    into bad_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname in ('public', 'budget', 'private')
    and (
      p.proretset
      or p.prorettype in ('record'::regtype, 'refcursor'::regtype)
      or exists (
        select 1 from pg_type t
        where t.oid = p.prorettype and t.typtype = 'c' and t.typrelid <> 0
      )
    );

  if bad_views is not null then
    raise exception
      'views that bypass RLS (add "with (security_invoker = true)", drop materialized views): %',
      bad_views;
  end if;

  if bad_functions is not null then
    raise exception
      'security definer functions that return rows (must return a scalar or a trigger): %',
      bad_functions;
  end if;

  raise notice 'security invariants ok';
end $$;
