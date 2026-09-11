# Inventory rules live in Postgres functions, not application code

Batch creation, Sale recording and Corrections are `plpgsql` functions called via Supabase RPC. Available is re-balanced, Landed Cost is snapshotted and Batch Codes are generated inside one transaction with a row lock, so two operators on two phones cannot oversell a Batch or collide on a code. Ageing Bands, Stock Lines and the Public Catalog are views over the same tables. The alternative, doing this in Next.js server actions with an ORM, was rejected because the no-merge FIFO rule and margin math are the one thing this product must never get wrong, and the app layer cannot guarantee atomicity across concurrent requests without reinventing what Postgres already provides.

## Consequences

- Tests target the SQL functions directly against a local `supabase start` database.
- No ORM; schema changes are plain SQL migrations plus `supabase gen types`.
- Any future client (mobile app, AI assistant) gets the same guarantees by calling the same functions.
