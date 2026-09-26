---
code:
  - supabase/migrations/20260911140000_dashboard.sql
  - app/(app)/page.tsx
  - app/(app)/overview-view.tsx
  - components/dashboard/moving-bars.tsx
  - components/dashboard/stock-donut.tsx
  - lib/format.ts
  - tests/seam/dashboard.test.ts
---
# Dashboard

Every figure on Overview is derived from batches and sales; nothing is stored. "This month" is the calendar month in India ([[ist-calendar]]).

- Moving sizes: units sold in the last N days per length x breadth, thickness ignored. Memorial has no size, so it shows as one row per Variant. The chart is ranked bars with one series, so one hue and direct labels.
- Stock donut: part-to-whole of what is still in the yard versus what has been sold, all time.
- The stale panel is a slice of the shared batches query: the oldest stale batches that still have stock ([[browser-reads]]).
- KPI tiles use compact rupees: ₹5.2L, ₹1.2Cr.

The page is a static shell like Yard and Sell; the numbers come from the browser cache.

## The seam scenario

`dashboard.test.ts` uses two batches: A with 20 pieces at landed 1000 bought last month, and B with 10 at 2000 bought this month. It sells 5 of A last month (not month to date), then 3 of A this month with stickering and 2 of B this month, and checks every derived figure against that.

Related: [[sales-and-stock-lines]], [[yard]].
