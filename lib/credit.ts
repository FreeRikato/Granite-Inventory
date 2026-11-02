import type { PaymentInput } from "@/lib/schemas/sale";
import { PAYMENT_MODE_LABEL, type PaymentMode } from "@/lib/domain";
import { formatRupees } from "@/lib/format";
import { checkSplit, type PaymentSplit, type SplitCheck } from "@/lib/payment-split";
import { phoneDigits } from "@/lib/phone";

export const SOON_DAYS = 2;

export function defaultPayBy(saleDate: string): string {
  const day = new Date(`${saleDate}T00:00:00Z`);
  const weekday = day.getUTCDay();
  const ahead = weekday === 6 ? 7 : (6 - weekday + 7) % 7;
  day.setUTCDate(day.getUTCDate() + ahead);
  return day.toISOString().slice(0, 10);
}

export type DueTone = "far" | "soon" | "late";

export function dueTone(daysLeft: number): DueTone {
  if (daysLeft < 0) return "late";
  return daysLeft <= SOON_DAYS ? "soon" : "far";
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${plural(-daysLeft, "day")} late`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function formatDay(iso: string): string {
  return dayFmt.format(new Date(`${iso}T00:00:00`));
}

const istDayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export function formatDayAt(timestamp: string): string {
  return istDayFmt.format(new Date(timestamp));
}

export function payByLine(current: string, original: string): string {
  return current === original
    ? `Pay by ${formatDay(current)}`
    : `Pay by ${formatDay(current)}, was ${formatDay(original)}`;
}

export function owesLabel(owed: number, daysLeft: number | null): string {
  const owes = `Owes ${formatRupees(owed)}`;
  if (daysLeft === null || dueTone(daysLeft) === "far") return owes;
  return `${owes} · ${dueLabel(daysLeft).toLowerCase()}`;
}

export type CreditRow = {
  readonly billId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly saleDate: string;
  readonly total: number;
  readonly paid: number;
  readonly balance: number;
  readonly originalPayBy: string;
  readonly payBy: string;
  readonly extensions: number;
  readonly daysLeft: number;
};

export type CreditView = "overdue" | "pay-by" | "paid";

export function isOpen(row: CreditRow): boolean {
  return row.balance > 0;
}

export function creditTotals(rows: readonly CreditRow[]) {
  const open = rows.filter(isOpen);
  return {
    outstanding: open.reduce((sum, r) => sum + r.balance, 0),
    bills: open.length,
    overdue: open.filter((r) => r.daysLeft < 0).length,
  };
}

export function matchesCredit(row: CreditRow, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  if (row.customerName.toLowerCase().includes(trimmed)) return true;
  const digits = phoneDigits(trimmed);
  return digits.length > 0 && phoneDigits(row.customerPhone ?? "").includes(digits);
}

export function arrangeCredit(rows: readonly CreditRow[], view: CreditView): readonly CreditRow[] {
  if (view === "paid") {
    return rows.filter((r) => !isOpen(r)).toSorted((a, b) => b.saleDate.localeCompare(a.saleDate));
  }
  const open = rows.filter(isOpen);
  if (view === "overdue") {
    return open.toSorted((a, b) => a.daysLeft - b.daysLeft || b.balance - a.balance);
  }
  const upcoming = open.filter((r) => r.daysLeft >= 0).toSorted((a, b) => a.daysLeft - b.daysLeft);
  const late = open.filter((r) => r.daysLeft < 0).toSorted((a, b) => b.daysLeft - a.daysLeft);
  return [...upcoming, ...late];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function checkReceipt(split: PaymentSplit, amount: string, balance: number): SplitCheck {
  const raw = amount.trim();
  if (raw === "") return { kind: "refused", message: "Enter the amount received" };
  const total = round2(Number(raw));
  if (!Number.isFinite(total) || total <= 0) {
    return { kind: "refused", message: "The amount must be more than zero" };
  }
  if (total > balance) {
    return {
      kind: "refused",
      message: `${formatRupees(total)} is more than the balance of ${formatRupees(balance)}`,
    };
  }
  if (split.modes.length > 1) return checkSplit(split, total);
  const payments: readonly PaymentInput[] = [{ paymentMode: split.modes[0], amount: total }];
  return { kind: "ok", payments };
}

export function describeReceipt(
  lines: readonly { readonly paymentMode: PaymentMode; readonly amount: number }[],
): string {
  return lines.map((l) => `${PAYMENT_MODE_LABEL[l.paymentMode]} ${formatRupees(l.amount)}`).join(" + ");
}

export function partPaid(split: PaymentSplit): number {
  return round2(split.modes.reduce((sum, m) => sum + (Number(split.amounts[m]) || 0), 0));
}

export function checkPartPayment(split: PaymentSplit, total: number): SplitCheck {
  const payments: PaymentInput[] = [];
  for (const mode of split.modes) {
    const raw = split.amounts[mode]?.trim() ?? "";
    const amount = raw === "" ? 0 : round2(Number(raw));
    if (!Number.isFinite(amount) || amount < 0) {
      return { kind: "refused", message: `Enter a valid amount for ${PAYMENT_MODE_LABEL[mode]}` };
    }
    payments.push({ paymentMode: mode, amount });
  }
  if (partPaid(split) >= total) {
    return { kind: "refused", message: `Paid now must be less than the bill total of ${formatRupees(total)}` };
  }
  return { kind: "ok", payments };
}
