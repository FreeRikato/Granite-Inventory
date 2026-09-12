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

- Product > Variant > Batch. Variant carries grade or finish only; Size (L ft, B ft, T mm) lives on the Batch.
- Size is required for Granite and Tiles, null for Memorial. Grouping treats null Size as one group per Variant.
- Slot is a stored enum (4FT, 5FT, DOOM, CUSTOM), defaulted by rule and overridable in the inward form:
  - Memorial → DOOM
  - 4 ≤ length < 5 → 4FT
  - 5 ≤ length < 6 → 5FT
  - anything else → CUSTOM
- Batch Code format `{PRODUCT_ABBR}-{DDMON}{YY}-{seq}` (e.g. `BP-07SEP26-01`). Abbreviation stored on Product, unique, auto-suggested from initials and editable. Sequence resets per product per day. Generated inside the insert function. Purchase dates before 2000-01-01 are refused so the two-digit year remains unambiguous for the supported history.
- Landed Cost = unit_purchase_price + freight_cost / initial_units, stored as a generated column. Sales snapshot the Landed Cost at time of sale.
- Money is `numeric(12,2)`; percentages `numeric(5,2)`. UI formats as whole rupees.
- Products, Variants, Suppliers and Customers are created inline from the inward and sell forms. A minimal admin list allows rename; delete only when nothing references the row (FK restrict). No merge tool.
- Customer phone is unique when present (compared on the last ten digits); adding a customer with a phone already on file selects that customer instead. Walk-in Customer is a seeded row with no phone.

## Selling

- One Sale = one Batch. Multi-batch purchases are recorded as multiple Sales.
- Sale Price, Stickering Cost and Stickering Price are per piece; totals are derived from quantity. Misc Expense is a single amount per Sale, excluded from Margin.
- Margin = qty × (sale_price − landed_cost) + qty × (stickering_price − stickering_cost). Margin % = margin / (qty × (sale_price + stickering_price)).
- FIFO Listing shows Batches of the chosen Stock Line with Available > 0, oldest first, with Ageing Band. Any Batch may be picked; nothing is blocked or confirmed.
- Payment Mode enum: CASH, UPI, BANK_TRANSFER. All Sales are considered paid. No credit or dues.
- Dates are `date` columns in IST: `private.ist_today()` is the reference for future-date checks and Age, whatever zone the server runs in. Past Sale dates are allowed without limit; future dates are rejected.

## Corrections

- Admin only. Edit and delete on Batch and Sale via SQL functions that re-balance Available and re-snapshot Landed Cost where a Sale's Batch changes.
- Refused if the result would make any Batch's Available negative.
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
| Active stock | SUM(available) over all Batches |
| Total inventory value | SUM(available × landed_cost) |
| MTD Revenue | SUM(qty × sale_price + qty × stickering_price) for Sales in the current calendar month (IST). Misc Expense excluded. |
| MTD Margin | SUM(margin) for the month; % = margin / MTD Revenue |
| vs last month | Active stock now vs Active stock at the last day of the previous month, computed as bought-before minus sold-before that date |
| Stock status donut | All-time: SUM(available) vs SUM(units sold) |
| Fast vs slow moving | Units sold in the last 90 days grouped by L × B (thickness ignored), top 5 descending. Memorial shown as one bar per Variant. |
| Stale stock panel | Batches in the Stale band with Available > 0, oldest first, top 4, link to Yard filtered by Stale |

## Yard view

- Tabs per Slot; inside a Slot, sub-tabs per L × B; Batches oldest first (Newest first as the only alternative sort).
- Filters: search text, Product, Variant, Thickness, Supplier, Age.
- Sold Out Batches hidden by default, "Show sold out" toggle.
- Within a size group, Batches are shown grouped by Stock Line (lines ordered by their oldest Batch) so a Clamp separator sits between every pair of consecutive Batches of the same line, labelled "New batch arrived N days later".
- `/yard?line=<line_key>` deep-links to one Stock Line and lands on its slot; the palette and the stale panel use it. The Age filter includes a "Stale band" option that follows the configured threshold.

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
