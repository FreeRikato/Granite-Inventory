---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - supabase/migrations/20260911100000_stock.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - supabase/migrations/20261026184634_stock_line_without_variant.sql
  - lib/schemas/batch.ts
  - supabase/migrations/20261026190835_batch_stack_number.sql
  - supabase/migrations/20261029100000_fold_freight_into_price.sql
  - supabase/migrations/20261029110000_batch_total_cost.sql
  - supabase/migrations/20261029130000_price_per_sqft.sql
  - lib/format.ts
  - tests/tooling/format.test.ts
  - app/(app)/inward/recent-batches.tsx
  - lib/domain.ts
  - lib/rpc-args.ts
  - app/(app)/inward/inward-form.tsx
  - app/(app)/inward/page.tsx
  - components/yard/batch-actions.tsx
  - tests/e2e/inward.spec.ts
  - tests/seam/batch-form-path.test.ts
  - tests/seam/batch-total-cost.test.ts
---
# Batches

Products, Suppliers and Batches arrive through the Inward form and `create_batch`. Categorical columns are text with check constraints, not enums, so values can change cheaply; `lib/domain.ts` holds the same vocabulary as TypeScript and its values must match those constraints.

## Batch Code

`{ABBR}-{DDMONYY}-{seq}`, for example `BP-27SEP26-01`. The abbreviation is the product's initials ("Black Pearl" gives "BP", "G20" stays "G20"). An advisory lock serialises two operators logging the same product on the same day, so the per-day sequence never collides. The date part is the IST purchase date ([[ist-calendar]]).

`preview_batch_code` shows the form the code the next save would get, without reserving it. It runs the same first guards as `create_batch` (unknown product, missing date) and refuses instead of returning null ([[readable-refusals]]).

The code is written on the physical stack, so [[corrections]] never change it.

## Size and slot

- Size (length and breadth) is required for Granite and Tiles and forbidden for Memorial. The rule needs the Product's category, so it lives in a trigger rather than a check constraint.
- The Inward form keeps Save Batch disabled for Granite until length and breadth are filled, the same way it waits for a supplier. A zero thickness deliberately keeps the button enabled, so the click shows which field is wrong.
- `suggest_slot()` picks the yard slot from category and length: Memorial goes to DOOM, 4 to 5 ft to 4FT, 5 to 6 ft to 5FT, anything else to CUSTOM. `lib/domain.ts` mirrors it so the form can preview the slot before saving.
- Slot is free text, so a yard can name its own areas ("Back Row"). The built-in codes stay as stored values and `slotLabel` shows them as "4 ft Slot" and so on; a typed slot is shown as written. `batches_slot_shape` keeps it trimmed and 1 to 20 characters, and `validate_batch_input` refuses a longer one with readable copy first. A blank slot counts as none, so the size suggestion applies. `slotChoices` lists the built-ins first, then typed slots alphabetically, for every slot picker and the yard order.
- The inward stack picker keys each option by `JSON.stringify([slot, number])`, because a typed slot may contain any character, including the `|` the old key used.
- `create_batch` refuses an archived Product or Supplier; `correct_batch` refuses only a change onto one, so editing an old Batch whose Supplier was archived still works (`private.refuse_archived_lists`).

## Stack (Batch number)

A Stack is the pile a Batch is put on, named by a Slot plus a typed number; screens call the number "Batch number" because that is the client's word, and call the Batch Code "Purchase code" so the two never read alike (`CONTEXT.md`). It is a raw column on `batches` rather than its own table: a pile has no facts of its own beyond its slot and number, so `v_recent_stacks` derives the recently used pairs for the inward picker.

- `create_batch` and `correct_batch` take `p_stack_number` last with a null default, so the PostgREST argument matching still works for callers that omit it. Adding the argument meant dropping and recreating both functions; a second overload would make calls without it ambiguous.
- `private.normalize_stack_number` trims and refuses more than 20 characters with readable copy before the `batches_stack_number_shape` check can fire ([[readable-refusals]]). `create_batch` refuses a blank number; `correct_batch` treats a blank as "keep the current one", so editing an older Batch never forces one in.
- `v_yard_batches` selects `b.*` from `v_batches`, so adding `stack_number` to `v_batches` meant dropping and recreating it; `create or replace` cannot insert a column ahead of the ones it adds.
- In the inward form the slot comes from the chosen pair. The size-based suggestion now only seeds the slot in the Add dialog.

## Freight is part of the price

The client adds freight into the Unit Purchase Price themselves, so neither the Inward form nor the Edit dialog asks for a Freight Cost, and `batchSchema` and `batchRpcArgs` no longer carry it. `create_batch` then takes its default 0, and `correct_batch` writes `coalesce(p_freight_cost, 0)`, so an edit from the app leaves freight at 0 and Landed Cost comes from the price alone (see Price per square foot). The column and the `p_freight_cost` parameter stay so the database rules (non-negative, spread over the pieces into `landed_cost`) keep working for any caller that still sends it; the seam tests that call the raw RPCs with freight still cover that.

`20261029100000_fold_freight_into_price.sql` runs once: for every Batch with freight it sets `unit_purchase_price = landed_cost` and `freight_cost = 0`. `landed_cost` is already rounded to paise, so it comes out unchanged; Sales hold their own snapshot and are not touched. The statement runs with `batches_check_size` disabled and enables it again right after: the fold only moves money between two columns, and an admin may have changed a Product's category in Settings after the Batch was inwarded (a sized Batch under a Product that is now Memorial, or the reverse), which would make the size rule abort the whole migration and the deploy. A Batch with no freight is not matched, so its `updated_at` stays. `tests/seam/batch-form-path.test.ts` drives the form path (`batchSchema`, `batchRpcArgs`, then the RPC) to show a stray `freightCost` in the payload is ignored.

## Price per square foot

Granite and Tiles are bought by the square foot, so for a sized Batch the Unit Purchase Price is a rate per sq ft and `landed_cost` (still per piece) is `round(coalesce(length_ft * breadth_ft, 1) * unit_purchase_price + freight_cost / initial_units, 2)`. Memorial has no Size, so the `coalesce` keeps its price per piece. Keeping Landed Cost per piece is what lets the Sell form, margins, `v_sales` and inventory value carry on unchanged: they already multiply Landed Cost by pieces, and the Sale Price stays per piece.

`20261029130000_price_per_sqft.sql` runs once:

- A generated column cannot change type or expression in place while its inputs change type, so it drops `landed_cost`, widens `unit_purchase_price` to `numeric(22, 10)`, divides every sized Batch's stored per-piece price by its Area, and adds `landed_cost` back with the new expression. Ten decimals keep `Area * rate` within a paisa of the old price for any Size the columns allow, and twelve integer digits leave room for a high price on a tiny piece.
- It snapshots every `landed_cost` first and raises if any differs afterwards, so a rounding surprise aborts the deploy instead of shifting inventory value. Sales hold their own snapshots and are untouched.
- `batches_check_size` and `batches_set_updated_at` are off during the update, for the same reason as the freight fold and so the conversion does not look like an edit.
- Every view that reads `batches`, directly or through another view, blocks the type change. The migration finds them through `pg_depend`, saves each definition, `reloptions` and grants, drops them deepest first and recreates them shallowest first with the same grants. It names no view, so a view added on another branch (the chat views) survives whichever order the branches merge in.
- `private.validate_batch_input` refuses a price whose Landed Cost would overflow `numeric(12, 2)` with "Landed Cost per piece is too large" ([[readable-refusals]]); the Size and price caps alone no longer bound it. The check rounds the sides and the result to the same places the columns store, so a price that only reaches ₹1,000 crore once rounded to paise is refused too.
- Whether a price is per sq ft or per piece follows the Batch's own Size, not its Product's category. A Product whose category an admin changes after inwarding keeps Batches of the other kind; editing such a Batch makes the dialog follow the new category and drop or ask for the Size, while the stored price stays the same number, so its Landed Cost changes by the Area. Known edge, left as is: re-enter the price when correcting such a Batch.
- Deploy order: Vercel deploys on merge while production migrations are pushed by hand ([environments](../environments.md)). A Batch saved between the two is converted twice (new app, old schema) or read as per piece (old app, new schema). Push the migration and merge back to back, with nobody inwarding in between.

The Inward form and the Edit dialog show a read-only Area (sq ft) box after Breadth, `formatArea(length, breadth)`, blank until both are above zero. It rounds each side to hundredths first, as `numeric(5, 2)` stores them (half away from zero, so `2.335` is `2.34`, through an exponent string to dodge binary rounding), so the box shows the Area the cost uses; the product is shown to four places. The price hint reads "Per sq ft" for sized products and "Per piece" for Memorial. A converted price may show up to ten decimals in the Edit dialog.

## Total cost

Recent batches shows what a whole Batch cost next to the per-piece Landed cost, so nobody multiplies by Pieces by hand. `v_batches.total_cost` is `initial_units * landed_cost`, so it always equals Pieces times the Landed cost in the next column even when a rate has many decimals; it was last redefined in `20261029130000_price_per_sqft.sql` (first appended by `20261029110000_batch_total_cost.sql`; `create or replace view` can only append). It is derived, not stored: Landed Cost already spreads any `freight_cost` over the pieces, so a Batch inserted with freight reads its true cost to the paisa per piece, and an archived Batch keeps its value because the view does not filter on `archived_at`. `RecentBatches` renders it with `formatRupees`, right-aligned with tabular figures, and the table keeps its sideways scroll on phones. `tests/seam/batch-total-cost.test.ts` covers a sized Batch, a rate with many decimals, a Memorial Batch, freight, an archived row and both overflow refusals; `tests/e2e/inward.spec.ts` checks the Area box, the column order and the figures. Seam and e2e fixtures that hand-check margins enter the per sq ft rate that gives their old per-piece cost (₹181.25 on 4 × 2 ft is ₹1,450 a piece).

## Hidden Variants

Variant is hidden from every screen but still stored, so the RPCs keep their `p_variant_name` argument. `lib/schemas/batch.ts` defaults it to `DEFAULT_VARIANT` ("Standard"), so a new Batch lands on its Product's Standard Variant. `create_batch` finds or creates the Variant by name; two saves creating the same name at once both land on the single row, thanks to the conflict clause on the case-insensitive index. The Edit dialog sends the Batch's own Variant back while the Product is unchanged, so a correction never moves old stock off "Grade 1"; moving a Batch to another Product puts it on that Product's Standard Variant.

The views group by Product and Size, never by Variant, so old and new stock of one size read as one Stock Line (`20261026184634_stock_line_without_variant.sql`). The same migration makes `variants.product_id` cascade, so deleting a Product with no Batches also removes Variants nobody can see any more.

## RPC arguments

The create and correct functions take the same arguments, so `lib/rpc-args.ts` builds them once. Omitted size fields are `undefined`, not `null`, so PostgREST leaves them out and the SQL defaults apply.

The Inward page is a static shell; its lists and recent batches come from the browser cache ([[browser-reads]]).

Related: [[yard]], [[sales-and-stock-lines]].
