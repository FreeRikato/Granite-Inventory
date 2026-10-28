alter table public.batches disable trigger batches_check_size;

update public.batches
set unit_purchase_price = landed_cost,
    freight_cost = 0
where freight_cost > 0;

alter table public.batches enable trigger batches_check_size;
