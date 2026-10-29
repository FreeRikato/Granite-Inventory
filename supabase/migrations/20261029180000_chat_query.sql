create role chat_reader nologin;
grant usage on schema private to chat_reader;
grant execute on function public.is_member() to chat_reader;

create view public.v_chat_batches with (security_barrier = true) as
with base as (
  select
    b.id, b.batch_code, b.purchase_date, b.slot, b.length_ft, b.breadth_ft, b.thickness_mm,
    b.initial_units, b.units_sold, b.initial_units - b.units_sold as available,
    p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' ||
      coalesce(b.thickness_mm::text, '') as line_key,
    b.unit_purchase_price, b.freight_cost, b.landed_cost,
    b.initial_units * b.landed_cost as total_cost,
    b.created_at, b.updated_at,
    v.id as variant_id, v.name as variant_name,
    p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
    s.id as supplier_id, s.name as supplier_name,
    b.stack_number, b.archived_at,
    private.ist_today() - b.purchase_date as age_days,
    lag(b.purchase_date) over (
      partition by p.id, b.length_ft, b.breadth_ft, b.thickness_mm
      order by b.purchase_date, b.created_at, b.batch_code
    ) as previous_purchase_date
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  join public.suppliers s on s.id = b.supplier_id
)
select
  base.id, base.batch_code, base.purchase_date, base.slot, base.length_ft, base.breadth_ft, base.thickness_mm,
  base.initial_units, base.units_sold, base.available, base.line_key,
  base.unit_purchase_price, base.freight_cost, base.landed_cost, base.total_cost,
  base.created_at, base.updated_at,
  base.variant_id, base.variant_name, base.product_id, base.product_name, base.product_abbreviation, base.category,
  base.supplier_id, base.supplier_name, base.stack_number, base.age_days, base.previous_purchase_date,
  case
    when base.age_days >= st.stale_after_days then 'STALE'
    when base.age_days >= st.ageing_after_days then 'AGEING'
    else 'FRESH'
  end as ageing_band,
  base.available = 0 as sold_out,
  base.purchase_date - base.previous_purchase_date as days_since_previous,
  base.archived_at
from base
left join public.settings st on true
where (select public.is_member());

create view public.v_chat_stock_lines with (security_barrier = true) as
select
  line_key, product_id, product_name, product_abbreviation, category,
  length_ft, breadth_ft, thickness_mm,
  sum(available)::integer as available,
  count(*)::integer as batch_count,
  count(*) filter (where available > 0)::integer as batches_with_stock,
  min(purchase_date) as oldest_purchase_date
from public.v_chat_batches
where archived_at is null
group by line_key, length_ft, breadth_ft, thickness_mm, product_id, product_name, product_abbreviation, category;

create view public.v_chat_sales with (security_barrier = true) as
select
  s.id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
  s.has_stickering, s.stickering_cost, s.stickering_price, s.misc_expense, s.payment_mode,
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

create view public.v_chat_customers with (security_barrier = true) as
select 'C-' || left(id::text, 6) as customer_alias, customer_type, is_walk_in
from public.customers
where (select public.is_member());

create view public.v_chat_kpis with (security_barrier = true) as
with bounds as (
  select
    date_trunc('month', private.ist_today()::timestamptz)::date as month_start,
    (date_trunc('month', private.ist_today()::timestamptz) - interval '1 day')::date as last_month_end
), stock as (
  select
    coalesce(sum(initial_units - units_sold) filter (where archived_at is null), 0)::integer as active_stock,
    coalesce(sum((initial_units - units_sold)::numeric * landed_cost) filter (where archived_at is null), 0)
      as inventory_value,
    coalesce(sum(units_sold), 0)::integer as units_sold_total
  from public.batches
), past as (
  select
    coalesce((
      select sum(b.initial_units) from public.batches b, bounds
      where b.purchase_date <= bounds.last_month_end and b.archived_at is null
    ), 0) - coalesce((
      select sum(s.quantity) from public.sales s join public.batches b on b.id = s.batch_id, bounds
      where s.sale_date <= bounds.last_month_end and b.archived_at is null
    ), 0) as active_stock_last_month_end
), month as (
  select
    coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0) as mtd_revenue,
    coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0)
      as mtd_margin,
    count(*)::integer as mtd_sales
  from public.sales s, bounds
  where s.sale_date >= bounds.month_start
)
select
  stock.active_stock,
  stock.inventory_value,
  stock.units_sold_total,
  past.active_stock_last_month_end::integer as active_stock_last_month_end,
  month.mtd_revenue,
  month.mtd_margin,
  case when month.mtd_revenue = 0 then null else round(month.mtd_margin / month.mtd_revenue * 100, 2) end
    as mtd_margin_pct,
  month.mtd_sales,
  bounds.month_start
from stock, past, month, bounds
where (select public.is_member());

create view public.v_chat_products with (security_barrier = true) as
select id as product_id, name as product_name, abbreviation as product_abbreviation, category
from public.products
where (select public.is_member());

create view public.v_chat_suppliers with (security_barrier = true) as
select id as supplier_id, name as supplier_name, location
from public.suppliers
where (select public.is_member());

revoke all on
  public.v_chat_batches, public.v_chat_stock_lines, public.v_chat_sales, public.v_chat_customers,
  public.v_chat_kpis, public.v_chat_products, public.v_chat_suppliers
from public, anon, authenticated, service_role;

grant select on
  public.v_chat_batches, public.v_chat_stock_lines, public.v_chat_sales, public.v_chat_customers,
  public.v_chat_kpis, public.v_chat_products, public.v_chat_suppliers
to chat_reader;

create function public.chat_query(q text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not (select public.is_member()) then
    raise exception 'Chat is for team members' using errcode = '42501';
  end if;
  set local transaction_read_only = on;
  begin
    perform set_config('request.headers', '{}', true);
    perform set_config('request.cookies', '{}', true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('email', current_setting('request.jwt.claims', true)::jsonb ->> 'email')::text,
      true
    );
    execute format(
      'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) s limit 500) t',
      q
    ) into result;
    raise exception 'chat_query done' using errcode = 'CQ001';
  exception
    when sqlstate 'CQ001' then
      null;
    when query_canceled then
      perform pg_advisory_unlock_all();
      raise;
    when others then
      perform pg_advisory_unlock_all();
      raise;
  end;
  perform pg_advisory_unlock_all();
  return result;
end;
$$;

grant chat_reader to postgres with set true;
grant create on schema public to chat_reader;
alter function public.chat_query(text) owner to chat_reader;
revoke create on schema public from chat_reader;
revoke set option for chat_reader from postgres;

revoke execute on function public.chat_query(text) from public, anon, service_role;
grant execute on function public.chat_query(text) to authenticated;
