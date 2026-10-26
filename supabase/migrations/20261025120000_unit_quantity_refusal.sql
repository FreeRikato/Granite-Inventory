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
  if p_slot is not null and p_slot not in ('4FT', '5FT', 'DOOM', 'CUSTOM') then
    raise exception 'Slot must be 4FT, 5FT, DOOM or CUSTOM' using errcode = 'check_violation';
  end if;
end;
$$;
