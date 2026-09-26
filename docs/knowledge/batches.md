---
code:
  - supabase/migrations/20260911100000_stock.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - lib/domain.ts
  - lib/rpc-args.ts
  - app/(app)/inward/inward-form.tsx
  - app/(app)/inward/page.tsx
  - tests/e2e/inward.spec.ts
---
# Batches

Products, Variants, Suppliers and Batches arrive through the Inward form and `create_batch`. Categorical columns are text with check constraints, not enums, so values can change cheaply; `lib/domain.ts` holds the same vocabulary as TypeScript and its values must match those constraints.

## Batch Code

`{ABBR}-{DDMONYY}-{seq}`, for example `BP-27SEP26-01`. The abbreviation is the product's initials ("Black Pearl" gives "BP", "G20" stays "G20"). An advisory lock serialises two operators logging the same product on the same day, so the per-day sequence never collides. The date part is the IST purchase date ([[ist-calendar]]).

`preview_batch_code` shows the form the code the next save would get, without reserving it. It runs the same first guards as `create_batch` (unknown product, missing date) and refuses instead of returning null ([[readable-refusals]]).

The code is written on the physical stack, so [[corrections]] never change it.

## Size and slot

- Size (length and breadth) is required for Granite and Tiles and forbidden for Memorial. The rule needs the Product's category, so it lives in a trigger rather than a check constraint.
- The Inward form keeps Save Batch disabled for Granite until length and breadth are filled, the same way it waits for a supplier. A zero thickness deliberately keeps the button enabled, so the click shows which field is wrong.
- `suggest_slot()` picks the yard slot from category and length: Memorial goes to DOOM, 4 to 5 ft to 4FT, 5 to 6 ft to 5FT, anything else to CUSTOM. `lib/domain.ts` mirrors it so the form can preview the slot before saving.

## Variants on the fly

`create_batch` finds or creates the Variant by name. Two operators typing the same new name at once both land on the single row, thanks to the conflict clause on the case-insensitive index.

## RPC arguments

The create and correct functions take the same arguments, so `lib/rpc-args.ts` builds them once. Omitted size fields are `undefined`, not `null`, so PostgREST leaves them out and the SQL defaults apply.

The Inward page is a static shell; its lists and recent batches come from the browser cache ([[browser-reads]]).

Related: [[yard]], [[sales-and-stock-lines]].
