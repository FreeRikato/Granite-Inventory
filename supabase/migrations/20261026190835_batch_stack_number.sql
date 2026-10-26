alter table public.batches
  add column stack_number text,
  add constraint batches_stack_number_shape check (
    stack_number is null or (stack_number = trim(stack_number) and length(stack_number) between 1 and 20)
  );

create or replace function private.normalize_stack_number(p_stack_number text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_stack_number text := nullif(trim(p_stack_number), '');
begin
  if v_stack_number is not null and length(v_stack_number) > 20 then
    raise exception 'Batch number must be 20 characters or fewer' using errcode = 'check_violation';
  end if;
  return v_stack_number;
end;
$$;

drop function public.create_batch(uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text);

create function public.create_batch(
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

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

  insert into public.batches (
    batch_code, variant_id, supplier_id, purchase_date,
    length_ft, breadth_ft, thickness_mm, slot, stack_number,
    initial_units, unit_purchase_price, freight_cost, notes
  ) values (
    private.next_batch_code(p_product_id, p_purchase_date),
    v_variant_id, p_supplier_id, p_purchase_date,
    p_length_ft, p_breadth_ft, p_thickness_mm,
    coalesce(p_slot, public.suggest_slot(v_category, p_length_ft)), v_stack_number,
    p_initial_units, p_unit_purchase_price, coalesce(p_freight_cost, 0), nullif(trim(p_notes), '')
  )
  returning * into v_batch;

  return v_batch;
end;
$$;

revoke execute on function public.create_batch(uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_batch(uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text, text) to authenticated, service_role;

drop function public.correct_batch(uuid, uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text);

create function public.correct_batch(
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

  v_variant_id := private.find_or_create_variant(p_product_id, p_variant_name);

  update public.batches set
    variant_id = v_variant_id,
    supplier_id = p_supplier_id,
    purchase_date = p_purchase_date,
    length_ft = p_length_ft,
    breadth_ft = p_breadth_ft,
    thickness_mm = p_thickness_mm,
    slot = coalesce(p_slot, public.suggest_slot(v_category, p_length_ft)),
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

revoke execute on function public.correct_batch(uuid, uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text, text) from public, anon;
grant execute on function public.correct_batch(uuid, uuid, text, uuid, date, numeric, numeric, integer, text, integer, numeric, numeric, text, text) to authenticated, service_role;

drop view public.v_yard_batches;

create or replace view public.v_batches with (security_invoker = true) as
  select
    b.id, b.batch_code, b.purchase_date, b.slot,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    b.initial_units, b.units_sold, b.initial_units - b.units_sold as available,
    p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' || coalesce(b.thickness_mm::text, '') as line_key,
    b.unit_purchase_price, b.freight_cost, b.landed_cost, b.notes,
    b.created_at, b.created_by, b.updated_at, b.updated_by,
    v.id as variant_id, v.name as variant_name,
    p.id as product_id, p.name as product_name, p.abbreviation as product_abbreviation, p.category,
    s.id as supplier_id, s.name as supplier_name,
    b.stack_number
  from public.batches b
  join public.variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  join public.suppliers s on s.id = b.supplier_id;

create view public.v_yard_batches with (security_invoker = true) as
  with base as (
    select
      b.*,
      (private.ist_today() - b.purchase_date)::integer as age_days,
      lag(b.purchase_date) over (
        partition by b.product_id, b.length_ft, b.breadth_ft, b.thickness_mm
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

create view public.v_recent_stacks with (security_invoker = true) as
  select
    b.slot,
    b.stack_number,
    max(b.created_at) as last_used_at
  from public.batches b
  where b.stack_number is not null
  group by b.slot, b.stack_number;
