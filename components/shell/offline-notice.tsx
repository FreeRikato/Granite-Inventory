"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

export function OfflineNotice() {
  const online = useSyncExternalStore(
    subscribeConnection,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" data-testid="offline-status">
      {online ? null : (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-white">
          <WifiOff className="size-4" aria-hidden />
          You are offline
        </div>
      )}
    </div>
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
