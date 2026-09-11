import { sql } from "../seam/harness";

/* A small yard used by the browser specs: two Black Pearl 4x2 batches (one stale, one fresh),
   one 5x3 batch and one Doom Stone batch. Dates are relative to today. */
export async function seedYard(): Promise<{ oldBatchId: string; newBatchId: string }> {
  await sql(`insert into public.suppliers (name) values ('Madurai Quarry') on conflict do nothing`);
  await sql(`insert into public.products (name, abbreviation, category) values
    ('Black Pearl', 'BP', 'GRANITE'), ('Jet Black', 'JB', 'GRANITE'), ('Doom Stone', 'DS', 'MEMORIAL')`);
  const rows = await sql<{ id: string; batch_code: string }>(`
    with s as (select id from public.suppliers where name = 'Madurai Quarry'),
    bp as (select id from public.products where name = 'Black Pearl'),
    jb as (select id from public.products where name = 'Jet Black'),
    ds as (select id from public.products where name = 'Doom Stone'),
    v as (
      insert into public.variants (product_id, name)
      select id, 'Grade 1' from bp union all select id, 'Premium' from jb union all select id, 'Std Cross' from ds
      returning id, product_id, name
    )
    insert into public.batches (batch_code, variant_id, supplier_id, purchase_date, length_ft, breadth_ft, thickness_mm, slot, initial_units, units_sold, unit_purchase_price, freight_cost)
    select 'BP-OLD-01', v.id, s.id, current_date - 232, 4, 2, 16, '4FT', 15, 8, 1400, 750 from v, s where v.name = 'Grade 1'
    union all
    select 'BP-NEW-01', v.id, s.id, current_date - 3, 4, 2, 16, '4FT', 10, 3, 1500, 0 from v, s where v.name = 'Grade 1'
    union all
    select 'JB-FIVE-01', v.id, s.id, current_date - 40, 5, 3, 20, '5FT', 6, 0, 2400, 0 from v, s where v.name = 'Premium'
    union all
    select 'DS-CROSS-01', v.id, s.id, current_date - 100, null, null, null, 'DOOM', 9, 0, 900, 0 from v, s where v.name = 'Std Cross'
    returning id, batch_code`);
  const find = (code: string) => rows.find((r) => r.batch_code === code)?.id ?? "";
  return { oldBatchId: find("BP-OLD-01"), newBatchId: find("BP-NEW-01") };
}
