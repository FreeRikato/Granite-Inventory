"use client";

import "./no-devtools";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMember } from "@/components/shell/member-provider";
import { answerSource } from "./chat-answer";
import { clearChatHistory, loadChatHistory, saveChatHistory } from "./chat-history";
import { PHASE_TEXT, chatPhase, type ChatPhase } from "./chat-phase";
import { withoutEarlierQueryRows } from "./request-messages";

const STREAM_THROTTLE_MS = 50;
const ANSWER_READY_TEXT = "Answer ready";

const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: withoutEarlierQueryRows(messages) } }),
});

type PanelState = "unmounted" | "open" | "closed";
type Chat = Pick<ReturnType<typeof useChat>, "messages" | "sendMessage" | "status" | "error">;
type AskPanelControls = {
  readonly panel: PanelState;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly toggle: () => void;
  readonly close: () => void;
};
type AskThread = Chat & {
  readonly phase: ChatPhase | null;
  readonly historyReady: boolean;
  readonly announcement: string;
  readonly newChat: () => void;
};

const AskPanelContext = createContext<AskPanelControls | null>(null);
const AskThreadContext = createContext<AskThread | null>(null);

export function AskProvider({ children }: { readonly children: ReactNode }) {
  const { email } = useMember();
  const [panel, setPanel] = useState<PanelState>("unmounted");
  const [historyReady, setHistoryReady] = useState(false);
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const { messages, sendMessage, setMessages, stop, status, error, clearError } = useChat({
    transport,
    throttle: STREAM_THROTTLE_MS,
    onFinish: ({ message }) => setFinishedId(answerSource(message, true) ? message.id : null),
  });

  useEffect(() => {
    let current = true;
    void loadChatHistory(email).then((history) => {
      if (!current) return;
      setMessages(history);
      setHistoryReady(true);
    });
    return () => {
      current = false;
    };
  }, [email, setMessages]);

  useEffect(() => {
    if (!historyReady || status !== "ready" || messages.length === 0) return;
    void saveChatHistory(email, messages);
  }, [email, historyReady, messages, status]);

  const phase = chatPhase(messages, status);
  const answerReady = status === "ready" && finishedId !== null && messages.at(-1)?.id === finishedId;
  const announcement = phase ? PHASE_TEXT[phase] : answerReady ? ANSWER_READY_TEXT : "";

  const close = useCallback(() => {
    buttonRef.current?.focus();
    setPanel((state) => (state === "open" ? "closed" : state));
  }, []);
  const toggle = useCallback(() => setPanel((state) => (state === "open" ? "closed" : "open")), []);
  const newChat = useCallback(() => {
    void stop();
    clearError();
    setMessages([]);
    void clearChatHistory(email);
  }, [stop, clearError, setMessages, email]);

  const controls = useMemo(() => ({ panel, buttonRef, toggle, close }), [panel, toggle, close]);
  const thread = useMemo(
    () => ({ messages, sendMessage, status, error, phase, historyReady, announcement, newChat }),
    [messages, sendMessage, status, error, phase, historyReady, announcement, newChat],
  );

  return (
    <AskPanelContext.Provider value={controls}>
      <AskThreadContext.Provider value={thread}>{children}</AskThreadContext.Provider>
    </AskPanelContext.Provider>
  );
}

export function useAskPanel(): AskPanelControls {
  const controls = useContext(AskPanelContext);
  if (!controls) throw new Error("useAskPanel must be used inside AskProvider");
  return controls;
}

export function useAskThread(): AskThread {
  const thread = useContext(AskThreadContext);
  if (!thread) throw new Error("useAskThread must be used inside AskProvider");
  return thread;
}
