---
code:
  - lib/action-result.ts
  - lib/schemas/common.ts
  - lib/schemas/settings.ts
  - lib/schemas/batch.ts
  - lib/schemas/sale.ts
  - lib/use-refusal.ts
  - supabase/migrations/20261025120000_unit_quantity_refusal.sql
  - supabase/migrations/20260912180000_db_api_hardening.sql
  - supabase/migrations/20260912190000_correction_hardening.sql
  - supabase/migrations/20260926165731_api_observations.sql
  - tests/seam/api-observations.test.ts
---
# Readable refusals

Every refusal reads as a business rule, whether it comes from a form or a direct API caller. Never raw Postgres text.

- Postgres raises the domain rules as errors whose message is the operator-facing text. Every server action returns one uniform shape (`lib/action-result.ts`) so forms handle success and failure alike.
- Form schemas cap numbers at the column limits: `numeric(12, 2)` for money, `numeric(5, 2)` for sizes, and a practical cap for counts and thickness. An oversized number is refused with "Number is too large" instead of reaching Postgres as a `22003` overflow.
- The settings schema is a partial update: each field is optional so a page can save just the ones it owns.
- Ticket T04 made API validation readable, bounded dates ([[ist-calendar]]) and made access errors explicit. T09 put the correction functions on the same path ([[corrections]]).
- Audit round 2 (SYN2-11, 13, 14, 15) closed the last places direct API callers saw raw text: the zero-quantity copy now matches the form, the batch-code preview refuses bad input ([[batches]]), and a second Walk-in Customer is refused by name ([[sales-and-stock-lines]]).
- A refusal names its field by the label on the form: "Unit Quantity must be greater than zero", "Stone Sale Price cannot be negative". `money` takes the label, so a bare "Cannot be negative" cannot appear. The SQL copy of the Unit Quantity sentence lives in `private.validate_batch_input` and was redefined by a new migration.
- A refusal stays on screen only while the values it was raised for are unchanged. `useRefusal` remembers the form values at refusal time and hides the message once any value differs, so Inward, Sell and Edit sale clear it as soon as a field changes, without wiring each setter.

In the seam tests, the generated RPC `Args` type has no nullable date, so the null-date case is exercised through SQL directly.

Related: [[testing]].
