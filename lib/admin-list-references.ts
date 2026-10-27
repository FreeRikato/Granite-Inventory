import type { Tables } from "@/lib/database.types";

export type AdminListTable = "products" | "suppliers";
export type BatchReference = Pick<Tables<"v_batches">, "batch_code" | "product_id" | "supplier_id">;
export type DeleteReferences = {
  readonly rowName: string;
  readonly batches: readonly BatchReference[];
};

export const batchReferenceColumn: Record<AdminListTable, "product_id" | "supplier_id"> = {
  products: "product_id",
  suppliers: "supplier_id",
};

export const tableLabel: Record<AdminListTable, string> = {
  products: "Product",
  suppliers: "Supplier",
};

export function referencesForTable(
  table: AdminListTable,
  id: string,
  references: readonly BatchReference[],
): readonly BatchReference[] {
  return references.filter((reference) => reference[batchReferenceColumn[table]] === id);
}

export function hasDeleteReferences(references: Pick<DeleteReferences, "batches">): boolean {
  return references.batches.length > 0;
}

export function deleteBlockedMessage(
  table: AdminListTable,
  batches: readonly BatchReference[],
  rowName = tableLabel[table],
): string {
  if (batches.length === 1 && batches[0]?.batch_code) {
    return `Cannot delete ${rowName}: batch ${batches[0].batch_code} still uses it. Archive it instead.`;
  }
  if (batches.length > 0) {
    return `Cannot delete ${rowName}: ${batches.length} batches still use it. Archive it instead.`;
  }
  return "Only possible when no batch uses it.";
}
