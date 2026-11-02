create function public.received_by_period(p_range text, p_from date default null, p_to date default null)
returns table (period_start date, cash numeric, upi numeric, bank_transfer numeric, total numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.ist_today();
  v_grain text;
  v_step interval;
  v_first date;
  v_last date;
begin
  if p_range = 'week' or p_range = 'month' then
    v_grain := p_range;
    v_step := case when p_range = 'week' then interval '7 days' else interval '1 month' end;
    v_last := date_trunc(p_range, v_today::timestamp)::date;
    v_first := (v_last - 11 * v_step)::date;
  elsif p_range = 'custom' then
    if p_from is null or p_to is null then
      raise exception 'Pick a start and end date' using errcode = 'invalid_parameter_value';
    end if;
    if p_to > v_today then
      raise exception 'The end date cannot be in the future' using errcode = 'invalid_parameter_value';
    end if;
    if p_from > p_to then
      raise exception 'The start date must be on or before the end date' using errcode = 'invalid_parameter_value';
    end if;
    v_grain := 'day';
    v_step := interval '1 day';
    v_first := p_from;
    v_last := p_to;
  else
    raise exception 'Unknown range %, expected week, month or custom', p_range using errcode = 'invalid_parameter_value';
  end if;

  return query
  with periods as (
    select g::date as starts
    from generate_series(v_first::timestamp, v_last::timestamp, v_step) as g
  ),
  totals as (
    select
      date_trunc(v_grain, p.sale_date::timestamp)::date as starts,
      sum(p.amount) filter (where p.payment_mode = 'CASH') as cash_sum,
      sum(p.amount) filter (where p.payment_mode = 'UPI') as upi_sum,
      sum(p.amount) filter (where p.payment_mode = 'BANK_TRANSFER') as bank_sum
    from public.v_payments p
    where p.sale_date >= v_first and p.sale_date < (v_last + v_step)::date
    group by 1
  )
  select
    periods.starts,
    coalesce(totals.cash_sum, 0),
    coalesce(totals.upi_sum, 0),
    coalesce(totals.bank_sum, 0),
    coalesce(totals.cash_sum, 0) + coalesce(totals.upi_sum, 0) + coalesce(totals.bank_sum, 0)
  from periods
  left join totals on totals.starts = periods.starts
  order by periods.starts;
end;
$$;

revoke execute on function public.received_by_period(text, date, date) from public, anon;
grant execute on function public.received_by_period(text, date, date) to authenticated, service_role;
