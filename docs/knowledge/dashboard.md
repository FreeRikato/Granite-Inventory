---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - supabase/migrations/20260911140000_dashboard.sql
  - supabase/migrations/20261029150000_margin_by_period.sql
  - app/(app)/page.tsx
  - app/(app)/overview-view.tsx
  - components/dashboard/margin-bars.tsx
  - components/dashboard/moving-bars.tsx
  - components/dashboard/segmented-toggle.tsx
  - components/dashboard/stock-donut.tsx
  - lib/format.ts
  - tests/seam/dashboard.test.ts
  - tests/seam/dashboard-trends.test.ts
  - tests/e2e/dashboard.spec.ts
  - tests/tooling/format.test.ts
---
# Dashboard

Every figure on Overview is derived from batches and sales; nothing is stored. "This month" is the calendar month in India ([[ist-calendar]]).

- Moving sizes: units sold in the last N days per length x breadth, thickness ignored. Memorial has no size, so it shows as one row per Product. The chart is ranked bars with one series, so one hue and direct labels.
- Stock donut: part-to-whole of what is still in the yard versus what has been sold, all time.
- Archived Batches are out of Active stock, inventory value and the last-month comparison (both sides of it, so the change stays like for like), but their units sold still count, because those Sales happened.
- The stale panel is a slice of the shared batches query: the oldest stale batches that still have stock ([[browser-reads]]).
- Margin by period: `margin_by_period('week' | 'month')` returns 12 rows, oldest first, ending with the current IST week (Monday start) or month. It is plpgsql rather than plain sql only so an unknown grain can raise an error. Every period is generated first and only Sales inside those 12 periods are summed and joined on, so a period with no Sales is a zero row with a null percentage instead of a gap. The formulas are the MTD ones, so Misc Expense is out and archived Batches' Sales stay in.
- The Margin card owns its toggle and its query; the query key carries the grain, so each grain caches on its own and the rest of Overview does not wait on it. The chart draws its own bar shape so a zero period still shows a thin stub and can be counted; the current period takes the accent colour, past ones the muted chart colour. `segmented-toggle.tsx` is the shared pill radiogroup.
- KPI tiles use compact rupees: ₹5.2L, ₹1.2Cr. A negative amount puts the sign before the symbol (-₹5,050, -₹2.5L); `tests/tooling/format.test.ts` guards it.
- The Margin chart's y-axis uses `formatRupeesAxis` (₹75K, ₹1L, ₹1.5Cr, -₹3K) instead of the compact form, because the compact form prints anything under 1 lakh in full (₹75,000) and that is wider than the 52 px axis, so the ₹ was clipped at the card's left edge. The tooltip keeps exact amounts through `formatRupees`.

The page is a static shell like Yard and Sell; the numbers come from the browser cache.

## The seam scenario

`dashboard.test.ts` uses two batches: A with 20 pieces at landed 1000 bought last month, and B with 10 at 2000 bought this month. It sells 5 of A last month (not month to date), then 3 of A this month with stickering and 2 of B this month, and checks every derived figure against that.

`dashboard-trends.test.ts` writes its Sales as rows with a fixed Landed Cost of 1000, so the expected Margin does not move with how a Batch's price becomes Landed Cost.

Related: [[sales-and-stock-lines]], [[yard]].
