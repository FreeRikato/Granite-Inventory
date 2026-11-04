create function public.daily_summary(p_date date)
returns table (
  billed numeric,
  margin numeric,
  margin_pct numeric,
  cash numeric,
  upi numeric,
  bank_transfer numeric,
  received numeric,
  added_to_credit numeric
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
      coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0) as margin_sum
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
  )
  select
    sold.billed_sum,
    sold.margin_sum,
    case when sold.billed_sum = 0 then null else round(sold.margin_sum / sold.billed_sum * 100, 2) end,
    money.cash_sum,
    money.upi_sum,
    money.bank_sum,
    money.cash_sum + money.upi_sum + money.bank_sum,
    credit.added_sum
  from sold, money, credit;
end;
$$;

revoke execute on function public.daily_summary(date) from public, anon;
grant execute on function public.daily_summary(date) to authenticated, service_role;
