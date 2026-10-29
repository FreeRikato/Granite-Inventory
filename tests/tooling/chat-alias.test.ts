import { describe, expect, it } from "vitest";
import { createDealiaser } from "@/lib/chat/alias";

const dealias = createDealiaser([{ id: "3f9a2b11-0000-4000-8000-000000000000", name: "Sri Balaji Granites" }]);

describe("createDealiaser", () => {
  it("swaps an alias for the customer name", () => {
    expect(dealias("C-3f9a2b leads")).toBe("Sri Balaji Granites leads");
  });

  it("leaves an alias with no matching customer", () => {
    expect(dealias("C-000000 leads")).toBe("C-000000 leads");
  });

  it("swaps every alias in the text and ignores longer hex runs", () => {
    expect(dealias("C-3f9a2b and C-3f9a2b, not C-3f9a2bff or ABC-3f9a2b")).toBe(
      "Sri Balaji Granites and Sri Balaji Granites, not C-3f9a2bff or ABC-3f9a2b",
    );
  });
});
