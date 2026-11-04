---
code:
  - supabase/migrations/20261106100000_daily_summary.sql
  - lib/daily-sales.ts
  - lib/bill-context.ts
  - lib/format.ts
  - lib/nav.ts
  - lib/query/reads.ts
  - lib/query/writes.ts
  - lib/chat/answer.ts
  - lib/chat/system-prompt.ts
  - components/skeletons/daily-sales-skeleton.tsx
  - app/(app)/sales/page.tsx
  - app/(app)/sales/sales-view.tsx
  - app/(app)/sales/day-picker.tsx
  - app/(app)/sales/later-payments.tsx
  - app/(app)/customers/[id]/page.tsx
  - app/(app)/customers/[id]/sales-rows.tsx
  - tests/seam/daily-sales.test.ts
  - tests/tooling/daily-sales.test.ts
  - tests/tooling/invalidates-after.test.ts
  - tests/e2e/daily-sales.spec.ts
  - tests/e2e/route-cls.spec.ts
---

# Daily Sales

One day's Sales and money on one screen ([Daily Sales, Added to credit](../../CONTEXT.md)). The rules are in [phase1_decisions](../phase1_decisions.md) under Selling; this note explains how the code keeps them.

## The same day never shows two totals

Every figure reads the date the rest of the app reads: a Sale by its Sale date, money by `received_on` in `v_payments`. That is why a backdated Bill lands on its own day and not the day it was typed, and why `daily_summary` is not filtered on `created_at`. The seam test compares it with `received_by_period` for the same day, so Overview and this screen cannot drift ([[credit]], [[dashboard]]).

Added to credit reads `bill_payments` and not `v_bill_balances`, because the balance falls as later payments arrive and this figure must stay as it stood at the sale. It therefore reconciles the day: Billed minus Added to credit is what was paid at the sale, and adding the Later payments list gives Money received.

## Which day is today

The page uses `istToday` from `lib/format.ts`, not `todayIso`, which follows the device's zone. A phone set to another zone would otherwise open on the wrong business day and could step past the day the database accepts ([[ist-calendar]]). The chat uses the same function.

## Reading the day

The page is a static shell like Credit, so the day comes from `useSearchParams` in the view, under the page's `Suspense`. `dailySalesQuery` is one query per day holding raw rows only: the query cache is persisted, and a `Map` would not survive it, so `billContext` turns the rows into the shapes `SalesTable` needs after they are read. `billContext` is the same assembly the Customer page uses, so a Bill's later payment total, which the delete confirm names, cannot differ between the two ([[browser-reads]]).

Moving to a day not yet cached keeps the previous day on screen, dimmed and `inert`. Without `inert` an Admin could press Delete on a row of the day they just left while the new one loads.

Bill rows and receipts for the table are read by the Bill's Sale date; the Later payments list is read by `paid_on`. They are different sets: on today's page, a receipt on a Bill from last week is only in the list. On last week's page, that same receipt is only in the Bill's row, as part of its history.

## The date field

The field keeps its own draft text, because a date input reports a value on every segment typed. Typing `2026` passes through `0002` and `0020`; those are below the 2000 floor, so they do not navigate, and the draft stops React resetting the field mid-word. Typing uses `router.replace` so a typed date is one history entry, and the arrows use `router.push` so back returns to the day before. Blur puts back the day on screen if what was typed was never valid.

## Corrections

The Admin actions are the Customer page's, through the shared `SalesTable`, whose `lead` swaps the Date column for a linked Customer. The edit lists come from the cached Yard batches and customers queries, read only for an Admin. `correct-sale` still asks for a server refresh for the Customer page; here it only re-renders a shell with no data. Every write that changes a Sale, a receipt, a Bill's due badge, or a name on a row lists `daily-sales` ([[corrections]]).

Related: [[sales-and-stock-lines]], [[bill-payments]], [[testing]].
