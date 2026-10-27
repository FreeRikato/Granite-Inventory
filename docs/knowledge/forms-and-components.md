---
code:
  - components/field.tsx
  - components/notice.tsx
  - components/customer-dialog.tsx
  - components/add-button.tsx
  - components/shell/page-header.tsx
  - components/shell/page-loading.tsx
  - components/shell/command-palette.tsx
  - lib/nav.ts
  - lib/use-single-flight.ts
---
# Forms and shared components

- `Field`: label above the control, error below. Every form field in the app uses it.
- `Notice`: the soft bordered message block from the design, used for the side notes on Inward and Sell.
- `CustomerDialog`: add or edit a Customer. Shared by the Sell form, the Customers list and the customer detail page.
- `AddButton`: the Add button beside the Supplier and Product selects on Inward and the Customer select on Sell. It opens the same dialog as the select's inline "Add ..." row, blank instead of prefilled. Its accessible name is "Add new ..." so it never collides with the dialog's own "Add ..." submit button.
- Suppliers are added through a dialog (name and optional phone), like Products and Customers, whether from the Add button or the inline row.
- `PageHeader`: the title row with the palette trigger (desktop), the theme toggle (mobile only, since the sidebar carries it on desktop) and any page actions on the right.
- `PageLoading`: the static placeholder shown while a page's server render is in flight, so a tap on the nav responds immediately. It has no animation on purpose, and its title is `aria-hidden` so heading-based readiness signals and screen readers are unaffected.
- Command palette: search or jump to pages, Stock Lines and Customers ([[browser-reads]]).
- Navigation: the mobile tab bar shows the first four pages and the rest live under More. Pages whose rows come from the browser cache render an empty shell on the server, so the nav prefetches that shell in full and a click needs no server round trip.
- `useSingleFlight`: every write from a form, dialog or button goes through it instead of a bare `useTransition`. The pending flag only reaches the button after React re-renders, so several clicks in the same tick all reach the handler and each sends the write. The hook sets a ref on the first call and drops later calls until the write settles. A repeated phone was already deduplicated by `create_customer`, but customers without a phone are not unique by name on purpose (walk-ins), so the guard lives in the client and the database gets no name constraint. Tests: `tests/e2e/single-flight.spec.ts`.

The searchable select used across forms has its own note: [[search-select]].

Related: [[sales-and-stock-lines]], [[batches]].
