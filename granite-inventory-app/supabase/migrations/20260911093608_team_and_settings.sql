-- Ticket 01: access model and settings.
-- Team Members are the Google accounts allowed in. Every policy in later migrations
-- goes through is_member() / is_admin(), which read the caller's JWT email.

create schema if not exists private;
-- Trigger functions live here and run as the calling role, so members need usage on the
-- schema. Nothing in it is exposed through the API (only public is).
grant usage on schema private to authenticated, service_role;

create or replace function private.current_email()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
$$;

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null check (role in ('ADMIN', 'YARD_OPERATOR')),
  created_at timestamptz not null default now(),
  constraint team_members_email_lowercase check (email = lower(email))
);

-- Security definer so the lookup bypasses RLS on team_members itself; the function only
-- ever answers a question about the caller, never about anyone else.
create or replace function public.member_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.team_members where email = private.current_email();
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_members where email = private.current_email());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where email = private.current_email() and role = 'ADMIN'
  );
$$;

revoke execute on function public.member_role(), public.is_member(), public.is_admin() from public, anon;
grant execute on function public.member_role(), public.is_member(), public.is_admin() to authenticated, service_role;

alter table public.team_members enable row level security;

create policy team_members_select on public.team_members
  for select to authenticated using ((select public.is_member()));
create policy team_members_insert on public.team_members
  for insert to authenticated with check ((select public.is_admin()));
create policy team_members_update on public.team_members
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy team_members_delete on public.team_members
  for delete to authenticated using ((select public.is_admin()));

-- The yard must always keep at least one Admin, otherwise nobody can manage access.
create or replace function private.keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'ADMIN') then
    if old.role = 'ADMIN' and not exists (
      select 1 from public.team_members where role = 'ADMIN' and id <> old.id
    ) then
      raise exception 'At least one Admin must remain' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger team_members_keep_one_admin
  before update or delete on public.team_members
  for each row execute function private.keep_one_admin();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = private.current_email();
  return new;
end;
$$;

-- Single-row settings table: the primary key is a boolean that must be true.
create table public.settings (
  id boolean primary key default true check (id),
  business_name text not null default 'Kirthik Granite',
  tagline text not null default 'Granite, memorial & construction stone supply',
  ageing_after_days integer not null default 90 check (ageing_after_days > 0),
  stale_after_days integer not null default 180 check (stale_after_days > 0),
  catalog_public boolean not null default false,
  whatsapp_number text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint settings_ageing_before_stale check (ageing_after_days < stale_after_days)
);

alter table public.settings enable row level security;

create policy settings_select on public.settings
  for select to authenticated using ((select public.is_member()));
create policy settings_update on public.settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

-- What the unauthenticated catalog page may know about the business. A plain view owned by
-- postgres deliberately bypasses RLS; it exposes only these columns.
create view public.v_public_business as
  select business_name, tagline, catalog_public, whatsapp_number from public.settings;

revoke all on public.v_public_business from public;
grant select on public.v_public_business to anon, authenticated;
