-- Second half of `per_user_oauth_write_grants`, applied as its own migration so
-- that dropping a table was a deliberate step rather than a line buried in a
-- larger diff.
--
-- Nothing read this table by the time it went: private.mcp_can_write() stopped
-- referencing it in the migration above, no policy, view or foreign key pointed
-- at it, and the single allowlist row it held had already been translated into
-- per-user grants by that migration's backfill.
--
-- supabase/checks/oauth-write-gate.sql asserts it stays gone: a dead allowlist
-- left in public reads like a live permission surface to whoever finds it next.

drop table public.oauth_clients_allowed;
