---
code:
  - supabase/migrations/20260911093608_team_and_settings.sql
  - supabase/migrations/20260911100000_stock.sql
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911160000_corrections.sql
  - supabase/seed.sql
  - lib/auth.ts
  - tests/seam/access.test.ts
---
# Access model

Team Members are the Google accounts allowed in. Every RLS policy goes through `is_member()` or `is_admin()`, which read the caller's email from the JWT. Both are security definer so the lookup can bypass RLS on `team_members` itself; they only ever answer a question about the caller, never about anyone else.

Trigger functions live in the `private` schema and run as the calling role, so members get usage on that schema. Nothing in it is exposed through the API; only `public` is.

## Guards

- The yard must always keep at least one Admin, otherwise nobody can manage access. A trigger refuses deleting or demoting the last one (the seam test demotes everyone but the test admin, then tries to delete it).
- `settings` is a single-row table: its primary key is a boolean that must be true.
- The bootstrap rows the app cannot run without (the settings row, the first Admin, the Walk-in Customer) are inserted by the migration idempotently, so the local `seed.sql` and the migration agree. The seed's Walk-in insert is guarded with `where not exists` rather than `on conflict do nothing`, because the Walk-in trigger ([[sales-and-stock-lines]]) raises before a conflict clause could apply. The seeded Admin email is swapped for the client's before handover.

## Writes go through functions

Members read and create directly under RLS, but there is deliberately no update or delete policy on Batches or Sales. They change only through security definer functions (`record_sale` and the [[corrections]] functions), whose first statement is the member or Admin check. That is how an operator can decrement a Batch through a sale without being allowed to update Batches at all, and why Available can never drift. See [ADR 0001](../adr/0001-inventory-rules-in-postgres.md).

Views that resolve names (`v_batches` and friends) use `security_invoker`, so RLS on the underlying tables still applies. The exception is [[public-catalog]].

Related: [[auth-session]], [[sales-and-stock-lines]].
