import {
  APICallError,
  convertToModelMessages,
  isStepCount,
  pruneMessages,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from "ai";
import { allRows, type Db } from "@/lib/query/reads";
import { componentPrompt } from "@/lib/chat/library-prompt";
import { aliasCustomerNames, type NamedCustomer } from "@/lib/chat/alias";
import { buildSystemPrompt, istToday, loadChatViews } from "@/lib/chat/system-prompt";
import type { ChatModel } from "@/lib/chat/model";
import { createChatTools } from "@/lib/chat/tools";

const MAX_TOOL_STEPS = 5;
const QUERIES_BEFORE_ANSWER = 2;
const ANSWER_NOW =
  "Tools are off. Using only the rows already returned, write the answer now as OpenUI Lang. The first line must be root = Stack( and the reply must not contain a tool call.";
const ANSWER_WITHOUT_DATA =
  "Tools are off. No query returned any rows, so you have no figures. Write the answer now as OpenUI Lang: the first line must be root = Stack( and it holds one Text saying you could not get that data, or that there is none. Do not state, estimate or guess any number. The reply must not contain a tool call.";
const STREAM_PRELUDE: ReadonlySet<string> = new Set(["stream-start", "response-metadata", "raw"]);

export const RATE_LIMIT_MESSAGE = "Daily limit reached, try again after 5:30 AM";
export const GENERIC_ERROR_MESSAGE = "Something went wrong, please try again";

export function chatErrorMessage(error: unknown): string {
  return APICallError.isInstance(error) && error.statusCode === 429 ? RATE_LIMIT_MESSAGE : GENERIC_ERROR_MESSAGE;
}

function memberCustomers(db: Db): Promise<NamedCustomer[]> {
  return allRows<NamedCustomer>(
    (from, to) => db.from("customers").select("id, name").order("id").range(from, to),
    (row) => row.id,
  );
}

async function peekAnswerStart<Part extends { readonly type: string }>(stream: ReadableStream<Part>) {
  const reader = stream.getReader();
  const seen: Part[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen.push(value);
    if (!STREAM_PRELUDE.has(value.type)) break;
  }
  const replay = new ReadableStream<Part>({
    start: (controller) => seen.forEach((part) => controller.enqueue(part)),
    pull: async (controller) => {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { failedBeforeAnswer: seen.at(-1)?.type === "error", replay };
}

function retryOnceOn(primary: ChatModel, fallback: ChatModel): ChatModel {
  const backup = wrapLanguageModel({ model: fallback, middleware: [] });
  let retried = false;
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v4",
      wrapStream: async ({ doStream, params }) => {
        const retry = () => {
          retried = true;
          return backup.doStream(params);
        };
        let started: Awaited<ReturnType<typeof doStream>>;
        try {
          started = await doStream();
        } catch (error) {
          if (retried || (APICallError.isInstance(error) && error.statusCode === 429)) throw error;
          return retry();
        }
        const { failedBeforeAnswer, replay } = await peekAnswerStart(started.stream);
        if (!failedBeforeAnswer || retried) return { ...started, stream: replay };
        await replay.cancel();
        return retry();
      },
    },
  });
}

function aliasMessages(messages: readonly UIMessage[], customers: readonly NamedCustomer[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === "text" ? { ...part, text: aliasCustomerNames(part.text, customers) } : part,
    ),
  }));
}

export async function answerChat(input: {
  readonly messages: readonly UIMessage[];
  readonly db: Db;
  readonly model: ChatModel;
  readonly fallbackModel?: ChatModel | null;
}): Promise<Response> {
  const [customers, views] = await Promise.all([memberCustomers(input.db), loadChatViews(input.db)]);
  const tools = createChatTools(input.db);
  const system = buildSystemPrompt({ views, today: istToday(), components: componentPrompt() });
  const result = streamText({
    model: input.fallbackModel ? retryOnceOn(input.model, input.fallbackModel) : input.model,
    system,
    messages: pruneMessages({
      messages: await convertToModelMessages(aliasMessages(input.messages, customers), { tools }),
      toolCalls: [{ type: "before-last-message", tools: ["run_query"] }],
    }),
    tools,
    stopWhen: isStepCount(MAX_TOOL_STEPS),
    prepareStep: ({ stepNumber, steps }) => {
      const queriesWithRows = steps
        .flatMap((step) => step.toolResults)
        .filter(
          (result) => result.toolName === "run_query" && Array.isArray(result.output) && result.output.length > 0,
        );
      const forced = stepNumber === MAX_TOOL_STEPS - 1 || queriesWithRows.length >= QUERIES_BEFORE_ANSWER;
      const order = queriesWithRows.length > 0 ? ANSWER_NOW : ANSWER_WITHOUT_DATA;
      return forced ? { toolChoice: "none", instructions: `${system}\n\n${order}` } : {};
    },
    maxRetries: 0,
    onFinish: ({ response, steps }) => {
      console.info(JSON.stringify({ event: "chat_answer", modelId: response.modelId, steps: steps.length }));
    },
  });
  return result.toUIMessageStreamResponse({ onError: chatErrorMessage });
}
