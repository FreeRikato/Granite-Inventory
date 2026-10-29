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
---
# Dashboard

Every figure on Overview is derived from batches and sales; nothing is stored. "This month" is the calendar month in India ([[ist-calendar]]).

- Moving sizes: units sold in the last N days per length x breadth, thickness ignored. Memorial has no size, so it shows as one row per Product. The chart is ranked bars with one series, so one hue and direct labels. The chat draws its own ranked bars with the same list ([[chat-visuals]]).
- Stock donut: part-to-whole of what is still in the yard versus what has been sold, all time. With neither, the ring is one grey (sold) slice. The chat draws its donut with the same ring and legend ([[chat-visuals]]).
- Archived Batches are out of Active stock, inventory value and the last-month comparison (both sides of it, so the change stays like for like), but their units sold still count, because those Sales happened.
- The stale panel is a slice of the shared batches query: the oldest stale batches that still have stock ([[browser-reads]]).
- Margin by period: `margin_by_period('week' | 'month')` returns 12 rows, oldest first, ending with the current IST week (Monday start) or month. It is plpgsql rather than plain sql only so an unknown grain can raise an error. Every period is generated first and only Sales inside those 12 periods are summed and joined on, so a period with no Sales is a zero row with a null percentage instead of a gap. The formulas are the MTD ones, so Misc Expense is out and archived Batches' Sales stay in.
- The Margin card owns its toggle and its query; the query key carries the grain, so each grain caches on its own and the rest of Overview does not wait on it. The chart draws its own bar shape so a zero period still shows a thin stub and can be counted; the current period takes the accent colour, past ones the muted chart colour. `segmented-toggle.tsx` is the shared pill radiogroup.
- Top customers: `top_customers('month' | '90d' | 'all', limit = 5)` ranks Customers by billed (stone plus Stickering), not Margin, so a big-ticket buyer is not hidden by a thin margin. Its windows match the rest of Overview: 'month' starts at the IST month start, '90d' is `sale_date > ist_today - 90` like `fast_moving`, 'all' has no lower bound. Sales are first summed per Customer and Product (a Product is summed across its Batches), then rolled into one row whose `products` JSON array is ordered by pieces then name and lists every Product; the card shows the first 3 and "+N more". It is plpgsql only to reject an unknown window. The Walk-in Customer is an ordinary Customer here.
- The Top customers card owns its toggle and a query keyed by window, like the Margin card. `topCustomersQuery` parses `products` with a zod schema because Postgres hands it back as untyped JSON. The Products line wraps instead of truncating, so all 3 Products and "+N more" are always visible; when it was one clipped line the tail, which is exactly "+N more", was the part cut off. Only the Customer name truncates. The card sets `min-w-0` so a long unbroken name cannot stretch the single mobile grid column past the screen.
- KPI tiles use compact rupees: ₹5.2L, ₹1.2Cr. A negative amount puts the sign before the symbol (-₹5,050, -₹2.5L); `tests/tooling/format.test.ts` guards it.
- The Margin chart's y-axis uses `formatRupeesAxis` (₹75K, ₹1L, ₹1.5Cr, -₹3K) instead of the compact form, because the compact form prints anything under 1 lakh in full (₹75,000) and that is wider than the 52 px axis, so the ₹ was clipped at the card's left edge. The tooltip keeps exact amounts through `formatRupees`.

The page is a static shell like Yard and Sell; the numbers come from the browser cache.

## The seam scenario

`dashboard.test.ts` uses two batches: A with 20 pieces at landed 1000 bought last month, and B with 10 at 2000 bought this month. It sells 5 of A last month (not month to date), then 3 of A this month with stickering and 2 of B this month, and checks every derived figure against that.

`dashboard-trends.test.ts` writes its Sales as rows with a fixed Landed Cost of 1000, so the expected figures do not move with how a Batch's price becomes Landed Cost. The `top_customers` cases cover ranking and the cut at 5, the three windows (a Sale 91 days old, a Sale from before the month), the per-Product sum across two Batches with a pieces tie broken by name, and the Walk-in Customer.

Related: [[sales-and-stock-lines]], [[yard]].
