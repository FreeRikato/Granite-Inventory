---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - supabase/migrations/20260911140000_dashboard.sql
  - supabase/migrations/20261029150000_margin_by_period.sql
  - supabase/migrations/20261029160000_top_customers.sql
  - app/(app)/page.tsx
  - app/(app)/overview-view.tsx
  - components/dashboard/margin-bars.tsx
  - components/dashboard/moving-bars.tsx
  - components/dashboard/segmented-toggle.tsx
  - components/dashboard/stock-donut.tsx
  - components/dashboard/top-customers.tsx
  - lib/query/reads.ts
  - lib/format.ts
  - tests/seam/dashboard.test.ts
  - tests/seam/dashboard-trends.test.ts
  - tests/e2e/dashboard.spec.ts
  - tests/tooling/format.test.ts
  - tests/tooling/stock-donut.test.ts
  - supabase/migrations/20261101100000_bill_payments.sql
  - components/dashboard/payment-table.tsx
  - supabase/migrations/20261104100000_received_by_period.sql
  - components/dashboard/received-bars.tsx
  - components/dashboard/received-table.tsx
  - components/skeletons/overview-skeleton.tsx
  - tests/seam/received-by-period.test.ts
  - supabase/migrations/20261105100000_credit.sql
  - supabase/migrations/20261107110000_square_feet_sold.sql
  - tests/seam/credit.test.ts
  - tests/e2e/mixed-payment.spec.ts
  - tests/e2e/overview-outstanding.spec.ts
  - lib/credit.ts
---
# Dashboard

Every figure on Overview is derived from batches and sales; nothing is stored. "This month" is the calendar month in India ([[ist-calendar]]).

- Moving sizes: units sold in the last N days per length x breadth, thickness ignored. Memorial has no size, so it shows as one row per Product. The chart is ranked bars with one series, so one hue and direct labels. The chat draws its own ranked bars with the same list ([[chat-visuals]]).
- Stock donut: part-to-whole of what is still in the yard versus what has been sold, all time. With neither, the ring is one grey (sold) slice. The chat draws its donut with the same ring and legend ([[chat-visuals]]).
- Archived Batches are out of Active stock, inventory value and the last-month comparison (both sides of it, so the change stays like for like), but their units sold still count, because those Sales happened.
- The stale panel is a slice of the shared batches query: the oldest stale batches that still have stock ([[browser-reads]]).
- Margin by period: `margin_by_period('week' | 'month')` returns 12 rows, oldest first, ending with the current IST week (Monday start) or month. It is plpgsql rather than plain sql only so an unknown grain can raise an error. Every period is generated first and only Sales inside those 12 periods are summed and joined on, so a period with no Sales is a zero row with a null percentage instead of a gap. The formulas are the MTD ones, so Misc Expense is out and archived Batches' Sales stay in.
- The Margin card owns its toggle and its query; the query key carries the grain, so each grain caches on its own and the rest of Overview does not wait on it. The chart draws its own bar shape so a zero period still shows a thin stub and can be counted; the current period takes the accent colour, past ones the muted chart colour. `segmented-toggle.tsx` is the shared pill radiogroup. A second toggle switches the card between Chart and Table; the Table shows Collected and Margin per Payment Mode for this week, this month or a custom range ([[bill-payments]]).
- Money received: `received_by_period('week' | 'month' | 'custom', from, to)` returns Cash, UPI, Bank Transfer and Total per period, oldest first, and the card reverses it for the table (newest first, current period marked "now"). Week and Month are 12 periods generated from `private.ist_today()` like `margin_by_period`; Custom generates one row per day between the two dates and refuses an end date after today with the same message and validation order as `payments_by_mode` ([[bill-payments]]). Periods are generated first and sums joined on, so an empty period is a zero row. It reads `v_payments.amount` only, never `margin_share`, so the Total equals revenue and a split Bill lands each part under its own mode. It groups by `v_payments.received_on`: the Sale date for a payment made at the sale and the day received for a later payment on a Credit Bill, so a later payment lands in the period it came in ([[credit]]). The card keeps the previous rows while the next range loads, like Margin, and its table abbreviates "Bank Transfer" to "Bank" and weekly labels to the start date below 640px while scrolling inside the card if it still does not fit. The chart's segments are drawn by a custom bar shape so the top segment of each stack is rounded and a zero period shows a 2px stub. UPI is the accent hue, Cash the muted grey and Bank Transfer the light grey, so the legend and table carry the names. A custom range is capped by the API's 1000 row limit, about 2.7 years of days.
- Top customers: `top_customers('month' | '90d' | 'all', limit = 5)` ranks Customers by billed (stone plus Stickering), not Margin, so a big-ticket buyer is not hidden by a thin margin. Its windows match the rest of Overview: 'month' starts at the IST month start, '90d' is `sale_date > ist_today - 90` like `fast_moving`, 'all' has no lower bound. Sales are first summed per Customer and Product (a Product is summed across its Batches), then rolled into one row whose `products` JSON array is ordered by pieces then name and lists every Product; the card shows the first 3 and "+N more". It is plpgsql only to reject an unknown window. The Walk-in Customer is an ordinary Customer here.
- The Top customers card owns its toggle and a query keyed by window, like the Margin card. `topCustomersQuery` parses `products` with a zod schema because Postgres hands it back as untyped JSON. The Products line wraps instead of truncating, so all 3 Products and "+N more" are always visible; when it was one clipped line the tail, which is exactly "+N more", was the part cut off. Only the Customer name truncates. The card sets `min-w-0` so a long unbroken name cannot stretch the single mobile grid column past the screen.
- The Active stock and Total inventory value card is a container-query box: its two halves sit side by side from 480px of card width and stack below that, instead of from a viewport width. The Ask panel docks at 1280px and narrows the column to a 268px card, where `text-5xl` figures in half-width columns spilled past the card; stacked, they fit ([[chat]]). Panel closed, the card is pixel-identical to before.
- The Stock status and Fast vs slow moving row is a container-query box too: two columns (400px and the rest) from 640px of row width, stacked below that. At 1280px with the Ask panel docked the row is 540px wide, and the old viewport rule (`lg:`) left Fast vs slow moving 148px, 28px less than its bar values need, so they ran under the panel. Panel closed the row is 664px at 1024, 920px at 1280 and 1080px at 1440, so the closed dashboard is pixel-identical to before from 1024 up. Below that the rule differs from the old viewport one: at viewports 672 to 767 and 1000 to 1023 the row is wide enough for two columns (it was stacked), and both layouts fit. `tests/e2e/chat.spec.ts` measures every `section` on Overview at 1280 and 1440 with the panel open, with sales in the data so the bars exist ([[chat]]).
- Outstanding reads the Credit screen's own `creditQuery` and `creditTotals`, so the two screens cannot disagree and there is no second sum to keep in step ([[credit]]). It is not a column on `v_dashboard_kpis`: that would be a second calculation of the same figure and would add `dashboard-kpis` to every credit write, while the `credit` key already refreshes after sales, Corrections and Later payments. The tile owns its query, like the Margin card, so Overview never waits on it: a failed Credit read shows "Could not load" in the tile, never ₹0 and never an error over the whole page, and a device whose offline cache has no Credit rows still paints the rest. The Overview skeleton draws three tiles. It is the one KPI tile in full rupees: compact would show ₹1.2L beside the Credit screen's ₹1,23,456, and the two must read the same. It has no MTD prefix because it is what is owed today, whichever month the Bill was sold in.
- Square feet sold this month: `mtd_sqft` on `v_dashboard_kpis`, summed in the same `month` CTE as MTD Revenue, so the two can never cover different days. It reads `area_sqft` from the Sale, as Daily Sales does ([[daily-sales]]), and Memorial drops out because its Area is null. It is a new tile between MTD Revenue and MTD Margin, and the skeleton draws three rows to match. `v_chat_kpis` gains the same column because `chat-query.test.ts` holds the two views equal ([[chat]]).
- KPI tiles use compact rupees: ₹5.2L, ₹1.2Cr. A negative amount puts the sign before the symbol (-₹5,050, -₹2.5L); `tests/tooling/format.test.ts` guards it.
- The Margin chart's y-axis uses `formatRupeesAxis` (₹75K, ₹1L, ₹1.5Cr, -₹3K) instead of the compact form, because the compact form prints anything under 1 lakh in full (₹75,000) and that is wider than the 52 px axis, so the ₹ was clipped at the card's left edge. The tooltip keeps exact amounts through `formatRupees`.

The page is a static shell like Yard and Sell; the numbers come from the browser cache.

## The seam scenario

`dashboard.test.ts` uses two batches: A with 20 pieces at landed 1000 bought last month, and B with 10 at 2000 bought this month. It sells 5 of A last month (not month to date), then 3 of A this month with stickering and 2 of B this month, and checks every derived figure against that.

`dashboard-trends.test.ts` writes its Sales as rows with a fixed Landed Cost of 1000, so the expected figures do not move with how a Batch's price becomes Landed Cost. The `top_customers` cases cover ranking and the cut at 5, the three windows (a Sale 91 days old, a Sale from before the month), the per-Product sum across two Batches with a pieces tie broken by name, and the Walk-in Customer.

Related: [[sales-and-stock-lines]], [[yard]].
