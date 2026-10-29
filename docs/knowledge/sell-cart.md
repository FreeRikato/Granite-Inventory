---
code:
  - app/(app)/sell/sell-view.tsx
  - app/(app)/sell/sell-form.tsx
  - app/(app)/sell/cart.ts
  - app/(app)/sell/area-card.tsx
  - app/(app)/sell/split-dialog.tsx
  - lib/format.ts
  - app/(app)/sell/actions.ts
  - lib/schemas/sale.ts
  - lib/rpc-args.ts
  - tests/e2e/sell.spec.ts
  - tests/tooling/format.test.ts
  - tests/e2e/sell-and-lists.spec.ts
  - tests/e2e/responsive.spec.ts
  - tests/e2e/accessibility.spec.ts
  - tests/seam/api-observations.test.ts
  - tests/tooling/cart.test.ts
---
# Sell cart

Sell Stone builds an order before it records anything. Customer, Sale Date and Payment Mode are chosen once at the top; below them the user picks a Stock Line and Batch, quantity, price per piece and stickering, then presses "Add to order". "This order" lists the lines with a count such as "2 lines · 9 pieces", and one Record Sale press sends every line to `record_bill` ([[sales-and-stock-lines]]), which saves all of them or none.

## The cart lives in the browser until Record Sale

Nothing is written when a line is added, so removing a line, or leaving the page, costs nothing and no Sale has to be corrected afterwards. `cart.ts` holds the rules as plain functions over a list of lines; `sell-form.tsx` keeps the list in state and renders it. While Record Sale is pending, Add to order and the remove controls are disabled: the submit sends the cart as it was when the button was pressed and clears the whole cart when it succeeds, so a line added or removed in that window would be recorded without it or silently dropped.

## Merging

Adding a line merges into an existing one only when the Batch, the price per piece and the stickering (cost and price, or none on both) are all the same; quantities add. A different price stays a separate line because each line becomes one Sale at one price. Stickering counts in the comparison because merging a line with stickering into one without would change what the customer is charged.

## Available counts the cart

Every available figure on the form is the database figure minus the pieces already in the cart: the Product option hints, the Batch list, the quantity hint and the check made when a line is added. Without it a second line could promise stone the first line already took. Choosing a Product selects its oldest Batch that still has pieces after the cart; a Batch the cart has used up stays listed at 0 available.

Asking for more than the chosen Batch has left (after the cart) opens the split modal instead of refusing. The database stays the authority: if another sale takes the stone while the order is open, Record Sale is refused, the message shows and the cart keeps its lines ([[readable-refusals]]).

## Splitting across Batches

The modal lists the Stock Line's Batches oldest first, each with what is available after the cart and a count field. The counts start filled oldest first from the oldest Batch whatever Batch was chosen: asking 20 with 14 in the oldest and 30 in the next prefills 14 and 6, and the running total reads "20 of 20". Add is enabled only when every count is a whole number from 0 up to that row's available and the counts sum to the quantity asked, so 15 and 5 or 14.5 and 5.5 or -5 and 25 all leave it disabled even though they add to 20. A Batch the cart has used up stays listed at 0 available, which is how asking for one more piece after taking all 14 takes it from the next Batch.

Add creates one cart line per Batch with a non-zero count, all at the price and stickering entered, and each goes through the merge rule above, so a Batch already in the cart at the same price just gains pieces. When every Batch together holds less than the quantity, no modal opens and the form says "Only N in stock", N being what is left across the Batches after the cart. Closing the modal adds nothing and keeps the fields as typed; focus returns to "Add to order", or to the Product select once Add has cleared the form and disabled that button. The list scrolls inside the modal and the count fields have a fixed width, so the modal fits a 390px screen.

## Area card

A sized line shows how much stone it is, like Inward's Area: the line's total in large text ("40 sq ft" for 5 pieces of 4×2 ft) with the per piece Area under it ("8 per piece"). It appears under the quantity once a Batch is chosen and a whole quantity is typed, and again on each "This order" line, so the customer and the operator see the same figure before and after adding. `formatAreaTotal` multiplies the per piece Area by the quantity and reads both sides the way `formatArea` does (two decimal places, as the size columns store them), so the per piece figure and the total never disagree. A Memorial line has no Size, the total comes back empty and no card renders. It is information only: prices stay per piece and nothing in the margin reads it.

## Order Summary

The summary totals the whole order, not the line being typed: Stone Sale Price, Landed Cost, Base Margin, Stickering Margin (shown only when any line has stickering), Total Margin and the margin percent colour from [[sales-and-stock-lines]]. `orderFigures` sums each line's `computeMargin` result and hands the sums back through `computeMargin` once more, so the percent uses the one rounding rule in `lib/margin.ts`. The button reads "Record Sale" for one line and "Record Sale (N lines)" for more.

## Boundary

`billSchema` validates the order in the server action: a customer, a date, a payment mode and at least one line, each line under the same sentences as a single sale. `billRpcArgs` zeroes stickering on lines that do not have it, as `saleRpcArgs` does for one Sale. The seam test for both is in `tests/seam/api-observations.test.ts`. The merge, split prefill and cover, and order figure rules are tested as plain functions in `tests/tooling/cart.test.ts`; `sell.spec.ts` holds the wiring flow (two lines, one Bill, the Yard dropping) and one thin check per feature.

Related: [[forms-and-components]], [[focus-after-write]].
