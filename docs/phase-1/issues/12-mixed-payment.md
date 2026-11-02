# 12: Mixed payment on a Bill

**What to build:** A Customer can pay one Bill with more than one Payment Mode, for example ₹30,000 Cash + ₹20,000 UPI on a ₹50,000 Bill. The Sell screen records the split, corrections keep it adding up, and the dashboard Margin card gets a Table view showing Collected and Margin per Payment Mode for this week, this month or a custom range.

**Blocked by:** none

**Status:** done

## Decisions

1. Split by amount: a Bill holds one or more payments, each a Payment Mode and an amount. A Payment Mode appears at most once per Bill and every amount is above zero.
2. The payments add up exactly to what the Customer pays for the Bill: the sum over its Sales of Stone Sale Price plus Stickering Price per piece times quantity. Every Sale is still paid in full; credit, dues and part payments stay out of scope.
3. Sell screen: the Payment Mode chips become multi-select. One chip picked works as today, with no amount boxes. Two or more picked show an amount box per mode in the Order Summary, under a new "Customer pays" row; the box of the last picked mode fills itself with the rest. Record Sale is refused until the boxes add up.
4. Edit sale on a Bill Sale: when the change alters the Bill total, the dialog shows the Bill's split and will not save until it adds up to the new total.
5. Delete sale on a Bill Sale: when other Sales remain on the Bill, the delete confirm asks for the new split before deleting. Deleting the last Sale removes the Bill as today.
6. A Bill paid in one Payment Mode follows its total on its own after an edit or delete; no split is asked.
7. Edit sale can change the Bill's split at any time, as long as it still adds up. This replaces the rule that a Bill Sale's Payment Mode is read-only; Customer and Sale date stay read-only.
8. Dashboard Margin card gets a Chart / Table toggle. The Table has one row per Payment Mode with Collected, Margin, Margin % and Share of Margin, then a Total row.
9. A mixed Bill's Margin is shared across its payments in proportion to amount: a Bill paid 60 percent Cash puts 60 percent of its Margin in the Cash row. Shares are rounded to the paisa so the rows add up exactly to the Total.
10. Table range: Week is this week (Monday start, IST) to today, Month is this calendar month to today, Custom is any start and end date chosen, end not after today. The Chart keeps its last 12 weeks or months and has no Custom.
11. Bills and Sales recorded before this ticket count fully toward their single Payment Mode.
12. Whoever can edit a Sale can edit its Bill's split.
13. The Customer sale history shows a mixed Bill's payments, for example "Cash ₹30,000 + UPI ₹20,000".
14. The chat query views expose the stored split, so a mixed Bill is never reported as one Payment Mode. No new chat features.

## Worked example

Bills in range 1 Oct to 31 Oct 2026: A ₹50,000 paid ₹30,000 Cash + ₹20,000 UPI, Margin ₹12,000; B ₹40,000 Cash, Margin ₹9,000; C ₹25,000 UPI, Margin ₹6,000; D ₹60,000 Bank Transfer, Margin ₹15,000.

| Payment Mode  | Collected | Margin  | Margin % | Share of Margin |
| ------------- | --------- | ------- | -------- | --------------- |
| Cash          | ₹70,000   | ₹16,200 | 23.1%    | 39%             |
| UPI           | ₹45,000   | ₹10,800 | 24.0%    | 26%             |
| Bank Transfer | ₹60,000   | ₹15,000 | 25.0%    | 36%             |
| Total         | ₹1,75,000 | ₹42,000 | 24.0%    |                 |

## Checklist

- [x] Bill payments stored as raw facts (Bill, Payment Mode as text with check, amount); existing Bills and pre-Bill Sales backfilled or derived as one payment of their full amount
- [x] `record_bill` takes payments and refuses: no payments, a repeated mode, an amount of zero or less, a sum that differs from the Bill total
- [x] `correct_sale` and the delete path take the new split when the Bill total changes and refuse one that does not add up; a one-mode Bill follows its total; a split-only change is accepted
- [x] A view gives Collected and shared Margin per Payment Mode for a date range, rows summing exactly to the Margin by period totals for the same range
- [x] Sell form: multi-select chips, "Customer pays" row, amount boxes with the last one auto-filled, refusal shown when they do not add up
- [x] Edit sale dialog and delete confirm show and edit the split
- [x] Customer sale history shows mixed payments
- [x] Overview Margin card: Chart / Table toggle, Week / Month / Custom range for the Table
- [x] Chat query views expose the split
- [x] `CONTEXT.md` (Payment Mode, Bill) and `docs/phase1_decisions.md` updated in the same commit as the rule change; `docs/knowledge/` notes for the touched code
- [x] Seam tests: split must add up; repeated mode and zero amount refused; edit and delete that change the total require a new split; one-mode Bill follows its total; split-only edit; shared Margin rounding sums exactly; pre-ticket Bills count fully to their mode
- [x] Playwright: record a Cash + UPI Bill and see both rows in the Margin Table
