import type { ChatStatus, UIMessage } from "ai";
import { answerSource } from "./chat-answer";

export const NO_ANSWER_TEXT = "I could not finish that answer. Try asking a narrower question.";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function chatErrorText(error: Error): string {
  const body = parseJson(error.message);
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : error.message;
}

export function endedWithoutAnswer(messages: readonly UIMessage[], status: ChatStatus): boolean {
  const last = messages.at(-1);
  if (status !== "ready" || !last) return false;
  return last.role === "user" || answerSource(last, true) === null;
}
