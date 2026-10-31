create table public.bill_payments (
  bill_id uuid not null references public.bills (id) on delete cascade,
  payment_mode text not null check (payment_mode in ('CASH', 'UPI', 'BANK_TRANSFER')),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  primary key (bill_id, payment_mode)
);

alter table public.bill_payments enable row level security;

create policy bill_payments_select on public.bill_payments
  for select to authenticated using ((select public.is_member()));

insert into public.bill_payments (bill_id, payment_mode, amount, created_at, created_by)
select b.id, b.payment_mode, coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0), b.created_at, b.created_by
from public.bills b
left join public.sales s on s.bill_id = b.id
group by b.id;

alter table public.sales alter column payment_mode drop not null;

alter table public.sales disable trigger sales_set_updated_at;
update public.sales set payment_mode = null where bill_id is not null;
alter table public.sales enable trigger sales_set_updated_at;

alter table public.sales add constraint sales_payment_mode_or_bill_check
  check ((bill_id is null) = (payment_mode is not null));

alter table public.bills drop column payment_mode;

create or replace function private.validate_sale_date(p_sale_date date)
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
end;
$$;

create or replace function private.validate_sale_input(
  p_sale_date date,
  p_quantity integer,
  p_sale_rate numeric,
  p_area_sqft numeric,
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
  if p_payment_mode is null then
    perform private.validate_sale_date(p_sale_date);
  else
    perform private.validate_bill_header(p_sale_date, p_payment_mode);
  end if;
  if p_batch_purchase_date is not null and p_sale_date < p_batch_purchase_date then
    raise exception 'Sale date cannot be before the batch was bought (%)', p_batch_purchase_date
      using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Sale quantity must be greater than zero' using errcode = 'check_violation';
  end if;
  if p_sale_rate is null then
    raise exception 'Sale rate is required' using errcode = 'check_violation';
  end if;
  if p_sale_rate in ('NaN'::numeric, 'Infinity'::numeric) then
    raise exception 'Sale rate must be a number' using errcode = 'check_violation';
  end if;
  if p_sale_rate < 0 then
    raise exception 'Sale rate must be zero or more' using errcode = 'check_violation';
  end if;
  if round(coalesce(p_area_sqft, 1) * round(p_sale_rate, 10), 2) >= 1e10 then
    raise exception 'Sale Price per piece is too large' using errcode = 'check_violation';
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

create function private.rupees(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '₹' || case
    when p_amount = trunc(p_amount) then to_char(p_amount, 'FM999999999990')
    else to_char(p_amount, 'FM999999999990.00')
  end;
$$;

create function private.bill_total(p_bill_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(quantity * (sale_price + stickering_price)), 0)
  from public.sales
  where bill_id = p_bill_id;
$$;

create function private.set_bill_payments(p_bill_id uuid, p_payments jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric := private.bill_total(p_bill_id);
  v_payment jsonb;
  v_mode text;
  v_amount numeric;
  v_count integer;
  v_sum numeric := 0;
  v_seen text[] := '{}';
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Pick at least one payment mode' using errcode = 'check_violation';
  end if;
  v_count := jsonb_array_length(p_payments);

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    v_mode := v_payment ->> 'payment_mode';
    if v_mode is null or v_mode not in ('CASH', 'UPI', 'BANK_TRANSFER') then
      raise exception 'Payment mode must be Cash, UPI or Bank Transfer' using errcode = 'check_violation';
    end if;
    if v_mode = any (v_seen) then
      raise exception 'Each payment mode can appear only once on a bill' using errcode = 'check_violation';
    end if;
    v_seen := v_seen || v_mode;
    if v_count > 1 then
      if jsonb_typeof(v_payment -> 'amount') is distinct from 'number' then
        raise exception 'Enter an amount for each payment mode' using errcode = 'check_violation';
      end if;
      v_amount := round((v_payment ->> 'amount')::numeric, 2);
      if v_amount <= 0 then
        raise exception 'Each payment in a split must be more than zero' using errcode = 'check_violation';
      end if;
      v_sum := v_sum + v_amount;
    end if;
  end loop;

  if v_count > 1 and v_sum <> v_total then
    raise exception 'Payments add up to % but the bill total is %', private.rupees(v_sum), private.rupees(v_total)
      using errcode = 'check_violation';
  end if;

  delete from public.bill_payments where bill_id = p_bill_id;
  insert into public.bill_payments (bill_id, payment_mode, amount)
  select
    p_bill_id,
    p ->> 'payment_mode',
    case when v_count = 1 then v_total else round((p ->> 'amount')::numeric, 2) end
  from jsonb_array_elements(p_payments) as p;
end;
$$;

create function private.follow_bill_total(p_bill_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric := private.bill_total(p_bill_id);
  v_count integer;
  v_sum numeric;
begin
  select count(*), coalesce(sum(amount), 0) into v_count, v_sum
  from public.bill_payments where bill_id = p_bill_id;
  if v_count = 1 then
    update public.bill_payments set amount = v_total where bill_id = p_bill_id;
  elsif v_sum <> v_total then
    raise exception 'The bill total is now %; enter how it was paid', private.rupees(v_total)
      using errcode = 'check_violation';
  end if;
end;
$$;

drop function public.record_bill(uuid, date, text, jsonb);

create function public.record_bill(
  p_customer_id uuid,
  p_sale_date date,
  p_payments jsonb,
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
  v_payments jsonb;
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

  perform private.validate_sale_date(p_sale_date);

  perform 1 from public.batches
    where id in (select (line ->> 'batch_id')::uuid from jsonb_array_elements(p_lines) as line)
    order by id
    for update;

  insert into public.bills (customer_id, sale_date)
    values (p_customer_id, p_sale_date)
    returning * into v_bill;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_sale := private.record_sale_line(
      v_bill.id,
      (v_line ->> 'batch_id')::uuid,
      p_customer_id,
      p_sale_date,
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'sale_rate')::numeric,
      null,
      coalesce((v_line ->> 'has_stickering')::boolean, false),
      coalesce((v_line ->> 'stickering_cost')::numeric, 0),
      coalesce((v_line ->> 'stickering_price')::numeric, 0),
      null
    );
    v_sales := v_sales || to_jsonb(v_sale);
  end loop;

  perform private.set_bill_payments(v_bill.id, p_payments);

  select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_mode), '[]'::jsonb) into v_payments
  from public.bill_payments p where p.bill_id = v_bill.id;

  return jsonb_build_object('bill', to_jsonb(v_bill), 'sales', v_sales, 'payments', v_payments);
end;
$$;

create or replace function public.record_sale(
  p_batch_id uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_quantity integer,
  p_sale_rate numeric,
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

  perform private.validate_bill_header(p_sale_date, p_payment_mode);

  return private.record_sale_line(
    null, p_batch_id, p_customer_id, p_sale_date, p_quantity, p_sale_rate, p_payment_mode,
    p_has_stickering, p_stickering_cost, p_stickering_price, p_notes
  );
end;
$$;

drop function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text);

create function public.correct_sale(
  p_sale_id uuid,
  p_batch_id uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_quantity integer,
  p_sale_rate numeric,
  p_payment_mode text default null,
  p_has_stickering boolean default false,
  p_stickering_cost numeric default 0,
  p_stickering_price numeric default 0,
  p_notes text default null,
  p_payments jsonb default null
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
  v_area numeric;
  v_mode text;
begin
  perform private.require_admin();

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Unknown sale' using errcode = 'foreign_key_violation';
  end if;
  if v_sale.bill_id is not null then
    if p_customer_id is distinct from v_sale.customer_id or p_sale_date is distinct from v_sale.sale_date then
      raise exception 'Customer and sale date come from the bill and cannot be changed on one of its sales'
        using errcode = 'check_violation';
    end if;
    perform 1 from public.bills where id = v_sale.bill_id for update;
    v_mode := null;
  else
    if p_payments is not null then
      raise exception 'Only a sale on a bill takes a payment split' using errcode = 'check_violation';
    end if;
    perform private.validate_bill_header(p_sale_date, p_payment_mode);
    v_mode := p_payment_mode;
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

  v_area := case when p_batch_id = v_sale.batch_id then v_sale.area_sqft else v_new.length_ft * v_new.breadth_ft end;

  perform private.validate_sale_input(
    p_sale_date,
    p_quantity,
    p_sale_rate,
    v_area,
    v_mode,
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
    sale_rate = p_sale_rate,
    area_sqft = v_area,
    landed_cost = case when p_batch_id = v_sale.batch_id then v_sale.landed_cost else v_new.landed_cost end,
    has_stickering = coalesce(p_has_stickering, false),
    stickering_cost = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_cost, 0) else 0 end,
    stickering_price = case when coalesce(p_has_stickering, false) then coalesce(p_stickering_price, 0) else 0 end,
    payment_mode = v_mode,
    notes = nullif(trim(p_notes), '')
  where id = p_sale_id
  returning * into v_sale;

  if v_sale.bill_id is not null then
    if p_payments is null then
      perform private.follow_bill_total(v_sale.bill_id);
    else
      perform private.set_bill_payments(v_sale.bill_id, p_payments);
    end if;
  end if;

  return v_sale;
end;
$$;

drop function public.delete_sale(uuid);

create function public.delete_sale(p_sale_id uuid, p_payments jsonb default null)
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
  if v_sale.bill_id is null and p_payments is not null then
    raise exception 'Only a sale on a bill takes a payment split' using errcode = 'check_violation';
  end if;

  perform 1 from public.batches where id = v_sale.batch_id for update;
  if v_sale.bill_id is not null then
    perform 1 from public.bills where id = v_sale.bill_id for update;
  end if;

  update public.batches set units_sold = units_sold - v_sale.quantity where id = v_sale.batch_id;
  delete from public.sales where id = p_sale_id;

  if v_sale.bill_id is not null then
    if not exists (select 1 from public.sales where bill_id = v_sale.bill_id) then
      delete from public.bills where id = v_sale.bill_id;
    elsif p_payments is null then
      perform private.follow_bill_total(v_sale.bill_id);
    else
      perform private.set_bill_payments(v_sale.bill_id, p_payments);
    end if;
  end if;
end;
$$;

revoke execute on function public.record_bill(uuid, date, jsonb, jsonb) from public, anon;
grant execute on function public.record_bill(uuid, date, jsonb, jsonb) to authenticated, service_role;
revoke execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text, jsonb) to authenticated, service_role;
revoke execute on function public.delete_sale(uuid, jsonb) from public, anon;
grant execute on function public.delete_sale(uuid, jsonb) to authenticated, service_role;

create view public.v_payments with (security_invoker = true) as
with units as (
  select
    s.bill_id,
    case when s.bill_id is null then s.id end as sale_id,
    min(s.sale_date) as sale_date,
    (array_agg(s.customer_id))[1] as customer_id,
    sum(s.quantity * (s.sale_price + s.stickering_price)) as revenue,
    sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)) as margin
  from public.sales s
  group by s.bill_id, case when s.bill_id is null then s.id end
),
paid as (
  select u.*, p.payment_mode, p.amount
  from units u
  join public.bill_payments p on p.bill_id = u.bill_id
  union all
  select u.*, s.payment_mode, u.revenue
  from units u
  join public.sales s on s.id = u.sale_id
),
ordered as (
  select
    paid.*,
    sum(paid.amount) over w as running,
    row_number() over w as position,
    count(*) over (partition by paid.bill_id, paid.sale_id) as payments
  from paid
  window w as (partition by paid.bill_id, paid.sale_id order by paid.payment_mode)
)
select
  bill_id,
  sale_id,
  sale_date,
  customer_id,
  payment_mode,
  amount,
  revenue as total,
  margin as total_margin,
  case
    when revenue = 0 then case when position = payments then margin else 0 end
    else round(margin * running / revenue, 2) - round(margin * (running - amount) / revenue, 2)
  end as margin_share
from ordered;

create function public.payments_by_mode(p_range text, p_from date default null, p_to date default null)
returns table (
  payment_mode text,
  collected numeric,
  margin numeric,
  margin_pct numeric,
  range_from date,
  range_to date
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from date;
  v_to date := private.ist_today();
begin
  if p_range = 'week' then
    v_from := date_trunc('week', v_to::timestamp)::date;
  elsif p_range = 'month' then
    v_from := date_trunc('month', v_to::timestamp)::date;
  elsif p_range = 'custom' then
    if p_from is null or p_to is null then
      raise exception 'Pick a start and end date' using errcode = 'invalid_parameter_value';
    end if;
    if p_to > v_to then
      raise exception 'The end date cannot be in the future' using errcode = 'invalid_parameter_value';
    end if;
    if p_from > p_to then
      raise exception 'The start date must be on or before the end date' using errcode = 'invalid_parameter_value';
    end if;
    v_from := p_from;
    v_to := p_to;
  else
    raise exception 'Unknown range %, expected week, month or custom', p_range using errcode = 'invalid_parameter_value';
  end if;

  return query
  with modes (mode, ord) as (
    values ('CASH', 1), ('UPI', 2), ('BANK_TRANSFER', 3)
  ),
  totals as (
    select p.payment_mode as mode, sum(p.amount) as col, sum(p.margin_share) as mar
    from public.v_payments p
    where p.sale_date between v_from and v_to
    group by p.payment_mode
  )
  select
    modes.mode,
    coalesce(totals.col, 0),
    coalesce(totals.mar, 0),
    case when coalesce(totals.col, 0) = 0 then null else round(totals.mar / totals.col * 100, 2) end,
    v_from,
    v_to
  from modes
  left join totals on totals.mode = modes.mode
  order by modes.ord;
end;
$$;

revoke execute on function public.payments_by_mode(text, date, date) from public, anon;
grant execute on function public.payments_by_mode(text, date, date) to authenticated, service_role;

create view public.v_chat_payments with (security_barrier = true) as
with units as (
  select
    s.bill_id,
    case when s.bill_id is null then s.id end as sale_id,
    min(s.sale_date) as sale_date,
    (array_agg(s.customer_id))[1] as customer_id,
    sum(s.quantity * (s.sale_price + s.stickering_price)) as revenue,
    sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)) as margin
  from public.sales s
  group by s.bill_id, case when s.bill_id is null then s.id end
),
paid as (
  select u.*, p.payment_mode, p.amount
  from units u
  join public.bill_payments p on p.bill_id = u.bill_id
  union all
  select u.*, s.payment_mode, u.revenue
  from units u
  join public.sales s on s.id = u.sale_id
),
ordered as (
  select
    paid.*,
    sum(paid.amount) over w as running,
    row_number() over w as position,
    count(*) over (partition by paid.bill_id, paid.sale_id) as payments
  from paid
  window w as (partition by paid.bill_id, paid.sale_id order by paid.payment_mode)
)
select
  bill_id,
  sale_id,
  sale_date,
  'C-' || left(customer_id::text, 6) as customer_alias,
  payment_mode,
  amount,
  case
    when revenue = 0 then case when position = payments then margin else 0 end
    else round(margin * running / revenue, 2) - round(margin * (running - amount) / revenue, 2)
  end as margin_share
from ordered
where (select public.is_member());

revoke all on public.v_chat_payments from public, anon, authenticated, service_role;
grant select on public.v_chat_payments to chat_reader;
