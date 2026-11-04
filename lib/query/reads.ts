import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database, Tables } from "@/lib/database.types";
import type { CreditRow } from "@/lib/credit";
import { isPaymentMode, type PaymentMode } from "@/lib/domain";

export type Db = SupabaseClient<Database>;
type RowsResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const PAGE_SIZE = 1000;

async function rows<T>(query: RowsResult<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function allRows<T>(
  page: (from: number, to: number) => RowsResult<T>,
  key: (row: T) => string,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const batch = await rows(page(from, from + PAGE_SIZE - 1));
    for (const row of batch) {
      const rowKey = key(row);
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      all.push(row);
    }
    if (batch.length < PAGE_SIZE) return all;
  }
}

export function readYardBatches(db: Db) {
  return allRows<Tables<"v_yard_batches">>(
    (from, to) => db.from("v_yard_batches").select("*").order("id").range(from, to),
    (row) => row.id ?? "",
  );
}

export function readStockLines(db: Db) {
  return allRows<Tables<"v_stock_lines">>(
    (from, to) =>
      db.from("v_stock_lines").select("*").gt("available", 0).order("product_name").order("line_key").range(from, to),
    (row) => row.line_key ?? "",
  );
}

export type CustomerOption = Pick<Tables<"customers">, "id" | "name" | "phone" | "customer_type" | "is_walk_in">;

export function readCustomerOptions(db: Db) {
  return allRows<CustomerOption>(
    (from, to) =>
      db
        .from("customers")
        .select("id, name, phone, customer_type, is_walk_in")
        .order("name")
        .order("id")
        .range(from, to),
    (row) => row.id,
  );
}

function readCustomersWithPhone(db: Db) {
  return allRows<Tables<"customers">>(
    (from, to) => db.from("customers").select("*").not("phone", "is", null).order("id").range(from, to),
    (row) => row.id,
  );
}

export async function findCustomerByPhone(db: Db, phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const withPhone = await readCustomersWithPhone(db);
  return withPhone.find((c) => (c.phone ?? "").replace(/\D/g, "").slice(-10) === digits) ?? null;
}

export function readCustomerList(db: Db) {
  return allRows<Tables<"v_customers">>(
    (from, to) => db.from("v_customers").select("*").order("name").order("id").range(from, to),
    (row) => row.id ?? "",
  );
}

type ProductOption = Pick<Tables<"products">, "id" | "name" | "abbreviation" | "category" | "archived_at">;

export function readProducts(db: Db) {
  return allRows<ProductOption>(
    (from, to) =>
      db
        .from("products")
        .select("id, name, abbreviation, category, archived_at")
        .order("name")
        .order("id")
        .range(from, to),
    (row) => row.id,
  );
}

export function readSuppliers(db: Db) {
  return allRows<Pick<Tables<"suppliers">, "id" | "name" | "phone" | "archived_at">>(
    (from, to) => db.from("suppliers").select("id, name, phone, archived_at").order("name").order("id").range(from, to),
    (row) => row.id,
  );
}

export const yardBatchesQuery = queryOptions({
  queryKey: ["yard-batches"],
  queryFn: () => readYardBatches(createClient()),
});

export const stockLinesQuery = queryOptions({
  queryKey: ["stock-lines"],
  queryFn: () => readStockLines(createClient()),
});

export const customersQuery = queryOptions({
  queryKey: ["customers"],
  queryFn: () => readCustomerOptions(createClient()),
});

export const recentStacksQuery = queryOptions({
  queryKey: ["recent-stacks"],
  queryFn: () =>
    rows<Pick<Tables<"v_recent_stacks">, "slot" | "stack_number">>(
      createClient()
        .from("v_recent_stacks")
        .select("slot, stack_number")
        .order("last_used_at", { ascending: false })
        .limit(20),
    ),
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: () => readProducts(createClient()),
});

export const suppliersQuery = queryOptions({
  queryKey: ["suppliers"],
  queryFn: () => readSuppliers(createClient()),
});

export const customerListQuery = queryOptions({
  queryKey: ["customer-list"],
  queryFn: () => readCustomerList(createClient()),
});

export const recentBatchesQuery = (includeArchived: boolean) =>
  queryOptions({
    queryKey: ["recent-batches", includeArchived],
    queryFn: () => {
      const query = createClient().from("v_batches").select("*");
      return rows<Tables<"v_batches">>(
        (includeArchived ? query : query.is("archived_at", null)).order("created_at", { ascending: false }).limit(8),
      );
    },
  });

export const dashboardKpisQuery = queryOptions({
  queryKey: ["dashboard-kpis"],
  queryFn: async (): Promise<Tables<"v_dashboard_kpis"> | null> => {
    const { data, error } = await createClient().from("v_dashboard_kpis").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
});

export const fastMovingQuery = queryOptions({
  queryKey: ["fast-moving", 90, 5],
  queryFn: () => rows<{ label: string; units: number }>(createClient().rpc("fast_moving", { p_days: 90, p_limit: 5 })),
});

export const marginByPeriodQuery = (grain: "week" | "month") =>
  queryOptions({
    queryKey: ["margin-by-period", grain],
    queryFn: () =>
      rows<{ period_start: string; revenue: number; margin: number; margin_pct: number | null }>(
        createClient().rpc("margin_by_period", { p_grain: grain }),
      ),
  });

export type PaymentRange =
  | { readonly kind: "week" }
  | { readonly kind: "month" }
  | { readonly kind: "custom"; readonly from: string; readonly to: string };

export type PaymentModeRow = {
  readonly payment_mode: string;
  readonly collected: number;
  readonly margin: number;
  readonly margin_pct: number | null;
  readonly range_from: string;
  readonly range_to: string;
};

export const paymentsByModeQuery = (range: PaymentRange) =>
  queryOptions({
    queryKey: ["payments-by-mode", range],
    queryFn: () =>
      rows<PaymentModeRow>(
        createClient().rpc(
          "payments_by_mode",
          range.kind === "custom" ? { p_range: "custom", p_from: range.from, p_to: range.to } : { p_range: range.kind },
        ),
      ),
  });

export type ReceivedRow = {
  readonly period_start: string;
  readonly cash: number;
  readonly upi: number;
  readonly bank_transfer: number;
  readonly total: number;
};

export const receivedByPeriodQuery = (range: PaymentRange) =>
  queryOptions({
    queryKey: ["received-by-period", range],
    queryFn: () =>
      rows<ReceivedRow>(
        createClient().rpc(
          "received_by_period",
          range.kind === "custom" ? { p_range: "custom", p_from: range.from, p_to: range.to } : { p_range: range.kind },
        ),
      ),
  });

export type TopCustomerWindow = "month" | "90d" | "all";

const topCustomerProducts = z.array(z.object({ name: z.string(), pieces: z.number() }));

export const topCustomersQuery = (window: TopCustomerWindow) =>
  queryOptions({
    queryKey: ["top-customers", window],
    queryFn: async () => {
      const found = await rows(createClient().rpc("top_customers", { p_window: window }));
      return found.map((r) => ({
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        billed: r.billed,
        pieces: r.pieces,
        products: topCustomerProducts.parse(r.products),
      }));
    },
  });

export const staleAfterDaysQuery = queryOptions({
  queryKey: ["stale-after-days"],
  queryFn: async (): Promise<number> => {
    const { data, error } = await createClient().from("settings").select("stale_after_days").maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stale_after_days ?? 180;
  },
});

export function readCredit(db: Db) {
  return allRows<Tables<"v_credit">>(
    (from, to) => db.from("v_credit").select("*").order("bill_id").range(from, to),
    (row) => row.bill_id ?? "",
  );
}

export function toCreditRow(row: Tables<"v_credit">): CreditRow {
  return {
    billId: row.bill_id ?? "",
    customerId: row.customer_id ?? "",
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone,
    saleDate: row.sale_date ?? "",
    total: row.total ?? 0,
    paid: row.paid ?? 0,
    balance: row.balance ?? 0,
    originalPayBy: row.original_pay_by ?? "",
    payBy: row.pay_by ?? "",
    extensions: row.extensions ?? 0,
    daysLeft: row.days_left ?? 0,
  };
}

export const creditQuery = queryOptions({
  queryKey: ["credit"],
  queryFn: async () => (await readCredit(createClient())).map(toCreditRow),
});

export type ReceiptLine = { readonly paymentMode: PaymentMode; readonly amount: number };

export type CreditReceipt = {
  readonly id: string;
  readonly paidOn: string;
  readonly recordedBy: string | null;
  readonly lines: readonly ReceiptLine[];
};

export type AtSalePayments = { readonly recordedBy: string | null; readonly lines: readonly ReceiptLine[] };

export type CreditPromise = {
  readonly payBy: string;
  readonly madeAt: string;
  readonly madeBy: string | null;
};

export type CreditPayments = {
  readonly atSale: AtSalePayments;
  readonly later: readonly CreditReceipt[];
  readonly promises: readonly CreditPromise[];
};

function receiptLines(
  rows: readonly { readonly payment_mode: string; readonly amount: number }[],
): readonly ReceiptLine[] {
  return rows
    .flatMap((r) => (isPaymentMode(r.payment_mode) ? [{ paymentMode: r.payment_mode, amount: r.amount }] : []))
    .toSorted((a, b) => a.paymentMode.localeCompare(b.paymentMode));
}

export const creditPaymentsQuery = (billId: string) =>
  queryOptions({
    queryKey: ["credit-payments", billId],
    queryFn: async (): Promise<CreditPayments> => {
      const db = createClient();
      const [atSale, later, promises, team] = await Promise.all([
        rows(db.from("bill_payments").select("payment_mode, amount, created_by").eq("bill_id", billId)),
        rows(
          db
            .from("credit_payments")
            .select("id, paid_on, created_by, created_at, credit_payment_lines(payment_mode, amount)")
            .eq("bill_id", billId)
            .order("paid_on")
            .order("created_at"),
        ),
        rows(db.from("credit_promises").select("id, pay_by, created_at, created_by").eq("bill_id", billId).order("id")),
        rows(db.from("team_members").select("email, name")),
      ]);
      const names = new Map(team.map((t) => [t.email, t.name ?? t.email]));
      const who = (email: string | null) => (email === null ? null : (names.get(email) ?? email));
      return {
        atSale: { recordedBy: who(atSale[0]?.created_by ?? null), lines: receiptLines(atSale) },
        later: later.map((r) => ({
          id: r.id,
          paidOn: r.paid_on,
          recordedBy: who(r.created_by),
          lines: receiptLines(r.credit_payment_lines),
        })),
        promises: promises.map((p) => ({ payBy: p.pay_by, madeAt: p.created_at, madeBy: who(p.created_by) })),
      };
    },
  });

export type DailySummary = Database["public"]["Functions"]["daily_summary"]["Returns"][number];

export type DayReceipt = {
  readonly id: string;
  readonly billId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly saleDate: string;
  readonly lines: readonly ReceiptLine[];
};

export async function readDailySales(db: Db, day: string) {
  const [summary, sales, paid, credit, receipts, received] = await Promise.all([
    db.rpc("daily_summary", { p_date: day }).single(),
    allRows<Tables<"v_sales">>(
      (from, to) =>
        db
          .from("v_sales")
          .select("*")
          .eq("sale_date", day)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      (row) => row.id ?? "",
    ),
    allRows(
      (from, to) =>
        db
          .from("bill_payments")
          .select("bill_id, payment_mode, amount, bills!inner(sale_date)")
          .eq("bills.sale_date", day)
          .order("bill_id")
          .order("payment_mode")
          .range(from, to),
      (row) => `${row.bill_id}:${row.payment_mode}`,
    ),
    allRows<Tables<"v_credit">>(
      (from, to) => db.from("v_credit").select("*").eq("sale_date", day).order("bill_id").range(from, to),
      (row) => row.bill_id ?? "",
    ),
    allRows(
      (from, to) =>
        db
          .from("credit_payments")
          .select("id, bill_id, paid_on, credit_payment_lines(payment_mode, amount), bills!inner(sale_date)")
          .eq("bills.sale_date", day)
          .order("paid_on")
          .order("created_at")
          .order("id")
          .range(from, to),
      (row) => row.id,
    ),
    allRows(
      (from, to) =>
        db
          .from("credit_payments")
          .select(
            "id, bill_id, credit_payment_lines(payment_mode, amount), bills!inner(sale_date, customer_id, customers!inner(name))",
          )
          .eq("paid_on", day)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      (row) => row.id,
    ),
  ]);
  if (summary.error) throw new Error(summary.error.message);
  const laterToday: readonly DayReceipt[] = received.map((r) => ({
    id: r.id,
    billId: r.bill_id,
    customerId: r.bills.customer_id,
    customerName: r.bills.customers.name,
    saleDate: r.bills.sale_date,
    lines: receiptLines(r.credit_payment_lines),
  }));
  return { summary: summary.data, sales, paid, credit, receipts, laterToday };
}

export const dailySalesQuery = (day: string) =>
  queryOptions({
    queryKey: ["daily-sales", day],
    queryFn: () => readDailySales(createClient(), day),
  });

export const customerOwedQuery = queryOptions({
  queryKey: ["customer-owed"],
  queryFn: () =>
    allRows<Pick<Tables<"v_customers">, "id" | "owed" | "credit_days_left">>(
      (from, to) =>
        createClient()
          .from("v_customers")
          .select("id, owed, credit_days_left")
          .gt("owed", 0)
          .order("id")
          .range(from, to),
      (row) => row.id ?? "",
    ),
});
