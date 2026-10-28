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
  b.initial_units * b.unit_purchase_price + b.freight_cost as total_cost
from public.batches b
join public.variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.suppliers s on s.id = b.supplier_id;
