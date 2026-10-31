import { describe, expect, it } from "vitest";
import {
  checkSplit,
  restAmount,
  restMode,
  setAmount,
  singleMode,
  splitFromPayments,
  toggleMode,
} from "@/lib/payment-split";

describe("payment split: the chips and amount boxes on Sell and Edit sale", () => {
  it("adds a tapped mode at the end and removes a tapped picked mode, keeping at least one", () => {
    const cash = singleMode("CASH");
    const cashUpi = toggleMode(cash, "UPI");
    expect(cashUpi.modes).toEqual(["CASH", "UPI"]);
    expect(toggleMode(cashUpi, "CASH").modes).toEqual(["UPI"]);
    expect(toggleMode(cash, "CASH").modes).toEqual(["CASH"]);
  });

  it("fills the last picked mode with what is left of the total", () => {
    const split = setAmount(toggleMode(singleMode("CASH"), "UPI"), "CASH", "30000");
    expect(restMode(split)).toBe("UPI");
    expect(restAmount(split, 50000)).toBe(20000);
  });

  it("sends one mode with no amount, so the database takes the Bill total", () => {
    expect(checkSplit(singleMode("UPI"), 50000)).toEqual({ kind: "ok", payments: [{ paymentMode: "UPI" }] });
  });

  it("sends every amount of a split, the last one being the rest", () => {
    const split = setAmount(
      setAmount(toggleMode(toggleMode(singleMode("CASH"), "UPI"), "BANK_TRANSFER"), "CASH", "10000.5"),
      "UPI",
      "20000",
    );
    expect(checkSplit(split, 50000)).toEqual({
      kind: "ok",
      payments: [
        { paymentMode: "CASH", amount: 10000.5 },
        { paymentMode: "UPI", amount: 20000 },
        { paymentMode: "BANK_TRANSFER", amount: 19999.5 },
      ],
    });
  });

  it("refuses a blank or zero amount and a split that leaves nothing for the last mode", () => {
    const split = toggleMode(singleMode("CASH"), "UPI");
    expect(checkSplit(split, 50000)).toEqual({ kind: "refused", message: "Enter an amount for Cash" });
    expect(checkSplit(setAmount(split, "CASH", "0"), 50000)).toEqual({
      kind: "refused",
      message: "Each payment in a split must be more than zero",
    });
    expect(checkSplit(setAmount(split, "CASH", "50000"), 50000)).toEqual({
      kind: "refused",
      message: "Nothing is left for UPI: the other amounts already reach ₹50,000",
    });
  });

  it("rebuilds a saved split in its stored order with its amounts", () => {
    const split = splitFromPayments([
      { paymentMode: "CASH", amount: 30000 },
      { paymentMode: "UPI", amount: 20000 },
    ]);
    expect(split.modes).toEqual(["CASH", "UPI"]);
    expect(split.amounts).toEqual({ CASH: "30000", UPI: "20000" });
    expect(restAmount(split, 48000)).toBe(18000);
  });
});
