---
code:
  - supabase/migrations/20260911093608_team_and_settings.sql
  - supabase/migrations/20260911100000_stock.sql
  - supabase/migrations/20260911120000_sales.sql
  - supabase/migrations/20260911160000_corrections.sql
  - supabase/migrations/20261103100000_product_images.sql
  - supabase/migrations/20261107120000_viewer_role.sql
  - supabase/seed.sql
  - lib/auth.ts
  - lib/domain.ts
  - components/shell/member-provider.tsx
  - app/(app)/settings/page.tsx
  - tests/seam/access.test.ts
  - tests/seam/viewer.test.ts
  - tests/e2e/viewer.spec.ts
---
# Access model

Team Members are the Google accounts allowed in. Every RLS policy goes through `is_member()`, `can_write()` or `is_admin()`, which read the caller's email from the JWT. All three are security definer so the lookup can bypass RLS on `team_members` itself; they only ever answer a question about the caller, never about anyone else.

`is_member()` means "may read", and it is true for a Viewer. `can_write()` means "may write": it allows Admin and Yard Operator by name, so any Role added later starts read-only. Never gate a write on `is_member()`.

Trigger functions live in the `private` schema and run as the calling role, so members get usage on that schema. Nothing in it is exposed through the API; only `public` is.

## Guards

- The yard must always keep at least one Admin, otherwise nobody can manage access. A trigger refuses deleting or demoting the last one (the seam test demotes everyone but the test admin, then tries to delete it). The trigger takes an advisory transaction lock first, so two Admins demoting each other at once run one after the other and the second is refused; locking the Admin rows instead would deadlock, because each transaction already holds its own row.
- `settings` is a single-row table: its primary key is a boolean that must be true.
- The bootstrap rows the app cannot run without (the settings row, the first Admin, the Walk-in Customer) are inserted by the migration idempotently, so the local `seed.sql` and the migration agree. The seed's Walk-in insert is guarded with `where not exists` rather than `on conflict do nothing`, because the Walk-in trigger ([[sales-and-stock-lines]]) raises before a conflict clause could apply. The seeded Admin email is swapped for the client's before handover.

## Writes go through functions

Writers read and create directly under RLS, but there is deliberately no update or delete policy on Batches or Sales. They change only through security definer functions (`record_sale` and the [[corrections]] functions), whose first statement is `private.require_writer()` or `private.require_admin()`. That is how an operator can decrement a Batch through a sale without being allowed to update Batches at all, and why Available can never drift. See [ADR 0001](../adr/0001-inventory-rules-in-postgres.md).

Views that resolve names (`v_batches` and friends) use `security_invoker`, so RLS on the underlying tables still applies. The exception is [[public-catalog]].

## The Viewer

Two layers refuse a Viewer, on purpose.

- The checks above: the insert and update policies use `can_write()`, and `record_sale`, `record_bill`, `record_credit_payment`, `extend_pay_by` and `create_batch` start with `private.require_writer()`. `create_batch` is security invoker, so its check and RLS both apply.
- `refuse_viewer`, a statement-level before trigger on every `public` table. It exists for two reasons. RLS alone reads badly: an update under a false `using` affects 0 rows with no error and an insert fails with raw policy text, while the trigger fires first and says "A Viewer cannot change anything". And a security definer function bypasses RLS but not triggers, so a new write function that wrongly gates on `is_member()` is still refused. The trigger function is security definer so that an anon write reaches the normal RLS refusal and not a permission error on `private`.

The Storage API is outside both: the Admin-only policies on `storage.objects` refuse a Viewer, with Storage's own message, and the bucket only has an Admin UI.

`tests/seam/viewer.test.ts` walks every write path from the catalog, so it is the check for new code: a new volatile function fails it until it is added to the walk, a new table without `refuse_viewer` fails the probe, and a volatile function or write policy that mentions `is_member()` fails too. `chat_query` is the one volatile function that stays on `is_member()`: it is read-only ([ADR 0004](../adr/0004-chat-reads-through-a-read-only-role.md)), so Chat works for a Viewer and cannot write.

`truncate` skips RLS and row triggers, so the migration revokes it from `anon` and `authenticated` on every table in `public`; a new table gets the grant back by default and the seam test fails until it is revoked.

`credit_promises`, `credit_payments` and `credit_payment_lines` grant `authenticated` no write at all, so a direct API write gets Postgres's permission error for every Role, before any trigger.

In the UI, `useCanWrite()` hides the controls and `canWrite(role)` serves server components. Both are display only; the database is the rule.

## Owner-rights views take no writes

Supabase's default privileges grant `anon` and `authenticated` every privilege on a new view, and `revoke all ... from public` does not remove those grants. `v_public_business` selects plain columns from `settings`, so it is auto-updatable, and being owner-rights it bypasses RLS: until the Viewer migration, any signed-in Google account, on the Team Member list or not, could update or delete the settings row through it. The migration revokes every write on both public views, and `viewer.test.ts` fails if any view without `security_invoker` is writable. See [ADR 0003](../adr/0003-public-views-bypass-rls.md).

## Product images

The `product-images` Storage bucket is public for reading by URL, and its policies on `storage.objects` (select, insert, update, delete) all require `is_admin()`. Setting `products.image_path` is an ordinary Product update, which only an Admin may do. See [[product-images]].

Related: [[auth-session]], [[sales-and-stock-lines]].
