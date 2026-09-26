---
code:
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911130000_customers_view.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - lib/margin.ts
  - lib/whatsapp.ts
  - app/(app)/customers/actions.ts
  - app/(app)/sell/sell-view.tsx
  - app/(app)/sell/sell-form.tsx
---
# Sales and Stock Lines

A Sale takes pieces from exactly one Batch ([ADR 0002](../adr/0002-sale-is-one-batch.md)). Sales are written only through `record_sale` and the [[corrections]] functions; there is no insert, update or delete policy, so Available can never drift. `record_sale` is security definer because operators may not update Batches directly, yet a sale must decrement one; its first statement is the member check ([[access-model]]).

## Stock Lines

Every Batch sharing product, variant and size, seen as one sellable item. The Sell form picks a Stock Line and is offered its sellable Batches oldest first. Overview, Yard and Sell share one batches query that carries every Batch; the Sell view narrows it to sellable ones itself ([[browser-reads]]).

## Customers

- Phone identifies a customer in this trade. Phones are compared on their last ten digits, so "+91 98765 43210" and "9876543210" collide as they should.
- Saving a customer with a phone already on file selects that customer instead of creating a duplicate.
- A customer created from the Sell form is selectable at once. The browser cache catches up on its own refetch and then carries them too, so the form merges both lists de-duplicated by id, with the locally added copy winning.
- `v_customers` adds each customer's derived purchase history.
- Only one Walk-in Customer may exist. A second insert is refused with readable copy before the `customers_one_walk_in` unique index can name itself in the error; the index stays as the backstop for two concurrent inserts ([[readable-refusals]]).
- WhatsApp links need digits only with the country code; Indian numbers without one get +91.

## Margin

`v_sales` derives the money. Margin excludes misc expense by design: it is tracked but never part of margin. `lib/margin.ts` mirrors the same math so the Sell form can show margin live before saving. The colour is green above 25 percent, red below 10 and amber between, from the meeting brief.

Related: [[batches]], [[dashboard]].
