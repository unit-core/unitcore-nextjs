-- Applied through the Supabase MCP `apply_migration` tool under the name
-- `per_user_oauth_write_grants`. Kept here so the change is reviewable in the
-- diff; the project has no `supabase db push` workflow.
--
-- Write access moves from a global allowlist owned by the server operator to a
-- per-user grant the user hands to a specific OAuth client on the consent
-- screen. The key is (user_id, client_id): client_id is the UUID auth issues
-- and signs into the token, unlike client_name and redirect_uri, which the
-- client declares about itself.

create table public.oauth_grants (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  client_id    uuid not null,
  client_name  text not null,
  redirect_uri text not null,
  can_write    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, client_id)
);

comment on table public.oauth_grants is
  'Права, выданные пользователем конкретному OAuth-клиенту. client_name и '
  'redirect_uri денормализованы для отображения и аудита: решение принимает '
  'только client_id.';

-- No foreign key to auth.oauth_clients on purpose: auth is Supabase's schema
-- and its structure changes without our involvement.

create trigger oauth_grants_set_updated_at
  before update on public.oauth_grants
  for each row execute function public.set_updated_at();

alter table public.oauth_grants enable row level security;

create policy "oauth_grants_select_own" on public.oauth_grants
  for select to authenticated using (user_id = (select auth.uid()));

create policy "oauth_grants_insert_own" on public.oauth_grants
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "oauth_grants_update_own" on public.oauth_grants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "oauth_grants_delete_own" on public.oauth_grants
  for delete to authenticated using (user_id = (select auth.uid()));

-- An OAuth token grants full access to the user's data, this table included.
-- Without this policy any connected client opens /rest/v1/oauth_grants and
-- sets its own can_write = true, bypassing both the consent screen and the
-- settings page. Permissions change from a browser session only.
create policy "oauth_grants_web_session_only" on public.oauth_grants
  as restrictive for all to authenticated
  using (private.mcp_client_id() is null)
  with check (private.mcp_client_id() is null);

grant select, insert, update, delete on public.oauth_grants to authenticated;

-- An already connected Claude must not break at deploy time: everything the
-- old allowlist let write gets can_write = true.
insert into public.oauth_grants (user_id, client_id, client_name, redirect_uri, can_write)
select c.user_id,
       c.client_id,
       cl.client_name,
       btrim(split_part(cl.redirect_uris, ',', 1)),
       true
from auth.oauth_consents c
join auth.oauth_clients cl on cl.id = c.client_id
where c.revoked_at is null
  and cl.deleted_at is null
  and exists (
    select 1 from public.oauth_clients_allowed a
    where a.client_name = cl.client_name
      and a.redirect_uri = any (
        select btrim(u) from unnest(string_to_array(cl.redirect_uris, ',')) u
      )
      and a.can_write
  )
on conflict (user_id, client_id) do nothing;

-- Same signature, so every existing restrictive policy keeps working unchanged;
-- still a scalar, so security-invariants.sql stays green.
create or replace function private.mcp_can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when private.mcp_client_id() is null then true   -- web session
    else exists (
      select 1 from public.oauth_grants g
      where g.user_id = (select auth.uid())
        and g.client_id = private.mcp_client_id()
        and g.can_write
    )
  end;
$$;
