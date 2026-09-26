---
code:
  - components/field.tsx
  - components/notice.tsx
  - components/customer-dialog.tsx
  - components/shell/page-header.tsx
  - components/shell/page-loading.tsx
  - components/shell/command-palette.tsx
  - lib/nav.ts
---
# Forms and shared components

- `Field`: label above the control, error below. Every form field in the app uses it.
- `Notice`: the soft bordered message block from the design, used for the side notes on Inward and Sell.
- `CustomerDialog`: add or edit a Customer. Shared by the Sell form, the Customers list and the customer detail page.
- `PageHeader`: the title row with the palette trigger (desktop), the theme toggle (mobile only, since the sidebar carries it on desktop) and any page actions on the right.
- `PageLoading`: the static placeholder shown while a page's server render is in flight, so a tap on the nav responds immediately. It has no animation on purpose, and its title is `aria-hidden` so heading-based readiness signals and screen readers are unaffected.
- Command palette: search or jump to pages, Stock Lines and Customers ([[browser-reads]]).
- Navigation: the mobile tab bar shows the first four pages and the rest live under More. Pages whose rows come from the browser cache render an empty shell on the server, so the nav prefetches that shell in full and a click needs no server round trip.

The searchable select used across forms has its own note: [[search-select]].

Related: [[sales-and-stock-lines]], [[batches]].
