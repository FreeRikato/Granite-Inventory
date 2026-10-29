---
code:
  - lib/query/provider.tsx
  - lib/query/reads.ts
  - lib/nav.ts
  - next.config.ts
  - app/(app)/layout.tsx
  - app/(app)/page.tsx
  - app/(app)/yard/page.tsx
  - app/(app)/sell/page.tsx
  - app/(app)/customers/page.tsx
  - app/(app)/inward/page.tsx
  - app/(app)/customers/customers-view.tsx
  - app/(app)/yard/loading.tsx
  - app/(app)/sell/loading.tsx
  - app/(app)/inward/loading.tsx
  - app/(app)/customers/[id]/loading.tsx
  - components/data-age.tsx
  - components/view-state.tsx
  - components/skeletons/overview-skeleton.tsx
  - components/skeletons/yard-skeleton.tsx
  - components/skeletons/sell-skeleton.tsx
  - components/skeletons/inward-skeleton.tsx
  - components/skeletons/customers-skeleton.tsx
  - tests/e2e/route-cls.spec.ts
  - components/shell/member-provider.tsx
  - components/shell/offline-notice.tsx
  - lib/use-online.ts
  - components/shell/command-palette.tsx
  - app/(app)/customers/actions.ts
  - tests/seam/paged-reads.test.ts
  - tests/seam/all-rows.test.ts
  - tests/e2e/client-reads.spec.ts
  - tests/e2e/persisted-reads.spec.ts
  - tests/e2e/router-cache.spec.ts
  - tests/e2e/loading.spec.ts
  - tests/e2e/offline.spec.ts
  - tests/e2e/dashboard.spec.ts
  - tests/e2e/yard-filter.spec.ts
  - lib/query/writes.ts
  - tests/tooling/invalidates-after.test.ts
  - tests/e2e/write-refetch.spec.ts
  - components/yard/batch-actions.tsx
  - app/(app)/customers/[id]/sale-actions.tsx
  - app/(app)/customers/[id]/customer-actions.tsx
  - app/(app)/customers/add-customer-button.tsx
  - app/(app)/public-link/public-link-controls.tsx
  - app/(app)/settings/inventory-rules.tsx
  - app/(app)/overview-view.tsx
  - app/(app)/yard/yard-view.tsx
  - components/yard/yard-filters.tsx
---
# Browser reads and caching

The main pages (Overview, Yard, Sell, Customers, Inward) are static shells: the server renders no data and reads no `searchParams`, so the router can prefetch the whole shell and a sidebar click paints with no server round trip. The rows come straight from Supabase into the browser.

## Reads

`lib/query/reads.ts` holds the browser-side reads. Each is one PostgREST call with the user's JWT, so RLS decides what comes back exactly as it does on the server ([[access-model]]). Overview, Yard and Sell share the batches query, so visiting one warms the others; each view narrows it itself.

## Paged reads

PostgREST returns at most 1,000 rows per request (`max_rows`), and a larger answer is cut off without an error. Every list read therefore goes through `allRows` in `lib/query/reads.ts`, which asks for 1,000 rows at a time with `.range()` until a short page comes back. Each read orders by a unique key (`id`, `line_key`, or `name` then `id`) and `allRows` drops any row whose key it has already seen, so a write landing between two pages cannot show one row twice. Offset paging cannot see a row skipped by a delete in the same window; the next refetch corrects it, and keyset paging was left out as more machinery than a 10 s staleness window needs. The Customers list and its tiles, the Sell customer picker, the Yard and Overview batches, the stock lines, the products and suppliers lists and the command palette all use these readers.

If a palette read fails, `Promise.allSettled` keeps the list that did arrive and leaves the other empty; the next open asks again for whatever is still missing, and nothing is thrown into the page.

The duplicate-phone check in `createCustomerAction` reads every customer that has a phone through the same pager (`findCustomerByPhone`), so a phone held by a customer beyond the first 1,000 still returns the existing customer instead of a second one. A failed read there comes back as a `fail(...)` result like any other action error. `tests/seam/paged-reads.test.ts` seeds tagged rows past 1,000 and proves each read, the phone check and `createCustomerAction` against local Supabase; `tests/seam/all-rows.test.ts` proves the dedupe and the products and suppliers readers.

## Freshness

- Rows stay fresh for 10 s, the same window as the Next router cache (`staleTimes.dynamic` in `next.config.ts`). A page revisited inside it paints from memory; after that it paints from memory and refetches underneath. Server actions call `revalidatePath`, so a user's own writes show at once; only another user's writes can lag by up to 10 s on a revisit.
- The query cache is persisted to IndexedDB, so the next open (a reload, the next morning) paints the last known rows before Supabase answers. Rows older than a day are dropped rather than shown, and `gcTime` must be at least that long or the persister has nothing to restore. The persister writes at most once a second.
- The persisted cache is keyed by the signed-in member's email: two accounts on one device never see each other's rows, and signing in as someone else starts empty.
- Rows restored from disk come from a previous page life, however recent; a sale recorded just before a reload may not have reached the persister. So everything restored is marked stale, the screen paints from disk and every active query refetches at once.
- `DataAge` says how old the rows on screen are ("Updated 9h ago" flips to "just now" when the refetch lands), re-rendering once a minute so the label ages with no data change. The row is always 16px tall, so the label changing never moves the page. Its clock is the current minute, a value that is the same on every read until the timer ticks, which `useSyncExternalStore` requires ([[motion]]).
- The cache can be restored before hydration finishes, so views render the skeleton until a hydration flag flips; otherwise their rows would not match the server's skeleton. The skeleton is the route's own ([[motion]]), the same markup as its `loading.tsx` and its `Suspense` fallback, so the page leaves it once.

## Switching a period

The Overview Margin card (Week or Month) and Top customers card (This month, Last 90 days, All time) each key their query by the chosen period, so a switch to a period not yet cached starts a new query with no data. Both keep the previous period's rows on screen while it loads (`placeholderData: keepPreviousData`, the same as Inward's recent batches), so the card never swaps its chart for the pulse placeholder. The chart's own label and axis, and the empty message, follow the period the rows belong to (`useShownWhileSettled`), not the toggle, so a Month toggle over weekly bars never formats week starts as months.

`useDeferredValue` was tried on the Yard filter and does nothing there: the filter writes the URL with `router.replace`, which Next runs inside a transition, and React does not defer a value that changes in a non-urgent render. The input already shows every keystroke because its text is local state. What the user lacks is a sign that the list is catching up, so the filter row sets `data-pending` while the typed text differs from the URL (the 250ms debounce plus the navigation) or its own `useTransition` for a select or switch is pending, and the list beneath it dims to 60% opacity over the fast motion token through a `peer` selector. Opacity is allowed under reduced motion, so the dim stays. `yard-filter.spec.ts` types ten characters quickly and expects all ten, the dim while pending and the filtered list after; a second check flips a switch, which only the transition can flag. The first records the longest interaction as an annotation (median 56 ms over five runs before and after, same as the Yard baseline).

## After a write

Every write goes through a server action, and the caller then tells `useAfterWrite` which write it made. `invalidatesAfter` (`lib/query/writes.ts`) maps each named write to the query roots it changes and says whether the page needs a server refresh. Only those roots are invalidated, so a page refetches what the write touched and nothing else: archiving a Batch on Yard refetches the Yard batches and leaves the products and suppliers lists alone.

The roots are derived from the views and functions behind each read, not guessed. A sale changes the Yard batches, stock lines, recent batches, KPIs, fast moving, margin, top customers and the customer list. A new Batch changes the same stock reads plus the recent stacks, but not the sales aggregates. Archiving a Batch drops it from the stock lines and KPIs and leaves the recent stacks alone. Creating a product or supplier on Inward invalidates that list: the form keeps the new row in its own state, but it seeds that state from the cache when it mounts, so a trip to Sell and back showed the old list and offered "Add product" again for a name that already existed. `write-refetch.spec.ts` creates each kind, leaves for Yard or Sell, comes back and finds the row in the picker. Renaming a product or supplier changes the names inside the batch reads too; archiving or deleting one changes only its own list, because a delete is refused while any Batch references the row. Inventory rules change the stale threshold and the Yard statuses that use it. When unsure whether a write reaches a read, its root is listed: a missing root shows stale rows for up to 10 s, an extra one costs a request. `invalidates-after.test.ts` pins every write and checks each root exists in `reads.ts`.

`router.refresh()` runs only for writes made on a server-rendered page: Settings (including its product and supplier lists, named `settings-*` so the same rename made on Inward does not refresh), the Public Catalog controls, and a customer's page (edit customer, correct and delete Sale). Overview, Yard, Sell, Customers and Inward read in the browser, so a refresh there would only re-render a shell with no data. Deleting a customer leaves its page for the list, so it invalidates the customer reads and skips the refresh instead of re-rendering a page that no longer exists. The server actions still call `revalidatePath` for the router cache.

The edit dialogs for a Batch and a Sale call the write only when saved. Cancel closes the dialog and fetches nothing. Focus handling after a write is its own problem: [[focus-after-write]]. `write-refetch.spec.ts` counts the Supabase reads and the server render requests after archiving a Batch and after cancelling an edit.

## Other pieces

- The app layout resolves the signed-in Team Member once per document load and hands it to client pages through `MemberProvider`. It reads the session and the business name in parallel, so a hard load pays for the slower of the two instead of their sum. Both run as the user, so a non-member's settings read returns null under RLS and nothing renders before the redirect ([[auth-session]]).
- The command palette loads its data (pages, Stock Lines, Customers) on first open through the browser client. The data is small and RLS applies as usual. A Stock Line opens the yard filtered to it.
- `view-state.tsx` holds the shared pieces for these pages: the busy wrapper a skeleton sits in, the fade-in wrapper loaded content enters through, and the error line.

## What the specs prove

- `client-reads.spec.ts`: under `next dev` a navigation still fetches the shell from the server, because dev never prefetches. So the check is that the batches arrive through the Supabase REST API and the server's render payload carries none of them. The click being free of server round trips is a production property, measured on staging.
- `router-cache.spec.ts`: a sidebar click reaches the server as an RSC fetch (header `rsc: 1`). Prefetches carry `next-router-prefetch` and are not counted. The point is whether a revisit re-renders on the server or is served from the router cache.
- `persisted-reads.spec.ts`: holds every Supabase read and expects rows to arrive from disk anyway, and a refresh to follow however recent the disk copy is.
- `loading.spec.ts`: either the route placeholder carries the title (a cold navigation) or the prefetched shell already painted the real heading and only the rows area is busy. Both keep the destination title on screen while loading. It waits for Overview's own rows before observing, so the first busy element seen belongs to the navigation.
- `route-cls.spec.ts`: each page's cold load shows its own skeleton and no other (a parent `loading.tsx` painting the wrong one is the failure it catches), the content enters with the 200ms fade, layout shift stays within 0.02, the data age row keeps one height across a reload that paints from the disk cache, and a clock that moves on every read does not break `DataAge`.

Related: [[yard]], [[testing]].

## Offline

`OfflineNotice` sits in the app layout and shows a fixed "You are offline" bar while `useOnline` (`lib/use-online.ts`, shared with the Ask panel's input) says `navigator.onLine` is false, so a stale page painted from the disk cache is never mistaken for live data. It follows the browser's `online` and `offline` events.

The `role="status"` container is always mounted and only its child bar comes and goes, because a screen reader announces changes inside a live region that is already in the page, not one that mounts together with its text.
