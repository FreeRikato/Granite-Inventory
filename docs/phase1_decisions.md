# Phase 1 Decisions

Outcome of the grilling session on 11 Sep 2026. Vocabulary lives in `CONTEXT.md`; this file holds the rules and computed definitions that are not glossary material.

## Malleability first

This is the first iteration after one rough call with the client. Expect heavy change in design, business rules and API. Every choice below is provisional, and the build follows these principles so change stays cheap:

- Store raw facts, derive everything else. Per-piece prices and quantities are stored; totals, margins, Age, Ageing Band, Stock Lines, Sold Out and Clamps are computed in views. Changing a formula is a view edit, not a data migration.
- No Postgres `enum` types. Categorical columns (Slot, Customer Type, Payment Mode, Role, Category) are `text` with a check constraint, so adding or renaming a value is one small migration.
- Rules live in a handful of SQL functions and views (see ADR 0001), so a rule change touches one place and is covered by one test, regardless of how many screens use it.
- Inputs rejected by constraints reachable through the UI or documented API raise a readable business-rule message before the database constraint fires, rather than exposing raw Postgres text.
- Screens are thin: server components read views, forms call functions. UI can be reshaped without touching data.
- Nothing is pre-optimised for scale or multi-tenancy. Add it when a second yard exists.
- When a rule here is changed, update this file and `CONTEXT.md` in the same commit rather than letting the docs drift.

## Stock model

- Product > Variant > Batch in storage, but Variant is hidden from every screen. New Batches get the Product's "Standard" Variant; older Variants stay stored. Stock Lines, Clamps and the Public Catalog group by Product and Size only, so stock that differs only by Variant reads as one line. Size (L ft, B ft, T mm) lives on the Batch.
- Size is required for Granite and Tiles, null for Memorial. Grouping treats null Size as one group per Product.
- Slot is stored text: one of the built-in 4FT, 5FT, DOOM, CUSTOM or a name the operator types (trimmed, up to 20 characters). It is defaulted by rule and overridable in the inward form and the Edit dialog:
  - Memorial → DOOM
  - 4 ≤ length < 5 → 4FT
  - 5 ≤ length < 6 → 5FT
  - anything else → CUSTOM
- Every new Batch records its Stack: a Slot plus a typed Batch number (shown to users as "Batch number", up to 20 characters, trimmed). `create_batch` refuses a Batch without one; a Correction keeps the existing number unless a new one is given. The inward form offers recently used Slot and Batch number pairs (`v_recent_stacks`) and an Add dialog for a new pair, whose slot picker lists the built-in slots plus every typed slot already used and can add a new one. Batches from before this rule have no Stack.
- Batch Code format `{PRODUCT_ABBR}-{DDMON}{YY}-{seq}` (e.g. `BP-07SEP26-01`). Abbreviation stored on Product, unique, auto-suggested from initials and editable. Sequence resets per product per day. Generated inside the insert function. Purchase dates before 2000-01-01 are refused so the two-digit year remains unambiguous for the supported history.
- Freight is part of the Unit Purchase Price: the Inward form and the Edit dialog do not ask for a Freight Cost, so a new or edited Batch has `freight_cost` 0 and its Landed Cost equals the Unit Purchase Price entered. A one-time migration folded stored freight into the price (`unit_purchase_price = landed_cost`, `freight_cost = 0`), so no Batch's Landed Cost changed and Sales kept their snapshots. The `freight_cost` column and the RPCs' `p_freight_cost` parameter remain.
- Landed Cost = unit_purchase_price + freight_cost / initial_units, stored as a generated column. Sales snapshot the Landed Cost at time of sale.
- Total cost = initial_units * unit_purchase_price + freight_cost, derived in `v_batches` as `total_cost` and shown in Recent batches after Landed cost, for live and archived Batches. Nothing is stored; the client reads what a whole Batch cost without multiplying by Pieces.
- Money is `numeric(12,2)`; percentages `numeric(5,2)`. UI formats as whole rupees.
- Products, Suppliers and Customers are created from the inward and sell forms, through the Add button beside each select or the select's inline Add row. Admins can edit, archive or delete a Product or Supplier straight from its picker on Inward, and in the Settings list, which also shows archived rows and unarchives them. Delete only when no Batch references the row (FK restrict); the refusal suggests archiving instead. Deleting a Product removes its unused Variants with it. An archived Product or Supplier leaves the Inward pickers and `create_batch` refuses it; a Correction may keep a Batch on its current archived one but cannot move a Batch onto one. No merge tool.
- Customer phone is unique when present (compared on the last ten digits); adding a customer with a phone already on file selects that customer instead. Walk-in Customer is a seeded row with no phone. The Walk-in Customer flag is immutable for every role.

## Selling

- One Sale = one Batch. Multi-batch purchases are recorded as multiple Sales.
- Sale Price, Stickering Cost and Stickering Price are per piece; totals are derived from quantity. Misc Expense is a single amount per Sale, excluded from Margin.
- Margin = qty × (sale_price − landed_cost) + qty × (stickering_price − stickering_cost). Margin % = margin / (qty × (sale_price + stickering_price)).
- FIFO Listing shows Batches of the chosen Stock Line with Available > 0, oldest first, with Ageing Band. Any Batch may be picked; nothing is blocked or confirmed.
- Payment Mode enum: CASH, UPI, BANK_TRANSFER. All Sales are considered paid. No credit or dues.
- Dates are `date` columns in IST: `private.ist_today()` is the reference for future-date checks and Age, whatever zone the server runs in. A Sale date cannot be before its Batch's purchase date. Past Sale dates are allowed back to the Batch purchase date; future dates are rejected.

## Corrections

- Admin only. Edit and delete on Batch and Sale via SQL functions that re-balance Available and re-snapshot Landed Cost where a Sale's Batch changes.
- Refused if the result would make any Batch's Available negative.
- Archive (`archive_batch`) works on any Batch, sold from or not, and is undone by Unarchive. An archived Batch is left out of Sell, Stock Lines, the Public Catalog, the stale panel, Recent batches on Inward, Active stock, inventory value and the "vs last month" figure. Its Sales and their margins stay, and so do units sold in the donut and fast movers. `record_sale` refuses an archived Batch, and `correct_sale` refuses moving a Sale onto one but still edits a Sale already on it. Delete is limited to Batches that are archived and have no Sales: archive first, then delete from the Yard or Recent batches under Show archived.
- A Batch purchase date cannot be moved later than its earliest Sale; the refusal names that date.
- `updated_at` and `updated_by` on Batch and Sale. No audit log in Phase 1.
- Available on mobile as well as desktop.

## Ageing

- Two settings: `ageing_after_days` (default 90) and `stale_after_days` (default 180), with ageing < stale enforced.
- Age = today − purchase_date. Band computed in the view; nothing stored.
- Yard age filter offers >90, >180, >365 days.

## Access

- Google OAuth only. `team_members(email, role)` is the allowlist; RLS on every table checks the JWT email against it.
- Roles ADMIN and YARD_OPERATOR. Both read everything including costs and margins. ADMIN additionally: Corrections, Settings, Team Members, Products admin.
- First ADMIN is seeded by migration as aravinthanrc@gmail.com for development; swap for the client's email before handover. Invite = admin adds email + role to the list; no email is sent. Removing the row revokes access on the next request.

## Public Catalog

- Route `/catalog` on the app domain, no tenant slug.
- Lists Stock Lines with Available > 0 with exact counts, filterable by Category. No prices, costs, suppliers, batches, dates or photos.
- `settings.catalog_public` toggle; when false the route returns 404.
- "Call to Inquire" opens `wa.me/{settings.whatsapp_number}` with a prefilled message naming the Stock Line. Nothing is recorded.
- Served from a `v_public_catalog` view granted to the anon role. It and `v_public_business` are owner-run views by design (ADR 0003); the Supabase advisor warning on them is expected.

## Dashboard definitions

| KPI | Definition |
|---|---|
| Active stock | SUM(available) over Batches that are not archived |
| Total inventory value | SUM(available × landed_cost) over Batches that are not archived |
| MTD Revenue | SUM(qty × sale_price + qty × stickering_price) for Sales in the current calendar month (IST). Misc Expense excluded. |
| MTD Margin | SUM(margin) for the month; % = margin / MTD Revenue |
| vs last month | Active stock now vs Active stock at the last day of the previous month, computed as bought-before minus sold-before that date |
| Stock status donut | All-time: SUM(available) vs SUM(units sold) |
| Fast vs slow moving | Units sold in the last 90 days grouped by L × B (thickness ignored), top 5 descending. Memorial shown as one bar per Product. |
| Stale stock panel | Batches in the Stale band with Available > 0, oldest first, top 4, link to Yard filtered by Stale |

## Yard view

- One section per Stack (Slot plus Batch number), ordered by Slot then Batch number, with Batches oldest first inside (Newest first as the only alternative sort). Batches without a Batch number share a final "No batch number" section. No slot tabs or size sub-tabs.
- Filters: search text (also matches the Batch number), Slot, Product, Thickness, Supplier, Age.
- Sold Out Batches hidden by default, "Show sold out" toggle. Archived Batches hidden by default, "Show archived" toggle; their Available is left out of the Stack's count.
- The Slot filter lists the built-in slots, then typed slots alphabetically, which is also the Stack section order.
- Within a Stack, Batches are shown grouped by Stock Line (lines ordered by their oldest Batch) so a Clamp separator sits between every pair of consecutive Batches of the same line, labelled "New batch arrived N days later".
- `/yard?line=<line_key>` deep-links to one Stock Line, showing every Stack that holds it; the palette and the stale panel use it. The Age filter includes a "Stale band" option that follows the configured threshold.

## Navigation

- Desktop: sidebar Overview · Inward Stock · Sell Stone · Yard Slots · Customers · Public View Link, Settings from the profile block. ⌘K palette searches pages, Stock Lines (jumps to Yard filtered) and Customers.
- Mobile (< 768 px): tab bar Overview · Inward · Sell · Yard · More; More sheet holds Customers, Public Link, Settings, Sign out. No palette.
- Customers has a detail page (name, phone, type, list of Sales). "Last purchase" is derived from Sales.

## Explicitly out of Phase 1

- Credit sales and dues
- Multi-batch Sales or receipts
- Photos in the catalog
- Merge tool for duplicate Products or Customers
- Audit log
- Offline mode or service worker
- Cost hiding for Yard Operators
- AI assistant, seasonal comparison, WhatsApp Business API
