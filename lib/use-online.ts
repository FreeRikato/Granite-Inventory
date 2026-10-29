"use client";

import { useSyncExternalStore } from "react";

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
}

function subscribeConnection(notify: () => void): () => void {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}
