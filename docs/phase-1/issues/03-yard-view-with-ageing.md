# 03 — Yard view with ageing

**What to build:** The Yard Slots page shows tabs per Slot, Batches inside grouped by length × breadth, each row coloured by Ageing Band with its Age in days, a Clamp line "New batch arrived N days later" between consecutive Batches of the same Stock Line, oldest first by default, with search, filters (Product, Variant, Thickness, Supplier, Age over 90/180/365) and a "Show sold out" toggle. Bands follow the two thresholds in Settings.

**Blocked by:** 02 — Log a delivery

**Status:** done

- [x] `v_yard_batches` exposes Available, Age, Ageing Band (from settings thresholds), Sold Out flag, and days since the previous Batch of the same Stock Line
- [x] Settings check enforces ageing threshold below stale threshold
- [x] Slot tabs with per-Slot summary ("N batches, M available"); size sub-groups within a Slot; Memorial grouped by Variant
- [x] Row shows Product, Variant, Batch Code, Size, thickness, bought, sold, Available, Age chip coloured Fresh/Ageing/Stale
- [x] Clamp separator rendered between consecutive Batches of one Stock Line
- [x] Sort oldest first default, newest first option; text search; all five filters; Sold Out hidden unless toggled
- [x] Readable at 402 px with the same information
- [x] Seam tests: band boundaries at exactly N and M days; Sold Out when Available is zero; Clamp gap values; filter by age thresholds
