---
code:
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911130000_customers_view.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - supabase/migrations/20261029200000_remove_misc_expense.sql
  - supabase/migrations/20261029210000_bills.sql
  - supabase/migrations/20261030100000_sale_rate.sql
  - supabase/migrations/20261102100000_stickering_rate.sql
  - lib/margin.ts
  - lib/sale-price.ts
  - tests/seam/sale-rate.test.ts
  - tests/seam/stickering-rate.test.ts
  - tests/tooling/sale-price.test.ts
  - lib/whatsapp.ts
  - app/(app)/customers/actions.ts
  - app/(app)/customers/[id]/page.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - tests/e2e/customers.spec.ts
  - tests/e2e/corrections.spec.ts
---
# Sales and Stock Lines

A Sale takes pieces from exactly one Batch ([ADR 0002](../adr/0002-sale-is-one-batch.md)). Sales are written only through `record_sale`, `record_bill` and the [[corrections]] functions; there is no insert, update or delete policy, so Available can never drift. `record_sale` and `record_bill` are security definer because operators may not update Batches directly, yet a sale must decrement one; the first statement of each is the member check ([[access-model]]).

## The Sale Rate

A Sale stores what was typed, not the per piece price: `sale_rate` (per sq ft for sized stone, per piece for Memorial) and `area_sqft`, the Area of one piece when it was sold. `sale_price` is a stored generated column, `round(coalesce(area_sqft, 1) * sale_rate, 2)`, the same shape as `landed_cost` ([[batches]]). Keeping the name and the per piece meaning is what lets `v_sales`, the dashboard, Lifetime revenue, margins and Ask carry on reading `sale_price` unchanged. The Area is stored on the Sale, not read back from the Batch, because an Edit batch that changes a size must not reprice a Sale that was already made; `private.record_sale_line` copies it from the locked Batch, and `correct_sale` keeps it while the Batch stays the same and takes the new Batch's when it moves, the rule Landed Cost already follows ([[corrections]]).

`private.validate_sale_input` refuses a missing, NaN or infinite, or negative rate with "Sale rate ..." messages, and a rate whose derived per piece price would reach ₹1,000 crore ("Sale Price per piece is too large"), checked on the same `round(..., 10)` and `round(..., 2)` the column applies so nothing that passes can overflow `numeric(12,2)` after the insert. `record_sale` and `correct_sale` take `p_sale_rate` and the old `p_sale_price` signatures were dropped, so PostgREST cannot match an old caller to anything.

The 20261030100000 migration moved every earlier Sale over: `sale_rate = round(sale_price / coalesce(area, 1), 10)` with the Area read from its Batch. It rebuilds the views that depend on `sales` through the `pg_depend` walk the purchase side used, keeps their options and grants, and raises if any Sale's `sale_price` differs from what it was, so revenue and margin cannot move silently. Ten decimals are enough that `rate x area` rounds back to the same paise for every stored price.

The client mirrors the derivation in `lib/sale-price.ts` (`pieceArea`, `salePricePerPiece`) so the Sell preview shows what the database will store. It rounds a half paise up despite float noise, as Postgres does; the value stored is always the database's.

## The Stickering rates

Stickering is priced the way the stone is: Area times a rate times pieces, the client's formula for the engraving service. A Sale stores `stickering_rate` (what the Customer pays per sq ft) and `stickering_cost_rate` (what the engraver is paid per sq ft), and `stickering_price` and `stickering_cost` became stored generated columns, `round(coalesce(area_sqft, 1) * rate, 2)`, over the same `area_sqft` snapshot the Sale Rate uses. Both amounts are rates so the Stickering Margin compares like with like: a per sq ft price against a per piece cost would turn a ₹40 per sq ft engraver bill typed as ₹40 into a large negative margin. Keeping the column names and their per piece meaning is what lets `v_sales`, Margin, the dashboard and Ask carry on unchanged; the views only gained the two rate columns. A Memorial has no Area, so its rates are per piece, as its Sale Rate is.

`private.validate_sale_input` keeps its Stickering sentences and adds "Stickering Price per piece is too large" and "Stickering Cost per piece is too large", checked on the same `round(..., 10)` and `round(..., 2)` the generated columns apply so nothing that passes can overflow `numeric(12,2)` after the insert. `record_sale`, `correct_sale` and the `record_bill` lines take `stickering_cost_rate` and `stickering_rate`; the per piece argument names were dropped with their signatures, so PostgREST cannot match an old caller to anything. `correct_sale` re-derives both figures from the Sale's kept Area, or the new Batch's Area when the Batch moves ([[corrections]]).

The 20261102100000 migration converted every earlier Sale with `rate = round(amount / coalesce(area_sqft, 1), 10)` and raises if any Sale's Stickering Cost or Stickering Price differs afterwards, the same guard the Sale Rate migration used. It drops and rebuilds the dependent views through the same `pg_depend` walk. `stickering-rate.test.ts` checks that the conversion formula gives back every stored paise, that a converted Sale keeps its Stickering Margin, and that the worked example (4 pieces of 5 × 3 ft at ₹60 and ₹40 per sq ft) stores 900 and 600 per piece.

The client mirrors the derivation with `pricePerPiece` in `lib/sale-price.ts`, which stone and Stickering both use.

## Bills

A Bill groups the Sales of one purchase: `bills` holds customer and sale date, `bill_payments` holds how it was paid ([[bill-payments]]), and `sales.bill_id` points at it (null for Sales recorded before Bills, and for `record_sale`). A Bill carries no money, so totals are always derived from its Sales and cannot disagree with them. Like `sales`, `bills` has a select policy for members and no write policy; only `record_bill` creates one.

`record_bill` takes its lines as jsonb and hands each to `private.record_sale_line`, the same function `record_sale` uses, so the Batch lock, archived refusal, input validation, availability check and Landed Cost snapshot exist once. It locks every line's Batch up front in id order, so two Bills sharing Batches in opposite orders cannot deadlock. Lines then run one after another inside the function's single transaction: a second line on the same Batch sees the first line's decrement, which is how quantities across lines are summed against Available, and any failure rolls the Bill and every earlier Sale back ([[readable-refusals]]). It refuses zero lines, and a missing or future date through `private.validate_sale_date`, before inserting anything, so those refusals read like `record_sale`'s and not like the `bills` table constraints; the Payment Split is checked after the lines are in, against their real total ([[bill-payments]]). It returns the Bill, its Sales and its payments as one jsonb value.

## The customer page groups Sales by Bill

The page reads `v_sales` for the customer as before and `sales-rows.tsx` groups the rows by `bill_id` in the browser. A Bill becomes one collapsed row showing the date, the item count ("2 items", "1 item" for a one-line Bill) and the sum of its lines' totals; opening it lists the lines as the usual rows, each with its own Edit and Delete for Admins. A Sale with a null `bill_id` renders as a single row exactly as before. The Bill row takes the place of its newest line, so Bills and single Sales stay in date order together. Grouping needs no query of its own because a Bill holds no money and no fields beyond what its Sales already carry. Deleting the last line leaves no row to show because `delete_sale` removes the Bill with it ([[corrections]]).

Every Sale row spells out its working under the stone name, nested Bill lines included: `formatSaleLine` is fed the row's `quantity`, `area_sqft`, `sale_rate` and the view's `stone_total` (the browser never re-derives the total), so a sized Sale reads `10 × 8 sq ft × ₹250/sq ft = ₹20,000` and a Memorial one `10 × ₹2,000 = ₹20,000`, and, when the Sale has Stickering, a second line under it, `Stickering 10 × 8 sq ft × ₹60/sq ft = ₹4,800` (`Stickering 3 × ₹250 = ₹750` for Memorial), built by `formatStickeringLine` from `stickering_rate` and the view's `stickering_total`. The old suffix ` + ₹300 stickering` is gone: it was a per piece figure that read like a total. Both formatters are the ones the Sell cart uses ([[sell-cart]]), so the lines a customer saw at the counter are the lines in their history.

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

`v_sales` derives the money. Sell and Edit sale take no Misc Expense: the 20261029200000 migration dropped it from `record_sale`, `correct_sale` and `v_sales`, while the `sales.misc_expense` column stays so old values are never lost, and new Sales store its default 0. `lib/margin.ts` mirrors the same math so the Sell form can show margin live before saving. The colour is green above 25 percent, red below 10 and amber between, from the meeting brief. `validate_sale_input` also refuses a NaN or infinite sale rate or stickering amount, which would pass the zero-or-more checks and turn every revenue and margin sum into NaN. The date and payment-mode refusals live in `private.validate_bill_header`, used by `record_sale` and by `validate_sale_input` for a Sale without a Bill; a Bill line passes a null mode and only its date is checked, by `private.validate_sale_date` ([[readable-refusals]]).

The customer page shows each sale's Margin % through `formatPercent`, one decimal like Sell Stone and the dashboard.

Related: [[batches]], [[dashboard]].
