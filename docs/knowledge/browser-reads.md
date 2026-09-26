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
  - components/shell/command-palette.tsx
  - tests/e2e/client-reads.spec.ts
  - tests/e2e/persisted-reads.spec.ts
  - tests/e2e/router-cache.spec.ts
  - tests/e2e/loading.spec.ts
---
# Browser reads and caching

The main pages (Overview, Yard, Sell, Customers, Inward) are static shells: the server renders no data and reads no `searchParams`, so the router can prefetch the whole shell and a sidebar click paints with no server round trip. The rows come straight from Supabase into the browser.

## Reads

`lib/query/reads.ts` holds the browser-side reads. Each is one PostgREST call with the user's JWT, so RLS decides what comes back exactly as it does on the server ([[access-model]]). Overview, Yard and Sell share the batches query, so visiting one warms the others; each view narrows it itself.

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
