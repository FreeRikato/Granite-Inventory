-- Ticket 05: customers with their derived purchase history.

create view public.v_customers with (security_invoker = true) as
  select
    c.id, c.name, c.phone, c.customer_type, c.is_walk_in, c.created_at, c.updated_at, c.updated_by,
    (select max(s.sale_date) from public.sales s where s.customer_id = c.id) as last_purchase_date,
    (select count(*) from public.sales s where s.customer_id = c.id)::integer as sale_count,
    (select coalesce(sum(s.quantity * (s.sale_price + s.stickering_price)), 0)
       from public.sales s where s.customer_id = c.id) as lifetime_revenue
  from public.customers c;
