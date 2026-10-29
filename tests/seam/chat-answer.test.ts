import { APICallError, simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { answerChat } from "@/lib/chat/answer";
import { chatFallbackModel, chatModel } from "@/lib/chat/model";
import { aliasCustomerNames, customerAlias } from "@/lib/chat/alias";
import { createClient } from "@/lib/supabase/server";
import { createBatch, createCustomer, createProduct, createSupplier, recordSale } from "./fixtures";
import { ensureTestUsers, resetDomainData, signedInClient, sql, type Db } from "./harness";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession }));

const NAME = "Sri Balaji Granites";
const PHONE = "+91 98765 43210";
const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

type Step = { toolCall: { toolName: string; input: unknown } } | { text: string };

function toolCallStream(index: number, step: { toolName: string; input: unknown }) {
  return simulateReadableStream({
    chunks: [
      {
        type: "tool-call" as const,
        toolCallId: `call-${index}`,
        toolName: step.toolName,
        input: JSON.stringify(step.input),
      },
      { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: undefined }, usage: USAGE },
    ],
  });
}

function textStream(text: string) {
  return simulateReadableStream({
    chunks: [
      { type: "text-start" as const, id: "t" },
      { type: "text-delta" as const, id: "t", delta: text },
      { type: "text-end" as const, id: "t" },
      { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage: USAGE },
    ],
  });
}

function scriptedModel(steps: readonly Step[]) {
  return new MockLanguageModelV4({
    doStream: steps.map((step, i) => ({
      stream: "toolCall" in step ? toolCallStream(i, step.toolCall) : textStream(step.text),
    })),
  });
}

function ask(text: string): UIMessage[] {
  return [{ id: "m1", role: "user", parts: [{ type: "text", text }] }];
}

async function run(db: Db, model: MockLanguageModelV4, text: string, fallbackModel?: MockLanguageModelV4) {
  const response = await answerChat({ messages: ask(text), db, model, fallbackModel });
  return response.text();
}

function promptsOf(model: MockLanguageModelV4): string {
  return JSON.stringify(model.doStreamCalls.map((call) => call.prompt));
}

function userTextOf(model: MockLanguageModelV4): string {
  return JSON.stringify(model.doStreamCalls[0].prompt.filter((m) => m.role === "user"));
}

function toolResultOf(model: MockLanguageModelV4, call: number): string {
  const tool = model.doStreamCalls[call].prompt.find((m) => m.role === "tool");
  return JSON.stringify(tool?.content);
}

describe("aliasCustomerNames", () => {
  const short = { id: "aaaaaa11-0000-4000-8000-000000000000", name: "Sri Balaji" };
  const long = { id: "bbbbbb22-0000-4000-8000-000000000000", name: "Sri Balaji Granites" };

  it("replaces the longest name first whatever order the list comes in", () => {
    expect(aliasCustomerNames("Sri Balaji Granites and Sri Balaji", [short, long])).toBe("C-bbbbbb and C-aaaaaa");
  });

  it("matches a stored name whatever spacing the member types", () => {
    const spaced = { id: "cccccc33-0000-4000-8000-000000000000", name: "Sri  Kumar  Stones" };
    expect(aliasCustomerNames("Sri Kumar Stones and sri\nkumar\tstones", [spaced])).toBe("C-cccccc and C-cccccc");
  });

  it("does not rewrite an alias it just inserted or one already in the text", () => {
    const initial = { id: "dddddd44-0000-4000-8000-000000000000", name: "C" };
    expect(aliasCustomerNames("Sri Balaji Granites", [long, initial])).toBe("C-bbbbbb");
    expect(aliasCustomerNames("C-bbbbbb bought, C paid", [long, initial])).toBe("C-bbbbbb bought, C-dddddd paid");
  });
});

describe("answerChat", () => {
  let operator: Db;
  let customerId: string;
  let alias: string;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
  });

  beforeEach(async () => {
    await resetDomainData();
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    customerId = await createCustomer(operator, { name: NAME, phone: PHONE, type: "CONTRACTOR" });
    alias = customerAlias(customerId);
    const batch = await createBatch(operator, { productId, supplierId, units: 10 });
    await recordSale(operator, { batchId: batch.data?.id ?? "", customerId });
  });

  describe("customer names never reach the model", () => {
    it("swaps a customer name the member types for its alias", async () => {
      const model = scriptedModel([{ text: "ok" }]);
      await run(operator, model, `how much has ${NAME.toLowerCase()} bought this year?`);

      expect(alias).toBe(`C-${customerId.slice(0, 6)}`);
      expect(userTextOf(model)).toContain(`how much has ${alias} bought this year?`);
      expect(promptsOf(model).toLowerCase()).not.toContain(NAME.toLowerCase());
      expect(promptsOf(model)).not.toContain(PHONE);
    });

    it("leaves no name or phone in any prompt, tool result or system text", async () => {
      const model = scriptedModel([
        { toolCall: { toolName: "run_query", input: { sql: "select * from v_chat_sales" } } },
        { toolCall: { toolName: "find_customer", input: { name: "Balaji" } } },
        { text: "done" },
      ]);
      await run(operator, model, `what did ${NAME} buy?`);

      expect(model.doStreamCalls).toHaveLength(3);
      const everything = promptsOf(model);
      expect(everything).not.toContain(NAME);
      expect(everything).not.toContain("98765");
    });

    it("aliases the longest name first and leaves a name inside another word", async () => {
      const shorter = await createCustomer(operator, { name: "Sri Balaji", phone: "+91 90000 00001" });
      const model = scriptedModel([{ text: "ok" }]);
      await run(operator, model, `${NAME} and Sri Balaji, not Sri Balajis`);

      expect(userTextOf(model)).toContain(`${alias} and ${customerAlias(shorter)}, not Sri Balajis`);
    });
  });

  describe("find_customer", () => {
    it("lists aliases and types, never a name or phone", async () => {
      const model = scriptedModel([
        { toolCall: { toolName: "find_customer", input: { name: "Balaji" } } },
        { text: "found" },
      ]);
      await run(operator, model, "who is Balaji?");

      const result = toolResultOf(model, 1);
      expect(result).toContain(alias);
      expect(result).toContain("CONTRACTOR");
      expect(result).not.toContain(NAME);
      expect(result).not.toContain("98765");
    });
  });

  describe("find_customer wildcards", () => {
    it("treats % in a name as a literal character", async () => {
      const model = scriptedModel([
        { toolCall: { toolName: "find_customer", input: { name: "%" } } },
        { text: "none" },
      ]);
      await run(operator, model, "who has a percent sign?");

      expect(toolResultOf(model, 1)).not.toContain(alias);
    });
  });

  describe("run_query", () => {
    it("returns the rows chat_query gives the signed-in member", async () => {
      const model = scriptedModel([
        { toolCall: { toolName: "run_query", input: { sql: "select count(*) as n from v_chat_batches" } } },
        { text: "one batch" },
      ]);
      await run(operator, model, "how many batches?");

      expect(toolResultOf(model, 1)).toContain('"value":[{"n":1}]');
    });

    it("hands the model an error it can read for an INSERT, and writes nothing", async () => {
      const before = await sql<{ n: string }>(`select count(*) as n from public.customers`);
      const model = scriptedModel([
        {
          toolCall: {
            toolName: "run_query",
            input: { sql: "with d as (insert into customers(name) values ('x') returning 1) select * from d" },
          },
        },
        { text: "I cannot do that" },
      ]);
      await run(operator, model, "add a customer");

      expect(toolResultOf(model, 1)).toContain("Query failed:");
      const after = await sql<{ n: string }>(`select count(*) as n from public.customers`);
      expect(after[0].n).toBe(before[0].n);
    });
  });

  describe("a second turn", () => {
    const earlierRows = Array.from({ length: 500 }, (_, i) => ({ sale_id: `EARLIER-ROW-${i}`, qty: i }));
    const earlierTurn: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "show all sales" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-run_query",
            toolCallId: "earlier-call",
            state: "output-available",
            input: { sql: "select * from v_chat_sales" },
            output: earlierRows,
          },
          { type: "text", text: "Sales total 1650 rupees." },
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "and what about stock?" }] },
    ];

    it("does not hand the rows of an earlier run_query back to the model", async () => {
      const model = scriptedModel([{ text: "ok" }]);
      await (await answerChat({ messages: earlierTurn, db: operator, model })).text();

      const prompt = JSON.stringify(model.doStreamCalls[0].prompt);
      expect(prompt).not.toContain("EARLIER-ROW");
      expect(prompt).toContain("show all sales");
      expect(prompt).toContain("Sales total 1650 rupees.");
      expect(prompt).toContain("and what about stock?");
    });

    it("still gives the model the rows of the query it runs this turn", async () => {
      const model = scriptedModel([
        { toolCall: { toolName: "run_query", input: { sql: "select count(*) as n from v_chat_batches" } } },
        { text: "one batch" },
      ]);
      await (await answerChat({ messages: earlierTurn, db: operator, model })).text();

      const thisTurn = model.doStreamCalls[1].prompt.filter((m) => m.role === "tool").at(-1);
      expect(JSON.stringify(thisTurn?.content)).toContain('"value":[{"n":1}]');
      expect(JSON.stringify(model.doStreamCalls[1].prompt)).not.toContain("EARLIER-ROW");
    });
  });

  describe("forcing an answer", () => {
    const GOOD_SQL = "select count(*) as n from v_chat_batches";
    const BAD_SQL = "select nope from v_chat_batches";

    function toolLoopModel(sql: string) {
      let calls = 0;
      return new MockLanguageModelV4({
        doStream: async (options) => ({
          stream:
            options.toolChoice?.type === "none"
              ? textStream("Here is what I found.")
              : toolCallStream(calls++, { toolName: "run_query", input: { sql } }),
        }),
      });
    }

    function systemOf(model: MockLanguageModelV4, call: number): string {
      const system = model.doStreamCalls[call].prompt.find((m) => m.role === "system");
      return typeof system?.content === "string" ? system.content : "";
    }

    it("makes the last allowed step an answer when every query fails", async () => {
      const model = toolLoopModel(BAD_SQL);
      const body = await run(operator, model, "units sold per product over the last 4 months as a chart");

      expect(model.doStreamCalls.map((call) => call.toolChoice?.type)).toEqual([
        "auto",
        "auto",
        "auto",
        "auto",
        "none",
      ]);
      expect(body).toContain("Here is what I found.");
    });

    it("orders a could-not-get-data answer, not an answer from rows, when every query failed", async () => {
      const model = toolLoopModel(BAD_SQL);
      await run(operator, model, "units sold per product over the last 4 months as a chart");

      const order = systemOf(model, 4);
      expect(order).toContain("Tools are off");
      expect(order).toContain("No query returned any rows");
      expect(order).toContain("could not get that data");
      expect(order).toContain("Do not state, estimate or guess any number");
      expect(order).not.toContain("rows already returned");
    });

    it("orders the same when every query came back empty", async () => {
      const model = toolLoopModel("select n from (select 1 as n) t where false");
      await run(operator, model, "anything");

      expect(systemOf(model, 4)).toContain("No query returned any rows");
      expect(systemOf(model, 4)).not.toContain("rows already returned");
    });

    it("keeps the answer-from-rows order when one query returned rows and the rest failed", async () => {
      const sqls = [BAD_SQL, BAD_SQL, GOOD_SQL, BAD_SQL];
      let calls = 0;
      const model = new MockLanguageModelV4({
        doStream: async (options) => ({
          stream:
            options.toolChoice?.type === "none"
              ? textStream("done")
              : toolCallStream(calls, { toolName: "run_query", input: { sql: sqls[calls++] } }),
        }),
      });
      await run(operator, model, "anything");

      expect(systemOf(model, 4)).toContain("rows already returned");
      expect(systemOf(model, 4)).not.toContain("No query returned any rows");
    });

    it("makes the step after two queries that returned rows an answer, with the order to write it", async () => {
      const model = toolLoopModel(GOOD_SQL);
      const body = await run(operator, model, "units sold per product over the last 4 months as a chart");

      expect(model.doStreamCalls.map((call) => call.toolChoice?.type)).toEqual(["auto", "auto", "none"]);
      expect(systemOf(model, 1)).not.toContain("Tools are off");
      expect(systemOf(model, 2)).toContain("Tools are off");
      expect(systemOf(model, 2)).toContain("root = Stack(");
      expect(body).toContain("Here is what I found.");
    });

    it("does not count a failed query or an empty result toward the two", async () => {
      const sqls = [BAD_SQL, "select n from (select 1 as n) t where false", GOOD_SQL, GOOD_SQL];
      let calls = 0;
      const model = new MockLanguageModelV4({
        doStream: async (options) => ({
          stream:
            options.toolChoice?.type === "none"
              ? textStream("done")
              : toolCallStream(calls, { toolName: "run_query", input: { sql: sqls[calls++] } }),
        }),
      });
      await run(operator, model, "anything");

      expect(model.doStreamCalls.map((call) => call.toolChoice?.type)).toEqual([
        "auto",
        "auto",
        "auto",
        "auto",
        "none",
      ]);
    });
  });

  describe("system prompt", () => {
    it("lists every v_chat view with its columns, the components and today in India", async () => {
      const model = scriptedModel([{ text: "ok" }]);
      await run(operator, model, "hello");

      const system = model.doStreamCalls[0].prompt.find((m) => m.role === "system");
      const text = typeof system?.content === "string" ? system.content : "";
      const columns = await sql<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and table_name like 'v\\_chat\\_%'`,
      );
      const views = new Set(columns.map((c) => c.table_name));
      expect(views.size).toBe(7);
      for (const view of views) expect(text).toContain(view);
      for (const c of columns) expect(text).toContain(`${c.table_name}(`);
      for (const c of columns) expect(text).toContain(c.column_name);
      for (const name of ["Stack", "Metric", "RankedBars", "Donut", "LineChart", "BarChart", "Table", "Text"]) {
        expect(text).toContain(`${name}(`);
      }
      expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(text).toMatch(/SELECT/);
    });

    async function systemTextFor(question: string): Promise<string> {
      const model = scriptedModel([{ text: "ok" }]);
      await run(operator, model, question);
      const system = model.doStreamCalls[0].prompt.find((m) => m.role === "system");
      return typeof system?.content === "string" ? system.content : "";
    }

    it("defines Stale and Ageing by the ageing_band column, never by the model's own day cut-offs", async () => {
      const text = await systemTextFor("which supplier has the most stale batches?");
      const rule = text.split("\n").find((line) => line.includes("ageing_band") && /stale/i.test(line));
      expect(rule).toBeDefined();
      for (const band of ["'STALE'", "'AGEING'", "'FRESH'"]) expect(rule).toContain(band);
      expect(rule).toMatch(/never.*day/i);
    });

    it("tells the model how to bucket sales by month in India time", async () => {
      const text = await systemTextFor("show units sold per product over the last 4 months as a chart");
      const rule = text.split("\n").find((line) => line.includes("date_trunc") && line.includes("sale_date"));
      expect(rule).toBeDefined();
      expect(rule).toMatch(/last 4 months/);
      expect(rule).toMatch(/today/i);
    });

    it("tells the model Text is plain text with no markdown", async () => {
      const text = await systemTextFor("how many batches?");
      expect(
        text.split("\n").some((line) => /Text/.test(line) && /plain text/i.test(line) && /no markdown/i.test(line)),
      ).toBe(true);
    });
  });

  describe("answer log", () => {
    let info: MockInstance<typeof console.info>;

    beforeEach(() => {
      info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    });

    afterEach(() => {
      info.mockRestore();
    });

    it("logs the answering model id and the step count, and no message text, rows or names", async () => {
      const question = "how many batches are there?";
      const answer = "There is exactly one batch";
      const model = scriptedModel([
        { toolCall: { toolName: "run_query", input: { sql: "select count(*) as n from v_chat_batches" } } },
        { text: answer },
      ]);
      await run(operator, model, question);

      const lines = info.mock.calls.map((call) => String(call[0]));
      const line = lines.find((l) => l.includes(model.modelId));
      expect(line).toBeDefined();
      expect(JSON.parse(line ?? "{}")).toEqual({ event: "chat_answer", modelId: model.modelId, steps: 2 });
      const everything = lines.join("\n");
      for (const secret of [question, answer, "v_chat_batches", NAME, PHONE]) expect(everything).not.toContain(secret);
    });
  });

  describe("provider failures", () => {
    const failing = (statusCode: number) =>
      new MockLanguageModelV4({
        doStream: async () => {
          throw new APICallError({
            message: "upstream detail",
            url: "https://openrouter.ai/api/v1/chat/completions",
            requestBodyValues: {},
            statusCode,
          });
        },
      });

    it("says the daily limit is reached on a 429", async () => {
      const body = await run(operator, failing(429), "hello");
      expect(body).toContain("Daily limit reached, try again after 5:30 AM");
    });

    it("hides a raw provider error behind a plain message", async () => {
      const body = await run(operator, failing(500), "hello");
      expect(body).not.toContain("upstream detail");
      expect(body).toContain("Something went wrong");
    });

    const overloaded = () =>
      new APICallError({
        message: "Service temporarily overloaded",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 503,
      });
    const throwing = (error: () => Error) =>
      new MockLanguageModelV4({
        doStream: async () => {
          throw error();
        },
      });
    const errorChunk = (answerStarted = false) =>
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start" as const, warnings: [] },
              ...(answerStarted
                ? [
                    { type: "text-start" as const, id: "t" },
                    { type: "text-delta" as const, id: "t", delta: "root = Stack([" },
                  ]
                : []),
              { type: "error" as const, error: { message: "Provider timed out after 12357ms", code: 504 } },
            ],
          }),
        }),
      });

    it("retries once on the fallback model when the primary fails before any answer text", async () => {
      for (const primary of [failing(503), throwing(overloaded), errorChunk()]) {
        const fallback = scriptedModel([{ text: "Answered by the fallback" }]);
        const body = await run(operator, primary, "hello", fallback);

        expect(body).toContain("Answered by the fallback");
        expect(body).not.toContain("Something went wrong");
        expect(primary.doStreamCalls).toHaveLength(1);
        expect(fallback.doStreamCalls).toHaveLength(1);
      }
    });

    it("sends the fallback the same prompt, tools included, with the tool results so far", async () => {
      let calls = 0;
      const primary = new MockLanguageModelV4({
        doStream: async () => {
          if (calls++ > 0) throw overloaded();
          return {
            stream: toolCallStream(0, {
              toolName: "run_query",
              input: { sql: "select count(*) as n from v_chat_batches" },
            }),
          };
        },
      });
      const fallback = scriptedModel([{ text: "Counted" }]);
      const body = await run(operator, primary, "how many batches?", fallback);

      expect(body).toContain("Counted");
      expect(fallback.doStreamCalls[0].tools?.map((tool) => tool.name)).toEqual(["run_query", "find_customer"]);
      expect(JSON.stringify(fallback.doStreamCalls[0].prompt)).toContain("tool-result");
    });

    it("retries at most once in a turn", async () => {
      for (const primary of [throwing(overloaded), errorChunk()]) {
        const fallback = scriptedModel([
          { toolCall: { toolName: "run_query", input: { sql: "select count(*) as n from v_chat_batches" } } },
          { text: "never reached" },
        ]);
        const body = await run(operator, primary, "hello", fallback);

        expect(primary.doStreamCalls).toHaveLength(2);
        expect(fallback.doStreamCalls).toHaveLength(1);
        expect(body).toContain("Something went wrong");
        expect(body).not.toContain("never reached");
      }
    });

    it("says something went wrong when the fallback fails too", async () => {
      const fallback = throwing(overloaded);
      const body = await run(operator, throwing(overloaded), "hello", fallback);

      expect(fallback.doStreamCalls).toHaveLength(1);
      expect(body).toContain("Something went wrong");
    });

    it("does not retry a 429, whose daily cap the fallback shares", async () => {
      const fallback = scriptedModel([{ text: "unused" }]);
      const body = await run(operator, failing(429), "hello", fallback);

      expect(fallback.doStreamCalls).toHaveLength(0);
      expect(body).toContain("Daily limit reached, try again after 5:30 AM");
    });

    it("does not retry once the primary has started to answer", async () => {
      const fallback = scriptedModel([{ text: "unused" }]);
      const body = await run(operator, errorChunk(true), "hello", fallback);

      expect(fallback.doStreamCalls).toHaveLength(0);
      expect(body).toContain("Something went wrong");
    });
  });
});

describe("POST /api/chat", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function post() {
    const { POST } = await import("@/app/api/chat/route");
    return POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: ask("hello") }),
      }),
    );
  }

  function asMember() {
    getSession.mockResolvedValue({
      status: "member",
      member: { email: "operator@test.local", name: "Op", role: "YARD_OPERATOR" },
    });
  }

  it("answers 401 to a signed-out visitor and to a non-member", async () => {
    getSession.mockResolvedValue({ status: "anonymous" });
    expect((await post()).status).toBe(401);
    getSession.mockResolvedValue({ status: "not-member", email: "stranger@test.local" });
    expect((await post()).status).toBe(401);
  });

  it("answers 401 JSON, not a redirect to login, when the proxy sees a signed-out POST", async () => {
    const { updateSession } = await import("@/lib/supabase/proxy");
    const response = await updateSession(
      new NextRequest("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages: ask("hi") }) }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not signed in" });

    const page = await updateSession(new NextRequest("http://localhost/"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost/login");
  });

  it("answers 400 to a body with no messages", async () => {
    asMember();
    vi.stubEnv("E2E_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "test");
    const { POST } = await import("@/app/api/chat/route");
    const response = await POST(new Request("http://localhost/api/chat", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
  });

  describe("body size", () => {
    const LIMIT = 256 * 1024;

    function bodyOfBytes(bytes: number): string {
      const shell = JSON.stringify({ messages: ask("") });
      return shell.replace('"text":""', `"text":"${"a".repeat(bytes - shell.length)}"`);
    }

    async function postBody(body: string) {
      asMember();
      vi.stubEnv("OPENROUTER_API_KEY", "");
      vi.stubEnv("E2E_TEST_LOGIN", "1");
      vi.stubEnv("NODE_ENV", "test");
      vi.mocked(createClient).mockResolvedValue(await signedInClient("operator"));
      const { POST } = await import("@/app/api/chat/route");
      return POST(new Request("http://localhost/api/chat", { method: "POST", body }));
    }

    it("refuses a body over 256 KB with 413 and a message the thread can show", async () => {
      const response = await postBody(bodyOfBytes(2 * 1024 * 1024));
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "This chat is too long. Start a new chat." });
    });

    it("answers a body of exactly 256 KB", async () => {
      expect((await postBody(bodyOfBytes(LIMIT))).status).toBe(200);
      expect((await postBody(bodyOfBytes(LIMIT + 1))).status).toBe(413);
    });
  });

  it("answers 503 Chat is not set up yet when the key is missing", async () => {
    asMember();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("E2E_TEST_LOGIN", "");
    const response = await post();
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Chat is not set up yet");
  });

  it("streams the canned answer in test-login mode without a key", async () => {
    asMember();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("E2E_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "test");
    vi.mocked(createClient).mockResolvedValue(await signedInClient("operator"));
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("BarChart");
  });

  it("does not use the canned model in production", async () => {
    asMember();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("E2E_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect((await post()).status).toBe(503);
  });
});

describe("which models answer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers on DeepSeek V4.1 Flash and retries on the free Gemma when a key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("E2E_TEST_LOGIN", "");
    expect((await chatModel())?.modelId).toBe("deepseek/deepseek-v4.1-flash-1017");
    expect(chatFallbackModel()?.modelId).toBe("google/gemma-4-31b-it:free");
  });

  it("has no fallback to retry on without a key or under the canned test model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("E2E_TEST_LOGIN", "");
    expect(chatFallbackModel()).toBeNull();
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("E2E_TEST_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(chatFallbackModel()).toBeNull();
  });
});
