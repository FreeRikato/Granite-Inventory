/* Uniform shape returned by every server action so forms handle success and failure alike. */
export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error };
}

/* Postgres raises the domain rules as errors; the message is the operator-facing text. */
export function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return cleanPgMessage(m);
  }
  return "Something went wrong";
}

export function cleanPgMessage(message: string): string {
  if (/duplicate key.*products_name_key/.test(message)) return "A product with that name already exists";
  if (/duplicate key.*products_abbreviation_key/.test(message)) return "That abbreviation is already used";
  if (/duplicate key.*suppliers_name_key/.test(message)) return "A supplier with that name already exists";
  if (/duplicate key.*customers_phone_key/.test(message)) return "A customer with that phone already exists";
  if (/violates foreign key constraint/.test(message)) return "Still used by batches or sales in the yard";
  if (/violates check constraint "batches_purchase_date_range"/.test(message)) return "Purchase date cannot be in the future";
  if (/violates check constraint "sales_sale_date_check"/.test(message)) return "Sale date cannot be in the future";
  return message;
}
