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
  - components/data-age.tsx
  - components/view-state.tsx
  - components/shell/member-provider.tsx
  - components/shell/offline-notice.tsx
  - components/shell/command-palette.tsx
  - app/(app)/customers/actions.ts
  - tests/seam/paged-reads.test.ts
  - tests/seam/all-rows.test.ts
  - tests/e2e/client-reads.spec.ts
  - tests/e2e/persisted-reads.spec.ts
  - tests/e2e/router-cache.spec.ts
  - tests/e2e/loading.spec.ts
  - tests/e2e/offline.spec.ts
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
- `DataAge` says how old the rows on screen are ("Updated 9h ago" flips to "just now" when the refetch lands), re-rendering once a minute so the label ages with no data change.
- The cache can be restored before hydration finishes, so views render the skeleton until a hydration flag flips; otherwise their rows would not match the server's skeleton.

## After a write

Every write goes through a server action. Afterwards the caller invalidates both caches: the browser query cache and the Next router cache. It invalidates every key rather than picking some, so a new write site cannot forget one. Focus handling after a write is its own problem: [[focus-after-write]].

## Other pieces

- The app layout resolves the signed-in Team Member once per document load and hands it to client pages through `MemberProvider`. It reads the session and the business name in parallel, so a hard load pays for the slower of the two instead of their sum. Both run as the user, so a non-member's settings read returns null under RLS and nothing renders before the redirect ([[auth-session]]).
- The command palette loads its data (pages, Stock Lines, Customers) on first open through the browser client. The data is small and RLS applies as usual. A Stock Line opens the yard filtered to it.
- `view-state.tsx` is the shared skeleton and error line for these pages.

## What the specs prove

- `client-reads.spec.ts`: under `next dev` a navigation still fetches the shell from the server, because dev never prefetches. So the check is that the batches arrive through the Supabase REST API and the server's render payload carries none of them. The click being free of server round trips is a production property, measured on staging.
- `router-cache.spec.ts`: a sidebar click reaches the server as an RSC fetch (header `rsc: 1`). Prefetches carry `next-router-prefetch` and are not counted. The point is whether a revisit re-renders on the server or is served from the router cache.
- `persisted-reads.spec.ts`: holds every Supabase read and expects rows to arrive from disk anyway, and a refresh to follow however recent the disk copy is.
- `loading.spec.ts`: either the route placeholder carries the title (a cold navigation) or the prefetched shell already painted the real heading and only the rows area is busy. Both keep the destination title on screen while loading. It waits for Overview's own rows before observing, so the first busy element seen belongs to the navigation.

Related: [[yard]], [[testing]].

## Offline

`OfflineNotice` sits in the app layout and shows a fixed "You are offline" bar while `navigator.onLine` is false, so a stale page painted from the disk cache is never mistaken for live data. It follows the browser's `online` and `offline` events.

The `role="status"` container is always mounted and only its child bar comes and goes, because a screen reader announces changes inside a live region that is already in the page, not one that mounts together with its text.
