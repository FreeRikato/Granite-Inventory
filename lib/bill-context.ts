import type { Tables } from "@/lib/database.types";
import type { CreditRow } from "@/lib/credit";
import { isPaymentMode } from "@/lib/domain";
import { toCreditRow } from "@/lib/query/reads";
import type { BillPayments } from "@/app/(app)/customers/[id]/sale-actions";
import type { LaterPayment } from "@/app/(app)/customers/[id]/sales-rows";

type BillContextInput = {
  readonly sales: readonly Pick<Tables<"v_sales">, "bill_id" | "revenue">[];
  readonly paid: readonly { readonly bill_id: string; readonly payment_mode: string; readonly amount: number }[];
  readonly credit: readonly Tables<"v_credit">[];
  readonly receipts: readonly {
    readonly id: string;
    readonly bill_id: string;
    readonly paid_on: string;
    readonly credit_payment_lines: readonly { readonly payment_mode: string; readonly amount: number }[];
  }[];
};

export function billContext({ sales, paid, credit, receipts }: BillContextInput) {
  const billTotals = new Map<string, number>();
  for (const sale of sales) {
    if (sale.bill_id) billTotals.set(sale.bill_id, (billTotals.get(sale.bill_id) ?? 0) + (sale.revenue ?? 0));
  }
  const creditRows: ReadonlyMap<string, CreditRow> = new Map(
    credit.map((row) => [row.bill_id ?? "", toCreditRow(row)]),
  );
  const billPayments: Record<string, BillPayments> = {};
  for (const p of paid) {
    if (!isPaymentMode(p.payment_mode)) continue;
    const bill = billPayments[p.bill_id] ?? {
      total: billTotals.get(p.bill_id) ?? 0,
      onCredit: creditRows.has(p.bill_id),
      laterTotal: 0,
      payments: [],
    };
    billPayments[p.bill_id] = {
      ...bill,
      payments: [...bill.payments, { paymentMode: p.payment_mode, amount: p.amount }],
    };
  }
  for (const [billId, row] of creditRows) {
    billPayments[billId] ??= { total: row.total, onCredit: true, laterTotal: 0, payments: [] };
  }
  const laterPayments: Record<string, LaterPayment[]> = {};
  for (const r of receipts) {
    const lines = r.credit_payment_lines.flatMap((l) =>
      isPaymentMode(l.payment_mode) ? [{ paymentMode: l.payment_mode, amount: l.amount }] : [],
    );
    const known = billPayments[r.bill_id];
    if (known) {
      billPayments[r.bill_id] = { ...known, laterTotal: known.laterTotal + lines.reduce((t, l) => t + l.amount, 0) };
    }
    laterPayments[r.bill_id] = [...(laterPayments[r.bill_id] ?? []), { id: r.id, paidOn: r.paid_on, lines }];
  }
  return { billPayments, creditRows, laterPayments };
}
