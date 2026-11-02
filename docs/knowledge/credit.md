---
code:
  - supabase/migrations/20261105100000_credit.sql
  - lib/credit.ts
  - tests/seam/credit.test.ts
  - tests/seam/fixtures.ts
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

## Tests

`credit.test.ts` is the seam: the add-up rule, Walk-in refusal, the pay-by default for every weekday, overpay and date refusals, a receipt split across modes, a zero balance closing the Bill, Admin-only edit and delete, an operator and a stranger refused, a Correction that would take the total below what was received, the extension history and `days_left`, Money received and the Margin table equal to Margin. Memorial Batches keep the sums easy: a rate is a per piece price, so 5 pieces at 2000 is exactly a ₹10,000 Bill.

Related: [[testing]], [[readable-refusals]].
