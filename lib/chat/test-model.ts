import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const ALIAS_QUERY = "select customer_alias from v_chat_customers where not is_walk_in order by customer_alias limit 1";

function toolCallStream() {
  return simulateReadableStream({
    chunks: [
      {
        type: "tool-call" as const,
        toolCallId: "canned-1",
        toolName: "run_query",
        input: JSON.stringify({ sql: ALIAS_QUERY }),
      },
      { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage: USAGE },
    ],
  });
}

function answerStream(alias: string) {
  const reply = [
    "root = Stack([chart, note])",
    'chart = BarChart(["Black Pearl", "Jet Black", "Doom Stone"], [{name: "Units in stock", values: [7, 6, 9]}])',
    `note = Text("${alias} bought the most Black Pearl. Black Pearl, Jet Black and Doom Stone stock is shown above.")`,
  ].join("\n");
  return simulateReadableStream({
    chunks: [
      { type: "text-start" as const, id: "canned-text" },
      { type: "text-delta" as const, id: "canned-text", delta: reply },
      { type: "text-end" as const, id: "canned-text" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage: USAGE },
    ],
  });
}

function aliasInToolResult(prompt: readonly { role: string }[]): string {
  const tool = prompt.findLast((message) => message.role === "tool");
  return JSON.stringify(tool).match(/C-[0-9a-f]{6}/)?.[0] ?? "C-000000";
}

export function cannedChatModel() {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: prompt.some((message) => message.role === "tool")
        ? answerStream(aliasInToolResult(prompt))
        : toolCallStream(),
    }),
  });
}
