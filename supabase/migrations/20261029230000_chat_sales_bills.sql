drop view public.v_chat_sales;

create view public.v_chat_sales with (security_barrier = true) as
select
  s.id, s.bill_id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
  s.has_stickering, s.stickering_cost, s.stickering_price, s.payment_mode,
  s.created_at, s.updated_at,
  s.quantity * s.sale_price as stone_total,
  s.quantity * s.stickering_price as stickering_total,
  s.quantity * (s.sale_price + s.stickering_price) as revenue,
  s.quantity * (s.sale_price - s.landed_cost) as stone_margin,
  s.quantity * (s.stickering_price - s.stickering_cost) as stickering_margin,
  s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost) as margin,
  case
    when s.quantity * (s.sale_price + s.stickering_price) = 0 then null
    else round(
      (s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost))
      / (s.quantity * (s.sale_price + s.stickering_price)) * 100, 2)
  end as margin_pct,
  b.id as batch_id, b.batch_code, b.purchase_date, b.length_ft, b.breadth_ft, b.thickness_mm, b.slot,
  b.variant_id, b.variant_name, b.product_id, b.product_name, b.product_abbreviation, b.category,
  c.id as customer_id, 'C-' || left(c.id::text, 6) as customer_alias, c.customer_type
from public.sales s
join public.v_chat_batches b on b.id = s.batch_id
join public.customers c on c.id = s.customer_id
where (select public.is_member());

revoke all on public.v_chat_sales from public, anon, authenticated, service_role;
grant select on public.v_chat_sales to chat_reader;
