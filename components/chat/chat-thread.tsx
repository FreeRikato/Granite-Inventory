"use client";

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { Plus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Input } from "@/components/ui/input";
import { Message } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { useOnline } from "@/lib/use-online";
import { AssistantAnswer, PhaseLine } from "./assistant-answer";
import { useAskPanel, useAskThread } from "./ask-provider";
import { NO_ANSWER_TEXT, chatErrorText, endedWithoutAnswer } from "./chat-error";

const TOUCH_POINTER = "(pointer: coarse)";

function textOf(message: UIMessage): string[] {
  return message.parts.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []));
}

export function ChatThread() {
  const { messages, sendMessage, status, error, phase, historyReady, announcement, newChat } = useAskThread();
  const { panel, close } = useAskPanel();
  const online = useOnline();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (panel === "open" && !window.matchMedia(TOUCH_POINTER).matches) inputRef.current?.focus({ preventScroll: true });
  }, [panel]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    setDraft("");
    void sendMessage({ text });
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-base font-bold">Ask</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={newChat}>
            <Plus />
            New chat
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
            <X />
          </Button>
        </div>
      </div>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport className="px-4 py-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask about stock, sales or margin, for example "which supplier has the most stale batches?"
              </p>
            ) : null}
            <MessageScrollerContent className="gap-4">
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor
                    className="animate-in fade-in motion-enter"
                  >
                    <Message align="end">
                      <Bubble variant="secondary" align="end" className="max-w-[85%]">
                        <BubbleContent data-testid="chat-user-message" className="rounded-card">
                          {textOf(message).join(" ")}
                        </BubbleContent>
                      </Bubble>
                    </Message>
                  </MessageScrollerItem>
                ) : (
                  <AssistantAnswer key={message.id} message={message} settled={!busy || index < messages.length - 1} />
                ),
              )}
              {phase ? <PhaseLine phase={phase} /> : null}
              {endedWithoutAnswer(messages, status) ? (
                <p data-testid="chat-no-answer" className="text-sm text-muted-foreground">
                  {NO_ANSWER_TEXT}
                </p>
              ) : null}
              {error ? (
                <p role="alert" data-testid="chat-error" className="text-sm text-stale">
                  {chatErrorText(error)}
                </p>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton data-testid="chat-jump-latest" />
        </MessageScroller>
      </MessageScrollerProvider>
      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Ask a question"
            placeholder="Ask about your stock and sales"
            value={draft}
            disabled={!online || !historyReady}
            onChange={(event) => setDraft(event.target.value)}
            ref={inputRef}
            className="h-10"
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={!online || busy || !draft.trim()}>
            <SendHorizontal />
          </Button>
        </div>
        {online ? null : <p className="text-xs text-muted-foreground">You are offline, chat needs a connection</p>}
      </form>
      <p role="status" data-testid="chat-live" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
