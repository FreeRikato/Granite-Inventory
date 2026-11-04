alter table public.team_members drop constraint team_members_role_check;
alter table public.team_members add constraint team_members_role_check
  check (role in ('ADMIN', 'YARD_OPERATOR', 'VIEWER'));

create or replace function private.keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.role <> 'ADMIN') then
    if old.role = 'ADMIN' then
      perform pg_advisory_xact_lock(hashtext('private.keep_one_admin'));
      if not exists (select 1 from public.team_members where role = 'ADMIN' and id <> old.id) then
        raise exception 'At least one Admin must remain' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where email = private.current_email() and role in ('ADMIN', 'YARD_OPERATOR')
  );
$$;

revoke execute on function public.can_write() from public, anon;
grant execute on function public.can_write() to authenticated, service_role;

create or replace function private.require_writer()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'Not a team member' using errcode = 'insufficient_privilege';
  end if;
  if not public.can_write() then
    raise exception 'A Viewer cannot change anything' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function private.refuse_viewer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_member() and not public.can_write() then
    raise exception 'A Viewer cannot change anything' using errcode = 'insufficient_privilege';
  end if;
  return null;
end;
$$;

do $$
declare
  v_table text;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'create trigger refuse_viewer before insert or update or delete on public.%I
         for each statement execute function private.refuse_viewer()',
      v_table
    );
  end loop;
end;
$$;

alter policy products_insert on public.products with check ((select public.can_write()));
alter policy variants_insert on public.variants with check ((select public.can_write()));
alter policy suppliers_insert on public.suppliers with check ((select public.can_write()));
alter policy batches_insert on public.batches with check ((select public.can_write()));
alter policy customers_insert on public.customers with check ((select public.can_write()));
alter policy customers_update on public.customers
  using ((select public.can_write())) with check ((select public.can_write()));

revoke insert, update, delete on public.v_public_business, public.v_public_catalog from anon, authenticated;
revoke truncate on all tables in schema public from anon, authenticated;

create or replace function public.create_batch(p_product_id uuid, p_variant_name text, p_supplier_id uuid, p_purchase_date date, p_length_ft numeric default null::numeric, p_breadth_ft numeric default null::numeric, p_thickness_mm integer default null::integer, p_slot text default null::text, p_initial_units integer default null::integer, p_unit_purchase_price numeric default null::numeric, p_freight_cost numeric default 0, p_notes text default null::text, p_stack_number text default null::text)
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
  perform private.require_writer();

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

create or replace function public.extend_pay_by(p_bill_id uuid, p_pay_by date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill public.bills;
  v_current date;
begin
  perform private.require_writer();

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

create or replace function public.record_bill(p_customer_id uuid, p_sale_date date, p_payments jsonb, p_lines jsonb, p_on_credit boolean default false, p_pay_by date default null::date)
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
  perform private.require_writer();

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

create or replace function public.record_credit_payment(p_bill_id uuid, p_paid_on date, p_payments jsonb)
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
  perform private.require_writer();

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

create or replace function public.record_sale(p_batch_id uuid, p_customer_id uuid, p_sale_date date, p_quantity integer, p_sale_rate numeric, p_payment_mode text, p_has_stickering boolean default false, p_stickering_cost_rate numeric default 0, p_stickering_rate numeric default 0, p_notes text default null::text)
returns public.sales
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_writer();

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Unknown customer' using errcode = 'foreign_key_violation';
  end if;

  perform private.validate_bill_header(p_sale_date, p_payment_mode);

  return private.record_sale_line(
    null, p_batch_id, p_customer_id, p_sale_date, p_quantity, p_sale_rate, p_payment_mode,
    p_has_stickering, p_stickering_cost_rate, p_stickering_rate, p_notes
  );
end;
$$;
