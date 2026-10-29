"use client";

import { memo } from "react";
import type { UIMessage } from "ai";
import { Renderer } from "@openuidev/react-lang";
import { cn } from "cn";
import { Message, MessageContent } from "@/components/ui/message";
import { MessageScrollerItem } from "@/components/ui/message-scroller";
import { chatLibrary } from "@/lib/chat/library";
import { answerSource } from "./chat-answer";
import { PHASE_TEXT, type ChatPhase } from "./chat-phase";
import { AnswerStreamingContext } from "./visuals/answer-streaming";

type Props = { readonly message: UIMessage; readonly settled: boolean };

export function PhaseLine({ phase, className }: { readonly phase: ChatPhase; readonly className?: string }) {
  return (
    <p
      data-testid="chat-phase"
      className={cn(
        "animate-[motion-fade_1.2s_ease-in-out_infinite_alternate] text-sm text-muted-foreground",
        className,
      )}
    >
      {PHASE_TEXT[phase]}
    </p>
  );
}

export const AssistantAnswer = memo(function AssistantAnswer({ message, settled }: Props) {
  const source = answerSource(message, settled);
  if (!source) return null;
  return (
    <MessageScrollerItem messageId={message.id} className="animate-in fade-in motion-enter">
      <Message>
        <MessageContent>
          <div data-testid="chat-assistant-message" className="group/answer">
            <AnswerStreamingContext value={!settled}>
              <Renderer response={source} library={chatLibrary} isStreaming={!settled} />
            </AnswerStreamingContext>
            {settled ? null : (
              <PhaseLine phase="writing" className="group-has-[[data-slot=answer-stack]>*]/answer:hidden" />
            )}
          </div>
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  );
});
