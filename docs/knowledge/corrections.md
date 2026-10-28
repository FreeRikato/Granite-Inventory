---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - tests/seam/archive.test.ts
  - tests/e2e/archive.spec.ts
  - supabase/migrations/20260911160000_corrections.sql
  - supabase/migrations/20260912190000_correction_hardening.sql
  - app/(app)/settings/actions.ts
  - app/(app)/settings/admin-lists.tsx
  - components/yard/batch-actions.tsx
  - components/confirm-delete.tsx
  - app/(app)/inward/recent-batches.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
  - tests/seam/corrections.test.ts
---
# Corrections

Admin-only edits and deletes of Batches and Sales that keep Available consistent. The functions are security definer so they can move the batch counters, and the first line of each is the Admin check ([[access-model]]).

## Rules

- The Batch Code is kept on edit: it is written on the physical stack ([[batches]]).
- Editing a sale locks both batches (old and new) in a fixed order, so two corrections cannot deadlock. It gives the old pieces back first, then takes the new quantity from the possibly same batch.
- A sale keeps the landed-cost snapshot it was recorded at. The snapshot moves only when the sale moves to another batch.
- A Batch cannot be deleted while it has sales; the database refuses, so the yard card simply hides Delete in that case. Archive is the way out for a Batch with sales: `archive_batch` stamps `archived_at` (a raw fact; clearing it unarchives) and every stock figure filters on it, while Sales keep pointing at the Batch. `record_sale` refuses an archived Batch, and `correct_sale` refuses only moving a Sale onto one, so a past Sale on it can still be fixed.
- Products and Suppliers carry the same `archived_at`. Admins write it straight through the existing update policy (`archiveRowAction`), so it needs no function. Archived rows leave the Inward pickers but stay in the Settings list, which unarchives them; the Yard Edit dialog still offers a Batch's own archived Product or Supplier.
- Products and Suppliers (the lists that grow from the Inward form) can be renamed in Settings. Deleting one is refused by the database while Batches reference it. Variants are hidden ([[batches]]), so they have no list.

## Validation order

The correction functions share the readable validation path of new writes ([[readable-refusals]]). `record_sale` checks customer and batch existence before the other inputs, so an unknown customer is reported ahead of a quantity or price error. `correct_sale` validates the inputs first and checks the customer last.

## UI

The Admin edit and delete live on the yard card (`batch-actions.tsx`), the Recent batches table on Inward and the customer detail page (`sale-actions.tsx`). On Recent batches the same actions render as pencil and trash icons at the row's right edge; on desktop they appear on hover or keyboard focus, on mobile (no hover) they are always shown. The actions header cell is `relative` so its screen-reader-only label stays inside the table's horizontal scroll area; without it the absolutely positioned label widens the whole page on mobile. Archive and Unarchive sit next to Edit in both places. Both hand focus back through [[focus-after-write]], because a save can move the edited row out of view.

On Inward, Admins also get Edit, Archive and Delete on each Supplier and Product option inside the picker ([[search-select]]). Edit reuses the Add dialog with the row's values (an edit never re-suggests the abbreviation); Delete asks first and shows the database's refusal, which suggests archiving, if a Batch still uses the row. The form keeps its own copy of both lists (so a just-added row is selectable at once), so these actions update that copy and clear the selection when the selected row goes away. The Sale edit dialog offers the current batch plus any with stock, so a sale can move to the right pile.

Related: [[sales-and-stock-lines]], [[yard]].
