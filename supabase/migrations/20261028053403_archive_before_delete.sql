create or replace function public.delete_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_archived_at timestamptz;
  v_sales integer;
begin
  perform private.require_admin();
  select batch_code, archived_at into v_code, v_archived_at from public.batches where id = p_batch_id for update;
  if v_code is null then
    raise exception 'Unknown batch' using errcode = 'foreign_key_violation';
  end if;
  select count(*) into v_sales from public.sales where batch_id = p_batch_id;
  if v_sales > 0 then
    raise exception 'Batch % has % sale(s); correct or delete those first', v_code, v_sales
      using errcode = 'check_violation';
  end if;
  if v_archived_at is null then
    raise exception 'Archive batch % before deleting it', v_code
      using errcode = 'check_violation';
  end if;
  delete from public.batches where id = p_batch_id;
end;
$$;
