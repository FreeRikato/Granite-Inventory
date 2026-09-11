# Tech Stack

Decided on 11 Sep 2026 after reviewing the Pencil designs (Auth, Operator Desktop, Operator Mobile, Public Catalog) against `meeting_1.md`.

## What the designs demand

| Design signal | Where | Implication |
|---|---|---|
| Components are the Pencil shadcn library (`Button/Default`, `Data Table`, `Dialog`, `Combobox`, `Tabs`, `Sidebar Item`) | `00 · Components` | shadcn/ui maps 1:1, no custom design system |
| Fonts: Geist (UI) + JetBrains Mono (numbers), primary `#FF8400`, Light/Dark themes | variables | `next/font` + CSS vars in Tailwind v4 |
| "Continue with Google", "Only these Google accounts can sign in", roles `ADMIN` / `YARD OPERATOR` | Auth, Settings | Google OAuth + allowlist table + roles |
| `⌘K` "Search or jump to..." on every desktop screen | all desktop | shadcn `Command` |
| Donut + horizontal bar charts | Dashboard | Recharts via shadcn `chart` |
| Public catalog with no auth, hides price/supplier/date, WhatsApp "Call to Inquire" | `04` | a DB view exposed to anon, server-rendered |
| Mobile tab bar with "More" overflow, bright-sunlight contrast | `03` | responsive web, no separate mobile app |
| Batches never merge, FIFO oldest-first, stale threshold configurable (90/180/365 days) | Inward, Sell, Yard, Settings | inventory logic lives in Postgres, not React |

## Architecture

```
 Browser (desktop + mobile PWA)
 ┌──────────────────────────────────────────────┐
 │ Next.js 16 App Router · React 19 · TS        │
 │ Tailwind v4 · shadcn/ui · Recharts           │
 │ react-hook-form + zod (forms)                │
 └───────────────┬──────────────────────────────┘
                 │ @supabase/ssr (server components + server actions)
 ┌───────────────▼──────────────────────────────┐
 │ Supabase (ap-south-1 Mumbai)                 │
 │  Auth ── Google OAuth, allowlist via RLS     │
 │  Postgres ── tables + RLS + SQL functions    │
 │    record_sale()  atomic decrement + margin  │
 │    v_yard_batches  age, stale flag computed  │
 │    v_public_catalog  only name/size/count    │
 │  Storage ── product photos (Phase 2)         │
 └──────────────────────────────────────────────┘
 Hosting: Vercel (app) · Supabase CLI migrations · supabase gen types
```

## Layer by layer

1. **Next.js 16 + TypeScript** (already scaffolded in `granite-inventory-app`). Server components render the dashboard and public catalog with no client fetching. Server actions handle the three write forms (inward, sell, customer). No separate API server.

2. **shadcn/ui + Tailwind v4**. The Pencil components are shadcn, so `npx shadcn add sidebar command combobox dialog tabs badge chart data-table` gives the full design vocabulary. Theme tokens from the Pencil file go into `globals.css` as CSS vars.

3. **Supabase Auth, Google provider only**. Allowlist is a `team_members(email, role)` table. An RLS policy of the form `auth.jwt()->>'email' in (select email from team_members)` on every table means an unlisted Google account signs in successfully but sees nothing. Role checks (`ADMIN` sees prices and margins, `YARD_OPERATOR` does not) are additional RLS predicates.

4. **Postgres owns the business rules.** The FIFO/no-merge rule and margin math must never be wrong, so:
   - `record_sale(batch_id, qty, ...)` is a `plpgsql` function: locks the batch row, checks `available_units >= qty`, decrements, snapshots purchase price, computes stone margin and stickering margin. One transaction, no race between two operators.
   - `v_yard_batches` view computes `age_days` and `stale` against the threshold stored in a `settings` table. No cron, no `is_stale` column to drift.
   - `v_public_catalog` view aggregates available units per product/variant/size and exposes nothing else. `select` is granted to `anon` on the view only.

5. **Schema and types**: Supabase CLI SQL migrations plus `supabase gen types typescript`. No ORM (Drizzle/Prisma skipped): six tables, and the logic lives in SQL anyway.

6. **Charts**: Recharts through shadcn's `chart` wrapper. Only a donut and a horizontal bar chart are needed.

7. **Forms**: `react-hook-form` + `zod`. The same zod schema is reused in the server action so validation is typed end to end.

8. **PWA**: `manifest.json` + icons so operators can pin the app to the home screen. No service worker or offline mode in Phase 1.

9. **Hosting**: Vercel free tier for the app, Supabase in Mumbai for the database. Supabase provides daily backups; point-in-time recovery is a Pro add-on if the client wants it.

10. **Tests**: Vitest against `record_sale` and the stale/FIFO views using a local `supabase start` Postgres. Playwright for the three core flows (inward, sell, public catalog). Testing the SQL functions directly is where the value is.

## Open decisions before schema work

1. Should `YARD_OPERATOR` see purchase prices at all? The Settings screen implies no, but the Sell screen shows "Stone Purchase Price (auto)" to everyone.
2. Is the stale threshold global or per slot category? Settings shows one global picker; keeping it global is the default.
