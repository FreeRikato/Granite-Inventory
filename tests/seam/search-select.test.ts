import { describe, expect, it } from "vitest";
import { searchOptionIsExact, searchOptionMatches, type SearchOption } from "@/components/search-select";

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

const blackPearl: SearchOption = {
  value: "black-pearl",
  label: "Black Pearl",
  keywords: ["BP", "10x5"],
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

  it("matches a keyword such as the product abbreviation or size", () => {
    expect(searchOptionMatches(blackPearl, "bp")).toBe(true);
    expect(searchOptionMatches(blackPearl, "10x5")).toBe(true);
    expect(searchOptionMatches(blackPearl, "10x6")).toBe(false);
  });

  it("keeps Add available for a label substring but hides it for an exact label", () => {
    expect(searchOptionIsExact(blackPearl, "Black")).toBe(false);
    expect(searchOptionIsExact(blackPearl, "Black Pearl")).toBe(true);
  });

  it("hides Add only for an exact phone-digits match", () => {
    expect(searchOptionIsExact(murugan, "98765")).toBe(false);
    expect(searchOptionIsExact(murugan, "919876543210")).toBe(true);
  });
});
