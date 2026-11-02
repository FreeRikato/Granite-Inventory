import type { BatchInput } from "@/lib/schemas/batch";
import type { BillInput, PaymentInput, SaleInput } from "@/lib/schemas/sale";

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
    p_sale_rate: s.saleRate,
    p_payment_mode: s.paymentMode,
    p_has_stickering: s.hasStickering,
    p_stickering_cost_rate: s.hasStickering ? s.stickeringCostRate : 0,
    p_stickering_rate: s.hasStickering ? s.stickeringRate : 0,
    p_notes: s.notes,
  };
}

export function billRpcArgs(b: BillInput) {
  return {
    p_customer_id: b.customerId,
    p_sale_date: b.saleDate,
    p_payments: paymentsRpcArg(b.payments),
    p_lines: b.lines.map((l) => ({
      batch_id: l.batchId,
      quantity: l.quantity,
      sale_rate: l.saleRate,
      has_stickering: l.hasStickering,
      stickering_cost_rate: l.hasStickering ? l.stickeringCostRate : 0,
      stickering_rate: l.hasStickering ? l.stickeringRate : 0,
    })),
  };
}

export function paymentsRpcArg(payments: readonly PaymentInput[]) {
  return payments.map((p) =>
    p.amount === undefined ? { payment_mode: p.paymentMode } : { payment_mode: p.paymentMode, amount: p.amount },
  );
}
