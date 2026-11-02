create function public.delete_bill(p_bill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform 1 from public.sales where bill_id = p_bill_id order by id for update;
  perform 1 from public.batches
    where id in (select batch_id from public.sales where bill_id = p_bill_id)
    order by id
    for update;
  perform 1 from public.bills where id = p_bill_id for update;
  if not found then
    raise exception 'Unknown bill' using errcode = 'foreign_key_violation';
  end if;
  update public.batches b
    set units_sold = b.units_sold - lines.quantity
    from (
      select batch_id, sum(quantity) as quantity
      from public.sales
      where bill_id = p_bill_id
      group by batch_id
    ) lines
    where b.id = lines.batch_id;
  delete from public.sales where bill_id = p_bill_id;
  delete from public.bills where id = p_bill_id;
end;
$$;

revoke execute on function public.delete_bill(uuid) from public, anon;
grant execute on function public.delete_bill(uuid) to authenticated, service_role;
