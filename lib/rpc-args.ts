import type { BatchInput } from "@/lib/schemas/batch";
import type { BillInput, SaleInput } from "@/lib/schemas/sale";

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
    p_notes: b.notes,
    p_stack_number: b.stackNumber || undefined,
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
    p_notes: s.notes,
  };
}

export function billRpcArgs(b: BillInput) {
  return {
    p_customer_id: b.customerId,
    p_sale_date: b.saleDate,
    p_payment_mode: b.paymentMode,
    p_lines: b.lines.map((l) => ({
      batch_id: l.batchId,
      quantity: l.quantity,
      sale_price: l.salePrice,
      has_stickering: l.hasStickering,
      stickering_cost: l.hasStickering ? l.stickeringCost : 0,
      stickering_price: l.hasStickering ? l.stickeringPrice : 0,
    })),
  };
}
