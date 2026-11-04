drop function public.daily_summary(date);

create function public.daily_summary(p_date date)
returns table (
  billed numeric,
  margin numeric,
  margin_pct numeric,
  cash numeric,
  upi numeric,
  bank_transfer numeric,
  received numeric,
  added_to_credit numeric,
  sqft numeric,
  customer_sqft jsonb
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date is null then
    raise exception 'Pick a date' using errcode = 'invalid_parameter_value';
  end if;
  if p_date > private.ist_today() then
    raise exception 'The date cannot be in the future' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with sold as (
    select
      coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0) as billed_sum,
      coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0) as margin_sum,
      coalesce(sum(s.quantity * s.area_sqft), 0) as sqft_sum
    from public.sales s
    where s.sale_date = p_date
  ),
  money as (
    select
      coalesce(sum(p.amount) filter (where p.payment_mode = 'CASH'), 0) as cash_sum,
      coalesce(sum(p.amount) filter (where p.payment_mode = 'UPI'), 0) as upi_sum,
      coalesce(sum(p.amount) filter (where p.payment_mode = 'BANK_TRANSFER'), 0) as bank_sum
    from public.v_payments p
    where p.received_on = p_date
  ),
  credit_bills as (
    select
      (select sum(s.quantity * (s.sale_price + s.stickering_price)) from public.sales s where s.bill_id = b.id) as total,
      (select coalesce(sum(bp.amount), 0) from public.bill_payments bp where bp.bill_id = b.id) as paid_at_sale
    from public.bills b
    where b.on_credit and b.sale_date = p_date
  ),
  credit as (
    select coalesce(sum(c.total - c.paid_at_sale), 0) as added_sum from credit_bills c
  ),
  buyers as (
    select c.id, c.name, sum(s.quantity * s.area_sqft) as sqft
    from public.sales s
    join public.customers c on c.id = s.customer_id
    where s.sale_date = p_date
    group by c.id, c.name
  ),
  buyer_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('customer_id', b.id, 'customer_name', b.name, 'sqft', b.sqft)
        order by b.sqft desc nulls last, b.name
      ),
      '[]'::jsonb
    ) as rows
    from buyers b
  )
  select
    sold.billed_sum,
    sold.margin_sum,
    case when sold.billed_sum = 0 then null else round(sold.margin_sum / sold.billed_sum * 100, 2) end,
    money.cash_sum,
    money.upi_sum,
    money.bank_sum,
    money.cash_sum + money.upi_sum + money.bank_sum,
    credit.added_sum,
    sold.sqft_sum,
    buyer_list.rows
  from sold, money, credit, buyer_list;
end;
$$;

revoke execute on function public.daily_summary(date) from public, anon;
grant execute on function public.daily_summary(date) to authenticated, service_role;

create or replace view public.v_dashboard_kpis with (security_invoker = true) as
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
    count(*)::integer as mtd_sales,
    coalesce(sum(s.quantity * s.area_sqft), 0) as mtd_sqft
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
  bounds.month_start,
  month.mtd_sqft
from stock, past, month, bounds;

create or replace view public.v_chat_kpis with (security_barrier = true) as
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
    count(*)::integer as mtd_sales,
    coalesce(sum(s.quantity * s.area_sqft), 0) as mtd_sqft
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
  bounds.month_start,
  month.mtd_sqft
from stock, past, month, bounds
where (select public.is_member());
