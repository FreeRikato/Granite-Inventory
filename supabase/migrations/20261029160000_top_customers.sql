create or replace function public.top_customers(p_window text, p_limit integer default 5)
returns table (customer_id uuid, customer_name text, billed numeric, pieces integer, products jsonb)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from date;
begin
  if p_window = 'month' then
    v_from := date_trunc('month', private.ist_today()::timestamp)::date;
  elsif p_window = '90d' then
    v_from := private.ist_today() - 89;
  elsif p_window = 'all' then
    v_from := date '-infinity';
  else
    raise exception 'Unknown window %, expected month, 90d or all', p_window using errcode = 'invalid_parameter_value';
  end if;

  return query
  with per_product as (
    select
      s.customer_id,
      p.name as product_name,
      sum(s.quantity)::integer as qty,
      sum(s.quantity * (s.sale_price + s.stickering_price)) as amount
    from public.sales s
    join public.batches b on b.id = s.batch_id
    join public.variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
    where s.sale_date >= v_from
    group by s.customer_id, p.id, p.name
  ),
  per_customer as (
    select
      pp.customer_id,
      sum(pp.amount) as total_billed,
      sum(pp.qty)::integer as total_pieces,
      jsonb_agg(jsonb_build_object('name', pp.product_name, 'pieces', pp.qty) order by pp.qty desc, pp.product_name) as product_list
    from per_product pp
    group by pp.customer_id
  )
  select c.id, c.name, pc.total_billed, pc.total_pieces, pc.product_list
  from per_customer pc
  join public.customers c on c.id = pc.customer_id
  order by pc.total_billed desc, c.name
  limit p_limit;
end;
$$;

revoke execute on function public.top_customers(text, integer) from public, anon;
grant execute on function public.top_customers(text, integer) to authenticated, service_role;
