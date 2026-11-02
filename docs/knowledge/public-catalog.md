---
code:
  - supabase/migrations/20261027182609_archive_and_named_slots.sql
  - supabase/migrations/20260911093608_team_and_settings.sql
  - supabase/migrations/20260911150000_public_catalog.sql
  - components/catalog/stone-tile.tsx
  - supabase/migrations/20261103100000_product_images.sql
---
# Public catalog

What an anonymous visitor may see. Two views owned by `postgres`, without `security_invoker`, read the base tables directly, so `anon` can read them without any RLS access to the underlying tables ([ADR 0003](../adr/0003-public-views-bypass-rls.md)):

- `v_public_business` exposes only the business name, tagline, WhatsApp number and whether the catalog is on.
- `v_public_catalog` exposes only public stock columns, leaves out archived Batches, and returns nothing at all while the catalog is switched off in Settings. `/catalog` 404s in that state.

`v_public_catalog` also exposes `image_path`. A stone tile shows its Product's photo cropped into the image box when the Product has one, and otherwise a stable two-tone swatch derived from its name ([[product-images]]).

Related: [[access-model]].
