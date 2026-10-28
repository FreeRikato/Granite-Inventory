alter table public.batches drop constraint batches_slot_check;
alter table public.batches add constraint batches_slot_shape
  check (slot = trim(slot) and length(slot) between 1 and 20);

alter table public.batches add column archived_at timestamptz;
alter table public.products add column archived_at timestamptz;
alter table public.suppliers add column archived_at timestamptz;

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
    raise exception 'Unit Quantity must be greater than zero' using errcode = 'check_violation';
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
  if p_slot is not null and length(trim(p_slot)) > 20 then
    raise exception 'Yard slot must be 20 characters or fewer' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.refuse_archived_lists(p_product_id uuid, p_supplier_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  select name into v_name from public.products where id = p_product_id and archived_at is not null;
  if v_name is not null then
    raise exception 'Product % is archived; unarchive it in Settings first', v_name using errcode = 'check_violation';
  end if;
  select name into v_name from public.suppliers where id = p_supplier_id and archived_at is not null;
  if v_name is not null then
    raise exception 'Supplier % is archived; unarchive it in Settings first', v_name using errcode = 'check_violation';
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
  p_notes text default null,
  p_stack_number text default null
)
returns public.batches
language plpgsql
set search_path = ''
as $$
declare
  v_variant_id uuid;
  v_category text;
  v_stack_number text;
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

  v_stack_number := private.normalize_stack_number(p_stack_number);
  if v_stack_number is null then
    raise exception 'Batch number is required' using errcode = 'check_violation';
  end if;

  select category into v_category from public.products where id = p_product_id;
  if v_category is null then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id) then
    raise exception 'Unknown supplier' using errcode = 'foreign_key_violation';
  end if;
  perform private.refuse_archived_lists(p_product_id, p_supplier_id);

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

  insert into public.batches (
    batch_code, variant_id, supplier_id, purchase_date,
    length_ft, breadth_ft, thickness_mm, slot, stack_number,
    initial_units, unit_purchase_price, freight_cost, notes
  ) values (
    private.next_batch_code(p_product_id, p_purchase_date),
    v_variant_id, p_supplier_id, p_purchase_date,
    p_length_ft, p_breadth_ft, p_thickness_mm,
    coalesce(nullif(trim(p_slot), ''), public.suggest_slot(v_category, p_length_ft)), v_stack_number,
    p_initial_units, p_unit_purchase_price, coalesce(p_freight_cost, 0), nullif(trim(p_notes), '')
  )
  returning * into v_batch;

  return v_batch;
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
  p_notes text default null,
  p_stack_number text default null
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
  v_stack_number text;
  v_earliest_sale_date date;
  v_current_product uuid;
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

  v_stack_number := private.normalize_stack_number(p_stack_number);

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
  select product_id into v_current_product from public.variants where id = v_batch.variant_id;
  perform private.refuse_archived_lists(
    nullif(p_product_id, v_current_product),
    nullif(p_supplier_id, v_batch.supplier_id)
  );

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

  update public.batches set
    variant_id = v_variant_id,
    supplier_id = p_supplier_id,
    purchase_date = p_purchase_date,
    length_ft = p_length_ft,
    breadth_ft = p_breadth_ft,
    thickness_mm = p_thickness_mm,
    slot = coalesce(nullif(trim(p_slot), ''), public.suggest_slot(v_category, p_length_ft)),
    stack_number = coalesce(v_stack_number, v_batch.stack_number),
    initial_units = p_initial_units,
    unit_purchase_price = p_unit_purchase_price,
    freight_cost = coalesce(p_freight_cost, 0),
    notes = nullif(trim(p_notes), '')
  where id = p_batch_id
  returning * into v_batch;

  return v_batch;
end;
$$;

create or replace function public.archive_batch(p_batch_id uuid, p_archived boolean default true)
returns public.batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.batches;
begin
  perform private.require_admin();
  update public.batches
  set archived_at = case when coalesce(p_archived, true) then coalesce(archived_at, now()) end
  where id = p_batch_id
  returning * into v_batch;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  return v_batch;
end;
$$;

revoke execute on function public.archive_batch(uuid, boolean) from public, anon;
grant execute on function public.archive_batch(uuid, boolean) to authenticated, service_role;

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
    p_misc_expense,
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
    misc_expense = coalesce(p_misc_expense, 0),
    payment_mode = p_payment_mode,
    notes = nullif(trim(p_notes), '')
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

create or replace view public.v_batches with (security_invoker = true) as
select
  b.id, b.batch_code, b.purchase_date, b.slot,
  b.length_ft, b.breadth_ft, b.thickness_mm,
  b.initial_units, b.units_sold,
  b.initial_units - b.units_sold as available,
  p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' ||
    coalesce(b.thickness_mm::text, '') as line_key,
  b.unit_purchase_price, b.freight_cost, b.landed_cost, b.notes,
  b.created_at, b.created_by, b.updated_at, b.updated_by,
  v.id as variant_id, v.name as variant_name,
  p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
  s.id as supplier_id, s.name as supplier_name,
  b.stack_number,
  b.archived_at
from public.batches b
join public.variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
join public.suppliers s on s.id = b.supplier_id;

create or replace view public.v_yard_batches with (security_invoker = true) as
with base as (
  select
    b.id, b.batch_code, b.purchase_date, b.slot, b.length_ft, b.breadth_ft, b.thickness_mm,
    b.initial_units, b.units_sold, b.available, b.line_key, b.unit_purchase_price, b.freight_cost,
    b.landed_cost, b.notes, b.created_at, b.created_by, b.updated_at, b.updated_by,
    b.variant_id, b.variant_name, b.product_id, b.product_name, b.product_abbreviation, b.category,
    b.supplier_id, b.supplier_name, b.stack_number,
    private.ist_today() - b.purchase_date as age_days,
    lag(b.purchase_date) over (
      partition by b.product_id, b.length_ft, b.breadth_ft, b.thickness_mm
      order by b.purchase_date, b.created_at, b.batch_code
    ) as previous_purchase_date,
    b.archived_at
  from public.v_batches b
)
select
  id, batch_code, purchase_date, slot, length_ft, breadth_ft, thickness_mm,
  initial_units, units_sold, available, line_key, unit_purchase_price, freight_cost,
  landed_cost, notes, created_at, created_by, updated_at, updated_by,
  variant_id, variant_name, product_id, product_name, product_abbreviation, category,
  supplier_id, supplier_name, stack_number, age_days, previous_purchase_date,
  public.ageing_band(age_days) as ageing_band,
  available = 0 as sold_out,
  purchase_date - previous_purchase_date as days_since_previous,
  archived_at
from base;

create or replace view public.v_stock_lines with (security_invoker = true) as
select
  line_key, product_id, product_name, product_abbreviation, category,
  length_ft, breadth_ft, thickness_mm,
  sum(available)::integer as available,
  count(*)::integer as batch_count,
  count(*) filter (where available > 0)::integer as batches_with_stock,
  min(purchase_date) as oldest_purchase_date
from public.v_batches b
where archived_at is null
group by line_key, length_ft, breadth_ft, thickness_mm, product_id, product_name, product_abbreviation, category;

create or replace view public.v_public_catalog as
select
  p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' ||
    coalesce(b.thickness_mm::text, '') as line_key,
  p.name as product_name,
  p.category,
  b.length_ft,
  b.breadth_ft,
  b.thickness_mm,
  sum(b.initial_units - b.units_sold)::integer as available
from public.batches b
join public.variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
where exists (select 1 from public.settings s where s.catalog_public)
  and b.archived_at is null
group by p.id, b.length_ft, b.breadth_ft, b.thickness_mm, p.name, p.category
having sum(b.initial_units - b.units_sold) > 0;

create or replace view public.v_dashboard_kpis with (security_invoker = true) as
with bounds as (
  select
    date_trunc('month', private.ist_today()::timestamptz)::date as month_start,
    (date_trunc('month', private.ist_today()::timestamptz) - interval '1 day')::date as last_month_end
), stock as (
  select
    coalesce(sum(initial_units - units_sold) filter (where archived_at is null), 0)::integer as active_stock,
    coalesce(sum((initial_units - units_sold)::numeric * landed_cost) filter (where archived_at is null), 0)
      as inventory_value,
    coalesce(sum(units_sold), 0)::integer as units_sold_total
  from public.batches
), past as (
  select
    coalesce((
      select sum(b.initial_units) from public.batches b, bounds
      where b.purchase_date <= bounds.last_month_end and b.archived_at is null
    ), 0) - coalesce((
      select sum(s.quantity) from public.sales s join public.batches b on b.id = s.batch_id, bounds
      where s.sale_date <= bounds.last_month_end and b.archived_at is null
    ), 0) as active_stock_last_month_end
), month as (
  select
    coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0) as mtd_revenue,
    coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0)
      as mtd_margin,
    count(*)::integer as mtd_sales
  from public.sales s, bounds
  where s.sale_date >= bounds.month_start
)
select
  stock.active_stock,
  stock.inventory_value,
  stock.units_sold_total,
  past.active_stock_last_month_end::integer as active_stock_last_month_end,
  month.mtd_revenue,
  month.mtd_margin,
  case when month.mtd_revenue = 0 then null else round(month.mtd_margin / month.mtd_revenue * 100, 2) end
    as mtd_margin_pct,
  month.mtd_sales,
  bounds.month_start
from stock, past, month, bounds;
