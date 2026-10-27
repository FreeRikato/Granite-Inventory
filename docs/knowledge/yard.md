---
code:
  - supabase/migrations/20260911110000_yard_view.sql
  - lib/yard.ts
  - app/(app)/yard/page.tsx
  - app/(app)/yard/yard-view.tsx
  - components/yard/yard-filters.tsx
  - components/yard/batch-card.tsx
  - components/yard/clamp.tsx
  - components/ageing-badge.tsx
  - tests/e2e/yard-cls.spec.ts
  - tests/e2e/yard.spec.ts
  - tests/e2e/yard-windowing.spec.ts
  - tests/seam/yard-chunks.test.ts
---
# Yard

## Derived, never stored

Age, Ageing Band, Sold Out and the Clamp gap are all derived in the yard view from raw Batch facts and the two thresholds in settings (ageing after, stale after). Age is counted on the [[ist-calendar]].

## Ordering and grouping

The yard is one section per Stack, the pile named by a Slot and a Batch number ([[batches]]). `groupByStack` in `lib/yard.ts` orders sections by Slot, then by Batch number with a numeric compare so 2 sorts before 10; Batches without a number fall into a last "No batch number" section. Slot is an ordinary filter now, so `/yard?slot=5FT` still narrows the page.

Inside a section, Batches of one Stock Line stay together, so the Clamp (the virtual divider between two deliveries of the same stone) sits between them. Lines are ordered by their oldest batch, and batches within a line by date.

## Windowing

Grouping, filtering and sorting stay plain functions over the whole list, but only the chunks near the viewport are mounted. Up to `WINDOW_AFTER` batches nothing is windowed: `chunkStacks` is called with an unbounded size, so each Stack is one chunk drawn as one framed section with one heading, however many purchases it holds, and a small yard behaves exactly as before.

Past `WINDOW_AFTER`, `chunkStacks` cuts each Stack into chunks of `CHUNK_SIZE` batches and `VirtualStacks` windows those chunks against the page scroll with `@tanstack/react-virtual`. The frame stays continuous across the chunks of one Stack: only the leading chunk has the top border, rounded top corners, heading and `aria-label`, only the trailing chunk has the bottom border and rounded bottom corners, and there is no gap between chunks of one Stack (the page gap sits after the trailing chunk only). Each batch carries its Clamp gap computed from the full sorted Stack, so a gap is right even when the two deliveries land in different chunks. A Stack of up to `CHUNK_SIZE` batches is one chunk. Chunks are measured after mount because card heights vary with the ageing banner and the admin actions, and the first estimate of 1000px only sizes the scroll bar until a chunk has been measured. Dates are compared as ISO strings, not with `localeCompare`, because sorting thousands of batches on every filter change made the locale compare the main cost.

## Filters and links

Every filter lives in the URL, so a filtered yard can be linked to from the dashboard or the palette. A deep link to a Stock Line (from the palette or the stale panel) shows every Stack that holds it.

## Empty states

Three messages, by cause: no Batches anywhere ("log a delivery"), a filter or search that matches nothing in the open Slot, and an open Slot with no Batches and no filter active. Slot and size do not count as filters, because they drive the tabs. A failed first load shows the error view instead of the skeleton, so the filter options are computed from `data ?? []` and the error check does not wait on them.

## Cards

A card shows one Batch: the ageing banner (a warning for stale, a tag for fresh and ageing), names, numbers and the sell action. Elsewhere the ageing badge is a small chip ("232 days") coloured by band. Admins also get edit and delete ([[corrections]]). The edit lists are small and readable by every member, so they are fetched for everyone; fetching them only for Admins would put the role check on the critical path for nothing.

## The CLS test

`yard-cls.spec.ts` guards a layout shift that happens when the filter row renders with its values. That happens once, from the browser cache, or twice if a select ever regresses to an empty value that fills in later. So the CLS counter must not be read before the row renders:

- The heading is server rendered and says nothing about that.
- A click would taint the entries with `hadRecentInput`.
- So the test polls the trigger for the `__reactFiber$` property React puts on every DOM node it owns.

No input is dispatched, so every shift counts. Chromium flags shifts under Playwright's mobile emulation as `hadRecentInput`, which would otherwise hide the very shift this test guards on the mobile project.

Related: [[browser-reads]], [[batches]].
