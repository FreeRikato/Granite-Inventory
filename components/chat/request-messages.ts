import type { UIMessage } from "ai";

export function withoutEarlierQueryRows(messages: readonly UIMessage[]): UIMessage[] {
  return messages.flatMap((message, index) => {
    if (index === messages.length - 1) return [message];
    const parts = message.parts.filter((part) => part.type !== "tool-run_query");
    return parts.some((part) => part.type !== "step-start") ? [{ ...message, parts }] : [];
  });
}
