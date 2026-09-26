"use client";

import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

/* Rows read in the browser stay fresh for 10s, the same window the Next router cache uses
   (staleTimes.dynamic). A page revisited inside it paints from memory; older than that it paints
   from memory and refetches underneath. */
const STALE_MS = 10_000;

/* The cache is also written to IndexedDB, so the next open (a reload, the next morning) paints
   the last known rows before Supabase answers. Rows older than a day are dropped rather than
   shown; gcTime must be at least that long or the persister has nothing to restore. */
const KEEP_MS = 24 * 60 * 60 * 1000;

type Props = { readonly children: ReactNode; readonly cacheKey: string };

/* cacheKey is the signed-in member's email: two accounts on one device never see each other's
   last known rows, and signing in as someone else starts from an empty cache. */
export function QueryProvider({ children, cacheKey }: Props) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: STALE_MS, gcTime: KEEP_MS, refetchOnWindowFocus: false } },
      }),
  );
  const [persister] = useState(() =>
    createAsyncStoragePersister({
      storage: { getItem: (key) => get<string>(key).then((v) => v ?? null), setItem: set, removeItem: del },
      key: `granite-query-cache:${cacheKey}`,
    }),
  );
  /* Rows restored from disk are from a previous page life, however recent: a sale recorded just
     before a reload may not have reached the persister yet. Mark them all stale on restore so the
     screen paints from disk and every active query refetches at once. */
  const refetchRestored = useCallback(() => {
    void client.invalidateQueries();
  }, [client]);
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: KEEP_MS }} onSuccess={refetchRestored}>
      {children}
    </PersistQueryClientProvider>
  );
}

/* Every write goes through a server action; call this after one resolves so both caches let go
   of the old rows: the browser query cache (Yard, Sell) and the Next router cache (every other
   page). Invalidating all keys rather than picking them means a new write site cannot forget one. */
export function useAfterWrite(): () => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}

/* A dialog closing after a write cannot choose where focus belongs at close time. The row it was
   opened from is still mounted for a frame or two, so it looks like a valid target, and then the
   refetched rows commit and take it away, leaving focus on the body. Callers hand their choice to
   this instead: it runs once the invalidated queries have settled and the new rows have painted,
   by which point a disconnected element really is gone. The deadline keeps a stalled refetch from
   swallowing focus altogether. */
const SETTLE_TIMEOUT_MS = 3_000;

export function useAfterSettled(): (run: () => void) => void {
  const queryClient = useQueryClient();
  return useCallback(
    (run: () => void) => {
      if (typeof window === "undefined") return;
      const deadline = Date.now() + SETTLE_TIMEOUT_MS;
      const tick = () => {
        if (queryClient.isFetching() > 0 && Date.now() < deadline) {
          window.requestAnimationFrame(tick);
          return;
        }
        /* One more frame so the commit that the settled refetch triggers has painted. */
        window.requestAnimationFrame(run);
      };
      window.requestAnimationFrame(tick);
    },
    [queryClient],
  );
}

/* The persisted cache can be restored before hydration finishes, so a client view that painted
   rows would not match the server's skeleton. Views render the skeleton until this flips. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

function subscribeNever(): () => void {
  return () => {};
}
