create table public.bills (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  sale_date date not null check (sale_date <= private.ist_today()),
  payment_mode text not null check (payment_mode in ('CASH', 'UPI', 'BANK_TRANSFER')),
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index bills_customer_idx on public.bills (customer_id);

create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function private.set_updated_at();

alter table public.bills enable row level security;
create policy bills_select on public.bills for select to authenticated using ((select public.is_member()));

alter table public.sales add column bill_id uuid references public.bills (id) on delete restrict;
create index sales_bill_idx on public.sales (bill_id);

drop view public.v_sales;

create view public.v_sales with (security_invoker = true) as
  select
    s.id, s.bill_id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
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

create function private.record_sale_line(
  p_bill_id uuid,
  p_batch_id uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_quantity integer,
  p_sale_price numeric,
  p_payment_mode text,
  p_has_stickering boolean,
  p_stickering_cost numeric,
  p_stickering_price numeric,
  p_notes text
)
returns public.sales
language plpgsql
set search_path = ''
as $$
declare
  v_batch public.batches;
  v_sale public.sales;
begin
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
    bill_id, sale_date, batch_id, customer_id, quantity, sale_price, landed_cost,
    has_stickering, stickering_cost, stickering_price, payment_mode, notes
  ) values (
    p_bill_id, p_sale_date, p_batch_id, p_customer_id, p_quantity, p_sale_price, v_batch.landed_cost,
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
  p_notes text default null
)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  return private.record_sale_line(
    null, p_batch_id, p_customer_id, p_sale_date, p_quantity, p_sale_price, p_payment_mode,
    p_has_stickering, p_stickering_cost, p_stickering_price, p_notes
  );
end;
$$;

create function public.record_bill(
  p_customer_id uuid,
  p_sale_date date,
  p_payment_mode text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_line jsonb;
  v_sale public.sales;
  v_sales jsonb := '[]'::jsonb;
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A bill needs at least one line' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  perform private.validate_bill_header(p_sale_date, p_payment_mode);

  perform 1 from public.batches
    where id in (select (line ->> 'batch_id')::uuid from jsonb_array_elements(p_lines) as line)
    order by id
    for update;

  insert into public.bills (customer_id, sale_date, payment_mode)
    values (p_customer_id, p_sale_date, p_payment_mode)
    returning * into v_bill;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sale := private.record_sale_line(
      v_bill.id,
      (v_line ->> 'batch_id')::uuid,
      p_customer_id,
      p_sale_date,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'sale_price')::numeric,
      p_payment_mode,
      coalesce((v_line ->> 'has_stickering')::boolean, false),
      coalesce((v_line ->> 'stickering_cost')::numeric, 0),
      coalesce((v_line ->> 'stickering_price')::numeric, 0),
      null
    );
    v_sales := v_sales || to_jsonb(v_sale);
  end loop;

  return jsonb_build_object('bill', to_jsonb(v_bill), 'sales', v_sales);
end;
$$;

revoke execute on function public.record_bill(uuid, date, text, jsonb) from public, anon;
grant execute on function public.record_bill(uuid, date, text, jsonb) to authenticated, service_role;
