---
code:
  - supabase/migrations/20261105100000_credit.sql
  - lib/credit.ts
  - tests/seam/credit.test.ts
  - tests/seam/fixtures.ts
  - tests/tooling/credit.test.ts
  - tests/tooling/invalidates-after.test.ts
  - tests/e2e/credit.spec.ts
  - tests/e2e/capture.spec.ts
  - lib/schemas/credit.ts
  - lib/schemas/sale.ts
  - lib/rpc-args.ts
  - lib/nav.ts
  - lib/query/reads.ts
  - lib/query/writes.ts
  - components/due-badge.tsx
  - components/payment-split.tsx
  - components/search-select.tsx
  - components/dashboard/payment-table.tsx
  - components/skeletons/credit-skeleton.tsx
  - app/(app)/credit/page.tsx
  - app/(app)/credit/credit-view.tsx
  - app/(app)/credit/credit-list.tsx
  - app/(app)/credit/credit-card.tsx
  - app/(app)/credit/payments-list.tsx
  - app/(app)/credit/receipt-dialog.tsx
  - app/(app)/credit/extend-dialog.tsx
  - app/(app)/credit/actions.ts
  - app/(app)/sell/sell-form.tsx
  - app/(app)/sell/sell-view.tsx
  - app/(app)/customers/customer-list.tsx
  - app/(app)/customers/[id]/page.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
---

# Credit

A Bill can be sold on credit and paid later ([Credit, Balance, Later payment, Pay-by date](../../CONTEXT.md)). The rules are in [phase1_decisions](../phase1_decisions.md) under Selling; this note explains how the code keeps them. It builds on [[bill-payments]] and [[corrections]].

## Nothing about money is stored twice

The balance is never a column. `v_bill_balances` sums a Bill's Sales, its `bill_payments` and its later payments, and `v_credit` is the credit slice of it with the Customer, the pay-by dates and `days_left`. A Correction that moves the total therefore moves the balance with no step to forget. `bills.on_credit` is the only stored credit fact, typed on Sell: it stays true when the balance reaches zero, so a paid-off Bill is still a Credit Bill and the Paid chip can list it. A Bill with a zero balance is "closed" only in the sense that `record_credit_payment` and `extend_pay_by` refuse it.

`bill_payments` is reused for what was paid at the sale. On a credit Bill its rows may sum to less than the total, or be absent when nothing was paid, so `private.set_credit_bill_payments` writes it for `record_bill` (zero amounts dropped, sum below the total) and `private.set_bill_payments` refuses a credit Bill, which is how Edit sale is stopped from sending a split for one.

A later payment is one receipt: a `credit_payments` row (date, audit) with `credit_payment_lines` per mode. Keeping the date once on the receipt is why edit and delete act on the whole receipt, and why a receipt of Cash plus UPI shows as one line in the payments list. Members have select only; every write goes through a security definer function that checks `is_member` or `require_admin` first ([[access-model]]). `record_credit_payment` and the corrections lock the Bill row, the same row `correct_sale` and `delete_sale` lock, so a payment and a total correction cannot both pass their checks against the old figure.

## Pay-by dates

`credit_promises` keeps one row per promise and nothing is updated or removed, so "original" is the first row and "current" the latest, ordered by an identity column rather than `created_at`, which two quick calls could tie. `private.default_pay_by` is the Saturday of the sale week, and a Saturday or Sunday sale goes to the coming Saturday. The Sell screen needs the same date before anything is saved, so `lib/credit.ts` repeats the rule and a seam test compares it with the SQL over 21 consecutive days. `days_left` is the latest pay-by date minus `private.ist_today()`, so it counts the day itself as 0 and goes negative once late ([[ist-calendar]]). Every date refusal names the rule: not before the sale, not in the past when extending, and within a year of today, which only guards the date column from a typed year of 9999.

## Margin and Money received

`v_payments` gained later payments, ordered after the at-sale ones by receipt date, and a `received_on` column. Margin shares are still the running-sum differences of [[bill-payments]], so the shares of what has been paid add up to `round(M × paid / total)`. The Margin table dates a payment by the Bill's sale date, so a later payment appears under its mode on that day. The unpaid part is its own Unpaid row, computed per Bill as its Margin minus the shares so far, and the rows then add up to the Bill's Margin exactly. `received_by_period` groups by `received_on` instead, which is why the Money received card counts a later payment on the day it came in ([[dashboard]]).

`v_chat_payments` is deliberately untouched: Ask does not see credit in this version ([[chat]]).

## Screens

`lib/credit.ts` holds every pure rule the screens share, so Sell, Credit and the Customer pages agree and the rules are unit tested: the pay-by default, the due tone (far above 2 days left, soon at 2 or fewer including the day itself, late once passed), the labels, the list order and totals, and the receipt and part payment checks. The server stays the judge; the screens refuse early only to save a round trip.

- Sell: the Part payment switch sits in the Customer pays tile. With it on, every picked mode becomes a typed "paid now" box (no "rest" box, since the rest is the balance) and the Credit tile below shows Total, Paid now, Balance and Pay by. Walk-in turns the switch off and disables it, because the database refuses credit for it too. The Order Summary, Margin and Margin % are untouched: the sale is worth the same whether or not it is paid. The Pay-by field keeps the default until the operator types, so changing the Sale Date moves the suggestion but never overwrites a typed date.
- Credit: `v_credit` rows are read whole and sorted in the browser, like the Customers list. "Overdue first" is most late first, the larger balance first on a tie. "Pay-by date" lists what is coming up in date order and then what is late, so the two chips differ. "Paid" lists settled Bills, which the other two leave out. The payments of a card load when it opens and are cached per Bill.
- Record payment and Edit payment are one dialog. The amount is typed; with two or more modes the last picked mode takes the rest of the amount, the same rule as Sell ([[bill-payments]]). Edit checks against the balance without that receipt, as the database does.
- Customer page and Customers list read `v_customers.owed` and `credit_days_left`; the Sell Customer picker reads them through its own query so a payment refreshes the badges without reloading the Customers. Nothing here blocks a sale.
- Edit sale shows a credit Bill's total and a note instead of the split, and the delete confirm never asks for one.
- The Margin table shows the Unpaid row only when something in its range is unpaid, so a shop without credit sees the table as before.

## Tests

`credit.test.ts` is the seam: the add-up rule, Walk-in refusal, the pay-by default for every weekday, overpay and date refusals, a receipt split across modes, a zero balance closing the Bill, Admin-only edit and delete, an operator and a stranger refused, a Correction that would take the total below what was received, the extension history and `days_left`, Money received and the Margin table equal to Margin. `tests/e2e/credit.spec.ts` is the one thin flow: sell on credit, record a mixed payment, see the Bill leave the open list and find it under Paid. The seven credit captures in `capture.spec.ts` run only with `CAPTURE=<dir>`. Memorial Batches keep the sums easy: a rate is a per piece price, so 5 pieces at 2000 is exactly a ₹10,000 Bill.

Related: [[testing]], [[readable-refusals]].
