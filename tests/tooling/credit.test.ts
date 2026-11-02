import { describe, expect, it } from "vitest";
import {
  arrangeCredit,
  checkPartPayment,
  checkReceipt,
  creditTotals,
  defaultPayBy,
  dueLabel,
  dueTone,
  matchesCredit,
  owesLabel,
  partPaid,
  payByLine,
  type CreditRow,
} from "@/lib/credit";
import { singleMode, toggleMode, setAmount } from "@/lib/payment-split";

function row(over: Partial<CreditRow>): CreditRow {
  return {
    billId: "b",
    customerId: "c",
    customerName: "Murugan Constructions",
    customerPhone: "9843012345",
    saleDate: "2026-10-31",
    total: 10000,
    paid: 6000,
    balance: 4000,
    originalPayBy: "2026-11-07",
    payBy: "2026-11-07",
    extensions: 0,
    daysLeft: 3,
    ...over,
  };
}

describe("defaultPayBy", () => {
  it("goes to the Saturday of the week, and to the coming Saturday from a Saturday or a Sunday", () => {
    expect(defaultPayBy("2026-10-05")).toBe("2026-10-10");
    expect(defaultPayBy("2026-10-09")).toBe("2026-10-10");
    expect(defaultPayBy("2026-10-10")).toBe("2026-10-17");
    expect(defaultPayBy("2026-10-11")).toBe("2026-10-17");
    expect(defaultPayBy("2026-12-31")).toBe("2027-01-02");
  });
});

describe("the due badge", () => {
  it("is far above two days, soon at two days or fewer including the day itself, late once passed", () => {
    expect(dueTone(3)).toBe("far");
    expect(dueTone(2)).toBe("soon");
    expect(dueTone(0)).toBe("soon");
    expect(dueTone(-1)).toBe("late");
  });

  it("reads as days left or days late", () => {
    expect(dueLabel(5)).toBe("Due in 5 days");
    expect(dueLabel(1)).toBe("Due tomorrow");
    expect(dueLabel(0)).toBe("Due today");
    expect(dueLabel(-1)).toBe("1 day late");
    expect(dueLabel(-3)).toBe("3 days late");
  });

  it("says what a Customer owes and how late, naming the time only when it is near", () => {
    expect(owesLabel(4000, -3)).toBe("Owes ₹4,000 · 3 days late");
    expect(owesLabel(3900, 1)).toBe("Owes ₹3,900 · due tomorrow");
    expect(owesLabel(3900, 9)).toBe("Owes ₹3,900");
    expect(owesLabel(3900, null)).toBe("Owes ₹3,900");
  });
});

describe("payByLine", () => {
  it("shows the original only after an extension", () => {
    expect(payByLine("2026-11-07", "2026-11-07")).toBe("Pay by Sat 7 Nov");
    expect(payByLine("2026-11-11", "2026-10-31")).toBe("Pay by Wed 11 Nov, was Sat 31 Oct");
  });
});

describe("the Credit list", () => {
  const rows = [
    row({ billId: "far", daysLeft: 5, balance: 100 }),
    row({ billId: "late3", daysLeft: -3, balance: 4000 }),
    row({ billId: "late10", daysLeft: -10, balance: 6400 }),
    row({ billId: "soon", daysLeft: 1, balance: 3900 }),
    row({ billId: "late3big", daysLeft: -3, balance: 12500 }),
    row({ billId: "done", daysLeft: -4, balance: 0, saleDate: "2026-10-01" }),
  ];

  it("totals only the open Bills", () => {
    expect(creditTotals(rows)).toEqual({ outstanding: 26900, bills: 5, overdue: 3 });
  });

  it("puts the most late first, the larger balance first on a tie, and leaves settled Bills out", () => {
    expect(arrangeCredit(rows, "overdue").map((r) => r.billId)).toEqual(["late10", "late3big", "late3", "soon", "far"]);
  });

  it("lists what is coming up by pay-by date, then what is late", () => {
    expect(arrangeCredit(rows, "pay-by").map((r) => r.billId)).toEqual(["soon", "far", "late3", "late3big", "late10"]);
  });

  it("lists settled Bills under Paid", () => {
    expect(arrangeCredit(rows, "paid").map((r) => r.billId)).toEqual(["done"]);
  });

  it("searches a name or a phone number", () => {
    expect(matchesCredit(row({}), "murugan")).toBe(true);
    expect(matchesCredit(row({}), "98430")).toBe(true);
    expect(matchesCredit(row({}), "selvam")).toBe(false);
    expect(matchesCredit(row({ customerPhone: null }), "98430")).toBe(false);
    expect(matchesCredit(row({}), "")).toBe(true);
  });
});

describe("checkReceipt", () => {
  it("takes one mode for the amount typed", () => {
    expect(checkReceipt(singleMode("UPI"), "1500", 4000)).toEqual({
      kind: "ok",
      payments: [{ paymentMode: "UPI", amount: 1500 }],
    });
  });

  it("refuses a blank or zero amount and more than the balance", () => {
    expect(checkReceipt(singleMode("UPI"), "", 4000)).toEqual({
      kind: "refused",
      message: "Enter the amount received",
    });
    expect(checkReceipt(singleMode("UPI"), "0", 4000)).toEqual({
      kind: "refused",
      message: "The amount must be more than zero",
    });
    expect(checkReceipt(singleMode("UPI"), "4001", 4000)).toEqual({
      kind: "refused",
      message: "₹4,001 is more than the balance of ₹4,000",
    });
  });

  it("splits the amount across modes, the last one taking the rest", () => {
    const split = setAmount(toggleMode(singleMode("CASH"), "UPI"), "CASH", "1000");
    expect(checkReceipt(split, "4000", 4000)).toEqual({
      kind: "ok",
      payments: [
        { paymentMode: "CASH", amount: 1000 },
        { paymentMode: "UPI", amount: 3000 },
      ],
    });
  });
});

describe("part payment on Sell", () => {
  const split = setAmount(setAmount(toggleMode(singleMode("CASH"), "UPI"), "CASH", "1000"), "UPI", "2000");

  it("adds up what is paid now across every picked mode, a blank box counting as nothing", () => {
    expect(partPaid(split)).toBe(3000);
    expect(partPaid(singleMode("CASH"))).toBe(0);
  });

  it("sends every mode with its typed amount, zero allowed", () => {
    expect(checkPartPayment(split, 10000)).toEqual({
      kind: "ok",
      payments: [
        { paymentMode: "CASH", amount: 1000 },
        { paymentMode: "UPI", amount: 2000 },
      ],
    });
    expect(checkPartPayment(singleMode("CASH"), 10000)).toEqual({
      kind: "ok",
      payments: [{ paymentMode: "CASH", amount: 0 }],
    });
  });

  it("refuses paying the whole total or more, and a negative amount", () => {
    expect(checkPartPayment(split, 3000)).toEqual({
      kind: "refused",
      message: "Paid now must be less than the bill total of ₹3,000",
    });
    expect(checkPartPayment(setAmount(singleMode("UPI"), "UPI", "-5"), 3000)).toEqual({
      kind: "refused",
      message: "Enter a valid amount for UPI",
    });
  });
});
