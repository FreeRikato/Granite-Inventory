"use client";

import { useSyncExternalStore } from "react";

type Props = { readonly updatedAt: number; readonly fetching: boolean };

const MINUTE_MS = 60_000;

export function DataAge({ updatedAt, fetching }: Props) {
  const now = useSyncExternalStore(subscribeMinute, currentMinute, () => 0);
  const label = fetching ? "Refreshing…" : updatedAt === 0 || now === 0 ? "" : `Updated ${ago(now - updatedAt)}`;
  return (
    <span className="block h-4 text-xs text-muted-foreground" data-testid="data-age">
      {label}
    </span>
  );
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

function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

function subscribeMinute(notify: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    timer = setTimeout(
      () => {
        notify();
        schedule();
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    );
  };
  schedule();
  return () => clearTimeout(timer);
}
