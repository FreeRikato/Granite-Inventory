"use client";

import { useMember } from "@/components/shell/member-provider";
import { useAsk } from "./ask-provider";
import { ChatThread } from "./chat-thread";

export function AskPanel() {
  const { open, close } = useAsk();
  const { email } = useMember();
  if (!open) return null;

  return (
    <aside
      aria-label="Ask"
      data-testid="chat-panel"
      data-ask-open
      className="fixed inset-0 z-[45] flex flex-col bg-card shadow-sm xl:left-auto xl:w-[380px] xl:border-l xl:border-border"
    >
      <ChatThread email={email} onClose={close} />
    </aside>
  );
}
