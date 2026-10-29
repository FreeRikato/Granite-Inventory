"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsk } from "./ask-provider";

export function AskButton() {
  const { open, toggle } = useAsk();
  return (
    <Button variant="outline" className="h-10 rounded-full px-4" aria-expanded={open} onClick={toggle}>
      <MessageSquare />
      Ask
    </Button>
  );
}
