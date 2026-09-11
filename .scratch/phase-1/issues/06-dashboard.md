# 06 — Dashboard

**What to build:** The Overview page shows Active stock with change versus end of last month, Total inventory value, month-to-date Revenue and month-to-date Margin (rupees and percent) as large bold numbers; a donut of Available versus sold to date; a horizontal bar of units sold in the last 90 days by length × breadth (Memorial as one bar per Variant); and a Stale stock panel listing the four oldest Stale Batches with stock, linking to the yard filtered to Stale.

**Blocked by:** 03 — Yard view with ageing; 04 — Sell stone

**Status:** ready-for-agent

- [ ] Dashboard views or functions implement every KPI exactly as defined in the Phase 1 decisions doc, including active stock at a past date for the month comparison
- [ ] Four KPI tiles, donut, bar chart and Stale panel laid out per the design on desktop and mobile
- [ ] Charts use the shadcn chart wrapper over Recharts, no animation that repaints continuously
- [ ] Stale panel link opens the yard with the Stale age filter applied
- [ ] Seam tests against a seeded dataset with hand-computed answers for each KPI, including a month boundary case
