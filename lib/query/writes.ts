import type { AdminListTable } from "@/lib/admin-list-references";

type RowKind = "product" | "supplier";
type RowVerb = "rename" | "archive" | "delete";
type RowWrite = `${RowVerb}-${RowKind}`;

export type Write =
  | "record-sale"
  | "correct-sale"
  | "delete-sale"
  | "inward-batch"
  | "correct-batch"
  | "archive-batch"
  | "delete-batch"
  | "add-customer"
  | "edit-customer"
  | "delete-customer"
  | "create-product"
  | "create-supplier"
  | RowWrite
  | `settings-${RowWrite}`
  | "inventory-rules"
  | "team-access"
  | "public-link";

export const rowKind = { products: "product", suppliers: "supplier" } as const satisfies Record<
  AdminListTable,
  RowKind
>;

export type Effect = { readonly keys: readonly string[]; readonly serverRefresh: boolean };

const SALE_READS = [
  "yard-batches",
  "stock-lines",
  "recent-batches",
  "dashboard-kpis",
  "fast-moving",
  "margin-by-period",
  "top-customers",
  "customer-list",
];
const BATCH_READS = ["yard-batches", "stock-lines", "recent-batches", "recent-stacks", "dashboard-kpis"];
const PRODUCT_NAME_READS = [
  "products",
  "yard-batches",
  "stock-lines",
  "recent-batches",
  "fast-moving",
  "top-customers",
];
const SUPPLIER_NAME_READS = ["suppliers", "yard-batches", "stock-lines", "recent-batches"];

const EFFECTS: Record<Write, Effect> = {
  "record-sale": { keys: SALE_READS, serverRefresh: false },
  "correct-sale": { keys: SALE_READS, serverRefresh: true },
  "delete-sale": { keys: SALE_READS, serverRefresh: true },
  "inward-batch": { keys: BATCH_READS, serverRefresh: false },
  "correct-batch": { keys: [...BATCH_READS, "fast-moving", "top-customers"], serverRefresh: false },
  "archive-batch": {
    keys: ["yard-batches", "stock-lines", "recent-batches", "dashboard-kpis"],
    serverRefresh: false,
  },
  "delete-batch": { keys: BATCH_READS, serverRefresh: false },
  "add-customer": { keys: ["customers", "customer-list"], serverRefresh: false },
  "edit-customer": { keys: ["customers", "customer-list", "top-customers"], serverRefresh: true },
  "delete-customer": { keys: ["customers", "customer-list"], serverRefresh: false },
  "create-product": { keys: ["products"], serverRefresh: false },
  "create-supplier": { keys: ["suppliers"], serverRefresh: false },
  "rename-product": { keys: PRODUCT_NAME_READS, serverRefresh: false },
  "rename-supplier": { keys: SUPPLIER_NAME_READS, serverRefresh: false },
  "archive-product": { keys: ["products"], serverRefresh: false },
  "archive-supplier": { keys: ["suppliers"], serverRefresh: false },
  "delete-product": { keys: ["products"], serverRefresh: false },
  "delete-supplier": { keys: ["suppliers"], serverRefresh: false },
  "settings-rename-product": { keys: PRODUCT_NAME_READS, serverRefresh: true },
  "settings-rename-supplier": { keys: SUPPLIER_NAME_READS, serverRefresh: true },
  "settings-archive-product": { keys: ["products"], serverRefresh: true },
  "settings-archive-supplier": { keys: ["suppliers"], serverRefresh: true },
  "settings-delete-product": { keys: ["products"], serverRefresh: true },
  "settings-delete-supplier": { keys: ["suppliers"], serverRefresh: true },
  "inventory-rules": { keys: ["stale-after-days", "yard-batches"], serverRefresh: true },
  "team-access": { keys: [], serverRefresh: true },
  "public-link": { keys: [], serverRefresh: true },
};

export function invalidatesAfter(write: Write): Effect {
  return EFFECTS[write];
}
