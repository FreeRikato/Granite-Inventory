## 1. Project Overview & Objectives

### 1.1 Background
The client (Kirthik Kumar) operates a family-owned granite, memorial stone, and construction stone supply business based in Tamil Nadu, India. Currently, daily operations—including inventory tracking, stock inward/outward registers, customer histories, and yard allocation—are handled manually on paper and physical registers. Billing is handled manually/offline (cash/UPI/manual GST invoices) and does **not** need automated invoicing in Phase 1.

### 1.2 Core Problem Statement
* **Stale Stock / Capital Lockup**: Stones of the same dimension and type purchased at different dates and prices are accidentally mixed together. Older stock gets buried, left in the yard for over a year, degrades in appearance, and eventually has to be sold at cost or a loss.
* **Lack of Physical Yard Organization Visibility**: Stones are arranged in physical "slots" (e.g., 4ft slot, 5ft slot) in the yard. Mixed sizes and variants in slots lead to manual searching, errors, and misplaced slabs.
* **Margin Tracking with Value-Added Services**: Certain stones undergo custom engraving/lettering ("stickering") for temples, trusts, and Christian memorial graves ("Doom stones"). Total margin must account for both the stone profit and the service/stickering profit.
* **Accessibility for Non-Tech-Savvy Operators**: The client’s parents also manage the yard and sales; the interface must be extremely visual, simple, and intuitive with high-contrast visual indicators.

### 1.3 Project Goal
Build a responsive, cloud-hosted **Web-Based Inventory Management & Yard Tracking System** that tracks stone purchases and sales on a **strict batch/FIFO basis (no cumulative pooling of old and new stock)**, manages physical yard slots, auto-calculates margins, highlights stale inventory, provides visual analytics, and offers a public-facing read-only stock catalog.

---

## 2. User Personas & Access Roles

| Role | Users | Key Needs & Permissions |
| :--- | :--- | :--- |
| **Admin / Business Owner** | Kirthik | Full CRUD access to inventory, purchase costs, sale prices, supplier details, customer CRM, margin analytics, AI chat assistant. |
| **Yard Operator / Co-Owner** | Parents | High-contrast, visual dashboard; quick stock lookup; simple inward/outward entry without technical complexity. |
| **Public / Contractors** | Customers, Engineers, Builders | Read-only public link (shareable via WhatsApp/Instagram) showing currently available stock counts and dimensions without financial data or supplier information. |

---

## 3. Domain Terminology & Core Business Rules

1. **Stone Material / Product Name**: The core material type (e.g., *Black Pearl, Jet Black, G20, G10*).
2. **Product Variant / Quality**: Specific grade, finish, or pattern within a product category (e.g., *Black Pearl Grade-1, Black Pearl XYZ, Jet Black Premium*).
3. **Dimensions & Measurement Units**:
   * **Length & Breadth**: Measured in feet (e.g., $4\text{ ft} \times 2\text{ ft}$, $4.25\text{ ft} \times 2\text{ ft}$, $5\text{ ft} \times 3\text{ ft}$).
   * **Thickness**: Measured in millimeters (standard gauges: $12\text{ mm}$, $16\text{ mm}$, $20\text{ mm}$).
   * **Unit Quantity**: Measured in pieces/slabs.
4. **Physical Yard Slots (Slab Categories)**: The physical yard is partitioned by primary length slots ($4\text{ ft}$ slot, $5\text{ ft}$ slot, etc.). Within a $4\text{ ft}$ slot, various breadth variations exist ($4 \times 2$, $4 \times 2.5$, $4 \times 3$, $4.25 \times 2$).
5. **Doom Stone (Memorial Stones)**: Headstones/cross-engraved stones used for Christian graves and monuments. These have fixed standardized sizes and are tracked primarily by unit count rather than custom slab square footage.
6. **Stickering / Engraving**: A value-added service where names, scriptures, or donor details are engraved onto stones for temples or memorials.
7. **The "Strict Batch / No Cumulative Stock" Rule (CRITICAL)**:
   * **Do NOT pool identical items from different purchases into one total number.**
   * *Example*: If 15 units of $4 \times 2$ Black Pearl were bought on Sept 7 (7 sold, 8 remaining), and 10 units were bought on Sept 10 (3 sold, 7 remaining):
     * The system **must display them as two separate batches**:
       * Batch A (Sept 7): 8 present (Old Stock / High Priority to sell).
       * Batch B (Sept 10): 7 present (New Stock).
     * The yard physically places a clamp/separator between batches. The software must replicate this virtual separator.
8. **Stale Inventory Flag**: Stock older than a configurable threshold (e.g., 6 months to 1 year) must be visually highlighted with warning alerts ("Stale Stock - Discount/Promote") to prevent permanent capital lockup.

---

## 4. Functional Requirements & Workflow Specifications

```
  [ Supplier ] ──► ( Inward / Purchase Batch ) ──► [ Yard Slot Allocation ]
                                                          │
                                                          ▼
  [ Public Catalog ] ◄── ( Live Stock Availability ) ◄── [ Batch-Wise Inventory ]
                                                          │
  [ Customer / Contractor ] ◄── ( Outward / Sales ) ◄─────┘ (FIFO Batch Selection)
                                     │
                                     ▼
                       [ Margin & Analytics Engine ]
```

### 4.1 Stock Inward / Purchase Workflow ("After Bought")
When a lorry or shipment arrives at the yard, the operator logs the shipment:
* **Purchase Date**: Date picker (defaults to today).
* **Seller / Supplier Name**: Searchable dropdown with autofill; allows adding new suppliers on the fly.
* **Product Search / Selector**: Select existing material (e.g., *Black Pearl*) or create a new product/variant.
* **Variant & Specifications**:
  * Variant Name (e.g., `black-pearl-1`)
  * Dimensions: Length (ft), Breadth (ft), Thickness (mm)
  * Unit Quantity (number of slabs/pieces received)
* **Cost Structure**:
  * Unit Purchase Price (₹)
  * Miscellaneous/Freight Inward Cost (optional)
* **Slot Assignment**: System suggests/assigns to a physical Yard Slot (e.g., $4\text{ ft}$ Slot).
* **Batch ID**: Automatically generated (e.g., `BATCH-BP1-20260907-01`) to preserve batch segregation.

### 4.2 Inventory Management & Virtual Yard Display
* **Slot View**: Group inventory by Slot ($4\text{ ft}$ Slabs, $5\text{ ft}$ Slabs, Doom Stones, Custom Pieces).
* **Batch Breakdown within Slot**:
  * Display every unique batch separately with:
    * Purchase Date
    * Quantity Bought | Quantity Sold | Quantity Present
    * Indicator tag: `NEW STOCK` vs `OLD / STALE STOCK`
* **Search & Filter**: Filter by Product Name, Variant, Thickness, Yard Slot, Supplier, or Age (>90 days, >180 days, >365 days).

### 4.3 Stock Outward / Sales Workflow ("After Selling")
When a customer, builder, or temple trustee buys stone:
* **Sale Date**: Date picker (defaults to today).
* **Customer Details**:
  * Customer Name (Searchable; flags "Regular Customer", "Contractor", or "Walk-in")
  * Contact Number
* **Product & Batch Selection**:
  * Select Product / Variant.
  * System lists available batches on a **FIFO (First-In, First-Out)** basis, showing older batches first with remaining counts.
  * Operator selects which batch the stone is physically taken from.
* **Quantity Sold**: Number of units/pieces.
* **Pricing & Calculations**:
  * **Stone Sale Price**: Price charged for the stone ($₹$).
  * **Stone Purchase Price**: Auto-populated from the selected purchase batch.
  * **Base Product Margin**: $\text{Sale Price} - \text{Purchase Price}$.

### 4.4 Value-Added Services: Stickering / Lettering Integration
* **Stickering Checkbox / Toggle**: `[x] Add Stickering / Engraving Service`.
* **Stickering Cost/Expense**: Out-of-pocket cost paid to machine operator/computer designer ($₹$).
* **Stickering Customer Price**: Price charged to customer for stickering ($₹$).
* **Stickering Margin**: $\text{Stickering Price} - \text{Stickering Cost}$.
* **Total Margin Formula**:
  $$\text{Total Margin (₹)} = (\text{Stone Sale Price} - \text{Stone Purchase Price}) + (\text{Stickering Price} - \text{Stickering Cost})$$
  $$\text{Margin Percentage (\%)} = \left(\frac{\text{Total Margin}}{\text{Total Sale Price}}\right) \times 100$$

### 4.5 Visual Dashboard & Reporting
Designed specifically for high readability by the client and his parents:
* **High-Level KPI Cards**: Total Active Stock (Pieces), Total Inventory Value, Month-to-Date Revenue, Month-to-Date Margin (₹ and %).
* **Visual Status Distribution**:
  * **Radial / Doughnut Charts**: Showing percentage of active stock vs. sold stock.
  * **Fast-Moving vs. Slow-Moving Slabs**: Visual bar chart ranking top dimensions (e.g., $4 \times 2$ vs. $5 \times 3$).
* **Stale Stock Alert Panel**: List of stone batches approaching or exceeding 6–12 months with zero or slow movement.
* **Year-over-Year Seasonal Comparison**: Ability to compare specific festival periods (e.g., Pongal / Diwali temple donation seasons in January 2026 vs. January 2027) to forecast stock requirements.
* **Natural Language / AI Query Assistant**:
  * A conversational search box (powered by an LLM via OpenRouter/OpenAI API).
  * Example queries:
    * *"How many 4x2 Black Pearl slabs do we have left from August?"*
    * *"Who were our top 3 contractors last month?"*
    * *"What is our current stock of Doom stones?"*

### 4.6 Public Read-Only Catalog View
* A clean, mobile-optimized public URL (e.g., `app.granitebiz.com/stock-view` or shareable slug).
* **Displays only**:
  * Product Name & Quality (e.g., *Black Pearl - Mirror Polish*)
  * Slab Dimension ($L \times B$, Thickness)
  * Real-Time Units Available (e.g., *14 slabs in stock*)
  * High-level photos (optional)
* **Hidden from Public**:
  * Purchase prices, margins, supplier names, internal notes, batch purchase dates.
* Includes a "Call to Inquire / Reserve" WhatsApp/Phone action button.

---

## 5. Database Schema & Data Modeling

```
 ┌──────────────────────┐         ┌──────────────────────────────┐
 │      Suppliers       │         │          Customers           │
 ├──────────────────────┤         ├──────────────────────────────┤
 │ id (PK)              │         │ id (PK)                      │
 │ name                 │         │ name                         │
 │ phone, address       │         │ phone, type (regular/retail) │
 └──────────┬───────────┘         └──────────────┬───────────────┘
            │ 1                                  │ 1
            │                                    │
            │ N                                  │ N
 ┌──────────▼───────────┐         ┌──────────────▼───────────────┐
 │   PurchaseBatches    │ 1     N │          SalesOrders         │
 ├──────────────────────┼─────────┼──────────────────────────────┤
 │ id (PK)              │◄────────┤ id (PK)                      │
 │ product_name         │         │ batch_id (FK)                │
 │ variant_name         │         │ customer_id (FK)             │
 │ length, breadth, thk │         │ quantity_sold                │
 │ slot_category        │         │ stone_sale_price             │
 │ purchase_date        │         │ stickering_included (bool)   │
 │ initial_quantity     │         │ stickering_price             │
 │ current_quantity     │         │ stickering_cost              │
 │ purchase_price       │         │ total_margin, sale_date      │
 └──────────────────────┘         └──────────────────────────────┘
```

### Table: `products_master`
* `id` (UUID, PK)
* `name` (VARCHAR: e.g., "Black Pearl", "Jet Black", "Doom Stone")
* `category` (VARCHAR: "Granite", "Memorial", "Tiles", "Electrical/Piping")
* `default_thickness_mm` (INT: 12, 16, 20)
* `created_at` (TIMESTAMP)

### Table: `suppliers`
* `id` (UUID, PK)
* `name` (VARCHAR)
* `contact_number` (VARCHAR)
* `location` (TEXT)
* `created_at` (TIMESTAMP)

### Table: `purchase_batches` (Inward Stock Register)
* `id` (UUID, PK)
* `batch_code` (VARCHAR, UNIQUE: auto-generated identifier)
* `product_name` (VARCHAR)
* `variant_name` (VARCHAR: e.g., "Grade 1", "Jet Black Dark")
* `length_ft` (DECIMAL(5,2): e.g., 4.00, 4.25)
* `breadth_ft` (DECIMAL(5,2): e.g., 2.00, 3.00)
* `thickness_mm` (INT: 16)
* `slot_category` (VARCHAR: "4ft slot", "5ft slot", "Doom Stone")
* `supplier_id` (UUID, FK -> `suppliers.id`)
* `purchase_date` (DATE)
* `initial_units` (INT)
* `available_units` (INT: decremented upon sale)
* `unit_purchase_price` (DECIMAL(10,2))
* `is_stale` (BOOLEAN: computed or updated via cron if age > 180 days)
* `notes` (TEXT)
* `created_at` (TIMESTAMP)

### Table: `customers`
* `id` (UUID, PK)
* `name` (VARCHAR)
* `phone` (VARCHAR)
* `customer_type` (ENUM: 'REGULAR', 'CONTRACTOR', 'ENGINEER', 'RETAIL')
* `created_at` (TIMESTAMP)

### Table: `sales_records` (Outward Stock Register)
* `id` (UUID, PK)
* `sale_date` (DATE)
* `batch_id` (UUID, FK -> `purchase_batches.id`)
* `customer_id` (UUID, FK -> `customers.id`)
* `units_sold` (INT)
* `stone_sale_price_per_unit` (DECIMAL(10,2))
* `stone_purchase_price_per_unit` (DECIMAL(10,2): snapshot from batch)
* `has_stickering` (BOOLEAN: DEFAULT FALSE)
* `stickering_cost` (DECIMAL(10,2): DEFAULT 0.00)
* `stickering_price` (DECIMAL(10,2): DEFAULT 0.00)
* `misc_expense` (DECIMAL(10,2): DEFAULT 0.00)
* `total_revenue` (DECIMAL(10,2))
* `total_margin_amount` (DECIMAL(10,2))
* `margin_percentage` (DECIMAL(5,2))
* `payment_mode` (ENUM: 'CASH', 'UPI', 'BANK_TRANSFER')
* `created_at` (TIMESTAMP)

---

## 6. UI/UX Design Directives

Refer to the visual sketches and wireframes discussed during the session:

```
+-------------------------------------------------------------------------------+
|  YARD INVENTORY: 4FT SLOT (Physical Location A)                               |
+-------------------------------------------------------------------------------+
| Batch: BATCH-BP1-07SEP (Bought: Sept 7)  [OLD STOCK WARNING: 150 Days Active] |
| Dimensions: 4 x 2 ft  | Thickness: 16mm | Bought: 15 | Sold: 8 | Present: 7   |
| Action: [ Sell from this Batch ]                                              |
+ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
| [--- VIRTUAL YARD CLAMP / SEPARATOR ---]                                      |
+ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
| Batch: BATCH-BP1-10SEP (Bought: Sept 10) [NEW STOCK]                          |
| Dimensions: 4 x 2 ft  | Thickness: 16mm | Bought: 10 | Sold: 3 | Present: 7   |
| Action: [ Sell from this Batch ]                                              |
+-------------------------------------------------------------------------------+
```

1. **Dashboard Layout**:
   * Clean top navigation: `Overview / Dashboard`, `Inward Stock (+)`, `Sell Stone (-)`, `Yard Slots`, `Customers`, `Public View Link`.
2. **Sales Form Layout**:
   * Step 1: Pick Customer (auto-highlights customer tier).
   * Step 2: Search Product Name.
   * Step 3: View available physical batches ranked by purchase date (oldest first with visual warning badges).
   * Step 4: Enter quantity, pricing, and optional stickering details. Live margin updates in real-time.
3. **Typography & Readability**:
   * Bold, clear numbers.
   * Clear contrast for yard operations on mobile devices in bright sunlight.
   * Clear color codes:
     * **Green**: Fresh Stock / Healthy Margins (>25%).
     * **Yellow/Amber**: Stock aging between 3–6 months.
     * **Red**: Stale Stock (>6 months) / Low Margin (<10%).

---

## 7. Non-Functional & Technical Requirements

* **Architecture**: Responsive Single-Page Application (SPA) or Next.js/React full-stack application.
* **Backend & Database**: Node.js/Python FastAPI with PostgreSQL (hosted on AWS RDS or Supabase) for transactional integrity and ACID compliance.
* **Authentication**: JWT-based email/password authentication with session persistence (operators don't need to re-type passwords daily).
* **Hosting & Infrastructure**:
  * Cloud-hosted (AWS Asia-South/Mumbai or Hyderabad region for low latency).
  * Automated daily database backups with point-in-time recovery.
  * 99.9% uptime SLA to avoid operational downtime in the yard.
* **Offline/Mobile Capability**: PWA (Progressive Web App) capabilities or mobile-optimized responsive web view for on-the-go yard checks.

---

## 8. Phasing, Scope & Timeline

### Phase 1: MVP (Delivery Target: 2–3 Weeks)
* User Authentication & Profile management.
* Inward Stock Module (Product variant, dimensions, supplier, pricing, slot).
* Yard Slot Batch Register (strict FIFO batch isolation, "Virtual Clamp" divider, stale indicators).
* Outward Sales Module (batch selection, stone margin + stickering margin calculation).
* Simple Visual Analytics Dashboard (stock counts, revenue, margin %, top products).
* Public Read-Only Stock View URL.

### Phase 2: Enhancements (Target: Month 2)
* Natural Language / AI Assistant integration for quick yard queries via mobile.
* Advanced festival season / year-over-year predictive stock comparison.
* Multi-category expansion (Tiles, Sanitaryware, Electricals/Piping franchise lines).
* Direct customer inquiry / reservation workflow via WhatsApp Business API.

---

## 9. Commercials & Budget Summary (Agreed Context)
* **Estimated Budget Range**: ₹40,000 to ₹50,000 INR (as discussed during scope alignment).
* **Payment Terms**: Milestone-based (Design Prototype Approval $\rightarrow$ Core Feature MVP $\rightarrow$ Deployment & Final Handover).
