"use client";

import "./no-devtools";
import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Plus, SendHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const bottom = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const phase = chatPhase(messages, status);

  useEffect(() => {
    if (status === "ready") void (messages.length > 0 ? saveChatHistory(email, messages) : clearChatHistory(email));
  }, [email, messages, status]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, error]);

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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask about stock, sales or margin, for example "which supplier has the most stale batches?"
          </p>
        ) : null}
        {messages.map((message, index) =>
          message.role === "user" ? (
            <p
              key={message.id}
              data-testid="chat-user-message"
              className="max-w-[85%] self-end rounded-card bg-secondary px-3 py-2 text-sm"
            >
              {textOf(message).join(" ")}
            </p>
          ) : (
            <AssistantAnswer
              key={message.id}
              message={message}
              settled={status === "ready" || index < messages.length - 1}
            />
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
        <div ref={bottom} />
      </div>
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
