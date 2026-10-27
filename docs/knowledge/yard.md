---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - supabase/migrations/20260911110000_yard_view.sql
  - lib/yard.ts
  - app/(app)/yard/page.tsx
  - app/(app)/yard/yard-view.tsx
  - components/yard/yard-filters.tsx
  - components/yard/batch-card.tsx
  - components/yard/clamp.tsx
  - components/ageing-badge.tsx
  - tests/e2e/yard-cls.spec.ts
---
# Yard

## Derived, never stored

Age, Ageing Band, Sold Out and the Clamp gap are all derived in the yard view from raw Batch facts and the two thresholds in settings (ageing after, stale after). Age is counted on the [[ist-calendar]].

## Ordering and grouping

The yard is one section per Stack, the pile named by a Slot and a Batch number ([[batches]]). `groupByStack` in `lib/yard.ts` orders sections by Slot, then by Batch number with a numeric compare so 2 sorts before 10; Batches without a number fall into a last "No batch number" section. Slot is an ordinary filter now, so `/yard?slot=5FT` still narrows the page. Typed slots ([[batches]]) sort after the built-ins, alphabetically, and appear in the Slot filter. Archived Batches are hidden unless `?archived=1` ("Show archived"), and a section's available count leaves them out, since they are not stock anyone can sell.

Inside a section, Batches of one Stock Line stay together, so the Clamp (the virtual divider between two deliveries of the same stone) sits between them. Lines are ordered by their oldest batch, and batches within a line by date.

## Filters and links

Every filter lives in the URL, so a filtered yard can be linked to from the dashboard or the palette. A deep link to a Stock Line (from the palette or the stale panel) shows every Stack that holds it.

## Empty states

Three messages, by cause: no Batches anywhere ("log a delivery"), a filter or search that matches nothing in the open Slot, and an open Slot with no Batches and no filter active. Slot and size do not count as filters, because they drive the tabs.

## Cards

A card shows one Batch: the ageing banner (a warning for stale, a tag for fresh and ageing), names, numbers and the sell action. Elsewhere the ageing badge is a small chip ("232 days") coloured by band. Admins also get edit and delete ([[corrections]]). The edit lists are small and readable by every member, so they are fetched for everyone; fetching them only for Admins would put the role check on the critical path for nothing.

## The CLS test

`yard-cls.spec.ts` guards a layout shift that happens when the filter row renders with its values. That happens once, from the browser cache, or twice if a select ever regresses to an empty value that fills in later. So the CLS counter must not be read before the row renders:

- The heading is server rendered and says nothing about that.
- A click would taint the entries with `hadRecentInput`.
- So the test polls the trigger for the `__reactFiber$` property React puts on every DOM node it owns.

No input is dispatched, so every shift counts. Chromium flags shifts under Playwright's mobile emulation as `hadRecentInput`, which would otherwise hide the very shift this test guards on the mobile project.

Related: [[browser-reads]], [[batches]].
