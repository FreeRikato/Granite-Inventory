-- Ticket 07: the Public Catalog. A view owned by postgres (no security_invoker) reading the
-- base tables directly, so anon can read it without RLS on the underlying tables; it exposes
-- only public columns and nothing at all while the catalog is switched off.

create view public.v_public_catalog as
  select
    b.variant_id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' || coalesce(b.thickness_mm::text, '') as line_key,
    p.name as product_name,
    v.name as variant_name,
    p.category,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    sum(b.initial_units - b.units_sold)::integer as available
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  where exists (select 1 from public.settings s where s.catalog_public)
  group by b.variant_id, b.length_ft, b.breadth_ft, b.thickness_mm, p.name, v.name, p.category
  having sum(b.initial_units - b.units_sold) > 0;

revoke all on public.v_public_catalog from public;
grant select on public.v_public_catalog to anon, authenticated;
