create or replace view public.v_batches with (security_invoker = true) as
  select
    b.id, b.batch_code, b.purchase_date, b.slot,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    b.initial_units, b.units_sold, b.initial_units - b.units_sold as available,
    p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' || coalesce(b.thickness_mm::text, '') as line_key,
    b.unit_purchase_price, b.freight_cost, b.landed_cost, b.notes,
    b.created_at, b.created_by, b.updated_at, b.updated_by,
    v.id as variant_id, v.name as variant_name,
    p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
    s.id as supplier_id, s.name as supplier_name
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  join public.suppliers s on s.id = b.supplier_id;

create or replace view public.v_yard_batches with (security_invoker = true) as
  with base as (
    select
      b.*,
      (private.ist_today() - b.purchase_date)::integer as age_days,
      lag(b.purchase_date) over (
        partition by b.product_id, b.length_ft, b.breadth_ft, b.thickness_mm
        order by b.purchase_date, b.created_at, b.batch_code
      ) as previous_purchase_date
    from public.v_batches b
  )
  select
    base.*,
    public.ageing_band(base.age_days) as ageing_band,
    (base.available = 0) as sold_out,
    (base.purchase_date - base.previous_purchase_date)::integer as days_since_previous
  from base;

drop view public.v_stock_lines;

create view public.v_stock_lines with (security_invoker = true) as
  select
    b.line_key,
    b.product_id, b.product_name, b.product_abbreviation, b.category,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    sum(b.available)::integer as available,
    count(*)::integer as batch_count,
    count(*) filter (where b.available > 0)::integer as batches_with_stock,
    min(b.purchase_date) as oldest_purchase_date
  from public.v_batches b
  group by b.line_key, b.length_ft, b.breadth_ft, b.thickness_mm,
    b.product_id, b.product_name, b.product_abbreviation, b.category;

drop view public.v_public_catalog;

create view public.v_public_catalog as
  select
    p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' || coalesce(b.thickness_mm::text, '') as line_key,
    p.name as product_name,
    p.category,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    sum(b.initial_units - b.units_sold)::integer as available
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  where exists (select 1 from public.settings s where s.catalog_public)
  group by p.id, b.length_ft, b.breadth_ft, b.thickness_mm, p.name, p.category
  having sum(b.initial_units - b.units_sold) > 0;

revoke all on public.v_public_catalog from public;
grant select on public.v_public_catalog to anon, authenticated;

create or replace function public.fast_moving(p_days integer default 90, p_limit integer default 5)
returns table (label text, units integer)
language sql
stable
set search_path = ''
as $$
  select
    case
      when b.length_ft is null then p.name
      else trim(trailing '.' from trim(trailing '0' from b.length_ft::text)) || ' × ' ||
           trim(trailing '.' from trim(trailing '0' from b.breadth_ft::text)) || ' ft'
    end as label,
    sum(s.quantity)::integer as units
  from public.sales s
  join public.batches b on b.id = s.batch_id
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  where s.sale_date > private.ist_today() - p_days
  group by 1
  order by units desc, label
  limit p_limit;
$$;

alter table public.variants
  drop constraint variants_product_id_fkey,
  add constraint variants_product_id_fkey foreign key (product_id) references public.products (id) on delete cascade;
