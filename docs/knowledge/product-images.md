---
code:
  - supabase/migrations/20261103100000_product_images.sql
  - lib/product-images.ts
  - lib/shrink-image.ts
  - lib/schemas/settings.ts
  - lib/query/writes.ts
  - app/(app)/settings/catalog-images.tsx
  - app/(app)/settings/actions.ts
  - app/(app)/settings/page.tsx
  - app/(app)/public-link/page.tsx
  - components/catalog/stone-tile.tsx
  - tests/seam/product-images.test.ts
  - tests/e2e/catalog.spec.ts
---
# Product images

One photo per Product, set by an Admin in the Catalog images card in Settings, shown only on the Public Catalog and its preview ([[public-catalog]]). Every Stock Line of the Product shows the same photo; a Product without one keeps the colour swatch. Sell, Yard and Stock Lines never show it.

## Storage

- `products.image_path` holds the object path. A check requires it to start with the Product's own id plus a slash, so a path cannot be attached to another Product. The Settings action turns that check into "That image belongs to another Product".
- Bucket `product-images` is public (visitors read a file by its public URL, built from `NEXT_PUBLIC_SUPABASE_URL` in `lib/product-images.ts`), holds at most 2 MiB per file and accepts only webp, jpeg and png. The policies on `storage.objects` allow select, insert, update and delete only when `is_admin()`, so a visitor can fetch a known URL but cannot list the bucket and an operator cannot write ([[access-model]]).
- `v_public_catalog` gains exactly one column, `image_path`. The Public Catalog preview reads `v_stock_lines`, which has no image, so its page reads `products.image_path` as a member and merges it by Product id.

## Upload

The browser shrinks the photo first (`lib/shrink-image.ts`: canvas, longest side 1200 px, WebP at 0.8 quality) so a phone photo is a few hundred KB. A browser that cannot encode WebP (the canvas hands back PNG) falls back to JPEG at the same quality and the file name ends in `.jpg`. The file goes straight to Storage under the Admin's own session, so RLS decides whether the upload is allowed, then a server action saves the path.

Every upload gets a new name, `<product id>/<uuid>.webp`, so a cached copy of the old photo can never show after a replace. The action saves the new path and then deletes the previous file. If saving the path fails, the action deletes the file it just received. Remove clears the path and deletes the file without a confirmation. Deleting a Product deletes its file too (`deleteProduct`); archiving keeps it, because an archived Product can still have stock in the catalog. A failed cleanup only leaves an unreferenced file behind.

Photos are already shrunk, so `ProductPhoto` renders them with `next/image` set to `unoptimized`: the optimiser would add a second resize, and it refuses the private address of the local stack. The swatch stays behind the photo as the placeholder while it loads.

## Local stack

Storage uploads need the storage database objects the container's own migrations create. A stack whose `storage.objects` indexes `idx_objects_current_version` and `idx_objects_null_version` lack `collate "C"` (left by another storage version) answers every upload with error 42P10; see [docs/local-dev.md](../../docs/local-dev.md).
