import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createParser } from "@openuidev/react-lang";
import { answerSource } from "@/components/chat/chat-answer";
import { NO_ANSWER_TEXT, endedWithoutAnswer } from "@/components/chat/chat-error";
import { chatLibrary } from "@/lib/chat/library";
import { withoutEarlierQueryRows } from "@/components/chat/request-messages";

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const queryPartOf = (output: unknown, id = "call"): UIMessage["parts"][number] => ({
  type: "tool-run_query",
  toolCallId: id,
  state: "output-available",
  input: { sql: "select * from v_chat_sales" },
  output,
});
const queryPart = (rows: number): UIMessage["parts"][number] =>
  queryPartOf(
    Array.from({ length: rows }, (_, i) => ({ id: `ROW-${i}` })),
    `call-${rows}`,
  );
const text = (value: string): UIMessage["parts"][number] => ({ type: "text", text: value });
const lookupPart: UIMessage["parts"][number] = {
  type: "tool-find_customer",
  toolCallId: "call-lookup",
  state: "output-available",
  input: { name: "Balaji" },
  output: [{ customer_alias: "C-3f9a2b", customer_type: "CONTRACTOR" }],
};
const assistant = (id: string, ...parts: UIMessage["parts"]): UIMessage => ({ id, role: "assistant", parts });

describe("withoutEarlierQueryRows", () => {
  const thread = [
    user("u1", "show all sales"),
    assistant("a1", queryPart(500), lookupPart, { type: "text", text: "Sales total 1650 rupees." }),
    user("u2", "and stock?"),
  ];

  it("drops the run_query rows of earlier turns and keeps the questions, answers and lookups", () => {
    const sent = withoutEarlierQueryRows(thread);
    expect(JSON.stringify(sent)).not.toContain("ROW-");
    expect(JSON.stringify(sent)).not.toContain("tool-run_query");
    expect(JSON.stringify(sent)).toContain("Sales total 1650 rupees.");
    expect(JSON.stringify(sent)).toContain("C-3f9a2b");
    expect(sent.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("drops an earlier assistant message that held nothing but a query", () => {
    const sent = withoutEarlierQueryRows([user("u1", "q"), assistant("a1", queryPart(3)), user("u2", "again")]);
    expect(sent.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("keeps the last message whole", () => {
    const sent = withoutEarlierQueryRows([user("u1", "q"), assistant("a1", queryPart(3))]);
    expect(JSON.stringify(sent.at(-1))).toContain("ROW-2");
  });
});

describe("endedWithoutAnswer", () => {
  const answered = assistant("a1", { type: "text", text: "root = Stack([])" });
  const onlyQueries = assistant("a1", queryPart(2));
  const onlyEmptyQuery = assistant("a1", queryPart(0));

  it("is true when the turn finished on a question or on tool calls that returned no rows", () => {
    expect(endedWithoutAnswer([user("u1", "q")], "ready")).toBe(true);
    expect(endedWithoutAnswer([user("u1", "q"), onlyEmptyQuery], "ready")).toBe(true);
    expect(endedWithoutAnswer([user("u1", "q"), assistant("a1", { type: "text", text: "" })], "ready")).toBe(true);
  });

  it("is true when the only text is a preamble or raw tool-call text", () => {
    expect(endedWithoutAnswer([user("u1", "q"), assistant("a1", text("Let me check."), text(""))], "ready")).toBe(true);
    expect(
      endedWithoutAnswer([user("u1", "q"), assistant("a1", text("<tool_call><function=run_query>"))], "ready"),
    ).toBe(true);
  });

  it("is false while the model is still working, once there is an answer, and for an empty thread", () => {
    expect(endedWithoutAnswer([user("u1", "q")], "submitted")).toBe(false);
    expect(endedWithoutAnswer([user("u1", "q"), onlyEmptyQuery], "streaming")).toBe(false);
    expect(endedWithoutAnswer([user("u1", "q"), onlyQueries], "ready")).toBe(false);
    expect(endedWithoutAnswer([user("u1", "q"), answered], "ready")).toBe(false);
    expect(endedWithoutAnswer([], "ready")).toBe(false);
  });

  it("says what to do next", () => {
    expect(NO_ANSWER_TEXT).toBe("I could not finish that answer. Try asking a narrower question.");
  });
});

describe("answerSource", () => {
  const chart = 'root = Stack([c])\nc = BarChart(["A"], [{name: "Units", values: [3]}])';
  const parser = createParser(chatLibrary.toJSONSchema(), "Stack");
  const parsed = (source: string | null) => parser.parse(source ?? "");

  it("shows the OpenUI answer, not the preamble written before a tool call", () => {
    const message = assistant("a1", text("Let me check the sales."), queryPart(2), text(chart));
    expect(answerSource(message, true)).toBe(chart);
  });

  it("shows an earlier chart when a later step wrote junk", () => {
    const message = assistant("a1", queryPart(2), text(chart), text("Sure, here you go."));
    expect(answerSource(message, true)).toBe(chart);
  });

  describe("when the model wraps the answer", () => {
    const rows = [{ product: "Black Galaxy", units: 74 }];

    it.each([
      ["a fence with a language tag", `\`\`\`openui\n${chart}\n\`\`\``],
      ["a fence with no tag", `\`\`\`\n${chart}\n\`\`\``],
      ["prose before a fence", `Here is the chart you asked for:\n\n\`\`\`openui\n${chart}\n\`\`\``],
      ["prose before the answer with no fence", `Here is the chart:\n${chart}`],
      ["a fence still open while streaming", `\`\`\`openui\n${chart}`],
      ["a fence with a sentence after it", `\`\`\`\n${chart}\n\`\`\`\nHope that helps.`],
    ])("unwraps %s to the bare answer", (_name, wrapped) => {
      expect(answerSource(assistant("a1", text(wrapped)), true)).toBe(chart);
      expect(parsed(answerSource(assistant("a1", text(wrapped)), true)).meta.errors).toEqual([]);
    });

    it("falls to the table when a fence holds junk", () => {
      const message = assistant("a1", queryPartOf(rows), text("```\n<tool_call>\n<function=run_query>\n```"));
      expect(answerSource(message, true)).toContain("Table(");
      expect(answerSource(message, true)).not.toContain("tool_call");
    });

    it("does not take a sentence that mentions root = for an answer", () => {
      const message = assistant("a1", queryPart(0), text("I tried to set root = Stack but the data was empty."));
      expect(answerSource(message, true)).toBeNull();
    });

    it("falls to the fallback line when a fence holds junk and no query returned rows", () => {
      const message = assistant("a1", queryPart(0), text("Sure:\n```openui\nI could not build a chart.\n```"));
      expect(answerSource(message, true)).toBeNull();
      expect(endedWithoutAnswer([user("u1", "q"), message], "ready")).toBe(true);
    });
  });

  it("shows the last OpenUI answer when the model wrote more than one", () => {
    const revised = 'root = Stack([t])\nt = Text("Revised")';
    expect(answerSource(assistant("a1", text(chart), queryPart(1), text(revised)), true)).toBe(revised);
  });

  it("shows nothing when the only text is a preamble and no query returned rows", () => {
    const message = assistant("a1", text("Let me check."), queryPart(0), text(""));
    expect(answerSource(message, true)).toBeNull();
  });

  it("never passes raw tool-call text on", () => {
    const message = assistant("a1", queryPart(0), text("<tool_call>\n<function=run_query>\n</tool_call>"));
    expect(answerSource(message, true)).toBeNull();
  });

  describe("when the turn ended without an answer but a query returned rows", () => {
    const rows = [
      { product: "Black Galaxy", units: 74, note: null },
      { product: 'Steel "Grey"\nline', units: 79, note: true },
    ];
    const message = assistant(
      "a1",
      queryPartOf([{ product: "Old", units: 1 }], "first"),
      queryPartOf(rows, "last"),
      queryPartOf([], "empty"),
      text("<tool_call>\n<function=run_query>\n</tool_call>"),
    );

    it("builds the found-data note and a Table of the last query that returned rows", () => {
      const result = parsed(answerSource(message, true));
      expect(result.meta.errors).toEqual([]);
      expect(result.root?.props.children).toMatchObject([
        { typeName: "Text", props: { text: "Here is the data I found." } },
        {
          typeName: "Table",
          props: {
            columns: ["product", "units", "note"],
            rows: [
              ["Black Galaxy", 74, ""],
              ['Steel "Grey"\nline', 79, "true"],
            ],
          },
        },
      ]);
    });

    it("waits while the turn is still being written", () => {
      expect(answerSource(message, false)).toBeNull();
    });

    it("shows the table whatever the model wrote last", () => {
      const silent = assistant("a1", queryPartOf(rows, "last"));
      expect(answerSource(silent, true)).toContain("Table(");
    });

    it("prefers the model's own answer when it wrote one", () => {
      expect(answerSource(assistant("a1", queryPartOf(rows, "last"), text(chart)), true)).toBe(chart);
    });
  });

  it("ignores a query output that is an error message", () => {
    const failed = assistant("a1", queryPartOf("Query failed: no such column", "bad"));
    expect(answerSource(failed, true)).toBeNull();
  });
});
