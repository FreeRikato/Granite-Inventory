---
code:
  - supabase/migrations/20260911093608_team_and_settings.sql
  - supabase/migrations/20260911150000_public_catalog.sql
  - components/catalog/stone-tile.tsx
---
# Public catalog

What an anonymous visitor may see. Two views owned by `postgres`, without `security_invoker`, read the base tables directly, so `anon` can read them without any RLS access to the underlying tables ([ADR 0003](../adr/0003-public-views-bypass-rls.md)):

- `v_public_business` exposes only the business name, tagline, WhatsApp number and whether the catalog is on.
- `v_public_catalog` exposes only public stock columns, and returns nothing at all while the catalog is switched off in Settings. `/catalog` 404s in that state.

Photos are Phase 2. Until then each stone tile gets a stable two-tone swatch derived from its name.

Related: [[access-model]].
