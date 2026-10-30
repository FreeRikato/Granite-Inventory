create temporary table sale_rate_views as
with recursive deps (oid, depth) as (
  select distinct r.ev_class, 1
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  where d.classid = 'pg_rewrite'::regclass
    and d.refobjid = 'public.sales'::regclass
    and r.ev_class <> 'public.sales'::regclass
  union
  select distinct r.ev_class, deps.depth + 1
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join deps on d.refobjid = deps.oid
  where d.classid = 'pg_rewrite'::regclass
    and r.ev_class <> deps.oid
)
select
  n.nspname as schema_name,
  c.relname as view_name,
  max(deps.depth) as depth,
  pg_get_viewdef(c.oid) as definition,
  c.reloptions,
  c.relacl
from deps
join pg_class c on c.oid = deps.oid
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
group by c.oid, n.nspname, c.relname;

do $$
declare
  v record;
begin
  for v in select * from sale_rate_views order by depth desc loop
    execute format('drop view %I.%I', v.schema_name, v.view_name);
  end loop;
end;
$$;

create temporary table sale_rate_before as
select id, sale_price from public.sales;

alter table public.sales add column area_sqft numeric(12, 4);
alter table public.sales add column sale_rate numeric(22, 10);

alter table public.sales disable trigger sales_set_updated_at;

update public.sales s
set area_sqft = b.length_ft * b.breadth_ft
from public.batches b
where b.id = s.batch_id;

update public.sales
set sale_rate = round(sale_price / coalesce(area_sqft, 1), 10);

alter table public.sales enable trigger sales_set_updated_at;

alter table public.sales drop column sale_price;
alter table public.sales alter column sale_rate set not null;
alter table public.sales add constraint sales_sale_rate_check check (sale_rate >= 0);
alter table public.sales add column sale_price numeric(12, 2) generated always as
  (round(coalesce(area_sqft, 1) * sale_rate, 2)) stored;

do $$
declare
  v_changed integer;
begin
  select count(*) into v_changed
  from public.sales s
  join sale_rate_before p on p.id = s.id
  where s.sale_price <> p.sale_price;
  if v_changed > 0 then
    raise exception '% sales would change Sale Price', v_changed;
  end if;
end;
$$;

do $$
declare
  v record;
  g record;
begin
  for v in select * from sale_rate_views order by depth loop
    execute format(
      'create view %I.%I %s as %s',
      v.schema_name,
      v.view_name,
      case when v.reloptions is null then '' else 'with (' || array_to_string(v.reloptions, ', ') || ')' end,
      v.definition
    );
    execute format('revoke all on %I.%I from public, anon, authenticated, service_role', v.schema_name, v.view_name);
    for g in
      select a.privilege_type, a.grantee
      from aclexplode(v.relacl) a
      join pg_class c on c.relname = v.view_name
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = v.schema_name
      where a.grantee <> c.relowner
    loop
      execute format(
        'grant %s on %I.%I to %s',
        g.privilege_type,
        v.schema_name,
        v.view_name,
        case when g.grantee = 0 then 'public' else quote_ident(g.grantee::regrole::text) end
      );
    end loop;
  end loop;
end;
$$;

drop table sale_rate_before;
drop table sale_rate_views;

create or replace view public.v_sales with (security_invoker = true) as
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
    c.id as customer_id, c.name as customer_name, c.phone as customer_phone, c.customer_type,
    s.sale_rate, s.area_sqft
  from public.sales s
  join public.v_batches b on b.id = s.batch_id
  join public.customers c on c.id = s.customer_id;

create or replace view public.v_chat_sales with (security_barrier = true) as
select
  s.id, s.bill_id, s.sale_date, s.quantity, s.sale_price, s.landed_cost,
  s.has_stickering, s.stickering_cost, s.stickering_price, s.payment_mode,
  s.created_at, s.updated_at,
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
  c.id as customer_id, 'C-' || left(c.id::text, 6) as customer_alias, c.customer_type,
  s.sale_rate, s.area_sqft
from public.sales s
join public.v_chat_batches b on b.id = s.batch_id
join public.customers c on c.id = s.customer_id
where (select public.is_member());

drop function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text);
drop function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text);
drop function private.record_sale_line(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text);
drop function private.validate_sale_input(date, integer, numeric, text, boolean, numeric, numeric, date);

create function private.validate_sale_input(
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
  perform private.validate_bill_header(p_sale_date, p_payment_mode);
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

create function private.record_sale_line(
  p_bill_id uuid,
  p_batch_id uuid,
  p_customer_id uuid,
  p_sale_date date,
  p_quantity integer,
  p_sale_rate numeric,
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
  v_area numeric;
begin
  select * into v_batch from public.batches where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  if v_batch.archived_at is not null then
    raise exception 'Batch % is archived; unarchive it to sell from it', v_batch.batch_code
      using errcode = 'check_violation';
  end if;

  v_area := v_batch.length_ft * v_batch.breadth_ft;

  perform private.validate_sale_input(
    p_sale_date,
    p_quantity,
    p_sale_rate,
    v_area,
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
    bill_id, sale_date, batch_id, customer_id, quantity, sale_rate, area_sqft, landed_cost,
    has_stickering, stickering_cost, stickering_price, payment_mode, notes
  ) values (
    p_bill_id, p_sale_date, p_batch_id, p_customer_id, p_quantity, p_sale_rate, v_area, v_batch.landed_cost,
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

create function public.record_sale(
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

  return private.record_sale_line(
    null, p_batch_id, p_customer_id, p_sale_date, p_quantity, p_sale_rate, p_payment_mode,
    p_has_stickering, p_stickering_cost, p_stickering_price, p_notes
  );
end;
$$;

create function public.correct_sale(
  p_sale_id uuid,
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
declare
  v_sale public.sales;
  v_old public.batches;
  v_new public.batches;
  v_area numeric;
begin
  perform private.require_admin();

  select * into v_sale from public.sales where id = p_sale_id for update;
  if v_sale.id is null then
    raise exception 'Unknown sale' using errcode = 'foreign_key_violation';
  end if;
  if v_sale.bill_id is not null
    and (p_customer_id is distinct from v_sale.customer_id
      or p_sale_date is distinct from v_sale.sale_date
      or p_payment_mode is distinct from v_sale.payment_mode) then
    raise exception 'Customer, sale date and payment mode come from the bill and cannot be changed on one of its sales'
      using errcode = 'check_violation';
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
    p_payment_mode,
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
    payment_mode = p_payment_mode,
    notes = nullif(trim(p_notes), '')
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

create or replace function public.record_bill(
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
      (v_line ->> 'sale_rate')::numeric,
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

revoke execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.record_sale(uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) to authenticated, service_role;
revoke execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) from public, anon;
grant execute on function public.correct_sale(uuid, uuid, uuid, date, integer, numeric, text, boolean, numeric, numeric, text) to authenticated, service_role;
