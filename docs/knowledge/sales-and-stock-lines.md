---
code:
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911130000_customers_view.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - supabase/migrations/20261029170000_remove_misc_expense.sql
  - lib/margin.ts
  - lib/whatsapp.ts
  - app/(app)/customers/actions.ts
  - app/(app)/sell/sell-view.tsx
  - app/(app)/sell/sell-form.tsx
  - app/(app)/customers/[id]/page.tsx
  - tests/e2e/customers.spec.ts
---
# Sales and Stock Lines

A Sale takes pieces from exactly one Batch ([ADR 0002](../adr/0002-sale-is-one-batch.md)). Sales are written only through `record_sale` and the [[corrections]] functions; there is no insert, update or delete policy, so Available can never drift. `record_sale` is security definer because operators may not update Batches directly, yet a sale must decrement one; its first statement is the member check ([[access-model]]).

## Stock Lines

Every Batch sharing product and size (Variant is ignored, [[batches]]), seen as one sellable item. The Sell form picks a Stock Line and is offered its sellable Batches oldest first. Overview, Yard and Sell share one batches query that carries every Batch; the Sell view narrows it to sellable ones itself ([[browser-reads]]).

## Customers

- Phone identifies a customer in this trade. Phones are compared on their last ten digits, so "+91 98765 43210" and "9876543210" collide as they should.
- Saving a customer with a phone already on file selects that customer instead of creating a duplicate.
- A customer created from the Sell form is selectable at once. The browser cache catches up on its own refetch and then carries them too, so the form merges both lists de-duplicated by id, with the locally added copy winning.
- `v_customers` adds each customer's derived purchase history.
- Only one Walk-in Customer may exist. A second insert is refused with readable copy before the `customers_one_walk_in` unique index can name itself in the error; the index stays as the backstop for two concurrent inserts ([[readable-refusals]]).
- WhatsApp links need digits only with the country code; Indian numbers without one get +91.

## Margin

`v_sales` derives the money. Sell and Edit sale take no Misc Expense: the 20261029200000 migration dropped it from `record_sale`, `correct_sale` and `v_sales`, while the `sales.misc_expense` column stays so old values are never lost, and new Sales store its default 0. `lib/margin.ts` mirrors the same math so the Sell form can show margin live before saving. The colour is green above 25 percent, red below 10 and amber between, from the meeting brief. `validate_sale_input` also refuses a NaN or infinite sale price or stickering amount, which would pass the zero-or-more checks and turn every revenue and margin sum into NaN. The date and payment-mode refusals live in `private.validate_bill_header`, shared by `validate_sale_input` and `record_bill` ([[readable-refusals]]).

The customer page shows each sale's Margin % through `formatPercent`, one decimal like Sell Stone and the dashboard.

Related: [[batches]], [[dashboard]].
