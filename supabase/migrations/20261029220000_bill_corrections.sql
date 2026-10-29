create or replace function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
begin
  perform private.require_admin();
  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Unknown sale' using errcode = 'foreign_key_violation';
  end if;
  perform 1 from public.batches where id = v_sale.batch_id for update;
  if v_sale.bill_id is not null then
    perform 1 from public.bills where id = v_sale.bill_id for update;
  end if;
  update public.batches set units_sold = units_sold - v_sale.quantity where id = v_sale.batch_id;
  delete from public.sales where id = p_sale_id;
  if v_sale.bill_id is not null
    and not exists (select 1 from public.sales where bill_id = v_sale.bill_id) then
    delete from public.bills where id = v_sale.bill_id;
  end if;
end;
$$;

create or replace function public.correct_sale(
  p_sale_id uuid,
  p_batch_id uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_quantity integer,
  p_sale_price numeric,
  p_payment_mode text,
  p_has_stickering boolean default false,
  p_stickering_cost numeric default 0,
  p_stickering_price numeric default 0,
  p_notes text default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_old public.batches;
  v_new public.batches;
begin
  perform private.require_admin();

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Unknown sale' using errcode = 'foreign_key_violation';
  end if;
  if v_sale.bill_id is not null
    and (p_customer_id is distinct from v_sale.customer_id
      or p_sale_date is distinct from v_sale.sale_date
      or p_payment_mode is distinct from v_sale.payment_mode) then
    raise exception 'Customer, sale date and payment mode come from the bill and cannot be changed on one of its sales'
      using errcode = 'check_violation';
  end if;

  perform 1 from public.batches where id in (v_sale.batch_id, p_batch_id) order by id for update;
  select * into v_old from public.batches where id = v_sale.batch_id;
  select * into v_new from public.batches where id = p_batch_id;
  if v_new.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  if p_batch_id <> v_sale.batch_id and v_new.archived_at is not null then
    raise exception 'Batch % is archived; unarchive it to sell from it', v_new.batch_code
      using errcode = 'check_violation';
  end if;

  perform private.validate_sale_input(
    p_sale_date,
    p_quantity,
    p_sale_price,
    p_payment_mode,
    p_has_stickering,
    p_stickering_cost,
    p_stickering_price,
    v_new.purchase_date
  );

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  update public.batches set units_sold = units_sold - v_sale.quantity where id = v_old.id;
  select * into v_new from public.batches where id = p_batch_id;
  if p_quantity > v_new.initial_units - v_new.units_sold then
    raise exception 'Only % available in batch %', v_new.initial_units - v_new.units_sold, v_new.batch_code
      using errcode = 'check_violation';
  end if;
  update public.batches set units_sold = units_sold + p_quantity where id = p_batch_id;

  update public.sales set
    batch_id = p_batch_id,
    customer_id = p_customer_id,
    sale_date = p_sale_date,
    quantity = p_quantity,
    sale_price = p_sale_price,
    landed_cost = case when p_batch_id = v_sale.batch_id then v_sale.landed_cost else v_new.landed_cost end,
    has_stickering = coalesce(p_has_stickering, false),
    stickering_cost = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_cost, 0) else 0 end,
    stickering_price = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_price, 0) else 0 end,
    payment_mode = p_payment_mode,
    notes = nullif(trim(p_notes), '')
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;
