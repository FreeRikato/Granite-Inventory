# 01 — Sign in and app shell

**What to build:** A Team Member opens the app, taps "Continue with Google", and lands on an Overview page inside the finished shell: sidebar on desktop, bottom tab bar with a More sheet on mobile, design tokens from the Pencil file applied. A Google account that is not a Team Member signs in successfully but sees an "access is limited to approved team members" state and no data. This ticket also stands up the local Supabase project, the migration workflow, the seeded first Admin and settings row, and the Vitest seam harness that every later ticket uses.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] Follow `docs/local-dev.md`: local Supabase already scaffolded with Google enabled; add `.env.local`, migrations, `seed.sql`; TypeScript types generated from the database
- [x] `team_members` table (email, role as text with check) with RLS; seeded Admin is aravinthanrc@gmail.com (swap for the client before handover)
- [x] `settings` single row seeded with default ageing thresholds, catalog off and empty WhatsApp number
- [x] Google is the only sign-in provider; session persists across browser restarts
- [x] Sidebar (Overview, Inward Stock, Sell Stone, Yard Slots, Customers, Public View Link, profile block with Settings) and mobile tab bar (Overview, Inward, Sell, Yard, More) with empty pages
- [x] Global CSS variables carry the Pencil tokens: Geist, JetBrains Mono, primary orange, light and dark palettes, radii
- [x] Vitest seam harness signs in as Admin, Yard Operator, non-member and anon against local Supabase
- [x] Seam test: non-member and anon read nothing from `team_members` and `settings`; Admin reads both
- [x] Playwright harness signs in programmatically with an email test user (see local-dev.md), never through the Google consent screen
