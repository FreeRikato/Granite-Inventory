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
---
# Yard

## Derived, never stored

Age, Ageing Band, Sold Out and the Clamp gap are all derived in the yard view from raw Batch facts and the two thresholds in settings (ageing after, stale after). Age is counted on the [[ist-calendar]].

## Ordering and grouping

Batches of one Stock Line stay together, so the Clamp (the virtual divider between two deliveries of the same stone) sits between them. Lines are ordered by their oldest batch, and batches within a line by date. Filtering applies every filter except slot and size, because those two drive the tabs.

## Filters and links

Every filter lives in the URL, so a filtered yard can be linked to from the dashboard or the palette. A deep link to a Stock Line (from the palette or the stale panel) lands on that line's own slot.

## Cards

A card shows one Batch: the ageing banner (a warning for stale, a tag for fresh and ageing), names, numbers and the sell action. Elsewhere the ageing badge is a small chip ("232 days") coloured by band. Admins also get edit and delete ([[corrections]]). The edit lists are small and readable by every member, so they are fetched for everyone; fetching them only for Admins would put the role check on the critical path for nothing.

## The CLS test

`yard-cls.spec.ts` guards a layout shift that happens when the filter row renders with its values. That happens once, from the browser cache, or twice if a select ever regresses to an empty value that fills in later. So the CLS counter must not be read before the row renders:

- The heading is server rendered and says nothing about that.
- A click would taint the entries with `hadRecentInput`.
- So the test polls the trigger for the `__reactFiber$` property React puts on every DOM node it owns.

No input is dispatched, so every shift counts. Chromium flags shifts under Playwright's mobile emulation as `hadRecentInput`, which would otherwise hide the very shift this test guards on the mobile project.

Related: [[browser-reads]], [[batches]].
