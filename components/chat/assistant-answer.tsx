"use client";

import { memo, useState } from "react";
import type { UIMessage } from "ai";
import type { ParseResult } from "@openuidev/lang-core";
import { Renderer } from "@openuidev/react-lang";
import { chatLibrary } from "@/lib/chat/library";
import { answerSource } from "./chat-answer";
import { PHASE_TEXT, type ChatPhase } from "./chat-phase";

type Props = { readonly message: UIMessage; readonly settled: boolean };

export function PhaseLine({ phase }: { readonly phase: ChatPhase }) {
  return (
    <p
      data-testid="chat-phase"
      className="animate-[motion-fade_1.2s_ease-in-out_infinite_alternate] text-sm text-muted-foreground"
    >
      {PHASE_TEXT[phase]}
    </p>
  );
}

function holdsNode(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ("typeName" in value) return true;
  return Object.values(value).some(holdsNode);
}

function hasRenderedNode(result: ParseResult | null): boolean {
  return holdsNode(result?.root?.props);
}

export const AssistantAnswer = memo(function AssistantAnswer({ message, settled }: Props) {
  const [rendered, setRendered] = useState(false);
  const source = answerSource(message, settled);
  if (!source) return null;
  return (
    <div data-testid="chat-assistant-message">
      <Renderer
        response={source}
        library={chatLibrary}
        isStreaming={!settled}
        onParseResult={(result) => setRendered(hasRenderedNode(result))}
      />
      {rendered || settled ? null : <PhaseLine phase="writing" />}
    </div>
  );
});
