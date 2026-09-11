-- Ticket 08: Corrections. Admin-only edits and deletes of Batches and Sales that keep
-- Available consistent. Security definer so the batch counters can move; the first line of
-- each function is the Admin check.

create or replace function private.require_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an Admin can make corrections' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.correct_batch(
  p_batch_id uuid,
  p_product_id uuid,
  p_variant_name text,
  p_supplier_id uuid,
  p_purchase_date date,
  p_length_ft numeric default null,
  p_breadth_ft numeric default null,
  p_thickness_mm integer default null,
  p_slot text default null,
  p_initial_units integer default null,
  p_unit_purchase_price numeric default null,
  p_freight_cost numeric default 0,
  p_notes text default null
)
returns public.batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.batches;
  v_variant_id uuid;
  v_category text;
begin
  perform private.require_admin();

  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  if p_initial_units < v_batch.units_sold then
    raise exception 'Batch % already has % sold; pieces bought cannot go below that', v_batch.batch_code, v_batch.units_sold
      using errcode = 'check_violation';
  end if;

  select category into v_category from public.products where id = p_product_id;
  if v_category is null then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;

  insert into public.variants (product_id, name)
  values (p_product_id, trim(p_variant_name))
  on conflict (product_id, lower(name)) do nothing;
  select id into v_variant_id
  from public.variants
  where product_id = p_product_id and lower(name) = lower(trim(p_variant_name));

  -- The Batch Code is kept: it is written on the physical stack.
  update public.batches set
    variant_id = v_variant_id,
    supplier_id = p_supplier_id,
    purchase_date = p_purchase_date,
    length_ft = p_length_ft,
    breadth_ft = p_breadth_ft,
    thickness_mm = p_thickness_mm,
    slot = coalesce(p_slot, public.suggest_slot(v_category, p_length_ft)),
    initial_units = p_initial_units,
    unit_purchase_price = p_unit_purchase_price,
    freight_cost = coalesce(p_freight_cost, 0),
    notes = nullif(trim(p_notes), '')
  where id = p_batch_id
  returning * into v_batch;

  return v_batch;
end;
$$;

create or replace function public.delete_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_sales integer;
begin
  perform private.require_admin();
  select batch_code into v_code from public.batches where id = p_batch_id for update;
  if v_code is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  select count(*) into v_sales from public.sales where batch_id = p_batch_id;
  if v_sales > 0 then
    raise exception 'Batch % has % sale(s); correct or delete those first', v_code, v_sales
      using errcode = 'check_violation';
  end if;
  delete from public.batches where id = p_batch_id;
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
  p_misc_expense numeric default 0,
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

  -- Lock both batches in a fixed order so two corrections cannot deadlock.
  perform 1 from public.batches where id in (v_sale.batch_id, p_batch_id) order by id for update;
  select * into v_old from public.batches where id = v_sale.batch_id;
  select * into v_new from public.batches where id = p_batch_id;
  if v_new.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;

  -- Give the old pieces back, then take the new quantity from the (possibly same) batch.
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
    -- The snapshot moves only when the sale moves to another batch.
    landed_cost = case when p_batch_id = v_sale.batch_id then v_sale.landed_cost else v_new.landed_cost end,
    has_stickering = coalesce(p_has_stickering, false),
    stickering_cost = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_cost, 0) else 0 end,
    stickering_price = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_price, 0) else 0 end,
    misc_expense = coalesce(p_misc_expense, 0),
    payment_mode = p_payment_mode,
    notes = nullif(trim(p_notes), '')
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

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
  update public.batches set units_sold = units_sold - v_sale.quantity where id = v_sale.batch_id;
  delete from public.sales where id = p_sale_id;
end;
$$;

revoke execute on function public.correct_batch(uuid, uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text) from public, anon;
revoke execute on function public.delete_batch(uuid) from public, anon;
revoke execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.delete_sale(uuid) from public, anon;
grant execute on function public.correct_batch(uuid, uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.delete_batch(uuid) to authenticated, service_role;
grant execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.delete_sale(uuid) to authenticated, service_role;
