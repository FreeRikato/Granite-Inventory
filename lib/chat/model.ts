import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

const PRIMARY_MODEL = "deepseek/deepseek-v4.1-flash-1017";
const FALLBACK_MODEL = "google/gemma-4-31b-it:free";

export type ChatModel = Exclude<LanguageModel, string>;

function testLoginEnabled(): boolean {
  return process.env.E2E_TEST_LOGIN === "1" && process.env.NODE_ENV !== "production";
}

export async function chatModel(): Promise<ChatModel | null> {
  if (testLoginEnabled()) {
    const { cannedChatModel } = await import("@/lib/chat/test-model");
    return cannedChatModel();
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return createOpenRouter({ apiKey }).chat(PRIMARY_MODEL, { models: [FALLBACK_MODEL] });
}

export function chatFallbackModel(): ChatModel | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (testLoginEnabled() || !apiKey) return null;
  return createOpenRouter({ apiKey }).chat(FALLBACK_MODEL);
}
