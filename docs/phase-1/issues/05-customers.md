# 05 — Customers

**What to build:** The Customers page lists every Customer with name, phone, Customer Type badge and last purchase ("3 days ago" or "No purchases"), shows counts of total Customers, Contractors and Trusts, lets an operator add a Customer or rename one and change its type, and opens a detail page showing the Customer's details and every Sale they made. Deleting a Customer with Sales is refused.

**Blocked by:** 04 — Sell stone

**Status:** done

- [x] `v_customers` with derived last purchase date and Sale count
- [x] List page with KPI counts, search, type badges (Retail labelled "Walk-in"), relative last purchase
- [x] Add Customer dialog and edit (rename, phone, type); phone uniqueness error surfaced clearly
- [x] Detail page: details plus Sales list (date, Product, Variant, Size, Batch Code, quantity, total, Margin)
- [x] Delete refused when Sales reference the Customer; Walk-in Customer cannot be deleted
- [x] Mobile layout for list and detail
- [x] Seam tests: last purchase derivation; delete refusal; type check constraint
