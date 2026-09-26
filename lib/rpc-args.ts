import type { BatchInput } from "@/lib/schemas/batch";
import type { SaleInput } from "@/lib/schemas/sale";

/* The create and correct functions take the same arguments; build them once. Omitted size
   fields are undefined (not null) so PostgREST falls back to the SQL defaults. */
export function batchRpcArgs(b: BatchInput) {
  return {
    p_product_id: b.productId,
    p_variant_name: b.variantName,
    p_supplier_id: b.supplierId,
    p_purchase_date: b.purchaseDate,
    p_length_ft: b.memorial ? undefined : b.lengthFt,
    p_breadth_ft: b.memorial ? undefined : b.breadthFt,
    p_thickness_mm: b.memorial ? undefined : b.thicknessMm,
    p_slot: b.slot,
    p_initial_units: b.initialUnits,
    p_unit_purchase_price: b.unitPurchasePrice,
    p_freight_cost: b.freightCost,
    p_notes: b.notes,
  };
}

export function saleRpcArgs(s: SaleInput) {
  return {
    p_batch_id: s.batchId,
    p_customer_id: s.customerId,
    p_sale_date: s.saleDate,
    p_quantity: s.quantity,
    p_sale_price: s.salePrice,
    p_payment_mode: s.paymentMode,
    p_has_stickering: s.hasStickering,
    p_stickering_cost: s.hasStickering ? s.stickeringCost : 0,
    p_stickering_price: s.hasStickering ? s.stickeringPrice : 0,
    p_misc_expense: s.miscExpense,
    p_notes: s.notes,
  };
}
