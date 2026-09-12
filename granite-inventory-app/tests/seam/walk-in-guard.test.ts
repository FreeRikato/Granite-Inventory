import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureTestUsers, expectError, resetDomainData, signedInClient, type Db } from "./harness";
import { createCustomer } from "./fixtures";

async function getWalkInId(db: Db): Promise<string> {
  const { data, error } = await db.from("customers").select("id").eq("is_walk_in", true).single();
  if (error) throw error;
  return data.id;
}

function expectImmutableFlagError(result: { error: { code: string; message: string } | null }): void {
  const error = expectError(result);
  expect(error.code).toBe("23514");
  expect(error.message).toContain("The Walk-in Customer flag cannot be changed");
}

describe("customers: Walk-in Customer guard", () => {
  let operator: Db;
  let admin: Db;

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
  });

  beforeEach(async () => {
    await resetDomainData();
  });

  it("refuses an ADMIN changing the Walk-in Customer flag to false", async () => {
    const walkInId = await getWalkInId(admin);

    expectImmutableFlagError(
      await admin.from("customers").update({ is_walk_in: false }).eq("id", walkInId).select("id").single(),
    );
  });

  it("refuses a YARD_OPERATOR changing the Walk-in Customer flag to false", async () => {
    const walkInId = await getWalkInId(operator);

    expectImmutableFlagError(
      await operator.from("customers").update({ is_walk_in: false }).eq("id", walkInId).select("id").single(),
    );
  });

  it("refuses setting the Walk-in Customer flag to true on an ordinary customer", async () => {
    const customerId = await createCustomer(operator, { name: "Ordinary Customer" });

    expectImmutableFlagError(
      await operator.from("customers").update({ is_walk_in: true }).eq("id", customerId).select("id").single(),
    );
  });

  it("allows an ordinary update to the Walk-in Customer row", async () => {
    const walkInId = await getWalkInId(operator);
    const { data, error } = await operator
      .from("customers")
      .update({ name: "Walk-in Customer Renamed" })
      .eq("id", walkInId)
      .select("name, is_walk_in")
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({ name: "Walk-in Customer Renamed", is_walk_in: true });
  });

  it("still refuses deletion and blocks the two-step bypass at step one", async () => {
    const walkInId = await getWalkInId(operator);

    expectImmutableFlagError(
      await operator.from("customers").update({ is_walk_in: false }).eq("id", walkInId).select("id").single(),
    );

    const deleteResult = await admin.from("customers").delete().eq("id", walkInId).select("id").single();
    const deleteError = expectError(deleteResult);
    expect(deleteError.code).toBe("23514");
    expect(deleteError.message).toContain("The Walk-in Customer cannot be deleted");
  });
});
