---
code:
  - components/field.tsx
  - components/notice.tsx
  - components/customer-dialog.tsx
  - components/add-button.tsx
  - components/shell/page-header.tsx
  - components/shell/page-loading.tsx
  - components/view-state.tsx
  - components/shell/command-palette.tsx
  - lib/nav.ts
  - app/(app)/inward/inward-view.tsx
  - app/(app)/inward/inward-form.tsx
---
# Forms and shared components

- `Field`: label above the control, error below. Every form field in the app uses it.
- `Notice`: the soft bordered message block from the design, used for the side notes on Inward and Sell.
- `CustomerDialog`: add or edit a Customer. Shared by the Sell form, the Customers list and the customer detail page.
- `AddButton`: the Add button beside the Supplier and Product selects on Inward and the Customer select on Sell. It opens the same dialog as the select's inline "Add ..." row, blank instead of prefilled. Its accessible name is "Add new ..." so it never collides with the dialog's own "Add ..." submit button.
- Suppliers are added through a dialog (name and optional phone), like Products and Customers, whether from the Add button or the inline row.
- `PageHeader`: the title row with the palette trigger (desktop), the theme toggle (mobile only, since the sidebar carries it on desktop) and any page actions on the right.
- `PageLoading`: the placeholder shown while a page's server render is in flight, so a tap on the nav responds immediately. It is the destination's title above that route's skeleton ([[motion]]), whose blocks pulse and stop pulsing under reduced motion. The title is `aria-hidden` so heading-based readiness signals and screen readers are unaffected.
- Command palette: search or jump to pages, Stock Lines and Customers ([[browser-reads]]).
- Navigation: the mobile tab bar shows the first four pages and the rest live under More. Pages whose rows come from the browser cache render an empty shell on the server, so the nav prefetches that shell in full and a click needs no server round trip.
- Phone width: a bare `grid` has one auto-sized column that grows to its widest child, so a long selected supplier, product or customer name pushed Inward and Sell past the screen and the Add buttons out of view. The form grids on those pages say `grid-cols-1` (a `minmax(0, 1fr)` track) so children shrink and the select labels truncate. A 375px Playwright check in `responsive.spec.ts` selects long names and asserts no sideways page scroll. `/customers` did not overflow at 375px with 1,000 customers (long single-word and multi-word names, 20-character phones, every type, recent purchases), so it has no code change; a second 375px check seeds that data to keep it that way. At 320px the fixed bottom nav and the KPI row do reach about 9px past the screen, which is outside the 375px target.

The searchable select used across forms has its own note: [[search-select]].

Related: [[sales-and-stock-lines]], [[sell-cart]], [[batches]].
