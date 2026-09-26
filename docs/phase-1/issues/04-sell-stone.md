# 04 — Sell stone

**What to build:** An operator records a Sale: picks or inline-creates a Customer (typing an existing phone selects that Customer), searches a Stock Line with stock, sees the FIFO Listing of its Batches oldest first with Ageing Bands, picks any Batch, enters quantity and per-piece Sale Price, optionally toggles Stickering with per-piece cost and price, adds Misc Expense, watches the order summary update live (stone total, Landed Cost, base margin, Stickering margin, total Margin, percentage coloured by health), and presses Record Sale. Available on the Batch drops; overselling is refused.

**Blocked by:** 02 — Log a delivery

**Status:** done

- [x] `customers` table (name, phone unique when present, customer_type text with check: REGULAR, CONTRACTOR, ENGINEER, TRUST, RETAIL) seeded with the Walk-in Customer
- [x] `sales` table with per-piece prices, `landed_cost` snapshot, Stickering fields, `misc_expense`, `payment_mode` (text with check), `created_by`, `updated_by`; sale date not in the future
- [x] `v_stock_lines` groups Batches by Product, Variant, Size with total Available and Batch count
- [x] `v_sales` derives revenue, Margin and Margin percentage
- [x] `record_sale` locks the Batch, refuses quantity above Available, snapshots Landed Cost, increments units sold, inserts the Sale
- [x] Sell form: date, Payment Mode chips, Customer combobox with inline create and Customer Type chips, Stock Line combobox showing Available, FIFO Listing radios with Age and band, quantity, prices, Stickering toggle, Misc Expense, live summary, Record Sale
- [x] Margin percentage coloured green above 25 percent and red below 10 percent
- [x] Seam tests: oversell refused; two concurrent sales of the last pieces leave exactly one winner; Margin arithmetic with and without Stickering; Misc Expense excluded from Margin; snapshot unchanged after Batch price edit; FIFO order; phone uniqueness
- [x] Playwright: sell from a Batch, see Available drop in the yard and Margin in the summary
