create or replace function public.margin_by_period(p_grain text)
returns table (period_start date, revenue numeric, margin numeric, margin_pct numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_step interval;
  v_current date;
begin
  if p_grain = 'week' then
    v_step := interval '7 days';
    v_current := date_trunc('week', private.ist_today()::timestamp)::date;
  elsif p_grain = 'month' then
    v_step := interval '1 month';
    v_current := date_trunc('month', private.ist_today()::timestamp)::date;
  else
    raise exception 'Unknown grain %, expected week or month', p_grain using errcode = 'invalid_parameter_value';
  end if;

  return query
  with periods as (
    select (v_current - n * v_step)::date as starts
    from generate_series(0, 11) as n
  ),
  totals as (
    select
      date_trunc(p_grain, s.sale_date::timestamp)::date as starts,
      sum(s.quantity * (s.sale_price + s.stickering_price)) as rev,
      sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)) as mar
    from public.sales s
    where s.sale_date >= (v_current - 11 * v_step)::date
    group by 1
  )
  select
    periods.starts as period_start,
    coalesce(totals.rev, 0) as revenue,
    coalesce(totals.mar, 0) as margin,
    case when coalesce(totals.rev, 0) = 0 then null else round(totals.mar / totals.rev * 100, 2) end as margin_pct
  from periods
  left join totals on totals.starts = periods.starts
  order by periods.starts;
end;
$$;

revoke execute on function public.margin_by_period(text) from public, anon;
grant execute on function public.margin_by_period(text) to authenticated, service_role;
