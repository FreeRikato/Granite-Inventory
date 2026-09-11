# 02 — Log a delivery

**What to build:** An operator fills the Inward Stock form (date defaulting to today, Supplier, Product, Variant, Size, Slot, quantity, Unit Purchase Price, optional Freight Cost), adding a Supplier or Product inline when it does not exist, sees the Batch Code and suggested Slot before saving, and after saving sees the new Batch in a bare list with its Landed Cost. Memorial Products skip Size and default to the Doom Stones Slot.

**Blocked by:** 01 — Sign in and app shell

**Status:** done

- [x] Tables: products (name, category, abbreviation unique), variants (unique per product), suppliers, batches with generated `landed_cost`, `created_by`, `updated_by`
- [x] Check constraints: Size all-null for Memorial and all-present otherwise; purchase date not in the future; positive units; non-negative prices; slot and category from the agreed lists (text, not enum)
- [x] `create_batch` derives the default Slot from Category and length, generates the Batch Code `{ABBR}-{DDMON}{YY}-{seq}` inside the transaction, inserts and returns the row
- [x] Inward form with Supplier and Product comboboxes that create inline (Product asks for Category and an abbreviation suggested from initials), Variant text with "existing variant found" hint, Size fields hidden for Memorial, Slot editable
- [x] Batch Code preview and "batches are never merged" note shown on the form
- [x] Bare Batches list page shows Product, Variant, Batch Code, Size, Slot, units, Landed Cost
- [x] Seam tests: Landed Cost with and without freight; Batch Code sequence per product per day; concurrent inserts never collide; Memorial Size rule; future date rejected; Yard Operator can create, anon cannot
- [x] Playwright: log a delivery end to end and see it in the list
