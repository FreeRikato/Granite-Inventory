import { safeValidateUIMessages, type UIMessage } from "ai";
import { del, get, set } from "idb-keyval";

const historyKey = (email: string) => `granite-chat:${email}`;

export async function loadChatHistory(email: string): Promise<UIMessage[]> {
  const stored: unknown = await get(historyKey(email)).catch(() => null);
  if (!stored) return [];
  const checked = await safeValidateUIMessages({ messages: stored });
  return checked.success ? checked.data : [];
}

export function saveChatHistory(email: string, messages: readonly UIMessage[]): Promise<void> {
  return set(historyKey(email), messages).catch(() => undefined);
}

export function clearChatHistory(email: string): Promise<void> {
  return del(historyKey(email)).catch(() => undefined);
}
