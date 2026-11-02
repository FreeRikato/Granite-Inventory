alter table public.products add column image_path text;
alter table public.products add constraint products_image_path_own
  check (image_path is null or starts_with(image_path, id::text || '/'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

create or replace view public.v_public_catalog as
select
  p.id || '|' || coalesce(b.length_ft::text, '') || '|' || coalesce(b.breadth_ft::text, '') || '|' ||
    coalesce(b.thickness_mm::text, '') as line_key,
  p.name as product_name,
  p.category,
  b.length_ft,
  b.breadth_ft,
  b.thickness_mm,
  sum(b.initial_units - b.units_sold)::integer as available,
  p.image_path
from public.batches b
join public.variants v on v.id = b.variant_id
join public.products p on p.id = v.product_id
where exists (select 1 from public.settings s where s.catalog_public)
  and b.archived_at is null
group by p.id, b.length_ft, b.breadth_ft, b.thickness_mm, p.name, p.category, p.image_path
having sum(b.initial_units - b.units_sold) > 0;
