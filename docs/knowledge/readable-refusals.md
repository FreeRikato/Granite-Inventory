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
  - supabase/migrations/20261029130000_price_per_sqft.sql
  - tests/seam/api-observations.test.ts
  - tests/seam/name-limit.test.ts
  - components/customer-dialog.tsx
  - app/(app)/settings/actions.ts
  - app/(app)/settings/admin-lists.tsx
  - app/(app)/settings/team-access.tsx
  - app/(app)/inward/inward-form.tsx
  - tests/e2e/customers.spec.ts
  - tests/e2e/inward-settings-yard.spec.ts
---
# Readable refusals

Every refusal reads as a business rule, whether it comes from a form or a direct API caller. Never raw Postgres text.

- Postgres raises the domain rules as errors whose message is the operator-facing text. Every server action returns one uniform shape (`lib/action-result.ts`) so forms handle success and failure alike.
- Form schemas cap numbers at the column limits: `numeric(12, 2)` for money (the Unit Purchase Price column is `numeric(22, 10)` since it became a rate per sq ft, and `validate_batch_input` bounds the Landed Cost it produces instead), `numeric(5, 2)` for sizes, and a practical cap for counts and thickness. An oversized number is refused with "Number is too large" instead of reaching Postgres as a `22003` overflow.
- The settings schema is a partial update: each field is optional so a page can save just the ones it owns.
- Ticket T04 made API validation readable, bounded dates ([[ist-calendar]]) and made access errors explicit. T09 put the correction functions on the same path ([[corrections]]).
- Audit round 2 (SYN2-11, 13, 14, 15) closed the last places direct API callers saw raw text: the zero-quantity copy now matches the form, the batch-code preview refuses bad input ([[batches]]), and a second Walk-in Customer is refused by name ([[sales-and-stock-lines]]).
- A refusal names its field by the label on the form: "Unit Quantity must be greater than zero", "Stone Sale Price cannot be negative". `money` takes the label, so a bare "Cannot be negative" cannot appear. The SQL copy of the Unit Quantity sentence lives in `private.validate_batch_input` and was redefined by a new migration.
- A blank Stone Sale Price is refused as "Stone Sale Price is required". `requiredMoney` turns a blank or whitespace string into a missing value before the number coercion, which would otherwise read `""` as 0 and record a zero-rupee Sale. The refusals for a NaN or infinite price and for a Bill's date and payment mode live in Postgres ([[sales-and-stock-lines]]).
- A refusal stays on screen only while the values it was raised for are unchanged. `useRefusal` remembers the form values at refusal time and hides the message once any value differs, so Inward, Sell and Edit sale clear it as soon as a field changes, without wiring each setter.
- Every 80-character name field (customer, product, supplier, business, variant, Settings rename, team member) shares one `name` schema in `lib/schemas/common.ts`, so an over-long name reads "Name must be 80 characters or fewer" instead of Zod's "Too big: expected string to have <=80 characters". Every name input (customer dialog, Inward New product and New supplier, Settings rename, team member) also sets `maxLength` to `NAME_MAX`, so typing and pasting stop at 80 and the message is only a backstop for a value that bypasses the input. The team-member name is the one optional name (`optionalName`): empty or whitespace-only is accepted and stored as no name, while the 80-character limit and message still apply.
- The customer dialog shows a refusal once, inline above its buttons, through `useRefusal`. It used to raise a toast per refusal, so clicks that landed before the pending state disabled the button stacked identical toasts. The refusal is one piece of state, so a repeat replaces itself. Other forms still raise toasts for refusals (Inward, Settings lists, Yard actions).

In the seam tests, the generated RPC `Args` type has no nullable date, so the null-date case is exercised through SQL directly.

Related: [[testing]].
