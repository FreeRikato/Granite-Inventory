---
code:
  - supabase/migrations/20261029180000_chat_query.sql
  - tests/seam/chat-query.test.ts
---
# Chat

The Overview chat ([[dashboard]]) lets a model answer questions by writing SQL. Everything it may read is decided in Postgres; see [ADR 0004](../adr/0004-chat-reads-through-a-read-only-role.md) for why.

## The read path

`chat_query(q text) returns jsonb` is called through PostgREST with the member's session ([[auth-session]]). It is `security definer` and owned by `chat_reader`, so everything inside it runs as `chat_reader`. In one transaction it:

1. refuses a caller who is not a team member (`42501`, "Chat is for team members"), before the query is read,
2. sets `transaction_read_only = on`,
3. in a sub-transaction, empties `request.headers` and `request.cookies`, cuts `request.jwt.claims` down to the email, and runs `select * from (<q>) limit 500`, collecting the rows as a JSON array,
4. rolls the sub-transaction back, keeps the rows, and releases every session-level advisory lock the query took (also when the query fails or is cancelled by the statement timeout).

Errors (permission, syntax, read-only) come back as the RPC error, so the model can read the message and try again. The statement timeout is the one `authenticated` already has; a query that sets `statement_timeout` to 0 does not lift it, because the timer for the call is already running.

Only `authenticated` may execute it. A signed-in stranger is refused by step 1, so every view can end in `where (select is_member())` ([[access-model]]) without that filter being the only guard, and every view is `security_barrier` so a query condition cannot be evaluated against rows the member filter would have hidden.

## What the query can do with the session

The query runs as `chat_reader`, which only has what `public` has: it can call every function that is executable by `public` and set any custom setting (`set_config` is a function). Postgres cannot take a `public` privilege away from one role, so the guard is the shape of `chat_query`, not a list of forbidden functions:

- Identity. `is_member()` reads `request.jwt.claims` through `auth.jwt()`, and a query can overwrite that setting with `set_config('request.jwt.claims', ...)`. The membership check runs once, before the query, so a forged email buys a stranger nothing: they are refused first. The same query used to be able to set `request.jwt.claim` (singular, which `auth.jwt()` reads first) at session level and keep it on the pooled connection, turning later requests of other users into admins; the sub-transaction rollback undoes every session-level `set_config(..., false)`.
- Secrets in the request. PostgREST puts the whole request in `request.headers`, bearer token included. Step 3 empties it and the cookies, and leaves the model only the member's email from the claims (no `sub`, `session_id` or Google profile).
- State that outlives the call. A session-level advisory lock (`pg_advisory_lock`, `pg_try_advisory_lock`, shared variants) is not undone by a rollback or by the transaction ending, and would sit on the pooled connection holding off whoever asks for that key; Add Batch takes `pg_advisory_xact_lock(hashtext(prefix))`. `pg_advisory_unlock_all()` after the query, and in both error branches, releases them. `pg_notify` (for example `pgrst`, which makes PostgREST reload) is discarded with the sub-transaction.
- Time. `pg_sleep` and heavy joins stop at the statement timeout.

`plpgsql` keeps its local variables when a sub-transaction is rolled back, which is how the rows survive the rollback. The branch for `query_canceled` is separate because `when others` does not match it.

What this does not close: the query can still read anything `public` can read. Catalogs and function sources hold no data. Database-level settings are readable too: the local Supabase stack sets `app.settings.jwt_secret` on the database, readable with `current_setting('app.settings.jwt_secret', true)` and from `pg_db_role_setting`. Check hosted projects with `select setconfig from pg_db_role_setting where setdatabase <> 0`; a signing secret there is readable by any team member through chat.

## Why the role cannot be changed

An earlier version switched with `set local role chat_reader` in a normal function. `set role` is allowed to any role the connection's login (`authenticator`) belongs to, which includes `authenticated` and `service_role`, so `select set_config('role', 'authenticated', true), query_to_xml('select name from customers', ...)` read customer names inside one statement. Scanning the query or its plan for `set_config` does not help, because `query_to_xml(concat('select set_', 'config(...)'))` builds the name at run time.

The fix is in the privilege model, not the text. Postgres refuses to change `role` or `session_authorization` inside a security-definer function, however deeply nested, and refuses to leave a read-only transaction once a query has run. `chat_query` is owned by `chat_reader` and is `security definer`, so the member's query starts as `chat_reader` and cannot become anything else. `chat_reader` gets `create` on `public` only for the `alter function ... owner to` in the migration and loses it in the same migration; `postgres` loses its `set` option on `chat_reader` right after, since nothing needs it later. `chat-query.test.ts` runs eight spellings, including the run-time-built ones, as an operator with a real customer and checks that neither the error nor the response holds the name or phone.

## What the views hide

- No `created_by`, `updated_by` or `notes` anywhere: those hold team member emails and free text.
- Customers appear only as `customer_alias`: `C-` plus the first six characters of the customer id. The model never sees a name or phone.
- No `settings`, `team_members`, raw tables or `v_sales`: `chat_reader` simply has no grant on them.

`authenticated` has no privilege on the chat views and is not a member of `chat_reader`, so a direct `select` on a `v_chat_*` view through the API is refused too.

## Why the views restate their sources

Table privileges inside an owner-rights view use the view owner, but a nested `security_invoker` view and every function call use the caller, here `chat_reader`, which is why it also has `usage` on `private` and `execute` on `is_member()`. So `v_chat_batches`, `v_chat_sales`, `v_chat_stock_lines` and `v_chat_kpis` repeat the logic of `v_yard_batches`, `v_sales`, `v_stock_lines` and `v_dashboard_kpis` over the tables, and the ageing band is inlined because `ageing_band()` reads `settings`. The "mirror" tests in `chat-query.test.ts` compare every shared column with the original view on a dataset that has an old batch, a stickered sale and an archived batch. When a derived figure changes in one place, that test fails until the other follows.

Related: [[sales-and-stock-lines]], [[batches]].
