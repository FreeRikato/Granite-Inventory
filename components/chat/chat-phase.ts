import type { ChatStatus, UIMessage } from "ai";
import { answerSource } from "./chat-answer";

export type ChatPhase = "thinking" | "querying" | "writing";

export const PHASE_TEXT: Record<ChatPhase, string> = {
  thinking: "Thinking...",
  querying: "Querying your data...",
  writing: "Writing the answer...",
};

type Part = UIMessage["parts"][number];

function isPendingQuery(part: Part): boolean {
  return part.type === "tool-run_query" && part.state !== "output-available" && part.state !== "output-error";
}

function isWriting(part: Part | undefined): boolean {
  return part?.type === "text" && part.text.trim() !== "";
}

export function chatPhase(messages: readonly UIMessage[], status: ChatStatus): ChatPhase | null {
  if (status !== "submitted" && status !== "streaming") return null;
  const last = messages.at(-1);
  if (last?.role !== "assistant") return "thinking";
  if (answerSource(last, false)) return null;
  if (last.parts.some(isPendingQuery)) return "querying";
  const lastPart = last.parts.filter((part) => part.type !== "step-start").at(-1);
  return isWriting(lastPart) ? "writing" : "thinking";
}
