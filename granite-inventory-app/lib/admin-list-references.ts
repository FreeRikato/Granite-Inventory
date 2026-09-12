import type { Tables } from "@/lib/database.types";

export type AdminListTable = "products" | "variants" | "suppliers";
export type BatchReference = Pick<Tables<"v_batches">, "batch_code" | "product_id" | "variant_id" | "supplier_id">;
export type VariantReference = Pick<Tables<"variants">, "id" | "name" | "product_id">;
export type DeleteReferences = {
  readonly batches: readonly BatchReference[];
  readonly variants: readonly VariantReference[];
};

export const batchReferenceColumn: Record<AdminListTable, "product_id" | "variant_id" | "supplier_id"> = {
  products: "product_id",
  variants: "variant_id",
  suppliers: "supplier_id",
};

const tableLabel: Record<AdminListTable, string> = {
  products: "Product",
  variants: "Variant",
  suppliers: "Supplier",
};

export function referencesForTable(table: AdminListTable, id: string, references: readonly BatchReference[]): readonly BatchReference[] {
  return references.filter((reference) => reference[batchReferenceColumn[table]] === id);
}

export function hasDeleteReferences(table: AdminListTable, references: DeleteReferences): boolean {
  return references.batches.length > 0 || (table === "products" && references.variants.length > 0);
}

export function deleteBlockedMessage(
  table: AdminListTable,
  batches: readonly BatchReference[],
  variants: readonly VariantReference[],
  rowName = tableLabel[table],
): string {
  if (batches.length === 1 && batches[0]?.batch_code) {
    return `Cannot delete ${rowName}: batch ${batches[0].batch_code} still uses it.`;
  }
  if (batches.length > 0) {
    return `Cannot delete ${rowName}: ${batches.length} batches still use it.`;
  }
  if (table === "products" && variants.length === 1) {
    return `Cannot delete ${rowName}: variant ${variants[0]?.name} still belongs to it.`;
  }
  if (table === "products" && variants.length > 0) {
    return `Cannot delete ${rowName}: ${variants.length} variants still belong to it.`;
  }
  return table === "products" ? "Only possible when no batch or variant uses it." : "Only possible when no batch uses it.";
}
