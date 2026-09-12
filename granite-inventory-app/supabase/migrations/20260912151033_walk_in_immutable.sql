create or replace function private.prevent_walk_in_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_walk_in is distinct from old.is_walk_in then
    raise exception 'The Walk-in Customer flag cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger customers_prevent_walk_in_change
  before update on public.customers
  for each row execute function private.prevent_walk_in_change();
