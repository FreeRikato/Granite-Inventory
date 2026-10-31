---
code:
  - supabase/migrations/20261101100000_bill_payments.sql
  - lib/payment-split.ts
  - components/payment-split.tsx
  - components/dashboard/payment-table.tsx
  - app/(app)/sell/sell-form.tsx
  - app/(app)/sell/actions.ts
  - app/(app)/customers/[id]/page.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - app/(app)/overview-view.tsx
  - components/confirm-delete.tsx
  - lib/schemas/sale.ts
  - lib/rpc-args.ts
  - lib/query/reads.ts
  - lib/query/writes.ts
  - tests/seam/bill-payments.test.ts
  - tests/seam/payment-split.test.ts
  - tests/e2e/mixed-payment.spec.ts
---

# Bill payments

A Bill can be paid in more than one [Payment Mode](../../CONTEXT.md): its Payment Split. The rules are in [phase1_decisions](../phase1_decisions.md) under Selling and Dashboard definitions; this note explains how the code keeps them.

## Where the split is stored

`bill_payments` has one row per Bill and mode, keyed on both, so a mode cannot repeat. The amount is a raw fact; the Bill total is not stored anywhere and is always the sum over its Sales, as before ([[sales-and-stock-lines]]). That is why a payment has to be re-checked whenever a Sale on its Bill changes: the total moved under it.

`bills.payment_mode` was dropped and `sales.payment_mode` is null on a Bill Sale (a check constraint makes it exactly one of: a Bill, or a mode). Keeping a copy of the mode on each Sale would have been a second, stale answer for a split Bill. A Sale recorded without a Bill (before Bills existed, or through `record_sale`) keeps its own single mode.

## One write path

`private.set_bill_payments` is the only code that writes the table. `record_bill` calls it after inserting the lines, so it can compare the split with the real total; a refusal rolls back the whole Bill. For a single payment it ignores any amount sent and stores the total, so the Sell screen never has to send a figure it computed in floating point. `private.follow_bill_total` runs after a correction or delete that sent no split: it moves a single payment to the new total, and refuses when a split no longer adds up. A split-only fix is a `correct_sale` with the same values and a new `p_payments`, so there is no separate function to secure.

Refusals format rupees through `private.rupees` (whole rupees when there are no paise) so the sentence reads "₹45000", not "45000.00" ([[readable-refusals]]).

## Sharing Margin across payments

`v_payments` turns every Bill, and every Sale without a Bill, into payment rows with a `margin_share`. Payments of one Bill are ordered by mode and each gets `round(M × running / total) − round(M × (running − amount) / total)`, where `running` is the sum of amounts up to and including it. The differences telescope, so the shares add up to exactly M with no remainder to place, and each is rounded to the paisa. A Bill with a zero total (all stone given free) puts its whole Margin on its last payment instead of dividing by zero.

`payments_by_mode` sums `v_payments` over a date range and always returns the three modes in Cash, UPI, Bank Transfer order, zero when empty, so the table never jumps. Week and Month are worked out in the database from `private.ist_today()` ([[ist-calendar]]), not in the browser, whose clock may be in another zone; it returns the range it used so the card can label it.

`v_chat_payments` repeats the `v_payments` query instead of selecting from it. `v_payments` is `security_invoker`, so reading it through a chat view checks `bill_payments` as `chat_reader`, which has no grant there. The same reason keeps `v_chat_sales` a copy of `v_sales` ([[chat]]).

## Screens

`lib/payment-split.ts` holds the chip and amount logic as pure functions so Sell, Edit sale and the delete confirm share one rule and it is unit tested. The modes are kept in the order they were tapped; the last one is the "rest" box, read-only, so a two-way split needs one number typed. The type `[PaymentMode, ...PaymentMode[]]` makes "no mode picked" impossible; tapping the only picked chip does nothing.

On Sell the chips stay at the top of the form, but the amount boxes sit in the Order Summary under "Customer pays": the total is only known once lines are in the order ([[sell-cart]]). After a Bill is recorded the split resets to the first picked mode.

Edit sale estimates the new Bill total in the browser (old Bill total minus this Sale's old revenue plus its new revenue) only to drive the rest box; the database checks the real total. It always sends the split for a Bill Sale, which also lets a one-mode Bill switch modes. The delete confirm asks for a split only when the Bill has more than one payment and other Sales stay, and disables Delete until the split works, since closing an alert dialog cannot be stopped from the action button ([[corrections]]).

The overview Margin card keeps separate state for the Chart's grain and the Table's range, so switching views does not lose either ([[dashboard]]). The table query key `payments-by-mode` is in the sale writes' invalidation list ([[browser-reads]]).
