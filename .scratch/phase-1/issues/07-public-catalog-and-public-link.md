# 07 — Public Catalog and Public Link

**What to build:** Anyone can open the catalog page and see every Stock Line with stock: Product, Variant, Size, exact count, filterable by Category and searchable, with a "Call to Inquire" button that opens WhatsApp to the business number with the Stock Line prefilled. Nothing about prices, costs, Suppliers, Batches or dates appears. Inside the app, the Public View Link page shows the URL with a copy button, a live/off toggle, the WhatsApp number field and a preview. When switched off the catalog returns not found.

**Blocked by:** 04 — Sell stone

**Status:** ready-for-agent

- [ ] `v_public_catalog` exposes only public columns, only lines with Available above zero, and no rows when `catalog_public` is false; it is the only object granted to anon
- [ ] Catalog route is unauthenticated, server-rendered, fast on a low-end phone, and returns 404 when the catalog is off
- [ ] Category chips (All, Granite, Doom Stone, Tiles) and text search; cards per the design on desktop and mobile
- [ ] WhatsApp button builds the wa.me link from the settings number with a prefilled message naming the Stock Line
- [ ] Public View Link page: URL, copy, live toggle, WhatsApp number editing, preview of the first few lines
- [ ] Seam tests: anon reads the catalog view and nothing else; view empty when off; sold-out lines absent; no private column present
- [ ] Playwright: open the catalog as a logged-out visitor, see a seeded line with the right count and no price
