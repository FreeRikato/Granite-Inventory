"use client";

import { useSyncExternalStore } from "react";

type Props = { readonly updatedAt: number; readonly fetching: boolean };

/* The rows on screen may have come from disk, hours old, while the refetch is still in flight.
   Saying so keeps a stale number honest: "Updated 9h ago" flips to "just now" when it lands. */
export function DataAge({ updatedAt, fetching }: Props) {
  const now = useSyncExternalStore(subscribeMinute, () => Date.now(), () => 0);
  if (fetching) return <span className="text-xs text-muted-foreground">Refreshing…</span>;
  if (updatedAt === 0 || now === 0) return null;
  return <span className="text-xs text-muted-foreground">Updated {ago(now - updatedAt)}</span>;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* Re-render once a minute so the label ages without a data change. */
function subscribeMinute(notify: () => void): () => void {
  const id = setInterval(notify, 60_000);
  return () => clearInterval(id);
}
