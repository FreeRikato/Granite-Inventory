import { describe, expect, it } from "vitest";
import { customerDraftFromQuery } from "@/app/(app)/sell/sell-form";

describe("customer picker queries", () => {
  it("normalises a punctuated phone into a database-safe draft", () => {
    expect(customerDraftFromQuery("+91-98765-43210")).toEqual({
      name: "",
      phone: "+919876543210",
      customerType: "REGULAR",
    });
  });

  it("keeps a non-phone query as the new customer's name", () => {
    expect(customerDraftFromQuery("Murugan Constructions")).toEqual({
      name: "Murugan Constructions",
      phone: "",
      customerType: "REGULAR",
    });
  });
});
