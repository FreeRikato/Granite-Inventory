-- Ticket T09: keep correction RPCs on the same readable validation path as new writes.
-- record_sale checks customer and batch existence before validating the other inputs, so an unknown
-- customer is reported ahead of a quantity or price error; correct_sale validates the inputs first and
-- checks the customer last.

create or replace function private.validate_batch_input(
  p_purchase_date date,
  p_variant_name text,
  p_initial_units integer,
  p_unit_purchase_price numeric,
  p_freight_cost numeric,
  p_length_ft numeric,
  p_breadth_ft numeric,
  p_thickness_mm integer,
  p_slot text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_purchase_date is null then
    raise exception 'Purchase date is required' using errcode = 'check_violation';
  end if;
  if p_purchase_date < date '2000-01-01' then
    raise exception 'Purchase date must be on or after 2000-01-01' using errcode = 'check_violation';
  end if;
  if p_purchase_date > private.ist_today() then
    raise exception 'Purchase date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_initial_units is null or p_initial_units <= 0 then
    raise exception 'Initial units must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_unit_purchase_price is null then
    raise exception 'Unit purchase price is required' using errcode = 'check_violation';
  end if;
  if p_unit_purchase_price < 0 then
    raise exception 'Unit purchase price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_freight_cost, 0) < 0 then
    raise exception 'Freight cost must be zero or more' using errcode = 'check_violation';
  end if;
  if p_variant_name is null or length(trim(p_variant_name)) = 0 then
    raise exception 'Variant name is required' using errcode = 'check_violation';
  end if;
  if p_length_ft is not null and p_length_ft <= 0 then
    raise exception 'Length must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_breadth_ft is not null and p_breadth_ft <= 0 then
    raise exception 'Breadth must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_thickness_mm is not null and p_thickness_mm <= 0 then
    raise exception 'Thickness must be greater than zero' using errcode = 'check_violation';
  end if;
  if (p_length_ft is null) <> (p_breadth_ft is null)
    or (p_length_ft is null) <> (p_thickness_mm is null) then
    raise exception 'Size must include length, breadth and thickness together'
      using errcode = 'check_violation';
  end if;
  if p_slot is not null and p_slot not in ('4FT', '5FT', 'DOOM', 'CUSTOM') then
    raise exception 'Slot must be 4FT, 5FT, DOOM or CUSTOM' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.validate_sale_input(
  p_sale_date date,
  p_quantity integer,
  p_sale_price numeric,
  p_payment_mode text,
  p_has_stickering boolean,
  p_stickering_cost numeric,
  p_stickering_price numeric,
  p_misc_expense numeric,
  p_batch_purchase_date date
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
  if p_sale_price < 0 then
    raise exception 'Sale price must be zero or more' using errcode = 'check_violation';
  end if;
  if p_payment_mode is null or p_payment_mode not in ('CASH', 'UPI', 'BANK_TRANSFER') then
    raise exception 'Payment mode must be Cash, UPI or Bank Transfer' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_cost, 0) < 0 then
    raise exception 'Stickering cost must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_stickering_price, 0) < 0 then
    raise exception 'Stickering price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_misc_expense, 0) < 0 then
    raise exception 'Misc expense must be zero or more' using errcode = 'check_violation';
  end if;
  if not coalesce(p_has_stickering, false)
    and (coalesce(p_stickering_cost, 0) <> 0 or coalesce(p_stickering_price, 0) <> 0) then
    raise exception 'Stickering cost and price must be zero when stickering is off'
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.create_batch(
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
set search_path = ''
as $$
declare
  v_variant_id uuid;
  v_category text;
  v_batch public.batches;
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  perform private.validate_batch_input(
    p_purchase_date,
    p_variant_name,
    p_initial_units,
    p_unit_purchase_price,
    p_freight_cost,
    p_length_ft,
    p_breadth_ft,
    p_thickness_mm,
    p_slot
  );

  select category into v_category from public.products where id = p_product_id;
  if v_category is null then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Unknown supplier' using errcode = 'foreign_key_violation';
  end if;

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

  insert into public.batches (
    batch_code, variant_id, supplier_id, purchase_date,
    length_ft, breadth_ft, thickness_mm, slot,
    initial_units, unit_purchase_price, freight_cost, notes
  ) values (
    private.next_batch_code(p_product_id, p_purchase_date),
    v_variant_id, p_supplier_id, p_purchase_date,
    p_length_ft, p_breadth_ft, p_thickness_mm,
    coalesce(p_slot, public.suggest_slot(v_category, p_length_ft)),
    p_initial_units, p_unit_purchase_price, coalesce(p_freight_cost, 0), nullif(trim(p_notes), '')
  )
  returning * into v_batch;

  return v_batch;
end;
$$;

create or replace function public.record_sale(
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

  perform private.validate_sale_input(
    p_sale_date,
    p_quantity,
    p_sale_price,
    p_payment_mode,
    p_has_stickering,
    p_stickering_cost,
    p_stickering_price,
    p_misc_expense,
    v_batch.purchase_date
  );

  if p_quantity > v_batch.initial_units - v_batch.units_sold then
    raise exception 'Only % available in batch %', v_batch.initial_units - v_batch.units_sold, v_batch.batch_code
      using errcode = 'check_violation';
  end if;

  insert into public.sales (
    sale_date, batch_id, customer_id, quantity, sale_price, landed_cost,
    has_stickering, stickering_cost, stickering_price, misc_expense, payment_mode, notes
  ) values (
    p_sale_date, p_batch_id, p_customer_id, p_quantity, p_sale_price, v_batch.landed_cost,
    coalesce(p_has_stickering, false),
    case when coalesce(p_has_stickering, false) then coalesce(p_stickering_cost, 0) else 0 end,
    case when coalesce(p_has_stickering, false) then coalesce(p_stickering_price, 0) else 0 end,
    coalesce(p_misc_expense, 0), p_payment_mode, nullif(trim(p_notes), '')
  )
  returning * into v_sale;

  update public.batches set units_sold = units_sold + p_quantity where id = p_batch_id;
  return v_sale;
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
  v_earliest_sale_date date;
begin
  perform private.require_admin();

  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;

  perform private.validate_batch_input(
    p_purchase_date,
    p_variant_name,
    p_initial_units,
    p_unit_purchase_price,
    p_freight_cost,
    p_length_ft,
    p_breadth_ft,
    p_thickness_mm,
    p_slot
  );

  select min(sale_date) into v_earliest_sale_date
  from public.sales
  where batch_id = p_batch_id;
  if v_earliest_sale_date is not null and p_purchase_date > v_earliest_sale_date then
    raise exception 'Purchase date cannot be after a sale on this batch (%)', v_earliest_sale_date
      using errcode = 'check_violation';
  end if;

  if p_initial_units < v_batch.units_sold then
    raise exception 'Batch % already has % sold; pieces bought cannot go below that', v_batch.batch_code, v_batch.units_sold
      using errcode = 'check_violation';
  end if;

  select category into v_category from public.products where id = p_product_id;
  if v_category is null then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Unknown supplier' using errcode = 'foreign_key_violation';
  end if;

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

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

  perform private.validate_sale_input(
    p_sale_date,
    p_quantity,
    p_sale_price,
    p_payment_mode,
    p_has_stickering,
    p_stickering_cost,
    p_stickering_price,
    p_misc_expense,
    v_new.purchase_date
  );

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
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

create or replace view public.v_yard_batches with (security_invoker = true) as
  with base as (
    select
      b.*,
      (private.ist_today() - b.purchase_date)::integer as age_days,
      lag(b.purchase_date) over (
        partition by b.variant_id, b.length_ft, b.breadth_ft, b.thickness_mm
        order by b.purchase_date, b.created_at, b.batch_code
      ) as previous_purchase_date
    from public.v_batches b
  )
  select
    base.*,
    public.ageing_band(base.age_days) as ageing_band,
    (base.available = 0) as sold_out,
    (base.purchase_date - base.previous_purchase_date)::integer as days_since_previous
  from base;
