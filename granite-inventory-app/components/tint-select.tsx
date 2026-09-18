"use client";

import { useSyncExternalStore } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_TINT, TINTS, applyTint, isTint, tintStore } from "@/lib/tint";

/* Per-device accent colour, stored in localStorage like dark mode. The server renders the
   default and the browser snapshot takes over on hydration. */
export function TintSelect() {
  const tint = useSyncExternalStore(tintStore.subscribe, tintStore.getSnapshot, tintStore.getServerSnapshot);

  return (
    <Select value={tint} onValueChange={(v) => applyTint(isTint(v) ? v : DEFAULT_TINT)}>
      <SelectTrigger className="h-10 w-44 bg-card" aria-label="Tint">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TINTS.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <span aria-hidden="true" className="size-3 rounded-full" style={{ background: t.swatch }} />
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
