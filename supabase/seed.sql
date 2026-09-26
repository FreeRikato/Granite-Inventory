insert into public.team_members (email, name, role)
values ('aravinthanrc@gmail.com', 'Aravinthan', 'ADMIN')
on conflict (email) do nothing;

insert into public.settings (id) values (true) on conflict (id) do nothing;

insert into public.customers (name, customer_type, is_walk_in)
select 'Walk-in Customer', 'RETAIL', true
where not exists (select 1 from public.customers where is_walk_in);
