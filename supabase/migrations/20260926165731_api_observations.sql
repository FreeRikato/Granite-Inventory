create or replace function public.preview_batch_code(p_product_id uuid, p_date date)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_date is null then
    raise exception 'Purchase date is required' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Unknown product' using errcode = 'foreign_key_violation';
  end if;
  return private.next_batch_code(p_product_id, p_date);
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
  if new.is_walk_in and exists (select 1 from public.customers where is_walk_in and id <> new.id) then
    raise exception 'Only one Walk-in Customer is allowed' using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;
