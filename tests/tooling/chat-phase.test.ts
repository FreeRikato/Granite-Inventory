import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { chatPhase } from "@/components/chat/chat-phase";

type Part = UIMessage["parts"][number];

const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "stale by supplier" }] };
const assistant = (...parts: Part[]): UIMessage => ({ id: "a1", role: "assistant", parts });
const text = (value: string): Part => ({ type: "text", text: value });
const runningQuery = (id: string): Part => ({
  type: "tool-run_query",
  toolCallId: id,
  state: "input-available",
  input: { sql: "select 1" },
});
const finishedQuery = (id: string): Part => ({
  type: "tool-run_query",
  toolCallId: id,
  state: "output-available",
  input: { sql: "select 1" },
  output: [{ n: 1 }],
});
const failedQuery = (id: string): Part => ({
  type: "tool-run_query",
  toolCallId: id,
  state: "output-error",
  input: { sql: "select nope" },
  errorText: "no such column",
});
const ANSWER = 'root = Stack([a])\na = Text("Done")';

describe("chatPhase", () => {
  it("is thinking from send until the assistant has written a part", () => {
    expect(chatPhase([user], "submitted")).toBe("thinking");
    expect(chatPhase([user, assistant()], "streaming")).toBe("thinking");
    expect(chatPhase([user, assistant({ type: "step-start" })], "streaming")).toBe("thinking");
    expect(chatPhase([user, assistant(text(""))], "streaming")).toBe("thinking");
    expect(chatPhase([user, assistant(text("\n "))], "streaming")).toBe("thinking");
  });

  it("is querying while a run_query part has no output", () => {
    expect(chatPhase([user, assistant(runningQuery("c1"))], "streaming")).toBe("querying");
    expect(chatPhase([user, assistant(text("Let me check."), runningQuery("c1"))], "streaming")).toBe("querying");
  });

  it("is querying again for the second query of a turn, and thinking between the two", () => {
    expect(chatPhase([user, assistant(finishedQuery("c1"), runningQuery("c2"))], "streaming")).toBe("querying");
    expect(chatPhase([user, assistant(finishedQuery("c1"))], "streaming")).toBe("thinking");
  });

  it("is thinking, not querying, once a query has failed and the model has not written yet", () => {
    expect(chatPhase([user, assistant(failedQuery("c1"))], "streaming")).toBe("thinking");
  });

  it("is writing while text streams with no root line yet", () => {
    expect(chatPhase([user, assistant(finishedQuery("c1"), text("Here is"))], "streaming")).toBe("writing");
    expect(chatPhase([user, assistant(finishedQuery("c1"), text("Sure:\n```openui\n"))], "streaming")).toBe("writing");
    expect(chatPhase([user, assistant(text("Here is"), { type: "step-start" })], "streaming")).toBe("writing");
  });

  it("is null once the answer renders", () => {
    expect(chatPhase([user, assistant(finishedQuery("c1"), text(ANSWER))], "streaming")).toBeNull();
    expect(chatPhase([user, assistant(finishedQuery("c1"), text("root = Stack(["))], "streaming")).toBeNull();
  });

  it("is null when the turn is not running", () => {
    expect(chatPhase([user, assistant(text(ANSWER))], "ready")).toBeNull();
    expect(chatPhase([user], "ready")).toBeNull();
    expect(chatPhase([user], "error")).toBeNull();
    expect(chatPhase([], "ready")).toBeNull();
  });

  it("looks at the newest assistant message only", () => {
    const earlier = { ...assistant(text(ANSWER)), id: "a0" };
    expect(chatPhase([user, earlier, user, assistant()], "streaming")).toBe("thinking");
    expect(chatPhase([user, earlier, { ...user, id: "u2" }], "submitted")).toBe("thinking");
  });
});
