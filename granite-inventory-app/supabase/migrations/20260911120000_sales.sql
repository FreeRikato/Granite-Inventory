-- Ticket 04: Customers, Sales, Stock Lines and record_sale.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  customer_type text not null default 'REGULAR'
    check (customer_type in ('REGULAR', 'CONTRACTOR', 'ENGINEER', 'TRUST', 'RETAIL')),
  is_walk_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint customers_name_not_blank check (length(trim(name)) > 0),
  constraint customers_phone_shape check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$')
);
-- Phone identifies a customer in this trade. Compare on the last ten digits so
-- "+91 98765 43210" and "9876543210" collide as they should.
create unique index customers_phone_key on public.customers ((right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)))
  where phone is not null;
create unique index customers_one_walk_in on public.customers (is_walk_in) where is_walk_in;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

create or replace function private.protect_walk_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_walk_in then
    raise exception 'The Walk-in Customer cannot be deleted' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger customers_protect_walk_in
  before delete on public.customers
  for each row execute function private.protect_walk_in();

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null check (sale_date <= current_date),
  batch_id uuid not null references public.batches (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  sale_price numeric(12, 2) not null check (sale_price >= 0),
  landed_cost numeric(12, 2) not null check (landed_cost >= 0),
  has_stickering boolean not null default false,
  stickering_cost numeric(12, 2) not null default 0 check (stickering_cost >= 0),
  stickering_price numeric(12, 2) not null default 0 check (stickering_price >= 0),
  misc_expense numeric(12, 2) not null default 0 check (misc_expense >= 0),
  payment_mode text not null check (payment_mode in ('CASH', 'UPI', 'BANK_TRANSFER')),
  notes text,
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint sales_stickering_zero_when_off check (
    has_stickering or (stickering_cost = 0 and stickering_price = 0)
  )
);
create index sales_batch_idx on public.sales (batch_id);
create index sales_customer_idx on public.sales (customer_id);
create index sales_date_idx on public.sales (sale_date);

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function private.set_updated_at();

alter table public.customers enable row level security;
alter table public.sales enable row level security;

create policy customers_select on public.customers for select to authenticated using ((select public.is_member()));
create policy customers_insert on public.customers for insert to authenticated with check ((select public.is_member()));
create policy customers_update on public.customers for update to authenticated using ((select public.is_member())) with check ((select public.is_member()));
create policy customers_delete on public.customers for delete to authenticated using ((select public.is_admin()));

-- Sales are written only through record_sale (and the Correction functions later); no
-- insert policy on purpose.
create policy sales_select on public.sales for select to authenticated using ((select public.is_member()));
create policy sales_update on public.sales for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sales_delete on public.sales for delete to authenticated using ((select public.is_admin()));

-- Security definer because operators may not update batches directly, yet a sale must
-- decrement the batch. The member check is the first thing it does.
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

revoke execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, numeric, text) to authenticated, service_role;

-- Sales with names and derived money. Margin excludes misc expense by design.
create view public.v_sales with (security_invoker = true) as
  select
    s.id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
    s.has_stickering, s.stickering_cost, s.stickering_price, s.misc_expense,
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

-- Stock Lines: every Batch sharing product, variant and size seen as one sellable item.
create view public.v_stock_lines with (security_invoker = true) as
  select
    b.line_key,
    b.product_id, b.product_name, b.product_abbreviation, b.category,
    b.variant_id, b.variant_name,
    b.length_ft, b.breadth_ft, b.thickness_mm,
    sum(b.available)::integer as available,
    count(*)::integer as batch_count,
    count(*) filter (where b.available > 0)::integer as batches_with_stock,
    min(b.purchase_date) as oldest_purchase_date
  from public.v_batches b
  group by b.line_key, b.variant_id, b.length_ft, b.breadth_ft, b.thickness_mm,
    b.product_id, b.product_name, b.product_abbreviation, b.category, b.variant_name;
