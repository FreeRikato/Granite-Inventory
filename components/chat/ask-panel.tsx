"use client";

import { useEffect, useRef } from "react";
import { useAskPanel } from "./ask-provider";
import { ChatThread } from "./chat-thread";

export function AskPanel() {
  const { panel, close } = useAskPanel();
  const ref = useRef<HTMLElement>(null);
  const mounted = panel !== "unmounted";

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, [mounted, close]);

  if (!mounted) return null;
  const open = panel === "open";

  return (
    <aside
      ref={ref}
      aria-label="Ask"
      data-testid="chat-panel"
      data-state={panel}
      data-ask-open={open ? "" : undefined}
      inert={!open}
      className="fixed inset-0 z-[45] flex flex-col bg-card shadow-sm transition-[transform,opacity] duration-(--motion-base) ease-(--motion-ease-out) starting:transform-[translateX(100%)] starting:opacity-0 data-[state=closed]:transform-[translateX(100%)] data-[state=closed]:opacity-0 data-[state=closed]:ease-(--motion-ease-in) motion-reduce:transition-[opacity] xl:left-auto xl:w-[380px] xl:border-l xl:border-border"
    >
      <ChatThread />
    </aside>
  );
}
