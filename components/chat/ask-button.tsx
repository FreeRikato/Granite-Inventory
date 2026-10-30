"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskPanel } from "./ask-provider";

export function AskButton() {
  const { panel, toggle, buttonRef } = useAskPanel();
  return (
    <Button
      ref={buttonRef}
      variant="outline"
      className="h-10 rounded-full px-4"
      aria-expanded={panel === "open"}
      onClick={toggle}
    >
      <MessageSquare />
      Ask
    </Button>
  );
}
