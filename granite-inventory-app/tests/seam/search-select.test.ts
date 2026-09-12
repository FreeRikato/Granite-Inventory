import { describe, expect, it } from "vitest";
import { searchOptionMatches, type SearchOption } from "@/components/search-select";

const murugan: SearchOption = {
  value: "murugan",
  label: "Murugan Constructions",
  phone: "+91 98765 43210",
};

const priya: SearchOption = {
  value: "priya",
  label: "Priya Engineering",
  phone: "+91 91234 56789",
};

describe("SearchSelect matching", () => {
  it("matches 98765 in Murugan's phone but not Priya's", () => {
    expect(searchOptionMatches(murugan, "98765")).toBe(true);
    expect(searchOptionMatches(priya, "98765")).toBe(false);
  });

  it("matches 9876 in Murugan's phone but not Priya's", () => {
    expect(searchOptionMatches(murugan, "9876")).toBe(true);
    expect(searchOptionMatches(priya, "9876")).toBe(false);
  });

  it("matches 91234 in Priya's phone but not Murugan's", () => {
    expect(searchOptionMatches(priya, "91234")).toBe(true);
    expect(searchOptionMatches(murugan, "91234")).toBe(false);
  });

  it("matches a customer name case-insensitively", () => {
    expect(searchOptionMatches(priya, "priya")).toBe(true);
    expect(searchOptionMatches(murugan, "CONSTRUCTIONS")).toBe(true);
  });
});
