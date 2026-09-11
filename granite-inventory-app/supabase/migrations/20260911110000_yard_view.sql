-- Ticket 03: the yard view. Age, Ageing Band, Sold Out and the Clamp gap are all derived here
-- from raw Batch facts and the two thresholds in settings; nothing is stored.

create or replace function public.ageing_band(p_age_days integer)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_age_days >= s.stale_after_days then 'STALE'
    when p_age_days >= s.ageing_after_days then 'AGEING'
    else 'FRESH'
  end
  from public.settings s;
$$;

revoke execute on function public.ageing_band(integer) from public, anon;
grant execute on function public.ageing_band(integer) to authenticated, service_role;

create or replace view public.v_yard_batches with (security_invoker = true) as
  with base as (
    select
      b.*,
      (current_date - b.purchase_date)::integer as age_days,
      lag(b.purchase_date) over (
        partition by b.variant_id, b.length_ft, b.breadth_ft, b.thickness_mm
        order by b.purchase_date, b.created_at
      ) as previous_purchase_date
    from public.v_batches b
  )
  select
    base.*,
    public.ageing_band(base.age_days) as ageing_band,
    (base.available = 0) as sold_out,
    (base.purchase_date - base.previous_purchase_date)::integer as days_since_previous
  from base;
