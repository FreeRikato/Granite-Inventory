-- Ticket 02: Products, Variants, Suppliers and Batches, plus create_batch.
-- Categorical columns are text with check constraints (no enums) so values can change cheaply.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null,
  category text not null check (category in ('GRANITE', 'MEMORIAL', 'TILES')),
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_abbreviation_shape check (abbreviation ~ '^[A-Z0-9]{1,4}$')
);
create unique index products_name_key on public.products (lower(name));
create unique index products_abbreviation_key on public.products (abbreviation);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  constraint variants_name_not_blank check (length(trim(name)) > 0)
);
create unique index variants_product_name_key on public.variants (product_id, lower(name));

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  location text,
  created_at timestamptz not null default now(),
  constraint suppliers_name_not_blank check (length(trim(name)) > 0)
);
create unique index suppliers_name_key on public.suppliers (lower(name));

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  batch_code text not null unique,
  variant_id uuid not null references public.variants (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_date date not null check (purchase_date <= current_date),
  length_ft numeric(5, 2) check (length_ft > 0),
  breadth_ft numeric(5, 2) check (breadth_ft > 0),
  thickness_mm integer check (thickness_mm > 0),
  slot text not null check (slot in ('4FT', '5FT', 'DOOM', 'CUSTOM')),
  initial_units integer not null check (initial_units > 0),
  units_sold integer not null default 0,
  unit_purchase_price numeric(12, 2) not null check (unit_purchase_price >= 0),
  freight_cost numeric(12, 2) not null default 0 check (freight_cost >= 0),
  landed_cost numeric(12, 2) generated always as
    (round(unit_purchase_price + freight_cost / initial_units, 2)) stored,
  notes text,
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint batches_units_sold_range check (units_sold >= 0 and units_sold <= initial_units),
  constraint batches_size_all_or_none check (
    (length_ft is null) = (breadth_ft is null) and (length_ft is null) = (thickness_mm is null)
  )
);
create index batches_variant_idx on public.batches (variant_id);
create index batches_supplier_idx on public.batches (supplier_id);
create index batches_purchase_date_idx on public.batches (purchase_date);

create trigger batches_set_updated_at
  before update on public.batches
  for each row execute function private.set_updated_at();

-- Size is required for Granite and Tiles and forbidden for Memorial. The rule needs the
-- Product's category, so it lives in a trigger rather than a check constraint.
create or replace function private.check_batch_size()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_category text;
begin
  select p.category into v_category
  from public.variants v join public.products p on p.id = v.product_id
  where v.id = new.variant_id;

  if v_category = 'MEMORIAL' and new.length_ft is not null then
    raise exception 'Memorial batches have no size' using errcode = 'check_violation';
  end if;
  if v_category <> 'MEMORIAL' and new.length_ft is null then
    raise exception 'Size is required for % batches', initcap(lower(v_category))
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger batches_check_size
  before insert or update on public.batches
  for each row execute function private.check_batch_size();

-- Slot suggestion shared by the form and create_batch.
create or replace function public.suggest_slot(p_category text, p_length_ft numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category = 'MEMORIAL' then 'DOOM'
    when p_length_ft >= 4 and p_length_ft < 5 then '4FT'
    when p_length_ft >= 5 and p_length_ft < 6 then '5FT'
    else 'CUSTOM'
  end;
$$;

-- Batch Code: {ABBR}-{DDMONYY}-{seq}. The advisory lock serialises two operators logging
-- the same product on the same day so the per-day sequence never collides.
create or replace function private.next_batch_code(p_product_id uuid, p_date date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_abbr text;
  v_prefix text;
  v_seq integer;
begin
  select abbreviation into v_abbr from public.products where id = p_product_id;
  v_prefix := v_abbr || '-' || upper(to_char(p_date, 'DDMONYY')) || '-';
  perform pg_advisory_xact_lock(hashtext(v_prefix));
  select coalesce(max(substring(batch_code from length(v_prefix) + 1)::integer), 0) + 1
    into v_seq
  from public.batches
  where batch_code like v_prefix || '%';
  return v_prefix || lpad(v_seq::text, 2, '0');
end;
$$;

-- Preview for the form: the code the next save would get (not reserved).
create or replace function public.preview_batch_code(p_product_id uuid, p_date date)
returns text
language sql
stable
set search_path = ''
as $$
  select private.next_batch_code(p_product_id, p_date);
$$;

create or replace function public.create_batch(
  p_product_id uuid,
  p_variant_name text,
  p_supplier_id uuid,
  p_purchase_date date,
  p_length_ft numeric default null,
  p_breadth_ft numeric default null,
  p_thickness_mm integer default null,
  p_slot text default null,
  p_initial_units integer default null,
  p_unit_purchase_price numeric default null,
  p_freight_cost numeric default 0,
  p_notes text default null
)
returns public.batches
language plpgsql
set search_path = ''
as $$
declare
  v_variant_id uuid;
  v_category text;
  v_batch public.batches;
begin
  select category into v_category from public.products where id = p_product_id;
  if v_category is null then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;

  -- Find or create the Variant; two operators typing the same new name at once both land
  -- on the single row thanks to the conflict clause on the case-insensitive index.
  insert into public.variants (product_id, name)
  values (p_product_id, trim(p_variant_name))
  on conflict (product_id, lower(name)) do nothing;
  select id into v_variant_id
  from public.variants
  where product_id = p_product_id and lower(name) = lower(trim(p_variant_name));

  insert into public.batches (
    batch_code, variant_id, supplier_id, purchase_date,
    length_ft, breadth_ft, thickness_mm, slot,
    initial_units, unit_purchase_price, freight_cost, notes
  ) values (
    private.next_batch_code(p_product_id, p_purchase_date),
    v_variant_id, p_supplier_id, p_purchase_date,
    p_length_ft, p_breadth_ft, p_thickness_mm,
    coalesce(p_slot, public.suggest_slot(v_category, p_length_ft)),
    p_initial_units, p_unit_purchase_price, coalesce(p_freight_cost, 0), nullif(trim(p_notes), '')
  )
  returning * into v_batch;

  return v_batch;
end;
$$;

-- Access: every member reads and creates; only Admin edits or deletes (Corrections, admin lists).
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.suppliers enable row level security;
alter table public.batches enable row level security;

create policy products_select on public.products for select to authenticated using ((select public.is_member()));
create policy products_insert on public.products for insert to authenticated with check ((select public.is_member()));
create policy products_update on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_delete on public.products for delete to authenticated using ((select public.is_admin()));

create policy variants_select on public.variants for select to authenticated using ((select public.is_member()));
create policy variants_insert on public.variants for insert to authenticated with check ((select public.is_member()));
create policy variants_update on public.variants for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variants_delete on public.variants for delete to authenticated using ((select public.is_admin()));

create policy suppliers_select on public.suppliers for select to authenticated using ((select public.is_member()));
create policy suppliers_insert on public.suppliers for insert to authenticated with check ((select public.is_member()));
create policy suppliers_update on public.suppliers for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy suppliers_delete on public.suppliers for delete to authenticated using ((select public.is_admin()));

create policy batches_select on public.batches for select to authenticated using ((select public.is_member()));
create policy batches_insert on public.batches for insert to authenticated with check ((select public.is_member()));
create policy batches_update on public.batches for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy batches_delete on public.batches for delete to authenticated using ((select public.is_admin()));

revoke execute on function public.create_batch(uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text) from public, anon;
revoke execute on function public.preview_batch_code(uuid, date) from public, anon;
revoke execute on function public.suggest_slot(text, numeric) from public, anon;
grant execute on function public.create_batch(uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.preview_batch_code(uuid, date) to authenticated, service_role;
grant execute on function public.suggest_slot(text, numeric) to authenticated, service_role;

-- Batches with their names resolved; security_invoker keeps RLS on the underlying tables.
create view public.v_batches with (security_invoker = true) as
  select
    b.id, b.batch_code, b.purchase_date, b.slot,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    b.initial_units, b.units_sold, b.initial_units - b.units_sold as available,
    b.unit_purchase_price, b.freight_cost, b.landed_cost, b.notes,
    b.created_at, b.created_by, b.updated_at, b.updated_by,
    v.id as variant_id, v.name as variant_name,
    p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
    s.id as supplier_id, s.name as supplier_name
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  join public.suppliers s on s.id = b.supplier_id;
