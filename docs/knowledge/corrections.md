---
code:
  - supabase/migrations/20260911160000_corrections.sql
  - supabase/migrations/20260912190000_correction_hardening.sql
  - app/(app)/settings/actions.ts
  - app/(app)/settings/admin-lists.tsx
  - components/yard/batch-actions.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
  - tests/seam/corrections.test.ts
---
# Corrections

Admin-only edits and deletes of Batches and Sales that keep Available consistent. The functions are security definer so they can move the batch counters, and the first line of each is the Admin check ([[access-model]]).

## Rules

- The Batch Code is kept on edit: it is written on the physical stack ([[batches]]).
- Editing a sale locks both batches (old and new) in a fixed order, so two corrections cannot deadlock. It gives the old pieces back first, then takes the new quantity from the possibly same batch.
- A sale keeps the landed-cost snapshot it was recorded at. The snapshot moves only when the sale moves to another batch.
- A Batch cannot be deleted while it has sales; the database refuses, so the yard card simply hides Delete in that case.
- Products, Variants and Suppliers (the three lists that grow from the Inward form) can be renamed in Settings. Deleting one is refused by the database while Batches reference it.

## Validation order

The correction functions share the readable validation path of new writes ([[readable-refusals]]). `record_sale` checks customer and batch existence before the other inputs, so an unknown customer is reported ahead of a quantity or price error. `correct_sale` validates the inputs first and checks the customer last.

## UI

The Admin edit and delete live on the yard card (`batch-actions.tsx`) and the customer detail page (`sale-actions.tsx`). Both hand focus back through [[focus-after-write]], because a save can move the edited row out of view. The Sale edit dialog offers the current batch plus any with stock, so a sale can move to the right pile.

Related: [[sales-and-stock-lines]], [[yard]].
