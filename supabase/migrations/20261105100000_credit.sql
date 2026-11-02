alter table public.bills add column on_credit boolean not null default false;

create table public.credit_promises (
  id bigint generated always as identity primary key,
  bill_id uuid not null references public.bills (id) on delete cascade,
  pay_by date not null check (pay_by >= date '2000-01-01'),
  created_at timestamptz not null default now(),
  created_by text default private.current_email()
);
create index credit_promises_bill_idx on public.credit_promises (bill_id, id);

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  paid_on date not null check (paid_on >= date '2000-01-01'),
  created_at timestamptz not null default now(),
  created_by text default private.current_email(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index credit_payments_bill_idx on public.credit_payments (bill_id, paid_on);

create trigger credit_payments_set_updated_at
  before update on public.credit_payments
  for each row execute function private.set_updated_at();

create table public.credit_payment_lines (
  payment_id uuid not null references public.credit_payments (id) on delete cascade,
  payment_mode text not null check (payment_mode in ('CASH', 'UPI', 'BANK_TRANSFER')),
  amount numeric(12, 2) not null check (amount > 0),
  primary key (payment_id, payment_mode)
);

alter table public.credit_promises enable row level security;
alter table public.credit_payments enable row level security;
alter table public.credit_payment_lines enable row level security;

create policy credit_promises_select on public.credit_promises
  for select to authenticated using ((select public.is_member()));
create policy credit_payments_select on public.credit_payments
  for select to authenticated using ((select public.is_member()));
create policy credit_payment_lines_select on public.credit_payment_lines
  for select to authenticated using ((select public.is_member()));

revoke insert, update, delete, truncate on public.credit_promises, public.credit_payments, public.credit_payment_lines
  from anon, authenticated;

create function private.default_pay_by(p_sale_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_sale_date + case extract(isodow from p_sale_date)::integer
    when 6 then 7
    when 7 then 6
    else 6 - extract(isodow from p_sale_date)::integer
  end;
$$;

create function private.validate_pay_by(p_pay_by date, p_sale_date date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_pay_by is null then
    raise exception 'Pay-by date is required' using errcode = 'check_violation';
  end if;
  if p_pay_by < p_sale_date then
    raise exception 'Pay-by date cannot be before the sale date' using errcode = 'check_violation';
  end if;
  if p_pay_by > private.ist_today() + 365 then
    raise exception 'The pay-by date can be at most a year away' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.bill_received(p_bill_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select sum(amount) from public.bill_payments where bill_id = p_bill_id), 0)
    + coalesce((
      select sum(l.amount)
      from public.credit_payments c
      join public.credit_payment_lines l on l.payment_id = c.id
      where c.bill_id = p_bill_id
    ), 0);
$$;

create function private.set_credit_bill_payments(p_bill_id uuid, p_payments jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric := private.bill_total(p_bill_id);
  v_payment jsonb;
  v_mode text;
  v_amount numeric;
  v_sum numeric := 0;
  v_seen text[] := '{}';
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Payments must be a list of payment modes with amounts' using errcode = 'check_violation';
  end if;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    v_mode := v_payment ->> 'payment_mode';
    if v_mode is null or v_mode not in ('CASH', 'UPI', 'BANK_TRANSFER') then
      raise exception 'Payment mode must be Cash, UPI or Bank Transfer' using errcode = 'check_violation';
    end if;
    if v_mode = any (v_seen) then
      raise exception 'Each payment mode can appear only once on a bill' using errcode = 'check_violation';
    end if;
    v_seen := v_seen || v_mode;
    if jsonb_typeof(v_payment -> 'amount') is distinct from 'number' then
      raise exception 'Enter an amount for each payment mode' using errcode = 'check_violation';
    end if;
    v_amount := round((v_payment ->> 'amount')::numeric, 2);
    if v_amount < 0 then
      raise exception 'Each payment must be zero or more' using errcode = 'check_violation';
    end if;
    if v_amount >= 1e10 then
      raise exception 'Payment amount is too large' using errcode = 'check_violation';
    end if;
    v_sum := v_sum + v_amount;
    if v_amount > 0 then
      insert into public.bill_payments (bill_id, payment_mode, amount) values (p_bill_id, v_mode, v_amount);
    end if;
  end loop;

  if v_sum >= v_total then
    raise exception 'Paid now must be less than the bill total of %', private.rupees(v_total)
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.credit_receipt_total(p_payments jsonb)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_payment jsonb;
  v_mode text;
  v_amount numeric;
  v_sum numeric := 0;
  v_seen text[] := '{}';
begin
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Pick at least one payment mode' using errcode = 'check_violation';
  end if;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    v_mode := v_payment ->> 'payment_mode';
    if v_mode is null or v_mode not in ('CASH', 'UPI', 'BANK_TRANSFER') then
      raise exception 'Payment mode must be Cash, UPI or Bank Transfer' using errcode = 'check_violation';
    end if;
    if v_mode = any (v_seen) then
      raise exception 'Each payment mode can appear only once on a bill' using errcode = 'check_violation';
    end if;
    v_seen := v_seen || v_mode;
    if jsonb_typeof(v_payment -> 'amount') is distinct from 'number' then
      raise exception 'Enter an amount for each payment mode' using errcode = 'check_violation';
    end if;
    v_amount := round((v_payment ->> 'amount')::numeric, 2);
    if v_amount <= 0 then
      raise exception 'Each payment must be more than zero' using errcode = 'check_violation';
    end if;
    if v_amount >= 1e10 then
      raise exception 'Payment amount is too large' using errcode = 'check_violation';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  return v_sum;
end;
$$;

create function private.validate_credit_payment_date(p_paid_on date, p_sale_date date)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_paid_on is null then
    raise exception 'Payment date is required' using errcode = 'check_violation';
  end if;
  if p_paid_on > private.ist_today() then
    raise exception 'Payment date cannot be in the future' using errcode = 'check_violation';
  end if;
  if p_paid_on < p_sale_date then
    raise exception 'Payment date cannot be before the sale date' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.set_bill_payments(p_bill_id uuid, p_payments jsonb)
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
  if exists (select 1 from public.bills where id = p_bill_id and on_credit) then
    raise exception 'Payments on a credit bill are changed on the Credit page' using errcode = 'check_violation';
  end if;
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

create or replace function private.follow_bill_total(p_bill_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_total numeric := private.bill_total(p_bill_id);
  v_count integer;
  v_sum numeric;
  v_received numeric;
begin
  if exists (select 1 from public.bills where id = p_bill_id and on_credit) then
    v_received := private.bill_received(p_bill_id);
    if v_received > v_total then
      raise exception '% is already paid but the bill total is now %', private.rupees(v_received), private.rupees(v_total)
        using errcode = 'check_violation';
    end if;
    return;
  end if;
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

drop function public.record_bill(uuid, date, jsonb, jsonb);

create function public.record_bill(
  p_customer_id uuid,
  p_sale_date date,
  p_payments jsonb,
  p_lines jsonb,
  p_on_credit boolean default false,
  p_pay_by date default null
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
  v_pay_by date;
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

  if coalesce(p_on_credit, false) then
    if exists (select 1 from public.customers where id = p_customer_id and is_walk_in) then
      raise exception 'Credit needs a named Customer' using errcode = 'check_violation';
    end if;
    v_pay_by := coalesce(p_pay_by, private.default_pay_by(p_sale_date));
    perform private.validate_pay_by(v_pay_by, p_sale_date);
  elsif p_pay_by is not null then
    raise exception 'A pay-by date only applies to a bill sold on credit' using errcode = 'check_violation';
  end if;

  perform 1 from public.batches
    where id in (select (line ->> 'batch_id')::uuid from jsonb_array_elements(p_lines) as line)
    order by id
    for update;

  insert into public.bills (customer_id, sale_date, on_credit)
    values (p_customer_id, p_sale_date, coalesce(p_on_credit, false))
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
      coalesce((v_line ->> 'stickering_cost_rate')::numeric, 0),
      coalesce((v_line ->> 'stickering_rate')::numeric, 0),
      null
    );
    v_sales := v_sales || to_jsonb(v_sale);
  end loop;

  if v_bill.on_credit then
    perform private.set_credit_bill_payments(v_bill.id, p_payments);
    insert into public.credit_promises (bill_id, pay_by) values (v_bill.id, v_pay_by);
  else
    perform private.set_bill_payments(v_bill.id, p_payments);
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_mode), '[]'::jsonb) into v_payments
  from public.bill_payments p where p.bill_id = v_bill.id;

  return jsonb_build_object('bill', to_jsonb(v_bill), 'sales', v_sales, 'payments', v_payments);
end;
$$;

revoke execute on function public.record_bill(uuid, date, jsonb, jsonb, boolean, date) from public, anon;
grant execute on function public.record_bill(uuid, date, jsonb, jsonb, boolean, date) to authenticated, service_role;

create function public.record_credit_payment(p_bill_id uuid, p_paid_on date, p_payments jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_balance numeric;
  v_sum numeric;
  v_id uuid;
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Unknown bill' using errcode = 'foreign_key_violation';
  end if;
  if not v_bill.on_credit then
    raise exception 'This bill was not sold on credit' using errcode = 'check_violation';
  end if;

  v_balance := private.bill_total(p_bill_id) - private.bill_received(p_bill_id);
  if v_balance <= 0 then
    raise exception 'Nothing is owed on this bill' using errcode = 'check_violation';
  end if;

  perform private.validate_credit_payment_date(p_paid_on, v_bill.sale_date);
  v_sum := private.credit_receipt_total(p_payments);
  if v_sum > v_balance then
    raise exception '% is more than the balance of %', private.rupees(v_sum), private.rupees(v_balance)
      using errcode = 'check_violation';
  end if;

  insert into public.credit_payments (bill_id, paid_on) values (p_bill_id, p_paid_on) returning id into v_id;
  insert into public.credit_payment_lines (payment_id, payment_mode, amount)
  select v_id, p ->> 'payment_mode', round((p ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_payments) as p;

  return v_id;
end;
$$;

create function public.correct_credit_payment(p_payment_id uuid, p_paid_on date, p_payments jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.credit_payments;
  v_bill public.bills;
  v_balance numeric;
  v_sum numeric;
begin
  perform private.require_admin();

  select * into v_payment from public.credit_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Unknown payment' using errcode = 'foreign_key_violation';
  end if;
  select * into v_bill from public.bills where id = v_payment.bill_id for update;
  select * into v_payment from public.credit_payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'Unknown payment' using errcode = 'foreign_key_violation';
  end if;

  v_balance := private.bill_total(v_bill.id) - private.bill_received(v_bill.id)
    + coalesce((select sum(amount) from public.credit_payment_lines where payment_id = p_payment_id), 0);

  perform private.validate_credit_payment_date(p_paid_on, v_bill.sale_date);
  v_sum := private.credit_receipt_total(p_payments);
  if v_sum > v_balance then
    raise exception '% is more than the balance of %', private.rupees(v_sum), private.rupees(v_balance)
      using errcode = 'check_violation';
  end if;

  update public.credit_payments set paid_on = p_paid_on where id = p_payment_id;
  delete from public.credit_payment_lines where payment_id = p_payment_id;
  insert into public.credit_payment_lines (payment_id, payment_mode, amount)
  select p_payment_id, p ->> 'payment_mode', round((p ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_payments) as p;
end;
$$;

create function public.delete_credit_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.credit_payments;
begin
  perform private.require_admin();

  select * into v_payment from public.credit_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Unknown payment' using errcode = 'foreign_key_violation';
  end if;
  perform 1 from public.bills where id = v_payment.bill_id for update;
  delete from public.credit_payments where id = p_payment_id;
end;
$$;

create function public.extend_pay_by(p_bill_id uuid, p_pay_by date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_current date;
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;

  select * into v_bill from public.bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'Unknown bill' using errcode = 'foreign_key_violation';
  end if;
  if not v_bill.on_credit then
    raise exception 'This bill was not sold on credit' using errcode = 'check_violation';
  end if;
  if private.bill_total(p_bill_id) - private.bill_received(p_bill_id) <= 0 then
    raise exception 'Nothing is owed on this bill' using errcode = 'check_violation';
  end if;

  if p_pay_by is null then
    raise exception 'Pay-by date is required' using errcode = 'check_violation';
  end if;
  select pay_by into v_current from public.credit_promises where bill_id = p_bill_id order by id desc limit 1;
  if p_pay_by <= v_current then
    raise exception 'The new pay-by date must be after the current pay-by date' using errcode = 'check_violation';
  end if;
  if p_pay_by < private.ist_today() then
    raise exception 'The pay-by date cannot be in the past' using errcode = 'check_violation';
  end if;
  perform private.validate_pay_by(p_pay_by, v_bill.sale_date);

  insert into public.credit_promises (bill_id, pay_by) values (p_bill_id, p_pay_by);
end;
$$;

revoke execute on function public.record_credit_payment(uuid, date, jsonb) from public, anon;
revoke execute on function public.correct_credit_payment(uuid, date, jsonb) from public, anon;
revoke execute on function public.delete_credit_payment(uuid) from public, anon;
revoke execute on function public.extend_pay_by(uuid, date) from public, anon;
grant execute on function public.record_credit_payment(uuid, date, jsonb) to authenticated, service_role;
grant execute on function public.correct_credit_payment(uuid, date, jsonb) to authenticated, service_role;
grant execute on function public.delete_credit_payment(uuid) to authenticated, service_role;
grant execute on function public.extend_pay_by(uuid, date) to authenticated, service_role;

create view public.v_bill_balances with (security_invoker = true) as
select
  b.id as bill_id,
  b.customer_id,
  b.sale_date,
  b.on_credit,
  t.total,
  t.margin,
  p.amount + c.amount as received,
  t.total - (p.amount + c.amount) as balance
from public.bills b
cross join lateral (
  select
    coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0) as total,
    coalesce(sum(s.quantity * (s.sale_price - s.landed_cost) + s.quantity * (s.stickering_price - s.stickering_cost)), 0) as margin
  from public.sales s
  where s.bill_id = b.id
) t
cross join lateral (
  select coalesce(sum(bp.amount), 0) as amount from public.bill_payments bp where bp.bill_id = b.id
) p
cross join lateral (
  select coalesce(sum(l.amount), 0) as amount
  from public.credit_payments cp
  join public.credit_payment_lines l on l.payment_id = cp.id
  where cp.bill_id = b.id
) c;

create view public.v_credit with (security_invoker = true) as
select
  bb.bill_id,
  bb.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  bb.sale_date,
  bb.total,
  bb.received as paid,
  bb.balance,
  first_promise.pay_by as original_pay_by,
  last_promise.pay_by,
  (promises.n - 1)::integer as extensions,
  (last_promise.pay_by - private.ist_today())::integer as days_left
from public.v_bill_balances bb
join public.customers c on c.id = bb.customer_id
cross join lateral (
  select pay_by from public.credit_promises where bill_id = bb.bill_id order by id limit 1
) first_promise
cross join lateral (
  select pay_by from public.credit_promises where bill_id = bb.bill_id order by id desc limit 1
) last_promise
cross join lateral (
  select count(*) as n from public.credit_promises where bill_id = bb.bill_id
) promises
where bb.on_credit;

create or replace view public.v_customers with (security_invoker = true) as
  select
    c.id, c.name, c.phone, c.customer_type, c.is_walk_in, c.created_at, c.updated_at, c.updated_by,
    (select max(s.sale_date) from public.sales s where s.customer_id = c.id) as last_purchase_date,
    (select count(*) from public.sales s where s.customer_id = c.id)::integer as sale_count,
    (select coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0)
       from public.sales s where s.customer_id = c.id) as lifetime_revenue,
    (select coalesce(sum(k.balance), 0) from public.v_credit k where k.customer_id = c.id and k.balance > 0) as owed,
    (select min(k.days_left) from public.v_credit k where k.customer_id = c.id and k.balance > 0) as credit_days_left
  from public.customers c;

create or replace view public.v_payments with (security_invoker = true) as
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
  select u.*, 0 as source, u.sale_date as received_on, 'epoch'::timestamptz as received_at, p.payment_mode, p.amount
  from units u
  join public.bill_payments p on p.bill_id = u.bill_id
  union all
  select u.*, 1, cp.paid_on, cp.created_at, l.payment_mode, l.amount
  from units u
  join public.credit_payments cp on cp.bill_id = u.bill_id
  join public.credit_payment_lines l on l.payment_id = cp.id
  union all
  select u.*, 0, u.sale_date, 'epoch'::timestamptz, s.payment_mode, u.revenue
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
  window w as (
    partition by paid.bill_id, paid.sale_id
    order by paid.source, paid.received_on, paid.received_at, paid.payment_mode
  )
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
  end as margin_share,
  received_on
from ordered;

drop function public.payments_by_mode(text, date, date);

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
    values ('CASH', 1), ('UPI', 2), ('BANK_TRANSFER', 3), ('UNPAID', 4)
  ),
  totals as (
    select p.payment_mode as mode, sum(p.amount) as col, sum(p.margin_share) as mar
    from public.v_payments p
    where p.sale_date between v_from and v_to
    group by p.payment_mode
    union all
    select 'UNPAID', sum(bb.balance), sum(bb.margin - coalesce(shares.share, 0))
    from public.v_bill_balances bb
    left join (
      select p.bill_id, sum(p.margin_share) as share
      from public.v_payments p
      where p.bill_id is not null
      group by p.bill_id
    ) shares on shares.bill_id = bb.bill_id
    where bb.on_credit and bb.sale_date between v_from and v_to
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

create or replace function public.received_by_period(p_range text, p_from date default null, p_to date default null)
returns table (period_start date, cash numeric, upi numeric, bank_transfer numeric, total numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.ist_today();
  v_grain text;
  v_step interval;
  v_first date;
  v_last date;
begin
  if p_range = 'week' or p_range = 'month' then
    v_grain := p_range;
    v_step := case when p_range = 'week' then interval '7 days' else interval '1 month' end;
    v_last := date_trunc(p_range, v_today::timestamp)::date;
    v_first := (v_last - 11 * v_step)::date;
  elsif p_range = 'custom' then
    if p_from is null or p_to is null then
      raise exception 'Pick a start and end date' using errcode = 'invalid_parameter_value';
    end if;
    if p_to > v_today then
      raise exception 'The end date cannot be in the future' using errcode = 'invalid_parameter_value';
    end if;
    if p_from > p_to then
      raise exception 'The start date must be on or before the end date' using errcode = 'invalid_parameter_value';
    end if;
    v_grain := 'day';
    v_step := interval '1 day';
    v_first := p_from;
    v_last := p_to;
  else
    raise exception 'Unknown range %, expected week, month or custom', p_range using errcode = 'invalid_parameter_value';
  end if;

  return query
  with periods as (
    select g::date as starts
    from generate_series(v_first::timestamp, v_last::timestamp, v_step) as g
  ),
  totals as (
    select
      date_trunc(v_grain, p.received_on::timestamp)::date as starts,
      sum(p.amount) filter (where p.payment_mode = 'CASH') as cash_sum,
      sum(p.amount) filter (where p.payment_mode = 'UPI') as upi_sum,
      sum(p.amount) filter (where p.payment_mode = 'BANK_TRANSFER') as bank_sum
    from public.v_payments p
    where p.received_on >= v_first and p.received_on < (v_last + v_step)::date
    group by 1
  )
  select
    periods.starts,
    coalesce(totals.cash_sum, 0),
    coalesce(totals.upi_sum, 0),
    coalesce(totals.bank_sum, 0),
    coalesce(totals.cash_sum, 0) + coalesce(totals.upi_sum, 0) + coalesce(totals.bank_sum, 0)
  from periods
  left join totals on totals.starts = periods.starts
  order by periods.starts;
end;
$$;
