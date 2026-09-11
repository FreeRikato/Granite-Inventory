-- Development seed. The Admin email is swapped for the client's before handover.
insert into public.team_members (email, name, role)
values ('aravinthanrc@gmail.com', 'Aravinthan', 'ADMIN')
on conflict (email) do nothing;

insert into public.settings (id) values (true) on conflict (id) do nothing;

insert into public.customers (name, customer_type, is_walk_in)
values ('Walk-in Customer', 'RETAIL', true)
on conflict do nothing;
