-- Ticket T04: readable API validation, bounded dates and explicit access errors.

-- A two-digit year in a Batch Code is unambiguous for the supported history once
-- dates before 2000 are refused. The upper bound remains the IST business date.
alter table public.batches drop constraint if exists batches_purchase_date_check;
alter table public.batches
  add constraint batches_purchase_date_range check (
    purchase_date >= date '2000-01-01' and purchase_date <= private.ist_today()
  );

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

create or replace function private.validate_customer_input()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is null or length(trim(new.name)) = 0 then
    raise exception 'Customer name is required' using errcode = 'check_violation';
  end if;
  if new.phone is not null and new.phone !~ '^\+?[0-9 ]{6,20}$' then
    raise exception 'Customer phone must contain 6 to 20 digits' using errcode = 'check_violation';
  end if;
  if new.customer_type is null or new.customer_type not in ('REGULAR', 'CONTRACTOR', 'ENGINEER', 'TRUST', 'RETAIL') then
    raise exception 'Customer type must be Regular, Contractor, Engineer, Trust or Retail'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger customers_validate_input
  before insert or update on public.customers
  for each row execute function private.validate_customer_input();

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

  if p_sale_date is null then
    raise exception 'Sale date is required' using errcode = 'check_violation';
  end if;
  if p_sale_date > private.ist_today() then
    raise exception 'Sale date cannot be in the future' using errcode = 'check_violation';
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
  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
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
