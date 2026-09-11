-- Ticket 06: dashboard figures, every one derived from batches and sales.
-- "This month" is the calendar month in India (private.ist_today()).

create view public.v_dashboard_kpis with (security_invoker = true) as
  with bounds as (
    select
      date_trunc('month', private.ist_today())::date as month_start,
      (date_trunc('month', private.ist_today()) - interval '1 day')::date as last_month_end
  ),
  stock as (
    select
      coalesce(sum(initial_units - units_sold), 0)::integer as active_stock,
      coalesce(sum((initial_units - units_sold) * landed_cost), 0) as inventory_value,
      coalesce(sum(units_sold), 0)::integer as units_sold_total
    from public.batches
  ),
  past as (
    select
      coalesce((select sum(b.initial_units) from public.batches b, bounds where b.purchase_date <= bounds.last_month_end), 0)
      - coalesce((select sum(s.quantity) from public.sales s, bounds where s.sale_date <= bounds.last_month_end), 0)
      as active_stock_last_month_end
  ),
  month as (
    select
      coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0) as mtd_revenue,
      coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0) as mtd_margin,
      count(*)::integer as mtd_sales
    from public.sales s, bounds
    where s.sale_date >= bounds.month_start
  )
  select
    stock.active_stock,
    stock.inventory_value,
    stock.units_sold_total,
    past.active_stock_last_month_end::integer,
    month.mtd_revenue,
    month.mtd_margin,
    case when month.mtd_revenue = 0 then null else round(month.mtd_margin / month.mtd_revenue * 100, 2) end as mtd_margin_pct,
    month.mtd_sales,
    bounds.month_start
  from stock, past, month, bounds;

-- Units sold in the last N days per length x breadth (thickness ignored); Memorial as one
-- row per Variant since it has no size.
create or replace function public.fast_moving(p_days integer default 90, p_limit integer default 5)
returns table (label text, units integer)
language sql
stable
set search_path = ''
as $$
  select
    case
      when b.length_ft is null then v.name
      else trim(trailing '.' from trim(trailing '0' from b.length_ft::text)) || ' × ' ||
           trim(trailing '.' from trim(trailing '0' from b.breadth_ft::text)) || ' ft'
    end as label,
    sum(s.quantity)::integer as units
  from public.sales s
  join public.batches b on b.id = s.batch_id
  join public.variants v on v.id = b.variant_id
  where s.sale_date > private.ist_today() - p_days
  group by 1
  order by units desc, label
  limit p_limit;
$$;

revoke execute on function public.fast_moving(integer, integer) from public, anon;
grant execute on function public.fast_moving(integer, integer) to authenticated, service_role;
