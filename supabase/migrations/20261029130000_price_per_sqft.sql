create or replace function private.validate_batch_input(
  p_purchase_date date,
  p_variant_name text,
  p_initial_units integer,
  p_unit_purchase_price numeric,
  p_freight_cost numeric,
  p_length_ft numeric,
  p_breadth_ft numeric,
  p_thickness_mm integer,
  p_slot text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_purchase_date is null then
    raise exception 'Purchase date is required' using errcode = 'check_violation';
  end if;
  if p_purchase_date < date '2000-01-01' then
    raise exception 'Purchase date must be on or after 2000-01-01' using errcode = 'check_violation';
  end if;
  if p_purchase_date > private.ist_today() then
    raise exception 'Purchase date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_initial_units is null or p_initial_units <= 0 then
    raise exception 'Unit Quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_unit_purchase_price is null then
    raise exception 'Unit purchase price is required' using errcode = 'check_violation';
  end if;
  if p_unit_purchase_price < 0 then
    raise exception 'Unit purchase price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_freight_cost, 0) < 0 then
    raise exception 'Freight cost must be zero or more' using errcode = 'check_violation';
  end if;
  if p_variant_name is null or length(trim(p_variant_name)) = 0 then
    raise exception 'Variant name is required' using errcode = 'check_violation';
  end if;
  if p_length_ft is not null and p_length_ft <= 0 then
    raise exception 'Length must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_breadth_ft is not null and p_breadth_ft <= 0 then
    raise exception 'Breadth must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_thickness_mm is not null and p_thickness_mm <= 0 then
    raise exception 'Thickness must be greater than zero' using errcode = 'check_violation';
  end if;
  if (p_length_ft is null) <> (p_breadth_ft is null)
    or (p_length_ft is null) <> (p_thickness_mm is null) then
    raise exception 'Size must include length, breadth and thickness together'
      using errcode = 'check_violation';
  end if;
  if coalesce(p_length_ft * p_breadth_ft, 1) * p_unit_purchase_price
    + coalesce(p_freight_cost, 0) / p_initial_units >= 1e10 then
    raise exception 'Landed Cost per piece is too large' using errcode = 'check_violation';
  end if;
  if p_slot is not null and length(trim(p_slot)) > 20 then
    raise exception 'Yard slot must be 20 characters or fewer' using errcode = 'check_violation';
  end if;
end;
$$;

create temporary table price_per_sqft_views as
with recursive deps (oid, depth) as (
  select distinct r.ev_class, 1
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  where d.classid = 'pg_rewrite'::regclass
    and d.refobjid = 'public.batches'::regclass
    and r.ev_class <> 'public.batches'::regclass
  union
  select distinct r.ev_class, deps.depth + 1
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join deps on d.refobjid = deps.oid
  where d.classid = 'pg_rewrite'::regclass
    and r.ev_class <> deps.oid
)
select
  n.nspname as schema_name,
  c.relname as view_name,
  max(deps.depth) as depth,
  pg_get_viewdef(c.oid) as definition,
  c.reloptions,
  c.relacl
from deps
join pg_class c on c.oid = deps.oid
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
group by c.oid, n.nspname, c.relname;

do $$
declare
  v record;
begin
  for v in select * from price_per_sqft_views order by depth desc loop
    execute format('drop view %I.%I', v.schema_name, v.view_name);
  end loop;
end;
$$;

create temporary table price_per_sqft_before as
select id, landed_cost from public.batches;

alter table public.batches drop column landed_cost;
alter table public.batches alter column unit_purchase_price type numeric(22, 10);

alter table public.batches disable trigger batches_check_size;
alter table public.batches disable trigger batches_set_updated_at;

update public.batches
set unit_purchase_price = round(unit_purchase_price / (length_ft * breadth_ft), 10)
where length_ft is not null and breadth_ft is not null;

alter table public.batches enable trigger batches_set_updated_at;
alter table public.batches enable trigger batches_check_size;

alter table public.batches add column landed_cost numeric(12, 2) generated always as
  (round(coalesce(length_ft * breadth_ft, 1) * unit_purchase_price + freight_cost / initial_units, 2)) stored;

do $$
declare
  v_changed integer;
begin
  select count(*) into v_changed
  from public.batches b
  join price_per_sqft_before p on p.id = b.id
  where b.landed_cost <> p.landed_cost;
  if v_changed > 0 then
    raise exception '% batches would change Landed Cost', v_changed;
  end if;
end;
$$;

do $$
declare
  v record;
  g record;
begin
  for v in select * from price_per_sqft_views order by depth loop
    execute format(
      'create view %I.%I %s as %s',
      v.schema_name,
      v.view_name,
      case when v.reloptions is null then '' else 'with (' || array_to_string(v.reloptions, ', ') || ')' end,
      v.definition
    );
    execute format('revoke all on %I.%I from public, anon, authenticated, service_role', v.schema_name, v.view_name);
    for g in
      select a.privilege_type, a.grantee
      from aclexplode(v.relacl) a
      join pg_class c on c.relname = v.view_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = v.schema_name
      where a.grantee <> c.relowner
    loop
      execute format(
        'grant %s on %I.%I to %s',
        g.privilege_type,
        v.schema_name,
        v.view_name,
        case when g.grantee = 0 then 'public' else quote_ident(g.grantee::regrole::text) end
      );
    end loop;
  end loop;
end;
$$;

drop table price_per_sqft_before;
drop table price_per_sqft_views;

create or replace view public.v_batches with (security_invoker = true) as
select
  b.id, b.batch_code, b.purchase_date, b.slot,
  b.length_ft, b.breadth_ft, b.thickness_mm,
  b.initial_units, b.units_sold,
  b.initial_units - b.units_sold as available,
  p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' ||
    coalesce(b.thickness_mm::text, '') as line_key,
  b.unit_purchase_price, b.freight_cost, b.landed_cost, b.notes,
  b.created_at, b.created_by, b.updated_at, b.updated_by,
  v.id as variant_id, v.name as variant_name,
  p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
  s.id as supplier_id, s.name as supplier_name,
  b.stack_number,
  b.archived_at,
  round(coalesce(b.length_ft * b.breadth_ft, 1) * b.initial_units * b.unit_purchase_price, 2) + b.freight_cost
    as total_cost
from public.batches b
join public.variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.suppliers s on s.id = b.supplier_id;
