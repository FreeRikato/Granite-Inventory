drop view public.v_sales;

create view public.v_sales with (security_invoker = true) as
  select
    s.id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
    s.has_stickering, s.stickering_cost, s.stickering_price,
    s.payment_mode, s.notes, s.created_at, s.created_by, s.updated_at, s.updated_by,
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
    c.id as customer_id, c.name as customer_name, c.phone as customer_phone, c.customer_type
  from public.sales s
  join public.v_batches b on b.id = s.batch_id
  join public.customers c on c.id = s.customer_id;

drop function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text);
drop function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text);
drop function private.validate_sale_input(date, integer, numeric, text, boolean, numeric, numeric, numeric, date);

create function private.validate_bill_header(
  p_sale_date date,
  p_payment_mode text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_sale_date is null then
    raise exception 'Sale date is required' using errcode = 'check_violation';
  end if;
  if p_sale_date > private.ist_today() then
    raise exception 'Sale date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('CASH', 'UPI', 'BANK_TRANSFER') then
    raise exception 'Payment mode must be Cash, UPI or Bank Transfer' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.validate_sale_input(
  p_sale_date date,
  p_quantity integer,
  p_sale_price numeric,
  p_payment_mode text,
  p_has_stickering boolean,
  p_stickering_cost numeric,
  p_stickering_price numeric,
  p_batch_purchase_date date
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.validate_bill_header(p_sale_date, p_payment_mode);
  if p_batch_purchase_date is not null and p_sale_date < p_batch_purchase_date then
    raise exception 'Sale date cannot be before the batch was bought (%)', p_batch_purchase_date
      using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Sale quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_sale_price is null then
    raise exception 'Sale price is required' using errcode = 'check_violation';
  end if;
  if p_sale_price in ('NaN'::numeric, 'Infinity'::numeric) then
    raise exception 'Sale price must be a number' using errcode = 'check_violation';
  end if;
  if p_sale_price < 0 then
    raise exception 'Sale price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_cost, 0) in ('NaN'::numeric, 'Infinity'::numeric) then
    raise exception 'Stickering cost must be a number' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_price, 0) in ('NaN'::numeric, 'Infinity'::numeric) then
    raise exception 'Stickering price must be a number' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_cost, 0) < 0 then
    raise exception 'Stickering cost must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_price, 0) < 0 then
    raise exception 'Stickering price must be zero or more' using errcode = 'check_violation';
  end if;
  if not coalesce(p_has_stickering, false)
    and (coalesce(p_stickering_cost, 0) <> 0 or coalesce(p_stickering_price, 0) <> 0) then
    raise exception 'Stickering cost and price must be zero when stickering is off'
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.record_sale(
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
  v_batch public.batches;
  v_sale public.sales;
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  if v_batch.archived_at is not null then
    raise exception 'Batch % is archived; unarchive it to sell from it', v_batch.batch_code
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
    v_batch.purchase_date
  );

  if p_quantity > v_batch.initial_units - v_batch.units_sold then
    raise exception 'Only % available in batch %', v_batch.initial_units - v_batch.units_sold, v_batch.batch_code
      using errcode = 'check_violation';
  end if;

  insert into public.sales (
    sale_date, batch_id, customer_id, quantity, sale_price, landed_cost,
    has_stickering, stickering_cost, stickering_price, payment_mode, notes
  ) values (
    p_sale_date, p_batch_id, p_customer_id, p_quantity, p_sale_price, v_batch.landed_cost,
    coalesce(p_has_stickering, false),
    case when coalesce(p_has_stickering, false) then coalesce(p_stickering_cost, 0) else 0 end,
    case when coalesce(p_has_stickering, false) then coalesce(p_stickering_price, 0) else 0 end,
    p_payment_mode, nullif(trim(p_notes), '')
  )
  returning * into v_sale;

  update public.batches set units_sold = units_sold + p_quantity where id = p_batch_id;
  return v_sale;
end;
$$;

create function public.correct_sale(
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

revoke execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) to authenticated, service_role;
revoke execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) to authenticated, service_role;
