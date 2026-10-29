"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/use-online";

export function OfflineNotice() {
  const online = useOnline();
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
