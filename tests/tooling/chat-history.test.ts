import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { forStorage } from "@/components/chat/chat-history";

const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "sales by month" }] };
const queryPart: UIMessage["parts"][number] = {
  type: "tool-run_query",
  toolCallId: "call-1",
  state: "output-available",
  input: { sql: "select * from v_chat_sales" },
  output: [{ id: "ROW-1" }, { id: "ROW-2" }],
};
const lookupPart: UIMessage["parts"][number] = {
  type: "tool-find_customer",
  toolCallId: "call-2",
  state: "output-available",
  input: { name: "Balaji" },
  output: [{ customer_alias: "C-3f9a2b", customer_type: "CONTRACTOR" }],
};
const assistant = (id: string, ...parts: UIMessage["parts"]): UIMessage => ({ id, role: "assistant", parts });

describe("forStorage", () => {
  it("drops the run_query rows of an answer that has a root line", () => {
    const answered = assistant("a1", queryPart, lookupPart, {
      type: "text",
      text: 'root = Stack([a])\na = Text("hi")',
    });
    const stored = forStorage([user, answered]);
    expect(JSON.stringify(stored)).not.toContain("ROW-");
    expect(JSON.stringify(stored)).not.toContain("tool-run_query");
    expect(JSON.stringify(stored)).toContain("root = Stack([a])");
    expect(JSON.stringify(stored)).toContain("C-3f9a2b");
  });

  it("keeps the run_query rows of an answer that has no root line", () => {
    const unanswered = assistant("a1", queryPart, { type: "text", text: "I could not draw that." });
    const stored = forStorage([user, unanswered]);
    expect(JSON.stringify(stored)).toContain("ROW-2");
  });

  it("keeps the rows of an answer that has none when an earlier answer has a root line", () => {
    const answered = assistant("a1", queryPart, { type: "text", text: "root = Stack([])" });
    const unanswered = assistant("a2", { ...queryPart, toolCallId: "call-9", output: [{ id: "ROW-9" }] });
    const stored = forStorage([user, answered, user, unanswered]);
    expect(JSON.stringify(stored)).not.toContain("ROW-1");
    expect(JSON.stringify(stored)).toContain("ROW-9");
  });

  it("leaves the member messages and the input of the thread untouched", () => {
    const answered = assistant("a1", queryPart, { type: "text", text: "root = Stack([])" });
    const messages = [user, answered];
    const stored = forStorage(messages);
    expect(stored[0]).toBe(user);
    expect(messages[1]?.parts).toContain(queryPart);
  });
});
