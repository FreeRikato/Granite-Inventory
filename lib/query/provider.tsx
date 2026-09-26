"use client";

import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";

const STALE_MS = 10_000;

const KEEP_MS = 24 * 60 * 60 * 1000;

type Props = { readonly children: ReactNode; readonly cacheKey: string };

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
  const refetchRestored = useCallback(() => {
    void client.invalidateQueries();
  }, [client]);
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: KEEP_MS }} onSuccess={refetchRestored}>
      {children}
    </PersistQueryClientProvider>
  );
}

export function useAfterWrite(): () => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}

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
        window.requestAnimationFrame(run);
      };
      window.requestAnimationFrame(tick);
    },
    [queryClient],
  );
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

function subscribeNever(): () => void {
  return () => {};
}
