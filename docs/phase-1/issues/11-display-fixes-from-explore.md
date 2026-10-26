# 11: Display fixes from the explore run

**What to build:** Fix display bugs found by `e2e explore` (1 to 3 by Sonnet 5.5, 4 and 5 by Opus 5.5, 1, 4 and 5 again by Sonnet 5.5 with the business rules in its prompt; admin session) and confirmed in the code. Each fix starts with a test that reproduces it.

**Blocked by:** none

**Status:** todo

## 1. Negative rupees render as `₹-5,050`

`formatRupees` in `lib/format.ts` prefixes `₹` to the already formatted number, so a negative value becomes `₹-5,050`. Any negative Margin shows this way: the Sell Stone order summary, the dashboard and the customer page.

- Repro: `formatRupees(-5050)` returns `"₹-5,050"`; on Sell Stone, set a Sale Price below the Landed Cost and read Margin.
- Expected: `-₹5,050`, sign before the symbol. `formatRupeesCompact` has the same shape for the `L` and `Cr` branches.

## 2. Customer page shows Margin % unrounded

`app/(app)/customers/[id]/page.tsx` renders `s.margin_pct` raw (`36.88%`) while every other screen uses `formatPercent` (`36.9%`).

- Repro: sell 4 at ₹8,000 from a Batch with Landed Cost ₹5,050, open the customer page; the sale row shows `(36.88%)`, Sell Stone and the dashboard show `36.9%`.
- Expected: the same one-decimal value everywhere, through `formatPercent`.

## 3. Empty Slot says "Nothing matches these filters." with no filters set

In `app/(app)/yard/yard-view.tsx` the empty state checks `all.length` (every Batch in the yard), not the open Slot. When the yard has Batches but the open Slot has none, it shows "Nothing matches these filters." even with every filter on All. Yard Slots opens on the 4 ft Slot by default, so a yard with stock only in other Slots lands on this message.

- Repro: with stock only in Custom, open Yard Slots with no query string.
- Expected: a neutral empty-Slot message when no filter is active; the filter message only when a filter or search is active.

## 4. Form errors stay on screen after the value is fixed

Found by the Opus 5.5 run. Inward Stock, Sell Stone and the Edit sale dialog each keep one `error` string and clear it only at the start of the next submit (`inward-form.tsx:119`, `sell-form.tsx:95`, `customers/[id]/sale-actions.tsx:133`). Fixing the field leaves the old refusal visible, and a second bad value can show the first value's message.

- Repro: on Sell Stone enter Quantity Sold 11, tap Record Sale, then change it to 3; "Only 10 available in batch ..." stays.
- Expected: the refusal clears when any field it names changes.

## 5. Refusals do not name the field by its label

`lib/schemas/batch.ts:38` and both SQL refusals use "Initial units must be greater than zero"; the label in `inward-form.tsx:294` is "Unit Quantity". Changing the SQL text needs a migration and the seam tests that assert it (see `docs/knowledge/readable-refusals.md`).

The shared `money` schema (`lib/schemas/common.ts:6`) refuses any negative amount with a bare "Cannot be negative", so a negative Stone Sale Price on Sell Stone does not say which field is wrong.

- Expected: each refusal names the field by its label.

## Done when

- [ ] Vitest unit test for `formatRupees` and `formatRupeesCompact` with negative values
- [ ] Customer sale row uses `formatPercent`
- [ ] Yard empty state distinguishes an empty Slot from filtered-out rows
- [ ] Inward, Sell and Edit sale clear a refusal when a field changes
- [ ] Zero-quantity refusal names "Unit Quantity", in the schema and SQL, with seam tests updated
- [ ] Negative-money refusals name their field
- [ ] Playwright: an unfiltered empty Slot shows the empty-Slot message, and the customer page shows the rounded Margin %

## Not bugs, left for a product call

- "Sale recorded" toast shows quantity and Batch, not total or Margin.
- Record Sale stays enabled at quantity 0; the server refuses it with a readable message.
- Yard Batch card shows no Landed Cost.
- Inward shows one refusal at a time, not every invalid field at once, and Save Batch is enabled once product, supplier and size are set, before Variant and Unit Quantity are valid (`inward-form.tsx:375`).
- No sale or invoice number is shown after Record Sale.
- Inward Recent batches "Landed cost" column is per piece but not labelled so (Haiku misread it as the batch total).
