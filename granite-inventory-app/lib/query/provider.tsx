"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";

/* Rows read in the browser stay fresh for 10s, the same window the Next router cache uses
   (staleTimes.dynamic). A page revisited inside it paints from memory; older than that it paints
   from memory and refetches underneath. */
const STALE_MS = 10_000;

export function QueryProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: STALE_MS, refetchOnWindowFocus: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
