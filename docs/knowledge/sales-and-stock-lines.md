---
code:
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911130000_customers_view.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - supabase/migrations/20261029200000_remove_misc_expense.sql
  - supabase/migrations/20261029210000_bills.sql
  - lib/margin.ts
  - lib/whatsapp.ts
  - app/(app)/customers/actions.ts
  - app/(app)/customers/[id]/page.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - tests/e2e/customers.spec.ts
  - tests/e2e/corrections.spec.ts
---
# Sales and Stock Lines

A Sale takes pieces from exactly one Batch ([ADR 0002](../adr/0002-sale-is-one-batch.md)). Sales are written only through `record_sale`, `record_bill` and the [[corrections]] functions; there is no insert, update or delete policy, so Available can never drift. `record_sale` and `record_bill` are security definer because operators may not update Batches directly, yet a sale must decrement one; the first statement of each is the member check ([[access-model]]).

## Bills

A Bill groups the Sales of one purchase: `bills` holds customer, sale date and payment mode, and `sales.bill_id` points at it (null for Sales recorded before Bills, and for `record_sale`). A Bill carries no money, so totals are always derived from its Sales and cannot disagree with them. Like `sales`, `bills` has a select policy for members and no write policy; only `record_bill` creates one.

`record_bill` takes its lines as jsonb and hands each to `private.record_sale_line`, the same function `record_sale` uses, so the Batch lock, archived refusal, input validation, availability check and Landed Cost snapshot exist once. It locks every line's Batch up front in id order, so two Bills sharing Batches in opposite orders cannot deadlock. Lines then run one after another inside the function's single transaction: a second line on the same Batch sees the first line's decrement, which is how quantities across lines are summed against Available, and any failure rolls the Bill and every earlier Sale back ([[readable-refusals]]). It refuses zero lines, and a missing or future date or a bad payment mode through `private.validate_bill_header`, before inserting anything, so those refusals read like `record_sale`'s and not like the `bills` table constraints, and returns the Bill and its Sales as one jsonb value.

## The customer page groups Sales by Bill

The page reads `v_sales` for the customer as before and `sales-rows.tsx` groups the rows by `bill_id` in the browser. A Bill becomes one collapsed row showing the date, the item count ("2 items", "1 item" for a one-line Bill) and the sum of its lines' totals; opening it lists the lines as the usual rows, each with its own Edit and Delete for Admins. A Sale with a null `bill_id` renders as a single row exactly as before. The Bill row takes the place of its newest line, so Bills and single Sales stay in date order together. Grouping needs no query of its own because a Bill holds no money and no fields beyond what its Sales already carry. Deleting the last line leaves no row to show because `delete_sale` removes the Bill with it ([[corrections]]).

## Stock Lines

Every Batch sharing product and size (Variant is ignored, [[batches]]), seen as one sellable item. The Sell form ([[sell-cart]]) picks a Stock Line and is offered its sellable Batches oldest first. Overview, Yard and Sell share one batches query that carries every Batch; the Sell view narrows it to sellable ones itself ([[browser-reads]]).

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
