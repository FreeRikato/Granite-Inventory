---
code:
  - app/globals.css
  - components/ui/button.tsx
  - components/ui/switch.tsx
  - components/ui/dialog.tsx
  - components/ui/alert-dialog.tsx
  - components/ui/popover.tsx
  - components/ui/select.tsx
  - components/ui/command.tsx
  - components/ui/sheet.tsx
  - components/ui/skeleton.tsx
  - components/ui/spinner.tsx
  - components/skeletons/parts.tsx
  - components/skeletons/overview-skeleton.tsx
  - components/skeletons/yard-skeleton.tsx
  - components/skeletons/sell-skeleton.tsx
  - components/skeletons/inward-skeleton.tsx
  - components/skeletons/customers-skeleton.tsx
  - components/skeletons/customer-skeleton.tsx
  - components/view-state.tsx
  - app/(app)/customers/[id]/page.tsx
  - tests/e2e/motion.spec.ts
  - components/shell/page-loading.tsx
  - tests/e2e/route-cls.spec.ts
  - tests/tooling/motion.test.ts
  - app/(app)/layout.tsx
  - components/shell/page-transition.tsx
  - components/shell/link-pending.tsx
  - components/shell/app-sidebar.tsx
  - components/shell/mobile-tab-bar.tsx
  - components/shell/offline-notice.tsx
  - components/ui/sonner.tsx
  - app/(app)/customers/customer-list.tsx
  - tests/e2e/navigation.spec.ts
  - lib/query/row-style.ts
  - lib/query/row-state.tsx
  - components/confirm-delete.tsx
  - components/yard/batch-card.tsx
  - components/yard/batch-actions.tsx
  - app/(app)/inward/recent-batches.tsx
  - app/(app)/sell/sell-form.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
  - app/(app)/customers/[id]/customer-actions.tsx
  - tests/e2e/write-motion.spec.ts
---
# Motion

Motion in the app is quiet and fast: one set of durations and two curves, CSS only (Tailwind and `tw-animate-css`, no animation library), and nothing animates except opacity and transform. Theme switching stays instant.

## Tokens

`app/globals.css` defines them once, in a static `@theme` block so they are always emitted:

- `--motion-fast` 150ms, `--motion-base` 200ms, `--motion-slow` 300ms.
- `--motion-ease-out` for everything that moves, arriving or leaving. `--motion-ease-in` stays defined for the day something needs it, but nothing uses it: an ease-in curve starts slowly, so a closing surface sat still for its first frames and a crossfade showed both pages half visible. `tests/tooling/motion.test.ts` fails if anything references it.

Two utilities wrap them for `tw-animate-css`, which reads `--tw-duration` and `--tw-ease`:

- `motion-enter` is base duration with the ease-out curve.
- `motion-exit` is fast duration with the ease-out curve.

Put `data-open:motion-enter` and `data-closed:motion-exit` next to `animate-in` and `animate-out`. Exit is shorter than enter on purpose: a closing surface should get out of the way, an opening one should be seen arriving. A worked example: opening a dialog fades and zooms in over 200ms; closing it fades out over 150ms.

Dialog, alert dialog, popover, select, the command palette (it is a dialog) and sheet all use the pair. The bottom sheet slides from its full height (`slide-in-from-bottom`), not from 2.5rem below its resting place, so the More menu on mobile rises from the screen edge.

Button and Switch list the properties they transition (colours, border, ring, opacity, and button's press nudge). `transition-all` is banned under `components/` and `app/` because it also animates layout properties; `tests/tooling/motion.test.ts` fails on any use.

## Reduced motion

Under `prefers-reduced-motion: reduce`, `globals.css` zeroes every `tw-animate-css` slide, zoom and rotate variable with `!important`, so the enter and exit keyframes keep only their opacity change. `animate-pulse` stops, and `animate-spin` becomes a slow opacity pulse so a spinner still reads as busy without turning. A dialog under reduced motion therefore fades and never scales.

## Loading primitives

`Skeleton` is the single loading placeholder block (muted fill, pulse) and `Spinner` the single busy icon. Later changes build page skeletons and pending rows from them; do not hand-roll `animate-pulse` divs.

## Page skeletons

Each route has one skeleton built from `Skeleton`, in `components/skeletons/`: Overview, Yard, Sell, Inward, Customers and a customer's page. Every one is static markup with no state and no client hooks, shaped like the loaded page: the same grid, the same card padding, and block heights copied from what the loaded page measures (Overview's KPI row is 193px, its margin card 352px; the data age row is 16px). A skeleton that matches by height is what keeps layout shift on load under 0.02, because the content replaces it without moving anything below it.

The same skeleton is used in three places and always inside one `aria-busy` wrapper, which `tests/e2e/loading.spec.ts` reads:

- the route's `loading.tsx`, through `PageLoading`, which adds the destination's title above it (the title is `aria-hidden`, so headings stay the readiness signal);
- the `Suspense` fallback in the route's `page.tsx`, through `ViewSkeleton`;
- the view's own pending state, until the page is hydrated and its queries have data. The page builds the skeleton once on the server and passes the same element to the view as a `skeleton` prop, so the markup travels in the page's server payload and never enters the client bundle (importing it in the views cost 3.6 KB gzipped; passing it costs 1.2 KB for the whole change).

Because it is the same markup in all three, a cold load goes from skeleton to content once. Customers has no `loading.tsx` of its own: a `loading.tsx` also wraps every route below it, so `customers/loading.tsx` would be the first thing painted on a customer's page and swap to that page's skeleton a moment later. The Customers page is a static shell, so its `Suspense` fallback already paints with the shell. For the same reason there is no `loading.tsx` at the `(app)` root: it painted the Overview skeleton, with the title "Overview", under every route on a cold load. A customer's page is server rendered, so its `loading.tsx` is the only skeleton it gets.

Loaded content enters through `ViewReady`: opacity only, on `animate-in fade-in motion-enter`, so it fades in over the base token when the skeleton goes. It plays once per mount, so a revisit that paints straight from the query cache fades in too. A customer's page is rendered by the server and wraps its content in `ViewReady` too, so it fades in the same way when it replaces its skeleton.

`DataAge` always renders its 16px row, whether it says "Refreshing…", "Updated 9m ago" or nothing, and the skeletons reserve the same row, so a refetch starting never moves what is below it. Its clock is read as the current minute, not `Date.now()`: `useSyncExternalStore` calls `getSnapshot` repeatedly and a value that changes on every call makes React warn that the snapshot is not cached, and with a clock that moves between two calls it fails the render and the page shows its error screen. The minute only changes on the timer, which fires on each minute boundary.

## Page transitions

`PageTransition` wraps the content column in the shell layout in a React `ViewTransition` keyed by the pathname. It needs no config flag in this Next version, and a browser without View Transitions just swaps the page instantly. The wrapper sits in the layout rather than in each `page.tsx` because the layout persists, so enter and exit only fire if the key changes; keying by pathname makes every route change an exit of the old page and an enter of the new one. `router.refresh()` keeps the pathname, so it is an update, and the boundary has `default="none"`, so it plays nothing.

The animation comes from the navigation's transition type, set on the `Link` with `transitionTypes`:

- no type (a nav link, the tab bar, the palette, `router.push`): `page-fade`, the old page fades out over the fast token and the new one fades in over the base token. Nothing moves. Both run on the ease-out curve: with ease-in the old page lingered near full opacity while the new one was already half in, so the two pages showed through each other.
- `nav-forward`, on a customer row: the old page slides 24px left and fades out, the new one slides in from 24px right.
- `nav-back`, on a nav link that points at a parent of the current path (`backTypes`, so Customers while on a customer's page): the same slide the other way.

Browser back and forward carry no type, and React does not start a view transition for a popstate at all, so they swap with no direction. The Customers link is the in-app way back.

The slides live in `globals.css` as `view-slide-in` and `view-slide-out`, inside `prefers-reduced-motion: no-preference`; outside it the `nav-*` classes keep only the fades, which is how reduced motion turns slides into crossfades. Every animation is opacity or `transform`, never `translate` or layout.

The sidebar and the mobile tab bar carry `view-transition-name` (`app-sidebar`, `tab-bar`), and their group, old and new snapshots plus the root have `animation: none` with the old snapshot hidden, so the shell is the live element all through the transition: it never fades or moves, and its active-link highlight changes at once. The page header is part of each page's content, not the shell, so it crossfades with its page. `::view-transition` has `pointer-events: none` so taps during the 200ms animation reach the page.

Because `::view-transition-new` is a live capture, `ViewReady`'s own fade-in plays inside it. A cached page therefore fades in twice over the same 200ms, which reads as one slightly softer fade and costs nothing.

The old and new page must have the same viewport size: Chrome aborts a transition with "Viewport size changed" if the layout viewport widens or narrows between the two states, which happens on a phone when one of them scrolls sideways. Keep skeletons and pages inside the column width.

## Pending links

`LinkPending` is the one tiny client component for every link that navigates (`useLinkStatus`): sidebar and More sheet links, the tab bar, the Settings link and customer rows. It always renders a 16px slot, so nothing shifts, and puts a `Spinner` in it only while the link is pending. The spinner appears on the tap itself, before the destination has any response, and is a `status` role so a screen reader hears "Loading". On a customer row the slot overlays the avatar. Under reduced motion the spinner pulses rather than turns (see above).

## Rows after a write

A row that a write removes goes through three states, held by `RowMark`, a hidden `data-row-state` element inside the row: `idle`, `pending` (the server has not answered) and `leaving` (it has). The row styles itself from it with `rowStateClass` (`lib/query/row-style.ts`, `has-[[data-row-state=...]]` on the row element), so the actions component that owns the write does not need a handle on the row. `rowStateClass` lives in a file without `"use client"` because the customer page, a server component, reads it too.

- `pending`: the row dims to 40% over the fast token and the delete button swaps its trash icon for the `Spinner` (`ConfirmDelete` takes `pending`). The dim is stronger than the 60% an archived or sold out Batch already has, so a pending delete of an archived Batch still reads as different. Nothing else changes, so no layout moves.
- `leaving`: the server confirmed. The row fades to 0 over the fast token on the ease-out curve, `useRowRemoval` waits `EXIT_MS` (150ms, the fast token) and only then calls the caller's `onRemoved`, which drops the Batch from the cached Yard rows (deleting a Batch) or invalidates the reads (`afterWrite`), so the row leaves the DOM once, not frame by frame.
- On a refusal the state returns to `idle`, the row stays and a toast gives the server's reason. A request that throws (a dropped connection) takes the same path with the error's message and also refetches the write's reads, since the server may have applied it: `useRowRemoval` and the Record Sale submit catch it. Left uncaught, the throw inside a transition goes to the nearest error boundary, and the page was replaced by Next's default error screen, which also lost a Sell order. Deleting a Sale was checked for the other worry, a row that unmounts before it fades: the server action's `revalidatePath` does not remove it early, and `write-motion.spec.ts` samples the row's opacity to prove it reaches 0 before the row leaves.

The collapse is a single removal, not an animation of height: animating `grid-template-rows`, `height` or `max-height` re-lays-out every sibling on every frame, and the rule here is opacity and transform only. The cost is one step where the rows below move up, after the row is already invisible. Under reduced motion the fade stays (opacity is allowed), so nothing differs.

Used by: deleting a Batch (Yard card and Inward recent batches), deleting a Sale (customer page row), deleting a customer (the page header dims and fades, then `router.push` hands over to the page transition) and recording a Sale (the cart lines dim with a spinner on each Remove button, then fade, then the cart clears).

Archiving a Batch is not in this list: it is optimistic ([[browser-reads]]), so the card changes at once and there is no pending state to show.

A cart line fades in on `animate-in fade-in motion-enter` when added. Removing a line marks it `leaving` at once and the totals, the order count and the available figures are computed without it from that moment; the line itself is taken out of the list after `EXIT_MS`. Add to order is disabled in that window, because a line re-added with the same Batch, price and stickering would otherwise be removed by the pending timer. New rows in Inward's recent batches fade in the same way.

## Toasts and the offline banner

Sonner reads its top offset from `--toast-top`. While the offline banner is in the page, `globals.css` sets it to 52px (the banner is 36px tall) through `:root:has([data-offline-banner])`, so a toast sits under the banner instead of on it. No script is involved, and a toast already on screen moves when the banner arrives.

Sonner starts a toast one toast-height above its rest position (`--y: translateY(-100%)`), which carried it over the banner for about 150ms before it settled at 52px. While the banner shows, a second rule starts the unmounted toast only 8px above rest, so its top is 44px and the 36px banner is never touched; it still fades in with Sonner's own transition. Under reduced motion Sonner removes every transition, so `globals.css` puts back an opacity-only one at `--motion-fast`: the toast fades and does not slide. `navigation.spec.ts` samples every animation frame in both orders (toast arrives with the banner showing, banner arrives with a toast showing) and counts frames where the two boxes intersect; the exit slide of a toast is not sampled.

Related: [[theming]], [[testing]], [[browser-reads]].
