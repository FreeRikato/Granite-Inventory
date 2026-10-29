"use client";

import "./no-devtools";
import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
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
import { NO_ANSWER_TEXT, chatErrorText, endedWithoutAnswer } from "./chat-error";
import { clearChatHistory, loadChatHistory, saveChatHistory } from "./chat-history";
import { chatPhase } from "./chat-phase";
import { withoutEarlierQueryRows } from "./request-messages";

const STREAM_THROTTLE_MS = 50;

const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: withoutEarlierQueryRows(messages) } }),
});

type Props = { readonly email: string; readonly onClose: () => void };

export function ChatThread({ email, onClose }: Props) {
  const [history, setHistory] = useState<UIMessage[] | null>(null);
  useEffect(() => {
    void loadChatHistory(email).then(setHistory);
  }, [email]);
  return history ? <ChatSession email={email} history={history} onClose={onClose} /> : null;
}

function textOf(message: UIMessage): string[] {
  return message.parts.flatMap((part) => (part.type === "text" && part.text ? [part.text] : []));
}

function ChatSession({ email, history, onClose }: Props & { readonly history: UIMessage[] }) {
  const { messages, sendMessage, setMessages, stop, status, error, clearError } = useChat({
    messages: history,
    transport,
    throttle: STREAM_THROTTLE_MS,
  });
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const phase = chatPhase(messages, status);

  useEffect(() => {
    if (status === "ready") void (messages.length > 0 ? saveChatHistory(email, messages) : clearChatHistory(email));
  }, [email, messages, status]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    setDraft("");
    void sendMessage({ text });
  }

  function newChat() {
    void stop();
    clearError();
    setMessages([]);
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
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
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
            disabled={!online}
            onChange={(event) => setDraft(event.target.value)}
            autoFocus
            className="h-10"
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={!online || busy || !draft.trim()}>
            <SendHorizontal />
          </Button>
        </div>
        {online ? null : <p className="text-xs text-muted-foreground">You are offline, chat needs a connection</p>}
      </form>
    </>
  );
}
