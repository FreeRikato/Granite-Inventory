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

Related: [[theming]], [[testing]], [[browser-reads]].
